// ============================================================
// 导入层 · 流水线
//   文件 → 格式识别 → 对应解析器 → 中间格式(IMD) → 报告
//
// 铁律（对应 GPT 方案里的「三件事」）：
//   1. 永不静默丢内容：认不出格式 / 解析失败 / 不支持的格式，
//      一律降级成「原文保留」的 IMD，并在报告里写明原因。
//   2. 原始资料单独保管（见 vault.js），IMD 只是「转换结果」。
//   3. 格式识别失败不是错误，是「未结构化」，要让人看得见。
// ============================================================

var ImportPipeline = {
  // input: { name, bytes?, text?, size?, from? }
  // opts:  { vault?: bool, importId?: string, maxBytes?: number }
  // 返回 { entry, imd }
  ingest: function (input, opts) {
    opts = opts || {};
    var name = (input && input.name) ? String(input.name) : '(未命名)';
    var bytes = null;
    var decodeWarn = [];
    var decodeInfo = { encoding: null };

    // ---- 取字节 ----
    try {
      if (input.bytes) bytes = ImportDecode.toBytes(input.bytes);
      else if (typeof input.text === 'string') bytes = ImportDecode.toUTF8(input.text);
    } catch (e) {
      decodeWarn.push('读取文件内容失败：' + e.message);
    }

    var ext = ImportFormats.extOf(name);
    var sniffText = null;
    var textual = false;
    if (bytes && bytes.length) {
      // 先用文本方式嗅一眼（只在没有魔数命中时用得上）
      try {
        var t = ImportDecode.text(bytes);
        sniffText = t.text;
        decodeInfo.encoding = t.encoding;
        textual = looksTextual(t.text);
        for (var w = 0; w < (t.warnings || []).length; w++) decodeWarn.push(t.warnings[w]);
      } catch (e2) { /* 二进制文件解不出文本是正常的，不报警 */ }
    } else if (typeof input.text === 'string') {
      sniffText = input.text;
      decodeInfo.encoding = 'unicode-string';
      textual = true;
    }

    // ---- 格式识别 ----
    var det = ImportFormats.detect({ name: name, bytes: bytes, text: textual ? sniffText : null });
    var format = det.format;

    // P20 修：ImportMiddle.create() 收的是平铺字段（见 middle.js:39-48 的 opts.name/ext/
    //   formatId/parser/bytes/encoding）。旧写法把整块包成 source 嵌套对象，create() 收不到
    //   ⇒ imd.source 恒为 name='' / bytes=0 / formatId='unknown' / encoding=null，
    //     导入卡带的描述只剩「由「导入文游资料」生成」，来源文件名与体积整条丢失。
    //   sha256 / retained 原本就是 create() 的默认值，且下面 :73 / :80 / :72 会各自补上。
    var imd = ImportMiddle.create({
      importId: opts.importId || null,
      name: name,
      ext: ext,
      formatId: format ? format.id : null,
      parser: format ? format.parser : null,
      bytes: bytes ? bytes.length : 0,
      encoding: decodeInfo.encoding
    });
    imd.source.from = input.from || null;

    // ---- 原文保留（无论识别成功与否都先留）----
    if (opts.vault && bytes && bytes.length) {
      try {
        var v = ImportVault.saveOriginal(imd.importId, name, bytes, { formatId: format ? format.id : null, size: bytes.length });
        imd.source.retained = !!v.ok;
        imd.source.sha256 = v.sha256 || null;
        imd.source.vaultPath = v.path || null;
        if (!v.ok && v.reason) imd.warnings.push('原文件未留存：' + v.reason);
      } catch (e4) {
        imd.warnings.push('原文件未留存：' + e4.message);
      }
    } else if (bytes && bytes.length) {
      try { imd.source.sha256 = ImportDecode.sha256Hex(bytes); } catch (e5) {}
    }

    var parseError = null;

    // ---- 分流 ----
    if (!format || !det.matched) {
      // 认不出格式：不丢，按纯文本兜底
      imd.warnings.push('无法识别文件格式' + (ext ? ('（扩展名 .' + ext + ' 不在已登记的格式里）') : '（没有扩展名）')
        + '，已按纯文本完整保留原文，未做结构化提取');
      imd.stats.unhandled.push({ kind: 'unknown-format', count: 1, note: '未识别格式，原文保留', unit: '项' });
      safeTextFallback(imd, textual ? sniffText : null, bytes);
      imd.meta.formatConfidence = 'unknown';
    } else if (!det.supported || !format.parser) {
      // 已知但本轮不做
      imd.warnings.push('「' + format.label + '」本轮还不支持结构化解析（优先级 ' + format.priority + '），'
        + '已完整保留原文' + (format.pitfalls ? ('。注意：' + format.pitfalls) : ''));
      imd.stats.unhandled.push({ kind: 'unsupported-format', count: 1, note: format.label + ' 本轮不支持结构化解析，原文保留', unit: '项' });
      safeTextFallback(imd, textual ? sniffText : null, bytes);
      imd.meta.formatConfidence = 'unsupported';
    } else {
      var fn = ImportPipeline._parserFor(format.parser);
      if (!fn) {
        imd.warnings.push('「' + format.label + '」的解析器（' + format.parser + '）没有加载，已按纯文本保留原文');
        imd.stats.unhandled.push({ kind: 'parser-missing', count: 1, note: '解析器未加载：' + format.parser, unit: '项' });
        safeTextFallback(imd, textual ? sniffText : null, bytes);
      } else {
        try {
          fn(imd, { name: name, ext: ext, text: sniffText || '', bytes: bytes });
          imd.meta.formatConfidence = det.byMagic ? 'magic' : (det.byExt ? 'ext' : 'sniff');
        } catch (e6) {
          parseError = e6;
          imd.warnings.push('解析「' + format.label + '」时出错（' + e6.message + '），已退回「原文完整保留」，内容没有丢');
          imd.stats.unhandled.push({ kind: 'parse-error', count: 1, note: '解析异常：' + e6.message, unit: '项' });
          if (!imd.blocks.length) safeTextFallback(imd, sniffText, bytes);
        }
      }
    }

    // ---- 收尾 ----
    ImportMiddle.finalize(imd);
    if (sniffText && !imd.raw.text) imd.raw.text = sniffText;

    var entry = ImportReport.addFile(ImportReport.create(), {
      name: name,
      bytes: bytes ? bytes.length : (sniffText ? sniffText.length : 0),
      formatId: format ? format.id : null,
      formatLabel: format ? format.label : '未知格式',
      priority: format ? format.priority : null,
      ok: !parseError && !!det.matched && !!det.supported,
      skipped: false,
      extracted: summarizeExtracted(imd),
      unhandled: imd.stats.unhandled.slice(),
      warnings: imd.warnings.slice(),
      error: parseError ? parseError.message : null,
      importId: imd.importId,
      imdSummary: ImportMiddle.summarize(imd),
      sha256: imd.source.sha256,
      retained: imd.source.retained
    });
    entry.encoding = decodeInfo.encoding;
    entry.detectReason = det.reason;
    for (var dw = 0; dw < decodeWarn.length; dw++) ImportReport.addWarning(entry, decodeWarn[dw]);

    return { entry: entry, imd: imd };
  },

  // 多文件：逐个来，一个失败不影响别人
  ingestMany: function (list, opts) {
    opts = opts || {};
    var report = ImportReport.create();
    var imds = [];
    for (var i = 0; i < (list || []).length; i++) {
      var r;
      try {
        r = ImportPipeline.ingest(list[i], opts);
      } catch (e) {
        r = {
          entry: ImportReport.addFile(ImportReport.create(), {
            name: (list[i] && list[i].name) || '(未命名)', bytes: 0, ok: false,
            error: e.message, warnings: ['这个文件整体处理失败了，其他文件不受影响']
          }),
          imd: null
        };
      }
      ImportReport.addFile(report, r.entry);
      if (r.imd) imds.push(r.imd);
    }
    return { report: report, imds: imds };
  },

  _parsers: {},
  init: function () { return initImportPipeline(); },
  registerParser: function (name, fn) { ImportPipeline._parsers[name] = fn; },
  _parserFor: function (name) {
    if (ImportPipeline._parsers[name]) return ImportPipeline._parsers[name];
    if (typeof ImportParseTextlike !== 'undefined' && ImportParseTextlike[name]) return ImportParseTextlike[name];
    if (typeof ImportParseArchive !== 'undefined' && ImportParseArchive[name]) return ImportParseArchive[name];
    if (name === 'pdf' && typeof ImportParsePdf !== 'undefined') return ImportParsePdf.parsePdf;
    return null;
  }
};

// 判断解出来的文本是不是「真的像文本」。
// 二进制文件强行按 latin1 解也能得到一串字符，那种不能拿去当正文——否则等于把垃圾当资料。
function looksTextual(str) {
  if (typeof str !== 'string' || !str.length) return false;
  var bad = 0;
  var n = Math.min(str.length, 4096);
  for (var i = 0; i < n; i++) {
    var c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 0xFFFD || c === 0x7F) bad++;
  }
  return (bad / n) < 0.02;
}

// 认不出 / 不支持 / 解析崩了时的兜底：原文分段进 IMD，绝不返回空
function safeTextFallback(imd, text, bytes) {
  var t = text;
  if (!t && bytes && bytes.length) {
    try {
      var decoded = ImportDecode.text(bytes);
      // 二进制文件强行按 latin1 解也会得到一串字符，那种不能当正文——否则等于把垃圾当资料
      if (looksTextual(decoded.text)) t = decoded.text;
    } catch (e) { t = null; }
  }
  if (!t) {
    imd.blocks.push(ImportMiddle.raw('', '（这个文件是二进制格式，本轮不支持解析，内容无法以文本形式展示；原文件已在导入区留存，可下载核对）'));
    return;
  }
  var lines = String(t).split(/\r?\n/);
  var buf = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      if (buf.length) { imd.blocks.push(ImportMiddle.paragraph(buf.join('\n'))); buf = []; }
    } else buf.push(lines[i]);
    if (buf.length >= 60) { imd.blocks.push(ImportMiddle.paragraph(buf.join('\n'))); buf = []; }
  }
  if (buf.length) imd.blocks.push(ImportMiddle.paragraph(buf.join('\n')));
}

function summarizeExtracted(imd) {
  var c = { heading: 0, paragraph: 0, list: 0, table: 0, code: 0, kv: 0, raw: 0, asset: 0, pagebreak: 0 };
  for (var i = 0; i < imd.blocks.length; i++) {
    var t = imd.blocks[i].type;
    if (c[t] === undefined) c[t] = 0;
    c[t]++;
  }
  return c;
}

function initImportPipeline() {
  if (typeof ImportParseTextlike !== 'undefined') {
    for (var k in ImportParseTextlike) if (ImportParseTextlike.hasOwnProperty(k)) ImportPipeline.registerParser(k, ImportParseTextlike[k]);
  }
  if (typeof ImportParseArchive !== 'undefined') {
    ImportPipeline.registerParser('docx', ImportParseArchive.docx);
    ImportPipeline.registerParser('odt', ImportParseArchive.odt);
    ImportPipeline.registerParser('epub', ImportParseArchive.epub);
    ImportPipeline.registerParser('zip', ImportParseArchive.zip);
  }
  if (typeof ImportParsePdf !== 'undefined') ImportPipeline.registerParser('pdf', ImportParsePdf.parsePdf);
  return ImportPipeline;
}

if (typeof window !== 'undefined') window.ImportPipeline = ImportPipeline;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportPipeline;

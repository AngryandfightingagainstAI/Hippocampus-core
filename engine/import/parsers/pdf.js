// ============================================================
// 导入层 · PDF 文本层提取（纯 JS）
// 覆盖：对象表解析 → 内容流解压（Flate/ASCIIHex/ASCII85）→ 文本算子
//       → 按页取字体 → ToUnicode CMap → 解码成 Unicode。
//
// 明确不做（并会如实上报）：
//   · 扫描件 OCR（没有文本层的 PDF 只会得到「疑似扫描件」的结论，不会给空字符串糊弄）
//   · 加密 PDF（直接报「已加密」）
//   · LZW 压缩流（报「不支持的压缩方式」，不静默丢页）
// ============================================================

var ImportPdf = {
  // 返回 { pages: [ {no, text} ], warnings: [], unhandled: [], title, encrypted, hasTextLayer }
  extract: function (bytes) {
    var out = { pages: [], warnings: [], unhandled: [], title: null, encrypted: false, hasTextLayer: false };
    if (!bytes || !bytes.length) { out.warnings.push('没有拿到 PDF 的字节内容'); return out; }

    var latin = latin1(bytes);
    if (latin.slice(0, 1024).indexOf('%PDF-') < 0) {
      out.warnings.push('这不是 PDF（文件头没有 %PDF-）');
      return out;
    }
    if (/\/Encrypt\b/.test(latin)) {
      out.encrypted = true;
      out.warnings.push('这份 PDF 已加密（/Encrypt），无法提取文本。请先用阅读器「另存为」一份未加密的副本');
      return out;
    }

    // ---- 1) 建立对象表 ----
    var objs = {};
    var objRe = /(\d+)\s+(\d+)\s+obj\b/g, m;
    var locations = [];
    while ((m = objRe.exec(latin)) !== null) locations.push({ num: parseInt(m[1], 10), at: m.index, bodyStart: objRe.lastIndex });
    for (var i = 0; i < locations.length; i++) {
      var end = latin.indexOf('endobj', locations[i].bodyStart);
      var body = latin.slice(locations[i].bodyStart, end < 0 ? latin.length : end);
      var sm = /\bstream\r?\n/.exec(body);
      var rec = { num: locations[i].num, dict: body, streamBytes: null };
      if (sm) {
        rec.dict = body.slice(0, sm.index);
        var sStart = locations[i].bodyStart + sm.index + sm[0].length;
        var lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(rec.dict);
        var sEnd;
        if (lenM) {
          sEnd = sStart + parseInt(lenM[1], 10);
          if (sEnd > bytes.length) sEnd = -1;
        } else sEnd = -1;
        if (sEnd < 0) {
          var es = latin.indexOf('endstream', sStart);
          sEnd = es < 0 ? bytes.length : es;
          // 去掉 stream 与 endstream 之间的收尾换行
          while (sEnd > sStart && (bytes[sEnd - 1] === 0x0A || bytes[sEnd - 1] === 0x0D)) sEnd--;
        }
        rec.streamBytes = bytes.subarray(sStart, Math.min(sEnd, bytes.length));
      }
      objs[rec.num] = rec;
    }
    if (!locations.length) { out.warnings.push('PDF 里没找到任何对象（文件可能已损坏或被截断）'); return out; }

    // 标题
    var tm = /\/Title\s*\(((?:\\.|[^\\()])*)\)/.exec(latin) || /\/Title\s*<([0-9A-Fa-f\s]+)>/.exec(latin);
    if (tm) out.title = tm[1].indexOf('<') === 0 ? null : pdfUnescape(tm[1]);

    // ---- 2) 页对象 ----
    var pageNums = [];
    for (var k in objs) {
      if (!objs.hasOwnProperty(k)) continue;
      var d = objs[k].dict;
      if (/\/Type\s*\/Page\b/.test(d) && !/\/Type\s*\/Pages\b/.test(d)) pageNums.push(parseInt(k, 10));
    }
    pageNums.sort(function (a, b) { return a - b; });
    if (!pageNums.length) {
      // 有些 PDF 的页对象没有 /Type /Page（少见），退化为「按内容流数量」
      out.warnings.push('没有找到 /Type /Page 对象，已退化为按内容流顺序提取');
    }

    var unsupportedFilter = 0, decodeFail = 0;

    function decodeStream(rec) {
      if (!rec || !rec.streamBytes) return null;
      var filters = [];
      var fm = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(rec.dict);
      if (fm) {
        var fv = fm[1];
        var names = fv.match(/\/\w+/g) || [];
        for (var n = 0; n < names.length; n++) filters.push(names[n].slice(1));
      }
      var data = rec.streamBytes;
      for (var f = 0; f < filters.length; f++) {
        var name = filters[f];
        try {
          if (name === 'FlateDecode' || name === 'Fl') data = ImportUnzip.inflateMaybe ? ImportUnzip.inflateMaybe(data, data.length * 4) : ImportUnzip.inflateRaw(data, data.length * 4);
          else if (name === 'ASCIIHexDecode' || name === 'AHx') data = asciiHexDecode(data);
          else if (name === 'ASCII85Decode' || name === 'A85') data = ascii85Decode(data);
          else if (name === 'Crypt') { /* Identity，忽略 */ }
          else { unsupportedFilter++; return null; }
        } catch (e) { decodeFail++; return null; }
      }
      return data;
    }

    // ---- 3) 逐页提取 ----
    var globalFontMap = {};
    for (var p = 0; p < pageNums.length; p++) {
      var page = objs[pageNums[p]];
      if (!page) continue;
      var fontMap = buildFontMap(page.dict, objs);
      for (var g in fontMap) if (fontMap.hasOwnProperty(g)) globalFontMap[g] = fontMap[g];

      var contentRefs = [];
      var cm = /\/Contents\s*(\[\s*([^\]]*)\]|(\d+)\s+\d+\s+R)/.exec(page.dict);
      if (cm) {
        if (cm[3]) contentRefs.push(parseInt(cm[3], 10));
        else {
          var refs = (cm[2].match(/(\d+)\s+\d+\s+R/g) || []);
          for (var r = 0; r < refs.length; r++) contentRefs.push(parseInt(/(\d+)/.exec(refs[r])[1], 10));
        }
      }
      var chunks = [];
      for (var c = 0; c < contentRefs.length; c++) {
        var dec = decodeStream(objs[contentRefs[c]]);
        if (dec) chunks.push(dec);
      }
      var text = '';
      if (chunks.length) {
        var merged = concatBytes(chunks);
        text = extractTextFromContent(merged, fontMap);
      }
      out.pages.push({ no: p + 1, text: text });
      if (text.replace(/\s/g, '').length) out.hasTextLayer = true;
    }

    // 没有任何页对象时：把所有内容流拼起来提取一次
    if (!pageNums.length) {
      var allChunks = [];
      for (var key in objs) {
        if (!objs.hasOwnProperty(key)) continue;
        var d2 = objs[key].dict;
        if (/\/Type\s*\/(XObject|ObjStm|Metadata|XRef)\b/.test(d2)) continue;
        var dec2 = decodeStream(objs[key]);
        if (dec2 && /BT[\s\S]{0,20}(Tj|TJ)/.test(latin1(dec2))) allChunks.push(dec2);
      }
      if (allChunks.length) {
        var mergedAll = concatBytes(allChunks);
        var t2 = extractTextFromContent(mergedAll, buildGlobalFontMap(objs));
        out.pages.push({ no: 1, text: t2 });
        if (t2.replace(/\s/g, '').length) out.hasTextLayer = true;
      }
    }

    if (unsupportedFilter) {
      out.unhandled.push({ kind: 'pdf-filter', count: unsupportedFilter, note: '不支持的流压缩方式（如 LZW），这些内容未提取', unit: '个流' });
      out.warnings.push('有 ' + unsupportedFilter + ' 个流用了不支持的压缩方式，已跳过（原文保留）');
    }
    if (decodeFail) out.unhandled.push({ kind: 'pdf-decode', count: decodeFail, note: '解压失败的流', unit: '个流' });

    var pagesWithText = out.pages.filter(function (x) { return x.text.replace(/\s/g, '').length > 0; }).length;
    if (out.pages.length && !out.hasTextLayer) {
      out.warnings.push('这份 PDF 有 ' + out.pages.length + ' 页，但一页文本都没提取到——**极可能是扫描件（图片版）**，需要 OCR；本轮不处理图片，原文件已保留');
      out.unhandled.push({ kind: 'pdf-ocr', count: out.pages.length, note: '疑似扫描页，需 OCR', unit: '页' });
    } else if (out.pages.length && pagesWithText < out.pages.length) {
      out.warnings.push('PDF 共 ' + out.pages.length + ' 页，其中 ' + (out.pages.length - pagesWithText) + ' 页没有文本层（可能是插图页或扫描页）');
      out.unhandled.push({ kind: 'pdf-notext', count: out.pages.length - pagesWithText, note: '无文本层的页（可能是插图/扫描页）', unit: '页' });
    }
    return out;
  }
};

function concatBytes(list) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].length;
  var out = new Uint8Array(total), off = 0;
  for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
  return out;
}

function latin1(bytes) {
  var CH = 8192, parts = [];
  for (var i = 0; i < bytes.length; i += CH) {
    var sub = Array.prototype.slice.call(bytes.subarray(i, i + CH));
    parts.push(String.fromCharCode.apply(null, sub));
  }
  return parts.join('');
}

function pdfUnescape(s) {
  return String(s).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, function (all, e) {
    switch (e) {
      case 'n': return '\n'; case 'r': return '\r'; case 't': return '\t';
      case 'b': return '\b'; case 'f': return '\f';
      case '(': return '('; case ')': return ')'; case '\\': return '\\';
      default: return String.fromCharCode(parseInt(e, 8));
    }
  });
}

function asciiHexDecode(bytes) {
  var s = latin1(bytes), out = [], hi = -1;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === '>') break;
    var v = parseInt(c, 16);
    if (!isFinite(v)) continue;
    if (hi < 0) hi = v; else { out.push((hi << 4) | v); hi = -1; }
  }
  if (hi >= 0) out.push(hi << 4);
  return new Uint8Array(out);
}

function ascii85Decode(bytes) {
  var s = latin1(bytes).replace(/\s/g, '');
  if (s.indexOf('<~') === 0) s = s.slice(2);
  var out = [], tuple = [], i;
  for (i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === '~') break;
    if (c === 'z' && !tuple.length) { out.push(0, 0, 0, 0); continue; }
    var v = s.charCodeAt(i) - 33;
    if (v < 0 || v > 84) continue;
    tuple.push(v);
    if (tuple.length === 5) {
      var n = 0;
      for (var k = 0; k < 5; k++) n = n * 85 + tuple[k];
      out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      tuple = [];
    }
  }
  if (tuple.length > 1) {
    var n2 = 0, cnt = tuple.length;
    for (var j = 0; j < 5; j++) n2 = n2 * 85 + (j < cnt ? tuple[j] : 84);
    var bytes4 = [(n2 >>> 24) & 255, (n2 >>> 16) & 255, (n2 >>> 8) & 255, n2 & 255];
    for (var q = 0; q < cnt - 1; q++) out.push(bytes4[q]);
  }
  return new Uint8Array(out);
}

// ---- 字体 / ToUnicode ----
function buildFontMap(pageDict, objs) {
  var map = {};
  var fontDict = null;
  var inline = /\/Font\s*<<([\s\S]*?)>>/.exec(pageDict);
  if (inline) fontDict = inline[1];
  else {
    var ref = /\/Font\s+(\d+)\s+\d+\s+R/.exec(pageDict);
    if (ref && objs[parseInt(ref[1], 10)]) {
      var fd = objs[parseInt(ref[1], 10)].dict;
      var dd = /<<([\s\S]*)>>/.exec(fd);
      fontDict = dd ? dd[1] : fd;
    }
    // 页对象没有 /Resources 时，从 /Pages 里找（继承）
  }
  if (!fontDict) fontDict = '';
  var re = /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g, m;
  while ((m = re.exec(fontDict)) !== null) {
    var fontObj = objs[parseInt(m[2], 10)];
    if (!fontObj) continue;
    map[m[1]] = buildOneFont(fontObj, objs);
  }
  return map;
}

function buildGlobalFontMap(objs) {
  var map = {};
  for (var k in objs) {
    if (!objs.hasOwnProperty(k)) continue;
    var d = objs[k].dict;
    if (!/\/Type\s*\/Font\b/.test(d)) continue;
    var nm = /\/BaseFont\s*\/([A-Za-z0-9+.,_-]+)/.exec(d);
    map['*' + k] = buildOneFont(objs[k], objs, nm ? nm[1] : null);
  }
  return map;
}

function buildOneFont(fontObj, objs, baseFont) {
  var d = fontObj.dict;
  var isType0 = /\/Subtype\s*\/Type0\b/.test(d) || /\/Encoding\s*\/Identity-[HV]\b/.test(d);
  var cmap = null;
  var tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(d);
  if (tu) {
    var tObj = objs[parseInt(tu[1], 10)];
    if (tObj && tObj.streamBytes) {
      var dec = null;
      try {
        var fm = /\/Filter\s*\/FlateDecode/.test(tObj.dict);
        dec = fm ? ImportUnzip.inflateRaw(tObj.streamBytes, tObj.streamBytes.length * 6) : tObj.streamBytes;
      } catch (e) { dec = null; }
      if (dec) cmap = parseToUnicode(latin1(dec));
    }
  }
  return { isType0: isType0, cmap: cmap, baseFont: baseFont || null };
}

function parseToUnicode(src) {
  var map = {};
  function hexToStr(h) {
    var s = String(h).replace(/\s/g, '');
    var out = '';
    for (var i = 0; i + 3 < s.length + 1; i += 4) {
      var v = parseInt(s.substr(i, 4), 16);
      if (!isFinite(v)) break;
      if (v >= 0xD800 && v <= 0xDBFF && i + 7 < s.length) {
        var lo = parseInt(s.substr(i + 4, 4), 16);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          out += String.fromCharCode(v, lo);
          i += 4;
          continue;
        }
      }
      out += String.fromCharCode(v);
    }
    return out;
  }
  var bc = /beginbfchar([\s\S]*?)endbfchar/g, m;
  while ((m = bc.exec(src)) !== null) {
    var re = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g, mm;
    while ((mm = re.exec(m[1])) !== null) map[parseInt(mm[1].replace(/\s/g, ''), 16)] = hexToStr(mm[2]);
  }
  var br = /beginbfrange([\s\S]*?)endbfrange/g, m2;
  while ((m2 = br.exec(src)) !== null) {
    var body = m2[1];
    var re2 = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*(<[0-9A-Fa-f\s]+>|\[[\s\S]*?\])/g, m3;
    while ((m3 = re2.exec(body)) !== null) {
      var lo = parseInt(m3[1].replace(/\s/g, ''), 16);
      var hi = parseInt(m3[2].replace(/\s/g, ''), 16);
      if (m3[3].charAt(0) === '[') {
        var items = m3[3].match(/<[0-9A-Fa-f\s]+>/g) || [];
        for (var i = 0; i < items.length && lo + i <= hi; i++) map[lo + i] = hexToStr(items[i].slice(1, -1));
      } else {
        var dst = parseInt(m3[3].slice(1, -1).replace(/\s/g, ''), 16);
        for (var c = lo; c <= hi && c - lo < 65536; c++) map[c] = String.fromCharCode(dst + (c - lo));
      }
    }
  }
  return Object.keys(map).length ? map : null;
}

// ---- 内容流 → 文本 ----
function extractTextFromContent(bytes, fontMap) {
  var s = latin1(bytes);
  var i = 0, out = [];
  var curFont = null;
  var inText = false;
  var lastY = null, lastX = null;

  function decodeStr(raw, isHex) {
    var codes = [];
    var k;
    if (isHex) {
      var h = raw.replace(/[^0-9A-Fa-f]/g, '');
      if (h.length % 2) h += '0';
      for (k = 0; k < h.length; k += 2) codes.push(parseInt(h.substr(k, 2), 16));
    } else {
      var b = raw;
      var j = 0;
      while (j < b.length) {
        if (b.charAt(j) === '\\') {
          var nx = b.charAt(j + 1);
          if (nx >= '0' && nx <= '7') {
            var oct = b.substr(j + 1, 3).match(/^[0-7]{1,3}/)[0];
            codes.push(parseInt(oct, 8) & 255); j += 1 + oct.length;
          } else {
            var mp = { n: 10, r: 13, t: 9, b: 8, f: 12 };
            codes.push(mp[nx] !== undefined ? mp[nx] : nx.charCodeAt(0));
            j += 2;
          }
        } else { codes.push(b.charCodeAt(j) & 255); j++; }
      }
    }
    var font = curFont ? fontMap[curFont] : null;
    var res = '';
    if (font && font.isType0) {
      for (var q = 0; q + 1 < codes.length; q += 2) {
        var code = (codes[q] << 8) | codes[q + 1];
        res += (font.cmap && font.cmap[code] !== undefined) ? font.cmap[code] : '\uFFFD';
      }
      if (codes.length % 2) res += '\uFFFD';
    } else {
      for (var w = 0; w < codes.length; w++) {
        var cc = codes[w];
        if (font && font.cmap && font.cmap[cc] !== undefined) res += font.cmap[cc];
        else res += String.fromCharCode(cc);
      }
    }
    return res;
  }

  while (i < s.length) {
    var c = s.charAt(i);
    if (c === '(') {
      // 平衡括号字符串
      var depth = 1, j2 = i + 1, buf = '';
      while (j2 < s.length && depth > 0) {
        var ch = s.charAt(j2);
        if (ch === '\\') { buf += ch + s.charAt(j2 + 1); j2 += 2; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) break; }
        buf += ch; j2++;
      }
      var after = s.slice(j2 + 1, j2 + 12);
      if (/^\s*(Tj|'|")/.test(after)) { if (inText) out.push(decodeStr(buf, false)); }
      else if (/^\s*\]/.test(after)) { /* TJ 数组里的元素，等 operator 一起处理 */ pendingArray.push({ kind: 'str', raw: buf }); }
      else pendingArray.push({ kind: 'str', raw: buf });
      i = j2 + 1;
      continue;
    }
    if (c === '<' && s.charAt(i + 1) !== '<') {
      var gt = s.indexOf('>', i);
      if (gt < 0) break;
      var hx = s.slice(i + 1, gt);
      var after2 = s.slice(gt + 1, gt + 12);
      if (/^\s*(Tj|'|")/.test(after2)) { if (inText) out.push(decodeStr(hx, true)); }
      else pendingArray.push({ kind: 'str', raw: hx, hex: true });
      i = gt + 1;
      continue;
    }
    if (c === '[') { pendingArray = []; i++; continue; }
    if (c === ']') { i++; continue; }
    if (c === '/') {
      var nm = /^\/([A-Za-z0-9_.+-]+)/.exec(s.slice(i));
      if (nm) {
        var afterN = s.slice(i + nm[0].length, i + nm[0].length + 8);
        if (/^\s+\S+\s+Tf/.test(afterN)) curFont = nm[1];
        i += nm[0].length;
        continue;
      }
    }
    var numM = /^[-+]?[\d.]+/.exec(s.slice(i));
    if (numM) {
      pendingArray.push({ kind: 'num', v: parseFloat(numM[0]) });
      i += numM[0].length;
      continue;
    }
    var opM = /^(BT|ET|Tj|TJ|T\*|Td|TD|Tm|TL|Tf|Tc|Tw|Tz|Ts|Tr|'|"|q|Q|cm|re|f|S|W|n|gs|Do|BMC|EMC|BDC)\b/.exec(s.slice(i));
    if (opM) {
      var op = opM[1];
      if (op === 'BT') { inText = true; out.push('\n'); }
      else if (op === 'ET') { inText = false; }
      else if (op === 'T*') { out.push('\n'); }
      else if (op === 'Td' || op === 'TD' || op === 'Tm') {
        var nums = pendingArray.filter(function (x) { return x.kind === 'num'; }).map(function (x) { return x.v; });
        if (op !== 'Tm' && nums.length >= 2 && Math.abs(nums[1]) > 0.5) out.push('\n');
        else if (op === 'Tm' && nums.length >= 6 && lastY !== null && Math.abs(nums[5] - lastY) > 0.5) out.push('\n');
        if (op === 'Tm' && nums.length >= 6) lastY = nums[5];
      }
      else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
        if (inText) {
          var piece = '';
          for (var a = 0; a < pendingArray.length; a++) {
            var item = pendingArray[a];
            if (item.kind === 'str') piece += decodeStr(item.raw, !!item.hex);
          }
          if (piece) out.push(piece);
          if (op === "'" || op === '"') out.push('\n');
        }
      }
      pendingArray = [];
      i += opM[1].length;
      continue;
    }
    i++;
  }
  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

var pendingArray = [];

// ---- 挂到解析器表 ----
function parsePdf(imd, input) {
  var r = ImportPdf.extract(input.bytes);
  for (var i = 0; i < r.warnings.length; i++) imd.warnings.push(r.warnings[i]);
  for (var j = 0; j < r.unhandled.length; j++) imd.stats.unhandled.push(r.unhandled[j]);
  imd.meta.pages = r.pages.length;
  if (r.encrypted) { imd.stats.unhandled.push({ kind: 'pdf-encrypted', count: 1, note: '加密 PDF，未提取', unit: '份' }); return; }

  for (var p = 0; p < r.pages.length; p++) {
    var pg = r.pages[p];
    imd.blocks.push(ImportMiddle.pagebreak(pg.no));
    var lines = String(pg.text || '').split('\n');
    var para = [];
    for (var l = 0; l < lines.length; l++) {
      if (lines[l].trim() === '') { if (para.length) { imd.blocks.push(ImportMiddle.paragraph(para.join('\n'))); para = []; } }
      else para.push(lines[l]);
    }
    if (para.length) imd.blocks.push(ImportMiddle.paragraph(para.join('\n')));
  }
  if (!r.hasTextLayer && r.pages.length) {
    // 不假装成功：给一个明确的说明块
    imd.blocks.push(ImportMiddle.raw('', '本 PDF 未提取到文本层（疑似扫描件），需 OCR 才能进入后续流程'));
  }
  imd.meta.title = imd.meta.title || r.title;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parsePdf: parsePdf, ImportPdf: ImportPdf };
if (typeof window !== 'undefined') window.ImportParsePdf = { parsePdf: parsePdf, ImportPdf: ImportPdf };

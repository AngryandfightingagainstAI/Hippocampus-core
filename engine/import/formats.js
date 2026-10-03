// ============================================================
// 导入层 · 格式注册表
// 单一职责：给定「文件名 / 字节头 / 文本」，回答「这是什么格式、用哪个解析器、
// 什么优先级、解析策略是什么、最容易踩什么坑」。
//
// 设计约束（来自 2026-10-02 的导入方案评审）：
//   1. 不做「一个格式一个按钮」——只做一张表，加格式只改这张表 + 加一个解析器。
//   2. 不静默丢内容——不支持的格式也要有明确答案（supported:false + note），
//      由调用方写进 ImportReport，让用户看见「这个文件我没处理」。
//   3. 优先级只影响 UI 排序与提示，不影响正确性。
// ============================================================

// 优先级 → 排序权重
var PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

// 解析器 id 一览（实际实现在 parsers/ 下）：
//   text    纯文本（含 log/ini/toml/lrc 等一切「按行就是全部信息」的格式）
//   markdown 保留标题层级 / 列表 / 表格 / 代码块
//   json    结构化，保留字段路径
//   yaml    YAML 子集（映射/序列/标量/块标量）
//   html    正文提取，过滤脚本样式与导航
//   csv     CSV/TSV 表格结构
//   xml     递归成树 + 全文兜底
//   rtf     RTF 控制字剥离
//   docx    OOXML：正文 / 标题层级 / 表格 / 图片计数
//   odt     OpenDocument（同为 zip，text 在 content.xml）
//   epub    zip + OPF spine 章节序
//   pdf     PDF 文本层提取（含 ToUnicode CMap；扫描件需 OCR，本轮不做）
//   zip     压缩包成员清单 + 递归导入建议（解压后逐个再走一遍）
var FORMATS = [
  {
    id: 'txt', label: '纯文本', priority: 'P0', parser: 'text', binary: false,
    exts: ['txt', 'text'],
    strategy: '原文完整保留，不做任何裁剪',
    pitfalls: '编码：先认 BOM（UTF-8/UTF-16LE/BE），无 BOM 先按 UTF-8 严判，失败再试 GBK（TextDecoder 可用时）；都失败才降级并必须报警'
  },
  {
    id: 'markdown', label: 'Markdown', priority: 'P0', parser: 'markdown', binary: false,
    exts: ['md', 'markdown', 'mdown', 'mkd'],
    strategy: '保留标题层级（# 的层数就是中间格式的 level）',
    pitfalls: '不要用 HTML 解析器处理 md；表格与代码块要单独成块，不要被当成段落吞掉'
  },
  {
    id: 'docx', label: 'Word 文档', priority: 'P0', parser: 'docx', binary: true,
    exts: ['docx'],
    magic: [0x50, 0x4B, 0x03, 0x04],
    strategy: '解压 → word/document.xml → 提取正文段落、标题层级、表格；图片只计数不处理',
    pitfalls: '图片与嵌入对象拿不到内容，必须计数并自报「N 张图片暂未处理」；文档里若有修订/批注也在别处，不要假装读到了'
  },
  {
    id: 'pdf', label: 'PDF', priority: 'P0', parser: 'pdf', binary: true,
    exts: ['pdf'],
    magic: [0x25, 0x50, 0x44, 0x46, 0x2D], // %PDF-
    strategy: '提取文本层（FlateDecode 流 + Tj/TJ 文本算子 + ToUnicode CMap）',
    pitfalls: '扫描件没有文本层，必须明确报「未提取到文本，疑似扫描件，需 OCR」而不是给一个空字符串；加密 PDF 要报「已加密」'
  },
  {
    id: 'json', label: 'JSON', priority: 'P0', parser: 'json', binary: false,
    exts: ['json', 'jsonc'],
    strategy: '保留字段结构：对象/数组/标量都带路径',
    pitfalls: '容错不要用 eval；JSONC（带注释）要么先剥注释要么直接报错，不要静默产出一个半截对象'
  },
  {
    id: 'html', label: '网页', priority: 'P1', parser: 'html', binary: false,
    exts: ['html', 'htm', 'xhtml'],
    strategy: '正文提取：去 script/style/nav/header/footer/aside，保留 h1-h6/p/li/table',
    pitfalls: '不要把导航、广告、脚本当正文；字符实体必须解码；<br> 要变行而不是被丢掉'
  },
  {
    id: 'rtf', label: 'RTF', priority: 'P1', parser: 'rtf', binary: false,
    exts: ['rtf'],
    magic: [0x7B, 0x5C, 0x72, 0x74, 0x66], // {\rtf
    strategy: '剥离控制字与分组，保留 \\par 换行、\\uN Unicode 转义',
    pitfalls: '\\uN 是十进制 Unicode 且常带 \\uN? 的替换字符，要一起吃掉；字体表/颜色表要整段丢弃'
  },
  {
    id: 'odt', label: 'OpenDocument', priority: 'P1', parser: 'odt', binary: true,
    exts: ['odt'],
    magic: [0x50, 0x4B, 0x03, 0x04],
    strategy: '解压 → content.xml → 按 text:h / text:p / table:table 提块',
    pitfalls: '必须按 mimetype 成员的字节内容确认是 ODT，别把随便一个 zip 当文档'
  },
  {
    id: 'epub', label: 'EPUB', priority: 'P1', parser: 'epub', binary: true,
    exts: ['epub'],
    magic: [0x50, 0x4B, 0x03, 0x04],
    strategy: '解压 → META-INF/container.xml → OPF spine → 按章顺序解析各 XHTML',
    pitfalls: '必须按 spine 顺序而不是 zip 里的字典序，否则章节乱序；每章自带 <html> 壳，要复用 HTML 解析器而不是另写一套'
  },
  {
    id: 'csv', label: '表格（逗号分隔）', priority: 'P1', parser: 'csv', binary: false,
    exts: ['csv'],
    strategy: '保留表头与行结构（中间格式的 table 块）',
    pitfalls: '引号内的逗号/换行是同一格；CRLF 与 LF 都要吃；不要用 split(",") 硬拆'
  },
  {
    id: 'tsv', label: '表格（制表符分隔）', priority: 'P1', parser: 'csv', binary: false,
    exts: ['tsv', 'tab'],
    strategy: '同 CSV，分隔符为制表符',
    pitfalls: '同上'
  },
  {
    id: 'yaml', label: 'YAML', priority: 'P1', parser: 'yaml', binary: false,
    exts: ['yaml', 'yml'],
    strategy: '支持映射/序列/标量/块标量（| 与 >）',
    pitfalls: '不要妄想覆盖全部 YAML（锚点/别名/多重文档）；认不得的结构必须原文保留并报警，不能默默丢掉'
  },
  {
    id: 'xml', label: 'XML', priority: 'P2', parser: 'xml', binary: false,
    exts: ['xml', 'plist', 'rss', 'atom'],
    strategy: '递归成树 + 全文兜底；同时给一份纯文本还原',
    pitfalls: '命名空间前缀别丢；CDATA 要当文本而不是标签'
  },
  {
    id: 'ini', label: 'INI', priority: 'P2', parser: 'text', binary: false,
    exts: ['ini', 'cfg', 'conf', 'properties'],
    strategy: '按纯文本处理并保留 [section] 行',
    pitfalls: '不要试图解析成对象——注释与重复键会丢信息'
  },
  {
    id: 'toml', label: 'TOML', priority: 'P2', parser: 'text', binary: false,
    exts: ['toml'],
    strategy: '按纯文本处理并保留 [table] 行',
    pitfalls: '同上'
  },
  {
    id: 'log', label: '日志 / 聊天记录', priority: 'P2', parser: 'text', binary: false,
    exts: ['log', 'txt.log', 'chat'],
    strategy: '当纯文本处理',
    pitfalls: '日志通常很长，交给预算/分块层，不要在解析层截断'
  },
  {
    id: 'mhtml', label: '网页存档', priority: 'P2', parser: null, binary: true,
    exts: ['mhtml', 'mht'],
    strategy: '后续支持（MIME multipart 解出 text/html 部分）',
    pitfalls: '本轮不支持：要明确报「暂不支持」，不能当成 HTML 硬塞'
  },
  {
    id: 'doc', label: '老 Word 格式', priority: 'P3', parser: null, binary: true,
    exts: ['doc'],
    magic: [0xD0, 0xCF, 0x11, 0xE0],
    strategy: '后置——不为它给 RN 端引入大量复杂依赖',
    pitfalls: '它是 OLE 复合文档，不是 zip；误当 docx 解会得到一堆乱码'
  },
  {
    id: 'image', label: '图片', priority: 'P3', parser: null, binary: true,
    exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
    magic: [0x89, 0x50, 0x4E, 0x47],
    strategy: '后续接 OCR / 视觉模型',
    pitfalls: '本轮不支持：要明确报「暂未处理」并保留原文件，不能静默跳过'
  },
  {
    id: 'zip', label: '压缩包', priority: 'P3', parser: 'zip', binary: true,
    exts: ['zip'],
    magic: [0x50, 0x4B, 0x03, 0x04],
    strategy: '列成员清单 + 递归导入建议（后续在 UI 上做「逐个导入」）',
    pitfalls: '不要在导入流程里自动落地解压出来的所有文件；不要静默忽略加密成员'
  },
  {
    id: 'archive-7z', label: '7z 压缩包', priority: 'P3', parser: null, binary: true,
    exts: ['7z'],
    magic: [0x37, 0x7A, 0xBC, 0xAF],
    strategy: '后置',
    pitfalls: '本轮不支持'
  },
  {
    id: 'archive-rar', label: 'RAR 压缩包', priority: 'P3', parser: null, binary: true,
    exts: ['rar'],
    magic: [0x52, 0x61, 0x72, 0x21],
    strategy: '后置',
    pitfalls: '本轮不支持'
  }
];

function startsWith(bytes, sig) {
  if (!bytes || !bytes.length || !sig) return false;
  for (var i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

function extOf(name) {
  var s = String(name || '').toLowerCase();
  var slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (slash >= 0) s = s.slice(slash + 1);
  var dot = s.lastIndexOf('.');
  if (dot < 0) return '';
  return s.slice(dot + 1);
}

var ImportFormats = {
  PRIORITY_ORDER: PRIORITY_ORDER,
  list: function () { return FORMATS.slice(); },

  get: function (id) {
    for (var i = 0; i < FORMATS.length; i++) if (FORMATS[i].id === id) return FORMATS[i];
    return null;
  },

  byExt: function (ext) {
    var e = String(ext || '').toLowerCase();
    for (var i = 0; i < FORMATS.length; i++) {
      var f = FORMATS[i];
      for (var j = 0; j < f.exts.length; j++) if (f.exts[j] === e) return f;
    }
    return null;
  },

  // 识别顺序：魔数（最可信） → 扩展名 → 文本嗅探。
  // 返回 { matched, format, reason, supported }
  //   matched=false 表示「认不出来」，调用方必须把这个文件写进报告的 unhandled。
  detect: function (input) {
    input = input || {};
    var bytes = input.bytes || null;
    var name = input.name || '';
    var ext = extOf(name);

    // 1) 魔数。zip 系（docx/odt/epub/zip）共用 PK 头，必须再按扩展名细分。
    var zipLike = null;
    for (var i = 0; i < FORMATS.length; i++) {
      var f = FORMATS[i];
      if (!f.magic) continue;
      if (!startsWith(bytes, f.magic)) continue;
      if (f.magic[0] === 0x50 && f.magic[1] === 0x4B) { if (!zipLike) zipLike = f; continue; }
      return {
        matched: true, format: f, supported: !!f.parser, byMagic: true, byExt: false, bySniff: false,
        reason: '魔数命中 ' + f.magic.map(function (b) { return b.toString(16).toUpperCase(); }).join(' ')
      };
    }
    if (zipLike) {
      // PK 头：交给扩展名决定是 docx / odt / epub / zip 还是「认不出的 zip」
      var byExtZip = this.byExt(ext);
      if (byExtZip && byExtZip.magic && byExtZip.magic[0] === 0x50) {
        return { matched: true, format: byExtZip, supported: !!byExtZip.parser, byMagic: true, byExt: true, bySniff: false, reason: 'PK 头 + 扩展名 .' + ext };
      }
      return { matched: true, format: this.get('zip'), supported: true, byMagic: true, byExt: false, bySniff: false, reason: 'PK 头，扩展名 .' + (ext || '(无)') + '，按通用压缩包列出成员' };
    }

    // 2) 扩展名
    var byExt = this.byExt(ext);
    if (byExt) {
      // .txt 这类有 ext 但内容是二进制的，仍会走 text 解析器并报警（由解析器负责）
      return { matched: true, format: byExt, supported: !!byExt.parser, byMagic: false, byExt: true, bySniff: false, reason: '扩展名 .' + ext };
    }

    // 3) 文本嗅探（无扩展名的粘贴内容）
    var text = input.text;
    if (typeof text === 'string' && text.length) {
      var t = text.replace(/^\uFEFF/, '').replace(/^\s+/, '');
      if (t.charAt(0) === '{' || t.charAt(0) === '[') {
        return { matched: true, format: this.get('json'), supported: true, byMagic: false, byExt: false, bySniff: true, reason: '文本嗅探：以 { 或 [ 开头' };
      }
      if (/^<(\?xml|!doctype|html)/i.test(t)) {
        return { matched: true, format: this.get('html'), supported: true, byMagic: false, byExt: false, bySniff: true, reason: '文本嗅探：以 < 标记开头' };
      }
      if (/^#\s|\n#{1,6}\s|\n\s*[-*]\s/.test(t)) {
        return { matched: true, format: this.get('markdown'), supported: true, byMagic: false, byExt: false, bySniff: true, reason: '文本嗅探：含 Markdown 标题/列表' };
      }
      return { matched: true, format: this.get('txt'), supported: true, byMagic: false, byExt: false, bySniff: true, reason: '文本嗅探：无扩展名，按纯文本处理' };
    }

    return { matched: false, format: null, supported: false, byMagic: false, byExt: false, bySniff: false, reason: ext ? ('未收录的扩展名 .' + ext) : '既无扩展名也无文本内容' };
  },

  // 按 GPT 那张表的顺序给 UI 用（P0 在前）
  sorted: function () {
    return FORMATS.slice().sort(function (a, b) {
      var d = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (d) return d;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
  },

  // 可静态列给用户的「首批支持清单」，用于 UI 文案与 README
  firstBatch: function () {
    return ['txt', 'markdown', 'docx', 'pdf', 'json', 'html', 'csv', 'tsv'];
  },

  extOf: extOf
};

if (typeof window !== 'undefined') window.ImportFormats = ImportFormats;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportFormats;

// ============================================================
// import_smoke.js — 导入层冒烟测试
// 覆盖：格式识别 / 编码 / 中间格式 / 各解析器 / 原件保管 / 草稿+校验 / 流水线兜底
// 跑法：node tools/import_smoke.js   （cwd 必须是仓库根）
//
// 夹具全部在内存里现造（含一个 60 行的 zip store 写入器），不依赖任何外部工具。
// ============================================================

var path = require('path');
var fs = require('fs');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');

// ---- 按依赖顺序加载（模块间靠全局互相引用，和 RN 侧的加载方式一致）----
function load(rel, globalName) {
  var m = require(path.join(ROOT, rel));
  if (globalName) global[globalName] = m;
  return m;
}
var ImportDecode = load('engine/import/decode.js', 'ImportDecode');
var ImportUnzip = load('engine/import/unzip.js', 'ImportUnzip');
var ImportMiddle = load('engine/import/middle.js', 'ImportMiddle');
var ImportFormats = load('engine/import/formats.js', 'ImportFormats');
var ImportReport = load('engine/import/report.js', 'ImportReport');
var TEXTLIKE = load('engine/import/parsers/textlike.js', 'ImportParseTextlike');
global.ImportHtml = TEXTLIKE.ImportHtml;
var ImportParseArchive = load('engine/import/parsers/archive.js', 'ImportParseArchive');
var PDFMOD = load('engine/import/parsers/pdf.js', 'ImportParsePdfGo');
global.ImportParsePdf = PDFMOD;
var ImportPipeline = load('engine/import/pipeline.js', 'ImportPipeline');
var ImportVault = load('engine/import/vault.js', 'ImportVault');
var ImportDraft = load('engine/import/draft.js', 'ImportDraft');
var Import = load('engine/import/index.js', 'Import');
global.CardValidator = require(path.join(ROOT, 'engine/core/card_validator.js'));
Import.init();

// ---------------- 断言小工具 ----------------
var okCount = 0, failCount = 0;
function ok(name, cond, detail) {
  if (cond) { okCount++; console.log('  ok   ' + name); }
  else { failCount++; console.log('  FAIL ' + name + (detail ? ('  <<< ' + detail) : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
function includes(name, hay, needle) { ok(name, String(hay).indexOf(needle) >= 0, 'missing=' + JSON.stringify(needle) + ' in ' + JSON.stringify(String(hay).slice(0, 160))); }
function section(t) { console.log('\n### ' + t); }

// ---------------- 内存 zip 写入器（store，无压缩）----------------
var CRC_TABLE = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  var c = -1;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function u16(a, o, v) { a[o] = v & 255; a[o + 1] = (v >>> 8) & 255; }
function u32(a, o, v) { a[o] = v & 255; a[o + 1] = (v >>> 8) & 255; a[o + 2] = (v >>> 16) & 255; a[o + 3] = (v >>> 24) & 255; }

function zipStore(files) {
  var locals = [], centrals = [], offset = 0;
  for (var i = 0; i < files.length; i++) {
    var nameB = ImportDecode.toUTF8(files[i].name);
    var data = files[i].data instanceof Uint8Array ? files[i].data : ImportDecode.toUTF8(String(files[i].data));
    var crc = crc32(data);
    var lh = new Uint8Array(30 + nameB.length);
    u32(lh, 0, 0x04034b50); u16(lh, 4, 20); u16(lh, 6, 0x0800); u16(lh, 8, 0);
    u16(lh, 10, 0); u16(lh, 12, 0x21); u32(lh, 14, crc);
    u32(lh, 18, data.length); u32(lh, 22, data.length);
    u16(lh, 26, nameB.length); u16(lh, 28, 0);
    lh.set(nameB, 30);
    locals.push(lh, data);

    var ch = new Uint8Array(46 + nameB.length);
    u32(ch, 0, 0x02014b50); u16(ch, 4, 20); u16(ch, 6, 20); u16(ch, 8, 0x0800); u16(ch, 10, 0);
    u16(ch, 12, 0); u16(ch, 14, 0x21); u32(ch, 16, crc);
    u32(ch, 20, data.length); u32(ch, 24, data.length);
    u16(ch, 28, nameB.length); u16(ch, 30, 0); u16(ch, 32, 0); u16(ch, 34, 0);
    u16(ch, 36, 0); u32(ch, 38, 0); u32(ch, 42, offset);
    ch.set(nameB, 46);
    centrals.push(ch);
    offset += lh.length + data.length;
  }
  var cdSize = 0;
  for (var c = 0; c < centrals.length; c++) cdSize += centrals[c].length;
  var eocd = new Uint8Array(22);
  u32(eocd, 0, 0x06054b50); u16(eocd, 4, 0); u16(eocd, 6, 0);
  u16(eocd, 8, files.length); u16(eocd, 10, files.length);
  u32(eocd, 12, cdSize); u32(eocd, 16, offset); u16(eocd, 20, 0);
  return concat(locals.concat(centrals).concat([eocd]));
}
function concat(list) {
  var n = 0, i;
  for (i = 0; i < list.length; i++) n += list[i].length;
  var out = new Uint8Array(n), o = 0;
  for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
  return out;
}

// ---------------- 夹具 ----------------
function makeDocx() {
  var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:body>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>边缘之城</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>这座城市建在一座巨大的废弃工厂之上，工厂仍在运转，只是没人知道它在生产什么。</w:t></w:r></w:p>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>人物</w:t></w:r></w:p>'
    + '<w:tbl>'
    + '<w:tr><w:tc><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>身份</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>备注</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>陈默</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>修表匠</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>话很少</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>林晚</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>夜班护士</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>值夜班时会哼歌</w:t></w:r></w:p></w:tc></w:tr>'
    + '</w:tbl>'
    + '<w:p><w:r><w:t>1998年 工厂第一次停摆。</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>2004年 城市开始出现「回声」。</w:t></w:r></w:p>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>开场</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>你在一间没有窗户的房间里醒来，手里攥着一枚停摆的怀表。</w:t></w:r></w:p>'
    + '</w:body></w:document>';
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'word/document.xml', data: doc },
    { name: 'word/media/image1.png', data: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]) },
    { name: 'word/header1.xml', data: '<w:hdr/>' },
    { name: 'word/footnotes.xml', data: '<w:footnotes/>' }
  ]);
}

function makeOdt() {
  var content = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
    + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
    + 'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">'
    + '<office:body><office:text>'
    + '<text:h text:outline-level="1">潮汐纪事</text:h>'
    + '<text:p>潮水每天涨三次，第三次会带来不属于这个世界的东西。</text:p>'
    + '<text:h text:outline-level="2">物品</text:h>'
    + '<table:table><table:table-row>'
    + '<table:table-cell><text:p>名称</text:p></table:table-cell>'
    + '<table:table-cell><text:p>说明</text:p></table:table-cell>'
    + '</table:table-row><table:table-row>'
    + '<table:table-cell><text:p>盐晶灯</text:p></table:table-cell>'
    + '<table:table-cell><text:p>照明用，三小时熄灭</text:p></table:table-cell>'
    + '</table:table-row></table:table>'
    + '</office:text></office:body></office:document-content>';
  return zipStore([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' },
    { name: 'content.xml', data: content },
    { name: 'Pictures/logo.png', data: new Uint8Array([1, 2, 3]) }
  ]);
}

function makeEpub() {
  var container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  var opf = '<?xml version="1.0"?><package><metadata><dc:title>夜航手册</dc:title></metadata>'
    + '<manifest>'
    + '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="css" href="s.css" media-type="text/css"/>'
    + '</manifest>'
    + '<spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>';
  var ch1 = '<html><head><title>一</title></head><body><h1>第一章</h1><p>船在雾里，看不见岸。</p></body></html>';
  var ch2 = '<html><head><title>二</title></head><body><h1>第二章</h1><p>灯塔的光每十二秒转一圈。</p></body></html>';
  return zipStore([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/ch1.xhtml', data: ch1 },
    { name: 'OEBPS/ch2.xhtml', data: ch2 },
    { name: 'OEBPS/s.css', data: 'p{color:red}' }
  ]);
}

function makePdf() {
  var s = '';
  var contentEn = 'BT /F1 24 Tf 100 700 Td (Hello Import) Tj ET';
  var contentZh = 'BT /F2 24 Tf 100 650 Td <4F60597D> Tj ET';
  s += '%PDF-1.4\n';
  s += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  s += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  s += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n';
  var full = contentEn + '\n' + contentZh;
  s += '4 0 obj\n<< /Length ' + full.length + ' >>\nstream\n' + full + '\nendstream\nendobj\n';
  s += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  s += '6 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /SimSun /Encoding /Identity-H /DescendantFonts [8 0 R] /ToUnicode 7 0 R >>\nendobj\n';
  s += '7 0 obj\n<< /Length 200 >>\nstream\n'
    + '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n'
    + '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
    + '2 beginbfchar\n<4F60> <4F60>\n<597D> <597D>\nendbfchar\n'
    + 'endcmap\nend\nend\nendstream\nendobj\n';
  s += '8 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /SimSun >>\nendobj\n';
  s += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return ImportDecode.toUTF8(s);
}

function makePdfScanned() {
  var s = '%PDF-1.4\n';
  s += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  s += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  s += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n';
  var c = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  s += '4 0 obj\n<< /Length ' + c.length + ' >>\nstream\n' + c + '\nendstream\nendobj\n';
  s += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return ImportDecode.toUTF8(s);
}

// ============================================================
section('IM-1 格式注册表与识别');
// ============================================================
var all = ImportFormats.list();
ok('IM-1a 注册表非空（' + all.length + ' 项）', all.length >= 20);
var first = ImportFormats.firstBatch();
eq('IM-1b 第一批 8 种', first.join(','), 'txt,markdown,docx,pdf,json,html,csv,tsv');
ok('IM-1c 每项都有 strategy 与 pitfalls', all.every(function (f) { return !!f.strategy && f.pitfalls !== undefined; }));
ok('IM-1d 每项都有 priority 且合法', all.every(function (f) { return ['P0', 'P1', 'P2', 'P3'].indexOf(f.priority) >= 0; }));
var d1 = ImportFormats.detect({ name: 'a.docx', bytes: ImportDecode.toUTF8('PK\u0003\u0004xxxx') });
ok('IM-1e PK 头 + .docx → docx', d1.matched && d1.format.id === 'docx', JSON.stringify(d1));
var d2 = ImportFormats.detect({ name: 'a.txt', text: 'hello' });
ok('IM-1f .txt → 文本格式', d2.matched && d2.format.parser === 'text', JSON.stringify(d2));
var d3 = ImportFormats.detect({ name: 'a.qqq', text: 'plain words here' });
ok('IM-1g 无扩展名文本 → 走嗅探且 reason 写明（不静默）', d3.matched === true && d3.bySniff === true && !!d3.reason, JSON.stringify(d3));
var d3b = ImportFormats.detect({ name: 'a.qqq', bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0x7F, 0x00]) });
ok('IM-1g2 未知二进制 → matched=false 且有 reason', d3b.matched === false && !!d3b.reason, JSON.stringify(d3b));
var d4 = ImportFormats.detect({ name: 'a.pdf', bytes: ImportDecode.toUTF8('%PDF-1.4\n...') });
ok('IM-1h %PDF 魔数优先于扩展名', d4.matched && d4.format.id === 'pdf' && d4.byMagic === true, JSON.stringify(d4));
var d5 = ImportFormats.detect({ name: 'a.png', bytes: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]) });
ok('IM-1i 图片是 P3 且本轮不支持', d5.format.priority === 'P3' && d5.supported === false, JSON.stringify(d5));

// ============================================================
section('IM-2 编码与指纹');
// ============================================================
var utf8Round = ImportDecode.text(ImportDecode.toUTF8('中文测试 emoji 😀'));
eq('IM-2a UTF-8 往返', utf8Round.text, '中文测试 emoji 😀');
eq('IM-2b 编码判定 = utf-8', utf8Round.encoding, 'utf-8');
var gbkBytes = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]);
var gbk = ImportDecode.text(gbkBytes);
ok('IM-2c GBK 判定（' + gbk.encoding + '）', gbk.encoding === 'gbk' || gbk.encoding === 'fallback-latin1');
if (gbk.encoding === 'gbk') eq('IM-2d GBK 解码', gbk.text, '中文');
eq('IM-2e sha256 空串', ImportDecode.sha256Hex(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
eq('IM-2f sha256 "abc"', ImportDecode.sha256Hex(ImportDecode.toUTF8('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// ============================================================
section('IM-3 中间格式 IMD');
// ============================================================
(function () {
  var imd = ImportMiddle.create({ importId: 'x', name: 't.md' });
  eq('IM-3g create() 只认平铺字段（source.name 平铺传）', imd.source.name, 't.md');
  imd.blocks.push(ImportMiddle.heading(1, '标题一'));
  imd.blocks.push(ImportMiddle.paragraph('正文一'));
  imd.blocks.push(ImportMiddle.list(['a', 'b'], false));
  imd.blocks.push(ImportMiddle.table(['h1', 'h2'], [['1', '2']]));
  ImportMiddle.finalize(imd);
  eq('IM-3a blocks 数', imd.blocks.length, 4);
  ok('IM-3b outline 抓到 h1', imd.outline.length === 1 && imd.outline[0].title === '标题一');
  ok('IM-3c meta 统计（段 ' + imd.meta.paragraphs + ' / 表 ' + imd.meta.tables + '）', imd.meta.paragraphs === 1 && imd.meta.tables === 1);
  includes('IM-3d toPlainText 含内容', ImportMiddle.toPlainText(imd), '正文一');
  ok('IM-3e estimate 为正', ImportMiddle.estimate(imd) > 0);
  var bad = ImportMiddle.create({ source: { name: 'b' } });
  bad.blocks.push({ type: 'weird', text: 'x' });
  ImportMiddle.finalize(bad);
  ok('IM-3f 未知块类型降级 raw 并报警', bad.blocks[0].type === 'raw' && bad.warnings.length > 0);
})();

// ============================================================
section('IM-4 报告（不许静默丢）');
// ============================================================
(function () {
  var rep = ImportReport.create();
  ImportReport.addFile(rep, {
    name: '设定.docx', bytes: 12345, ok: true,
    extracted: { paragraph: 12, heading: 3, table: 2 },
    unhandled: [{ kind: 'image', count: 2, note: '文档内图片（本轮不解析图片内容）', unit: '张图片' }],
    warnings: []
  });
  var line = ImportReport.lines(rep)[0];
  ok('IM-4a 人话报告含段数/标题/表格', /12\s*段/.test(line) && /3\s*个标题/.test(line) && /2\s*个表格/.test(line), line);
  includes('IM-4b 报告含「图片暂未处理」', line, '图片暂未处理');
  includes('IM-4c 报告含文件名', line, '设定.docx');
})();

// ============================================================
section('IM-5 文本类解析器');
// ============================================================
// ---- 源元数据：流水线必须把 文件名 / 字节数 / 格式 写进 imd.source ----
// P20 修：旧流水线把 source 包成嵌套对象，ImportMiddle.create() 收的是平铺字段
//   ⇒ imd.source 恒为 name='' / bytes=0 / formatId='unknown'，
//     导入卡带的「来源文件名」整条丢失（描述只剩「由「导入文游资料」生成」）。
(function () {
  var srcBytes = ImportDecode.toUTF8('# 世界观\n\n正文。\n');
  var rs = Import.run({ name: '边缘之城.md', bytes: srcBytes }, { vault: false });
  eq('IM-5s1 源文件名进了 imd.source.name', rs.imd.source.name, '边缘之城.md');
  eq('IM-5s2 源扩展名进了 imd.source.ext', rs.imd.source.ext, 'md');
  eq('IM-5s3 源字节数进了 imd.source.bytes', rs.imd.source.bytes, srcBytes.length);
  eq('IM-5s4 源格式进了 imd.source.formatId', rs.imd.source.formatId, 'markdown');
  eq('IM-5s5 解析器进了 imd.source.parser', rs.imd.source.parser, 'markdown');
  eq('IM-5s6 编码判定进了 imd.source.encoding', rs.imd.source.encoding, 'utf-8');
  includes('IM-5s7 卡带描述里看得见来源文件名', rs.draft.card.description, '：边缘之城.md');
})();
(function () {
  var r = Import.run({ name: 'w.md', text: '# 世界观\n\n这是一段设定文字，用来测试标题与段落。\n\n## 规则\n\n| 名称 | 效果 |\n|---|---|\n| 火 | 热 |\n| 冰 | 冷 |\n' }, { vault: false });
  var types = r.imd.blocks.map(function (b) { return b.type; });
  ok('IM-5a markdown 出 heading', types.indexOf('heading') >= 0, types.join(','));
  ok('IM-5b markdown 出 table', types.indexOf('table') >= 0, types.join(','));
  var tb = r.imd.blocks.filter(function (b) { return b.type === 'table'; })[0];
  ok('IM-5c 表头正确', tb && tb.headers.join(',') === '名称,效果', tb && tb.headers.join(','));
  eq('IM-5d 表格行数', tb.rows.length, 2);
})();
(function () {
  var csv = '姓名,身份,备注\n陈默,修表匠,话少\n林晚,护士,哼歌\n';
  var r = Import.run({ name: 'npc.csv', text: csv }, { vault: false });
  var tb = r.imd.blocks.filter(function (b) { return b.type === 'table'; })[0];
  ok('IM-5e csv → 表格', !!tb && tb.rows.length === 2);
  ok('IM-5f csv 落到 worldbook.npcs', r.draft.card.worldbook.npcs.length === 2, JSON.stringify(r.draft.card.worldbook.npcs));
  eq('IM-5g npcs[0].name', r.draft.card.worldbook.npcs[0].name, '陈默');
})();
(function () {
  var html = '<html><head><title>暗室</title></head><body><nav>导航</nav><h1>暗室</h1><p>房间里只有一盏灯。</p><script>var x=1;</script><table><tr><td>a</td><td>b</td></tr></table></body></html>';
  var r = Import.run({ name: 'p.html', text: html }, { vault: false });
  var txt = ImportMiddle.toPlainText(r.imd);
  includes('IM-5h html 提取正文', txt, '房间里只有一盏灯');
  ok('IM-5i html 过滤掉 script 内容', txt.indexOf('var x=1') < 0);
  ok('IM-5j html 过滤掉 nav', txt.indexOf('导航') < 0);
})();
(function () {
  var j = JSON.stringify({ world: { name: '测试世界', rules: ['a', 'b'] }, npcs: [{ name: '甲', age: 3 }] }, null, 2);
  var r = Import.run({ name: 'c.json', text: j }, { vault: false });
  var kvs = r.imd.blocks.filter(function (b) { return b.type === 'kv'; });
  ok('IM-5k json 展平成 kv（' + kvs.length + ' 条）', kvs.length >= 2);
  includes('IM-5l json 路径保留', kvs.map(function (k) { return k.path; }).join('|'), 'world.name');
})();
(function () {
  var bad = Import.run({ name: 'bad.json', text: '{"a": 1,,}' }, { vault: false });
  ok('IM-5m 坏 JSON 降级为文本并报警', bad.imd.warnings.length > 0 && bad.imd.blocks.length > 0);
  includes('IM-5n 坏 JSON 的报警说明降级', bad.imd.warnings.join(' '), '文本');
})();
(function () {
  var log = '';
  for (var i = 0; i < 12; i++) log += '[2026-01-0' + ((i % 9) + 1) + ' 12:00] 甲: 第' + i + '条消息\n';
  var r = Import.run({ name: 'chat.txt', text: log }, { vault: false });
  ok('IM-5o 聊天记录逐行成块（' + r.imd.blocks.length + ' 块）', r.imd.blocks.length >= 10);
})();

// ============================================================
section('IM-6 压缩包类：docx / odt / epub');
// ============================================================
(function () {
  var r = Import.run({ name: '边缘之城.docx', bytes: makeDocx() }, { vault: false });
  var txt = ImportMiddle.toPlainText(r.imd);
  includes('IM-6a docx 提取正文', txt, '巨大的废弃工厂');
  includes('IM-6b docx 识别标题', txt, '边缘之城');
  var tbl = r.imd.blocks.filter(function (b) { return b.type === 'table'; })[0];
  ok('IM-6c docx 提取表格', !!tbl && tbl.rows.length === 2, tbl ? JSON.stringify(tbl.headers) : 'no table');
  ok('IM-6d docx 表格 → npcs', r.draft.card.worldbook.npcs.length === 2, JSON.stringify(r.draft.card.worldbook.npcs.map(function (n) { return n.name; })));
  ok('IM-6e docx 图片计数上报', r.imd.meta.images === 1, String(r.imd.meta.images));
  ok('IM-6f 页眉/脚注被报为未并入（不静默丢）',
    r.imd.stats.unhandled.some(function (u) { return u.kind === 'docx-part'; }),
    JSON.stringify(r.imd.stats.unhandled));
  includes('IM-6g 报告里出现未处理条目', ImportReport.toText(r.report), '未');
  includes('IM-6h 开场提示词被识别', r.draft.card.game.openingPrompt, '停摆的怀表');
  ok('IM-6i 时间线认出 1998/2004', r.draft.card.worldbook.timeline.official.length === 2,
    JSON.stringify(r.draft.card.worldbook.timeline.official));
})();
(function () {
  var r = Import.run({ name: '潮汐纪事.odt', bytes: makeOdt() }, { vault: false });
  var txt = ImportMiddle.toPlainText(r.imd);
  includes('IM-6j odt 提取正文', txt, '潮水每天涨三次');
  ok('IM-6k odt 表格 → items', r.draft.card.worldbook.items.length === 1, JSON.stringify(r.draft.card.worldbook.items));
  eq('IM-6l odt items[0].name', (r.draft.card.worldbook.items[0] || {}).name, '盐晶灯');
})();
(function () {
  var r = Import.run({ name: '夜航手册.epub', bytes: makeEpub() }, { vault: false });
  var txt = ImportMiddle.toPlainText(r.imd);
  includes('IM-6m epub 提取章节一', txt, '船在雾里');
  includes('IM-6n epub 提取章节二', txt, '灯塔的光');
  var pages = r.imd.blocks.filter(function (b) { return b.type === 'pagebreak'; });
  eq('IM-6o epub 每章插分页（2 章）', pages.length, 2);
  ok('IM-6p epub 按 spine 顺序（第二章在前）', txt.indexOf('灯塔的光') < txt.indexOf('船在雾里'), 'order');
  eq('IM-6q epub 标题来自 dc:title', r.imd.meta.title, '夜航手册');
})();
(function () {
  var z = zipStore([{ name: 'a.txt', data: 'hi' }, { name: 'sub/b.md', data: '# b' }]);
  var r = Import.run({ name: 'pack.zip', bytes: z }, { vault: false });
  ok('IM-6r zip 列成员', r.imd.blocks.filter(function (b) { return b.type === 'kv'; }).length >= 2);
  includes('IM-6s zip 说明「只列清单」', r.imd.warnings.join(' '), '逐个');
})();

// ============================================================
section('IM-7 PDF');
// ============================================================
(function () {
  var r = Import.run({ name: 'doc.pdf', bytes: makePdf() }, { vault: false });
  var txt = ImportMiddle.toPlainText(r.imd);
  includes('IM-7a PDF 提取英文文本', txt, 'Hello Import');
  includes('IM-7b PDF 用 ToUnicode 解出中文', txt, '你好');
  ok('IM-7c hasTextLayer', r.imd.blocks.length > 0 && txt.replace(/\s/g, '').length > 5);
})();
(function () {
  var r = Import.run({ name: 'scan.pdf', bytes: makePdfScanned() }, { vault: false });
  var txt = ImportMiddle.toPlainText(r.imd);
  includes('IM-7d 扫描件被明确告知需要 OCR', txt + r.imd.warnings.join(' '), 'OCR');
  ok('IM-7e 扫描件记 unhandled=pdf-ocr', r.imd.stats.unhandled.some(function (u) { return u.kind === 'pdf-ocr'; }),
    JSON.stringify(r.imd.stats.unhandled));
})();
(function () {
  var enc = ImportDecode.toUTF8('%PDF-1.4\n1 0 obj\n<< /Encrypt 9 0 R >>\nendobj\ntrailer\n%%EOF\n');
  var r = Import.run({ name: 'enc.pdf', bytes: enc }, { vault: false });
  includes('IM-7f 加密 PDF 明确报「已加密」', r.imd.warnings.join(' '), '已加密');
})();

// ============================================================
section('IM-8 流水线兜底：永不静默丢内容');
// ============================================================
(function () {
  var bin = new Uint8Array(300);
  for (var i = 0; i < 300; i++) bin[i] = (i * 37) & 0xFF;
  var r = Import.run({ name: '神秘资料.qqq', bytes: bin }, { vault: false });
  ok('IM-8a 未知二进制不崩、有报警', r.imd.warnings.length > 0, JSON.stringify(r.imd.warnings));
  ok('IM-8b 未知格式有明确告知', r.imd.warnings.join(' ').indexOf('无法识别') >= 0, r.imd.warnings.join(' '));
  ok('IM-8c 未知格式记 unhandled=unknown-format', r.imd.stats.unhandled.some(function (u) { return u.kind === 'unknown-format'; }));
  ok('IM-8c2 二进制垃圾没有被当成正文', ImportMiddle.toPlainText(r.imd).length < 200, String(ImportMiddle.toPlainText(r.imd).length));
})();
(function () {
  var r = Import.run({ name: '老资料.doc', bytes: ImportDecode.toUTF8('老 Word 二进制内容') }, { vault: false });
  includes('IM-8d .doc 明确说本轮不支持并保留原文', r.imd.warnings.join(' '), '不支持');
  ok('IM-8e .doc 也保留了原文', ImportMiddle.toPlainText(r.imd).length > 0);
})();
(function () {
  var r = Import.run({ name: '坏包.docx', bytes: new Uint8Array([1, 2, 3, 4, 5]) }, { vault: false });
  ok('IM-8f 坏 docx 不崩且有报警', r.imd.warnings.length > 0, JSON.stringify(r.imd.warnings));
  ok('IM-8g 坏 docx 仍生成草稿', !!r.draft && !!r.draft.card);
})();

// ============================================================
section('IM-9 草稿与校验');
// ============================================================
(function () {
  var r = Import.run({ name: '边缘之城.docx', bytes: makeDocx() }, { vault: false });
  var card = r.draft.card;
  eq('IM-9a panels 含 2/3/4/5', card.panels.map(function (p) { return p.num; }).sort().join(','), '2,3,4,5');
  ok('IM-9b hud 是数组', Array.isArray(card.hud) && card.hud.length > 0);
  ok('IM-9c attributes 是数组', Array.isArray(card.attributes) && card.attributes.length > 0);
  ok('IM-9d game.title 非空', !!card.game.title && card.game.title.length > 0);
  ok('IM-9e 草稿过了 CardValidator', r.validation.ok === true, JSON.stringify(r.validation));
  ok('IM-9f 有缺口清单（不是假装成品）', r.draft.gaps.length > 0, JSON.stringify(r.draft.gaps.map(function (g) { return g.field; })));
  ok('IM-9g 草稿带来源指纹字段', !!card._import && card._import.draft === true);
})();
(function () {
  var r = Import.run({ name: 'w.md', text: '# 标题\n\n正文内容。' }, { vault: false });
  var before = r.draft.card.game.openingPrompt;
  var res = ImportDraft.applyPatch(r.draft.card, {
    game: { openingPrompt: 'AI 补的开场。', eraRange: ['2000', '2010'] },
    worldbook: { npcs: [{ name: '甲', desc: '测试' }] },
    hud: [{ key: 'hp', name: '体力' }],
    __inject: { hacked: true }
  });
  eq('IM-9h 补丁改了 openingPrompt', r.draft.card.game.openingPrompt, 'AI 补的开场。');
  ok('IM-9i 补丁改了 eraRange', r.draft.card.game.eraRange.join(',') === '2000,2010');
  ok('IM-9j 补丁加了 npc', r.draft.card.worldbook.npcs.length === 1);
  ok('IM-9k 补丁白名单外字段被忽略', r.draft.card.__inject === undefined);
  ok('IM-9l applyPatch 有 applied 记录', res.applied.length >= 3, JSON.stringify(res.applied));
})();
(function () {
  var r = Import.run({ name: 'w.md', text: '# 标题\n\n正文。' }, { vault: false });
  var bad = { schemaVersion: '1.2', cardId: 'x', cardName: 'x', game: { title: '' }, hud: [], sidebar: [], panels: [], attributes: [] };
  var v = ImportDraft.validate(bad);
  ok('IM-9m 空 panels 被判不合法', v.ok === false, JSON.stringify(v));
  var v2 = ImportDraft.validate({});
  ok('IM-9n 缺字段被判不合法', v2.ok === false && /缺少必填字段/.test(v2.msg), JSON.stringify(v2));
  // 落库守卫：把一个本来合法的结果改坏，再确认 commit 拒绝落库
  var broken = Import.run({ name: 'w.md', text: '# 标题\n\n正文。' }, { vault: false });
  broken.draft.card.panels = [];
  broken.validation = ImportDraft.validate(broken.draft.card);
  var committed = Import.commit(broken, { save: function () { throw new Error('不该被调用'); } });
  ok('IM-9o 未过校验不许落库', committed.ok === false, JSON.stringify(committed));
  var committed2 = Import.commit(r, { save: function (c) { r._saved = c.cardId; } });
  ok('IM-9p 过校验才允许落库', committed2.ok === true && r._saved === r.draft.card.cardId, JSON.stringify(committed2));
})();
(function () {
  // 默认落库口径：两仓 Storage.getImportedCards() 返回的都是「{cardId: card} 映射」而非数组
  // （曾在这里用 list.push 写错，真机上会直接抛 push is not a function）
  var r2 = Import.run({ name: 'w.md', text: '# 标题\n\n正文。' }, { vault: false });
  var written = null, getter = null;
  var savedStorage = global.Storage;
  global.Storage = {
    getRawImportedCards: function () { getter = 'raw'; return { other: { cardId: 'other' } }; },
    getImportedCards: function () { getter = 'norm'; return { other: { cardId: 'other' } }; },
    setImportedCards: function (o) { written = o; }
  };
  var c = Import.commit(r2, {});
  ok('IM-9s 无 opts.save 时走 Storage 映射口径', c.ok === true && !!written, JSON.stringify(c));
  ok('IM-9t 映射写回不吞掉别的卡', !!(written && written.other && written[r2.draft.card.cardId]), written ? Object.keys(written).join(',') : 'null');
  ok('IM-9u 优先用 getRawImportedCards（不顺手改写别的卡）', getter === 'raw', String(getter));
  if (savedStorage === undefined) delete global.Storage; else global.Storage = savedStorage;
})();
(function () {
  var prompts = ImportDraft.buildPrompt(
    Import.run({ name: 'w.md', text: '# 标题\n\n资料正文。' }, { vault: false }).imd,
    { gaps: [{ field: 'game.openingPrompt', why: '没找到开场', how: '补一段' }] }
  );
  includes('IM-9q AI 提示词含补丁结构说明', prompts, '"worldbook"');
  includes('IM-9r AI 提示词含缺口清单', prompts, 'game.openingPrompt');
  var rp = ImportDraft.buildRepairPrompt({ schemaVersion: '1.2', cardId: 'a', cardName: 'b', game: {}, hud: [], sidebar: [], panels: [], attributes: [] }, { ok: false, msg: 'panels 缺少 num=3' });
  includes('IM-9s 修复提示词转述校验错误', rp, 'panels 缺少 num=3');
})();

// ============================================================
section('IM-10 原件保管库（原文件必须留住）');
// ============================================================
(function () {
  // 造一个内存 VFS 顶替真 VFS
  var store = {};
  global.VFS = {
    writeFile: function (p, s) { store[p] = s; return true; },
    readFile: function (p) { return store[p] === undefined ? null : store[p]; },
    readJSON: function (p) { try { return JSON.parse(store[p]); } catch (e) { return null; } },
    writeJSON: function (p, o) { store[p] = JSON.stringify(o); return true; },
    listAll: function (prefix) {
      var pre = 'vfs:/' + String(prefix).replace(/^vfs:\//, '').replace(/^\//, '');
      if (pre.charAt(pre.length - 1) !== '/') pre += '/';
      var out = [];
      for (var k in store) if (store.hasOwnProperty(k) && k.indexOf(pre) === 0) out.push(k.slice(5));
      return out;
    },
    deleteFile: function (p) { delete store[p]; }
  };

  var src = makeDocx();
  var r = Import.run({ name: '边缘之城.docx', bytes: src }, { vault: true });
  ok('IM-10a 原文件已留存', r.imd.source.retained === true, JSON.stringify(r.imd.source));
  ok('IM-10b 记录了 sha256', !!r.imd.source.sha256 && r.imd.source.sha256.length === 64, String(r.imd.source.sha256));
  var back = ImportVault.readOriginal(r.importId, '边缘之城.docx');
  ok('IM-10c 取回的原文件与输入逐字节相等', !!back && back.length === src.length && ImportDecode.sha256Hex(back) === ImportDecode.sha256Hex(src));
  var mf = ImportVault.get(r.importId);
  ok('IM-10d manifest 有文件记录', !!mf && mf.files.length === 1, JSON.stringify(mf && mf.files));
  ok('IM-10e IMD 快照已存', !!mf && mf.imds.length === 1);
  var imd2 = ImportVault.loadImd(r.importId);
  ok('IM-10f IMD 快照可读回且结构完整', !!imd2 && Array.isArray(imd2.blocks) && imd2.blocks.length > 0);
  ImportVault.linkCard(r.importId, r.draft.card.cardId, {});
  ok('IM-10g 卡带与导入可互相反查', ImportVault.listByCard(r.draft.card.cardId).length === 1);
  ok('IM-10h list() 能列出这次导入', ImportVault.list().length >= 1);
  ok('IM-10i 落库后能反查来源', Import.commit(r, { save: function () {} }).ok === true && ImportVault.listByCard(r.draft.card.cardId).length === 1);
})();

// ============================================================
section('IM-11 多文件与 AI 环节');
// ============================================================
(function () {
  var many = Import.runMany([
    { name: 'a.md', text: '# 甲\n\n甲的内容。' },
    { name: 'b.csv', text: '名称,说明\n剑,锋利\n' },
    { name: 'c.qqq', text: '认不出的纯文本也要留着' }
  ], { perFile: { vault: false } });
  eq('IM-11a 三个文件都出了结果', many.results.length, 3);
  ok('IM-11b 三个文件都有 IMD', many.results.every(function (x) { return !!x.imd; }));
  var txt = ImportReport.toText(many.report);
  includes('IM-11c 汇总报告含三个文件名', txt, 'a.md');
  includes('IM-11d 汇总报告含 b.csv', txt, 'b.csv');
})();
(function () {
  var r = Import.run({ name: 'w.md', text: '# 标题\n\n正文。' }, { vault: false });
  // 假 AI：第 1 轮补开场，第 2 轮（若有）修校验
  var round = 0;
  var fakeChat = function (msgs, opts) {
    round++;
    if (round === 1) {
      return Promise.resolve({ content: '```json\n{"game":{"openingPrompt":"AI 写的开场，你醒来时天还没亮。"},"worldbook":{"npcs":[{"name":"守夜人","desc":"总在门口"}]}}\n```' });
    }
    return Promise.resolve({ content: '{"game":{"openingPrompt":"AI 修正后的开场。"}}' });
  };
  module.exports._promise = Import.enrich(r, { chat: fakeChat, maxRounds: 2 }).then(function (res) {
    ok('IM-11e enrich 跑通', !!res && Array.isArray(res.trace), JSON.stringify(res && res.trace));
    includes('IM-11f AI 补的开场进了草稿', r.draft.card.game.openingPrompt, '天还没亮');
    ok('IM-11g AI 补的 npc 进了草稿', r.draft.card.worldbook.npcs.some(function (n) { return n.name === '守夜人'; }));
    includes('IM-11h 代码围栏被剥掉后仍能解析', r.draft.card.game.openingPrompt, 'AI 写的开场');
    ok('IM-11i 有 trace 记录每轮', r.aiTrace.length >= 1);
  });
})();
(function () {
  var r = Import.run({ name: 'w.md', text: '# 标题\n\n正文。' }, { vault: false });
  var bad = Import.enrich(r, { chat: function () { return Promise.resolve({ content: '这不是 JSON' }); }, maxRounds: 2 });
  module.exports._promise2 = bad.then(function (res) {
    ok('IM-11j AI 不返回 JSON 时不死循环且如实记录', res.trace.length >= 1 && res.trace[0].ok === false, JSON.stringify(res.trace));
  });
})();
(function () {
  var r = Import.run({ name: 'w.md', text: '# 标题\n\n正文。' }, { vault: false });
  module.exports._promise3 = Import.enrich(r, {}).then(function (res) {
    ok('IM-11k 没配 AI 时明确说明而不是假装成功', res.ok === false && /没有提供 chat/.test(res.reason), JSON.stringify(res.reason));
  });
})();

// ============================================================
console.log('\n### 汇总');
Promise.all([
  module.exports._promise || Promise.resolve(),
  module.exports._promise2 || Promise.resolve(),
  module.exports._promise3 || Promise.resolve()
]).then(function () {
  console.log('\nIMPORT_SMOKE: ' + okCount + ' ok, ' + failCount + ' failed');
  process.exit(failCount ? 1 : 0);
}, function (e) {
  console.log('\nIMPORT_SMOKE: 异步部分异常 ' + e.message);
  console.log('\nIMPORT_SMOKE: ' + okCount + ' ok, ' + (failCount + 1) + ' failed');
  process.exit(1);
});

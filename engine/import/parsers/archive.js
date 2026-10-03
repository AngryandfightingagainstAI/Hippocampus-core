// ============================================================
// 导入层 · 压缩包类解析器
// docx（OOXML）/ odt（OpenDocument）/ epub / zip（列成员）
// 全部靠 unzip.js 的纯 JS inflate，无原生依赖。
// ============================================================

// 从 from 处匹配一个「配对完整」的 <name ...>...</name>，正确跨过同名嵌套。
// 返回 { start, end, inner } 或 null。
// 注意：开始标签可能带属性（<text:h text:outline-level="1">），
// 所以必须一路吃到那个 '>'，否则 inner 会带着属性尾巴（"1">正文）。
function openTagEnd(src, tagStart) {
  var gt = src.indexOf('>', tagStart);
  if (gt < 0) return -1;
  return gt + 1;
}

function isSelfClosingTag(src, tagStart, tagEnd) {
  return /\/\s*>$/.test(src.slice(tagStart, tagEnd));
}

function matchElem(src, from, name) {
  var open = new RegExp('<' + name + '(?=[\\s/>])', 'gi');
  var close = new RegExp('</' + name + '\\s*>', 'gi');
  open.lastIndex = from;
  var om = open.exec(src);
  if (!om || om.index !== from) return null;
  var openEnd = openTagEnd(src, om.index);
  if (openEnd < 0) return null;
  if (isSelfClosingTag(src, om.index, openEnd)) return { start: from, end: openEnd, inner: '' };
  var depth = 1, i = openEnd;
  while (depth > 0) {
    open.lastIndex = i; close.lastIndex = i;
    var no = open.exec(src), nc = close.exec(src);
    if (!nc) return { start: from, end: src.length, inner: src.slice(openEnd) };
    if (no && no.index < nc.index) {
      var noEnd = openTagEnd(src, no.index);
      if (noEnd < 0) return { start: from, end: src.length, inner: src.slice(openEnd) };
      if (!isSelfClosingTag(src, no.index, noEnd)) depth++;
      i = noEnd > i ? noEnd : i + 1;
    } else {
      depth--; i = nc.index + nc[0].length;
      if (depth === 0) return { start: from, end: i, inner: src.slice(openEnd, nc.index) };
    }
  }
  return null;
}

// 按出现顺序遍历 src 里所有「顶层」的 <prefix:tag> 元素（嵌套在内部的自动被跳过）
// prefix 可以是单个字符串，也可以是数组（例如 ODT 的 text:* 与 table:table 混在同一层）
function eachTopLevel(src, prefix, tags, cb) {
  var p = Object.prototype.toString.call(prefix) === '[object Array]' ? prefix.join('|') : prefix;
  var re = new RegExp('<(' + p + '):(' + tags.join('|') + ')(?=[\\s/>])', 'gi');
  var i = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (m.index < i) continue;
    var el = matchElem(src, m.index, m[1] + ':' + m[2]);
    if (!el) { i = re.lastIndex; continue; }
    cb(m[2], el, m[1]);
    i = el.end;
    re.lastIndex = el.end;
  }
}

// 记一条「读到了但没并进正文」的内容——导入层的铁律：不许静默丢
function pushUnhandled(imd, kind, count, note, unit) {
  if (!count) return;
  imd.stats.unhandled.push({ kind: kind, count: count, note: note, unit: unit });
}

function xmlUnescape(s) {  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, function (a, h) { var c = parseInt(h, 16); return isFinite(c) ? String.fromCharCode(c) : a; })
    .replace(/&#(\d+);/g, function (a, d) { var c = parseInt(d, 10); return isFinite(c) ? String.fromCharCode(c) : a; })
    .replace(/&amp;/g, '&');
}

// ---------------- DOCX ----------------
function wText(inner) {
  var out = '';
  var re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/gi;
  var m;
  while ((m = re.exec(inner)) !== null) {
    if (m[0].indexOf('<w:t') === 0) out += xmlUnescape(m[1]);
    else if (m[0].indexOf('<w:tab') === 0) out += '\t';
    else out += '\n';
  }
  return out;
}

function wHeadingLevel(pInner) {
  var m = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(pInner);
  if (m) {
    var v = m[1];
    var h = /(?:^|[^0-9])(?:heading|标题|h)\s*([1-6])$/i.exec(v) || /^([1-6])$/.exec(v);
    if (h) return parseInt(h[1], 10);
  }
  var o = /<w:outlineLvl\b[^>]*w:val="(\d+)"/i.exec(pInner);
  if (o) { var n = parseInt(o[1], 10); if (n >= 0 && n <= 5) return n + 1; }
  return 0;
}

function parseDocx(imd, input) {
  var bytes = input.bytes;
  if (!bytes || !bytes.length) { imd.warnings.push('没有拿到 docx 的字节内容（二进制格式必须提供 bytes）'); return; }
  var names;
  try { names = ImportUnzip.list(bytes); }
  catch (e) { imd.warnings.push('docx 解压失败：' + e.message); return; }

  var docEl = null;
  try { docEl = ImportUnzip.readText(bytes, 'word/document.xml'); }
  catch (e) { imd.warnings.push('读取 word/document.xml 失败：' + e.message); }

  if (!docEl || !docEl.text) {
    imd.warnings.push('这个 docx 里没有 word/document.xml（可能不是 Word 文档，或文件已损坏）');
    // 兜底：至少把成员列出来，别让用户觉得啥也没发生
    for (var i = 0; i < names.length; i++) imd.blocks.push(ImportMiddle.kv('zip/' + names[i].name, names[i].uncompressedSize + ' B'));
    pushUnhandled(imd, 'archive', names.length, 'docx 内部成员（未能解析正文）', '个成员');
    return;
  }

  var src = docEl.text;
  var body = null;
  var bm = matchElem(src, src.indexOf('<w:body'), 'w:body');
  if (bm) body = bm.inner;
  if (!body) { body = src; imd.warnings.push('docx 里找不到 <w:body>，已按整篇文档解析'); }

  var images = 0, paraCount = 0, headCount = 0;
  eachTopLevel(body, 'w', ['p', 'tbl'], function (kind, el) {
    if (kind === 'tbl') {
      var headers = [], rows = [];
      eachTopLevel(el.inner, 'w', ['tr'], function (_, tr) {
        var cells = [];
        eachTopLevel(tr.inner, 'w', ['tc'], function (__, tc) {
          cells.push(wText(tc.inner).replace(/\s+/g, ' ').trim());
        });
        if (!headers.length) headers = cells; else rows.push(cells);
      });
      if (headers.length || rows.length) imd.blocks.push(ImportMiddle.table(headers, rows));
      return;
    }
    var inner = el.inner;
    images += (inner.match(/<w:drawing\b|<w:pict\b|<w:object\b|<v:imagedata\b/gi) || []).length;
    var lvl = wHeadingLevel(inner);
    var text = wText(inner).replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
    if (!text.trim()) return;
    if (lvl) { imd.blocks.push(ImportMiddle.heading(lvl, text.replace(/\s+/g, ' ').trim())); headCount++; }
    else { imd.blocks.push(ImportMiddle.paragraph(text)); paraCount++; }
  });

  // 图片：正文里的 drawing + 包内 word/media/*
  var media = names.filter(function (n) { return /^word\/media\//i.test(n.name); });
  var totalImages = Math.max(images, media.length);
  imd.meta.images = totalImages;
  if (totalImages) pushUnhandled(imd, 'image', totalImages, '文档内图片（本轮不解析图片内容）', '张图片');

  // 其他「读得到但没并入正文」的部分——必须报出来
  var extras = names.filter(function (n) {
    return /^word\/(footnotes|endnotes|comments|header\d*|footer\d*)\.xml$/i.test(n.name);
  });
  if (extras.length) {
    pushUnhandled(imd, 'docx-part', extras.length, '页眉/页脚/脚注/批注未并入正文：' + extras.map(function (e) { return e.name.split('/').pop(); }).join('、'), '个部件');
    imd.warnings.push('该文档含 ' + extras.length + ' 个未并入正文的部件（页眉/页脚/脚注/批注），原文已保留');
  }
  var tracked = (src.match(/<w:ins\b|<w:del\b/g) || []).length;
  if (tracked) pushUnhandled(imd, 'docx-revision', tracked, '修订标记（未接受/拒绝，按当前正文提取）', '处');
  if (!imd.blocks.length) {
    imd.warnings.push('docx 正文里没有提取到任何文字（可能整篇都是图片或表格外的对象）');
    pushUnhandled(imd, 'docx-empty', 1, '未提取到文字', '项');
  }
  imd.meta.title = imd.meta.title || (imd.outline.length ? imd.outline[0].title : null);
}

// ---------------- ODT ----------------
var ODT_MIME = 'application/vnd.oasis.opendocument.text';

function odtText(inner) {
  var out = '';
  var re = /<text:(span|s|a)\b[^>]*>([\s\S]*?)<\/text:\1>|<text:tab\s*\/>|<text:line-break\s*\/>|<text:s\b[^>]*\/>|([^<]+)/gi;
  // 简化：直接按标签切，去掉所有标签，保留 tab / 换行 / 多空格
  out = String(inner)
    .replace(/<text:tab\s*\/>/gi, '\t')
    .replace(/<text:line-break\s*\/>/gi, '\n')
    .replace(/<text:s\b[^>]*\/>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return xmlUnescape(out);
}

function parseOdt(imd, input) {
  var bytes = input.bytes;
  if (!bytes || !bytes.length) { imd.warnings.push('没有拿到 odt 的字节内容'); return; }
  var mt = ImportUnzip.readText(bytes, 'mimetype');
  if (!mt || String(mt.text).trim().indexOf(ODT_MIME) !== 0) {
    imd.warnings.push('这个压缩包不是 ODT（mimetype 成员不是 ' + ODT_MIME + '），已按通用压缩包列出成员');
    parseZip(imd, input);
    return;
  }
  var content = null;
  try { content = ImportUnzip.readText(bytes, 'content.xml'); } catch (e) { imd.warnings.push('读取 content.xml 失败：' + e.message); }
  if (!content || !content.text) { imd.warnings.push('ODT 里没有 content.xml'); return; }
  var src = content.text;
  eachTopLevel(src, ['text', 'table'], ['h', 'p', 'list', 'table'], function (kind, el) {
    if (kind === 'table') {
      var headers = [], rows = [];
      eachTopLevel(el.inner, 'table', ['table-row'], function (_, tr) {
        var cells = [];
        eachTopLevel(tr.inner, 'table', ['table-cell'], function (__, tc) { cells.push(odtText(tc.inner).replace(/\s+/g, ' ').trim()); });
        if (!headers.length) headers = cells; else rows.push(cells);
      });
      if (headers.length || rows.length) imd.blocks.push(ImportMiddle.table(headers, rows));
      return;
    }
    if (kind === 'list') {
      var items = [];
      eachTopLevel(el.inner, 'text', ['p'], function (_, p) { items.push(odtText(p.inner).replace(/\s+/g, ' ').trim()); });
      if (items.length) imd.blocks.push(ImportMiddle.list(items, false));
      return;
    }
    var t = odtText(el.inner).replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
    if (!t.trim()) return;
    if (kind === 'h') {
      var lv = /<text:h\b[^>]*text:outline-level="(\d+)"/i.exec(el.start !== undefined ? src.slice(el.start, el.start + 200) : '');
      imd.blocks.push(ImportMiddle.heading(lv ? parseInt(lv[1], 10) : 1, t.replace(/\s+/g, ' ').trim()));
    } else imd.blocks.push(ImportMiddle.paragraph(t));
  });
  var imgs = (src.match(/<draw:(image|frame)\b/gi) || []).length + (ImportUnzip.list(bytes).filter(function (n) { return /^Pictures\//i.test(n.name); }).length);
  if (imgs) { imd.meta.images = imgs; pushUnhandled(imd, 'image', imgs, '文档内图片（本轮不解析图片内容）', '张图片'); }
  if (!imd.blocks.length) imd.warnings.push('ODT 正文里没有提取到任何文字');
}

// ---------------- EPUB ----------------
function parseEpub(imd, input) {
  var bytes = input.bytes;
  if (!bytes || !bytes.length) { imd.warnings.push('没有拿到 epub 的字节内容'); return; }
  var cont = ImportUnzip.readText(bytes, 'META-INF/container.xml');
  if (!cont || !cont.text) { imd.warnings.push('EPUB 缺少 META-INF/container.xml，已按通用压缩包处理'); parseZip(imd, input); return; }
  var rm = /<rootfile\b[^>]*full-path="([^"]+)"/i.exec(cont.text);
  if (!rm) { imd.warnings.push('EPUB 的 container.xml 里找不到 rootfile'); return; }
  var opfPath = rm[1];
  var opf = ImportUnzip.readText(bytes, opfPath);
  if (!opf || !opf.text) { imd.warnings.push('读不到 OPF：' + opfPath); return; }
  var base = opfPath.indexOf('/') >= 0 ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  var manifest = {};
  var itemRe = /<item\b([^>]*)\/?>/gi, im;
  while ((im = itemRe.exec(opf.text)) !== null) {
    var id = /id="([^"]*)"/i.exec(im[1]), href = /href="([^"]*)"/i.exec(im[1]), mt = /media-type="([^"]*)"/i.exec(im[1]);
    if (id && href) manifest[id[1]] = { href: href[1], mediaType: mt ? mt[1] : '' };
  }
  var title = null;
  var tm = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf.text);
  if (tm) title = xmlUnescape(tm[1]).trim();

  var spine = [];
  var spineBlock = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opf.text);
  if (spineBlock) {
    var refRe = /<itemref\b([^>]*)\/?>/gi, rm2;
    while ((rm2 = refRe.exec(spineBlock[1])) !== null) {
      var idref = /idref="([^"]*)"/i.exec(rm2[1]);
      if (idref && manifest[idref[1]]) spine.push(manifest[idref[1]]);
    }
  }
  if (!spine.length) {
    imd.warnings.push('EPUB 的 spine 是空的，已退化为按 manifest 顺序解析');
    for (var k in manifest) if (manifest.hasOwnProperty(k) && /xhtml|html/i.test(manifest[k].mediaType)) spine.push(manifest[k]);
  }

  var okChapters = 0, missing = [];
  for (var i = 0; i < spine.length; i++) {
    var rel = decodeURIComponent(spine[i].href.split('#')[0]);
    var full = (base + rel).replace(/^\.\//, '');
    var ch = null;
    try { ch = ImportUnzip.readText(bytes, full); } catch (e) { /* 记下来 */ }
    if (!ch || !ch.text) { missing.push(full); continue; }
    imd.blocks.push(ImportMiddle.pagebreak(i + 1));
    var r = resolveHtmlExtractor().extract(ch.text);
    if (r.title) imd.blocks.push(ImportMiddle.heading(1, r.title));
    for (var b = 0; b < r.blocks.length; b++) imd.blocks.push(r.blocks[b]);
    okChapters++;
  }
  var all = ImportUnzip.list(bytes);
  var imgs = all.filter(function (n) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(n.name); }).length;
  if (imgs) { imd.meta.images = imgs; pushUnhandled(imd, 'image', imgs, '电子书内图片（本轮不解析）', '张图片'); }
  var css = all.filter(function (n) { return /\.css$/i.test(n.name); }).length;
  if (css) pushUnhandled(imd, 'epub-css', css, '样式表（不影响文字提取）', '个样式表');
  if (missing.length) {
    imd.warnings.push('EPUB 有 ' + missing.length + ' 章读不出来：' + missing.slice(0, 3).join('、') + (missing.length > 3 ? ' 等' : ''));
    pushUnhandled(imd, 'epub-chapter', missing.length, 'spine 里读不到的章节', '章');
  }
  if (!okChapters) imd.warnings.push('EPUB 一章都没解析出来');
  imd.meta.title = title || imd.meta.title;
  imd.meta.pages = spine.length;
}

// epub 章节要复用 HTML 解析器；两种加载方式（全局 / require 透出）都认
function resolveHtmlExtractor() {
  if (typeof ImportHtml !== 'undefined' && ImportHtml && ImportHtml.extract) return ImportHtml;
  if (typeof ImportParseTextlike !== 'undefined' && ImportParseTextlike && ImportParseTextlike.ImportHtml) return ImportParseTextlike.ImportHtml;
  if (typeof window !== 'undefined' && window.ImportHtml && window.ImportHtml.extract) return window.ImportHtml;
  throw new Error('HTML 解析器（ImportHtml）没有加载，无法解析 epub 章节');
}

// ---------------- 通用 ZIP ----------------
function parseZip(imd, input) {
  var bytes = input.bytes;
  if (!bytes || !bytes.length) { imd.warnings.push('没有拿到压缩包的字节内容'); return; }
  var list;
  try { list = ImportUnzip.list(bytes); } catch (e) { imd.warnings.push('不是有效的 ZIP：' + e.message); return; }
  var files = list.filter(function (e) { return !e.isDir; });
  imd.blocks.push(ImportMiddle.kv('zip/成员数', files.length));
  var total = 0, enc = 0;
  for (var i = 0; i < files.length; i++) {
    total += files[i].uncompressedSize || 0;
    if (files[i].encrypted) enc++;
    imd.blocks.push(ImportMiddle.kv('zip/' + files[i].name, files[i].uncompressedSize + ' B'));
  }
  var byExt = {};
  for (var j = 0; j < files.length; j++) {
    var e2 = /\.([A-Za-z0-9]+)$/.exec(files[j].name);
    var k = e2 ? e2[1].toLowerCase() : '(无扩展名)';
    byExt[k] = (byExt[k] || 0) + 1;
  }
  pushUnhandled(imd, 'archive', files.length, '压缩包内文件（本轮只列清单，未逐个导入）', '个成员');
  imd.warnings.push('这是压缩包：已列出 ' + files.length + ' 个成员（共 ' + Math.round(total / 1024) + ' KB），'
    + (enc ? ('其中 ' + enc + ' 个已加密；') : '') + '后续版本会支持「逐个挑选导入」。类型分布：'
    + Object.keys(byExt).map(function (k) { return k + '×' + byExt[k]; }).join('、'));
}

var ImportParseArchive = {
  docx: parseDocx,
  odt: parseOdt,
  epub: parseEpub,
  zip: parseZip,
  _matchElem: matchElem,
  _eachTopLevel: eachTopLevel,
  _wText: wText
};

if (typeof window !== 'undefined') window.ImportParseArchive = ImportParseArchive;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportParseArchive;

// ============================================================
// 导入层 · 纯文本类解析器
// text / markdown / json / html / csv / xml / yaml / rtf —— 输入是字符串，
// 输出是一串中间格式块。
//
// 共同纪律（对应「不静默丢内容」）：
//   · 任何解析失败都不 return 空，而是落一个 raw 块 + 一条 warning；
//   · 认得出但本轮没处理的东西（图片、嵌入对象、注释里的结构），
//     都要往 imd.stats.unhandled 里加一条带数量的记录。
// ============================================================

function pushUnhandled(imd, kind, count, note, unit) {
  if (!count) return;
  imd.stats.unhandled.push({ kind: kind, count: count, note: note || '', unit: unit || null });
}

// ---------------- 纯文本 ----------------
var TS_RE = /^\s*(\[\d{1,2}:\d{2}(:\d{2})?\]|\d{4}[-/]\d{1,2}[-/]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?|\d{1,2}:\d{2}(:\d{2})?)/;
var SPEAKER_RE = /^\s*[^：:\n]{1,16}[：:]\s?\S/;

function looksLikeRecordLog(lines) {
  var checked = 0, hit = 0;
  for (var i = 0; i < lines.length && checked < 200; i++) {
    var l = lines[i].trim();
    if (!l) continue;
    checked++;
    if (TS_RE.test(l) || SPEAKER_RE.test(l)) hit++;
  }
  return checked >= 8 && hit / checked >= 0.5;
}

function splitParagraphs(text) {
  var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  var groups = [], cur = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      if (cur.length) { groups.push(cur); cur = []; }
    } else cur.push(lines[i]);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function parseText(imd, input) {
  var text = String(input.text == null ? '' : input.text);
  var lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (looksLikeRecordLog(lines)) {
    // 逐行成块（聊天记录 / 运行日志），空行跳过但计数
    var blanks = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.trim() === '') { blanks++; continue; }
      imd.blocks.push(ImportMiddle.paragraph(l));
    }
    if (blanks) imd.warnings.push('按「逐行记录」模式解析，忽略了 ' + blanks + ' 个空行（原文保留在 raw 中）');
    imd.meta.title = imd.meta.title || firstMeaningfulLine(lines);
    return;
  }

  var groups = splitParagraphs(text);
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    if (grp.length === 1) imd.blocks.push(ImportMiddle.paragraph(grp[0]));
    else {
      // 同一段里的多行：保留换行（原文不改写），超过 60 行时切块避免单块过大
      for (var s = 0; s < grp.length; s += 60) {
        imd.blocks.push(ImportMiddle.paragraph(grp.slice(s, s + 60).join('\n')));
      }
    }
  }
  imd.meta.title = imd.meta.title || firstMeaningfulLine(lines);
}

function firstMeaningfulLine(lines) {
  for (var i = 0; i < lines.length && i < 40; i++) {
    var t = lines[i].trim();
    if (t) return t.length > 60 ? t.slice(0, 60) : t;
  }
  return null;
}

// ---------------- Markdown ----------------
function parseMarkdown(imd, input) {
  var lines = String(input.text || '').replace(/\r\n?/g, '\n').split('\n');
  var i = 0;
  var para = [];
  var inFence = false, fenceLang = null, fenceBuf = [];

  function flushPara() {
    if (!para.length) return;
    imd.blocks.push(ImportMiddle.paragraph(para.join('\n')));
    para = [];
  }

  while (i < lines.length) {
    var line = lines[i];

    var fence = /^\s*(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (!inFence && fence) {
      flushPara(); inFence = true; fenceLang = fence[2] || null; fenceBuf = []; i++; continue;
    }
    if (inFence) {
      if (/^\s*(```|~~~)\s*$/.test(line)) {
        imd.blocks.push(ImportMiddle.code(fenceBuf.join('\n'), fenceLang));
        inFence = false; fenceBuf = []; i++; continue;
      }
      fenceBuf.push(line); i++; continue;
    }

    var h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); imd.blocks.push(ImportMiddle.heading(h[1].length, h[2].trim())); i++; continue; }

    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { flushPara(); i++; continue; } // 分隔线

    // 表格：| a | b |  + | --- | --- |
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara();
      var headers = splitMdRow(line);
      i += 2;
      var rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitMdRow(lines[i])); i++; }
      imd.blocks.push(ImportMiddle.table(headers, rows));
      continue;
    }

    var ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    var ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      var ordered = !!ol;
      var items = [];
      while (i < lines.length) {
        var m1 = /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        var m2 = /^\s*(\d+)[.)]\s+(.*)$/.exec(lines[i]);
        if (ordered && m2) { items.push(m2[2].trim()); i++; continue; }
        if (!ordered && m1) { items.push(m1[1].trim()); i++; continue; }
        break;
      }
      imd.blocks.push(ImportMiddle.list(items, ordered));
      continue;
    }

    var quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) { flushPara(); var qbuf = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { qbuf.push(lines[i].replace(/^\s*>\s?/, '')); i++; } imd.blocks.push(ImportMiddle.paragraph(qbuf.join('\n'))); continue; }

    if (line.trim() === '') { flushPara(); i++; continue; }

    para.push(line); i++;
  }
  if (inFence && fenceBuf.length) {
    imd.blocks.push(ImportMiddle.code(fenceBuf.join('\n'), fenceLang));
    imd.warnings.push('文件结束时代码块未闭合，已按未闭合内容原样收录');
  }
  flushPara();

  // 未处理的 Markdown 语法（只报数，不丢原文——原文都在 raw 里）
  var joined = lines.join('\n');
  var imgs = (joined.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
  var links = (joined.match(/(?<!!)\[[^\]]*\]\([^)]*\)/g) || []).length;
  if (imgs) pushUnhandled(imd, 'image', imgs, 'Markdown 图片引用（本轮不下载不外链）', '个图片引用');
  if (links) pushUnhandled(imd, 'link', links, 'Markdown 链接（已保留文字，未抓取目标）', '个链接');
  imd.meta.title = imd.meta.title || (imd.outline.length ? imd.outline[0].title : null);
}

function splitMdRow(line) {
  var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return s.split('|').map(function (c) { return c.trim(); });
}

// ---------------- JSON ----------------
function parseJson(imd, input) {
  var raw = String(input.text || '');
  var cleaned = raw.replace(/^\uFEFF/, '');
  var data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    imd.warnings.push('JSON 解析失败：' + e.message + '——已按纯文本收录，未做任何猜测');
    parseText(imd, input);
    return;
  }
  var count = 0;
  function walk(v, path, depth) {
    if (depth > 12) { count++; imd.blocks.push(ImportMiddle.kv(path, '(嵌套过深，已截断)')); return; }
    if (v === null || typeof v !== 'object') { imd.blocks.push(ImportMiddle.kv(path, v)); count++; return; }
    if (Array.isArray(v)) {
      if (!v.length) { imd.blocks.push(ImportMiddle.kv(path, [])); count++; return; }
      var allPrim = v.every(function (x) { return x === null || typeof x !== 'object'; });
      if (allPrim) { imd.blocks.push(ImportMiddle.kv(path, v)); count++; return; }
      for (var i = 0; i < v.length; i++) walk(v[i], path + '[' + i + ']', depth + 1);
      return;
    }
    var keys = Object.keys(v);
    if (!keys.length) { imd.blocks.push(ImportMiddle.kv(path, {})); count++; return; }
    for (var k = 0; k < keys.length; k++) walk(v[keys[k]], path ? (path + '.' + keys[k]) : keys[k], depth + 1);
  }
  walk(data, '', 0);
  if (count > 4000) pushUnhandled(imd, 'kv', count - 4000, '字段过多，前 4000 条已收录，其余在原文中', '个字段');
  if (typeof data === 'object' && data && !Array.isArray(data)) {
    imd.meta.title = data.cardName || data.name || data.title || (data.game && data.game.title) || null;
  }
}

// ---------------- CSV / TSV ----------------
function parseDelimited(text, delim) {
  var rows = [], row = [], cell = '', inQ = false;
  var s = String(text).replace(/\r\n?/g, '\n');
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (s.charAt(i + 1) === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  // 去掉完全空的行
  return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); });
}

function parseCsv(imd, input, delim) {
  var text = String(input.text || '');
  var d = delim || (input.ext === 'tsv' || input.ext === 'tab' ? '\t' : (detectDelimiter(text) || ','));
  var rows = parseDelimited(text, d);
  if (!rows.length) { imd.warnings.push('表格为空'); return; }
  var headers = rows[0];
  var body = rows.slice(1);
  var width = headers.length;
  var ragged = 0;
  for (var i = 0; i < body.length; i++) if (body[i].length !== width) ragged++;
  imd.blocks.push(ImportMiddle.table(headers, body, ragged ? ('有 ' + ragged + ' 行字段数与表头不一致，已按原样保留') : null));
  if (ragged) imd.warnings.push('表格有 ' + ragged + ' 行字段数与表头不一致（未做补齐/截断，原文照录）');
  imd.meta.title = imd.meta.title || (headers[0] ? ('表格：' + headers[0]) : null);
}

function detectDelimiter(text) {
  var head = String(text).split('\n').slice(0, 5).join('\n');
  var tabs = (head.match(/\t/g) || []).length;
  var commas = (head.match(/,/g) || []).length;
  var semis = (head.match(/;/g) || []).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (commas > semis && commas > 0) return ',';
  if (semis > 0) return ';';
  return null;
}

// ---------------- HTML ----------------
var HTML_DROP = /^(script|style|noscript|nav|header|footer|aside|svg|iframe|form|template)$/i;
var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', copy: '\u00A9', reg: '\u00AE', trade: '\u2122', laquo: '\u00AB', raquo: '\u00BB', ldquo: '\u201C', rdquo: '\u201D', lsquo: '\u2018', rsquo: '\u2019', middot: '\u00B7', times: '\u00D7', divide: '\u00F7', deg: '\u00B0', euro: '\u20AC', pound: '\u00A3', yen: '\u00A5', sect: '\u00A7', para: '\u00B6', dagger: '\u2020', bull: '\u2022', prime: '\u2032', Prime: '\u2033', larr: '\u2190', rarr: '\u2192', harr: '\u2194', infin: '\u221E', ne: '\u2260', le: '\u2264', ge: '\u2265' };

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (all, body) {
    if (body.charAt(0) === '#') {
      var code = body.charAt(1) === 'x' || body.charAt(1) === 'X'
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!isFinite(code) || code < 0 || code > 0x10FFFF) return all;
      if (code > 0xFFFF) { code -= 0x10000; return String.fromCharCode(0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF)); }
      return String.fromCharCode(code);
    }
    var v = ENTITIES[body];
    return v === undefined ? all : v;
  });
}

var ImportHtml = {
  decodeEntities: decodeEntities,
  // 从 html 文本里抽出块。返回 { blocks, dropped, title }
  extract: function (html) {
    var blocks = [], dropped = { script: 0, style: 0, nav: 0, comment: 0 };
    var src = String(html).replace(/<!--[\s\S]*?-->/g, function () { dropped.comment++; return ' '; });
    src = src.replace(/<(script|style|nav|header|footer|aside|noscript|svg|iframe|form|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      function (all, tag) { var k = String(tag).toLowerCase(); if (dropped[k] === undefined) dropped[k] = 0; dropped[k]++; return ' '; });
    src = src.replace(/<(script|style|nav|header|footer|aside|noscript|svg|iframe|form|template)\b[^>]*\/?>/gi, ' ');

    var title = null;
    var tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src);
    if (tm) { title = decodeEntities(tm[1]).trim(); src = src.replace(tm[0], ' '); }

    var re = /<(h[1-6]|p|li|tr|td|th|blockquote|pre|div|section|article|br)\b[^>]*>|<\/(h[1-6]|p|li|tr|td|th|blockquote|pre|div|section|article)>/gi;
    var pos = 0, lastIndex = 0, m, counter = { h: [0, 0, 0, 0, 0, 0], p: 0, li: 0, tr: 0, bq: 0, pre: 0 };
    var buffer = '', curKind = null;
    var tableRows = null, tableRow = null, tableCells = null;

    function flushText() {
      var t = decodeEntities(buffer).replace(/[ \t\u00A0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
      buffer = '';
      if (!t) return;
      if (curKind === 'li') { blocks.push(ImportMiddle.list([t], false)); counter.li++; }
      else if (curKind === 'pre') { blocks.push(ImportMiddle.code(t)); counter.pre++; }
      else { blocks.push(ImportMiddle.paragraph(t)); if (curKind === 'p') counter.p++; }
    }

    while ((m = re.exec(src)) !== null) {
      var text = src.slice(lastIndex, m.index);
      if (text) buffer += text;

      var open = /^<(h([1-6])|p|li|tr|td|th|blockquote|pre|div|section|article)\b/i.exec(m[0]);
      var close = /^<\/(h([1-6])|p|li|tr|td|th|blockquote|pre|div|section|article)>$/i.exec(m[0]);
      var isBr = /^<br\b/i.test(m[0]);

      if (isBr) { buffer += '\n'; lastIndex = re.lastIndex; continue; }

      if (open) {
        flushText();
        var tag = (open[2] ? 'h' : open[1]).toLowerCase();
        if (tag === 'tr') {
          if (tableRows) { if (tableRow) tableRows.push(tableRow); }
          else { tableRows = []; }
          tableRow = []; tableCells = 0;
        }
        curKind = tag === 'blockquote' ? 'bq' : tag;
      } else if (close) {
        var ctag = (close[2] ? 'h' : close[1]).toLowerCase();
        if (ctag === 'tr') {
          flushText();
          if (tableRows && tableRow) { tableRows.push(tableRow); }
          tableRow = null;
        } else if (ctag === 'td' || ctag === 'th') {
          var cell = decodeEntities(buffer).replace(/[ \t\u00A0]+/g, ' ').replace(/\n+/g, ' ').trim();
          buffer = '';
          if (tableRow) tableRow.push(cell);
        } else if (ctag === 'div' || ctag === 'section' || ctag === 'article') {
          flushText(); curKind = null;
        } else {
          if (ctag.indexOf('h') === 0 && ctag.length === 2) {
            var ht = decodeEntities(buffer).replace(/\s+/g, ' ').trim(); buffer = '';
            if (ht) { blocks.push(ImportMiddle.heading(parseInt(ctag.charAt(1), 10), ht)); counter.h[parseInt(ctag.charAt(1), 10) - 1]++; }
          } else flushText();
          curKind = null;
        }
      }
      lastIndex = re.lastIndex;
    }

    // 表格收尾
    if (tableRows && tableRows.length) {
      var headers = tableRows[0], rows = tableRows.slice(1);
      blocks.push(ImportMiddle.table(headers, rows));
    } else if (tableRow && tableRow.length) {
      blocks.push(ImportMiddle.table(tableRow, []));
    }

    var tail = src.slice(lastIndex);
    if (tail) buffer += tail;
    flushText();

    return { blocks: blocks, dropped: dropped, title: title };
  }
};

function parseHtml(imd, input) {
  var html = String(input.text || '');
  var r = ImportHtml.extract(html);
  for (var i = 0; i < r.blocks.length; i++) imd.blocks.push(r.blocks[i]);
  imd.meta.title = r.title || null;
  var d = r.dropped;
  var dropped = (d.script || 0) + (d.style || 0) + (d.nav || 0) + (d.comment || 0);
  if (dropped) pushUnhandled(imd, 'dropped', dropped, '脚本/样式/导航/注释已过滤（原文件保留）', '处');
  var imgs = (html.match(/<img\b/gi) || []).length;
  if (imgs) pushUnhandled(imd, 'image', imgs, '网页图片（本轮不下载）', '张图片');
  var links = (html.match(/<a\b/gi) || []).length;
  if (links) pushUnhandled(imd, 'link', links, '链接（文字已保留，目标未抓取）', '个链接');
  // 无结构兜底：整页只剩一段就别谎称有结构
  if (!r.blocks.length) {
    var plain = decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (plain) { imd.blocks.push(ImportMiddle.paragraph(plain)); imd.warnings.push('这份 HTML 没有可识别的结构标签，已按纯文本兜底提取'); }
    else imd.warnings.push('这份 HTML 提取后为空');
  }
}

// ---------------- XML ----------------
function parseXml(imd, input) {
  var src = String(input.text || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  var stack = [], path = [], root = { name: '#root', children: [], text: '' };
  var cur = root;
  var re = /<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\/([A-Za-z_][\w.:-]*)>/g;
  var m, last = 0, malformed = 0;
  while ((m = re.exec(src)) !== null) {
    var text = src.slice(last, m.index);
    if (text.trim()) cur.text += text;
    last = re.lastIndex;
    if (m[4]) {
      if (stack.length && stack[stack.length - 1].name === m[4]) { cur = stack.pop(); }
      else { malformed++; }
    } else {
      var node = { name: m[1], children: [], text: '', attrs: parseAttrs(m[2]) };
      cur.children.push(node);
      if (!m[3]) { stack.push(cur); cur = node; }
    }
  }
  if (stack.length) malformed += stack.length;
  if (malformed) imd.warnings.push('XML 标签配对数不齐（' + malformed + ' 处），已尽力解析，原文完整保留在 raw 中');

  function emit(node, p, depth) {
    if (depth > 10) { imd.blocks.push(ImportMiddle.kv(p, '(嵌套过深，已截断)')); return; }
    var t = node.text.replace(/\s+/g, ' ').trim();
    var hasKids = node.children.length > 0;
    if (!hasKids) { if (t || node.attrs) imd.blocks.push(ImportMiddle.kv(p, t || null)); return; }
    if (t) imd.blocks.push(ImportMiddle.kv(p + '/#text', t));
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i];
      emit(c, p ? (p + '.' + c.name) : c.name, depth + 1);
    }
  }
  for (var i = 0; i < root.children.length; i++) emit(root.children[i], root.children[i].name, 0);
  if (!imd.blocks.length) {
    var plain = decodeEntities(src.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (plain) { imd.blocks.push(ImportMiddle.paragraph(plain)); imd.warnings.push('XML 没有可提取的结构，已按纯文本兜底'); }
  }
}

function parseAttrs(s) {
  var out = {};
  var re = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m;
  while ((m = re.exec(s || '')) !== null) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return out;
}

// ---------------- YAML（子集）----------------
function parseYaml(imd, input) {
  var text = String(input.text || '').replace(/\r\n?/g, '\n');
  if (/^---\s*$/m.test(text) && (text.match(/^---\s*$/gm) || []).length > 1) {
    imd.warnings.push('该 YAML 含多文档分隔符（--- 出现多次），本轮只取第一份文档，其余原文保留在 raw 中');
    text = text.split(/^---\s*$/m).filter(function (s) { return s.trim(); })[0] || '';
  }
  var lines = text.split('\n');
  var stack = []; // {indent, path}
  var unsupported = { anchor: 0, tag: 0, complex: 0 };

  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    var indent = raw.length - raw.replace(/^\s*/, '').length;
    var body = raw.trim();

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    var prefix = stack.length ? stack[stack.length - 1].path : '';

    if (/^[&*]/.test(body)) { unsupported.anchor++; continue; }
    if (/^!/.test(body)) { unsupported.tag++; continue; }

    var listM = /^-\s*(.*)$/.exec(body);
    if (listM) {
      var rest = listM[1];
      var km = /^([^:\s][^:]*):\s*(.*)$/.exec(rest);
      if (km) {
        var kpath = prefix ? (prefix + '.' + km[1].trim()) : km[1].trim();
        if (km[2].trim() === '') {
          stack.push({ indent: indent + 1, path: kpath });
          imd.blocks.push(ImportMiddle.kv(kpath, '(嵌套)'));
        } else imd.blocks.push(ImportMiddle.kv(kpath, stripScalar(km[2])));
      } else {
        imd.blocks.push(ImportMiddle.kv(prefix ? (prefix + '[]') : '[]', stripScalar(rest)));
      }
      continue;
    }

    var kv = /^([^:]+):\s*(.*)$/.exec(body);
    if (!kv) { unsupported.complex++; continue; }
    var key = kv[1].trim();
    var val = kv[2];
    var full = prefix ? (prefix + '.' + key) : key;
    if (val === '' || val === '|' || val === '>' || /^[|>][-+]?$/.test(val)) {
      if (val === '' ) { stack.push({ indent: indent, path: full }); imd.blocks.push(ImportMiddle.kv(full, '(嵌套)')); continue; }
      // 块标量
      var buf = [], baseIndent = -1;
      var j = i + 1;
      for (; j < lines.length; j++) {
        var l2 = lines[j];
        if (!l2.trim()) { buf.push(''); continue; }
        var ind2 = l2.length - l2.replace(/^\s*/, '').length;
        if (baseIndent < 0) baseIndent = ind2;
        if (ind2 < baseIndent || ind2 <= indent) break;
        buf.push(l2.slice(baseIndent));
      }
      var joined = val.charAt(0) === '>' ? buf.join(' ').replace(/\s+/g, ' ').trim() : buf.join('\n').replace(/\n+$/, '');
      imd.blocks.push(ImportMiddle.kv(full, joined));
      i = j - 1;
      continue;
    }
    imd.blocks.push(ImportMiddle.kv(full, stripScalar(val)));
  }
  if (!imd.blocks.length) {
    imd.warnings.push('YAML 未解析出任何键值（可能是锚点/别名/复杂结构），已按纯文本兜底');
    parseText(imd, input);
    return;
  }
  if (unsupported.anchor) pushUnhandled(imd, 'yaml-anchor', unsupported.anchor, 'YAML 锚点/别名（本轮不解引用）', '处');
  if (unsupported.tag) pushUnhandled(imd, 'yaml-tag', unsupported.tag, 'YAML 标签', '处');
  if (unsupported.complex) pushUnhandled(imd, 'yaml-complex', unsupported.complex, '未识别的 YAML 行（原文保留）', '行');
}

function stripScalar(v) {
  var s = String(v == null ? '' : v).replace(/\s+#.*$/, '').trim();
  if (s === 'null' || s === '~' || s === '') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') || (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
    var q = s.charAt(0);
    s = s.slice(1, -1);
    if (q === '"') s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return s;
  }
  if (s.charAt(0) === '[' || s.charAt(0) === '{') {
    try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) { return s; }
  }
  return s;
}

// ---------------- RTF ----------------
function parseRtf(imd, input) {
  var src = String(input.text || '');
  var out = [];
  var depth = 0;
  var i = 0;
  var skippedGroups = 0;
  var unicodeFallbacks = 0;
  var SKIP_DESTS = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'filetbl', 'revtbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl'];

  function pushText(s) { if (s) out.push(s); }

  while (i < src.length) {
    var c = src.charAt(i);
    if (c === '\\') {
      var rest = src.slice(i);
      var m = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(rest);
      if (m) {
        var word = m[1];
        if (word === 'par' || word === 'line') pushText('\n');
        else if (word === 'tab') pushText('\t');
        else if (word === 'u') {
          var code = parseInt(m[2] || '0', 10);
          if (code < 0) code += 65536;
          pushText(String.fromCharCode(code));
          i += m[0].length;
          if (src.charAt(i) === '?') i++; // \uN? 的替换字符
          else if (/^\\uc\d+/.test(src.slice(i))) { /* 少见，忽略 */ }
          unicodeFallbacks++;
          continue;
        } else if (SKIP_DESTS.indexOf(word) >= 0) {
          // 整组丢弃：找到与之配对的 { }
          var j = i, d2 = 0, started = false;
          while (j < src.length) {
            if (src.charAt(j) === '{') { d2++; started = true; }
            else if (src.charAt(j) === '}') { d2--; if (started && d2 === 0) { j++; break; } }
            j++;
          }
          skippedGroups++;
          i = j;
          continue;
        }
        i += m[0].length;
        continue;
      }
      var esc = rest.charAt(1);
      if (esc === '\\' || esc === '{' || esc === '}') { pushText(esc); i += 2; continue; }
      if (esc === "'") { // \'hh = 单字节
        var hex = rest.slice(2, 4);
        var b = parseInt(hex, 16);
        if (isFinite(b)) pushText(String.fromCharCode(b));
        i += 4; continue;
      }
      if (esc === '*') { i += 2; continue; }
      if (esc === '\n' || esc === '\r') { i += 2; continue; }
      i += 2; continue;
    }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (c === '\r' || c === '\n') { i++; continue; }
    pushText(c); i++;
  }

  var text = out.join('').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) {
    imd.warnings.push('RTF 剥离控制字后没有剩任何文本（可能整篇都是表格/图片），原文件已保留');
    return;
  }
  var lines = text.split('\n');
  var para = [];
  for (var k = 0; k < lines.length; k++) {
    if (lines[k].trim() === '') { if (para.length) { imd.blocks.push(ImportMiddle.paragraph(para.join('\n'))); para = []; } }
    else para.push(lines[k]);
  }
  if (para.length) imd.blocks.push(ImportMiddle.paragraph(para.join('\n')));
  imd.meta.title = firstMeaningfulLine(lines);
  if (skippedGroups) pushUnhandled(imd, 'rtf-dest', skippedGroups, '字体表/颜色表/图片等 RTF 目标组已跳过', '组');
  if (unicodeFallbacks) pushUnhandled(imd, 'rtf-unicode', unicodeFallbacks, '\\uN 转义已按 Unicode 还原（部分源文件本身含 ? 替换字符）', '处');
}

var ImportParseTextlike = {
  text: parseText,
  markdown: parseMarkdown,
  json: parseJson,
  html: parseHtml,
  csv: parseCsv,
  xml: parseXml,
  yaml: parseYaml,
  rtf: parseRtf,
  _splitParagraphs: splitParagraphs,
  _parseDelimited: parseDelimited,
  _detectDelimiter: detectDelimiter,
  ImportHtml: ImportHtml,
  ImportMiddle_ref: null
};

// archive.js (epub) 需要 ImportHtml，这里一并透出
if (typeof window !== 'undefined') { window.ImportParseTextlike = ImportParseTextlike; window.ImportHtml = ImportHtml; }
if (typeof module !== 'undefined' && module.exports) module.exports = ImportParseTextlike;

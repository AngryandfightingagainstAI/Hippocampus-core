// ============================================================
// P35 · 卡带 JSON 解析/定位（A 类，纯 JS，零 React / 零 RN / 零 DOM）
// RN 独有。消费方：rn/screens/CardsScreen.js 的「诊断并导入」。
//
// 为什么要有它（真机两次踩坑）：
//   1. H2-R4 的清洗把**所有**弯引号 “ ” 一律换成 " —— 但卡带的字符串**内容**里本来就会
//      出现中文引号（例："desc": "喊了一声“出发”，就上了船"）。一换就把字符串提前闭合，
//      剩下的中文落到结构位置，Hermes 报 `JSON parse error: Unexpected character: 出`。
//      桌面 engine/ui_cards.js 没有这道清洗，所以同一份卡带在桌面导得进 —— 真凶是这道清洗。
//      ⇒ 现在的口径：**先原样解析**（只去 BOM / 零宽），失败才把弯引号当「结构引号」兜底。
//   2. Hermes 的 JSON.parse 报错不带 position，界面只能贴开头 40 字，于是显示成
//      「第 0 字符附近：{ "schemaVersion": "1.2" ...」——定位不到真凶。
//      ⇒ 两次都失败时自己走一遍扫描，给出真实偏移 + 前后上下文 + 全文长度 + 末尾片段 + 可能原因。
// ============================================================

'use strict';

// 粘贴噪声：BOM / 零宽字符（真机实测粘贴过程会带进来，去掉不影响任何合法内容）
function stripPasteNoise(s) {
  return String(s == null ? '' : s)
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

// 把「结构引号被粘贴改写成中文弯引号」还原（**只作为兜底**，见文件头说明）
function toAsciiQuotes(s) {
  return String(s).replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function tryParse(s) {
  try { return { ok: true, card: JSON.parse(s) }; }
  catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

function mk(s, pos, ch, hint) {
  return {
    pos: pos,
    char: ch,
    length: s.length,
    hint: hint,
    head: s.slice(0, 40),
    around: s.slice(Math.max(0, pos - 40), pos + 40),
    tail: s.slice(Math.max(0, s.length - 40))
  };
}

// 扫描出第一处结构性异常。能解析返回 null。
function locateJsonError(text) {
  var s = String(text == null ? '' : text);
  if (tryParse(s).ok) return null;
  var len = s.length;
  var inStr = false;
  var esc = false;
  for (var i = 0; i < len; i++) {
    var ch = s.charAt(i);
    var code = s.charCodeAt(i);
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = false; continue; }
      if (code < 0x20) {
        return mk(s, i, ch, '字符串里出现了裸控制字符（换行 / 制表等）：JSON 里必须写成 \\n、\\t，或者把这段里的换行删掉');
      }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\uFEFF') continue;
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') continue;
    if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9') || ch === 'e' || ch === 'E') continue;
    if (s.substr(i, 4) === 'true') { i += 3; continue; }
    if (s.substr(i, 5) === 'false') { i += 4; continue; }
    if (s.substr(i, 4) === 'null') { i += 3; continue; }
    return mk(s, i, ch,
      '这里出现了不该在结构位置的字符：多半是上一段字符串里的英文双引号没有转义'
      + '（值里写 " 会提前闭合字符串，应写成 \\" 或改用中文引号「」）');
  }
  return mk(s, len, '',
    inStr ? '字符串没有闭合（引号数量不成对）：粘贴时末尾可能被截断了'
          : '结构不完整：常见于粘贴被截断（末尾不是 }）');
}

// 卡带 JSON 的解析入口：{ ok:true, card, usedFallback, text } | { ok:false, message, loc, text }
function parseCardJson(raw) {
  var base = stripPasteNoise(raw);
  if (!String(base).trim()) return { ok: false, message: '内容为空', loc: null, text: base };
  var first = tryParse(base);
  if (first.ok) return { ok: true, card: first.card, usedFallback: false, text: base };
  var conv = toAsciiQuotes(base);
  if (conv !== base) {
    var second = tryParse(conv);
    if (second.ok) return { ok: true, card: second.card, usedFallback: true, text: conv };
  }
  return { ok: false, message: first.message, loc: locateJsonError(base), text: base };
}

module.exports = {
  parseCardJson: parseCardJson,
  locateJsonError: locateJsonError,
  stripPasteNoise: stripPasteNoise
};

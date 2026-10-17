// ============================================================
// 单元测试 · P58 粘贴 JSON 的解析口径（rn/json_locate.js）
//
// 为什么有这一批：P35 已经在卡带导入上判定「整段把弯引号换成英文引号」是错的
//   （真机 H2-R4：卡带 desc 里写着“出发”，一换就把字符串提前闭合，Hermes 报
//   Unexpected character: 出），并把口径改成「先原样解析，失败才兜底」。
//   但存档导入（rn/screens/settings/DataTab.js）与主题包导入
//   （rn/screens/settings/ColorTab.js）两条路还各自手写那版旧清洗，于是：
//     自己导出的存档里只要有一句中文引号 “ ”，粘回来就报「JSON 解析失败」。
//   P58 把三条路收敛到 parseJsonLoose 一份口径，本套单测钉住这条口径与三个入口。
//
// 跑法：node tests/unit/test_json_locate_unit.js
// ============================================================
const path = require('path');
const fs = require('fs');
const H = require('./_harness.js');
const ROOT = H.ROOT;

const JL = require(path.join(ROOT, 'rn', 'json_locate.js'));

function readSrc(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; }
}

// 旧清洗的形状（P58 要钉住它别再回到这三条路上）
const BLANKET_DQUOTE = ".replace(/[\\u201C\\u201D]/g, '\"')";

// 一份「手机自己导出的存档」：chat 文本里带中文弯引号
function saveExport(text) {
  return JSON.stringify({
    format: 'ai_tg_save',
    version: 1,
    cardId: 'demo',
    saveId: 'save_1',
    exportAt: '2026-10-17T10:00:00.000Z',
    files: { '/saves/demo/save_1/chat.json': text }
  }, null, 2);
}

// ============ L1–L7 · 解析口径本体 ============
H.run('L1-自己导出的存档里带中文引号 ⇒ 原样解析成功，内容逐字保留（P58 的靶子）', function() {
  const chat = JSON.stringify([{ role: 'assistant', text: '他喊了一声“出发”，就上了船' }]);
  const raw = saveExport(chat);
  const r = JL.parseJsonLoose(raw);
  H.ok(r.ok, '应当解析成功');
  H.eq(r.usedFallback, false, '不该走兜底（原样就是合法 JSON）');
  H.eq(r.value.files['/saves/demo/save_1/chat.json'], chat, '内容必须逐字保留');
  H.contains(r.value.files['/saves/demo/save_1/chat.json'], '“出发”', '弯引号不能被改写');
});

H.run('L2-结构引号被粘贴改成弯引号 ⇒ 兜底成功且标记 usedFallback（P35 的兜底路径）', function() {
  const bad = '{“format”:“ai_tg_save”,“cardId”:“demo”}';
  const r = JL.parseJsonLoose(bad);
  H.ok(r.ok, '兜底后应解析成功');
  H.eq(r.usedFallback, true, '应标记走了兜底');
  H.eq(r.value.format, 'ai_tg_save', '字段应还原');
});

H.run('L3-真坏 JSON ⇒ ok:false 且给得出真实偏移与成因（不是「第 0 字符附近」）', function() {
  const raw = '{"a": "x"y"}'; // 值里出现未转义的英文双引号
  const r = JL.parseJsonLoose(raw);
  H.eq(r.ok, false, '应当解析失败');
  H.ok(r.loc && typeof r.loc.pos === 'number', '应带定位');
  H.ok(r.loc.pos > 0, '偏移应指向真凶而不是 0，实际 ' + (r.loc && r.loc.pos));
  H.contains(r.loc.hint, '双引号', '成因应提到未转义的英文双引号');
  H.contains(JL.locDetail(r.loc), '第 ' + r.loc.pos + ' 字符附近', '展示文案应带偏移');
});

H.run('L4-BOM 与零宽字符被去掉，且不影响内容里的中文引号', function() {
  const raw = '\uFEFF' + saveExport('“夜读”').replace(/"format"/, '\u200B"format"');
  const r = JL.parseJsonLoose(raw);
  H.ok(r.ok, '去噪后应解析成功');
  H.eq(r.usedFallback, false, '去噪不算兜底');
});

H.run('L5-空内容 / 纯空白 ⇒ ok:false message=内容为空 loc=null', function() {
  ['', '   ', '\n\t', '\uFEFF'].forEach(function(raw) {
    const r = JL.parseJsonLoose(raw);
    H.eq(r.ok, false, '空内容应失败：' + JSON.stringify(raw));
    H.eq(r.message, '内容为空', '文案');
    H.eq(r.loc, null, '空内容没有定位');
  });
});

H.run('L6-parseCardJson 与 parseJsonLoose 同口径（card=value、usedFallback/text 一致）', function() {
  const raw = '{"cardId":"c1","cardName":"“夜读”卡"}';
  const a = JL.parseJsonLoose(raw);
  const b = JL.parseCardJson(raw);
  H.eq(b.ok, true, '卡带入口成功');
  H.eq(b.card.cardName, '“夜读”卡', '内容保留');
  H.eq(b.usedFallback, a.usedFallback, 'usedFallback 一致');
  H.eq(b.text, a.text, 'text 一致');
  const badCard = JL.parseCardJson('{"cardId":');
  const badLoose = JL.parseJsonLoose('{"cardId":');
  H.eq(badCard.ok, false, '坏 JSON 失败');
  H.eq(badCard.message, badLoose.message, '失败文案与通用口径一致');
  H.eq(badCard.loc.pos, badLoose.loc.pos, '偏移一致');
});

H.run('L7-locDetail：无定位返回空串，有定位给偏移/成因/末尾三段', function() {
  H.eq(JL.locDetail(null), '', 'null');
  H.eq(JL.locDetail(undefined), '', 'undefined');
  const d = JL.locDetail({ pos: 7, length: 20, around: 'abcdef', hint: '某成因', tail: 'xyz' });
  H.contains(d, '第 7 字符附近', '偏移');
  H.contains(d, '全文 20 字', '全文长度');
  H.contains(d, '可能原因：某成因', '成因');
  H.contains(d, '末尾：…xyz…', '末尾片段');
});

// ============ S1–S4 · 三个入口的源码形状（行为在屏幕上，Node 只能钉形状） ============
H.run('S1-存档导入不再整段换弯引号，改走 parseJsonLoose', function() {
  const src = readSrc('rn/screens/settings/DataTab.js');
  H.ok(src.length > 0, 'DataTab.js 应可读');
  H.eq(src.indexOf(BLANKET_DQUOTE) < 0, true, '不该再有整段 \\u201C\\u201D 替换');
  H.contains(src, "JsonLocate.parseJsonLoose(raw)", '应走统一口径');
  H.contains(src, 'JsonLocate.locDetail(parsed.loc)', '解析失败应带定位文案');
});

H.run('S2-主题包导入同样改走 parseJsonLoose，且把解析结果交给 Theme.importTheme', function() {
  const src = readSrc('rn/screens/settings/ColorTab.js');
  H.ok(src.length > 0, 'ColorTab.js 应可读');
  H.eq(src.indexOf(BLANKET_DQUOTE) < 0, true, '不该再有整段 \\u201C\\u201D 替换');
  H.contains(src, 'JsonLocate.parseJsonLoose(raw)', '应走统一口径');
  H.contains(src, 'Theme.importTheme(parsed.value)', '应把对象交给 Theme，不再递清洗后的字符串');
});

H.run('S3-卡带导入的定位文案也走 locDetail（一处口径，免得三个页面报三种详略）', function() {
  const src = readSrc('rn/screens/CardsScreen.js');
  H.ok(src.length > 0, 'CardsScreen.js 应可读');
  H.contains(src, 'JsonLocate.locDetail(parsed.loc)', '卡带失败提示应走 locDetail');
  H.eq(src.indexOf('全文 \' + loc.length + \' 字'), -1, '不该再各自手拼一份定位文案');
});

H.run('S4-加密模块不可用时 secureUnwrap 不再把信封当明文放行（P58）', function() {
  const src = readSrc('rn/export_util.js');
  H.ok(src.length > 0, 'export_util.js 应可读');
  H.contains(src, 'ENV_HEAD', '应有信封长相判别');
  H.contains(src, "'加密模块不可用'", '应如实报模块不可用');
  // 旧形状：模块缺失分支直接 return { ok:true, text:s, encrypted:false } —— 信封被当明文
  const oldSilent = "if (!SecureEnvelope || typeof SecureEnvelope.isEnvelope !== 'function') return { ok: true, text: s, encrypted: false };";
  H.eq(src.indexOf(oldSilent), -1, '不该保留静默放行那一行');
});

H.run('S5-加密模块不可用时 isEnvelopeText 仍能认出信封（否则屏幕根本进不了那一支）', function() {
  const src = readSrc('rn/export_util.js');
  H.ok(src.length > 0, 'export_util.js 应可读');
  // 旧形状：模块缺失分支直接 return false ⇒ 信封被当成普通文本，永远走不到 secureUnwrap
  H.eq(src.indexOf("if (!SecureEnvelope || typeof SecureEnvelope.isEnvelope !== 'function') return false;"), -1,
    '不该在模块缺失时直接判「不是信封」');
  H.contains(src, 'function looksLikeEnvelope(text)', '应有独立的长相嗅探');
  H.contains(src, 'return looksLikeEnvelope(s);', '模块缺失时应回落到嗅探');
});

H.run('S6-加密模块缺席/在场两种状态的行为：信封不被当明文，口令错说真原因', function() {
  // 模块缺席：require 返回空件 ⇒ 信封必须被认出并如实报「不可用」，明文照旧放行
  const miss = H.makeSandbox({
    module: { exports: {} },
    require: function(p) {
      if (p === 'react-native') return { Share: {}, Clipboard: {} };
      return {};
    }
  });
  H.load(miss, 'rn/export_util.js');
  const EU0 = miss.module.exports;
  H.ok(!!EU0, 'export_util.js 应暴露 ExportUtil');
  const env = JSON.stringify({ format: 'ai_tg_secure', v: 1, kdf: 'pbkdf2-sha256', iter: 100000, salt: 'AAAA', nonce: 'BBBB', ct: 'CCCC', tag: 'DDDD' });
  H.eq(EU0.isEnvelopeText(env), true, '模块缺席时也要认出信封');
  H.eq(EU0.isEnvelopeText('{"cardId":"c1"}'), false, '普通 JSON 不该被认成信封');
  const u0 = EU0.secureUnwrap(env, 'x');
  H.eq(u0.ok, false, '信封不应被当明文放行');
  H.contains(String(u0.reason), '加密模块不可用', '缺因要说清');
  const plain0 = EU0.secureUnwrap('{"cardId":"c1"}', 'x');
  H.eq(plain0.ok, true, '明文导入不能被连坐拦下');
  H.eq(plain0.encrypted, false, '明文标成未加密');

  // 模块在场：真 encrypt/decrypt ⇒ 口令对能解开、口令错回「口令不对」
  const real = require(path.join(ROOT, 'vfs', 'secure_envelope.js'));
  const yes = H.makeSandbox({
    module: { exports: {} },
    require: function(p) {
      if (p === 'react-native') return { Share: {}, Clipboard: {} };
      return real;
    }
  });
  H.load(yes, 'rn/export_util.js');
  const EU1 = yes.module.exports;
  const wrapped = real.wrap('{"cardId":"c1","desc":"喊了一声“出发”"}', 'pw');
  H.eq(wrapped.ok, true, '封装应成功');
  H.eq(EU1.isEnvelopeText(wrapped.text), true, '在场时用权威判别');
  const good = EU1.secureUnwrap(wrapped.text, 'pw');
  H.eq(good.ok, true, '口令对能解开');
  H.eq(good.encrypted, true, '标成已加密');
  H.contains(good.text, '喊了一声', '明文回来');
  const bad = EU1.secureUnwrap(wrapped.text, 'nope');
  H.eq(bad.ok, false, '口令错必须失败');
  H.contains(String(bad.reason), '口令不对', '口令错要说口令不对');
});

H.finish();

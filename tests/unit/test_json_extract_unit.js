// ============================================================
// 单元测试 · O-8 共享 JSON 提取件（P54·第12条 / 第15条单测线）
//
// 背景：outputs.js 与 info_feed.js 各自长过一套「字符串感知的花括号配平扫描」，
// 而另外 6 个文件里还有 7 处用朴素的「第一个 { 到最后一个 }」切片 —— 模型在 JSON
// 之后继续解释（解释里又带花括号）时，切片会把 JSON 与解释缝在一起，JSON.parse 失败，
// 整条链路只能靠 fixJSONText 兜。现在唯一实现收敛到
//   engine/card_diagnose.js 的 CardDiagnose.firstJsonObject(text) → 配平子串 或 null
// 各调用点按自己的老契约兜底：
//   · engine/outputs.js   _firstJsonObject(s) 找不到时返回 ''（契约来自 outputs_review_smoke.js O-8j）
//   · engine/info_feed.js _firstJsonObject(s) 找不到时返回 null
//   · 其余调用点：拿不到配平对象就保留原文，继续走 JSON.parse / fixJSONText 修复路径
//
// 跑法：node tests/unit/test_json_extract_unit.js
// ============================================================
const path = require('path');
const fs = require('fs');
const H = require('./_harness.js');
const ROOT = H.ROOT;

// ---- 引擎件按裸名互找（浏览器里是 window.X）⇒ 先在真正的 globalThis 上摆好宿主假件 ----
globalThis.GameState = globalThis.GameState || {};
globalThis.VFS = globalThis.VFS || { readFile: function() { return null; }, readJSON: function() { return null; }, writeJSON: function() { return true; } };
globalThis.Storage = globalThis.Storage || { getGlobal: function() { return {}; } };
globalThis.Logger = globalThis.Logger || { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} };
globalThis.ErrorLog = globalThis.ErrorLog || { audit: function() { return true; }, action: function() {}, error: function() {}, log: function() {} };
globalThis.ApiManager = globalThis.ApiManager || { getActive: function() { return null; } };
globalThis.Platform = globalThis.Platform || { ui: {} };
globalThis.ToolExecutor = globalThis.ToolExecutor || require(path.join(ROOT, 'engine', 'core', 'tool_executor.js'));
if (!globalThis.ToolExecutor.WHITELIST) globalThis.ToolExecutor.WHITELIST = {};

const CD = require(path.join(ROOT, 'engine', 'card_diagnose.js'));
globalThis.CardDiagnose = CD;
const Portrait = require(path.join(ROOT, 'engine', 'portrait.js'));
const NpcDeductionAI = require(path.join(ROOT, 'engine', 'npc_deduction_ai.js'));
const ProposalSemanticCheck = require(path.join(ROOT, 'engine', 'proposal_semantic_check.js'));
const NpcRuntime = require(path.join(ROOT, 'engine', 'npc_runtime.js'));

const SITEs = ['engine/classify.js', 'engine/npc_runtime.js', 'engine/npc_deduction_ai.js',
  'engine/portrait.js', 'engine/proposal_semantic_check.js', 'engine/import/index.js'];

// ============ J1–J6 · 共享件本体 ============
H.run('J1-只取第一个花括号配平的对象（后文再带花括号也不缝进来）', function() {
  H.eq(CD.firstJsonObject('先说一句 {"a":1} 再啰嗦 {"b":2}'), '{"a":1}', '取第一个');
});

H.run('J2-嵌套对象/数组整体取回', function() {
  H.eq(CD.firstJsonObject('x {"a":{"b":[1,2,{"c":3}]}} y'), '{"a":{"b":[1,2,{"c":3}]}}', '嵌套');
});

H.run('J3-字符串里的花括号与转义引号不误判', function() {
  H.eq(CD.firstJsonObject('{"t":"含 } 的字符串","n":[1,2]}'), '{"t":"含 } 的字符串","n":[1,2]}', '字符串内 }');
  H.eq(CD.firstJsonObject('{"a":"\\"}"}'), '{"a":"\\"}"}', '转义引号');
});

H.run('J4-单引号字符串内的花括号也跳过（与 fixJSONText 同口径）', function() {
  H.eq(CD.firstJsonObject("prefix {'a':'}'} tail"), "{'a':'}'}", '单引号');
});

H.run('J5-没有 { 或未配平 ⇒ null（不抛错）', function() {
  H.eq(CD.firstJsonObject('没有花括号'), null, '无 {');
  H.eq(CD.firstJsonObject('{"a":'), null, '未配平');
  H.eq(CD.firstJsonObject('} {"a":1}'), '{"a":1}', '前置孤立 } 不影响后面的对象');
  H.eq(CD.firstJsonObject(''), null, '空串');
  H.eq(CD.firstJsonObject(null), null, 'null 输入');
});

H.run('J6-共享件是「提取」不是「修复」：不合法 JSON 也照样返回配平子串，由调用方决定后续', function() {
  H.eq(CD.firstJsonObject("{a:1,}"), '{a:1,}', '未加引号的键仍返回原文片段');
});

// ============ J7–J11 · 六个调用点（旧写法会在这里翻车） ============
// 每个用例的输入都是「JSON 之后模型还写了一段带花括号的解释」——旧的首尾切片会把两段缝起来。
H.run('J7-Portrait.parseAuditResponse：JSON 后文带花括号仍解析出第一个对象', function() {
  const r = Portrait.parseAuditResponse('说明如下 {"verdict":"conflict","issues":[{"field":"hud","severity":"concern","reason":"x"}]} 另外 {"note":"忽略我"}');
  H.ok(r, '应解析成功');
  H.eq(r.verdict, 'conflict', 'verdict');
  H.eq(r.issues.length, 1, 'issues 条数');
  H.eq(r.issues[0].field, 'hud', 'issues[0].field');
});

H.run('J8-Portrait.parseGenerateResponse：同理', function() {
  const r = Portrait.parseGenerateResponse('{"summary":"档案","traits":["a"]} 补充 {"x":1}');
  H.ok(r, '应解析成功');
  H.eq(r.summary, '档案', 'summary');
  H.deepEq(r.traits, ['a'], 'traits');
});

H.run('J9-NpcRuntime.parseUpdateResponse：同理', function() {
  const r = NpcRuntime.parseUpdateResponse('好的 {"alive":true,"mood":"平静","locationId":"loc1"} 以上 {"extra":1}');
  H.ok(r, '应解析成功');
  H.eq(r.mood, '平静', 'mood');
  H.eq(r.locationId, 'loc1', 'locationId');
  H.eq(r.alive, true, 'alive');
});

H.run('J10-NpcDeductionAI._parseResponse：同理', function() {
  const r = NpcDeductionAI._parseResponse('{"canDeduce":true,"chain":"A→B","reason":"因为"} 补充 {"x":1}');
  H.ok(r, '应解析成功');
  H.eq(r.canDeduce, true, 'canDeduce');
  H.eq(r.chain, 'A→B', 'chain');
});

H.run('J11-ProposalSemanticCheck._parseResponse：非法提案 + 后文花括号', function() {
  const r = ProposalSemanticCheck._parseResponse('{"valid":false,"reason":"缺主体"} 备注 {"x":1}');
  H.eq(r.ok, false, 'ok=false');
  H.eq(r.reason, '缺主体', 'reason');
});

H.run('J12-classify 的 parseSuggestions 也走共享件（源码级：无朴素切片残留）', function() {
  SITEs.forEach(function(rel) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    H.eq(src.indexOf("lastIndexOf('}')"), -1, rel + ' 不应再有 lastIndexOf(\'}\')');
    H.eq(src.indexOf("indexOf('{')"), -1, rel + ' 不应再有 indexOf(\'{\')');
  });
  const cdSrc = fs.readFileSync(path.join(ROOT, 'engine', 'card_diagnose.js'), 'utf8');
  H.contains(cdSrc, 'function firstJsonObject(text)', '共享件本体');
});

// ============ J13 · 两个委派包装的老契约（'' / null）============
H.run('J13-契约：outputs._firstJsonObject 找不到返回空串，info_feed._firstJsonObject 返回 null', function() {
  const sb1 = H.makeSandbox({
    GameState: { currentCardId: 'card1', currentSaveId: 'save1', currentCard: { worldbook: {} }, currentState: { hud: [], sidebar: [], panels: {} }, _gameTime: { year: 1 }, _pendingSystemNotices: [] },
    Storage: { getGlobal: function() { return {}; } },
    ToolExecutor: { WHITELIST: {}, _modifyStat: function() { return { ok: false }; } }
  });
  H.load(sb1, 'engine/card_diagnose.js');
  sb1.CardDiagnose = sb1.window.CardDiagnose;
  H.load(sb1, 'engine/outputs.js');
  const O = sb1.window.Outputs;
  H.eq(O._firstJsonObject('没有花括号'), '', 'outputs 契约：空串');
  H.eq(O._firstJsonObject('{"a":1} 尾巴'), '{"a":1}', 'outputs 取第一个');

  const sb2 = H.makeSandbox({
    GameState: { currentCardId: 'card1', currentSaveId: 'save1', currentRound: 3, formatGameTime: function() { return '1-1-3 08:00'; } }
  });
  H.load(sb2, 'engine/card_diagnose.js');
  sb2.CardDiagnose = sb2.window.CardDiagnose;
  H.load(sb2, 'engine/info_feed.js');
  const IF = sb2.window.InfoFeed;
  H.eq(IF._firstJsonObject('没有花括号'), null, 'info_feed 契约：null');
  H.eq(IF._firstJsonObject('{"a":1} 尾巴'), '{"a":1}', 'info_feed 取第一个');
});

H.run('J14-旧写法（第一个 { 到最后一个 }）在同一批输入上确实会解析失败 —— 证明这条不是纸面问题', function() {
  const samples = [
    '说明如下 {"verdict":"conflict","issues":[]} 另外 {"note":"忽略我"}',
    '{"summary":"档案","traits":["a"]} 补充 {"x":1}',
    '好的 {"alive":true,"mood":"平静"} 以上 {"extra":1}',
    '{"canDeduce":true,"chain":"A→B"} 补充 {"x":1}',
    '{"valid":false,"reason":"缺主体"} 备注 {"x":1}'
  ];
  let naiveBroke = 0;
  samples.forEach(function(text, i) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    let naiveOk = true;
    try { JSON.parse(text.slice(start, end + 1)); } catch (e) { naiveOk = false; }
    if (!naiveOk) naiveBroke++;
    const ob = CD.firstJsonObject(text);
    let newOk = true;
    try { JSON.parse(ob); } catch (e2) { newOk = false; }
    H.eq(newOk, true, '第 ' + (i + 1) + ' 个样本：共享件结果应可解析');
  });
  H.eq(naiveBroke, samples.length, '朴素切片应当全部失败，实际只失败 ' + naiveBroke + '/' + samples.length);
});

H.finish();

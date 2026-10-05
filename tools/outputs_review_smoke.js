// ============================================================
// outputs_review_smoke.js — P27 守卫：产出物的标题/正文/描述 + 一轮 AI 审核 + 融入剧情
//
// 用户要求（原话，历史记录）：「产出物系统，这个要单独做一个面板选项然后标题内容描述等，
//   然后过一轮 AI 审核是否可以纳入或修改，然后融入剧情里面，这个太残缺了什么都没做好。」
// 病灶（改前）：engine/outputs.js 的 create 只写 id/name/type/keywords/audience/fate/progress/…，
//   **没有 title / content / desc / review**；formatForPrompt 只有一行「· 《name》」，
//   审核链路与「纳入/改写」全都不存在。
// 断言：
//   O-1..O-2  标题/正文/描述落库 + update 白名单改写
//   O-3..O-4  一轮 AI 审核：无通道安全失败 / include / revise（带围栏也认）/ 垃圾回复保持待审 / 调用失败保持待审
//   O-5..O-6  融入剧情：included 带描述与正文（限长）、pending 只提示、rejected 不带内容；query_outputs 增字段；工具账不多不少
//   O-7       老存档补字段 + 源码守卫
// 说明：访问器全部包了空值守卫，改前（旧代码）跑出来是「红」而不是「崩」。
// 跑法：node tools/outputs_review_smoke.js   （cwd 随意，仓库根由 __dirname 推）
// ============================================================
'use strict';

var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('  ok   ' + name); }
  else { failN++; console.log('  FAIL ' + name + (detail ? ('  <<< ' + detail) : '')); }
}
function includes(name, hay, needle) {
  ok(name, String(hay).indexOf(needle) >= 0, 'missing=' + JSON.stringify(needle));
}
function section(t) { console.log('\n### ' + t); }

// ---------------- 内存 VFS + 最小脚手架 ----------------
var store = {};
globalThis.VFS = {
  writeFile: function (p, s) { store[p] = s; return true; },
  readFile: function (p) { return store[p] === undefined ? null : store[p]; },
  readJSON: function (p) { try { return JSON.parse(store[p]); } catch (e) { return null; } },
  writeJSON: function (p, o) { store[p] = JSON.stringify(o); return true; },
  listAll: function () { return Object.keys(store); },
  deleteFile: function (p) { delete store[p]; }
};
globalThis.localStorage = { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } };
globalThis.window = globalThis;

globalThis.Storage = {
  getGlobal: function () { return { settings: { outputs: { enabled: true } } }; },
  setGlobal: function () { }
};
globalThis.ToolExecutor = { WHITELIST: {} };
globalThis.GameState = {
  currentCardId: 'card_out',
  currentSaveId: 'save_out',
  currentCard: {
    cardName: '无光之城',
    game: { title: '无光之城', background: '这是一座没有太阳的城市，钟楼停摆，靠蓝砂矿脉照明。' }
  },
  formatGameTime: function () { return '第1天 08:00'; }
};

var Outputs = require(path.join(ROOT, 'engine', 'outputs.js'));
var OUT_FILE = '/saves/card_out/save_out/outputs_runtime.json';

// ---------------- 空值守卫访问器（旧代码上跑出红而不是崩） ----------------
function get(id) { try { return Outputs.get(id) || {}; } catch (e) { return {}; } }
function stateOf(id) { var o = get(id); return (o.review && o.review.state) ? o.review.state : '(无 review)'; }
function up(id, patch) { return (typeof Outputs.update === 'function') ? Outputs.update(id, patch) : { ok: false, reason: 'update 未实现' }; }
function rev(id, opts) { return (typeof Outputs.review === 'function') ? Outputs.review(id, opts) : Promise.resolve({ ok: false, reason: 'review 未实现' }); }
function fmt() { try { return String(Outputs.formatForPrompt() || ''); } catch (e) { return ''; } }
function fresh() {
  Object.keys(store).forEach(function (k) { delete store[k]; });
  Outputs._data = null;
  Outputs.load();
}
function chatOf(reply) {
  var seen = null;
  var fn = function (msgs, opts) { seen = { msgs: msgs, opts: opts }; return Promise.resolve({ content: reply }); };
  fn.seen = function () { return seen; };
  return fn;
}

// ============================================================
section('O-1 标题 / 正文 / 描述落库');
// ============================================================
fresh();
var c1 = Outputs.create({ name: '蓝砂灯', title: '蓝砂灯（试用）', content: '灯芯用蓝砂矿脉的碎屑，点燃后不灭。', desc: '一件照明物' });
ok('O-1a create 成功', !!(c1 && c1.ok === true), JSON.stringify(c1));
ok('O-1b title 落库', get(c1.id).title === '蓝砂灯（试用）', JSON.stringify(get(c1.id).title));
ok('O-1c content 落库', /碎屑/.test(String(get(c1.id).content || '')), JSON.stringify(get(c1.id).content));
ok('O-1d desc 落库', get(c1.id).desc === '一件照明物', JSON.stringify(get(c1.id).desc));
var c1b = Outputs.create({ name: '铁哨' });
ok('O-1e 没给 title 时默认等于 name', get(c1b.id).title === '铁哨', JSON.stringify(get(c1b.id).title));
ok('O-1f AI 直接发布的默认 review.state = none', stateOf(c1.id) === 'none', stateOf(c1.id));
var c1c = Outputs.create({ name: '钟楼图纸', content: '图纸', fromPanel: true });
ok('O-1g 面板提交默认 review.state = pending', stateOf(c1c.id) === 'pending', stateOf(c1c.id));

// ============================================================
section('O-2 update 白名单改写');
// ============================================================
fresh();
var c2 = Outputs.create({ name: '雾灯', content: '旧正文', desc: '旧描述', fromPanel: true });
var u1 = up(c2.id, { title: '雾灯（新版）', content: '新正文', desc: '新描述' });
ok('O-2a update 成功且回报 applied', !!(u1 && u1.ok === true && u1.applied && u1.applied.length === 3), JSON.stringify(u1 && u1.applied));
var g2 = get(c2.id);
ok('O-2b 三个字段都改了', !!(g2.title === '雾灯（新版）' && g2.content === '新正文' && g2.desc === '新描述'),
  JSON.stringify({ t: g2.title, c: g2.content, d: g2.desc }));
var u2 = up(c2.id, { fate: 'settled', progress: 99 });
ok('O-2c 只认白名单（fate/progress 改不动，且回报失败）',
  !!(u2.ok === false && get(c2.id).fate === 'fermenting' && get(c2.id).progress === 0), JSON.stringify(u2));
var u3 = up('out_不存在', { title: 'x' });
ok('O-2d id 不存在时安全失败', !!(u3 && u3.ok === false && /产出物不存在/.test(String(u3.reason))), JSON.stringify(u3));

// ============================================================
section('O-3 一轮 AI 审核：无通道 / include / revise');
// ============================================================
fresh();
var c3 = Outputs.create({ name: '夜巡令', title: '夜巡令', content: '城主下令夜里不得靠近钟楼。', desc: '一条政令', fromPanel: true });
var chatIn = chatOf('{"verdict":"include","reason":"与世界观一致"}');

rev(c3.id, {}).then(function (v0) {
  ok('O-3a 没有 AI 通道时安全失败', !!(v0 && v0.ok === false && /没有可用的 AI 通道/.test(String(v0.reason))), JSON.stringify(v0));
  ok('O-3b 无通道时状态不变（仍待审）', stateOf(c3.id) === 'pending', stateOf(c3.id));
  return rev(c3.id, { chat: chatIn });
}).then(function (v1) {
  ok('O-3c include：裁决生效', !!(v1 && v1.ok === true && v1.verdict === 'include'), JSON.stringify(v1 && { ok: v1.ok, v: v1.verdict }));
  ok('O-3d include：状态置 included 且记了原因', !!(stateOf(c3.id) === 'included' && /一致/.test(String(get(c3.id).review.reason))), stateOf(c3.id));
  var sent = chatIn.seen();
  var prompt = sent ? String(sent.msgs[0].content) : '';
  includes('O-3e 送审提示词带上了标题', prompt, '夜巡令');
  includes('O-3f 送审提示词带上了正文', prompt, '夜里不得靠近钟楼');
  includes('O-3g 送审提示词带上了世界背景', prompt, '蓝砂矿脉');
  includes('O-3h 送审提示词要求只回 JSON 裁决', prompt, 'verdict');
  var c4 = Outputs.create({ name: '夜巡令2', content: '旧', desc: '旧', fromPanel: true });
  var chatRev = chatOf('```json\n{"verdict":"revise","reason":"措辞太现代","title":"夜禁令","content":"入夜后钟楼三里内禁止通行。","desc":"城主的夜禁"}\n```');
  return rev(c4.id, { chat: chatRev }).then(function (v2) { return { c4: c4, v2: v2 }; });
}).then(function (x) {
  ok('O-3i revise：裁决生效（围栏 JSON 也认）', !!(x.v2 && x.v2.ok === true && x.v2.verdict === 'revise'),
    JSON.stringify(x.v2 && { ok: x.v2.ok, v: x.v2.verdict, reason: x.v2.reason }));
  var g4 = get(x.c4.id);
  ok('O-3j revise：标题/正文/描述按 AI 的改写覆盖',
    !!(g4.title === '夜禁令' && /禁止通行/.test(String(g4.content)) && g4.desc === '城主的夜禁'),
    JSON.stringify({ t: g4.title, c: g4.content, d: g4.desc }));
  ok('O-3k revise：状态置 revised', stateOf(x.c4.id) === 'revised', stateOf(x.c4.id));
  var c5 = Outputs.create({ name: '雾中告示', content: '内容', fromPanel: true });
  return rev(c5.id, { chat: chatOf('我觉得还行吧') }).then(function (v3) { return { c5: c5, v3: v3 }; });
}).then(function (x) {
  ok('O-3l 垃圾回复：返回失败且说清无法解析', !!(x.v3 && x.v3.ok === false && /无法解析/.test(String(x.v3.reason))), JSON.stringify(x.v3));
  ok('O-3m 垃圾回复：状态保持 pending 并记下原因',
    !!(stateOf(x.c5.id) === 'pending' && /无法解析/.test(String(get(x.c5.id).review.reason))), stateOf(x.c5.id));
  var c6 = Outputs.create({ name: '坏通道', content: 'x', fromPanel: true });
  var chatErr = function () { return Promise.reject(new Error('网络断了')); };
  return rev(c6.id, { chat: chatErr }).then(function (v4) { return { c6: c6, v4: v4 }; });
}).then(function (x) {
  ok('O-4a 调用失败：返回失败不抛异常', !!(x.v4 && x.v4.ok === false), JSON.stringify(x.v4));
  ok('O-4b 调用失败：状态保持 pending 并记下错误',
    !!(stateOf(x.c6.id) === 'pending' && /审核调用失败/.test(String(get(x.c6.id).review.reason))), stateOf(x.c6.id));
  return runInject();
}).catch(function (e) {
  ok('O-x 审核链异常：' + (e && e.message), false);
  return null;
});

function runInject() {
  // ============================================================
  section('O-5 融入剧情：提示词注入');
  // ============================================================
  fresh();
  var a = Outputs.create({
    name: 'pass-In', title: '蓝砂灯',
    content: '灯芯用蓝砂矿脉的碎屑点燃，长明不灭，这段正文用来验证注入与截断口径是否生效。',
    desc: '一件照明物'
  });
  Outputs.create({ name: 'pending-', title: '待审图纸', content: '这是还没过审的正文内容。', desc: '还没过审的描述', fromPanel: true });
  var c = Outputs.create({ name: 'approve-', title: '待纳入的灯图', content: '待纳入的正文内容。', desc: '待纳入的描述', fromPanel: true });
  var rejItem = Outputs.create({ name: 'rejected-', title: '被驳回的东西', content: '被驳回的正文内容。', desc: '被驳回的描述', fromPanel: true });

  var p1 = fmt();
  includes('O-5a 已纳入（none）产出物带描述', p1, '一件照明物');
  includes('O-5b 已纳入产出物带正文节选', p1, '蓝砂矿脉的碎屑点燃');
  var m = /正文：([^\n]*)/.exec(p1);
  ok('O-5c 正文节选被限长（≤120 字 + 省略号）', !!(m && m[1].length <= 122), JSON.stringify(m ? m[1] : ''));
  includes('O-5d 待审产出物只给一句待审提示', p1, '待审');
  ok('O-5e 待审产出物的正文/描述不进提示词', !!(p1.indexOf('还没过审的正文内容') < 0 && p1.indexOf('还没过审的描述') < 0));
  ok('O-5f 待审产出物的正文/描述不进提示词（含被驳回项）',
    !!(p1.indexOf('待纳入的正文内容') < 0 && p1.indexOf('待纳入的描述') < 0 &&
      p1.indexOf('被驳回的正文内容') < 0 && p1.indexOf('被驳回的描述') < 0));

  var chat = chatOf('{"verdict":"include","reason":"可以"}');
  var chatRej = chatOf('{"verdict":"reject","reason":"与设定冲突"}');
  return rev(c.id, { chat: chat }).then(function () {
    return rev(rejItem.id, { chat: chatRej });
  }).then(function () {
    var p2 = fmt();
    ok('O-5g 审核通过（included）后内容进提示词',
      !!(p2.indexOf('待纳入的正文内容') >= 0 && p2.indexOf('待纳入的描述') >= 0));
    ok('O-5h 被驳回（rejected）的内容始终不进提示词',
      !!(p2.indexOf('被驳回的正文内容') < 0 && p2.indexOf('被驳回的描述') < 0));

    // ============================================================
    section('O-6 query_outputs 与工具账');
    // ============================================================
    var q = globalThis.ToolExecutor.WHITELIST.query_outputs.run({});
    var item = (q.data.list.filter(function (x) { return x.name === 'pass-In'; })[0]) || {};
    ok('O-6a query_outputs 带 title/desc/content/reviewState',
      !!(item.title === '蓝砂灯' && item.desc === '一件照明物' && /蓝砂矿脉/.test(String(item.content)) && item.reviewState === 'none'),
      JSON.stringify(item).slice(0, 240));
    var keys = Object.keys(globalThis.ToolExecutor.WHITELIST).sort();
    ok('O-6b 产出物工具仍然只有 4 个（本轮刻意不新增工具）',
      keys.join(',') === 'output_publish,output_settle,output_stir,query_outputs', keys.join(','));
    var rp = globalThis.ToolExecutor.WHITELIST.output_publish.run({ name: '工具发布', title: '工具标题', content: '工具正文', desc: '工具描述' });
    var o = rp && rp.ok ? get(rp.outputId) : {};
    ok('O-6c output_publish 接受 title/content/desc',
      !!(rp && rp.ok && o.title === '工具标题' && o.content === '工具正文' && o.desc === '工具描述'),
      JSON.stringify({ rp: rp, t: o.title, c: o.content, d: o.desc }));

    // ============================================================
    section('O-7 老存档补字段 + 源码守卫');
    // ============================================================
    fresh();
    VFS.writeJSON(OUT_FILE, {
      outputs: { out_old: { id: 'out_old', name: '老产出物', type: '', fate: 'fermenting', progress: 10, keywords: [], audience: [], events: [], stirCooldowns: {}, finalVerdict: '', settledAt: '', createdAt: '第1天', publishedAt: '第1天' } },
      _lastIntervalKey: ''
    });
    Outputs._data = null;
    var go = get('out_old');
    ok('O-7a 老存档读时补 title = name', go.title === '老产出物', JSON.stringify(go.title));
    ok('O-7b 老存档读时补 content/desc 空串', !!(go.content === '' && go.desc === ''), JSON.stringify({ c: go.content, d: go.desc }));
    ok('O-7c 老存档读时补 review.state = none', !!(go.review && go.review.state === 'none'), JSON.stringify(go.review));

    var src = fs.readFileSync(path.join(ROOT, 'engine', 'outputs.js'), 'utf8');
    ok('O-7d 源码：outputs.js 有 update / review / buildReviewPrompt / parseReviewVerdict',
      !!(src.indexOf('update: function(id, patch)') >= 0 && src.indexOf('review: function(id, opts)') >= 0 &&
        src.indexOf('buildReviewPrompt') >= 0 && src.indexOf('parseReviewVerdict') >= 0));
    ok('O-7e 源码：create 里写了 title/content/desc/review',
      !!(/title: String\(def\.title/.test(src) && /content: String\(def\.content/.test(src) && /review: \{ state: reviewState/.test(src)));
    var pb = fs.readFileSync(path.join(ROOT, 'engine', 'core', 'prompt_builder.js'), 'utf8');
    var proto = pb.split('\n').filter(function (l) { return l.indexOf('产出物：output_publish(') >= 0; }).join('\n');
    includes('O-7f 协议行声明了 title?/content?/desc?', proto, 'title?, content?, desc?');
    includes('O-7g 协议段说明面板送审与「审核通过即素材」', pb, '产出物正文：');

    console.log('');
    console.log('OUTPUTS_REVIEW_SMOKE: ' + okN + ' ok, ' + failN + ' failed');
    if (failN > 0) process.exit(1);
  });
}

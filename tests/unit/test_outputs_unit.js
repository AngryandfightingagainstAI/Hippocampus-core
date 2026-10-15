// ============================================================
// engine/outputs.js 单测（P54·第15条）
//
// 覆盖 P54·第12条深审里的两条「同一件事两套行为 / 静默覆盖」语义项：
//   O-3 手动与 AI 定论（settle）必须和 tick 自动定论走同一条 _settle：
//       一定应用 settleRules.affects、一定推系统通知。
//   O-5 送审失败时不得把上一轮的结论（included / revised / rejected）打回 pending ——
//       打回会让 formatForPrompt 只给「待审」提示，玩家已经看到的正文静默掉出提示词。
//
// 跑法：node tests/unit/test_outputs_unit.js
// ============================================================
const h = require('./_harness');
const makeSandbox = h.makeSandbox;
const load = h.load;
const run = h.run;
const eq = h.eq;
const ok = h.ok;
const notOk = h.notOk;
const contains = h.contains;
const finish = h.finish;

// 造一个能跑 outputs.js 的最小环境；opts.state 会被 _modifyStat 桩就地改写
function mk(opts) {
  opts = opts || {};
  const state = opts.state || { hud: [], sidebar: [], panels: {} };
  const gs = {
    currentCardId: 'card1',
    currentSaveId: 'save1',
    currentCard: opts.card || { worldbook: {} },
    currentState: state,
    _gameTime: { year: 1 },
    _pendingSystemNotices: [],
    formatGameTime: function() { return opts.time || '第1天'; }
  };
  const modifyStat = function(scope, panelId, key, delta) {
    const list = scope === 'hud' ? (state.hud || []) : (scope === 'sidebar' ? (state.sidebar || []) : []);
    const item = list.filter(function(x) { return x.key === key; })[0];
    if (!item) return { ok: false, reason: '找不到属性' };
    const oldVal = item.value;
    item.value = oldVal + delta;
    return { ok: true, oldVal: oldVal, newVal: item.value, delta: delta };
  };
  const sb = makeSandbox({
    GameState: gs,
    Storage: { getGlobal: function() { return { settings: { outputs: { enabled: true } } }; } },
    ToolExecutor: { WHITELIST: {}, _modifyStat: modifyStat }
  });
  load(sb, 'engine/outputs.js');
  return { sb: sb, O: sb.window.Outputs, gs: gs, state: state };
}

const CARD_WITH_AFFECTS = {
  worldbook: {
    outputs: {
      settleRules: { when: { type: 'progress-full' }, affects: [{ statKey: '民心', delta: 5 }] }
    }
  }
};

// ---------- O-3 定论通道一致 ----------

run('O-3a settle() 应用 settleRules.affects 并推系统通知', function() {
  const e = mk({ card: CARD_WITH_AFFECTS, state: { hud: [{ key: '民心', value: 10 }], sidebar: [], panels: {} } });
  const c = e.O.create({ name: '定论案', content: '正文' });
  ok(c.ok, 'O-3a create 应成功：' + JSON.stringify(c));
  const r = e.O.settle(c.id, '手动定论');
  ok(r.ok, 'O-3a settle 应成功：' + JSON.stringify(r));
  eq(e.state.hud[0].value, 15, 'O-3a 属性应被 +5');
  eq(r.applied.length, 1, 'O-3a 应回报 1 条 applied');
  eq(r.finalVerdict, '手动定论', 'O-3a 裁决语应原样保留');
  eq(e.gs._pendingSystemNotices.length, 1, 'O-3a 应推 1 条系统通知');
  eq(e.O.get(c.id).fate, 'settled', 'O-3a fate 应 settled');
});

run('O-3b 已定论的产出物再次 settle 被拒', function() {
  const e = mk({ card: CARD_WITH_AFFECTS, state: { hud: [{ key: '民心', value: 0 }], sidebar: [], panels: {} } });
  const c = e.O.create({ name: '重复案', content: 'x' });
  ok(e.O.settle(c.id, '第一次').ok, 'O-3b 第一次应成功');
  const r2 = e.O.settle(c.id, '第二次');
  notOk(r2.ok, 'O-3b 第二次应被拒');
  eq(e.state.hud[0].value, 5, 'O-3b 属性只应被改一次');
});

run('O-3c settle() 不给裁决语时落默认定论文案', function() {
  const e = mk({ card: CARD_WITH_AFFECTS, state: { hud: [{ key: '民心', value: 0 }], sidebar: [], panels: {} } });
  const c = e.O.create({ name: '默认文案案', content: 'x' });
  const r = e.O.settle(c.id, '');
  ok(r.ok, 'O-3c 应成功：' + JSON.stringify(r));
  ok(String(r.finalVerdict || '').length > 0, 'O-3c finalVerdict 不应为空串');
  contains(String(r.finalVerdict), '手动定论', 'O-3c 默认文案应标明是手动定论');
});

run('O-3d tick 自动定论与 settle 同一条路径（也应用 affects）', function() {
  const e = mk({
    card: CARD_WITH_AFFECTS,
    state: { hud: [{ key: '民心', value: 0 }], sidebar: [], panels: {} },
    time: '1-1-1'
  });
  const c = e.O.create({ name: '发酵案', content: 'x' });
  const rt = e.O.getRuntime();
  rt.outputs[c.id].progress = 96; // 一次 tick +5 ⇒ 101 ≥ 100
  rt._lastIntervalKey = '';
  e.O.setRuntime(rt);
  const t = e.O.tick();
  eq(t.fermented, true, 'O-3d tick 应真的跑了一轮');
  eq(e.O.get(c.id).fate, 'settled', 'O-3d progress 满应自动定论');
  eq(e.state.hud[0].value, 5, 'O-3d tick 定论也应应用 affects');
  eq(e.gs._pendingSystemNotices.length, 1, 'O-3d tick 定论也应推通知');
});

// ---------- O-5 送审失败不覆盖已定论 ----------

run('O-5a 送审失败不把「已纳入」打回 pending，正文仍在提示词里', function() {
  const e = mk();
  const c = e.O.create({ name: '已纳入案', content: '正文内容在此' });
  ok(c.ok, 'O-5a create 应成功');
  const f = e.O.force(c.id, 'included', '上一轮已纳入');
  ok(f.ok, 'O-5a force 应成功：' + JSON.stringify(f));
  contains(e.O.formatForPrompt(), '正文内容在此', 'O-5a 送审前正文应在提示词里');
  return e.O.review(c.id, { chat: function() { return Promise.resolve({ content: '不知道' }); } }).then(function(r) {
    notOk(r.ok, 'O-5a 本次送审应失败');
    const o = e.O.get(c.id);
    eq(o.review.state, 'included', 'O-5a 状态应仍是 included');
    eq(r.kept, 'included', 'O-5a 返回值应说明保留了哪个状态');
    ok(String(o.review.lastError || '').length > 0, 'O-5a 失败原因应记进 lastError');
    contains(e.O.formatForPrompt(), '正文内容在此', 'O-5a 送审失败后正文必须仍在提示词里');
  });
});

run('O-5b 未定论（pending）送审失败仍落 pending，且保留 AI 原话', function() {
  const e = mk();
  const c = e.O.create({ name: '待审案', content: 'x', fromPanel: true });
  eq(e.O.get(c.id).review.state, 'pending', 'O-5b 面板提交应为 pending');
  return e.O.review(c.id, { chat: function() { return Promise.resolve({ content: '不知道' }); } }).then(function(r) {
    notOk(r.ok, 'O-5b 本次送审应失败');
    const o = e.O.get(c.id);
    eq(o.review.state, 'pending', 'O-5b 应仍是 pending');
    contains(String(o.review.raw || ''), '不知道', 'O-5b AI 原话应落进 review.raw');
    eq(r.kept, '', 'O-5b 没有可保留的旧结论');
  });
});

run('O-5c 送审成功仍照常置 included（回归护栏）', function() {
  const e = mk();
  const c = e.O.create({ name: '正常案', content: 'x', fromPanel: true });
  return e.O.review(c.id, { chat: function() { return Promise.resolve({ content: '{"verdict":"include","reason":"可以"}' }); } }).then(function(r) {
    ok(r.ok, 'O-5c 应成功：' + JSON.stringify(r));
    eq(e.O.get(c.id).review.state, 'included', 'O-5c 应置 included');
  });
});

finish();

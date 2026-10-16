// ============================================================
// engine/outputs.js 单测（P54·第15条）
//
// 覆盖 P54·第12条深审里的两条「同一件事两套行为 / 静默覆盖」语义项：
//   O-3 手动与 AI 定论（settle）必须和 tick 自动定论走同一条 _settle：
//       一定应用 settleRules.affects、一定推系统通知。
//   O-5 送审失败时不得把上一轮的结论（included / revised / rejected）打回 pending ——
//       打回会让 formatForPrompt 只给「待审」提示，玩家已经看到的正文静默掉出提示词。
//   O-2 发酵 tick 的事务性：落盘失败 / 起手抛错必须整批回滚（内存与磁盘一致），
//       且对 GameState 的效果要等落盘成功后才施加（否则回滚会漏掉数值与系统通知）。
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
const noThrow = h.noThrow;
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
  const over = {
    GameState: gs,
    Storage: { getGlobal: function() { return { settings: { outputs: { enabled: true } } }; } },
    ToolExecutor: { WHITELIST: {}, _modifyStat: modifyStat }
  };
  if (opts.audits) {
    over.ErrorLog = {
      audit: function(mod, kind, detail) { opts.audits.push([mod, kind, String(detail)]); return true; },
      action: function() {}, error: function() {}, log: function() {}
    };
  }
  const sb = makeSandbox(over);
  // O-8：JSON 提取收敛到共享件 CardDiagnose.firstJsonObject；沙箱按裸名挂成上下文全局
  load(sb, 'engine/card_diagnose.js');
  sb.CardDiagnose = sb.window.CardDiagnose;
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

// ---------- O-7/O-9/O-10/O-11/O-12 收口（P54·第12条 outputs 余项） ----------

run('O-7a 卡带写 outputs:{} 时审核员能看到 P43 默认定论条件', function() {
  const e = mk({ card: { worldbook: { outputs: {} } } });
  const c = e.O.create({ name: '默认池案', content: '正文' });
  ok(c.ok, 'O-7a create 应成功');
  const prompt = String(e.O.buildReviewPrompt(e.O.get(c.id)) || '');
  contains(prompt, '定论条件：progress 涨到 100', 'O-7a 提示词应带引擎默认定论条件（原先被 wb.outputs 挡掉）');
});

run('O-7b 卡带没写 outputs 时不硬塞默认', function() {
  const e = mk({ card: { worldbook: {} } });
  const c = e.O.create({ name: '无卡带规则案', content: 'x' });
  const prompt = String(e.O.buildReviewPrompt(e.O.get(c.id)) || '');
  notOk(prompt.indexOf('【卡带对产出物的规定】') >= 0, 'O-7b 没声明 outputs 时不该出现该段');
});

run('O-9a 零调用方的 Outputs.remove 已删（不再复活）', function() {
  const e = mk();
  eq(typeof e.O.remove, 'undefined', 'O-9a remove 应已移除');
});

run('O-10a 死字段 _lastFermentDate 已删（含 clear() 里的重置）', function() {
  const e = mk();
  eq(e.O._lastFermentDate, undefined, 'O-10a 字段应不存在');
  const rt = e.O.getRuntime();
  notOk(rt && Object.prototype.hasOwnProperty.call(rt, '_lastFermentDate'), 'O-10a 运行时也不该有该键');
  e.O.clear();
  eq(e.O._lastFermentDate, undefined, 'O-10a clear() 也不该把它写回来（本批首轮就漏了这句，靠这条断言兜住）');
});

run('O-11a tick 的 progress 增长照旧写回（删自赋值后行为不变）', function() {
  const e = mk({ card: CARD_WITH_AFFECTS, time: '1-1-1' });
  const c = e.O.create({ name: '自赋值案', content: 'x' });
  const rt0 = e.O.getRuntime();
  rt0.outputs[c.id].progress = 0;
  rt0._lastIntervalKey = '';
  e.O.setRuntime(rt0);
  const t = e.O.tick();
  eq(t.fermented, true, 'O-11a tick 应真的跑了一轮');
  eq(e.O.getRuntime().outputs[c.id].progress, 5, 'O-11a 增长应写回运行时');
  eq(e.O.get(c.id).progress, 5, 'O-11a get() 也应看得到');
});

run('O-12a tick 定论留下 settled 汇总审计', function() {
  const audits = [];
  const e = mk({ card: CARD_WITH_AFFECTS, state: { hud: [{ key: '民心', value: 0 }], sidebar: [], panels: {} }, time: '1-1-1', audits: audits });
  const c = e.O.create({ name: '定论审计案', content: 'x' });
  const rt = e.O.getRuntime();
  rt.outputs[c.id].progress = 96;
  rt._lastIntervalKey = '';
  e.O.setRuntime(rt);
  e.O.tick();
  const hit = audits.filter(function(a) { return a[1] === 'tick_settled'; });
  eq(hit.length, 1, 'O-12a 应有一条 tick_settled 审计');
  contains(hit[0][2], '定论审计案', 'O-12a 审计应写明是哪一件');
});

run('O-12b 系统通知通道失败时不再静默（改留审计）', function() {
  const audits = [];
  const e = mk({ card: CARD_WITH_AFFECTS, state: { hud: [{ key: '民心', value: 0 }], sidebar: [], panels: {} }, audits: audits });
  const c = e.O.create({ name: '通知失败案', content: 'x' });
  e.gs._pendingSystemNotices = null;
  const r = e.O.settle(c.id, '手动定论');
  ok(r.ok, 'O-12b 定论本身仍应成功：' + JSON.stringify(r));
  eq(audits.filter(function(a) { return a[1] === 'settle_notice_failed'; }).length, 1, 'O-12b 应留一条 settle_notice_failed 审计');
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

run('O-5d 送审调用抛错不把「已纳入」打回 pending，reason 是新失败串', function() {
  const e = mk();
  const c = e.O.create({ name: '已纳入案·抛错', content: '正文内容在此' });
  ok(c.ok, 'O-5d create 应成功');
  const f = e.O.force(c.id, 'included', '上一轮已纳入');
  ok(f.ok, 'O-5d force 应成功：' + JSON.stringify(f));
  return e.O.review(c.id, { chat: function() { return Promise.reject(new Error('网络断了')); } }).then(function(r) {
    notOk(r.ok, 'O-5d 本次送审应失败');
    const o = e.O.get(c.id);
    eq(o.review.state, 'included', 'O-5d 状态应仍是 included');
    eq(r.kept, 'included', 'O-5d 返回值应说明保留了哪个状态');
    ok(String(r.reason).indexOf('网络断了') >= 0, 'O-5d 返回 reason 应是本次失败串：' + r.reason);
    ok(String(o.review.lastError || '').indexOf('网络断了') >= 0, 'O-5d 失败原因应记进 lastError');
    contains(e.O.formatForPrompt(), '正文内容在此', 'O-5d 送审抛错后正文必须仍在提示词里');
  });
});

// ---------- O-6 改写标题/正文/描述后作废已纳入的审核结论 ----------

run('O-6a 已纳入项改正文 ⇒ 退回 pending、未审正文不进提示词、回报 reviewReset', function() {
  const e = mk();
  const c = e.O.create({ name: '已纳入案', title: '旧标题', content: '旧正文内容', desc: '旧描述' });
  ok(c.ok, 'O-6a create 应成功');
  const f = e.O.force(c.id, 'included', '上一轮已纳入');
  ok(f.ok, 'O-6a force 应成功：' + JSON.stringify(f));
  contains(e.O.formatForPrompt(), '旧正文内容', 'O-6a 改写前正文应在提示词里');
  const u = e.O.update(c.id, { content: '新正文内容' });
  ok(u.ok, 'O-6a update 应成功：' + JSON.stringify(u));
  eq(u.reviewReset, true, 'O-6a 回报应说明审核结论已作废');
  const o = e.O.get(c.id);
  eq(o.review.state, 'pending', 'O-6a 应退回 pending');
  eq(o.content, '新正文内容', 'O-6a 正文应已改');
  ok(e.O.formatForPrompt().indexOf('新正文内容') < 0, 'O-6a 未审正文不得进提示词');
  contains(e.O.formatForPrompt(), '待审', 'O-6a 应显示待审提示');
});

run('O-6b 只改 keywords/audience、或 pending / none 项改文本 ⇒ 不作废审核结论', function() {
  const e = mk();
  const c1 = e.O.create({ name: 'A', content: 'x' });
  e.O.force(c1.id, 'included', 'ok');
  const u1 = e.O.update(c1.id, { keywords: ['k'], audience: ['城中百姓'] });
  eq(!!u1.reviewReset, false, 'O-6b 改关键词/受众不该作废审核');
  eq(e.O.get(c1.id).review.state, 'included', 'O-6b 状态应保持 included');

  const c2 = e.O.create({ name: 'B', content: 'x', fromPanel: true });
  const u2 = e.O.update(c2.id, { content: 'y' });
  eq(!!u2.reviewReset, false, 'O-6b pending 项改正文不触发作废');
  eq(e.O.get(c2.id).review.state, 'pending', 'O-6b 应仍 pending');

  const c3 = e.O.create({ name: 'C', content: 'x' });
  eq(e.O.get(c3.id).review.state, 'none', 'O-6b AI 直接发布应为 none');
  const u3 = e.O.update(c3.id, { content: 'z' });
  eq(!!u3.reviewReset, false, 'O-6b none 项改正文不触发作废');
  contains(e.O.formatForPrompt(), 'z', 'O-6b none 项改后仍照常进提示词');
});

run('O-6c 改写后重新送审成功 ⇒ 回到 included 并注入新正文', function() {
  const e = mk();
  const c = e.O.create({ name: 'D', content: '旧文本' });
  e.O.force(c.id, 'included', 'ok');
  const u = e.O.update(c.id, { content: '新文本' });
  eq(u.reviewReset, true, 'O-6c 改写应作废结论');
  return e.O.review(c.id, { chat: function() { return Promise.resolve({ content: '{"verdict":"include","reason":"可以"}' }); } }).then(function(r) {
    ok(r.ok, 'O-6c 重新送审应成功');
    eq(e.O.get(c.id).review.state, 'included', 'O-6c 应回到 included');
    contains(e.O.formatForPrompt(), '新文本', 'O-6c 新正文应在提示词里');
  });
});

// ---------- O-2 发酵 tick 的事务性：落盘失败 / 起手抛错 ⇒ 整批回滚 ----------
// 旧行为：先推进 _lastIntervalKey（内存）、最后才 save；落盘失败或循环外抛错时
//   内存键已推进 ⇒ 本会话永久跳过这个发酵周期，内存与磁盘还不一致；
//   只把键退回去也不行 —— 已应用的 progress 会在下个 tick 重复累加。
// 新行为：深拷贝快照 → 任何一步失败整批回滚；对 GameState 的效果（数值 / 系统通知）
//   推迟到落盘成功之后才施加，所以回滚是真事务（不会「数值加过了、产出物还在发酵中」）。

function mkTick(opts) {
  opts = opts || {};
  const e = mk({
    card: CARD_WITH_AFFECTS,
    state: { hud: [{ key: '民心', value: 0 }], sidebar: [], panels: {} },
    time: opts.time || '1-1-1',
    audits: opts.audits
  });
  const outputs = {};
  if (!opts.empty) {
    outputs.o1 = {
      id: 'o1', name: '祭典', title: '祭典', content: 'x', desc: '',
      fate: 'fermenting', progress: opts.progress == null ? 10 : opts.progress,
      audience: [], keywords: [], events: [], stirCooldowns: {},
      review: { state: 'none', reason: '', raw: '', at: '', round: 0 }
    };
  }
  e.O.setRuntime({ outputs: outputs, _lastIntervalKey: '' });
  return e;
}

function rolledBackAudits(audits) {
  return audits.filter(function(a) { return a[1] === 'tick_rolled_back'; });
}

run('O-2a 落盘抛错 ⇒ 整批回滚：键不推进、progress 不长、留痕 tick_rolled_back', function() {
  const audits = [];
  const e = mkTick({ audits: audits });
  const before = JSON.stringify(e.O.getRuntime());
  e.sb.VFS.writeFile = function() { throw new Error('存储满'); };
  let t = null;
  noThrow(function() { t = e.O.tick(); }, 'O-2a tick 不该把落盘异常抛给调用方');
  ok(t, 'O-2a 应返回结果对象');
  eq(t.fermented, false, 'O-2a 落盘失败不得报 fermented');
  eq(t.rolledBack, true, 'O-2a 应显式回报 rolledBack');
  eq(JSON.stringify(e.O.getRuntime()), before, 'O-2a 内存应整批回到快照（键与 progress 都不动）');
  eq(e.O.getRuntime()._lastIntervalKey, '', 'O-2a 周期键不得推进');
  eq(e.O.get('o1').progress, 10, 'O-2a progress 不得留在内存里');
  const hit = rolledBackAudits(audits);
  ok(hit.length === 1, 'O-2a 应留一条 tick_rolled_back 审计：' + JSON.stringify(audits));
  ok(String(hit[0][2]).indexOf('存储满') >= 0, 'O-2a 审计应带原始错误：' + JSON.stringify(hit[0]));
});

run('O-2b 落盘被拒（writeFile 返回 false，不抛错）⇒ 同样整批回滚', function() {
  const audits = [];
  const e = mkTick({ audits: audits });
  const before = JSON.stringify(e.O.getRuntime());
  e.sb.VFS.writeFile = function() { return false; };
  const t = e.O.tick();
  eq(t.fermented, false, 'O-2b 落盘被拒不得报 fermented');
  eq(t.rolledBack, true, 'O-2b 应回报 rolledBack');
  eq(JSON.stringify(e.O.getRuntime()), before, 'O-2b 内存应整批回到快照');
  const hit = rolledBackAudits(audits);
  ok(hit.length === 1 && String(hit[0][2]).indexOf('被拒') >= 0, 'O-2b 审计应写明「落盘被拒」：' + JSON.stringify(audits));
});

run('O-2c 回滚后重跑同一周期只累加一次，成功落盘后才推进键', function() {
  const e = mkTick({});
  const real = e.sb.VFS.writeFile;
  e.sb.VFS.writeFile = function() { return false; };
  eq(e.O.tick().rolledBack, true, 'O-2c 先制造一次落盘失败');
  e.sb.VFS.writeFile = real;
  const t2 = e.O.tick();
  eq(t2.fermented, true, 'O-2c 恢复落盘后应发酵成功');
  eq(e.O.get('o1').progress, 15, 'O-2c 只应累加一次（10→15）');
  eq(e.O.getRuntime()._lastIntervalKey, '1', 'O-2c 成功后键才推进');
  const t3 = e.O.tick();
  eq(t3.fermented, false, 'O-2c 同一周期不得二次发酵');
  eq(e.O.get('o1').progress, 15, 'O-2c 二次 tick 不得再加 progress');
});

run('O-2d 定论那一轮落盘失败 ⇒ GameState 侧效果（数值/通知）完全没施加', function() {
  const audits = [];
  const e = mkTick({ progress: 96, audits: audits });
  e.sb.VFS.writeFile = function() { throw new Error('存储满'); };
  const t = e.O.tick();
  eq(t.rolledBack, true, 'O-2d 应回报 rolledBack');
  eq(e.state.hud[0].value, 0, 'O-2d 定论数值不得在落盘失败时施加（真事务）');
  eq(e.gs._pendingSystemNotices.length, 0, 'O-2d 系统通知不得在落盘失败时推出');
  eq(e.O.get('o1').fate, 'fermenting', 'O-2d 产出物应仍是发酵中');
  eq(e.O.get('o1').progress, 96, 'O-2d progress 应回到 96');
  const hit = rolledBackAudits(audits);
  ok(hit.length === 1, 'O-2d 应留一条 tick_rolled_back 审计');
});

run('O-2e 定论成功 ⇒ 先落盘、后施加效果，settled/applied 契约不变', function() {
  const e = mkTick({ progress: 96 });
  const real = e.sb.VFS.writeFile;
  let valueAtWrite = null;
  let sawSettled = null;
  e.sb.VFS.writeFile = function(p, s) {
    valueAtWrite = e.state.hud[0].value;
    sawSettled = String(s).indexOf('"fate":"settled"') >= 0;
    return real(p, s);
  };
  const t = e.O.tick();
  eq(t.fermented, true, 'O-2e 应发酵成功');
  eq(valueAtWrite, 0, 'O-2e 落盘时数值还没施加（先落盘、后施加）');
  eq(sawSettled, true, 'O-2e 落盘内容里应已含定论结果');
  eq(e.state.hud[0].value, 5, 'O-2e 落盘成功后数值应施加 +5');
  eq(e.gs._pendingSystemNotices.length, 1, 'O-2e 应推 1 条系统通知');
  ok(t.settled.length === 1 && t.settled[0].id === 'o1', 'O-2e settled 契约应保留：' + JSON.stringify(t.settled));
  eq(t.settled[0].applied.length, 1, 'O-2e applied 应在落盘后回填：' + JSON.stringify(t.settled[0]));
  eq(t.settled[0].applied[0].statKey, '民心', 'O-2e applied 应记录属性名');
  ok(e.O.get('o1').fate === 'settled', 'O-2e 产出物应已定论');
});

run('O-2f 起手（listFermenting）抛错 ⇒ 也整批回滚 + 留痕', function() {
  const audits = [];
  const e = mkTick({ audits: audits });
  const before = JSON.stringify(e.O.getRuntime());
  e.O.listFermenting = function() { throw new Error('数据坏了'); };
  const t = e.O.tick();
  eq(t.rolledBack, true, 'O-2f 应回报 rolledBack');
  eq(t.fermented, false, 'O-2f 不得报 fermented');
  eq(JSON.stringify(e.O.getRuntime()), before, 'O-2f 内存应回到快照');
  const hit = rolledBackAudits(audits);
  ok(hit.length === 1 && String(hit[0][2]).indexOf('起手') >= 0, 'O-2f 审计应写明起手抛错：' + JSON.stringify(audits));
});

run('O-2g 没有发酵物时也收口落盘：键推进要落盘，落盘失败则回滚', function() {
  const ok1 = mkTick({ empty: true });
  const t1 = ok1.O.tick();
  eq(t1.fermented, true, 'O-2g 空批也应照常推进周期');
  const path = '/saves/card1/save1/outputs_runtime.json';
  const onDisk = ok1.sb.VFS.readJSON(path);
  ok(onDisk && onDisk._lastIntervalKey === '1', 'O-2g 周期键应已落盘：' + JSON.stringify(onDisk));

  const bad = mkTick({ empty: true, audits: [] });
  bad.sb.VFS.writeFile = function() { return false; };
  const t2 = bad.O.tick();
  eq(t2.rolledBack, true, 'O-2g 空批落盘失败也应回滚');
  eq(bad.O.getRuntime()._lastIntervalKey, '', 'O-2g 空批回滚后键不得推进');
});

run('O-2h 手动定论不传 defer ⇒ 效果立刻施加（O-3 通道一致不回归）', function() {
  const e = mkTick({ progress: 20 });
  const r = e.O.settle('o1', '玩家拍板');
  ok(r.ok, 'O-2h 手动定论应成功：' + JSON.stringify(r));
  eq(e.state.hud[0].value, 5, 'O-2h 手动定论应立即施加数值效果');
  eq(e.gs._pendingSystemNotices.length, 1, 'O-2h 手动定论应立即推通知');
  eq(e.O.get('o1').fate, 'settled', 'O-2h 应已定论');
  eq(r.applied.length, 1, 'O-2h 返回体应带 applied');
});

finish();

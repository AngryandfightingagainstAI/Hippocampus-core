// ============================================================
// RN 叙事页 smoke · 战役 4 · 批次 4-3a（P0+P1）
// 用法：node tools/story_smoke.js（cwd = RN 仓根；babel 配置已显式锚定仓根）
//
// A. story_changes 文本映射（全 type 分支 + 去重 + 跳过规则）
// B. story_store：富文本切分 / 骰子解析 / feed 入队 / 旧选项失效 /
//    页边骰序 / confirm Promise 流 / 不可变快照
// C. rn_platform 叙事壳：P0 返回值（Promise/数字）+ P1 入店 + 原链保留
// D. story_runtime：续玩四分支 + 历史重放 + 退出确认/清理
// E. 含 JSX 的 B 类文件经仓内 babel transform 语法验证
// ============================================================

'use strict';

var path = require('path');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

var StoryChanges = require(path.join(root, 'rn', 'story_changes.js'));
var StoryStore = require(path.join(root, 'rn', 'story_store.js'));
var NavStore = require(path.join(root, 'rn', 'nav_store.js'));

// ---------- 全局假件（engine 模块裸用风格，经 globalThis 注入）----------

var diceCfg = { enabled: true, showInStory: true };
globalThis.getDiceConfig = function () { return diceCfg; };

var fakeCard = { cardName: '测卡', display: { volume: '卷一 · 起', title: '测卡' } };
var gameTime = '1990-01-01 08:00';

function makeGameState(overrides) {
  return Object.assign({
    chatHistory: [],
    currentCard: fakeCard,
    currentCardId: null,
    currentSaveId: null,
    currentState: null,
    playerData: {},
    formatGameTime: function () { return gameTime; },
    loadFromSave: function () { return true; },
    persist: function () { persistCalls++; }
  }, overrides || {});
}
var persistCalls = 0;

globalThis.GameState = makeGameState();
globalThis.NpcRuntime = { _findDef: function () { return null; } };

var toolCalls = [];
globalThis.ToolExecutor = {
  strip: function (t) { return String(t == null ? '' : t).replace(/<<<TOOL>>>[\s\S]*?<<<END>>>/g, '').trim(); },
  formatDiceForUI: function (r) {
    return '🎲 ' + (r._label || 'd100 = 50');
  }
};
var loopCalls = [];
globalThis.StoryLoop = {
  busy: false,
  currentOptions: [],
  _regenContext: null,
  start: function () { loopCalls.push('start'); },
  callAI: function () { loopCalls.push('callAI'); },
  sendAction: function () {}
};

// ================= A. story_changes =================

(function () {
  globalThis.GameState.currentCard = { worldbook: { npcs: [{ id: 'n1', name: '老陈' }] } };
  var results = [
    { ok: true, type: 'hud', label: '体力', oldVal: 80, newVal: 75, delta: -5 },
    { ok: true, type: 'hud', key: 'san', oldVal: 50, newVal: 53, delta: 3 },
    { ok: true, type: 'relation', from: '我', to: '老陈', oldVal: 10, newVal: 13, delta: 3 },
    { ok: true, type: 'item', action: 'add', name: '铁剑' },
    { ok: true, type: 'item', action: 'remove', name: '铜钱' },
    { ok: true, type: 'event', action: 'trigger', eventName: '夜遇' },
    { ok: true, type: 'event', action: 'cancel', eventId: 'e2' },
    { ok: true, type: 'event', action: 'ban', eventId: 'e3' },
    { ok: true, type: 'event', action: 'unban', eventId: 'e4' },
    { ok: true, type: 'event', action: 'propose', eventName: '新事件' },
    { ok: true, type: 'task', action: 'add', taskName: '采药' },
    { ok: true, type: 'task', action: 'step', taskId: 't1', stepId: 's2' },
    { ok: true, type: 'task', action: 'complete', taskName: '采药' },
    { ok: true, type: 'task', action: 'fail', taskName: '采药' },
    { ok: true, type: 'task', action: 'abandon', taskName: '采药' },
    { ok: true, type: 'achievement', action: 'unlock', achievementName: '初出茅庐' },
    { ok: true, type: 'achievement', action: 'add', achievementName: '隐藏' },
    { ok: true, type: 'shop', action: 'buy', item: '米', count: 2, paid: 10, currency: '文' },
    { ok: true, type: 'shop', action: 'sell', item: '皮', earned: 5, currency: '文' },
    { ok: true, type: 'status', action: 'update', key: '伤势', newValue: '轻伤' },
    { ok: true, type: 'status', action: 'bulk', changes: [{ key: 'A', newValue: '1' }, { key: 'B', newValue: '2' }] },
    { ok: true, type: 'weather', action: 'set', weatherType: '雨', icon: '🌧' },
    { ok: true, type: 'npc_state', action: 'enter', npcId: 'n1' },
    { ok: true, type: 'npc_state', action: 'leave', npcId: 'n2' },
    { ok: true, type: 'npc_state', action: 'offstage', npcId: 'n3' },
    { ok: true, type: 'npc_state', action: 'scene_enter', npcId: 'n1' },
    { ok: true, type: 'npc_state', action: 'scene_leave', npcId: 'n1' },
    { ok: true, type: 'npc_state', action: 'follow', npcId: 'n1' },
    { ok: true, type: 'npc_state', action: 'unfollow', npcId: 'n1' },
    { ok: true, type: 'npc_state', action: 'reveal', name: '无名' },
    { ok: true, type: 'ending', action: 'trigger', endingName: '归隐' },
    { ok: true, type: 'node', action: 'enter', nodeName: '村口' },
    { ok: true, type: 'node', action: 'complete', nodeName: '村口' },
    { ok: true, type: 'foreshadow', action: 'bury', foreshadowName: '伏笔甲' },
    { ok: true, type: 'foreshadow', action: 'reveal', foreshadowName: '伏笔甲' },
    { ok: true, type: 'keyword' },
    { ok: true, label: '自定义', oldVal: 1, newVal: 2, delta: 1 },
    { ok: false, type: 'hud', label: '失败行', oldVal: 1, newVal: 2, delta: 1 },
    { ok: true, type2: 'dice', type: 'check' },
    { ok: true, type: 'query' },
    { ok: true, type: 'hud', label: '体力', oldVal: 80, newVal: 75, delta: -5 } // 重复去重
  ];
  var lines = StoryChanges.formatChangesForUI(results);
  var texts = lines.map(function (l) { return l.text; });
  function has(t) { return texts.indexOf(t) >= 0; }

  check('A1 行数（去重/跳过失败骰查询关键词）', lines.length === 37);
  check('A2 hud 带名', has('体力 -5（75）'));
  check('A3 hud key 回落', has('san +3（53）'));
  check('A4 relation', has('关系 我 → 老陈 +3（13）'));
  check('A5 item add/remove', has('获得物品：铁剑') && has('失去物品：铜钱'));
  check('A6 event 五态', has('事件触发：夜遇') && has('事件取消：e2') && has('事件封禁：e3') && has('事件解封：e4') && has('新事件提议：新事件'));
  check('A7 task 五态', has('新任务：采药') && has('任务步骤完成：t1/s2') && has('完成任务：采药') && has('任务失败：采药') && has('放弃任务：采药'));
  check('A8 achievement', has('成就解锁：初出茅庐') && has('新成就：隐藏'));
  check('A9 shop', has('购买 米 ×2（-10 文）') && has('出售 皮（+5 文）'));
  check('A10 status bulk', has('伤势 → 轻伤') && has('A → 1') && has('B → 2'));
  check('A11 weather', has('天气：雨 🌧'));
  check('A12 npc 名解析 worldbook', has('老陈 登场'));
  check('A13 npc 未知回落 id', has('n2 退场') && has('n3 退到后台'));
  check('A14 npc 六态', has('老陈 进入现场') && has('老陈 离开现场') && has('老陈 跟随你') && has('老陈 不再跟随') && has('身份揭示：无名'));
  check('A15 ending/node/foreshadow', has('结局达成：归隐') && has('进入节点：村口') && has('完成节点：村口') && has('埋下伏笔：伏笔甲') && has('伏笔回收：伏笔甲'));
  check('A16 fallback label', has('自定义 +1（2）'));
  check('A17 icon 字段保留（heart）', lines.filter(function (l) { return l.icon === 'heart'; }).length === 1);
  check('A18 空输入', StoryChanges.formatChangesForUI(null).length === 0);
  globalThis.GameState.currentCard = fakeCard;
})();

// ================= B. story_store =================

StoryStore.reset();

async function runB() {
  // 富文本切分
  var r1 = StoryStore.tokenizeLine('他走进客栈。');
  check('B1 纯文本单 run', r1.length === 1 && r1[0].t === '他走进客栈。' && r1[0].say === false);
  var r2 = StoryStore.tokenizeLine('他说：「客官里边请」');
  check('B2 直角引号对话', r2.length === 2 && r2[1].say === true && r2[1].t === '「客官里边请」');
  var r3 = StoryStore.tokenizeLine('“夜深了。”她低语，「嗯。」');
  check('B3 弯引号+直角混合', r3.length === 3 && r3[0].say === true && r3[2].say === true && r3[1].say === false);
  var paras = StoryStore.parseParas('第一段\n\n第二段「对话」');
  check('B4 空行过滤+两段', paras.length === 2 && paras[1].length === 2);

  // 骰子解析
  check('B5 🎲 剥离', StoryStore.parseDice('🎲 d100 = 50').body === 'd100 = 50');
  check('B6 🍀 剥离', StoryStore.parseDice('🍀 对抗 平').body === '对抗 平');
  eq('B7 含检定字样', StoryStore.parseDice('🎲 力量检定 成功').tag, '检定');
  eq('B8 目标比对形态', StoryStore.parseDice('61/55 → 失败').tag, '检定');
  eq('B9 对抗形态', StoryStore.parseDice('🍀 对抗').tag, '检定');
  eq('B10 普通掷骰', StoryStore.parseDice('🎲 d100 = 50').tag, '掷骰');
  check('B11 时间戳格式', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(StoryStore.nowStamp()));

  // 轮次（排除系统消息）
  globalThis.GameState = makeGameState({
    chatHistory: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: '行动一' },
      { role: 'assistant', content: '回一' },
      { role: 'user', content: '【系统 · 注入】' },
      { role: 'user', content: '行动二' }
    ]
  });
  eq('B12 currentRoundNum 排除系统', StoryStore.currentRoundNum(), 2);

  // 章头
  StoryStore.setChapter(0);
  var ch0 = StoryStore.getSnapshot().feed[0];
  check('B13 序章', ch0.kind === 'chapter' && ch0.sub === '序 章 · ' + gameTime && ch0.volume === '卷一 · 起');
  StoryStore.setChapter(3);
  var ch3 = StoryStore.getSnapshot().feed[1];
  eq('B14 第 N 轮', ch3.sub, '第 3 轮 · ' + gameTime);

  // 无游戏时间
  var origTime = gameTime;
  gameTime = '—';
  StoryStore.setChapter(1);
  var ch1 = StoryStore.getSnapshot().feed[2];
  eq('B15 — 时间不拼 sub', ch1.sub, '第 1 轮');
  gameTime = origTime;

  // hint / dice
  StoryStore.appendHint('（游戏开始）');
  StoryStore.appendDiceResult('🎲 d100 = 50');
  var feed = StoryStore.getSnapshot().feed;
  check('B16 hint 入队', feed[3].kind === 'hint' && feed[3].text === '（游戏开始）');
  check('B17 dice 入队', feed[4].kind === 'dice' && feed[4].tag === '掷骰' && feed[4].body === 'd100 = 50');

  // segment：段落/对话/meta/changes/options/页边骰序
  var toolResults = [
    { ok: true, type: 'hud', label: '体力', oldVal: 80, newVal: 79, delta: -1 },
    { ok: true, type2: 'dice', _label: '敏捷检定 成功' }
  ];
  StoryStore.appendSegment('夜色深沉。\n「请坐。」老者说。', ['进屋', '离开'], 30, toolResults, 1, null);
  var seg = StoryStore.getSnapshot().feed[5];
  check('B18 segment 形状', seg.kind === 'segment' && seg.paras.length === 2);
  check('B19 对话 run', seg.paras[1].length === 2 && seg.paras[1][0].say === true && seg.paras[1][1].say === false);
  check('B20 meta 含游戏时间增量', seg.metaLine === '[' + StoryStore.nowStamp() + ' · 游戏内 +30分 → ' + gameTime + ']');
  check('B21 changes 一条', seg.changes.length === 1 && seg.changes[0].text === '体力 -1（79）');
  check('B22 options 两则', seg.options.length === 2 && seg.options[0] === '进屋');
  var diceEntry = StoryStore.getSnapshot().feed[6];
  check('B23 页边骰紧随段（顺序）', diceEntry.kind === 'dice' && diceEntry.tag === '检定' && diceEntry.body === '敏捷检定 成功');

  // 第二段：旧选项失效
  StoryStore.appendSegment('又一段。', ['新选项'], 0, null, 2, null);
  var snap2 = StoryStore.getSnapshot();
  check('B24 旧段 options 清空', StoryStore.getSnapshot().feed[5].options.length === 0);
  check('B25 新段 options 在', snap2.feed[7].options.length === 1);

  // dice 配置关闭 → 无页边骰
  diceCfg.enabled = false;
  StoryStore.appendSegment('无骰段。', [], 0, toolResults, 3, null);
  check('B26 关闭骰子不追加', StoryStore.getSnapshot().feed[8].kind === 'segment' && StoryStore.getSnapshot().feed.length === 9);
  diceCfg.enabled = true;
  diceCfg.showInStory = false;
  StoryStore.appendSegment('不显示骰。', [], 0, toolResults, 4, null);
  check('B27 showInStory=false 不追加', StoryStore.getSnapshot().feed.length === 10);
  diceCfg.showInStory = true;

  // renderGame 信号
  var sb1 = StoryStore.getSnapshot().sidebarSeq;
  StoryStore.renderGame();
  eq('B28 sidebarSeq 递增', StoryStore.getSnapshot().sidebarSeq, sb1 + 1);

  // clear
  StoryStore.clear();
  eq('B29 clear 清空 feed', StoryStore.getSnapshot().feed.length, 0);

  // confirm Promise 流
  var p = StoryStore.confirmOpen('真的吗？', { okText: '好的' });
  check('B30 confirmOpen 返回 Promise', p && typeof p.then === 'function');
  check('B31 pending 上屏', !!StoryStore.getSnapshot().confirmPending);
  eq('B32 options 透传', StoryStore.getSnapshot().confirmPending.options.okText, '好的');
  var answered = null;
  p.then(function (v) { answered = v; });
  StoryStore.resolveConfirm(true);
  await Promise.resolve(); // 等 then 微任务落地
  eq('B33 resolve true 到达', answered, true);
  check('B34 pending 已清', StoryStore.getSnapshot().confirmPending === null);
  StoryStore.resolveConfirm(false); // 重复结算无效（不抛）
  eq('B35 重复结算不改结果', answered, true);

  // 取消流
  var p2 = StoryStore.confirmOpen('q');
  var answered2 = null;
  p2.then(function (v) { answered2 = v; });
  StoryStore.resolveConfirm(false);
  await Promise.resolve();
  eq('B36 取消 false', answered2, false);

  // 订阅与不可变快照
  var hits = 0;
  var unsub = StoryStore.subscribe(function () { hits++; });
  var snapA = StoryStore.getSnapshot();
  StoryStore.appendHint('x');
  check('B37 订阅通知 + 快照换引用', hits === 1 && StoryStore.getSnapshot() !== snapA);
  check('B38 条目带 id', StoryStore.getSnapshot().feed[0].id > 0);
  unsub();
  StoryStore.appendHint('y');
  eq('B39 退订', hits, 1);

  StoryStore.reset();
}

// ================= C. rn_platform 叙事壳链 =================

async function runC() {
  var RNPlatform = require(path.join(root, 'rn', 'rn_platform.js'));
  var base = {};
  RNPlatform.install(base);
  globalThis.Platform = base;
  globalThis.GameState = makeGameState(); // 清掉 B 组残留 chatHistory
  StoryStore.reset();
  NavStore.reset();

  // P0 返回值
  var rn0 = base.ui._currentRoundNum();
  check('C1 _currentRoundNum 返回数字', typeof rn0 === 'number' && rn0 === 0);
  var cp = base.ui.confirmAsync('问');
  check('C2 confirmAsync 返回 Promise（非 false）', cp && typeof cp.then === 'function');
  StoryStore.resolveConfirm(true);

  // P1 入店
  base.ui.renderChapterHead(1);
  base.ui.appendHint('（h）');
  base.ui.appendStory('正文「对话」', ['a', 'b'], 0, null, 1, null);
  base.ui.appendDiceResult('🎲 d100 = 1');
  var feed = StoryStore.getSnapshot().feed;
  check('C3 壳 → store 四类齐全',
    feed[0].kind === 'chapter' && feed[1].kind === 'hint' &&
    feed[2].kind === 'segment' && feed[3].kind === 'dice');

  // renderGame：侧栏计数 + topbar 导航信号
  var tb0 = NavStore.getSnapshot().topbarSeq;
  base.ui.renderGame();
  check('C4 renderGame 双信号',
    StoryStore.getSnapshot().sidebarSeq === 1 && NavStore.getSnapshot().topbarSeq === tb0 + 1);

  // clear
  base.ui.clearStory();
  eq('C5 clearStory', StoryStore.getSnapshot().feed.length, 0);

  // 原链保留：__calls 记录 + void 壳 false 语义
  var names = base.ui.__calls.map(function (r) { return r.name; });
  check('C6 __calls 日志链不断',
    names.indexOf('_currentRoundNum') >= 0 && names.indexOf('confirmAsync') >= 0 &&
    names.indexOf('appendStory') >= 0 && names.indexOf('renderGame') >= 0);
  eq('C7 P1 void 壳透传 false', base.ui.appendHint('z'), false);

  // Promise 完整流：业务侧 await 形态
  StoryStore.reset();
  var flow = base.ui.confirmAsync('退出？');
  var result = null;
  flow.then(function (v) { result = v; });
  base.ui.appendHint('弹窗期间叙事不入队冲突'); // 不影响 pending
  StoryStore.resolveConfirm(false);
  await Promise.resolve();
  eq('C8 业务 await 收到 false', result, false);

  // P2 四壳（4-3b）
  StoryStore.reset();
  base.ui.setBusy(true);
  check('C9 setBusy 壳', StoryStore.getSnapshot().busy === true);
  base.ui.setBusy(false);
  check('C9b setBusy 复位', StoryStore.getSnapshot().busy === false);
  base.ui.showStoryLoading();
  check('C10 showStoryLoading 壳', StoryStore.getSnapshot().loading === true);
  base.ui.showStoryError('炸了', { canRetry: true });
  var errEntry = StoryStore.getSnapshot().feed[0];
  check('C11 showStoryError 壳入流且清 loading',
    errEntry.kind === 'error' && errEntry.msg === '炸了' && errEntry.canRetry === true &&
    StoryStore.getSnapshot().loading === false);
  base.ui.toast('保存成功', { type: 'success' });
  var t = StoryStore.getSnapshot().toasts[0];
  check('C12 toast 壳', t && t.msg === '保存成功' && t.type === 'success');

  // P3 壳（4-3c）
  var seqBefore = StoryStore.getSnapshot().sidebarSeq;
  base.ui.renderSidebarExpanded();
  check('C13 renderSidebarExpanded 发 seq', StoryStore.getSnapshot().sidebarSeq === seqBefore + 1);
  globalThis.Proposals = {
    list: function () { return [{ id: 'cp1', type: 'changeX' }]; },
    describe: function () { return '体力临时修正'; }
  };
  base.ui.appendProposalCard('cp1');
  var cp = StoryStore.getSnapshot().feed[StoryStore.getSnapshot().feed.length - 1];
  check('C14 appendProposalCard 壳', cp.kind === 'proposal' && cp.pid === 'cp1' && cp.title === '体力临时修正');
  delete globalThis.Proposals;

  // C15（P8 根因回归 2026-10-01）：UI 全局别名 Platform.ui 时 ui 壳不得自递归。
  // 真机装载形态：base.ui 来自 platform_adapter（其每个 ui 方法都转发裸全局 UI），
  // rn_bootstrap.js:136 再令 UI 指向合并后的 Platform.ui ⇒ 修复前 Platform.ui.X
  // 会在 base→UI 之间无限回环（Hermes 约 269 层后栈溢出，且 bridge 每层重跑，
  // 一次逻辑调用扇出约 269 次入队）。此处用同一装载形态断言"一次逻辑调用 =
  // 一次入队"，锁死该回环不得复活。
  var Adapter = require(path.join(root, 'platform', 'platform_adapter.js'));
  var devBase = { ui: Adapter.ui };
  var savedUI = globalThis.UI;
  RNPlatform.install(devBase);
  globalThis.UI = devBase.ui;                 // 同 rn_bootstrap.js:136
  StoryStore.reset();
  var hintWrites = 0;
  var origHint = StoryStore.appendHint;
  StoryStore.appendHint = function (t) { hintWrites++; return origHint.apply(StoryStore, arguments); };
  devBase.ui.appendHint('（P8 回归）');
  StoryStore.appendHint = origHint;
  if (savedUI === undefined) delete globalThis.UI; else globalThis.UI = savedUI;
  check('C15 UI 别名 Platform.ui 时 appendHint 不自递归（1 次入队）', hintWrites === 1);
}

// ================= D. story_runtime =================

async function runD() {
  var Runtime = require(path.join(root, 'rn', 'story_runtime.js'));
  var RNPlatform = require(path.join(root, 'rn', 'rn_platform.js'));

  function resetWorld(overrides) {
    StoryStore.reset();
    NavStore.reset();
    loopCalls.length = 0;
    persistCalls = 0;
    globalThis.Platform = {};
    RNPlatform.install(globalThis.Platform);
    globalThis.GameState = makeGameState(overrides);
    globalThis.StoryLoop.busy = false;
    globalThis.StoryLoop.currentOptions = [];
    globalThis.StoryLoop._regenContext = null;
  }

  globalThis.LocalStore = { getItem: function () { return null; }, setItem: function () {} };

  // D1 无档
  globalThis.Storage = { getAllCards: function () { return { c1: fakeCard }; } };
  globalThis.Saves = { listAll: function () { return []; } };
  resetWorld();
  var r1 = await Runtime.continueLast();
  check('D1 no-save', r1.ok === false && r1.reason === 'no-save');

  // D2 装载失败
  globalThis.Saves.listAll = function () { return [{ cardId: 'c1', saveId: 's1' }]; };
  resetWorld({ loadFromSave: function () { return false; } });
  var r2 = await Runtime.continueLast();
  check('D2 load-failed', r2.ok === false && r2.reason === 'load-failed');

  // D3 无角色数据 → create-flow（P6·S2：真跳创角屏，不再只弹文案）
  resetWorld({ loadFromSave: function () { return true; }, playerData: { inventory: {} }, chatHistory: [] });
  var r3 = await Runtime.continueLast();
  check('D3 create-flow', r3.ok === false && r3.reason === 'create-flow');
  check('D3a 缺创角 ⇒ 真跳创角屏（routed + screen=create）',
    r3.routed === true && NavStore.getSnapshot().screen === 'create');

  // D4 无肖像 → portrait（P6·S2：真跳人设屏，不再只弹文案）
  var portraitStarts = 0;
  globalThis.UI_Portrait = { start: function (pd, cb) { portraitStarts++; NavStore.navigate('portrait'); } };
  resetWorld({ loadFromSave: function () { return true; }, playerData: { name: '陈七' }, chatHistory: [] });
  var r4 = await Runtime.continueLast();
  check('D4 portrait', r4.ok === false && r4.reason === 'portrait');
  check('D4a 缺人设 ⇒ 真跳人设屏（routed + start 调用 + screen=portrait）',
    r4.routed === true && portraitStarts === 1 && NavStore.getSnapshot().screen === 'portrait');
  delete globalThis.UI_Portrait;

  // D5 有肖像无历史 → fresh
  resetWorld({
    loadFromSave: function () { return true; },
    playerData: { name: '陈七', portrait: { summary: '一张脸' } },
    chatHistory: []
  });
  var r5 = await Runtime.continueLast();
  check('D5 fresh 成功', r5.ok === true && r5.mode === 'fresh');
  eq('D5a 已切到 story 屏', NavStore.getSnapshot().screen, 'story');
  eq('D5b StoryLoop.start 调用', loopCalls.join(','), 'start');
  check('D5c renderGame 信号', StoryStore.getSnapshot().sidebarSeq >= 1);

  // D6 有历史末条 assistant → resume + replay
  var history = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: '我进店' },
    { role: 'assistant', content: '【正文】\n老者抬头。\n「客官。」\n【选项】\n1. 坐下\n2. 离开', meta: null },
    { role: 'user', content: '【系统 · 投骰】' },
    { role: 'assistant', content: '雨下起来了。' }
  ];
  resetWorld({
    loadFromSave: function () { return true; },
    playerData: { name: '陈七', portrait: { summary: '脸' } },
    chatHistory: history
  });
  var r6 = await Runtime.continueLast();
  check('D6 resume 成功', r6.ok === true && r6.mode === 'resume');
  var feed = StoryStore.getSnapshot().feed;
  var kinds = feed.map(function (e) { return e.kind; });
  // Electron 忠实行为：系统 user 不出 hint；末条 assistant 非玩家输入时
  // continueLast 追加「（已回到上次的进度）」尾 hint（ui_cards L170）
  check('D7 重放顺序（系统 user 不出 hint + 尾进度 hint）',
    kinds.join(',') === 'hint,chapter,segment,chapter,segment,hint');
  var seg1 = feed[2];
  check('D8 正文正则提取+对话 run',
    seg1.paras.length === 2 && seg1.paras[1][0] && seg1.paras[1][0].say === true);
  // 多段重放后首段选项已被第二段按 Electron DOM 语义移除（B22/B24 同机制）
  eq('D9 多段重放后首段选项最终清空（同 DOM 删除语义）', seg1.options.length, 0);
  var hintTexts = feed.filter(function (e) { return e.kind === 'hint'; }).map(function (e) { return e.text; });
  check('D10 系统消息不出 hint（2 条=游戏开始+已回进度）',
    hintTexts.length === 2 && hintTexts[0] === '（游戏开始）');
  eq('D10a 尾 hint 为已回进度', hintTexts[1], '（已回到上次的进度）');
  // 末轮 assistant 无选项 → currentOptions 被置空（ui_core L409 每轮覆写，忠实行为）
  eq('D10b 末轮无选项 currentOptions 清空', globalThis.StoryLoop.currentOptions.length, 0);
  check('D10c 无 callAI（末条 assistant）', loopCalls.length === 0);
  check('D11 尾条目为进度 hint', feed[feed.length - 1].kind === 'hint');

  // 单段历史直接 replay：选项经【选项】正则解析后保留为最新段选项，
  // 且 StoryLoop.currentOptions 同步（ui_core L408-409）
  resetWorld({
    loadFromSave: function () { return true; },
    playerData: { name: '陈七', portrait: { summary: '脸' } },
    chatHistory: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: '行动' },
      { role: 'assistant', content: '【正文】\n只有一段。\n【选项列表】\n1) 选项甲\n2、选项乙' }
    ]
  });
  Runtime.replayHistory();
  var onlyFeed = StoryStore.getSnapshot().feed;
  eq('D11a 单段重放条目数', onlyFeed.length, 3);
  check('D11b 选项两种编号解析', onlyFeed[2].options.join(',') === '选项甲,选项乙');
  eq('D11c currentOptions 同步保留', globalThis.StoryLoop.currentOptions.join(','), '选项甲,选项乙');

  // D7 末条真实 user → resume-pending + 300ms callAI
  var history2 = history.concat([{ role: 'user', content: '我要打听消息' }]);
  resetWorld({
    loadFromSave: function () { return true; },
    playerData: { name: '陈七', portrait: { summary: '脸' } },
    chatHistory: history2
  });
  var r7 = await Runtime.continueLast();
  check('D12 resume-pending', r7.ok === true && r7.mode === 'resume-pending');
  var lastHint = StoryStore.getSnapshot().feed.filter(function (e) { return e.kind === 'hint'; }).pop();
  eq('D13 续接提示', lastHint.text, '（上次未完成，正在续接…）');
  await new Promise(function (res) { setTimeout(res, 360); });
  eq('D14 300ms 后 callAI', loopCalls.join(','), 'callAI');

  // D8 退出：busy/确认取消 → 中断
  resetWorld({
    currentCardId: 'c1', currentSaveId: 's1', currentState: { sidebar: [] }
  });
  globalThis.StoryLoop.busy = false;
  var exitPromise = Runtime.exitGame();
  // 弹框未决：立即拒绝
  StoryStore.resolveConfirm(false);
  var exited1 = await exitPromise;
  eq('D15 取消退出返回 false', exited1, false);
  check('D16 取消未清场', !!globalThis.GameState.currentCardId && persistCalls === 0);

  // 确认退出
  var exitPromise2 = Runtime.exitGame();
  StoryStore.resolveConfirm(true);
  var exited2 = await exitPromise2;
  eq('D17 确认退出 true', exited2, true);
  eq('D18 persist 调用一次', persistCalls, 1);
  check('D19 字段清理',
    globalThis.GameState.currentCardId === null &&
    globalThis.GameState.chatHistory.length === 0 &&
    globalThis.GameState._totalTokens === 0 &&
    globalThis.StoryLoop.busy === false &&
    globalThis.StoryLoop.currentOptions.length === 0);
  eq('D20 回主页', NavStore.getSnapshot().screen, 'home');

  // busy 文案分支可走通（不细断文案，只验证确认框出现与确认后退出）
  resetWorld({ currentCardId: 'c1', currentSaveId: 's1', currentState: {} });
  globalThis.StoryLoop.busy = true;
  var ep3 = Runtime.exitGame();
  check('D21 busy 时也弹确认', !!StoryStore.getSnapshot().confirmPending);
  StoryStore.resolveConfirm(true);
  check('D22 busy 确认后退出', await ep3 === true);

  // 非进行中：无确认直接退
  resetWorld();
  var exited4 = await Runtime.exitGame();
  eq('D23 非游戏中直接退出 true', exited4, true);
  eq('D24 无 confirm 弹窗', StoryStore.getSnapshot().confirmPending, null);

  StoryStore.reset();
  NavStore.reset();
}

// ================= F. story_store P2（busy/loading/error/toast）=================

function runF() {
  StoryStore.reset();

  // busy
  check('F1 busy 初始 false', StoryStore.getSnapshot().busy === false);
  var snapBusy0 = StoryStore.getSnapshot();
  StoryStore.setBusy(false); // 同值不换引用
  check('F2 setBusy 同值不通知', StoryStore.getSnapshot() === snapBusy0);
  StoryStore.setBusy(true);
  check('F3 setBusy true', StoryStore.getSnapshot().busy === true);
  StoryStore.setBusy(1);
  check('F3b 真值归一', StoryStore.getSnapshot().busy === true);

  // loading：appendSegment / appendError / clear 复位（同 Electron DOM 移除点）
  StoryStore.setLoading(true);
  check('F4 setLoading', StoryStore.getSnapshot().loading === true);
  StoryStore.appendSegment('正文落地。', [], 0, null, 1, null);
  check('F5 appendSegment 清 loading', StoryStore.getSnapshot().loading === false);
  StoryStore.setLoading(true);
  StoryStore.appendError('网络断了', { canRetry: true, canGoSettings: true });
  var snapF = StoryStore.getSnapshot();
  var errE = snapF.feed[snapF.feed.length - 1];
  check('F6 appendError 入流且清 loading',
    errE.kind === 'error' && errE.msg === '网络断了' &&
    errE.canRetry === true && errE.canGoSettings === true &&
    typeof errE.id === 'number' && snapF.loading === false);
  StoryStore.appendError('纯消息');
  var errE2 = StoryStore.getSnapshot().feed[StoryStore.getSnapshot().feed.length - 1];
  check('F7 无 options 无动作键', errE2.canRetry === false && errE2.canGoSettings === false);
  StoryStore.setLoading(true);
  StoryStore.clear();
  check('F8 clear 清 feed 与 loading',
    StoryStore.getSnapshot().feed.length === 0 && StoryStore.getSnapshot().loading === false);

  // toast 队列（ui_prompt L117-152 语义）
  var id1 = StoryStore.pushToast('普通');
  var t1 = StoryStore.getSnapshot().toasts[0];
  check('F9 info 默认 3000ms 非手动',
    t1.id === id1 && t1.type === 'info' && t1.manual === false && t1.duration === 3000);
  var id2 = StoryStore.pushToast('炸了', { type: 'error' });
  var t2 = StoryStore.getSnapshot().toasts[1];
  check('F10 error 默认手动 0ms', t2.id === id2 && t2.type === 'error' && t2.manual === true && t2.duration === 0);
  StoryStore.pushToast('成了', { type: 'success' });
  check('F11 success 自动', StoryStore.getSnapshot().toasts[2].manual === false);
  StoryStore.pushToast('警告', { type: 'warn', manual: true });
  check('F12 warn+manual 覆盖', StoryStore.getSnapshot().toasts[3].manual === true);
  StoryStore.pushToast('短显', { duration: 500 });
  check('F13 duration 覆盖', StoryStore.getSnapshot().toasts[4].duration === 500);
  check('F14 id 单调', id2 > id1);
  StoryStore.dismissToast(id1);
  check('F15 dismiss 移除',
    StoryStore.getSnapshot().toasts.length === 4 &&
    StoryStore.getSnapshot().toasts[0].id === id2);
  var snapBefore = StoryStore.getSnapshot();
  StoryStore.dismissToast(999999);
  check('F16 dismiss 不存在 id 无副作用', StoryStore.getSnapshot() === snapBefore);

  // reset 全清
  StoryStore.setBusy(true);
  StoryStore.setLoading(true);
  StoryStore.reset();
  var rSnap = StoryStore.getSnapshot();
  check('F17 reset 清 P2 态',
    rSnap.busy === false && rSnap.loading === false && rSnap.toasts.length === 0 &&
    rSnap.feed.length === 0 && rSnap.confirmPending === null);
}

// ================= G. story_store P3（侧栏开关 + 提议卡）=================

function runG() {
  StoryStore.reset();

  check('G1 抽屉初始关', StoryStore.getSnapshot().sidebarOpen === false);
  var snapG0 = StoryStore.getSnapshot();
  StoryStore.closeSidebar(); // 已关不发信号
  check('G2 close 同态无信号', StoryStore.getSnapshot() === snapG0);
  StoryStore.openSidebar();
  check('G3 open', StoryStore.getSnapshot().sidebarOpen === true);
  StoryStore.openSidebar(); // 已开不换引用
  check('G3b open 同态无信号', StoryStore.getSnapshot().sidebarOpen === true);
  StoryStore.closeSidebar();
  check('G4 close', StoryStore.getSnapshot().sidebarOpen === false);

  StoryStore.appendProposalCard({ pid: 'g1', title: '体力修正', reason: '赶路疲惫' });
  var gc = StoryStore.getSnapshot().feed[0];
  check('G5 proposal 卡形状',
    gc.kind === 'proposal' && gc.pid === 'g1' && gc.title === '体力修正' &&
    gc.reason === '赶路疲惫' && gc.status === 'pending' && gc.accepting === false &&
    typeof gc.id === 'number');
  StoryStore.appendProposalCard({ pid: 'g2', title: '二张' });
  StoryStore.updateProposal('g1', { status: 'accepted', statusText: '已接受 · 时辰', accepting: false });
  var g1Now = StoryStore.getSnapshot().feed[0];
  check('G6 卡面原地更新（g2 不动）',
    g1Now.status === 'accepted' && g1Now.statusText === '已接受 · 时辰' &&
    StoryStore.getSnapshot().feed[1].pid === 'g2');
  var snapG1 = StoryStore.getSnapshot();
  StoryStore.updateProposal('g1', { status: 'accepted', statusText: '已接受 · 时辰', accepting: false });
  check('G7 无变化不换引用', StoryStore.getSnapshot() === snapG1);
  StoryStore.updateProposal('nope', { status: 'accepted' });
  check('G8 未知 pid 无信号', StoryStore.getSnapshot() === snapG1);

  StoryStore.reset();
  check('G9 reset 抽屉关', StoryStore.getSnapshot().sidebarOpen === false);
}

// ================= H. story_proposals 交互全分支 =================

async function waitForPending() {
  for (var i = 0; i < 20; i++) {
    if (StoryStore.getSnapshot().confirmPending) return true;
    await Promise.resolve();
  }
  return !!StoryStore.getSnapshot().confirmPending;
}

function proposalCard(pid) {
  var feed = StoryStore.getSnapshot().feed;
  for (var i = 0; i < feed.length; i++) {
    if (feed[i].kind === 'proposal' && feed[i].pid === pid) return feed[i];
  }
  return null;
}
function feedHints() {
  return StoryStore.getSnapshot().feed
    .filter(function (e) { return e.kind === 'hint'; })
    .map(function (e) { return e.text; });
}
function lastToast() {
  var ts = StoryStore.getSnapshot().toasts;
  return ts.length ? ts[ts.length - 1] : null;
}
function baseProposals(over) {
  return Object.assign({
    list: function () { return [{ id: 'hx', type: 'x', reason: 'r' }]; },
    describe: function (p) { return 'D:' + p.type; },
    confirm: async function () { return { ok: true, label: '默认' }; },
    reject: function () { return { ok: true }; }
  }, over || {});
}

async function runH() {
  var StoryProposals = require(path.join(root, 'rn', 'story_proposals.js'));
  StoryStore.reset();
  StoryProposals.reset();
  globalThis.GameState = makeGameState();
  globalThis.GameState.formatGameTime = function () { return '洪武三年 · 辰时'; };
  var persist0 = persistCalls;

  // appendCard：现查 list/describe；缺 id/空 id/缺 Proposals 静默
  globalThis.Proposals = baseProposals();
  StoryProposals.appendCard('hx');
  check('H1 卡入流', (function () {
    var e = proposalCard('hx');
    return e && e.title === 'D:x' && e.reason === 'r';
  })());
  StoryProposals.appendCard('missing');
  StoryProposals.appendCard('');
  check('H2 查无/空 id 不入卡', StoryStore.getSnapshot().feed.filter(function (e) { return e.kind === 'proposal'; }).length === 1);

  // accept 成功分支
  globalThis.Proposals = baseProposals({
    confirm: async function () { return { ok: true, label: '好感 +1' }; }
  });
  await StoryProposals.accept('hx');
  var h1 = proposalCard('hx');
  check('H3 accepted 卡面', h1.status === 'accepted' && h1.statusText === '已接受 · 洪武三年 · 辰时' && h1.accepting === false);
  check('H4 接受 hint', feedHints().indexOf('（已接受提议：好感 +1）') >= 0);
  eq('H5 persist 一次', persistCalls, persist0 + 1);
  check('H5b 无 toast', StoryStore.getSnapshot().toasts.length === 0);

  // 防重入：in-flight 二次 accept 不重复 confirm；in-flight reject 走 warn toast
  StoryStore.reset();
  StoryProposals.reset();
  var confirmHits = 0;
  var resolveInflight = null;
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h2', type: 'x' }]; },
    confirm: function () {
      confirmHits++;
      return new Promise(function (res) { resolveInflight = res; });
    }
  });
  StoryProposals.appendCard('h2');
  var inflightP = StoryProposals.accept('h2');
  StoryProposals.accept('h2'); // 静默吞
  eq('H6 防重入 confirm 只一次', confirmHits, 1);
  StoryProposals.reject('h2');
  var warnT = lastToast();
  check('H7 处理中 reject 拦截 warn', warnT && warnT.type === 'warn' && warnT.msg === '该提议正在处理中');
  resolveInflight({ ok: true, label: 'L' });
  await inflightP;
  check('H8 in-flight 落地 accepted', proposalCard('h2').status === 'accepted');

  // needsConfirm：玩家「仍然执行」→ skipSemanticCheck 二次 confirm + 强制 hint
  StoryStore.reset();
  StoryProposals.reset();
  var confirmArgs = [];
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h3', type: 'x' }]; },
    confirm: async function (id, opts) {
      confirmArgs.push(opts || null);
      if (!opts || !opts.skipSemanticCheck) return { ok: false, needsConfirm: true, reason: '状态已变' };
      return { ok: true, label: '强推' };
    }
  });
  StoryProposals.appendCard('h3');
  var p3 = StoryProposals.accept('h3');
  check('H9 二次确认框挂起', await waitForPending());
  var pending = StoryStore.getSnapshot().confirmPending;
  check('H10 确认文案与按钮',
    pending.message === '状态已变\n\n仍然执行吗？' &&
    pending.options.okText === '仍然执行' && pending.options.cancelText === '取消');
  StoryStore.resolveConfirm(true);
  await p3;
  check('H11 二次 confirm 带 skipSemanticCheck',
    confirmArgs.length === 2 && confirmArgs[1].skipSemanticCheck === true);
  check('H12 强制接受 hint', feedHints().indexOf('（已强制接受提议：强推）') >= 0);

  // needsConfirm：玩家取消 → 卡回 pending，无 hint 无错误 toast
  StoryStore.reset();
  StoryProposals.reset();
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h4', type: 'x' }]; },
    confirm: async function () { return { ok: false, needsConfirm: true, reason: '不妥' }; }
  });
  StoryProposals.appendCard('h4');
  var p4 = StoryProposals.accept('h4');
  await waitForPending();
  StoryStore.resolveConfirm(false);
  await p4;
  check('H13 取消后仍 pending', proposalCard('h4').status === 'pending');
  check('H14 取消无 hint', feedHints().length === 0);

  // 普通失败 → 接受失败 toast
  StoryStore.reset();
  StoryProposals.reset();
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h5', type: 'x' }]; },
    confirm: async function () { return { ok: false, reason: '冲突了' }; }
  });
  StoryProposals.appendCard('h5');
  await StoryProposals.accept('h5');
  var t5 = lastToast();
  check('H15 接受失败 toast', t5 && t5.type === 'error' && t5.msg === '接受失败：冲突了');
  check('H15b 卡仍 pending', proposalCard('h5').status === 'pending');

  // confirm 抛异常 → 异常 toast
  StoryStore.reset();
  StoryProposals.reset();
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h6', type: 'x' }]; },
    confirm: async function () { throw new Error('炸了'); }
  });
  StoryProposals.appendCard('h6');
  await StoryProposals.accept('h6');
  var t6 = lastToast();
  check('H16 异常 toast', t6 && t6.type === 'error' && t6.msg === '异常：炸了');

  // reject 成功 / 失败
  StoryStore.reset();
  StoryProposals.reset();
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h7', type: 'x' }]; },
    reject: function () { return { ok: true }; }
  });
  StoryProposals.appendCard('h7');
  StoryProposals.reject('h7');
  var h7 = proposalCard('h7');
  check('H17 rejected 卡面', h7.status === 'rejected' && h7.statusText === '已拒绝 · 洪武三年 · 辰时');

  StoryStore.reset();
  StoryProposals.reset();
  globalThis.Proposals = baseProposals({
    list: function () { return [{ id: 'h8', type: 'x' }]; },
    reject: function () { return { ok: false, reason: '没有这条' }; }
  });
  StoryProposals.appendCard('h8');
  StoryProposals.reject('h8');
  var t8 = lastToast();
  check('H18 拒绝失败 toast', t8 && t8.type === 'error' && t8.msg === '拒绝失败：没有这条');

  StoryProposals.reset();
  delete globalThis.Proposals;
  StoryStore.reset();
}

// ================= I. 提示词工具协议结构断言（P9·S1 防回退）=================
// 依据：桌面 engine/core/prompt_builder.js 工具协议段含 4 条手机工具
//   （npc_knows 与 request_deduction 之间）；RN 同段曾 0 命中。
//   本组只读源文件做文本断言，防 S1 再次回退。

function runI() {
  var fs = require('fs');
  function src(rel) {
    try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return ''; }
  }
  var pb = src('engine/core/prompt_builder.js');
  check('I1 prompt_builder 含 info_send(to, text) 工具协议', pb.indexOf('info_send(to, text)') >= 0);
  check('I2 prompt_builder 含 info_broadcast( 工具协议', pb.indexOf('info_broadcast(') >= 0);
  check('I3 prompt_builder 含 info_read( 工具协议', pb.indexOf('info_read(') >= 0);
  check('I4 prompt_builder 含 info_promote( 工具协议', pb.indexOf('info_promote(') >= 0);

  // ---- P9 各 S 项专属源码断言（逐条防回退；字符串以直读磁盘为准）----

  // S3：dialog.alert 收口到 StoryStore.pushToast（不许在调用点各加 toast）
  var rnp = src('rn/rn_platform.js');
  check('I5 S3 alert 壳存在（alert: function (msg)）', rnp.indexOf('alert: function (msg)') >= 0);
  check('I6 S3 alert 收口到 StoryStore.pushToast(String(msg)',
    rnp.indexOf('StoryStore.pushToast(String(msg)') >= 0);

  // S4：预算降级时系统通知回填（render(lv) 包装 + notices.slice() 回填）
  check('I7 S4 prompt_builder 有 render(lv) 包装', pb.indexOf('const render = (lv) =>') >= 0);
  check('I8 S4 每次重渲染前回填 _pendingSystemNotices',
    pb.indexOf('GameState._pendingSystemNotices = notices.slice()') >= 0);

  // S5：后台/定时落盘接线
  var boot = src('rn/rn_bootstrap.js');
  check('I9 S5 bootstrap 注册 lifecycle.onBackground',
    boot.indexOf('onBackground(function () { persistNow(true); })') >= 0);
  check('I10 S5 bootstrap 注册 lifecycle.onPageHide',
    boot.indexOf('onPageHide(function () { persistNow(false); })') >= 0);
  check('I11 S5 bootstrap 30s 前台 interval',
    boot.indexOf('setInterval(function () { persistNow(true); }, 30000)') >= 0);

  // S6：PanelHost 提到根层 App.tsx
  var app = src('App.tsx');
  check('I12 S6 App.tsx 挂载 PanelHost', app.indexOf('<PanelHostModule.PanelHost />') >= 0);

  // S8：GM_DEFAULTS 同时挂 globalThis（RN 无 window）
  check('I13 S8 prompt_builder 挂 globalThis.GM_DEFAULTS',
    pb.indexOf('globalThis.GM_DEFAULTS = GM_DEFAULTS') >= 0);

  // S9：删卡带危险提示补全（逐字照桌面）
  var cards = src('rn/screens/CardsScreen.js');
  check('I14 S9 确认正文含「点"确定"会同时删除所有存档。」',
    cards.indexOf('点"确定"会同时删除所有存档。') >= 0);
  check('I15 S9 确认正文含「如果只想删卡带保留存档，点"取消"」',
    cards.indexOf('如果只想删卡带保留存档，点"取消"') >= 0);
  check('I16 S9 取消后导出备份 info toast',
    cards.indexOf('已取消。想保留存档的话，目前请先导出卡带备份，再删除。') >= 0);

  // S11：重审人设后 invalidateCache 补齐
  var prn = src('rn/ui_portrait_rn.js');
  check('I17 S11 人设屏有 applyPortrait 收口', prn.indexOf('function applyPortrait(portrait)') >= 0);
  check('I18 S11 applyPortrait 内调 GameState.invalidateCache()',
    prn.indexOf('GameState.invalidateCache()') >= 0);
  check('I19 S11 confirm 分支走 applyPortrait', prn.indexOf('applyPortrait(portrait)') >= 0);
  check('I20 S11 skip 分支走 applyPortrait', prn.indexOf('applyPortrait(fb)') >= 0);

  // S12：clip2 档保留块尾行与结束标记
  check('I21 S12 有 _isTailLine 原语', pb.indexOf('_isTailLine(l)') >= 0);
  check('I22 S12 _clipItemLines 命中块尾行即整段保留',
    pb.indexOf('inItem && this._isTailLine(l)') >= 0);
  check('I23 S12 _keepFirstItem 停止收纳后仍收块尾行',
    pb.indexOf('if (stopped) {') >= 0 && pb.indexOf('if (this._isTailLine(l)) out.push(l);') >= 0);

  // S14：预算口径与降级可见出口
  var sd = src('rn/components/SidebarDrawer.js');
  check('I24 S14 侧栏读 _lastTrimmedLevel', sd.indexOf('_lastTrimmedLevel') >= 0);
  check('I25 S14 侧栏有「已降级 N 档」可见出口', sd.indexOf('已降级') >= 0);
}

// ================= J. 人设屏 S11 行为断言（P9）=================
// 依据：重审人设后必须把新总述写回 playerData 并作废 _cachedStaticDynamic，
//   否则第三部分（旧总述）与第四部分（新「角色声音提醒」）自相矛盾。
//   ui_portrait_rn.js 是 A 类（零 React / 零 RN 依赖），可直 require。

function runJ() {
  var savedGS = globalThis.GameState;
  var savedPortrait = globalThis.Portrait;
  var savedPlatform = globalThis.Platform;

  var gs = {
    playerData: {},
    _cachedStaticDynamic: 'OLD_SUMMARY',
    chatHistory: [],
    invalidateCache: function () { this._cachedStaticDynamic = null; },
    persist: function () { gs._persisted = (gs._persisted || 0) + 1; }
  };
  globalThis.GameState = gs;
  globalThis.Portrait = {
    save: function () {},
    fallback: function (pd) {
      return { summary: '（兜底总述）', traits: ['原始'], lockedAt: 'T', aiVersion: 0 };
    }
  };
  globalThis.Platform = { ui: { appendHint: function () {} } };

  var UI_Portrait = require(path.join(root, 'rn', 'ui_portrait_rn.js'));

  // J1：confirm ⇒ playerData.portrait 更新 + 缓存作废 + 落盘
  gs._cachedStaticDynamic = 'OLD_SUMMARY';
  UI_Portrait.confirm({ summary: '新总述', traits: ['冷酷', '多疑'], lockedAt: 'T2', aiVersion: 1 });
  check('J1 S11 confirm 后 playerData.portrait 为新总述',
    gs.playerData.portrait && gs.playerData.portrait.summary === '新总述');
  check('J2 S11 confirm 后 GameState._cachedStaticDynamic === null（缓存作废）',
    gs._cachedStaticDynamic === null);
  check('J3 S11 confirm 后调用了 GameState.persist', (gs._persisted || 0) >= 1);

  // J4：skip 分支同样收口（跳过不许绕过 invalidateCache）
  gs._cachedStaticDynamic = 'OLD_SUMMARY';
  gs.playerData = {};
  UI_Portrait.skip();
  check('J4 S11 skip 后 playerData.portrait 为兜底总述',
    gs.playerData.portrait && gs.playerData.portrait.summary === '（兜底总述）');
  check('J5 S11 skip 后 GameState._cachedStaticDynamic === null',
    gs._cachedStaticDynamic === null);

  globalThis.GameState = savedGS;
  globalThis.Portrait = savedPortrait;
  globalThis.Platform = savedPlatform;
}

// ================= E. babel transform（含 JSX 的 B 类）=================

function runE() {
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  ['rn/story_store.js', 'rn/story_changes.js', 'rn/story_runtime.js',
   'rn/story_proposals.js', 'rn/rn_platform.js', 'rn/components/OverlayHost.js',
   'rn/components/SidebarDrawer.js',
   'rn/screens/StoryScreen.js', 'rn/screens/HomeScreen.js'].forEach(function (rel) {
    try {
      babel.transformFileSync(path.join(root, rel), {
        cwd: root,
        configFile: path.join(root, 'babel.config.js')
      });
      ok++; console.log('PASS: E babel transform ' + rel);
    } catch (e) {
      fail++; console.log('FAIL: E babel transform ' + rel + ' :: ' + e.message);
    }
  });
}

runB().then(runC).then(runD).then(function () {
  runF();
  runG();
  return runH();
}).then(function () {
  runI();
  runJ();
  runE();
  console.log('STORY_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
}).catch(function (e) {
  console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

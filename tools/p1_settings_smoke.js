// ============================================================
// P1 · 桌面对齐补齐 smoke（cwd 必须是 RN 仓根：node tools/p1_settings_smoke.js）
// 覆盖本轮各包的 A 类纯逻辑假数据断言；随包递增。
//   P1-C：思考块 meta 裁剪（story_store.filterThinkingMeta）+ 段落入队集成
//         + ThinkingBlock/StoryScreen babel transform
//   P1-D：快照行内动作编排（regenerate / rollbackToRound）+ 段 round 字段
//   P1-E：报错面板数据层（panel_data.computeErrorLog / clearErrorLog）
//   P1-F：内置示例卡（cards_demo.js 逐字节 + rn_bootstrap 装载）
//   P1-G：卡带分类审核（classify.js 两仓 DIFF 2 处 + 5 纯函数 + 无 key 禁用）
//   P1-I：调试面板数据层（I-3）+ promptAsync 等价物（I-2）
//         + NPC 推演/调整 动作编排（I-1）+ AI 指令模板 6 段（I-4）
//   P1-A：导入单存档（Model.importSaveFromJson 四拒绝 + 成功落 VFS）
//         + 导出结构 { global, vfs }（DataTab.doExportAll 两路数据源）
//   P1-B：主题槽位 存/取/改名/删 往返 + 主题包 导出/导入 往返（Theme）
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

var StoryStore = require(path.join(root, 'rn', 'story_store.js'));

// ---------- 全局假件（engine 模块裸用风格，经 globalThis 注入）----------
var thinkCfg = { showReasoning: true, showSearch: true, showUsage: true };
globalThis.getThinkingConfig = function () { return thinkCfg; };
globalThis.getDiceConfig = function () { return { enabled: false, showInStory: false }; };
globalThis.GameState = {
  chatHistory: [],
  currentCard: null,
  formatGameTime: function () { return '—'; }
};

var REASONING = '先看看牌面。';
var SEARCHES = [{
  keyword: '夜雨', ok: true, backend: 'bocha', count: 3, duration: 128,
  results: [{ title: '条目一', url: 'https://x/1', snippet: '片段' }]
}];
var USAGE = { total_tokens: 100, prompt_tokens: 60, completion_tokens: 40 };
var FULL = { reasoning: REASONING, searches: SEARCHES, usage: USAGE, ts: 1234567890 };

// ================= P1-C：思考块 meta 裁剪 =================

(function () {
  var f = StoryStore.filterThinkingMeta;
  var ALLON = { showReasoning: true, showSearch: true, showUsage: true };

  var full = f(FULL, ALLON);
  check('P1C-1 三项全开 → 全保留',
    full && full.reasoning === REASONING &&
    full.searches === SEARCHES && full.usage === USAGE);
  eq('P1C-2 ts 不参与渲染故不复制', full.ts, undefined);

  eq('P1C-3 meta 为 null → null', f(null, ALLON), null);
  eq('P1C-4 meta 空对象 → null', f({}, ALLON), null);
  eq('P1C-5 只有 ts → null', f({ ts: 1 }, ALLON), null);

  var noReason = f(FULL, { showReasoning: false, showSearch: true, showUsage: true });
  check('P1C-6 关思维链 → reasoning 裁掉，其余保留',
    noReason && noReason.reasoning === undefined &&
    noReason.searches === SEARCHES && noReason.usage === USAGE);

  var noSearch = f(FULL, { showReasoning: true, showSearch: false, showUsage: true });
  check('P1C-7 关搜索 → searches 裁掉，其余保留',
    noSearch && noSearch.searches === undefined &&
    noSearch.reasoning === REASONING && noSearch.usage === USAGE);

  var noUsage = f(FULL, { showReasoning: true, showSearch: true, showUsage: false });
  check('P1C-8 关 Token → usage 裁掉，其余保留',
    noUsage && noUsage.usage === undefined &&
    noUsage.reasoning === REASONING && noUsage.searches === SEARCHES);

  eq('P1C-9 三项全关 → null',
    f(FULL, { showReasoning: false, showSearch: false, showUsage: false }), null);

  eq('P1C-10 searches 空数组不计', f({ searches: [] }, ALLON), null);

  // usage 全 0：过滤器只判对象存在（同 ui_core L681），空判在渲染层
  var zeroUsage = { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };
  var z = f({ usage: zeroUsage }, ALLON);
  check('P1C-11 usage 全 0 仍保留（空判在 ThinkingBlock 层，同 UI_Thinking.render）',
    z && z.usage === zeroUsage);

  // 缺 cfg → 走全局 getThinkingConfig
  var viaGlobal = f(FULL);
  check('P1C-12 缺 cfg 走全局 getThinkingConfig',
    viaGlobal && viaGlobal.reasoning === REASONING && viaGlobal.usage === USAGE);

  // 全局缺失 → 三项全开兜底（同 storage.js 缺省语义）
  var saved = globalThis.getThinkingConfig;
  delete globalThis.getThinkingConfig;
  var viaFallback = f(FULL);
  check('P1C-13 全局缺失 → 三项全开兜底',
    viaFallback && viaFallback.reasoning === REASONING &&
    viaFallback.searches === SEARCHES && viaFallback.usage === USAGE);
  globalThis.getThinkingConfig = saved;
})();

// ================= P1-C：appendSegment 集成（裁剪时机同 ui_core）=================

(function () {
  StoryStore.reset();
  thinkCfg = { showReasoning: true, showSearch: true, showUsage: true };

  StoryStore.appendSegment('正文一。', [], 0, null, 1, FULL);
  var seg0 = StoryStore.getSnapshot().feed[0];
  check('P1C-14 段条目存 thinking',
    seg0.kind === 'segment' && seg0.thinking &&
    seg0.thinking.reasoning === REASONING &&
    seg0.thinking.searches === SEARCHES &&
    seg0.thinking.usage.total_tokens === 100);

  thinkCfg = { showReasoning: false, showSearch: true, showUsage: true };
  StoryStore.appendSegment('正文二。', [], 0, null, 2, FULL);
  var seg1 = StoryStore.getSnapshot().feed[1];
  check('P1C-15 关思维链后入队，新段已裁',
    seg1.thinking && seg1.thinking.reasoning === undefined && seg1.thinking.usage === USAGE);

  check('P1C-16 已落段不随后改开关变化（同时机同桌面）',
    seg0.thinking.reasoning === REASONING);

  thinkCfg = { showReasoning: false, showSearch: false, showUsage: false };
  StoryStore.appendSegment('正文三。', [], 0, null, 3, FULL);
  eq('P1C-17 三项全关 → thinking null（不渲染）',
    StoryStore.getSnapshot().feed[2].thinking, null);

  thinkCfg = { showReasoning: true, showSearch: true, showUsage: true };
  StoryStore.appendSegment('正文四。', [], 0, null, 4, null);
  eq('P1C-18 meta 为 null → thinking null', StoryStore.getSnapshot().feed[3].thinking, null);

  StoryStore.appendSegment('正文五。', [], 0, null, 5, {});
  eq('P1C-19 meta 空对象 → thinking null', StoryStore.getSnapshot().feed[4].thinking, null);

  StoryStore.reset();
})();

// ================= P1-D：快照行内动作编排 =================

async function runD() {
  var SnapshotActions = require(path.join(root, 'rn', 'snapshot_actions.js'));

  // ---------- 假件 ----------
  var toasts = [];
  var hints = [];
  var confirms = [];
  var confirmQueue = [];
  var clearCalls = 0, topbarCalls = 0, sideCalls = 0;

  globalThis.Platform = {
    ui: {
      toast: function (msg, opts) { toasts.push({ msg: msg, type: (opts && opts.type) || 'info' }); },
      appendHint: function (t) { hints.push(t); },
      confirmAsync: function (msg) {
        confirms.push(msg);
        var v = confirmQueue.length ? confirmQueue.shift() : true;
        return Promise.resolve(v);
      },
      clearStory: function () { clearCalls++; },
      renderChapterHead: function () {},
      appendStory: function () {},
      renderTopbar: function () { topbarCalls++; },
      renderSidebarExpanded: function () { sideCalls++; }
    }
  };

  var snapList = [];
  var rollbackLastCalls = 0, rollbackToArgs = [];
  var rollbackLastResult = { ok: true, snap: { gameTime: '1990-01-01' } };
  var rollbackToResult = { ok: true, snap: { gameTime: '1990-01-01' } };
  globalThis.Snapshots = {
    list: function () { return snapList.slice(); },
    rollbackLast: function () { rollbackLastCalls++; return rollbackLastResult; },
    rollbackTo: function (round) { rollbackToArgs.push(round); return rollbackToResult; }
  };

  var deletedLogs = 2;
  globalThis.Logger = { deleteLogsAfter: function () { return deletedLogs; } };

  // P6·S3-5：regenerate 由 confirmAsync 改为 StoryStore.promptOpen 收多行
  // 意见（桌面 ui_snapshot.js:18-27 的 textarea，文案逐字）。断言随之改
  // mock promptOpen（事实变更：mock 目标从 Platform.ui.confirmAsync 迁移）。
  var promptQueue = [];
  var promptCalls = [];
  var realPromptOpen = StoryStore.promptOpen;
  StoryStore.promptOpen = function (message, initial, opts) {
    promptCalls.push({ message: message, initial: initial, opts: opts });
    return Promise.resolve(promptQueue.length ? promptQueue.shift() : null);
  };

  globalThis.GameState = {
    chatHistory: [{ role: 'user', content: '我进店' }, { role: 'assistant', content: '老者抬眼。' }],
    currentCardId: 'c1',
    currentSaveId: 's1'
  };

  globalThis.StoryLoop = {
    busy: false,
    _regenContext: null,
    retryLastCalls: 0,
    retryLast: function () { this.retryLastCalls++; }
  };

  function resetCalls() {
    toasts.length = 0; hints.length = 0; confirms.length = 0; confirmQueue.length = 0;
    promptQueue.length = 0; promptCalls.length = 0;
    clearCalls = 0; topbarCalls = 0; sideCalls = 0;
    rollbackLastCalls = 0; rollbackToArgs.length = 0;
    globalThis.StoryLoop.retryLastCalls = 0;
  }
  function lastToast() { return toasts.length ? toasts[toasts.length - 1] : null; }

  // lastAssistantText 取末条 assistant
  eq('P1D-1 lastAssistantText 取末条 assistant',
    SnapshotActions.lastAssistantText(), '老者抬眼。');

  // --- regenerate ---
  resetCalls();
  globalThis.StoryLoop.busy = true;
  eq('P1D-2 busy 时不发起', await SnapshotActions.regenerate(), false);
  check('P1D-3 busy toast warn', lastToast() && lastToast().type === 'warn' && lastToast().msg === 'AI 正在生成，稍等');
  eq('P1D-4 busy 不调 rollbackLast', rollbackLastCalls, 0);
  globalThis.StoryLoop.busy = false;

  resetCalls();
  snapList = [];
  eq('P1D-5 无快照返回 false', await SnapshotActions.regenerate(), false);
  check('P1D-6 无快照 toast 逐字',
    lastToast() && lastToast().type === 'warn' && lastToast().msg === '没有可重新生成的轮次');

  resetCalls();
  snapList = [{ round: 1 }, { round: 2 }];
  promptQueue = [null];
  eq('P1D-7 取消意见输入返回 false', await SnapshotActions.regenerate(), false);
  check('P1D-8 取消后未回滚', rollbackLastCalls === 0 && globalThis.StoryLoop.retryLastCalls === 0);
  check('P1D-9 意见弹窗走 promptOpen（multiline + 桌面逐字回滚提示）',
    promptCalls.length === 1 &&
    promptCalls[0].message.indexOf('告诉 AI 你对这一轮哪里不满意') === 0 &&
    !!promptCalls[0].opts && promptCalls[0].opts.multiline === true);

  resetCalls();
  globalThis.StoryLoop.retryLastCalls = 0;
  promptQueue = [''];
  eq('P1D-10 空意见仍继续返回 true', await SnapshotActions.regenerate(), true);
  eq('P1D-11 rollbackLast 调用一次', rollbackLastCalls, 1);
  check('P1D-12 _regenContext 存被否决输出、comment 空',
    globalThis.StoryLoop._regenContext &&
    globalThis.StoryLoop._regenContext.rejected === '老者抬眼。' &&
    globalThis.StoryLoop._regenContext.comment === '');
  check('P1D-13 重放历史 + 重跑', clearCalls === 1 && globalThis.StoryLoop.retryLastCalls === 1);
  check('P1D-14 回退日志 hint', hints.indexOf('（已回退日志 2 条）') >= 0);

  resetCalls();
  promptQueue = ['  太温柔了  '];
  eq('P1D-14b 意见非空透传返回 true', await SnapshotActions.regenerate(), true);
  eq('P1D-14c _regenContext.comment = 玩家意见（trim）', globalThis.StoryLoop._regenContext.comment, '太温柔了');

  resetCalls();
  rollbackLastResult = { ok: false, reason: '没有快照' };
  promptQueue = [''];
  eq('P1D-15 rollbackLast 失败返回 false', await SnapshotActions.regenerate(), false);
  check('P1D-16 回滚失败 toast 逐字',
    lastToast() && lastToast().type === 'error' && lastToast().msg === '回滚失败：没有快照');
  check('P1D-17 失败不重跑', globalThis.StoryLoop.retryLastCalls === 0);
  rollbackLastResult = { ok: true, snap: { gameTime: '1990-01-01' } };

  // --- rollbackToRound ---
  resetCalls();
  globalThis.StoryLoop.busy = true;
  eq('P1D-18 回退 busy 拦截', await SnapshotActions.rollbackToRound(1), false);
  globalThis.StoryLoop.busy = false;

  resetCalls();
  snapList = [{ round: 1 }, { round: 2 }];
  eq('P1D-19 找不到目标轮', await SnapshotActions.rollbackToRound(9), false);
  check('P1D-20 toast 逐字',
    lastToast() && lastToast().type === 'warn' && lastToast().msg === '找不到这一轮的快照');

  resetCalls();
  eq('P1D-21 最新轮无需回退返回 false', await SnapshotActions.rollbackToRound(2), false);
  check('P1D-22 toast 逐字',
    lastToast() && lastToast().type === 'info' && lastToast().msg === '这已经是最新轮次，无需回退');

  resetCalls();
  confirmQueue = [false];
  eq('P1D-23 取消确认返回 false', await SnapshotActions.rollbackToRound(1), false);
  eq('P1D-24 取消不回滚', rollbackToArgs.length, 0);
  check('P1D-25 回退确认文案含轮次与丢弃轮数',
    confirms[0].indexOf('回退到第 1 轮开始前，会丢弃之后的 1 轮') >= 0);

  resetCalls();
  confirmQueue = [true];
  eq('P1D-26 确认返回 true', await SnapshotActions.rollbackToRound(1), true);
  check('P1D-27 rollbackTo 目标轮', rollbackToArgs.length === 1 && rollbackToArgs[0] === 1);
  check('P1D-28 三条收尾（topbar/侧栏/重放/尾 hint）',
    topbarCalls === 1 && sideCalls === 1 && clearCalls === 1 &&
    hints.indexOf('（已回退到第 1 轮，可以改你当时的输入）') >= 0);
  check('P1D-29 回退日志 hint', hints.indexOf('（已回退日志 2 条）') >= 0);

  resetCalls();
  rollbackToResult = { ok: false, reason: '快照不存在' };
  confirmQueue = [true];
  eq('P1D-30 rollbackTo 失败返回 false', await SnapshotActions.rollbackToRound(1), false);
  check('P1D-31 失败 toast 逐字',
    lastToast() && lastToast().type === 'error' && lastToast().msg === '回退失败：快照不存在');
  rollbackToResult = { ok: true, snap: { gameTime: '1990-01-01' } };

  // 还原真 promptOpen，供后续 P1I2 组测真实实现
  StoryStore.promptOpen = realPromptOpen;
}

// ================= P1-D：段条目 round 字段 =================

(function () {
  StoryStore.reset();
  globalThis.GameState.formatGameTime = function () { return '—'; };
  StoryStore.appendSegment('正文。', [], 0, null, 7, null);
  eq('P1D-32 段存 round', StoryStore.getSnapshot().feed[0].round, 7);
  StoryStore.appendSegment('序章段。', [], 0, null, 0, null);
  eq('P1D-33 round 0 → 0（不渲染动作区）', StoryStore.getSnapshot().feed[1].round, 0);
  StoryStore.appendSegment('缺参段。', [], 0, null, undefined, null);
  eq('P1D-34 round 缺参 → 0', StoryStore.getSnapshot().feed[2].round, 0);
  StoryStore.reset();
})();

// ================= P1-E：报错面板数据层 =================

(function () {
  var PanelData = require(path.join(root, 'rn', 'panels', 'panel_data.js'));

  // 未装载 → 空态
  delete globalThis.ErrorLog;
  var e0 = PanelData.computeErrorLog();
  check('P1E-1 ErrorLog 未装载 → 空态逐字',
    e0.errors.length === 0 && e0.count === 0 && e0.emptyText === '没有捕获到错误');

  // 假 ErrorLog（item 形状照 error_log_core.js:89-97）
  var loadCalls = 0, clearCalls = 0;
  var rawErrors = [
    { time: '10:00:00', timeFull: '2026-09-30 10:00:00', type: 'Error', message: '第一条', stack: 'a\nb',
      context: { screen: 'story', cardId: 'c1', saveId: 's1', round: 1, gameTime: '第1天' } },
    { time: '10:05:00', timeFull: '2026-09-30 10:05:00', type: 'PromiseRejection', message: '第二条', stack: '',
      context: { screen: 'home', cardId: '?', saveId: '?', round: '?', gameTime: '?' } }
  ];
  globalThis.ErrorLog = {
    _load: function () { loadCalls++; return rawErrors.length; },
    _state: { errors: rawErrors },
    clear: function () { clearCalls++; }
  };

  var v = PanelData.computeErrorLog();
  eq('P1E-2 _load 被调用一次', loadCalls, 1);
  eq('P1E-3 条数', v.count, 2);
  check('P1E-4 倒序（新错误在前）', v.errors[0].message === '第二条' && v.errors[1].message === '第一条');
  eq('P1E-5 最新条 index = 总数', v.errors[0].index, 2);
  eq('P1E-6 次新条 index', v.errors[1].index, 1);
  check('P1E-7 字段映射（time/timeFull/type/stack）',
    v.errors[1].time === '10:00:00' && v.errors[1].timeFull === '2026-09-30 10:00:00' &&
    v.errors[1].type === 'Error' && v.errors[1].stack === 'a\nb');
  check('P1E-8 现场（屏幕/卡带/轮次）',
    v.errors[1].screen === 'story' && v.errors[1].cardId === 'c1' && v.errors[1].round === 1);
  check('P1E-9 现场字段直取（第二条 screen=home / round=?）',
    v.errors[0].screen === 'home' && v.errors[0].cardId === '?' && v.errors[0].round === '?');

  globalThis.ErrorLog._state = {};
  var v2 = PanelData.computeErrorLog();
  check('P1E-10 _state.errors 缺失 → 空态',
    v2.errors.length === 0 && v2.count === 0 && v2.emptyText === '没有捕获到错误');

  globalThis.ErrorLog._state = { errors: [] };
  var v3 = PanelData.computeErrorLog();
  check('P1E-11 空数组 → 空态逐字', v3.count === 0 && v3.emptyText === '没有捕获到错误');

  globalThis.ErrorLog._load = function () { throw new Error('boom'); };
  globalThis.ErrorLog._state = { errors: rawErrors };
  var v4 = PanelData.computeErrorLog();
  eq('P1E-12 _load 抛异常仍返回内存态', v4.count, 2);

  PanelData.clearErrorLog();
  eq('P1E-13 clearErrorLog 调 core.clear', clearCalls, 1);

  delete globalThis.ErrorLog;
  try { PanelData.clearErrorLog(); ok++; console.log('PASS: P1E-14 ErrorLog 未装载时 clearErrorLog 不抛'); }
  catch (e) { fail++; console.log('FAIL: P1E-14 ErrorLog 未装载时 clearErrorLog 不抛 :: ' + e.message); }
})();

// ================= P1-F：内置示例卡（逐字节搬入 + 装载）=================

(function () {
  var fs = require('fs');
  var crypto = require('crypto');
  var p = path.join(root, 'engine', 'core', 'cards_demo.js');

  check('P1F-1 RN 侧 engine/core/cards_demo.js 存在', fs.existsSync(p));
  if (!fs.existsSync(p)) return;

  var buf = fs.readFileSync(p);
  //  P30：原来拿「桌面冻结值」锁 RN 文件（2457/AA393C3F…），但桌面是 CRLF、RN 是 LF（同内容），
  //    行尾归一后两份逐字符相同（见 p30_baseline_probe.js），故改锁 RN 自己的现盘值。
  eq('P1F-2 RN 侧字节数 2407（桌面同内容 CRLF 版为 2457）', buf.length, 2407);
  eq('P1F-3 RN 侧 MD5（桌面同内容 CRLF 版为 AA393C3F50A4C2FD0F732D29C95115C4）',
    crypto.createHash('md5').update(buf).digest('hex').toUpperCase(),
    'E7937FAC502B33328E2AED7A8CFBD19C');

  var CARDS = require(p);
  check('P1F-4 导出 CARDS["demo_v1"]（示例卡带）',
    !!(CARDS && CARDS['demo_v1'] && CARDS['demo_v1'].cardName === '示例卡带'));
  eq('P1F-5 demo_v1 schemaVersion', CARDS['demo_v1'].schemaVersion, '1.2');
  check('P1F-6 demo_v1 fatigue segments 三档',
    Array.isArray(CARDS['demo_v1'].sidebar) && CARDS['demo_v1'].sidebar[0].segments.length === 3);

  var bsSrc = fs.readFileSync(path.join(root, 'rn', 'rn_bootstrap.js'), 'utf8');
  check('P1F-7 rn_bootstrap 装载 CARDS', bsSrc.indexOf("load('CARDS'") >= 0);
})();

// ================= P1-G：卡带分类审核 =================

(function () {
  var fs = require('fs');
  var src = fs.readFileSync(path.join(root, 'engine', 'classify.js'), 'utf8');

  // 两仓 DIFF 只应 2 处：① window→globalThis ② 闭包内导出块
  eq('P1G-1 第①处：globalThis.CardClassify = {', src.indexOf('\n  globalThis.CardClassify = {') >= 0, true);
  check('P1G-2 原 window.CardClassify 已不存在', src.indexOf('window.CardClassify') < 0);
  check('P1G-3 第②处：闭包内 module.exports 导出口',
    src.indexOf('module.exports = { extractAllNumbers: extractAllNumbers') >= 0);
  check('P1G-4 导出块在 })(); 之前（闭包内）',
    src.indexOf('module.exports = { extractAllNumbers') < src.lastIndexOf('})();'));

  var Pure = require(path.join(root, 'engine', 'classify.js'));
  check('P1G-5 导出 5 个纯函数',
    typeof Pure.extractAllNumbers === 'function' && typeof Pure.normItem === 'function' &&
    typeof Pure.buildPrompt === 'function' && typeof Pure.parseSuggestions === 'function' &&
    typeof Pure.applyMovements === 'function');

  // 样本卡：fame_port 放错在 hud，应被建议移到 panel.3
  var sampleCard = {
    cardId: 't1', cardName: '测试卡带',
    game: { title: '测试世界' },
    hud: [
      { key: 'hp', name: '生命', type: 'number', current: 10, max: 20 },
      { key: 'fame_port', name: '港口声望', type: 'number', current: 5 }
    ],
    sidebar: [],
    panels: [{ num: 3, name: '声望', entries: [] }]
  };

  var items = Pure.extractAllNumbers(sampleCard);
  eq('P1G-6 extractAllNumbers 取到 2 条', items.length, 2);
  var prompt = Pure.buildPrompt(sampleCard, items);
  check('P1G-7 buildPrompt 产出含卡名（游戏：测试世界）', prompt.indexOf('游戏：测试世界') >= 0);
  check('P1G-8 buildPrompt 含条目行（key="hp" / key="fame_port"）',
    prompt.indexOf('key="hp"') >= 0 && prompt.indexOf('key="fame_port"') >= 0);
  check('P1G-9 buildPrompt 含位置字典（hud / panel.3）',
    prompt.indexOf('hud      →') >= 0 && prompt.indexOf('panel.3  →') >= 0);

  var sampleJSON = '{"suggestions":[{"key":"hp","to":"hud","reason":"位置正确"},' +
    '{"key":"fame_port","to":"panel.3","reason":"声望应在声望面板"}]}';
  var sgs = Pure.parseSuggestions(sampleJSON, items);
  check('P1G-10 parseSuggestions 吃样本 JSON 出 2 条', !!sgs && sgs.length === 2);
  check('P1G-11 fame_port 建议目标 = panel.3',
    sgs[1].key === 'fame_port' && sgs[1].to === 'panel.3' && sgs[1].from === 'hud' && sgs[1].changed === true);
  check('P1G-12 hp 应判原位（changed=false）', sgs[0].key === 'hp' && sgs[0].changed === false);
  check('P1G-13 代码块包裹也能解析',
    !!Pure.parseSuggestions('```json\n' + sampleJSON + '\n```', items));
  check('P1G-14 非 JSON 返回 null', Pure.parseSuggestions('完全不相关的一段话', items) === null);

  var r = Pure.applyMovements(sampleCard, sgs, { hp: true, fame_port: true });
  eq('P1G-15 movedCount = 1', r.movedCount, 1);
  check('P1G-16 卡带 JSON 真变了：hud 只剩 hp',
    r.card.hud.length === 1 && r.card.hud[0].key === 'hp');
  check('P1G-17 卡带 JSON 真变了：panel.3 收下 fame_port',
    r.card.panels[0].entries.length === 1 && r.card.panels[0].entries[0].key === 'fame_port');
  check('P1G-18 原卡带未被就地改动（深拷贝）', sampleCard.hud.length === 2);
  eq('P1G-19 未勾选则不移动',
    Pure.applyMovements(sampleCard, sgs, { hp: true, fame_port: false }).movedCount, 0);

  // 无 key ⇒ 按钮禁用依据（ApiManager.getActive 为空）
  var UiClassify = require(path.join(root, 'rn', 'ui_classify_rn.js'));
  globalThis.ApiManager = { getActive: function () { return null; } };
  check('P1G-20 无 key ⇒ hasApiKey() false（按钮禁用依据）', UiClassify.hasApiKey() === false);
  globalThis.ApiManager = { getActive: function () { return { name: 'x', key: 'k' }; } };
  check('P1G-21 有 key ⇒ hasApiKey() true', UiClassify.hasApiKey() === true);
  delete globalThis.ApiManager;

  // 存卡口径（照 applyAndSave:430-439）
  var stored = null;
  globalThis.Storage = {
    getAllCards: function () { return { t1: sampleCard }; },
    getImportedCards: function () { return {}; },
    setImportedCards: function (o) { stored = o; }
  };
  eq('P1G-22 loadCard 取到样本卡', UiClassify.loadCard('t1').cardName, '测试卡带');
  var saved = UiClassify.saveClassified('t1', r.card);
  check('P1G-23 meta.classified = true', saved.meta && saved.meta.classified === true);
  check('P1G-24 meta.classifiedAt 为 ISO', /^\d{4}-\d{2}-\d{2}T/.test(String(saved.meta.classifiedAt)));
  check('P1G-25 meta.classifiedSnapshot 去掉 meta 自身',
    !!saved.meta.classifiedSnapshot && saved.meta.classifiedSnapshot.meta === undefined);
  check('P1G-26 落 imported 层且等于整卡', !!stored && stored.t1 === saved);
  delete globalThis.Storage;

  // 源码级：无 key 时按钮禁用 + 文案说明；入口按钮在 CardsScreen
  var scrSrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'ClassifyScreen.js'), 'utf8');
  check('P1G-27 分析按钮 disabled 依据 hasKey', scrSrc.indexOf('disabled={busy || !hasKey}') >= 0);
  check('P1G-28 无 key 有文案说明', scrSrc.indexOf('请先在设置 → AI 添加并启用一个 API 配置。') >= 0);
  check('P1G-29 应用 toast 逐字照桌面 :442',
    scrSrc.indexOf("'已应用分类，移动了 ' + r.movedCount + ' 条数值。\\n\\n卡带已标记为\"已分类\"。'") >= 0);
  check('P1G-30 不可解析文案逐字照桌面 :240',
    scrSrc.indexOf('AI 返回无法解析，请重试。原始内容（开头 400 字）：') >= 0);
  var cardsSrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'CardsScreen.js'), 'utf8');
  check('P1G-31 CardsScreen 行内「分类审核」入口', cardsSrc.indexOf('UiClassify.start(id)') >= 0);
  var appSrc = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  check('P1G-32 App.tsx classify 路由分支', appSrc.indexOf("currentScreen === 'classify'") >= 0);
})();

// ================= P1-I · I-3：调试面板数据层 =================

(function () {
  var PanelData = require(path.join(root, 'rn', 'panels', 'panel_data.js'));

  // 全缺省 → 不抛，空态
  delete globalThis.Snapshots;
  delete globalThis.NpcRuntime;
  globalThis.GameState._gameTime = null;
  globalThis.GameState.playerData = null;
  var d0 = PanelData.computeDebug();
  check('P1I3-1 全缺省不抛，快照空态逐字',
    d0.snapCount === 0 && d0.snapText === '共 0 个快照\n最近：无');
  eq('P1I3-2 gameTime 为 JSON null', d0.gameTime, 'null');
  eq('P1I3-3 npcRuntime 缺模块 → {}', d0.npcRuntime, '{}');

  globalThis.GameState._gameTime = { year: 1990, month: 1, day: 2 };
  globalThis.GameState.playerData = { name: '阿澈' };
  globalThis.Snapshots = { list: function () { return [{ round: 1 }, { round: 7 }]; } };
  globalThis.NpcRuntime = { getAll: function () { return { n1: { mood: '平静' } }; } };
  var d1 = PanelData.computeDebug();
  check('P1I3-4 游戏时间 JSON 含 year/day',
    d1.gameTime.indexOf('"year": 1990') >= 0 && d1.gameTime.indexOf('"day": 2') >= 0);
  check('P1I3-5 playerData JSON 含姓名',
    d1.playerData.indexOf('阿澈') >= 0);
  eq('P1I3-6 快照计数', d1.snapCount, 2);
  eq('P1I3-7 快照文案（共 N + 最近第 N 轮）逐字照桌面',
    d1.snapText, '共 2 个快照\n最近：第 7 轮');
  check('P1I3-8 NPC 运行时 JSON',
    d1.npcRuntime.indexOf('"mood": "平静"') >= 0);

  globalThis.Snapshots = { list: function () { throw new Error('boom'); } };
  var d2 = PanelData.computeDebug();
  check('P1I3-9 list 抛异常兜底为空态',
    d2.snapCount === 0 && d2.snapText === '共 0 个快照\n最近：无');

  delete globalThis.Snapshots;
  delete globalThis.NpcRuntime;
})();

// ================= P1-I · I-2：promptAsync 等价物 =================

async function runI2() {
  StoryStore.reset();

  // 确定 → 返回输入值；pending 清空
  var p1 = StoryStore.promptOpen('给这个主题起个名字：', '主题1');
  var pending1 = StoryStore.getSnapshot().promptPending;
  check('P1I2-1 promptOpen 建 pending（message/defaultValue/options）',
    !!pending1 && pending1.message === '给这个主题起个名字：' &&
    pending1.defaultValue === '主题1' && typeof pending1.options === 'object');
  StoryStore.resolvePrompt('夜色');
  eq('P1I2-2 确定 → resolve 输入值', await p1, '夜色');
  eq('P1I2-3 结算后 pending 清空', StoryStore.getSnapshot().promptPending, null);

  // 取消 → null
  var p2 = StoryStore.promptOpen('新名字：');
  StoryStore.resolvePrompt(null);
  eq('P1I2-4 取消 → resolve null', await p2, null);

  // 缺参：defaultValue 空串；message 空串
  var p3 = StoryStore.promptOpen();
  var pending3 = StoryStore.getSnapshot().promptPending;
  check('P1I2-5 缺参 pending 归一为字符串',
    pending3.message === '' && pending3.defaultValue === '');
  StoryStore.resolvePrompt(undefined);
  eq('P1I2-6 resolve undefined → null', await p3, null);

  // 幂等：结算后重复 resolve 不改结果、不抛
  var p4 = StoryStore.promptOpen('x', 'y');
  StoryStore.resolvePrompt('a');
  var v4 = await p4;
  try {
    StoryStore.resolvePrompt('b');
    ok++; console.log('PASS: P1I2-7 重复 resolve 不抛');
  } catch (e) { fail++; console.log('FAIL: P1I2-7 重复 resolve 不抛 :: ' + e.message); }
  eq('P1I2-8 首次结算值保持', v4, 'a');

  // 与 confirm 互不干扰：prompt 打开不影响 confirmPending
  var p5 = StoryStore.promptOpen('m');
  eq('P1I2-9 prompt 打开不动 confirmPending', StoryStore.getSnapshot().confirmPending, null);
  StoryStore.resolvePrompt('v');
  await p5;
  StoryStore.reset();
}

// ================= P1-I · I-1：NPC 推演/调整 动作编排 =================

async function runI1() {
  var fs = require('fs');
  var NpcActions = require(path.join(root, 'rn', 'npc_actions_rn.js'));

  check('P1I1-1 导出 10 个函数',
    typeof NpcActions.requestUpdate === 'function' &&
    typeof NpcActions.getPendingUpdate === 'function' &&
    typeof NpcActions.getUpdatingNpcId === 'function' &&
    typeof NpcActions.buildForm === 'function' &&
    typeof NpcActions.confirmUpdate === 'function' &&
    typeof NpcActions.regenerate === 'function' &&
    typeof NpcActions.cancelUpdate === 'function' &&
    typeof NpcActions.confirmDeduction === 'function' &&
    typeof NpcActions.rejectDeduction === 'function' &&
    typeof NpcActions.retryDeduction === 'function');

  var src = fs.readFileSync(path.join(root, 'rn', 'npc_actions_rn.js'), 'utf8');
  // 注释例外：文件头「纪律」段原文写着「零 document. / 零 window.」，
  // 字面含被禁串；断言只针对可执行代码行（去掉行首 // 注释行）。
  var srcCode = src.split('\n').filter(function (l) {
    return l.trim().indexOf('//') !== 0;
  }).join('\n');
  check('P1I1-2 A 类零 DOM/React（代码行无 document./window./require(react)）',
    srcCode.indexOf('document.') < 0 && srcCode.indexOf('window.') < 0 &&
    srcCode.indexOf("require('react')") < 0);

  // ---------- 假件 ----------
  var toasts = [];
  var applied = null;
  globalThis.Platform = {
    ui: { toast: function (msg, opts) { toasts.push({ msg: msg, type: (opts && opts.type) || 'info' }); } }
  };
  globalThis.GameState = { currentCard: { worldbook: { npcs: { a: { id: 'a', name: '阿甲' } } } } };
  globalThis.NpcRuntime = {
    buildUpdatePrompt: function () { return { sys: 'S', user: 'U' }; },
    parseUpdateResponse: function (c) { try { return JSON.parse(c); } catch (e) { return null; } },
    get: function () { return { knownFacts: [{ text: 'x', source: 'witness', acquiredAt: 'D1' }] }; },
    applyUpdate: function (id, d) { applied = { id: id, d: d }; return { ok: true }; },
    addKnowledge: function () { return { ok: true }; }
  };
  globalThis.ApiClient = {
    chat: function () {
      return Promise.resolve('{"alive":true,"mood":"平静","locationId":"L","playerRelation":"友",' +
        '"knownFacts":["y","x"],"recentEvents":["e1"]}');
    }
  };
  function lastToast() { return toasts.length ? toasts[toasts.length - 1] : null; }

  // ---------- requestUpdate / buildForm / confirmUpdate ----------
  var r = await NpcActions.requestUpdate('a');
  check('P1I1-3 requestUpdate 解析成功', r && r.ok === true);
  check('P1I1-4 pending 就位', !!NpcActions.getPendingUpdate() &&
    NpcActions.getPendingUpdate().npcId === 'a');
  eq('P1I1-5 _updatingNpcId 保留（同桌面 :221）', NpcActions.getUpdatingNpcId(), 'a');

  var form = NpcActions.buildForm('a');
  check('P1I1-6 buildForm 字段（name/alive/mood/locationId/playerRelation）',
    form.name === '阿甲' && form.alive === true && form.mood === '平静' &&
    form.locationId === 'L' && form.playerRelation === '友');
  // P14·S3：AI 本次新提到的知识一律视为「未确认」（推演·未确认），不再标成已确认的「推演」
  eq('P1I1-7 knownFactsText 逐字（已有 [时间·来源] + 新提到标「推演·未确认」）',
    form.knownFactsText, '[D1·目击] x\n[推演·未确认] y');
  eq('P1I1-8 recentEventsText', form.recentEventsText, 'e1');

  NpcActions.confirmUpdate({
    alive: 'true', mood: '平静', locationId: 'L', playerRelation: '友',
    knownFactsText: '[D1·目击] x\n[推演] y', recentEventsText: ' e1 \n e2 '
  });
  check('P1I1-9 applyUpdate 收到剥离前缀的知识',
    applied && applied.id === 'a' && applied.d.knownFacts.join('|') === 'x|y');
  check('P1I1-10 recentEvents 逐行 trim + 过滤空',
    applied.d.recentEvents.join('|') === 'e1|e2');
  eq('P1I1-11 confirmUpdate 后 pending 清空', NpcActions.getPendingUpdate(), null);
  eq('P1I1-12 confirmUpdate 后 updatingId 清空', NpcActions.getUpdatingNpcId(), null);

  // 解析失败分支
  globalThis.ApiClient.chat = function () { return Promise.resolve('完全不相关'); };
  var rBad = await NpcActions.requestUpdate('a');
  check('P1I1-13 解析失败返回 error 文案逐字',
    rBad && rBad.ok === false &&
    rBad.error === '（AI 返回无法解析）\n\n原始内容：\n完全不相关');

  // 前置拦截：NPC 不存在
  toasts.length = 0;
  await NpcActions.requestUpdate('nope');
  check('P1I1-14 NPC 不存在 toast 逐字',
    lastToast() && lastToast().type === 'error' && lastToast().msg === 'NPC 不存在');

  // ---------- 推演裁决 ----------
  toasts.length = 0;
  globalThis.NpcDeduction = {
    findPending: function () { return { id: 'p1', npcId: 'a', npcName: '阿甲', factText: 'F', deductionNote: 'R' }; },
    confirmDeduction: function () { return { ok: true }; },
    rejectDeduction: function () { return { ok: true }; }
  };
  NpcActions.confirmDeduction('p1');
  check('P1I1-15 确认成功 toast 逐字',
    lastToast() && lastToast().type === 'success' && lastToast().msg === '已确认：阿甲 知道「F」');

  toasts.length = 0;
  globalThis.NpcDeduction.findPending = function () {
    return { id: 'p2', npcId: 'a', npcName: '阿甲', factText: 'F', failReason: '超时' };
  };
  NpcActions.confirmDeduction('p2');
  check('P1I1-16 失败条目不可确认 toast 逐字',
    lastToast() && lastToast().type === 'warn' && lastToast().msg === '该条目推演失败，不能确认，请重试或拒绝');

  toasts.length = 0;
  globalThis.NpcDeduction.rejectDeduction = function () { return { ok: true }; };
  NpcActions.rejectDeduction('p1');
  check('P1I1-17 拒绝 toast 逐字',
    lastToast() && lastToast().type === 'info' && lastToast().msg === '已拒绝：阿甲 不知道「F」');

  toasts.length = 0;
  globalThis.NpcDeductionAI = {
    _getConfig: function () { return { enabled: true }; },
    run: function () { return Promise.resolve({ ok: true }); }
  };
  var rr = await NpcActions.retryDeduction('p1');
  check('P1I1-18 重试完成 toast + 返回 true',
    rr === true && lastToast() && lastToast().type === 'success' &&
    lastToast().msg === '推演已完成，可在推理链中查看');

  toasts.length = 0;
  globalThis.NpcDeductionAI._getConfig = function () { return { enabled: false }; };
  var rr2 = await NpcActions.retryDeduction('p1');
  check('P1I1-19 未启用 toast 逐字 + 返回 false',
    rr2 === false && lastToast() && lastToast().type === 'warn' &&
    lastToast().msg === '推演功能未启用，可在设置 → 通用 → NPC 推演中开启');

  // ---------- 组件接线（源码级）----------
  var npSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'NpcPanel.js'), 'utf8');
  check('P1I1-20 NpcPanel 卡片头「更新」按钮', npSrc.indexOf("NpcActions.requestUpdate(npcId)") >= 0);
  check('P1I1-21 NpcPanel pending 三态按钮（确认/重试/拒绝）',
    npSrc.indexOf('NpcActions.confirmDeduction(id)') >= 0 &&
    npSrc.indexOf('NpcActions.retryDeduction(id)') >= 0 &&
    npSrc.indexOf('NpcActions.rejectDeduction(id)') >= 0);
  check('P1I1-22 NpcPanel history 文案照桌面 :173',
    npSrc.indexOf("confirmed: '已确认'") >= 0 &&
    npSrc.indexOf("auto_rejected: '引擎判定不成立'") >= 0);
  var mdSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'NpcUpdateModal.js'), 'utf8');
  check('P1I1-23 NpcUpdateModal 标题 + 六字段 label 逐字',
    mdSrc.indexOf('🔄 更新 NPC 状态') >= 0 &&
    mdSrc.indexOf("'位置（地图节点 id）'") >= 0 &&
    mdSrc.indexOf("'已知事实（每行一条）'") >= 0 &&
    mdSrc.indexOf("'最近事件（每行一条）'") >= 0);
  check('P1I1-24 NpcUpdateModal 三按钮逐字',
    mdSrc.indexOf("'确认写入'") >= 0 && mdSrc.indexOf("'重新生成'") >= 0 && mdSrc.indexOf("'取消'") >= 0);

  // ---------- 收尾：清理全局假件 ----------
  delete globalThis.Platform;
  delete globalThis.NpcRuntime;
  delete globalThis.NpcDeduction;
  delete globalThis.NpcDeductionAI;
  delete globalThis.ApiClient;
}

// ================= P1-I · I-4：AI 指令模板 6 段 + 复制 =================

function runI4() {
  var fs = require('fs');
  var Tpl = require(path.join(root, 'rn', 'instruction_templates.js'));

  check('P1I4-1 导出 6 段 + getInstructionTemplate',
    typeof Tpl.part1 === 'function' && typeof Tpl.part2 === 'function' &&
    typeof Tpl.part3 === 'function' && typeof Tpl.part4 === 'function' &&
    typeof Tpl.part5 === 'function' && typeof Tpl.part6 === 'function' &&
    typeof Tpl.getInstructionTemplate === 'function');

  var p1 = Tpl.part1(), p2 = Tpl.part2(), p3 = Tpl.part3();
  var p4 = Tpl.part4(), p5 = Tpl.part5(), p6 = Tpl.part6();
  var lens = [p1, p2, p3, p4, p5, p6].map(function (s) { return s.length; });
  check('P1I4-2 六段皆非空且为字符串',
    lens.every(function (n) { return n > 0; }));

  eq('P1I4-3 getInstructionTemplate = 六段 \\n 顺连（同桌面 :1135）',
    Tpl.getInstructionTemplate(), p1 + '\n' + p2 + '\n' + p3 + '\n' + p4 + '\n' + p5 + '\n' + p6);

  check('P1I4-4 段内容锚点（p1 含 schemaVersion / p6 含世界书）',
    p1.indexOf('schemaVersion') >= 0 && p6.indexOf('世界书') >= 0);

  var mdSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'InstructionModal.js'), 'utf8');
  check('P1I4-5 InstructionModal 7 按钮文案逐字（照 ui_cards.js:426-432）',
    mdSrc.indexOf("'1 · 基础骨架'") >= 0 && mdSrc.indexOf("'2 · 事件系统'") >= 0 &&
    mdSrc.indexOf("'3 · NPC 规范'") >= 0 && mdSrc.indexOf("'4 · 内容要求'") >= 0 &&
    mdSrc.indexOf("'5 · 可选系统'") >= 0 && mdSrc.indexOf("'6 · 世界书数据'") >= 0 &&
    mdSrc.indexOf("'全部'") >= 0);
  check('P1I4-6 InstructionModal 标题 + 说明行逐字',
    mdSrc.indexOf("'生成卡带指令'") >= 0 &&
    mdSrc.indexOf("'第 1 段必给（骨架），第 2-6 段按需追加。按顺序复制给 AI。'") >= 0);
  check('P1I4-7 复制走 RN 核心 Clipboard + toast 逐字',
    mdSrc.indexOf('Clipboard.setString(text)') >= 0 &&
    mdSrc.indexOf("'已复制'") >= 0 && mdSrc.indexOf("'复制失败'") >= 0);
  check('P1I4-8 复制/关闭按钮逐字',
    mdSrc.indexOf("'复制当前段'") >= 0 && mdSrc.indexOf("'关闭'") >= 0);
  check('P1I4-9 InstructionModal 零 DOM（无 document./window.）',
    mdSrc.indexOf('document.') < 0 && mdSrc.indexOf('window.') < 0);

  var csSrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'CardsScreen.js'), 'utf8');
  check('P1I4-10 CardsScreen 接线（require + 入口按钮 + visible）',
    csSrc.indexOf("require('../components/InstructionModal.js').InstructionModal") >= 0 &&
    csSrc.indexOf("'生成卡带指令'") >= 0 &&
    csSrc.indexOf('<InstructionModal visible={instrOpen}') >= 0);
}

// ================= P1-A：数据与备份（导入单存档 + 导出结构）=================

// 内存 localStorage（Storage 全局配置后端）
function installMemLocalStorage() {
  var mem = {};
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; }
  };
  return globalThis.localStorage;
}

// 内存 StorageAdapter（VFS 后端；length/key 动态）
function memStorageAdapter() {
  var map = {}, order = [];
  var api = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) order.push(k);
      map[k] = String(v);
    },
    removeItem: function (k) { delete map[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); },
    key: function (i) { return i < order.length ? order[i] : null; }
  };
  Object.defineProperty(api, 'length', { get: function () { return order.length; } });
  return api;
}

function runP1A() {
  var Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  var VFS = require(path.join(root, 'vfs', 'vfs.js'));

  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = VFS;
  globalThis.CARDS = { demo_x: { cardId: 'demo_x', cardName: '测试卡带' } };

  var Model = require(path.join(root, 'rn', 'settings_model.js'));

  // --- 拒绝路径（reason 逐字照 ui_cards.js:254-262 校验）---
  var rBad1 = Model.importSaveFromJson(null);
  check('P1A-1 非本引擎存档 → 拒绝且 reason 逐字',
    rBad1.ok === false &&
    rBad1.reason === '这不是本引擎导出的存档文件（缺少 format / cardId / files）');
  var rBad2 = Model.importSaveFromJson({ format: 'ai_tg_save', cardId: 'demo_x' });
  check('P1A-2 缺 files → 同一拒绝 reason', rBad2.ok === false && rBad2.reason === rBad1.reason);
  var rBad3 = Model.importSaveFromJson({ format: 'ai_tg_save', cardId: 'demo_x', files: {} });
  check('P1A-3 缺 saveId → reason 逐字',
    rBad3.ok === false && rBad3.reason === '存档缺少 saveId 字段');

  var rBad4 = Model.importSaveFromJson({
    format: 'ai_tg_save', cardId: 'nope', saveId: 's1',
    files: { '/saves/nope/s1/a.json': '{}' }
  });
  check('P1A-4 卡带不存在 → reason 含卡带 id',
    rBad4.ok === false && rBad4.reason.indexOf('这个存档对应的卡带不存在：nope') === 0);

  var rBad5 = Model.importSaveFromJson({
    format: 'ai_tg_save', cardId: 'demo_x', saveId: 's1',
    files: { '/cards/other.json': '{}' }
  });
  check('P1A-5 无匹配路径 → reason 逐字',
    rBad5.ok === false && rBad5.reason === '没有写入任何文件，可能路径格式不对');

  // --- 成功路径：逐文件重写 /saves/{cardId}/{saveId}/ 前缀 ---
  var rOk = Model.importSaveFromJson({
    format: 'ai_tg_save', cardId: 'demo_x', saveId: 'save_old',
    files: {
      '/saves/demo_x/save_old/gamestate.json': '{"round":3}',
      '/saves/demo_x/save_old/chat.json': '[{"role":"user","content":"我进店"}]'
    }
  });
  check('P1A-6 成功：ok + written=2 + 新 saveId 前缀',
    rOk.ok === true && rOk.written === 2 && String(rOk.saveId).indexOf('save_') === 0);
  var newPrefix = '/saves/demo_x/' + rOk.saveId + '/';
  check('P1A-7 VFS 真落新前缀文件且内容一致',
    VFS.exists(newPrefix + 'gamestate.json') &&
    JSON.stringify(VFS.readJSON(newPrefix + 'gamestate.json')) === '{"round":3}' &&
    VFS.exists(newPrefix + 'chat.json'));
  var meta = VFS.readJSON(newPrefix + 'meta.json');
  check('P1A-8 缺 meta → 自动补建且 saveId/cardId 对',
    !!meta && meta.saveId === rOk.saveId && meta.cardId === 'demo_x');

  // --- 导出结构 { global, vfs }（DataTab.doExportAll 的两路数据源）---
  var payload = { global: Storage.getGlobal(), vfs: VFS.exportAll() };
  check('P1A-9 导出结构恰两键 global / vfs',
    JSON.stringify(Object.keys(payload).sort()) === '["global","vfs"]');
  check('P1A-10 global 为全局配置对象（含 settings/gm）',
    !!payload.global && !!payload.global.settings && !!payload.global.gm);
  check('P1A-11 vfs 结构 version/files/dirs（exportAll 契约）',
    payload.vfs.version === 1 && typeof payload.vfs.files === 'object' && Array.isArray(payload.vfs.dirs));
  check('P1A-12 JSON 往返保结构（导出即可落盘）',
    JSON.stringify(JSON.parse(JSON.stringify(payload))) === JSON.stringify(payload));

  // 清理
  delete globalThis.CARDS;
  delete globalThis.VFS;
  delete globalThis.StorageAdapter;
  delete globalThis.localStorage;
}

// ================= P1-B：外观配色（主题槽位 + 主题包往返）=================

function runP1B() {
  var Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  var Theme = require(path.join(root, 'engine', 'theme.js'));

  installMemLocalStorage();
  globalThis.Storage = Storage;

  // 初值：恒 7 空槽
  var s0 = Theme.listSlots();
  check('P1B-1 listSlots 恒 7 槽且初值全空',
    s0.length === 7 && s0.every(function (s) { return s.hasData === false && s.name === ''; }));

  // 存槽
  var rs = Theme.saveSlot(0, '我的主题');
  var s1 = Theme.listSlots();
  check('P1B-2 saveSlot ok + listSlots 反映',
    rs.ok === true && rs.index === 0 && s1[0].hasData === true && s1[0].name === '我的主题');
  check('P1B-3 槽位真落 Storage（settings.theme.slots[0].name）',
    Storage.getGlobal().settings.theme.slots[0].name === '我的主题');

  // 越界 / 空槽
  eq('P1B-4 saveSlot 越界 → 槽位越界', Theme.saveSlot(99, 'x').reason, '槽位越界');
  eq('P1B-5 loadSlot 空槽 → 槽位为空', Theme.loadSlot(5).reason, '槽位为空');

  // 槽位存取往返：造自定义主题 → 存槽 → 切回内置 → 载槽 → 还原
  Theme.importTheme(JSON.stringify({ id: 'tA', name: '主题A', colors: { bg: '#111111' } }));
  var customBg = Theme.getActive().colors.bg;
  Theme.saveSlot(3, '槽3');
  Theme.setBuiltin('paper-white');
  var builtinBg = Theme.getActive().colors.bg;
  Theme.loadSlot(3);
  var restored = Theme.getActive().colors.bg;
  check('P1B-6 槽位存取往返（自定义 #111111 → 切内置 → 载槽还原 #111111）',
    customBg === '#111111' && builtinBg === '#f5f3ee' && restored === '#111111');

  // 改名 / 删除
  var rr = Theme.renameSlot(0, '改名后');
  check('P1B-7 renameSlot 往返', rr.ok === true && Theme.listSlots()[0].name === '改名后');
  Theme.deleteSlot(0);
  check('P1B-8 deleteSlot 后槽位为空', Theme.listSlots()[0].hasData === false);

  // 主题包导出结构
  var pkg = JSON.parse(Theme.exportTheme());
  check('P1B-9 主题包导出结构（schemaVersion/id/name/colors）',
    pkg.schemaVersion === 1 && typeof pkg.id === 'string' && typeof pkg.name === 'string' &&
    !!pkg.colors && typeof pkg.colors.bg === 'string');

  // 主题包导入往返
  var rImp = Theme.importTheme(Theme.exportTheme());
  check('P1B-10 主题包导出→导入往返 ok + 名称一致',
    rImp.ok === true && rImp.name === pkg.name);
  check('P1B-11 导入后 getActive 生效（activeId=custom）',
    Storage.getGlobal().settings.theme.activeId === 'custom');

  // 非法输入
  var rBad = Theme.importTheme('这不是 JSON');
  check('P1B-12 非法 JSON → 不抛且 reason 含 JSON 解析失败',
    rBad.ok === false && rBad.reason.indexOf('JSON 解析失败') === 0);

  delete globalThis.Storage;
  delete globalThis.localStorage;
}

// ================= babel transform（含 JSX 的 B 类）=================

function runBabel() {
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  ['rn/components/ThinkingBlock.js', 'rn/screens/StoryScreen.js',
   'rn/story_store.js', 'rn/snapshot_actions.js', 'rn/story_runtime.js',
   'rn/panels/ErrorLogPanel.js', 'rn/components/PanelHost.js',
   'rn/panels/DebugPanel.js', 'rn/components/OverlayHost.js',
   'rn/npc_actions_rn.js', 'rn/panels/NpcPanel.js', 'rn/panels/NpcUpdateModal.js',
   'rn/instruction_templates.js', 'rn/components/InstructionModal.js',
   'rn/screens/ClassifyScreen.js', 'rn/screens/CardsScreen.js',
   'rn/screens/settings/DataTab.js', 'rn/screens/settings/ColorTab.js'].forEach(function (rel) {
    try {
      babel.transformFileSync(path.join(root, rel), {
        cwd: root,
        configFile: path.join(root, 'babel.config.js')
      });
      ok++; console.log('PASS: P1 babel transform ' + rel);
    } catch (e) {
      fail++; console.log('FAIL: P1 babel transform ' + rel + ' :: ' + e.message);
    }
  });
}

runP1A();
runP1B();
runD().then(runI2).then(runI1).then(runI4).then(function () {
  runBabel();
  console.log('P1_SETTINGS_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
}).catch(function (e) {
  console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
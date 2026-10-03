// ============================================================
// 战役 4 · 批次 4-3：叙事页状态仓库（A 类，零 React / 零 RN 依赖）
// RN 独有。Platform.ui 叙事族壳（rn_platform.js bridgeStory）与 React 世界
// （StoryScreen 的 useSyncExternalStore）共用的外部单例，沿用 4-2 nav_store
// 的"壳 → store → React 订阅"范式：
//   engine 业务模块（story.js 等）裸调 Platform.ui.appendStory(...)
//   → rn_platform 壳（原日志链/返回值语义前置保留）
//   → 本 store 入队/改态 → StoryScreen 重渲染。
// Electron 调用方一行不改，收口契约不变。
//
// 4-3a 范围（P0+P1）：feed 队列（chapter/hint/dice/segment 四型）、
// sidebarSeq 重渲染信号、confirmAsync 的 Promise 确认流。
// 4-3b 追加：busy（输入遮断）、loading（流内"AI 正在生成"行）、
// error（流内异常卡，入 feed 持久保留，同 Electron DOM）、toasts 队列。
// proposal 为 4-3c 追加。
//
// useSyncExternalStore 协议：state 不可变，任何变化整体换对象，
// getSnapshot 无变化时必须返回同一引用。
// ============================================================

'use strict';

var CardDisplay = require('../engine/card_display.js');
var StoryChanges = require('./story_changes.js');

var state = {
  feed: [],
  sidebarSeq: 0,
  confirmPending: null,
  promptPending: null,
  busy: false,
  loading: false,
  toasts: [],
  sidebarOpen: false,
  panelId: null
};
var toastSeq = 1;
var listeners = [];
var nextId = 1;

function emit() {
  var ls = listeners.slice();
  for (var i = 0; i < ls.length; i++) {
    try { ls[i](); } catch (e) { /* 订阅者异常不得影响叙事入队路径 */ }
  }
}

function replaceState(patch) {
  state = Object.assign({}, state, patch);
  emit();
}

// 单条入队：赋 id → 追加到 feed → 整体换对象 → 通知
function enqueue(entry) {
  entry.id = nextId++;
  replaceState({ feed: state.feed.concat([entry]) });
}

// ---------- 富文本：与 ui_core._renderStoryParas 同口径的子集 ----------
// RN <Text> 无 XSS 面，不做 escapeHtml；对话识别正则与 Electron 完全一致：
// 「…」与弯引号 “…” 两种整体匹配（不放进字符类，避免代理对问题）。
// 输出 runs：[{t:'文本', say:false}, {t:'「对话」', say:true}]
var SAY_RE = /「[^」]*」|\u201c[^\u201d]*\u201d/g;

function tokenizeLine(line) {
  var runs = [];
  var last = 0;
  var m;
  SAY_RE.lastIndex = 0;
  while ((m = SAY_RE.exec(line))) {
    if (m.index > last) runs.push({ t: line.slice(last, m.index), say: false });
    runs.push({ t: m[0], say: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ t: line.slice(last), say: false });
  if (!runs.length) runs.push({ t: line, say: false });
  return runs;
}

function parseParas(storyText) {
  return String(storyText == null ? '' : storyText)
    .split('\n')
    .filter(Boolean)
    .map(tokenizeLine);
}

// 现实时间戳，口径同 ui_core.nowStamp（YYYY-MM-DD HH:mm）
function nowStamp() {
  var d = new Date();
  function p(n) { return String(n).padStart(2, '0'); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ---------- 轮次：与 ui_core._currentRoundNum 同公式（壳直调，不走 state）----------
function currentRoundNum() {
  return (GameState.chatHistory || []).filter(function (m) {
    return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
  }).length;
}

// ---------- feed 入队 API（对应 Platform.ui 各壳）----------

// renderChapterHead(roundNum)：volume 取卡带身份层，sub = 第 N 轮 · 游戏时间
function setChapter(roundNum) {
  var volume = '';
  try {
    if (GameState.currentCard) {
      volume = CardDisplay.resolveCardDisplay(GameState.currentCard).volume || '';
    }
  } catch (e) { /* 无卡带时空卷次 */ }
  var time = '';
  try { time = GameState.formatGameTime() || ''; } catch (e) { /* — */ }
  var roundTxt = (typeof roundNum === 'number' && roundNum > 0)
    ? ('第 ' + roundNum + ' 轮') : '序 章';
  var sub = roundTxt + (time && time !== '—' ? ' · ' + time : '');
  enqueue({ kind: 'chapter', volume: volume, sub: sub });
}

// appendHint(text)：灰字提示行（实参全部为纯文本单行）
function appendHint(text) {
  enqueue({ kind: 'hint', text: String(text == null ? '' : text) });
}

// appendDiceResult(text)：剥 🎲/🍀 前缀（BMP 外字符必须交替分支整体匹配），
// 检定/掷骰判定同 ui_core L437-440
function parseDice(text) {
  var body = String(text == null ? '' : text).replace(/^(?:🎲|🍀)\s*/, '');
  var isCheck = body.indexOf('检定') >= 0 ||
    /\d+\s*\/\s*\d+\s*→/.test(body) || body.indexOf('对抗') >= 0;
  return { body: body, tag: isCheck ? '检定' : '掷骰' };
}

function appendDiceResult(text) {
  var d = parseDice(text);
  enqueue({ kind: 'dice', tag: d.tag, body: d.body });
}

// P1-C：思考块 meta 过滤（纯逻辑，Node 可测）
// 语义逐字对齐 ui_core L676-682 的 metaForShow 裁剪：
//   showReasoning && meta.reasoning            → reasoning
//   showSearch    && meta.searches.length      → searches
//   showUsage     && meta.usage                → usage
// 三项皆被裁掉返回 null（对应 UI_Thinking.render 对空对象返回 ''，不渲染）。
// cfg 缺省取全局 getThinkingConfig()（storage.js 挂载，两仓同源；缺全局时
// 回落三项全开 —— 与 storage.js:185 缺省语义一致）。ts 不参与渲染，不复制。
function filterThinkingMeta(meta, cfg) {
  if (!meta) return null;
  if (!cfg) {
    try { cfg = getThinkingConfig(); }
    catch (e) { cfg = { showReasoning: true, showSearch: true, showUsage: true }; }
  }
  if (!cfg) cfg = { showReasoning: true, showSearch: true, showUsage: true };
  var out = {};
  if (cfg.showReasoning && meta.reasoning) out.reasoning = meta.reasoning;
  if (cfg.showSearch && meta.searches && meta.searches.length) out.searches = meta.searches;
  if (cfg.showUsage && meta.usage) out.usage = meta.usage;
  if (!out.reasoning && !out.searches && !out.usage) return null;
  return out;
}

// appendStory(storyText, options, timeDelta, toolResults, roundNum, meta)
// 单次 replaceState 完成"旧选项失效 + 新段 + 页边骰行"，订阅者只见最终态。
// meta（reasoning/searches/usage）按时刻开关裁成 thinking 存入段条目，
// 由 ThinkingBlock（P1-C）渲染；裁剪在入队时发生，与 Electron
// ui_core L676-682 同时机（后改开关不影响已落段）。
// round（P1-D）供 StoryScreen 行内动作区定位「第 N 轮 / 回到这里」，
// 与 ui_core L692-697 renderRowActions(roundNum, isLast) 同源。
function appendSegment(storyText, options, timeDelta, toolResults, roundNum, meta) {
  var paras = parseParas(storyText);
  var ts = timeDelta
    ? (' · 游戏内 +' + timeDelta + '分 → ' + GameState.formatGameTime())
    : '';
  var metaLine = '[' + nowStamp() + ts + ']';
  var changes = StoryChanges.formatChangesForUI(toolResults);
  var thinking = filterThinkingMeta(meta);

  var entries = [{
    kind: 'segment',
    paras: paras,
    metaLine: metaLine,
    changes: changes,
    thinking: thinking,
    round: (typeof roundNum === 'number' && roundNum > 0) ? roundNum : 0,
    options: (options && options.length) ? options.slice() : []
  }];

  // Electron：新段落地前移除全部旧 .story-options（只保留最新一段的选项）
  var clearedFeed = state.feed.map(function (e) {
    if (e.kind === 'segment' && e.options.length) {
      return Object.assign({}, e, { options: [] });
    }
    return e;
  });

  // 页边骰行（Electron appendStory L664-672：enabled && showInStory 时
  // toolResults 中的 dice 结果经 ToolExecutor.formatDiceForUI 逐条追加，
  // 顺序在变更账块之后）
  var diceCfg = null;
  try { diceCfg = getDiceConfig(); } catch (e) { diceCfg = null; }
  if (toolResults && diceCfg && diceCfg.enabled && diceCfg.showInStory) {
    toolResults.forEach(function (r) {
      if (r && r.ok && r.type2 === 'dice') {
        var line = null;
        try { line = ToolExecutor.formatDiceForUI(r); } catch (e) { line = null; }
        if (line) {
          var d = parseDice(line);
          entries.push({ kind: 'dice', tag: d.tag, body: d.body });
        }
      }
    });
  }

  var built = clearedFeed.slice();
  for (var i = 0; i < entries.length; i++) {
    entries[i].id = nextId++;
    built.push(entries[i]);
  }
  replaceState({ feed: built, loading: false }); // ui_core L634：正文到达移除 loading 行
}

// clearStory()：innerHTML='' 语义，只清叙事区（loading 行同在 story-area 内）
function clear() {
  replaceState({ feed: [], loading: false });
}

// renderGame()：Electron = renderTopbar + renderSidebarExpanded + collapsed。
// topbar 信号由 rn_platform 壳另投 nav_store（与 4-2 桥一致）；
// 本 store 只发侧栏重渲染计数，组件现读 GameState.currentState.sidebar。
function renderGame() {
  replaceState({ sidebarSeq: state.sidebarSeq + 1 });
}

// ---------- 4-3b：busy / loading / error / toast ----------

// setBusy：Electron 仅禁用发送按钮与选项按钮（无遮罩）。busy 语义照搬；
// RN 端输入区遮断的视觉形态由 StoryScreen 据本字段渲染（增强，关账自报）。
function setBusy(busy) {
  if (state.busy === !!busy) return;
  replaceState({ busy: !!busy });
}

// showStoryLoading：流内「（AI 正在生成…）」灰字行（ui_core L714-721）。
// appendSegment/showStoryError/clear 负责复位。
function setLoading(loading) {
  if (state.loading === !!loading) return;
  replaceState({ loading: !!loading });
}

// showStoryError：流内异常卡（ui_core L725-745）。DOM 中错误卡持久保留，
// 故入 feed 不入独立字段；canRetry/canGoSettings 任一为真才渲染动作区，
// 动作区内「重试（canRetry）/去设置（canGoSettings）/返回」三键，返回恒在区内。
function appendError(msg, options) {
  options = options || {};
  var entry = {
    kind: 'error',
    msg: String(msg == null ? '' : msg),
    // P10·A6：异常卡标题可被 options.title 覆盖，缺省「异常」
    //   （桌面 ui_core.js:734 现为硬编码 <span class="tag">异常</span>，
    //    本轮 RN 侧先行支持 title，缺省值与其逐字一致，不改观感）。
    title: String(options.title == null || options.title === '' ? '异常' : options.title),
    canRetry: !!options.canRetry,
    canGoSettings: !!options.canGoSettings
  };
  entry.id = nextId++;
  replaceState({ feed: state.feed.concat([entry]), loading: false });
}

// toast：非阻塞提示条（ui_prompt L117-152）。
// type info|success|warn|error；error 默认 manual（点击关），其余 3000ms。
// 自动计时不挂在 store（保 A 类无计时器/无 RN 依赖），由 ToastBar 组件持表。
function pushToast(msg, opts) {
  opts = opts || {};
  var type = opts.type || 'info';
  var manual = opts.manual === true || type === 'error';
  var duration = opts.duration != null ? opts.duration : (manual ? 0 : 3000);
  var entry = {
    id: toastSeq++,
    msg: String(msg == null ? '' : msg),
    type: type,
    manual: manual,
    duration: duration
  };
  replaceState({ toasts: state.toasts.concat([entry]) });
  return entry.id;
}

function dismissToast(id) {
  var next = state.toasts.filter(function (t) { return t.id !== id; });
  if (next.length === state.toasts.length) return;
  replaceState({ toasts: next });
}

// ---------- 4-3c：侧栏抽屉开关 + 提议卡 ----------

// 抽屉开关是 RN 移动端独有（Electron 侧栏常显 ◀▶ 切换）；renderSidebarExpanded
// 壳只发 sidebarSeq 数据信号，与开关互不影响。
function openSidebar() {
  if (state.sidebarOpen) return;
  replaceState({ sidebarOpen: true });
}

function closeSidebar() {
  if (!state.sidebarOpen) return;
  replaceState({ sidebarOpen: false });
}

// ---------- H4：面板壳开关（与 sidebarOpen 同构，不复用）----------
// panelId：null = 关；其余为路由键（statusCard/log/diceHistory/character/shop/entries:*）。
// 面板区入口点击 → openPanel(id)；PanelHost 据 id 分派六个面板组件。
function openPanel(id) {
  if (state.panelId === id) return;
  replaceState({ panelId: id });
}

function closePanel() {
  if (state.panelId == null) return;
  replaceState({ panelId: null });
}

// 提议卡入流（ui_core L950-987：Proposals.list 按 id 现查后由 UI 拼装）。
// 条目中 pid 为业务提议 id，id 为流内单调序号；与 segment 同流，追加在
// 最新段之后（Electron 插在段的选项容器之前；RN 选项内嵌于段，位置差异关账自报）。
function appendProposalCard(card) {
  var entry = {
    kind: 'proposal',
    pid: card.pid,
    title: card.title,
    reason: card.reason || '',
    status: 'pending', // pending | accepted | rejected
    statusText: '',
    accepting: false
  };
  entry.id = nextId++;
  replaceState({ feed: state.feed.concat([entry]) });
}

// 卡面原地更新（接受/拒绝/处理中），同 Electron getElementById 改 actions 区。
// 浅比较：patch 未带来实质变化时不换 feed 引用（finally 复位不对已成卡发信号）。
function updateProposal(pid, patch) {
  var changed = false;
  var next = state.feed.map(function (e) {
    if (e.kind !== 'proposal' || e.pid !== pid) return e;
    var merged = Object.assign({}, e, patch);
    var keys = Object.keys(merged);
    var same = true;
    for (var i = 0; i < keys.length; i++) {
      if (merged[keys[i]] !== e[keys[i]]) { same = false; break; }
    }
    if (same) return e;
    changed = true;
    return merged;
  });
  if (changed) replaceState({ feed: next });
}

// ---------- confirmAsync：Promise<bool> 确认流（3 处 await 的收口）----------
// 壳调 confirmOpen 拿 Promise；resolve 存 pending；OverlayHost 渲染 Modal，
// 用户点击 → resolveConfirm(true|false)。与 ui_prompt 同语义：
// 确定 true / 取消或遮罩 false；resolved 后重复结算无效（pending 已清空）。
function confirmOpen(message, options) {
  return new Promise(function (resolve) {
    replaceState({
      confirmPending: {
        message: String(message == null ? '' : message),
        options: options || {},
        resolve: resolve
      }
    });
  });
}

function resolveConfirm(ok) {
  var pending = state.confirmPending;
  if (!pending) return;
  var fn = pending.resolve;
  replaceState({ confirmPending: null });
  try { fn(!!ok); } catch (e) { /* 调用方 await 链异常不影响 Modal 关闭 */ }
}

// ---------- promptAsync：Promise<string|null> 输入流（P1-I · I-2，等价 ui_prompt.js）----------
// 语义同桌面 UI.promptAsync（engine/ui_prompt.js:10-71）：
// 确定 → resolve(input.value)；取消 / 点遮罩 / Esc → resolve(null)。
// 默认值 defaultValue、options.okText/cancelText/placeholder/password 可覆盖。
function promptOpen(message, defaultValue, options) {
  return new Promise(function (resolve) {
    replaceState({
      promptPending: {
        message: String(message == null ? '' : message),
        defaultValue: String(defaultValue == null ? '' : defaultValue),
        options: options || {},
        resolve: resolve
      }
    });
  });
}

function resolvePrompt(value) {
  var pending = state.promptPending;
  if (!pending) return;
  var fn = pending.resolve;
  replaceState({ promptPending: null });
  try { fn(value == null ? null : String(value)); } catch (e) { /* 调用方 await 链异常不影响 Modal 关闭 */ }
}

function subscribe(fn) {
  listeners.push(fn);
  return function unsubscribe() {
    var i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function getSnapshot() {
  return state;
}

// 仅供 Node smoke 复位（生产路径不调用）
function reset() {
  state = {
    feed: [],
    sidebarSeq: 0,
    confirmPending: null,
    promptPending: null,
    busy: false,
    loading: false,
    toasts: [],
    sidebarOpen: false,
    panelId: null
  };
  listeners = [];
  nextId = 1;
  toastSeq = 1;
}

module.exports = {
  parseParas: parseParas,
  tokenizeLine: tokenizeLine,
  parseDice: parseDice,
  filterThinkingMeta: filterThinkingMeta,
  nowStamp: nowStamp,
  currentRoundNum: currentRoundNum,
  setChapter: setChapter,
  appendHint: appendHint,
  appendDiceResult: appendDiceResult,
  appendSegment: appendSegment,
  appendError: appendError,
  clear: clear,
  renderGame: renderGame,
  setBusy: setBusy,
  setLoading: setLoading,
  pushToast: pushToast,
  dismissToast: dismissToast,
  openSidebar: openSidebar,
  closeSidebar: closeSidebar,
  openPanel: openPanel,
  closePanel: closePanel,
  appendProposalCard: appendProposalCard,
  updateProposal: updateProposal,
  confirmOpen: confirmOpen,
  resolveConfirm: resolveConfirm,
  promptOpen: promptOpen,
  resolvePrompt: resolvePrompt,
  subscribe: subscribe,
  getSnapshot: getSnapshot,
  reset: reset
};

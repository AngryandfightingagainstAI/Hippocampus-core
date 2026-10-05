// ============================================================
// 战役 4 · 批次 4-2：自建路由 · 导航状态单例（A 类，零 React / 零 RN 依赖）
// RN 独有。Platform.ui 桥接壳（rn_platform.js）与 React 世界（navigation.js
// 的 useSyncExternalStore）共用这一个外部 store：
//   engine 业务模块（story.js 等）裸调 Platform.ui.showHome()/showScreen(id)
//   → rn_platform 桥接壳 → 本 store 切屏/通知 → React 订阅者重渲染。
// Electron 调用方一行不改，收口契约不变。
//
// 屏 id：home / story / settings / cards / saves / create / __boot（自检页，开发路由）
// Electron 屏 id 映射（navigateByElectronId）：
//   screen-home→home、screen-game→story、screen-settings→settings、
//   screen-create→create（H3 实装最小创角屏，不再归叙事流占位）
// 未登记 id 一律回落 home（不白屏）。
//
// useSyncExternalStore 协议：state 为不可变快照，任何变化整体换对象，
// getSnapshot 在无变化时必须返回同一引用。
// ============================================================

'use strict';

// H2：新增 cards / saves 两屏（settings 之后、__boot 之前）
// H3：新增 create 最小创角屏（saves 之后、__boot 之前）
// H6 G9：新增 portrait 屏（重审人设）；'portrait' 自映射让
// Platform.ui.showScreen('portrait') 经 navigateByElectronId 命中而非回落 home。
// P1-G：新增 classify 屏（卡带分类审核）；入口在 CardsScreen 行内按钮，
// 无 Electron 侧屏 id（桌面走 CardClassify.open 的 DOM 面板），故不入映射表。
var SCREENS = ['home', 'story', 'settings', 'cards', 'saves', 'create', 'portrait', 'classify', '__boot'];

var ELECTRON_SCREEN_MAP = {
  'screen-home': 'home',
  'screen-game': 'story',
  'screen-settings': 'settings',
  'screen-create': 'create',
  'portrait': 'portrait'
};

var state = { screen: 'home', stack: [], topbarSeq: 0, badgeSeq: 0 };
var listeners = [];

function emit() {
  var ls = listeners.slice();
  for (var i = 0; i < ls.length; i++) {
    try { ls[i](); } catch (e) { /* 订阅者异常不得影响切屏路径 */ }
  }
}

function replaceState(patch) {
  state = Object.assign({}, state, patch);
  emit();
}

// 切到指定屏并压栈（同屏不重复压）；非法 id 回落 home。
function navigate(screenId) {
  var id = (SCREENS.indexOf(screenId) >= 0) ? screenId : 'home';
  if (id === state.screen) return;
  replaceState({ screen: id, stack: state.stack.concat([state.screen]) });
}

// P33·③：返回布尔给调用方（Android 硬件返回键用）—— 栈空返回 false，交还系统
// （在主页按返回键＝退出应用）；回退成功返回 true。
function goBack() {
  if (!state.stack.length) return false;
  var next = state.stack[state.stack.length - 1];
  replaceState({ screen: next, stack: state.stack.slice(0, -1) });
  return true;
}

// Platform.ui.showScreen(id) 的 Electron id 入口；返回实际落到的 RN 屏 id。
function navigateByElectronId(electronId) {
  var id = Object.prototype.hasOwnProperty.call(ELECTRON_SCREEN_MAP, electronId)
    ? ELECTRON_SCREEN_MAP[electronId]
    : 'home';
  navigate(id);
  return id;
}

// Platform.ui.renderTopbar / updateTokenBadge 的"重渲染信号"入口。
// 数据真源仍在 GameState（HUD / _totalTokens），组件收到信号后自行现读，
// store 不复制业务数据，只维护单调计数。
function notify(kind) {
  if (kind === 'topbar') {
    replaceState({ topbarSeq: state.topbarSeq + 1 });
  } else if (kind === 'tokenBadge') {
    replaceState({ badgeSeq: state.badgeSeq + 1 });
  }
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

// 仅供 Node smoke 复位到初始态（生产路径不调用）
function reset() {
  state = { screen: 'home', stack: [], topbarSeq: 0, badgeSeq: 0 };
  listeners = [];
}

module.exports = {
  SCREENS: SCREENS,
  ELECTRON_SCREEN_MAP: ELECTRON_SCREEN_MAP,
  navigate: navigate,
  goBack: goBack,
  navigateByElectronId: navigateByElectronId,
  notify: notify,
  subscribe: subscribe,
  getSnapshot: getSnapshot,
  reset: reset
};

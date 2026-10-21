// ============================================================
// 战役 4 · 批次 4-3：叙事页运行时编排（A 类，零 React / 零 RN 依赖）
// RN 独有（阶段 0 报告 R1）。复刻 Electron 侧两处 DOM 编排的纯数据流：
//   continueSave  engine/ui_cards.js L119-172（主页 01 续玩）
//   rebuildStoryFromHistory engine/ui_core.js L386-415（历史重放）
//   exitGame      engine/ui_core.js L271-301（退出清理）
// 所有 UI 输出仍走 Platform.ui 收口壳（与 Electron 同构），RN 不直连 store，
// 壳再经 rn_platform 桥接进 story_store——续玩重放与真实叙事流走同一条链。
//
// 角色创建页（screen-create）与肖像页（screen-portrait）均已实装：
// 缺创角 / 缺人设的存档由 routeMissingStep 真跳转（创角屏 / 人设屏），
// 不再只弹拦截文案（P6·S2 把「假占位拦人」接成真动作）。
//
// Storage / Saves / GameState / StoryLoop / ToolExecutor / Platform 均为
// bootstrap 挂载全局，裸用同 engine 风格；Node smoke 注入内存假件。
// ============================================================

'use strict';

var HomeModel = require('./home_model.js');

// P72·D6 的引擎底座：消息树（planRounds / splitAssistant / parseOptions）。
// bootstrap 会把 engine/message_tree.js 挂成全局 MessageTree；但 Node smoke、
// 早启动时序、以及"只 require 本文件"的调用方那里可能还没挂上——这里兜一层
// require。两者都拿不到才退回旧的两两配对，并打一条警告：
// 绝不能静默重放出空剧情（真机上的表现就是"点继续，只剩一条提示"）。
var _MessageTree = null;
function resolveMessageTree() {
  if (_MessageTree) return _MessageTree;
  if (typeof MessageTree !== 'undefined' && MessageTree && MessageTree.planRounds) {
    _MessageTree = MessageTree;
    return _MessageTree;
  }
  try { _MessageTree = require('../engine/message_tree.js'); } catch (e) { _MessageTree = null; }
  return _MessageTree;
}

// 兜底配对：`[system, user, assistant, …]` 两两成对（P72 之前的旧口径）。
// 只用于 MessageTree 完全拿不到的降级路径——插了合成 user 时会串轮，
// 所以命中这条路径必须警告，便于现场定位。
function legacyPlan(history) {
  var out = [];
  for (var i = 1; i + 1 < history.length; i += 2) {
    var u = history[i], a = history[i + 1];
    if (!a || a.role !== 'assistant') continue;
    var opening = (i === 1);
    out.push({
      round: out.length + 1,
      hint: (u && u.role === 'user') ? (opening ? '（游戏开始）' : ('（' + String(u.content || '') + '）')) : null,
      content: a.content,
      meta: a.meta || null,
      index: i + 1,
      playerNodeId: null
    });
  }
  return out;
}

// nav_store 是纯 JS（无 React/RN 依赖），直连同实例（与 rn_platform 同款 try/catch）；
// 拿不到时 routeMissingStep 返回 false，continueLast 的返回值不受影响。
var NavStore = null;
try { NavStore = require('./nav_store.js'); } catch (e) { NavStore = null; }

// 缺创角 / 缺人设 ⇒ 真跳转（替代原「只弹文案」的假占位拦截）。
// 缺创角：切创角屏；缺人设：UI_Portrait.start（complete 回调进游戏并起回合）。
// 返回 true 表示已接管跳转，调用方不再弹拦截文案。
function routeMissingStep(reason) {
  if (reason === 'create-flow') {
    if (NavStore) NavStore.navigate('create');
    return !!NavStore;
  }
  if (reason === 'portrait') {
    var up = (typeof globalThis !== 'undefined') ? globalThis.UI_Portrait : null;
    if (up && typeof up.start === 'function') {
      var pd = (typeof GameState !== 'undefined' && GameState) ? (GameState.playerData || {}) : {};
      up.start(pd, function () {
        Platform.ui.showScreen('screen-game');
        Platform.ui.renderGame();
        StoryLoop.start();
      });
      return true;
    }
    return false;
  }
  return false;
}

// 打开指定存档（P10·A1 抽公共：主页存档行 / 存档屏「打开」/ 主页 01 三处共用）。
// 复刻 ui_cards.js continueSave L119-172：装载 → 四分支 → 进叙事页；
// 末条若是未答复的真玩家消息 ⇒ 自动续接该轮（resume-pending，对齐桌面 :162-171）。
// 返回 {ok:true, mode:'fresh'|'resume'|'resume-pending'}
//   或 {ok:false, reason:'load-failed'|'create-flow'|'portrait'}
// create-flow / portrait 分支带 routed:true 时表示 routeMissingStep 已接管跳转，
// 调用方不再弹拦截文案（P6·S2）。
async function openSave(cardId, saveId) {
  if (!GameState.loadFromSave(cardId, saveId)) {
    return { ok: false, reason: 'load-failed' };
  }

  var pd = GameState.playerData || {};
  var hasPlayerData = Object.keys(pd).filter(function (k) { return k !== 'inventory'; }).length > 0;
  var hasPortrait = pd.portrait && pd.portrait.summary;
  var hasHistory = GameState.chatHistory.length > 0;

  if (!hasPlayerData) return { ok: false, reason: 'create-flow', routed: routeMissingStep('create-flow') };
  if (!hasPortrait) return { ok: false, reason: 'portrait', routed: routeMissingStep('portrait') };

  Platform.ui.showScreen('screen-game');
  Platform.ui.renderGame();

  if (!hasHistory) {
    StoryLoop.start();
    return { ok: true, mode: 'fresh' };
  }

  replayHistory();

  var lastMsg = GameState.chatHistory[GameState.chatHistory.length - 1];
  var isRealUser = lastMsg
    && lastMsg.role === 'user'
    && !String(lastMsg.content || '').startsWith('【系统 ·');
  if (isRealUser) {
    Platform.ui.appendHint('（上次未完成，正在续接…）');
    setTimeout(function () { StoryLoop.callAI(); }, 300);
    return { ok: true, mode: 'resume-pending' };
  }
  Platform.ui.appendHint('（已回到上次的进度）');
  return { ok: true, mode: 'resume' };
}

// 主页 01 续玩：装载最近存档 → 交 openSave 走同一条分支链（单一实现，不再各写一遍）
async function continueLast() {
  var last = HomeModel.buildLastSave();
  if (!last) return { ok: false, reason: 'no-save' };
  return openSave(last.cardId, last.saveId);
}

// 历史重放：重建章节头、段、选项与玩家行动灰字。
// ★ P72·D6（RN 侧同步）：不再用固定步长 i += 2 两两配对——只要一轮里插了合成
//   user（工具反馈 / 事件通报 / 任务状态 / 成就 / 手机混流），后面整段配对就错位，
//   表现为"回到上一条之后某一轮整段消失"。现在与桌面共用
//   engine/message_tree.js 的 planRounds / splitAssistant / parseOptions：
//   assistant 决定章数、最近一条真玩家输入决定提示行，合成 user 不占轮。
function replayHistory() {
  Platform.ui.clearStory();
  var messages = GameState.chatHistory || [];
  var mt = resolveMessageTree();
  var plan;
  if (mt && mt.planRounds) {
    plan = mt.planRounds(messages);
  } else {
    // 降级路径：MessageTree 完全拿不到（理论上不该发生，bootstrap 会挂全局）。
    // 用旧的两两配对顶上并警告，避免"继续游戏后只剩一条提示"这种静默空屏。
    try { console.warn('[P72] MessageTree 未加载，重放退回旧配对（合成 user 会串轮）'); } catch (e0) {}
    plan = legacyPlan(messages);
  }
  for (var k = 0; k < plan.length; k++) {
    var it = plan[k];
    var roundNum = it.round;
    // P72·W2：带 playerNodeId——行动灰字行长按可「改这句」（窗内）
    if (it.hint) Platform.ui.appendHint(it.hint, it.playerNodeId);
    var story = it.content, options = [];
    var clean = ToolExecutor.strip(it.content);
    var sp = mt && mt.splitAssistant
      ? mt.splitAssistant(clean)
      : { story: clean, optionsRaw: '', bodyHit: false, optHit: false };
    if (sp.bodyHit) story = sp.story;
    if (sp.optHit && mt && typeof mt.parseOptions === 'function') {
      options = mt.parseOptions(sp.optionsRaw);
    }
    StoryLoop.currentOptions = options;
    Platform.ui.renderChapterHead(roundNum);
    Platform.ui.appendStory(story, options, 0, null, roundNum, it.meta);
  }
}

// 退出游戏：确认文案/清理字段顺序与 ui_core.exitGame 一字不差；返回是否退出
async function exitGame() {
  var playing = GameState.currentCardId && GameState.currentSaveId && GameState.currentState;
  if (playing) {
    if (StoryLoop.busy) {
      if (!(await Platform.ui.confirmAsync('AI 正在生成中，确定退出？\n（生成的这一轮会丢失）'))) return false;
    } else {
      if (!(await Platform.ui.confirmAsync('退出游戏？\n\n✓ 进度已自动保存\n\n下次可以从"存档"里继续。'))) return false;
    }
    try { GameState.persist(); } catch (e) { /* 保存失败仍退出，同 Electron */ }
  }
  GameState._sessionToken = Date.now();
  GameState.currentCardId = null;
  GameState.currentSaveId = null;
  GameState.currentCard = null;
  GameState.currentState = null;
  GameState.playerData = {};
  GameState.chatHistory = [];
  GameState._gameTime = null;
  GameState._totalTokens = 0;
  GameState._cachedStaticDynamic = null;
  GameState._lastReasoning = '';
  GameState._lastContent = '';
  GameState._lastUsage = null;
  GameState._lastCheck = null;
  GameState._pendingSystemNotices = [];
  GameState._sessionStart = 0;
  StoryLoop.currentOptions = [];
  StoryLoop.busy = false;
  StoryLoop._regenContext = null;
  Platform.ui.showHome();
  return true;
}

// 续玩失败原因 → 面向玩家文案（HomeScreen 经 Platform.dialog.alert 呈现，
// 与 GameState.loadFromSave 失败时的 alert 风格一致；4-3b toast 接通后不改这里）
// P5 · S7：创角流程（CreateScreen + create_flow_model）与肖像（H6 UI_Portrait）
// 均已实装，原「后续批次接入」措辞已失真，改为指向玩家可执行的动作。
var CONTINUE_REASONS = {
  'no-save': '暂无存档，请先在主页新建一个存档',
  'create-flow': '该存档尚未完成角色创建，请重新创建角色',
  'portrait': '该存档缺少角色肖像，请重新创建角色',
  'load-failed': '存档不存在或已损坏'
};

module.exports = {
  CONTINUE_REASONS: CONTINUE_REASONS,
  routeMissingStep: routeMissingStep,
  openSave: openSave,
  continueLast: continueLast,
  replayHistory: replayHistory,
  exitGame: exitGame
};

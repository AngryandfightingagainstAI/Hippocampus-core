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

// 历史重放：逐 user/assistant 对重建章节头、段、选项与玩家行动灰字。
// 正则与步进同 ui_core L386-415；输出全部走 Platform.ui 壳。
function replayHistory() {
  Platform.ui.clearStory();
  var messages = GameState.chatHistory || [];
  var i = 1;
  var roundNum = 0;
  while (i < messages.length) {
    var u = messages[i], a = messages[i + 1];
    if (u && u.role === 'user') {
      if (!(u.content && u.content.indexOf('【系统 ·') === 0)) {
        roundNum++;
        if (i > 1) Platform.ui.appendHint('（' + u.content + '）');
        else Platform.ui.appendHint('（游戏开始）');
      }
    }
    if (a && a.role === 'assistant') {
      var story = a.content, options = [];
      var clean = ToolExecutor.strip(a.content);
      var bm = clean.match(/(?:【正文】|【故事】)([\s\S]*?)(?=(?:【时间】|【选项】|【选项列表】|$))/);
      var om = clean.match(/(?:【选项】|【选项列表】)([\s\S]*)$/);
      if (bm) story = bm[1].trim();
      if (om) {
        options = om[1].split('\n').map(function (l) {
          return l.replace(/^\s*\d+[\.、\)）]\s*/, '').trim();
        }).filter(Boolean);
      }
      StoryLoop.currentOptions = options;
      Platform.ui.renderChapterHead(roundNum);
      Platform.ui.appendStory(story, options, 0, null, roundNum, a.meta);
    }
    i += 2;
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

// ============================================================
// P1-D · 快照行内动作编排（A 类，零 React / 零 RN 依赖）
// 桌面锚点：engine/ui_snapshot.js
//   onRegenerateClick L11 / doRegenerate L31 / onRollbackClick L78
// 快照栈：engine/snapshots.js（list / rollbackLast / rollbackTo）。
// P6·S3-5：桌面「重新生成」先弹 textarea 收集玩家意见（ui_snapshot L18-28），
//   RN 已实装 promptAsync（story_store.promptOpen → OverlayHost.PromptModal，
//   支持 multiline）⇒ 本轮接线后 _regenContext.comment 不再是恒 ''。
// 输出全走 Platform.ui 收口壳；Snapshots / Logger / GameState / StoryLoop /
//   Platform 均为 bootstrap 挂载全局，裸用同 engine 风格；Node smoke 注入假件。
// ============================================================

'use strict';

var StoryRuntime = require('./story_runtime.js');
var StoryStore = require('./story_store.js');

// 最近一条 assistant 正文（ui_snapshot L42-49）
function lastAssistantText() {
  var history = (typeof GameState !== 'undefined' && GameState.chatHistory) || [];
  for (var i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') return history[i].content || '';
  }
  return '';
}

// 按游戏内日期 + 轮次删回退点之后的日志
// （ui_snapshot L56-62 / L104-107；★ P4 追加第 4 参 round：
//   当天日志不再整条删，只截断该轮之后的原文）
function deleteLogsAfterRollback(snap) {
  try {
    if (snap && snap.gameTime && typeof Logger !== 'undefined' &&
        GameState.currentCardId && GameState.currentSaveId) {
      var deleted = Logger.deleteLogsAfter(GameState.currentCardId, GameState.currentSaveId, snap.gameTime, snap.round);
      if (deleted > 0) Platform.ui.appendHint('（已回退日志 ' + deleted + ' 条）');
    }
  } catch (e) { /* 日志回退失败不阻断主链（同 ui_snapshot L61） */ }
}

// 重绘剧情区（RN = story_runtime.replayHistory，对齐 ui_core.rebuildStoryFromHistory）
function replayStory() {
  StoryRuntime.replayHistory();
}

// 重新生成最新一轮（ui_snapshot.onRegenerateClick + doRegenerate 合并）
// 返回 true 表示已发起重跑；false 表示被前置条件拦下或玩家取消。
async function regenerate() {
  if (typeof StoryLoop === 'undefined' || !StoryLoop) return false;
  if (StoryLoop.busy) { Platform.ui.toast('AI 正在生成，稍等', { type: 'warn' }); return false; }

  var snaps = Snapshots.list();
  if (!snaps.length) { Platform.ui.toast('没有可重新生成的轮次', { type: 'warn' }); return false; }

  // P6·S3-5：收多行意见（桌面 ui_snapshot.js:19-28 的 textarea）——
  // 走 story_store.promptOpen → OverlayHost.PromptModal（multiline）。
  // 取消（null）即中止；空串视为「没写意见」，仍继续重跑（同桌面 comment 可为空）。
  var comment = await StoryStore.promptOpen(
    '告诉 AI 你对这一轮哪里不满意，它会重写。这一轮的所有工具效果（加的物品、改的数值）都会被回滚。',
    '',
    {
      multiline: true,
      rows: 5,
      okText: '重新生成',
      cancelText: '取消',
      placeholder: '例：刚才 NPC 的反应太温柔了，他应该很警惕；环境描写太长'
    }
  );
  if (comment === null) return false;

  var rejectedText = lastAssistantText();
  var r = Snapshots.rollbackLast();
  if (!r.ok) { Platform.ui.toast('回滚失败：' + r.reason, { type: 'error' }); return false; }

  deleteLogsAfterRollback(r.snap);
  StoryLoop._regenContext = { rejected: rejectedText, comment: String(comment).trim() };
  replayStory();
  StoryLoop.retryLast();
  return true;
}

// 回到第 round 轮开始前（ui_snapshot.onRollbackClick）
async function rollbackToRound(round) {
  if (typeof StoryLoop !== 'undefined' && StoryLoop && StoryLoop.busy) {
    Platform.ui.toast('AI 正在生成，稍等', { type: 'warn' }); return false;
  }
  var snaps = Snapshots.list();
  var target = null;
  snaps.forEach(function (s) { if (s.round === round) target = s; });
  if (!target) { Platform.ui.toast('找不到这一轮的快照', { type: 'warn' }); return false; }

  var laterRounds = snaps.filter(function (s) { return s.round > round; }).length;
  if (!laterRounds) { Platform.ui.toast('这已经是最新轮次，无需回退', { type: 'info' }); return false; }

  var msg = '⚠ 回退到第 ' + round + ' 轮开始前，会丢弃之后的 ' + laterRounds + ' 轮：\n\n' +
    '· 之后的剧情对话\n' +
    '· 之后所有数值变更（HUD / 面板 / 关系）\n' +
    '· 之后获得的物品\n' +
    '· 之后更新的 NPC 状态\n' +
    '· 之后生成的日志\n\n' +
    '确定？';
  if (!(await Platform.ui.confirmAsync(msg))) return false;

  var r = Snapshots.rollbackTo(round);
  if (!r.ok) { Platform.ui.toast('回退失败：' + r.reason, { type: 'error' }); return false; }

  deleteLogsAfterRollback(r.snap);
  Platform.ui.renderTopbar();
  Platform.ui.renderSidebarExpanded();
  replayStory();
  Platform.ui.appendHint('（已回退到第 ' + round + ' 轮，可以改你当时的输入）');
  return true;
}

module.exports = {
  regenerate: regenerate,
  rollbackToRound: rollbackToRound,
  lastAssistantText: lastAssistantText
};
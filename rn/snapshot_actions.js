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

// P72·W0-b 对齐桌面：回退不再物理删日志（deleteLogsAfter 只留给显式入口），
// 改成"归档"——按被切掉的 messageId 把对应日志块标 archived，日志页
// 「显示已归档」还能看。旧分支被切回来时日志也仍在。
// 桌面锚点：engine/ui_snapshot.js doRegenerate / onRollbackClick 里的
//   Logger.archiveAfter(cardId, saveId, lostMsgIds)。
function archiveLogsAfter(snap, ids, hintPrefix) {
  try {
    if (!ids || !ids.length) return 0;
    if (typeof Logger === 'undefined' || !Logger.archiveAfter) return 0;
    if (!GameState.currentCardId || !GameState.currentSaveId) return 0;
    var archived = Logger.archiveAfter(GameState.currentCardId, GameState.currentSaveId, ids);
    if (archived > 0) Platform.ui.appendHint('（已归档' + (hintPrefix || '回退前') + '的日志 ' + archived + ' 块）');
    return archived;
  } catch (e) { return 0; }
}

// 重绘剧情区（RN = story_runtime.replayHistory，对齐 ui_core.rebuildStoryFromHistory）
function replayStory() {
  StoryRuntime.replayHistory();
}

// P72·W1 对齐桌面：本档是否有可用的消息树 + 该快照是否带 messageId 且节点仍在。
// 有树 ⇒ 回退/重跑改走"切分支"（节点、日志、后续快照全保留，‹i/n› 可切回）；
// 无树老档 ⇒ 保留旧的截断路径（老档零变化）。
function haveTreeFor(snap) {
  return !!(typeof GameState !== 'undefined' && GameState.messageTree &&
    typeof MessageTree !== 'undefined' && typeof MessageTree.byId === 'function' &&
    snap && snap.messageId && MessageTree.byId(snap.messageId));
}

// P72·W1-b 对齐桌面 _branchStepBack：分支步退公共核心。
// 切 activeLeaf 到本轮 action 节点的父（= 上一轮 story 末尾）+ restoreOnly
// 恢复该轮开始前快照（只恢复不截断，快照文件全留）+ 非破坏归档被切掉的日志
// + 重绘 + 提示。桌面 engine/ui_snapshot.js:_branchStepBack 是同一口径。
function branchStepBack(actionId, round, tailIds, hint) {
  var actionNd = (typeof MessageTree !== 'undefined' && MessageTree.byId) ? MessageTree.byId(actionId) : null;
  if (!actionNd || !MessageTree.setActiveLeaf(actionNd.parentId)) return { ok: false, reason: '分支切换失败' };
  var rr = Snapshots.restoreOnly(round);
  if (!rr.ok) return { ok: false, reason: rr.reason };
  archiveLogsAfter(null, tailIds, '回退前');
  Platform.ui.renderTopbar();
  Platform.ui.renderSidebarExpanded();
  replayStory();
  if (hint) Platform.ui.appendHint(hint);
  return { ok: true };
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
  // P72·W1 对齐桌面：有树档改走分支——被否决的输出节点保留（‹i/n› 可切回），
  //   activeLeaf 切回本轮 action，restoreOnly 只恢复数据面不截断；retryLast 重跑时
  //   新 story 挂 action 下成为兄弟版本。无树老档保留截断 + 非破坏归档。
  if (typeof GameState !== 'undefined' && GameState.messageTree &&
      typeof MessageTree !== 'undefined' && typeof MessageTree.byId === 'function') {
    var leafId = MessageTree.activeLeafId();
    var leaf = leafId ? MessageTree.byId(leafId) : null;
    if (leaf && leaf.parentId) {
      var rr = Snapshots.restoreOnly(Snapshots._currentRound());
      if (!rr.ok) { Platform.ui.toast('重跑失败：' + rr.reason, { type: 'error' }); return false; }
      if (!MessageTree.setActiveLeaf(leaf.parentId)) {
        Platform.ui.toast('重跑失败：分支切换失败', { type: 'error' }); return false;
      }
    } else {
      Platform.ui.toast('重跑失败：分支切换失败', { type: 'error' }); return false;
    }
  } else {
    var r = Snapshots.rollbackLast();
    if (!r.ok) { Platform.ui.toast('回滚失败：' + r.reason, { type: 'error' }); return false; }
    archiveLogsAfter(r.snap, r.lostMsgIds, '重新生成前');
  }

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

  var snap = Snapshots.peek(round);
  var haveTree = haveTreeFor(snap);

  var msg = haveTree
    ? (round === 0
        ? '⚠ 回到游戏开头，之后的 ' + laterRounds + ' 轮转入旧分支：\n\n' +
          '· 之后的剧情从本线隐藏（节点保留，版本按钮可再切回）\n' +
          '· 数值 / 物品 / NPC 回到刚开局（开场白之后）\n' +
          '· 之后的日志转入归档（日志页「显示已归档」可看）\n\n' +
          '确定？'
        : '⚠ 回到第 ' + round + ' 轮开始前，之后的 ' + laterRounds + ' 轮转入旧分支：\n\n' +
          '· 之后的剧情从本线隐藏（节点保留，版本按钮可再切回）\n' +
          '· 数值 / 物品 / NPC 回到这一轮开始前\n' +
          '· 之后的日志转入归档（日志页「显示已归档」可看）\n\n' +
          '确定？')
    : '⚠ 回退到第 ' + round + ' 轮开始前，会丢弃之后的 ' + laterRounds + ' 轮：\n\n' +
      '· 之后的剧情对话\n' +
      '· 之后所有数值变更（HUD / 面板 / 关系）\n' +
      '· 之后获得的物品\n' +
      '· 之后更新的 NPC 状态\n' +
      '· 之后生成的日志\n\n' +
      '确定？';
  if (!(await Platform.ui.confirmAsync(msg))) return false;

  if (haveTree) {
    // —— P72·W1 分支路径：只切线恢复，不删节点、不删日志、不删后续快照 ——
    var ids = MessageTree.mainlineIds();
    var cutIdx = (ids ? ids.indexOf(snap.messageId) : -1);
    var tailIds = (cutIdx >= 0) ? ids.slice(cutIdx) : null;
    var rb = branchStepBack(snap.messageId, round, tailIds,
      '（已回到第 ' + round + ' 轮开始前；之后的轮次转入旧分支，节点与日志都保留）');
    if (!rb.ok) Platform.ui.toast('回退失败：' + rb.reason, { type: 'error' });
    return rb.ok;
  }

  // —— 无树老档：截断式回退 + 非破坏归档（与桌面 W0-b 旧路径一字不差） ——
  var r = Snapshots.rollbackTo(round);
  if (!r.ok) { Platform.ui.toast('回退失败：' + r.reason, { type: 'error' }); return false; }

  archiveLogsAfter(r.snap, r.lostMsgIds, '回退前');
  Platform.ui.renderTopbar();
  Platform.ui.renderSidebarExpanded();
  replayStory();
  Platform.ui.appendHint('（已回退到第 ' + round + ' 轮，可以改你当时的输入）');
  return true;
}

// P72·W1-b：撤销上一步（Android 返回键入口，StoryScreen 的 BackHandler 调用）。
// 桌面锚点：engine/ui_snapshot.js undoLastStep（顶栏按钮 / Ctrl+Z 共调）。
// 一键退回当前主线最新一轮：切 activeLeaf 到本轮 action 节点的父（= 上一轮
// story 末尾）+ restoreOnly 恢复该轮开始前快照 + 非破坏归档被撤线段；
// 节点 / 日志 / 后续快照全保留。定位按主线末真 action 对 messageId
// （快照轴显示轴双免疫）。↩ 回到这里（rollbackToRound）/ ‹i/n›（未来批）/
// 撤销上一步是三个不同动作——本函数只管退回一轮，内部步骤与桌面同语义。
// 无树老档回落 rollbackLast + 非破坏归档（W0-b 口径，不用物理删日志）。
function undoLastStep() {
  if (typeof StoryLoop !== 'undefined' && StoryLoop && StoryLoop.busy) {
    Platform.ui.toast('AI 正在生成，稍等', { type: 'warn' });
    return false;
  }
  if (typeof GameState !== 'undefined' && GameState.messageTree &&
      typeof MessageTree !== 'undefined' && typeof MessageTree.byId === 'function') {
    var line = MessageTree.mainlineIds();
    var actionNd = null;
    if (line) {
      for (var i = line.length - 1; i >= 0; i--) {
        var nd = MessageTree.byId(line[i]);
        if (nd && nd.kind === 'action' && String((nd.msg && nd.msg.content) || '').indexOf('【系统 ·') !== 0) { actionNd = nd; break; }
      }
    }
    // list() 只回 {round,timestamp,reason} 摘要（P54 契约，不许改）——
    // messageId 得逐轮 peek 读全量来对；从最新往旧找，正常首轮即中。
    var snap = null;
    if (actionNd) {
      var rounds = Snapshots.list().map(function (s) { return s.round; });
      for (var ri = rounds.length - 1; ri >= 0; ri--) {
        var sp = Snapshots.peek(rounds[ri]);
        if (sp && sp.messageId === actionNd.id) { snap = sp; break; }
      }
    }
    if (snap) {
      var parentNd = MessageTree.byId(actionNd.parentId);
      if (!parentNd || parentNd.kind !== 'story') {
        Platform.ui.toast('已是最早一轮，没有可撤销的轮次', { type: 'info' });
        return false;
      }
      if (!MessageTree.setActiveLeaf(actionNd.parentId)) {
        Platform.ui.toast('撤销失败：分支切换失败', { type: 'error' });
        return false;
      }
      var rr = Snapshots.restoreOnly(snap.round);
      if (!rr.ok) { Platform.ui.toast('撤销失败：' + rr.reason, { type: 'error' }); return false; }
      try {
        var cutIdx = line.indexOf(actionNd.id);
        if (cutIdx >= 0 && typeof Logger !== 'undefined' && GameState.currentCardId && GameState.currentSaveId) {
          var tailIds = line.slice(cutIdx);
          var archived = Logger.archiveAfter(GameState.currentCardId, GameState.currentSaveId, tailIds);
          if (archived > 0) Platform.ui.appendHint('（已归档撤销前的日志 ' + archived + ' 块）');
        }
      } catch (e) { /* 归档失败不阻断撤销（同桌面 _branchStepBack） */ }
      Platform.ui.renderTopbar();
      Platform.ui.renderSidebarExpanded();
      replayStory();
      Platform.ui.toast('已回到上一轮', { type: 'info' });
      Platform.ui.appendHint('（被撤分支保留，可随时切回）');
      return true;
    }
    // 快照没对上（老档快照缺 messageId / 快照丢失）：走下面旧口径
  }
  var r = Snapshots.rollbackLast();
  if (!r.ok) { Platform.ui.toast('撤销失败：' + r.reason, { type: 'error' }); return false; }
  try {
    if (typeof Logger !== 'undefined' && GameState.currentCardId && GameState.currentSaveId && r.lostMsgIds) {
      var archived2 = Logger.archiveAfter(GameState.currentCardId, GameState.currentSaveId, r.lostMsgIds);
      if (archived2 > 0) Platform.ui.appendHint('（已归档撤销前的日志 ' + archived2 + ' 块）');
    }
  } catch (e) { /* 归档失败不阻断撤销 */ }
  Platform.ui.renderTopbar();
  Platform.ui.renderSidebarExpanded();
  replayStory();
  Platform.ui.toast('已回到上一轮', { type: 'info' });
  return true;
}

// P72·W2：改这句（StoryScreen 长按行动灰字行触发；桌面锚点
//   engine/ui_snapshot.js onEditAction——数据核心共用 mirror 件的
//   MessageTree.editAction，两仓同一份）。promptOpen 收新文本 → editAction
//   （同父挂新 action 分支 / 同内容兄弟复用，原分支全保留）→ 按原 action
//   的 messageId 逐轮 peek 找该轮快照 restoreOnly（只恢复不截断；找不到就
//   跳过数据面恢复，记报告遗留）→ replayStory 重绘 → retryLast 让 AI 按
//   改后的行动重写这一轮（与 regenerate 同构的分支版，callAI 内 push 按
//   activeLeafId=新 action 记 messageId，快照契约闭环）。
async function editAction(nodeId) {
  if (typeof StoryLoop !== 'undefined' && StoryLoop && StoryLoop.busy) {
    Platform.ui.toast('AI 正在生成，稍等', { type: 'warn' });
    return false;
  }
  var node = (typeof MessageTree !== 'undefined' && typeof MessageTree.byId === 'function')
    ? MessageTree.byId(nodeId) : null;
  if (!node || node.kind !== 'action') { Platform.ui.toast('这一轮不能编辑', { type: 'warn' }); return false; }
  var newText = await StoryStore.promptOpen('把这一轮的行动改成：',
    String((node.msg && node.msg.content) || ''), { okText: '改写', cancelText: '取消' });
  if (newText === null) return false;   // 取消
  var r = MessageTree.editAction(nodeId, newText);
  if (!r.ok) { Platform.ui.toast('改写失败：' + (r.reason || '未知原因'), { type: 'error' }); return false; }
  // 恢复该轮开始前的数据面（不截断、不删快照、不删旧分支、不归档日志）
  var rounds = Snapshots.list().map(function (s) { return s.round; });
  for (var ri = rounds.length - 1; ri >= 0; ri--) {
    var sp = Snapshots.peek(rounds[ri]);
    if (sp && sp.messageId === nodeId) { Snapshots.restoreOnly(sp.round); break; }
  }
  Platform.ui.renderTopbar();
  Platform.ui.renderSidebarExpanded();
  replayStory();
  Platform.ui.appendHint(r.reused
    ? '（已切到这一轮的「' + String(newText).slice(0, 40) + '」版本）'
    : '（已改写这一轮的行动，原分支保留，可随时切回）');
  if (typeof StoryLoop !== 'undefined' && StoryLoop && StoryLoop.retryLast) StoryLoop.retryLast();
  return true;
}

module.exports = {
  regenerate: regenerate,
  rollbackToRound: rollbackToRound,
  undoLastStep: undoLastStep,
  editAction: editAction,
  lastAssistantText: lastAssistantText
};
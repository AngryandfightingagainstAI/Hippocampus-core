// ============================================================
// 战役 4 · 批次 4-3c：提议卡交互（A 类，零 React/RN 依赖，Node 可直测）
// 搬运 Electron ui_core.js 三个 UI 方法的完整行为：
//   appendProposalCard（L950-987）：Proposals.list 按 id 现查 → 卡入叙事流
//   acceptChange（L989-1039）：防重入 + Proposals.confirm 三分支
//     （ok / needsConfirm 二次确认「仍然执行」/ 失败 toast）
//   rejectChange（L1041-1066）：处理中拦截 warn toast + Proposals.reject
// 卡面状态文案逐字对齐：「已接受 · 游戏时间」「已拒绝 · 游戏时间」、
// hint「（已接受提议：label）」「（已强制接受提议：label）」。
//
// Electron 中 acceptChange/rejectChange 是 DOM 按钮 onclick 入口（engine
// 不直接调），故 rn_platform 不包这两壳，由 ProposalCard 组件直接调本模块；
// appendProposalCard 由 story.js L278 经 Platform.ui 壳进入。
// Electron markAccepted 内「modal 打开时重开 changeProposals 面板」分支：
// R3 裁决面板入口跳过，该分支不搬运（关账自报）。
// ============================================================

'use strict';

var StoryStore = require('./story_store.js');
var NavStore = require('./nav_store.js');

// 同 UI._acceptingProposals：pid -> true，接受/拒绝共用一把锁
var acceptingMap = {};

function appendCard(proposalId) {
  if (typeof Proposals === 'undefined' || !Proposals) return;
  if (!proposalId) return;
  var list = Proposals.list();
  var p = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === proposalId) { p = list[i]; break; }
  }
  if (!p) return;
  var title = (typeof Proposals.describe === 'function') ? Proposals.describe(p) : p.type;
  StoryStore.appendProposalCard({
    pid: proposalId,
    title: String(title == null ? '' : title),
    reason: p.reason || ''
  });
}

function gameTimeText() {
  try { return GameState.formatGameTime(); } catch (e) { return ''; }
}

// 接受成功后的副作用与 Electron markAccepted 一致：
// 卡面状态 + hint + persist + topbar/侧栏刷新（modal 重开分支不搬运）
function markAccepted(id, forced, label) {
  StoryStore.updateProposal(id, {
    status: 'accepted',
    statusText: '已接受 · ' + gameTimeText(),
    accepting: false
  });
  var hint = '（已' + (forced ? '强制' : '') + '接受提议' + (label ? '：' + label : '') + '）';
  Platform.ui.appendHint(hint);
  try { GameState.persist(); } catch (e) { console.warn('[acceptChange] persist 失败：', e); }
  try { if (NavStore) NavStore.notify('topbar'); } catch (e) {}
  StoryStore.renderGame();
}

async function accept(id) {
  if (typeof Proposals === 'undefined' || !Proposals) return;
  if (acceptingMap[id]) return; // 防重入，重复点击静默返回（同 Electron）
  acceptingMap[id] = true;
  StoryStore.updateProposal(id, { accepting: true });
  try {
    var r = await Proposals.confirm(id);
    if (r.ok) {
      markAccepted(id, false, r.label);
    } else if (r.needsConfirm) {
      // B 层 AI 判定可能失效：二次确认，确定文案「仍然执行」
      var msg = r.reason || '这条变更可能已经不再合适了。';
      var doAnyway = await Platform.ui.confirmAsync(msg + '\n\n仍然执行吗？', {
        okText: '仍然执行',
        cancelText: '取消'
      });
      if (doAnyway) {
        var r2 = await Proposals.confirm(id, { skipSemanticCheck: true });
        if (r2.ok) {
          markAccepted(id, true, r2.label);
        } else {
          Platform.ui.toast('执行失败：' + r2.reason, { type: 'error' });
        }
      }
    } else {
      Platform.ui.toast('接受失败：' + r.reason, { type: 'error' });
    }
  } catch (e) {
    Platform.ui.toast('异常：' + (e && e.message), { type: 'error' });
  } finally {
    delete acceptingMap[id];
    StoryStore.updateProposal(id, { accepting: false });
  }
}

function reject(id) {
  if (typeof Proposals === 'undefined' || !Proposals) return;
  if (acceptingMap[id]) {
    Platform.ui.toast('该提议正在处理中', { type: 'warn' });
    return;
  }
  acceptingMap[id] = true;
  StoryStore.updateProposal(id, { accepting: true });
  try {
    var r = Proposals.reject(id);
    if (r.ok) {
      StoryStore.updateProposal(id, {
        status: 'rejected',
        statusText: '已拒绝 · ' + gameTimeText(),
        accepting: false
      });
    } else {
      Platform.ui.toast('拒绝失败：' + r.reason, { type: 'error' });
    }
  } catch (e) {
    Platform.ui.toast('异常：' + (e && e.message), { type: 'error' });
  } finally {
    delete acceptingMap[id];
    StoryStore.updateProposal(id, { accepting: false });
  }
}

// 仅供 Node smoke 复位（生产路径不调用）
function reset() {
  acceptingMap = {};
}

module.exports = {
  appendCard: appendCard,
  accept: accept,
  reject: reject,
  reset: reset
};

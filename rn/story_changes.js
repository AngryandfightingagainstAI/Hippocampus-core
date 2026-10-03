// ============================================================
// 战役 4 · 批次 4-3：工具变更账块文本映射（A 类，零 React / 零 RN）
// RN 独有。逐分支同构搬运 Electron engine/ui_core.js formatChangesForUI
// （L490-584）：appendStory 第 4 参 toolResults → 页边变更行。
//
// 本批降级（4-3 阶段 0 报告 R2 已裁决）：Electron 行上的 renderIcon 图标
// 在 RN 图标体系建立前不渲染，StoryScreen 统一以文字项目符号 "· " 承载；
// icon 键原样保留，未来图标体系落地后直接回填，数据层不丢信息。
//
// NpcRuntime / GameState 为 bootstrap 挂载全局，裸用同 engine 风格；
// Node smoke 经 globalThis 注入内存假件。
// ============================================================

'use strict';

function npcName(id) {
  if (!id) return '';
  try {
    if (typeof NpcRuntime !== 'undefined' && NpcRuntime._findDef) {
      var def = NpcRuntime._findDef(id);
      if (def && def.name) return def.name;
    }
    var card = GameState.currentCard;
    if (card && card.worldbook && Array.isArray(card.worldbook.npcs)) {
      var found = null;
      card.worldbook.npcs.forEach(function (n) {
        if (!found && (n.id === id || n.name === id)) found = n;
      });
      if (found && found.name) return found.name;
    }
  } catch (e) { /* 回落 id */ }
  return id;
}

// 输入：ToolExecutor.executeAll 产出的 toolResults；输出 {icon,text}[]（已去重）
function formatChangesForUI(toolResults) {
  if (!toolResults || !toolResults.length) return [];
  var lines = [];
  toolResults.forEach(function (r) {
    if (!r || !r.ok) return;
    if (r.type2 === 'dice') return;
    if (r.type === 'query') return;
    if (r.type === 'hud' || r.type === 'sidebar' || r.type === 'entry') {
      if (r.oldVal != null && r.newVal != null) {
        var d = r.delta;
        var sign = d >= 0 ? '+' : '';
        var label = r.label || r.key || '数值';
        lines.push({ icon: null, text: label + ' ' + sign + d + '（' + r.newVal + '）' });
      }
    } else if (r.type === 'relation') {
      if (r.oldVal != null && r.newVal != null) {
        var rd = r.delta;
        var rsign = rd >= 0 ? '+' : '';
        lines.push({ icon: 'heart', text: '关系 ' + (r['from'] || '?') + ' → ' + (r.to || '?') + ' ' + rsign + rd + '（' + r.newVal + '）' });
      }
    } else if (r.type === 'item') {
      if (r.action === 'add') lines.push({ icon: 'package', text: '获得物品：' + r.name });
      else if (r.action === 'remove') lines.push({ icon: 'package', text: '失去物品：' + r.name });
    } else if (r.type === 'event') {
      if (r.action === 'trigger') lines.push({ icon: 'lightning', text: '事件触发：' + (r.eventName || r.eventId) });
      else if (r.action === 'cancel') lines.push({ icon: 'lightning', text: '事件取消：' + r.eventId });
      else if (r.action === 'ban') lines.push({ icon: 'lightning', text: '事件封禁：' + r.eventId });
      else if (r.action === 'unban') lines.push({ icon: 'lightning', text: '事件解封：' + r.eventId });
      else if (r.action === 'propose') lines.push({ icon: 'envelope-simple', text: '新事件提议：' + (r.eventName || r.eventId) });
    } else if (r.type === 'task') {
      if (r.action === 'add') lines.push({ icon: 'clipboard-text', text: '新任务：' + (r.taskName || r.taskId) });
      else if (r.action === 'step') lines.push({ icon: 'clipboard-text', text: '任务步骤完成：' + r.taskId + '/' + r.stepId });
      else if (r.action === 'complete') lines.push({ icon: 'clipboard-text', text: '完成任务：' + (r.taskName || r.taskId) });
      else if (r.action === 'fail') lines.push({ icon: 'clipboard-text', text: '任务失败：' + (r.taskName || r.taskId) });
      else if (r.action === 'abandon') lines.push({ icon: 'clipboard-text', text: '放弃任务：' + (r.taskName || r.taskId) });
    } else if (r.type === 'achievement') {
      if (r.action === 'unlock') lines.push({ icon: 'trophy', text: '成就解锁：' + (r.achievementName || r.achievementId) });
      else if (r.action === 'add') lines.push({ icon: 'trophy', text: '新成就：' + (r.achievementName || r.achievementId) });
    } else if (r.type === 'shop') {
      if (r.action === 'buy') lines.push({ icon: 'storefront', text: '购买 ' + r.item + ' ×' + r.count + '（-' + r.paid + ' ' + (r.currency || '') + '）' });
      else if (r.action === 'sell') lines.push({ icon: 'storefront', text: '出售 ' + r.item + '（+' + r.earned + ' ' + (r.currency || '') + '）' });
    } else if (r.type === 'status') {
      if (r.action === 'update') lines.push({ icon: 'device-mobile', text: (r.key || '状态') + ' → ' + r.newValue });
      else if (r.action === 'bulk') {
        (r.changes || []).forEach(function (c) {
          lines.push({ icon: 'device-mobile', text: c.key + ' → ' + c.newValue });
        });
      }
    } else if (r.type === 'weather') {
      if (r.action === 'set') lines.push({ icon: 'cloud-sun', text: '天气：' + (r.weatherType || '') + ' ' + (r.icon || '') });
    } else if (r.type === 'npc_state') {
      var nm = npcName(r.npcId);
      if (r.action === 'enter' || r.action === 'focus') lines.push({ icon: 'film-strip', text: nm + ' 登场' });
      else if (r.action === 'leave' || r.action === 'unfocus') lines.push({ icon: 'moon', text: nm + ' 退场' });
      else if (r.action === 'offstage') lines.push({ icon: 'moon', text: nm + ' 退到后台' });
      else if (r.action === 'scene_enter') lines.push({ icon: 'film-strip', text: nm + ' 进入现场' });
      else if (r.action === 'scene_leave') lines.push({ icon: 'moon', text: nm + ' 离开现场' });
      else if (r.action === 'follow') lines.push({ icon: 'footprints', text: nm + ' 跟随你' });
      else if (r.action === 'unfollow') lines.push({ icon: 'footprints', text: nm + ' 不再跟随' });
      else if (r.action === 'reveal') lines.push({ icon: 'mask-happy', text: '身份揭示：' + (r.name || nm) });
    } else if (r.type === 'ending') {
      if (r.action === 'trigger') lines.push({ icon: 'film-strip', text: '结局达成：' + (r.endingName || r.endingId) });
    } else if (r.type === 'node') {
      if (r.action === 'enter') lines.push({ icon: 'book-open', text: '进入节点：' + (r.nodeName || r.nodeId) });
      else if (r.action === 'complete') lines.push({ icon: 'book-open', text: '完成节点：' + (r.nodeName || r.nodeId) });
    } else if (r.type === 'foreshadow') {
      if (r.action === 'bury') lines.push({ icon: 'push-pin', text: '埋下伏笔：' + (r.foreshadowName || r.foreshadowId) });
      else if (r.action === 'reveal') lines.push({ icon: 'push-pin', text: '伏笔回收：' + (r.foreshadowName || r.foreshadowId) });
    } else if (r.type === 'info') {
      // P13·S1-c：新讯息到达的被动账块行（本函数产物只进叙事流，不进提示词）
      if (r.action === 'send') lines.push({ icon: 'device-mobile', text: '手机收到了新讯息' });
      else if (r.action === 'broadcast') lines.push({ icon: 'device-mobile', text: '手机收到了新广播' });
    } else if (r.type === 'keyword') {
      // 关键词只入知识库，无账块行（与 Electron 一致：空分支）
    } else if (r.label && r.oldVal != null && r.newVal != null) {
      var fd = r.delta;
      var fsign = (fd != null && fd >= 0) ? '+' : '';
      lines.push({ icon: null, text: r.label + ' ' + fsign + (fd != null ? fd : '') + '（' + r.newVal + '）' });
    }
  });
  var seen = {};
  return lines.filter(function (x) {
    if (seen[x.text]) return false;
    seen[x.text] = true;
    return true;
  });
}

module.exports = {
  npcName: npcName,
  formatChangesForUI: formatChangesForUI
};

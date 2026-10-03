// ============================================================
// P1-I · I-1（G7-b）：NPC 推演 / 调整动作编排（A 类，零 React / 零 RN / 零 DOM）
// 桌面锚点：engine/ui_npc.js
//   requestUpdate :213 / _renderUpdateModal :254 / confirmUpdate :303
//   regenerate :331 / cancelUpdate :339
//   confirmDeduction :347 / rejectDeduction :384 / retryDeduction :401
//   闭包辅助 KNOWLEDGE_SRC_CN :8 / normFact :18 / factTag :24 /
//   factEditableLine :30 / stripFactTag :36
//
// 形态差异（自报，见报告）：
//   1) 桌面所有 DOM 读写（document.getElementById / modal-mask）+ UI.openModal /
//      UI.closeModal 换成「模块状态 + 返回值」；反馈走 Platform.ui.toast。
//   2) 桌面 _renderUpdateModal(npc, errMsg, loading) 的三种入参折叠为状态：
//      _updatingNpcId !_pendingUpdate → loading；_pendingUpdate → data；
//      errMsg 经 requestUpdate 返回值 {ok:false, error} 交 UI 渲染。
//   3) confirmUpdate(values) 接收 UI 收集的字段（不再读 DOM），其余逐字照抄。
//
// 纪律：零 React / 零 RN API / 零 document. / 零 window.；'use strict'；
//   NpcRuntime/NpcDeduction/NpcDeductionAI/ApiClient/GameState/Platform 均为
//   bootstrap 挂载全局，裸用同 engine 风格；Node smoke 注入假件。
// ============================================================

'use strict';

// NPC 知识来源枚举 → 中文（与 npc_runtime.js 的 KNOWLEDGE_SOURCES 对应）
var KNOWLEDGE_SRC_CN = {
  witness: '目击',
  told: '转述',
  public: '公开',
  rumor: '传闻',
  misconception: '误信',
  deduced: '推演',
  manual: '手记',
  legacy: '旧记录'
};

// 兼容裸字符串旧数据，取规范化知识条目
function normFact(raw) {
  if (raw && typeof raw === 'object') return raw;
  return { text: String(raw == null ? '' : raw), acquiredAt: '', source: 'legacy', sourceNote: '' };
}

// 知识条目 → [时间·来源·玩家自称·未确认] 标签（无时间只显示来源段）
// P14·S5：与 engine/npc_runtime.js 的 _knowledgeTag 同口径——补「玩家自称 / 未确认」，
//   否则玩家的一句吹牛在界面上和「引擎确认过的知识」长得一模一样。
function factTag(f) {
  var src = KNOWLEDGE_SRC_CN[f.source] || '旧记录';
  var bits = [];
  if (f.acquiredAt) bits.push(f.acquiredAt);
  bits.push(src);
  if (f.origin === 'player') bits.push('玩家自称');
  else if (/^npc:/.test(f.origin)) bits.push('转述自' + f.origin.slice(4));
  if (f.unverified) bits.push('未确认');
  return '[' + bits.join('·') + ']';
}

// textarea 用的可读行：[时间·来源] 文本
function factEditableLine(raw) {
  var f = normFact(raw);
  return factTag(f) + ' ' + f.text;
}

// textarea 回读：剥掉行首 [..] 前缀，还原纯知识文本
function stripFactTag(line) {
  var m = String(line || '').trim().match(/^\[[^\]]*\]\s*([\s\S]*)$/);
  return (m ? m[1] : String(line || '')).trim();
}

// 模块内状态（同桌面 _updatingNpcId / _pendingUpdate）
var _updatingNpcId = null;
var _pendingUpdate = null;

// ---------------- 更新 NPC 状态 ----------------

// 组装 AI 原始返回正文（ui_npc.js:201-211 逐字）
function _extractContent(response) {
  if (response == null) return '';
  if (typeof response === 'string') return response;
  if (typeof response === 'object') {
    if (typeof response.content === 'string') return response.content;
    if (Array.isArray(response.content)) {
      return response.content.map(function (c) { return (c && (c.text || c.content)) || ''; }).join('');
    }
  }
  return '';
}

// 在世界书里找 NPC 定义（ui_npc.js:247-252 兼容数组 + 对象两种形态）
function _findNpc(npcId) {
  var wb = (GameState.currentCard && GameState.currentCard.worldbook) || {};
  var defs = wb.npcs || [];
  var found = null;
  if (Array.isArray(defs)) {
    defs.forEach(function (x) { if (x && x.id === npcId) found = x; });
  } else {
    Object.keys(defs).forEach(function (k) {
      if (found) return;
      var x = defs[k];
      if (x && x.id === npcId) found = x;
      else if (k === npcId) found = x || { id: k };
    });
  }
  return found;
}

// 请求 AI 更新（ui_npc.js:213-245）
// 返回 Promise<{ok:boolean, raw?:string, error?:string}>：
//   ok=true                    → 解析成功，_pendingUpdate 已就位
//   ok=false 且无 error        → 前置拦截（busy / NPC 不存在 / prompt 空），已 toast
//   ok=false 且带 error        → 解析失败 / 请求异常，文案交 UI 渲染
function requestUpdate(npcId) {
  if (_updatingNpcId) {
    Platform.ui.toast('已有更新任务在进行', { type: 'warn' });
    return Promise.resolve({ ok: false });
  }
  var npc = _findNpc(npcId);
  if (!npc) {
    Platform.ui.toast('NPC 不存在', { type: 'error' });
    return Promise.resolve({ ok: false });
  }

  var prompt = NpcRuntime.buildUpdatePrompt(npcId, 20);
  if (!prompt) {
    Platform.ui.toast('无法组装 prompt', { type: 'error' });
    return Promise.resolve({ ok: false });
  }

  _updatingNpcId = npcId;
  _pendingUpdate = null;

  return ApiClient.chat([
    { role: 'system', content: prompt.sys },
    { role: 'user', content: prompt.user }
  ], { max_tokens: 4000, temperature: 0.3 }).then(function (response) {
    var content = _extractContent(response);
    var data = NpcRuntime.parseUpdateResponse(content);
    if (!data) {
      _updatingNpcId = null;
      return { ok: false, raw: content, error: '（AI 返回无法解析）\n\n原始内容：\n' + content.slice(0, 500) };
    }
    _pendingUpdate = { npcId: npcId, data: data, rawText: content };
    return { ok: true, raw: content };
  }).catch(function (e) {
    _updatingNpcId = null;
    return { ok: false, error: '出错：' + (e && e.message ? e.message : String(e)) };
  });
}

function getPendingUpdate() {
  return _pendingUpdate;
}

function getUpdatingNpcId() {
  return _updatingNpcId;
}

// 表单初值（knownFactsText 逐字照 _renderUpdateModal:263-279）
// 无待处理更新时返回 null。
function buildForm(npcId) {
  var pending = _pendingUpdate;
  if (!pending || pending.npcId !== npcId) return null;
  var data = pending.data || {};
  var npc = _findNpc(npcId) || { id: npcId, name: npcId };

  // 知识行：已有条目按 [时间·来源] 文本 展示，AI 本次新提到的去重后追加（标推演）
  var rtForFacts = (typeof NpcRuntime !== 'undefined') ? (NpcRuntime.get(npcId) || {}) : {};
  var factLines = [];
  var factSeen = {};
  (Array.isArray(rtForFacts.knownFacts) ? rtForFacts.knownFacts : []).forEach(function (raw) {
    var f = normFact(raw);
    if (!f.text || factSeen[f.text]) return;
    factSeen[f.text] = true;
    factLines.push(factEditableLine(f));
  });
  // P14·S5：AI 单列出来的 heardClaims 是「玩家/别人说的、未确认的」，
  //   原实现把 AI 新提的一切知识都标成「推演（deduced）」，方向正好相反。
  (data.heardClaims || []).forEach(function (s) {
    var t = String(s == null ? '' : s).trim();
    if (!t || factSeen[t]) return;
    factSeen[t] = true;
    factLines.push('[转述·玩家自称·未确认] ' + t);
  });
  (data.knownFacts || []).forEach(function (s) {
    var t = String(s == null ? '' : s).trim();
    if (!t || factSeen[t]) return;
    factSeen[t] = true;
    factLines.push('[' + KNOWLEDGE_SRC_CN.deduced + '·未确认] ' + t);
  });

  return {
    name: npc.name || npc.id,
    alive: data.alive !== false,
    mood: data.mood || '',
    locationId: data.locationId || '',
    playerRelation: data.playerRelation || '',
    knownFactsText: factLines.join('\n'),
    recentEventsText: (data.recentEvents || []).join('\n'),
    explain: data.explain || ''
  };
}

// 确认写入（ui_npc.js:303-329）
// values 由 UI 收集：{ alive, mood, locationId, playerRelation,
//                      knownFactsText, recentEventsText }
function confirmUpdate(values) {
  if (!_pendingUpdate) return;
  var npcId = _pendingUpdate.npcId;
  var v = values || {};
  function val(k) { var x = v[k]; return (x == null ? '' : String(x)).trim(); }
  function arr(k) {
    var s = val(k);
    return s ? s.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
  }
  // 知识行带回了 [时间·来源] 可读前缀，落库前剥掉，只留纯文本交 applyUpdate 合并
  function factArr(k) {
    var s = val(k);
    return s ? s.split('\n').map(function (x) { return stripFactTag(x); }).filter(Boolean) : [];
  }
  var data = {
    alive: val('alive') === 'true',
    mood: val('mood'),
    locationId: val('locationId'),
    playerRelation: val('playerRelation'),
    knownFacts: factArr('knownFactsText'),
    recentEvents: arr('recentEventsText')
  };
  NpcRuntime.applyUpdate(npcId, data);
  _pendingUpdate = null;
  _updatingNpcId = null;
}

// 清 pending 后重新请求（ui_npc.js:331-337）
function regenerate() {
  if (!_pendingUpdate) return Promise.resolve({ ok: false });
  var npcId = _pendingUpdate.npcId;
  _pendingUpdate = null;
  _updatingNpcId = null;
  return requestUpdate(npcId);
}

// 取消（ui_npc.js:339-344；关闭浮层由 UI 侧负责）
function cancelUpdate() {
  _pendingUpdate = null;
  _updatingNpcId = null;
}

// ---------------- 推演 UI · 3-3（ui_npc.js:347-427）----------------

// 确认推演（ui_npc.js:347-382）
function confirmDeduction(id) {
  try {
    if (typeof NpcDeduction === 'undefined' || typeof NpcRuntime === 'undefined') {
      Platform.ui.toast('推演系统未加载', { type: 'error' });
      return;
    }
    var p = NpcDeduction.findPending(id);
    if (!p) { Platform.ui.toast('推演请求不存在', { type: 'error' }); return; }
    if (p.failReason) { Platform.ui.toast('该条目推演失败，不能确认，请重试或拒绝', { type: 'warn' }); return; }
    if (!p.deductionNote) { Platform.ui.toast('推理链尚未生成，不能确认', { type: 'warn' }); return; }
    var addR = NpcRuntime.addKnowledge(p.npcId, {
      text: p.factText,
      source: 'deduced',
      sourceNote: '玩家确认'
    });
    // NPC 已删除等硬性失败：整条中止，pending 保留，交给玩家拒绝
    if (!addR.ok && addR.reason !== '该知识已存在') {
      Platform.ui.toast('登记知识失败：' + addR.reason, { type: 'error' });
      return;
    }
    var r = NpcDeduction.confirmDeduction(id, {
      source: 'deduced',
      sourceNote: '玩家确认',
      deductionNote: p.deductionNote || ''
    });
    if (!r.ok) { Platform.ui.toast('确认失败：' + r.reason, { type: 'error' }); return; }
    if (!addR.ok && addR.reason && addR.reason === '该知识已存在') {
      Platform.ui.toast('已确认（知识此前已登记）：' + (p.npcName || p.npcId) + ' 知道「' + p.factText + '」', { type: 'success' });
    } else {
      Platform.ui.toast('已确认：' + (p.npcName || p.npcId) + ' 知道「' + p.factText + '」', { type: 'success' });
    }
  } catch (e) {
    Platform.ui.toast('确认异常：' + (e && e.message ? e.message : String(e)), { type: 'error' });
  }
}

// 拒绝推演（ui_npc.js:384-399）
function rejectDeduction(id) {
  try {
    if (typeof NpcDeduction === 'undefined') {
      Platform.ui.toast('推演系统未加载', { type: 'error' });
      return;
    }
    var p = NpcDeduction.findPending(id);
    if (!p) { Platform.ui.toast('推演请求不存在', { type: 'error' }); return; }
    var r = NpcDeduction.rejectDeduction(id, '玩家拒绝');
    if (!r.ok) { Platform.ui.toast('拒绝失败：' + r.reason, { type: 'error' }); return; }
    Platform.ui.toast('已拒绝：' + (p.npcName || p.npcId) + ' 不知道「' + p.factText + '」', { type: 'info' });
  } catch (e) {
    Platform.ui.toast('拒绝异常：' + (e && e.message ? e.message : String(e)), { type: 'error' });
  }
}

// 重试推演（ui_npc.js:401-427）
// fire-and-forget + .then 反馈；返回 Promise<bool>（true=已提交并完成，false=未提交/异常）
function retryDeduction(id) {
  try {
    if (typeof NpcDeduction === 'undefined' || typeof NpcDeductionAI === 'undefined') {
      Platform.ui.toast('推演系统未加载', { type: 'error' });
      return Promise.resolve(false);
    }
    var p = NpcDeduction.findPending(id);
    if (!p) { Platform.ui.toast('推演请求不存在', { type: 'error' }); return Promise.resolve(false); }
    var cfg = NpcDeductionAI._getConfig();
    if (!cfg.enabled) { Platform.ui.toast('推演功能未启用，可在设置 → 通用 → NPC 推演中开启', { type: 'warn' }); return Promise.resolve(false); }
    // fire-and-forget：不阻塞 onclick；按真实返回值反馈，不预报成功
    Platform.ui.toast('正在重新提交推演…', { type: 'info' });
    return NpcDeductionAI.run(id).then(function (r) {
      if (r && r.ok) {
        Platform.ui.toast('推演已完成，可在推理链中查看', { type: 'success' });
        return true;
      } else if (r && r.reason === '已在推演中') {
        Platform.ui.toast('该条目正在推演中，请稍候', { type: 'warn' });
        return true;
      } else {
        Platform.ui.toast('推演未完成：' + (r && r.reason ? r.reason : '未知原因') + '，可重试或拒绝', { type: 'warn' });
        return true;
      }
    }).catch(function (e) {
      console.warn('[NpcDeductionAI] 重试异常：', e);
      return false;
    });
  } catch (e) {
    Platform.ui.toast('重试异常：' + (e && e.message ? e.message : String(e)), { type: 'error' });
    return Promise.resolve(false);
  }
}

module.exports = {
  requestUpdate: requestUpdate,
  getPendingUpdate: getPendingUpdate,
  getUpdatingNpcId: getUpdatingNpcId,
  buildForm: buildForm,
  confirmUpdate: confirmUpdate,
  regenerate: regenerate,
  cancelUpdate: cancelUpdate,
  confirmDeduction: confirmDeduction,
  rejectDeduction: rejectDeduction,
  retryDeduction: retryDeduction
};
// ============================================================
// H6 G9 · RN 侧 UI_Portrait 实现（A 类，零 React / 零 RN 依赖）
// P71 阶段 2：三动作分流（讨论 / 审核并生成 / 整理成人设）+ 流式 + 撤回
// 本文件挂 globalThis.UI_Portrait，接口与桌面同构（start/send/audit/
// generate/extract/undo/confirm/skip/cancel），但 RN 端不走 DOM：
//   start(playerData, cb) → 存 playerData + cb → nav_store.navigate('portrait')
//   → PortraitScreen 接管交互。
//
// 纪律：零 document./window.；A 类不碰颜色；'use strict'；
//   引擎模块（GameState/Portrait/PortraitChat/ApiClient/ApiManager/Platform）
//   由 rn_bootstrap.js 挂全局，裸用同 engine 风格。
// ============================================================

'use strict';

var NavStore = null;
try {
  NavStore = require('./nav_store.js');
} catch (eNav) {
  NavStore = null;
}

// 模块状态（创角流程入口设置；重审人设入口为空）
var _playerData = null;
var _cb = null;
var _portrait = null; // 最近一次 AI 产出的人设

function start(playerData, cb) {
  _playerData = playerData || null;
  _cb = (typeof cb === 'function') ? cb : null;
  _portrait = null;
  // 从落盘恢复聊天 + 撤回（portrait_chat.json）
  try { if (typeof PortraitChat !== 'undefined' && PortraitChat.restore) PortraitChat.restore(); } catch (e) {}
  if (NavStore) NavStore.navigate('portrait');
}

// 取当前玩家数据（创角入口用 _playerData；重审入口回退 GameState.playerData）
function getPlayerData() {
  if (_playerData) return _playerData;
  try {
    if (typeof GameState !== 'undefined' && GameState.playerData) return GameState.playerData;
  } catch (e) {}
  return {};
}

// —— 动作①：讨论（流式）——
// callbacks: { onContent(delta), onDone(fullText), onError(msg) }
// 返回 Promise<fullText>
function sendStream(text, callbacks) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return Promise.resolve('');
  callbacks = callbacks || {};
  var pd = getPlayerData();
  // 用户消息落盘
  try {
    if (typeof PortraitChat !== 'undefined') {
      PortraitChat.append('user', t);
      PortraitChat.persist();
    }
  } catch (e) {}

  var sys;
  try { sys = Portrait.buildDiscussPrompt(pd); }
  catch (e) { return Promise.reject(new Error('构造讨论 prompt 失败：' + (e && e.message || e))); }

  var msgs;
  try { msgs = PortraitChat.buildMessages(sys).messages; }
  catch (e) { return Promise.reject(new Error('组装消息失败：' + (e && e.message || e))); }

  var profile = (typeof ApiManager !== 'undefined') ? ApiManager.getActive() : null;
  var maxTok = (profile && profile.max_tokens && profile.max_tokens > 0)
    ? Math.min(profile.max_tokens, 8000) : 4000;

  var full = '';
  var n = 0;
  var t0 = Date.now();

  // 先建 assistant 占位，每 chunk 更新并落盘（与桌面同策略）
  try {
    if (typeof PortraitChat !== 'undefined') PortraitChat.append('assistant', '');
  } catch (e) {}

  function syncAssistant() {
    try {
      var c = PortraitChat._chat;
      if (c && c.length && c[c.length - 1].role === 'assistant') c[c.length - 1].content = full;
      PortraitChat.persist();
    } catch (e) {}
  }

  return ApiClient.chatStream(msgs, { max_tokens: maxTok, temperature: 0.8 }, {
    onContent: function(delta) {
      if (n === 0) console.info('[P71] stream firstAt=' + (Date.now() - t0) + 'ms');
      n++;
      full += delta;
      syncAssistant();
      if (callbacks.onContent) callbacks.onContent(delta, full);
    },
    onDone: function() {
      console.info('[P71] stream chunks=' + n + ' total=' + full.length);
      syncAssistant();
      if (callbacks.onDone) callbacks.onDone(full);
    }
  }).then(function() {
    return full;
  }).catch(function(e) {
    var msg = e && e.message ? e.message : String(e);
    // 降级：整段返回（不弹错误 toast）
    if (msg.indexOf('此 API 不支持流式输出') >= 0 ||
        msg.indexOf('Platform.httpStream 不可用') >= 0 ||
        msg.indexOf('网络请求失败') >= 0) {
      return ApiClient.chat(msgs, { max_tokens: maxTok, temperature: 0.8 }).then(function(resp) {
        full = (resp && typeof resp.content === 'string') ? resp.content : String(resp || '');
        syncAssistant();
        if (callbacks.onContent) callbacks.onContent(full, full);
        if (callbacks.onDone) callbacks.onDone(full);
        return full;
      });
    }
    syncAssistant();
    if (callbacks.onError) callbacks.onError(msg);
    throw e;
  });
}

// 兼容旧入口：send(text) 同步追加 user（不再触发 AI）
function send(text) {
  if (text == null) return;
  try {
    if (typeof PortraitChat !== 'undefined') {
      PortraitChat.append('user', String(text));
      PortraitChat.persist();
    }
  } catch (e) {}
}

// —— 动作②：审核并生成（两阶段，不写盘）——
var _auditResult = null;

function audit() {
  var pd = getPlayerData();
  var chat = (typeof PortraitChat !== 'undefined' && PortraitChat.list) ? PortraitChat.list() : [];
  var auditPrompt;
  try {
    auditPrompt = Portrait.buildAuditPrompt(pd, chat);
  } catch (e) {
    return Promise.reject(new Error('构造审核 prompt 失败：' + (e && e.message ? e.message : String(e))));
  }
  return ApiClient.chat([{ role: 'user', content: auditPrompt }], { jsonMode: true })
    .then(function (auditText) {
      var audit = Portrait.parseAuditResponse(auditText);
      if (!audit) throw new Error('AI 审核结果无法解析，请重试。');
      _auditResult = audit;
      if (audit.verdict === 'conflict') {
        return { audit: audit, portrait: null };
      }
      var genPrompt;
      try {
        genPrompt = Portrait.buildGeneratePrompt(pd, audit);
      } catch (e2) {
        throw new Error('构造生成 prompt 失败：' + (e2 && e2.message ? e2.message : String(e2)));
      }
      return ApiClient.chat([{ role: 'user', content: genPrompt }], { jsonMode: true })
        .then(function (genText) {
          var p = Portrait.parseGenerateResponse(genText);
          if (!p) throw new Error('AI 返回的人设无法解析，请重试或手填。');
          _portrait = p;
          return { audit: audit, portrait: p };
        });
    });
}

// 兼容旧入口
function generate() { return audit(); }

// 旧版 sendAndGenerate（讨论 + 两阶段），保留给老调用
function sendAndGenerate(text) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return Promise.resolve(null);
  try {
    if (typeof PortraitChat !== 'undefined') {
      PortraitChat.append('user', t);
      PortraitChat.persist();
    }
  } catch (e) {}
  return audit();
}

function getAuditResult() { return _auditResult; }

// —— 动作③：整理成人设（patch → 写盘 + 撤回记录）——
// 返回 Promise<{ ok, label, before, after, attrWarnings, error }>
function extract() {
  var pd = getPlayerData();
  var chat = (typeof PortraitChat !== 'undefined' && PortraitChat.list) ? PortraitChat.list() : [];
  var sys;
  try { sys = Portrait.buildExtractPrompt(pd, chat); }
  catch (e) { return Promise.reject(new Error('构造整理 prompt 失败：' + (e && e.message || e))); }

  var profile = (typeof ApiManager !== 'undefined') ? ApiManager.getActive() : null;
  var maxTok = (profile && profile.max_tokens && profile.max_tokens > 0)
    ? Math.min(profile.max_tokens, 8000) : 4000;

  return ApiClient.chat([{ role: 'user', content: sys }], { max_tokens: maxTok, temperature: 0.3 })
    .then(function(resp) {
      var text = (resp && typeof resp.content === 'string') ? resp.content : String(resp || '');
      var parsed = Portrait.parseExtractResponse(text);
      if (!parsed) return { ok: false, error: 'AI 输出不是有效 patch' };
      var result = Portrait.mergePatch(parsed.patch, pd);
      if (!result.ok) return { ok: false, error: result.error };
      // 写盘：playerData（含 portrait）
      try { if (typeof GameState !== 'undefined' && GameState.persist) GameState.persist(); } catch (e) {}
      // 撤回记录
      try {
        Portrait.recordUndo({
          label: result.label,
          patchBefore: result.before,
          patchAfter: result.after
        });
      } catch (e) {}
      return result;
    });
}

// —— 动作④：撤回 ——
// 返回 { ok, label, cascaded, error }
function undo(entryId) {
  try {
    var r = Portrait.undoLast(entryId);
    if (r.ok) {
      try { if (typeof GameState !== 'undefined' && GameState.persist) GameState.persist(); } catch (e) {}
    }
    return r;
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// —— 最近改动列表（≤5 条倒序）——
function listUndo() {
  try {
    var doc = Portrait.loadChat();
    var arr = Array.isArray(doc.undo) ? doc.undo.slice().reverse() : [];
    return arr.slice(0, 5);
  } catch (e) { return []; }
}

// 统一收口：cb 存在 → 创角流程调 cb(result)；否则 → 重审人设回叙事页 + 提示
function complete(result) {
  var cb = _cb;
  _playerData = null;
  _cb = null;
  _portrait = null;
  if (typeof cb === 'function') {
    try { cb(result || {}); } catch (e) { /* cb 异常不得卡屏 */ }
    return;
  }
  if (NavStore) NavStore.navigate('story');
  try {
    if (typeof Platform !== 'undefined' && Platform.ui && Platform.ui.appendHint) {
      Platform.ui.appendHint('（人设已更新）');
    }
  } catch (e) {}
}

function applyPortrait(portrait) {
  try {
    if (typeof GameState !== 'undefined' && GameState && GameState.playerData) {
      GameState.playerData.portrait = portrait;
    }
  } catch (e) { console.warn('[ui_portrait_rn] 人设写回失败：', e); }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.invalidateCache === 'function') {
      GameState.invalidateCache();
    }
  } catch (e) {}
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.persist === 'function') {
      GameState.persist();
    }
  } catch (e) {}
}

function confirm(portrait, openingPrompt) {
  if (!portrait) return;
  try { Portrait.save(portrait); } catch (e) {}
  applyPortrait(portrait);
  applyOpening(openingPrompt);
  complete({ portrait: portrait, openingPrompt: openingPrompt == null ? '' : String(openingPrompt) });
}

function applyOpening(opening) {
  try {
    if (typeof GameState !== 'undefined' && GameState && GameState.playerData) {
      var v = (opening == null) ? '' : String(opening).trim();
      if (v) GameState.playerData._openingPrompt = v;
      else delete GameState.playerData._openingPrompt;
    }
  } catch (e) {}
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.invalidateCache === 'function') {
      GameState.invalidateCache();
    }
  } catch (e) {}
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.persist === 'function') {
      GameState.persist();
    }
  } catch (e) {}
}

function skip(openingPrompt) {
  var pd = getPlayerData();
  var fb;
  try { fb = Portrait.fallback(pd); } catch (e) {
    fb = { summary: '（未生成人设总述，使用原始字段）', traits: [], lockedAt: new Date().toISOString(), aiVersion: 0 };
  }
  try { Portrait.save(fb); } catch (e) {}
  applyPortrait(fb);
  applyOpening(openingPrompt);
  complete({ portrait: fb, openingPrompt: openingPrompt == null ? '' : String(openingPrompt) });
}

function cancel() {
  _playerData = null;
  _cb = null;
  _portrait = null;
  if (NavStore) NavStore.navigate('story');
}

function getCurrentPortrait() {
  try {
    var pd = _playerData || (typeof GameState !== 'undefined' ? GameState.playerData : null) || {};
    return (pd && pd.portrait) ? pd.portrait : null;
  } catch (e) { return null; }
}

function getOpeningPrompt() {
  try {
    var pd = _playerData || (typeof GameState !== 'undefined' ? GameState.playerData : null) || {};
    return (pd && pd._openingPrompt) ? String(pd._openingPrompt) : '';
  } catch (e) { return ''; }
}

var UI_Portrait = {
  start: start,
  send: send,
  sendStream: sendStream,
  audit: audit,
  generate: generate,
  sendAndGenerate: sendAndGenerate,
  extract: extract,
  undo: undo,
  listUndo: listUndo,
  getAuditResult: getAuditResult,
  confirm: confirm,
  skip: skip,
  cancel: cancel,
  complete: complete,
  getPlayerData: getPlayerData,
  getCurrentPortrait: getCurrentPortrait,
  getOpeningPrompt: getOpeningPrompt
};

module.exports = UI_Portrait;

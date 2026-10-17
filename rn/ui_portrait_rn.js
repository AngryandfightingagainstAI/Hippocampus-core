// ============================================================
// H6 G9 · RN 侧 UI_Portrait 实现（A 类，零 React / 零 RN 依赖）
// RN 独有。修补 engine/story.js:650 的调用缺口：
//   story.js _enterPortrait() 裸调 UI_Portrait.start(playerData, cb)，
//   桌面仓 engine/ui_portrait.js 是 DOM 管线，RN 仓没有该文件 →
//   bootstrap 未挂载 UI_Portrait → ReferenceError。
//
// 本文件挂 globalThis.UI_Portrait，接口与桌面同构（start/send/generate/
// confirm/skip/cancel），但 RN 端不走 DOM：
//   start(playerData, cb) → 存 playerData + cb → nav_store.navigate('portrait')
//   → PortraitScreen 接管交互（手填 / AI 生成 / 确认 / 跳过 / 取消）。
//
// 两条入口：
//   A. 创角流程（story.js:650）：start 传入 cb，complete 调 cb(result)，
//      cb 内部 showScreen('screen-game') + StoryLoop.start()。
//   B. 重审人设（CharacterPanel 按钮）：直接 Platform.ui.showScreen('portrait')，
//      未设 cb，complete 自己 navigate('story') + appendHint('（人设已更新）')。
//
// 纪律：零 document./window.；A 类不碰颜色；'use strict'；
//   引擎模块（GameState/Portrait/ApiClient/ApiManager/Platform）由
//   rn_bootstrap.js 挂全局，裸用同 engine 风格。
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
var _discussion = [];
var _portrait = null; // P10·A5：最近一次 AI 产出的人设（多轮讨论时作为「当前总述」基准）

function start(playerData, cb) {
  _playerData = playerData || null;
  _cb = (typeof cb === 'function') ? cb : null;
  _discussion = [];
  _portrait = null;
  if (NavStore) NavStore.navigate('portrait');
}

function send(text) {
  if (text == null) return;
  _discussion.push({ role: 'user', content: String(text) });
}

// ★ 两阶段审核生成：
//   阶段 1：buildAuditPrompt → parseAuditResponse → 得到 verdict/issues
//   阶段 2（ok/concern）：buildGeneratePrompt → parseGenerateResponse → 得到 portrait
//   conflict 时不进入阶段 2，返回 { audit, portrait: null }
//   ok/concern 时返回 { audit, portrait }
// 返回 Promise<{ audit, portrait }>；失败抛。
var _auditResult = null;

function generate() {
  var pd = getPlayerData();
  var auditPrompt;
  try {
    auditPrompt = Portrait.buildAuditPrompt(pd, _discussion);
  } catch (e) {
    return Promise.reject(new Error('构造审核 prompt 失败：' + (e && e.message ? e.message : String(e))));
  }
  return ApiClient.chat([{ role: 'user', content: auditPrompt }], { jsonMode: true })
    .then(function (auditText) {
      var audit = Portrait.parseAuditResponse(auditText);
      if (!audit) throw new Error('AI 审核结果无法解析，请重试。');
      _auditResult = audit;
      // conflict → 不进入生成阶段
      if (audit.verdict === 'conflict') {
        return { audit: audit, portrait: null };
      }
      // ok/concern → 进入生成阶段
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

// P10·A5 · 多轮讨论（两阶段版）：
//   阶段 1：buildAuditPrompt → parseAuditResponse → verdict/issues
//   阶段 2（ok/concern）：buildGeneratePrompt → parseGenerateResponse → portrait
//   conflict 时返回 { audit, portrait: null }，玩家继续讨论后重试
function sendAndGenerate(text) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return Promise.resolve(null);
  _discussion.push({ role: 'user', content: t });
  var pd = getPlayerData();
  // 阶段 1：重新审核
  var auditPrompt;
  try {
    auditPrompt = Portrait.buildAuditPrompt(pd, _discussion);
  } catch (e) {
    return Promise.reject(new Error('构造审核 prompt 失败：' + (e && e.message ? e.message : String(e))));
  }
  return ApiClient.chat([{ role: 'user', content: auditPrompt }], { jsonMode: true })
    .then(function (auditText) {
      var audit = Portrait.parseAuditResponse(auditText);
      if (!audit) throw new Error('AI 审核结果无法解析，请重试。');
      _auditResult = audit;
      // conflict → 不进入生成阶段，让玩家继续讨论
      if (audit.verdict === 'conflict') {
        return { audit: audit, portrait: null };
      }
      // ok/concern → 进入生成阶段
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

// 获取当前审核结果（供 PortraitScreen 读取 verdict/issues 展示）
function getAuditResult() {
  return _auditResult;
}

// 统一收口：cb 存在 → 创角流程调 cb(result)；否则 → 重审人设回叙事页 + 提示
function complete(result) {
  var cb = _cb;
  _playerData = null;
  _cb = null;
  _discussion = [];
  _portrait = null;
  if (typeof cb === 'function') {
    try { cb(result || {}); } catch (e) { /* cb 异常不得卡屏 */ }
    return;
  }
  // 重审人设：回叙事页 + 提示
  if (NavStore) NavStore.navigate('story');
  try {
    if (typeof Platform !== 'undefined' && Platform.ui && Platform.ui.appendHint) {
      Platform.ui.appendHint('（人设已更新）');
    }
  } catch (e) { /* appendHint 失败不影响回屏 */ }
}

// P9·S11：重审人设后把新总述写回存档并作废提示词缓存（对齐桌面 engine/ui_panels.js:598-603）。
//   缺此步时第三部分（_cachedStaticDynamic 的旧总述）与第四部分（新「角色声音提醒」）
//   会自相矛盾，AI 按旧人设演。
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
  } catch (e) { console.warn('[ui_portrait_rn] 缓存刷新失败：', e); }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.persist === 'function') {
      GameState.persist();
    }
  } catch (e) { console.warn('[ui_portrait_rn] 存档落盘失败：', e); }
}

function confirm(portrait, openingPrompt) {
  if (!portrait) return;
  try { Portrait.save(portrait); } catch (e) { /* save 失败不阻断完成 */ }
  applyPortrait(portrait);
  // P10·A5：开场白写入/删除（桌面 UI_Portrait.confirm:222-232 把 openingPrompt
  //   随 result 交给 story.js:_enterPortrait:671-675 写/删 playerData._openingPrompt）。
  //   创角流程入口该行由 cb 再写一遍（幂等）；重审入口无 cb，此处直接落。
  applyOpening(openingPrompt);
  complete({ portrait: portrait, openingPrompt: openingPrompt == null ? '' : String(openingPrompt) });
}

// P10·A5：开场白落到 playerData._openingPrompt（空 ⇒ 删，对齐 story.js:674-675）
function applyOpening(opening) {
  try {
    if (typeof GameState !== 'undefined' && GameState && GameState.playerData) {
      var v = (opening == null) ? '' : String(opening).trim();
      if (v) GameState.playerData._openingPrompt = v;
      else delete GameState.playerData._openingPrompt;
    }
  } catch (e) { console.warn('[ui_portrait_rn] 开场白落档失败：', e); }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.invalidateCache === 'function') {
      GameState.invalidateCache();
    }
  } catch (e) { console.warn('[ui_portrait_rn] 缓存刷新失败：', e); }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.persist === 'function') {
      GameState.persist();
    }
  } catch (e) { console.warn('[ui_portrait_rn] 存档落盘失败：', e); }
}

function skip(openingPrompt) {
  var pd = _playerData || (typeof GameState !== 'undefined' ? GameState.playerData : null) || {};
  var fb;
  try { fb = Portrait.fallback(pd); } catch (e) {
    fb = {
      summary: '（未生成人设总述，使用原始字段）',
      traits: [], lockedAt: new Date().toISOString(), aiVersion: 0
    };
  }
  try { Portrait.save(fb); } catch (e) { console.warn('[ui_portrait_rn] 人设兜底保存失败：', e); }
  applyPortrait(fb);
  applyOpening(openingPrompt); // P10·A5：跳过也带上玩家填的开场白（桌面 skip:234-239 同）
  complete({ portrait: fb, openingPrompt: openingPrompt == null ? '' : String(openingPrompt) });
}

function cancel() {
  _playerData = null;
  _cb = null;
  _discussion = [];
  _portrait = null;
  if (NavStore) NavStore.navigate('story');
}

// PortraitScreen 读取初始 playerData（无则回退 GameState.playerData）
function getPlayerData() {
  if (_playerData) return _playerData;
  try {
    if (typeof GameState !== 'undefined' && GameState.playerData) return GameState.playerData;
  } catch (e) { console.warn('[ui_portrait_rn] playerData 读取失败：', e); }
  return {};
}

// PortraitScreen 读取已有 portrait（编辑态预填 / AI 生成结果暂存）
function getCurrentPortrait() {
  try {
    var pd = _playerData || (typeof GameState !== 'undefined' ? GameState.playerData : null) || {};
    return (pd && pd.portrait) ? pd.portrait : null;
  } catch (e) { return null; }
}

// PortraitScreen 读取初始玩家填的开场白（重审场景预填 playerData._openingPrompt）
function getOpeningPrompt() {
  try {
    var pd = _playerData || (typeof GameState !== 'undefined' ? GameState.playerData : null) || {};
    return (pd && pd._openingPrompt) ? String(pd._openingPrompt) : '';
  } catch (e) { return ''; }
}

var UI_Portrait = {
  start: start,
  send: send,
  generate: generate,
  sendAndGenerate: sendAndGenerate,
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

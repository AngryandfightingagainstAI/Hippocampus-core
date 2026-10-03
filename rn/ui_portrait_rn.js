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

// AI 生成人设：buildPrompt + ApiClient.chat + parseResponse
// 返回 Promise<portrait>；失败抛。PortraitScreen 也可直调引擎方法。
function generate() {
  var pd = _playerData || (typeof GameState !== 'undefined' ? GameState.playerData : null) || {};
  var prompt;
  try {
    prompt = Portrait.buildPrompt(pd, _discussion);
  } catch (e) {
    return Promise.reject(new Error('构造人设 prompt 失败：' + (e && e.message ? e.message : String(e))));
  }
  var messages = [{ role: 'user', content: prompt }];
  return ApiClient.chat(messages, { jsonMode: true })
    .then(function (text) {
      var p = Portrait.parseResponse(text);
      if (!p) throw new Error('AI 返回的人设无法解析，请重试或手填。');
      _portrait = p;
      return p;
    });
}

// P10·A5 · 多轮讨论（桌面 ui_portrait.js send():141-162 同口径）：
//   有上一版总述 ⇒ 走「玩家意见」改写 prompt；否则 buildPrompt + 【玩家补充说明】。
//   返回 Promise<portrait>；失败抛。讨论记录进 _discussion（后续 generate 可复用）。
function sendAndGenerate(text) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return Promise.resolve(null);
  _discussion.push({ role: 'user', content: t });
  var pd = getPlayerData();
  var prompt;
  if (_portrait && _portrait.summary) {
    prompt = '玩家对你的上一版人设总述提出了意见：\n\n' +
      '【当前总述】\n' + _portrait.summary + '\n\n' +
      '【玩家意见】\n' + t + '\n\n' +
      '请根据玩家意见修改，重新输出 JSON（含 summary 和 traits）。';
  } else {
    try {
      prompt = Portrait.buildPrompt(pd, _discussion);
    } catch (e) {
      return Promise.reject(new Error('构造人设 prompt 失败：' + (e && e.message ? e.message : String(e))));
    }
    prompt += '\n\n【玩家补充说明】\n' + t;
  }
  return ApiClient.chat([{ role: 'user', content: prompt }], { jsonMode: true })
    .then(function (raw) {
      var p = Portrait.parseResponse(raw);
      if (!p) throw new Error('AI 返回的人设无法解析，请重试或手填。');
      _portrait = p;
      return p;
    });
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
  } catch (e) { /* */ }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.invalidateCache === 'function') {
      GameState.invalidateCache();
    }
  } catch (e) { /* */ }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.persist === 'function') {
      GameState.persist();
    }
  } catch (e) { /* */ }
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
  } catch (e) { /* */ }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.invalidateCache === 'function') {
      GameState.invalidateCache();
    }
  } catch (e) { /* */ }
  try {
    if (typeof GameState !== 'undefined' && GameState && typeof GameState.persist === 'function') {
      GameState.persist();
    }
  } catch (e) { /* */ }
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
  try { Portrait.save(fb); } catch (e) { /* */ }
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
  } catch (e) { /* */ }
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
  confirm: confirm,
  skip: skip,
  cancel: cancel,
  complete: complete,
  getPlayerData: getPlayerData,
  getCurrentPortrait: getCurrentPortrait,
  getOpeningPrompt: getOpeningPrompt
};

module.exports = UI_Portrait;

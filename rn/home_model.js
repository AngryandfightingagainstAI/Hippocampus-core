// ============================================================
// 战役 4 · 批次 4-2：主页数据模型（A 类纯逻辑，零 React / 零 RN 依赖）
// RN 独有。数据口径与 Electron engine/ui_home.js 的数据段一一同源
// （ui_home 是 DOM 层不搬运；本文件只搬逻辑，不碰 document）：
//   当前主页卡带：LocalStore('home_cardId') → 最近存档卡 → 库中第一张
//   书票按卡覆盖：global.settings.skinOverride = { cardId: 'paper'|'glass'|'scroll' }
// 身份描述全部经共享纯 A 类 engine/card_display.js（resolveCardDisplay 等），
// RN 与 Electron 走同一咽喉。
//
// Storage / Saves / LocalStore / GameState 为 bootstrap 挂载的全局，
// 与 engine 业务模块同风格裸引用；Node smoke 通过 globalThis 注入内存假件。
// ============================================================

'use strict';

var CardDisplay = require('../engine/card_display.js');

var HOME_CARD_KEY = 'home_cardId';
var HOME_SKIN_NAMES = { paper: '纸白', glass: '流光', scroll: '古卷' };

function getAllCards() {
  return Storage.getAllCards();
}

// ---------- 当前主页卡带：LocalStore 记忆 → 最近存档卡 → 库中第一张 ----------

function getHomeCardId() {
  var cards = getAllCards();
  var ids = Object.keys(cards);
  if (!ids.length) return null;
  var mem = null;
  try { mem = LocalStore.getItem(HOME_CARD_KEY); } catch (e) { mem = null; }
  if (mem && cards[mem]) return mem;
  var all = [];
  try { all = Saves.listAll(); } catch (e) { all = []; }
  for (var i = 0; i < all.length; i++) {
    if (cards[all[i].cardId]) return all[i].cardId;
  }
  return ids[0];
}

// 返回 { id, card, display }；空库返回 null（主页走全回退，不白屏）
function getHomePicked() {
  var id = getHomeCardId();
  if (!id) return null;
  var card = getAllCards()[id];
  if (!card) return null;
  return { id: id, card: card, display: CardDisplay.resolveCardDisplay(card) };
}

function setHomeCardId(id) {
  try { LocalStore.setItem(HOME_CARD_KEY, id || ''); } catch (e) { /* 记忆失败不阻断换卡 */ }
}

// ---------- 书票按卡覆盖 ----------

function getSkinOverrides() {
  try {
    var g = Storage.getGlobal();
    return (g.settings && g.settings.skinOverride && typeof g.settings.skinOverride === 'object')
      ? g.settings.skinOverride : {};
  } catch (e) { return {}; }
}

function setSkinOverride(cardId, themeId) {
  var g = Storage.getGlobal();
  g.settings = g.settings || {};
  var map = (g.settings.skinOverride && typeof g.settings.skinOverride === 'object')
    ? g.settings.skinOverride : {};
  if (themeId) map[cardId] = themeId; else delete map[cardId];
  g.settings.skinOverride = map;
  Storage.setGlobal(g);
}

// 当前 picked 的生效书票 id（按卡覆盖 → 卡带默认 → paper）
function effectiveSkin(picked) {
  var d = picked ? picked.display : CardDisplay.resolveCardDisplay(null);
  return CardDisplay.resolveThemeId(d, getSkinOverrides(), picked ? picked.id : null);
}

// ---------- 存档目录 / 最近会话 / 时钟 / token 徽章 ----------

function buildHomeSaves(picked) {
  if (!picked) return [];
  try {
    return Saves.listByCard(picked.id).slice(0, 5);
  } catch (e) { return []; }
}

function buildLastSave() {
  var all = [];
  try { all = Saves.listAll(); } catch (e) { all = []; }
  if (!all.length) return null;
  var cards = getAllCards();
  var last = all[0];
  if (!cards[last.cardId]) return null;
  return last;
}

function formatPlayTimeSafe(sec) {
  try { return Saves.formatPlayTime(sec); } catch (e) { return ''; }
}

// 报头时钟：有进行中存档显游戏内时间，无档显真实日期（与 ui_core.renderHeader 同口径）
function buildClock() {
  try {
    if (GameState.currentCardId && GameState.currentSaveId && GameState._gameTime) {
      return GameState.formatGameTime();
    }
  } catch (e) { /* 落真实日期 */ }
  var d = new Date();
  function p(n) { return String(n).padStart(2, '0'); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// token 徽章数据源/格式与 ui_core.updateTokenBadge 完全一致
function readTotalTokens() {
  try { return GameState._totalTokens || 0; } catch (e) { return 0; }
}

function formatTokenBadge(t) {
  var n = t || 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1000000).toFixed(2) + 'M';
}

// ---------- 换卡浮层列表 ----------

function listCardsForPicker() {
  var cards = getAllCards();
  var overrides = getSkinOverrides();
  var curId = getHomeCardId();
  return Object.keys(cards).map(function (id) {
    var d = CardDisplay.resolveCardDisplay(cards[id]);
    return {
      id: id,
      display: d,
      skin: CardDisplay.resolveThemeId(d, overrides, id),
      current: id === curId
    };
  });
}

// ---------- 渲染总装配：HomeScreen 每次重渲染现读（存储真源不在 RN 侧复制）----------

function buildHomeModel() {
  var picked = getHomePicked();
  var display = picked ? picked.display : CardDisplay.resolveCardDisplay(null);
  var cards = getAllCards();
  return {
    picked: picked,
    display: display,
    overline: CardDisplay.formatOverline(display),
    cardCount: Object.keys(cards).length,
    cardIds: Object.keys(cards),
    saves: buildHomeSaves(picked),
    lastSave: buildLastSave(),
    skin: effectiveSkin(picked),
    skinThemes: CardDisplay.SKIN_THEMES.slice()
  };
}

module.exports = {
  HOME_CARD_KEY: HOME_CARD_KEY,
  HOME_SKIN_NAMES: HOME_SKIN_NAMES,
  getHomeCardId: getHomeCardId,
  getHomePicked: getHomePicked,
  setHomeCardId: setHomeCardId,
  getSkinOverrides: getSkinOverrides,
  setSkinOverride: setSkinOverride,
  effectiveSkin: effectiveSkin,
  buildHomeSaves: buildHomeSaves,
  buildLastSave: buildLastSave,
  formatPlayTimeSafe: formatPlayTimeSafe,
  buildClock: buildClock,
  readTotalTokens: readTotalTokens,
  formatTokenBadge: formatTokenBadge,
  listCardsForPicker: listCardsForPicker,
  buildHomeModel: buildHomeModel
};

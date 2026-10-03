// ============================================================
// P1-G · 卡带分类审核 · RN 壳（A 类，零 React / 零 RN 依赖）
// RN 独有。桌面 grounding：engine/classify.js
//   - open()         ::218-225（读卡 → 建 items → 请求 AI）
//   - requestAI()    :227-254（buildPrompt → ApiClient.chat → parseSuggestions）
//   - applyAndSave() :423-444（applyMovements → 存 imported → toast）
// 纯逻辑（extractAllNumbers/buildPrompt/parseSuggestions/applyMovements）
// 走 bootstrap 挂的 CardClassifyPure（= engine/classify.js 的 module.exports，
// 见 rn_bootstrap.js「严禁挂成 CardClassify」注释）。
// DOM 面板（renderPanel:256 / bindEvents:380 / updateStats）判不搬，
// RN 由 screens/ClassifyScreen.js 承接交互。
//
// 与 ui_portrait_rn.js 同范式：A 类壳负责状态与引擎调用，B 类屏只渲染。
// ============================================================

'use strict';

// 待审核的卡带 id（CardsScreen 点「分类审核」时置入，屏读取后自行 clear）
var pendingCardId = null;

// 入口：置 pending + 切到 classify 屏
function start(cardId) {
  pendingCardId = cardId || null;
  try {
    var NavStore = require('./nav_store.js');
    NavStore.navigate('classify');
  } catch (e) { /* 导航异常不得丢 pending */ }
  return pendingCardId;
}

function getPendingCardId() { return pendingCardId; }
function clearPending() { pendingCardId = null; }

// 有 key 判定：口径同 PortraitScreen:82（ApiManager.getActive()）
function hasApiKey() {
  try { return !!ApiManager.getActive(); } catch (e) { return false; }
}

// 读卡：桌面 applyAndSave:424 Storage.getAllCards()[cardId]
function loadCard(cardId) {
  try {
    var all = Storage.getAllCards();
    return (all && all[cardId]) || null;
  } catch (e) { return null; }
}

// 卡带内置判定（内置卡可审核，但不可删；分类结果落 imported 层仍生效）
function isBuiltin(cardId) {
  try { return !!(typeof CARDS !== 'undefined' && CARDS && CARDS[cardId]); }
  catch (e) { return false; }
}

// 存卡：逐行照桌面 applyAndSave:430-439
function saveClassified(cardId, cardCopy) {
  if (!cardCopy.meta) cardCopy.meta = {};
  cardCopy.meta.classified = true;
  cardCopy.meta.classifiedAt = new Date().toISOString();
  var snapshot = JSON.parse(JSON.stringify(cardCopy));
  if (snapshot.meta) delete snapshot.meta;
  cardCopy.meta.classifiedSnapshot = snapshot;

  var imported = Storage.getImportedCards();
  imported[cardId] = cardCopy;
  Storage.setImportedCards(imported);
  return cardCopy;
}

module.exports = {
  start: start,
  getPendingCardId: getPendingCardId,
  clearPending: clearPending,
  hasApiKey: hasApiKey,
  loadCard: loadCard,
  isBuiltin: isBuiltin,
  saveClassified: saveClassified
};
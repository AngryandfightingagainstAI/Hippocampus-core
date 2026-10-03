// ============================================================
// 战役 4 · 批次 4-6b：商店状态仓库（A 类，零 React / 零 RN 依赖）
// RN 独有。搬运 Electron ui_shop.js 的面板行为到「壳 → store → React」
// 范式（同 4-2 nav_store / 4-3 story_store）：
//   shop.js open_shop 工具 → Platform.ui.openShop(shopId) 壳
//   → 本 store open(shopId) → ShopModal（挂 OverlayHost）订阅渲染。
// Electron 调用方一行不改，收口契约不变。
//
// 行为对齐 ui_shop.js：
//   open   → findShop 失败 toast「商店不存在：id」error（L13）
//   视图   → 店名 + 货币行 + 商品列表（价/库存三态/可买判定）+ 出售区
//   买/卖  → 直调 Shop.buy/sell（裁决 2：不走 Propose）；
//            失败 toast「购买失败：reason」「出售失败：reason」error；
//            成功 = Electron renderTopbar + renderSidebarExpanded +
//            面板重渲染 → NavStore.notify('topbar') +
//            StoryStore.renderGame() + 本 store 视图重算（L150-154）
//   落盘   → Shop.buy/sell 内部已自行 GameState.persist()（shop.js
//            L221/L273），本层不重复持久化（禁叠加防御）
//
// useSyncExternalStore 协议：state 不可变，任何变化整体换对象，
// getSnapshot 无变化时必须返回同一引用；视图模型在 open/buy/sell
// 时急切重算存入 state.view（不在 getSnapshot 里现算）。
// ============================================================

'use strict';

var StoryStore = require('./story_store.js');
var NavStore = require('./nav_store.js');

var state = {
  open: false,
  shopId: null,
  view: null
};
var listeners = [];

function emit() {
  var ls = listeners.slice();
  for (var i = 0; i < ls.length; i++) {
    try { ls[i](); } catch (e) { /* 订阅者异常不得影响买卖路径 */ }
  }
}

function replaceState(patch) {
  state = Object.assign({}, state, patch);
  emit();
}

function subscribe(fn) {
  listeners.push(fn);
  return function () {
    listeners = listeners.filter(function (l) { return l !== fn; });
  };
}

function getSnapshot() {
  return state;
}

function toastErr(msg) {
  try {
    if (typeof Platform !== 'undefined' && Platform && Platform.ui) {
      Platform.ui.toast(msg, { type: 'error' });
    }
  } catch (e) { /* toast 失败不阻断 */ }
}

function shopGlobal() {
  return (typeof Shop !== 'undefined') ? Shop : null;
}

// 货币行：逐字对齐 ui_shop._getCurrency（L23-45）——
// cid 取 shop.currencyId，缺省回落卡带主货币；持有量按 key 精确匹配
// 依次查 hud → sidebar → panels.entries → playerData。
// 注意：与 Shop._getPlayerCurrency 的「key+name 双匹配」不同，
// UI 展示层只做 key 匹配（Electron 原样行为，保持平移不修正）。
function computeCurrency(shop) {
  var cid = shop.currencyId || '';
  if (!cid) {
    try {
      var wb = GameState.currentCard.worldbook || {};
      var mains = ((wb.currency || {}).currencies || []).filter(function (c) { return c.isMain; });
      if (mains.length) cid = mains[0].name || mains[0].id;
    } catch (e) { /* 无卡带时 cid 留空 */ }
  }
  var have = 0;
  try {
    var st = GameState.currentState;
    if (st && cid) {
      var found = null;
      (st.hud || []).forEach(function (x) { if (x.key === cid && !found) found = x; });
      if (!found) (st.sidebar || []).forEach(function (x) { if (x.key === cid && !found) found = x; });
      if (!found) Object.keys(st.panels || {}).forEach(function (pid) {
        (st.panels[pid].entries || []).forEach(function (e) { if (e.key === cid && !found) found = e; });
      });
      if (found) have = found.current || 0;
      else if (GameState.playerData && GameState.playerData[cid] != null) have = Number(GameState.playerData[cid]) || 0;
    }
  } catch (e) { /* 状态缺失时 have=0 */ }
  return { id: cid, have: have };
}

// 商品列表 + 出售区：对齐 ui_shop._renderBody（L87-138）
function computeView(shopId) {
  var S = shopGlobal();
  if (!S) return null;
  var shop = S.findShop(shopId);
  if (!shop) return null;
  var cur = computeCurrency(shop);

  var items = (shop.items || []).map(function (it) {
    var stock = S.getStock(shop.id, it.id);
    // 库存三态：-1 无限 / 0 已售罄 / 正数（getStock 契约）
    var stockKind = stock < 0 ? 'infinite' : (stock > 0 ? 'count' : 'soldout');
    var stockText = stock < 0 ? '无限' : (stock > 0 ? String(stock) : '已售罄');
    var price = it.price != null ? (Number(it.price) || 0) : null;
    // 可买判定逐字对齐 L98：库存非 0 且（无货币设定 或 持有 ≥ 单价）
    var canBuy = stock !== 0 && (!cur.id || cur.have >= (it.price || 0));
    var btnText = stock === 0 ? '已售罄' : (cur.id && cur.have < (it.price || 0) ? '钱不够' : '购买');
    return {
      id: it.id,
      name: it.name || '(未命名)',
      desc: it.desc || '',
      price: price,
      stockKind: stockKind,
      stockText: stockText,
      canBuy: canBuy,
      btnText: btnText
    };
  });

  // 出售区：背包四类的去重名清单；shop.allowSell === false 时整区不显示
  var sellItems = [];
  if (shop.allowSell !== false) {
    try {
      var inv = (GameState.playerData && GameState.playerData.inventory) || {};
      ['bar', 'common', 'story', 'rare'].forEach(function (cat) {
        (inv[cat] || []).forEach(function (it) {
          var name = typeof it === 'string' ? it : it.name;
          if (name && sellItems.indexOf(name) < 0) sellItems.push(name);
        });
      });
    } catch (e) { /* 背包缺失时出售区为空 */ }
  }

  return {
    shopId: shop.id,
    name: shop.name || shop.id,
    currency: cur,
    items: items,
    sellItems: sellItems
  };
}

function open(shopId) {
  var S = shopGlobal();
  var shop = S ? S.findShop(shopId) : null;
  if (!shop) {
    toastErr('商店不存在：' + shopId);
    return;
  }
  replaceState({ open: true, shopId: shopId, view: computeView(shopId) });
}

function close() {
  if (!state.open) return;
  replaceState({ open: false, shopId: null, view: null });
}

// 买卖成功后的副作用 = Electron _bindButtons 成功分支：
// renderTopbar + renderSidebarExpanded（RN 投导航信号 + 叙事重渲染）
// + 面板视图重算（库存/持有量变化）
function afterChange(shopId) {
  try { if (NavStore) NavStore.notify('topbar'); } catch (e) {}
  try { StoryStore.renderGame(); } catch (e) {}
  replaceState({ view: computeView(shopId) });
}

function buy(itemId) {
  var S = shopGlobal();
  if (!S || !state.open || !state.shopId) return;
  var r = S.buy(state.shopId, itemId, 1);
  if (!r || !r.ok) {
    toastErr('购买失败：' + (r && r.reason));
    return;
  }
  afterChange(state.shopId);
}

function sell(itemName) {
  var S = shopGlobal();
  if (!S || !state.open || !state.shopId) return;
  var r = S.sell(state.shopId, itemName);
  if (!r || !r.ok) {
    toastErr('出售失败：' + (r && r.reason));
    return;
  }
  afterChange(state.shopId);
}

// 仅供 Node smoke 复位（生产路径不调用）
function reset() {
  state = { open: false, shopId: null, view: null };
  listeners = [];
}

module.exports = {
  open: open,
  close: close,
  buy: buy,
  sell: sell,
  subscribe: subscribe,
  getSnapshot: getSnapshot,
  reset: reset
};

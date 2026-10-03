// ============================================================
// 世界书编辑器 · 货币（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/currency_editor.js（window.WB_Currency 段），去 DOM。
// 数据面：card.worldbook.currency（对象）：
//   { currencies[], purchasingPower, exchangeRates[], allowBarter, allowSell }
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Currency = {
  _cardId: null, _data: null,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'currency', null);
    this._data = d || { currencies: [], purchasingPower: '', exchangeRates: [], allowBarter: false, allowSell: false };
    if (!Array.isArray(this._data.currencies)) this._data.currencies = [];
    if (!Array.isArray(this._data.exchangeRates)) this._data.exchangeRates = [];
  },

  data: function () { return this._data; },

  set: function (k, v) { this._data[k] = v; WB.DirtyGuard.mark('WB_Currency'); },
  addCurrency: function () {
    this._data.currencies.push({ name: '', symbol: '', icon: '', isMain: this._data.currencies.length === 0 });
    WB.DirtyGuard.mark('WB_Currency');
  },
  delCurrency: function (i) { this._data.currencies.splice(i, 1); WB.DirtyGuard.mark('WB_Currency'); },
  setCurrency: function (i, k, v) { this._data.currencies[i][k] = v; WB.DirtyGuard.mark('WB_Currency'); },
  addRate: function () { this._data.exchangeRates.push({ from: '', to: '', rate: 1 }); WB.DirtyGuard.mark('WB_Currency'); },
  delRate: function (i) { this._data.exchangeRates.splice(i, 1); WB.DirtyGuard.mark('WB_Currency'); },
  setRate: function (i, k, v) { this._data.exchangeRates[i][k] = (k === 'rate') ? (v === '' ? 0 : Number(v)) : v; WB.DirtyGuard.mark('WB_Currency'); },

  save: function () {
    if (WB.persist(this._cardId, 'currency', this._data)) {
      WB.DirtyGuard.clear('WB_Currency');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Currency;

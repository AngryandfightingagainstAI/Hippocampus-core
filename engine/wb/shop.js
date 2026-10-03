// ============================================================
// 世界书编辑器 · 商店（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/shop_editor.js（window.WB_Shop 段），去 DOM。
// 数据面：card.worldbook.shops（数组），每项含 items[]。
// 枚举：item.category bar/common/story/rare；shop.refresh none/daily/weekly/story。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Shop = {
  _cardId: null, _data: null, _curIdx: 0,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'shops', []);
    this._data = Array.isArray(d) ? d : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  cur: function () { return this._data[this._curIdx] || null; },
  select: function (i) { this._curIdx = i; },

  add: function () {
    this._data.push({ id: WB.uid('shop'), name: '', desc: '', npcId: '', locationId: '', currencyId: '', refresh: 'none', items: [] });
    WB.DirtyGuard.mark('WB_Shop');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  del: function (i) {
    var s = this._data[i];
    if (!s) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_Shop');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, 'shops', this._data);   // 桌面 :121
    return { ok: true };
  },
  set: function (idx, k, v) { this._data[idx][k] = v; WB.DirtyGuard.mark('WB_Shop'); },

  addItem: function (idx) {
    if (!this._data[idx].items) this._data[idx].items = [];
    this._data[idx].items.push({ id: WB.uid('si'), name: '', price: 10, stock: -1, category: 'common', desc: '' });
    WB.DirtyGuard.mark('WB_Shop');
  },
  delItem: function (idx, ii) { this._data[idx].items.splice(ii, 1); WB.DirtyGuard.mark('WB_Shop'); },
  setItem: function (idx, ii, k, v) {
    var it = this._data[idx].items[ii];
    if (!it) return;
    if (k === 'price' || k === 'stock') it[k] = v === '' ? 0 : Number(v);
    else it[k] = v;
    WB.DirtyGuard.mark('WB_Shop');
  },

  save: function () {
    if (WB.persist(this._cardId, 'shops', this._data)) {
      WB.DirtyGuard.clear('WB_Shop');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Shop;

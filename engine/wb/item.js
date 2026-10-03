// ============================================================
// 世界书编辑器 · 物品（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/item_editor.js（window.WB_Item 段），去 DOM。
// 数据面：card.worldbook.items（数组）。
// 分类枚举（桌面 :44）：武器 / 食物 / 家具 / 电器 / 衣物 / 其他
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Item = {
  _cardId: null, _data: null, _curIdx: 0,

  CATS: ['武器', '食物', '家具', '电器', '衣物', '其他'],

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'items', []);
    this._data = Array.isArray(d) ? d : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  cur: function () { return this._data[this._curIdx] || null; },
  select: function (i) { this._curIdx = i; },

  add: function () {
    this._data.push({ id: WB.uid('item'), name: '', category: '其他', desc: '', effects: '', linkedMaps: [], linkedNPCs: [], tags: [], source: 'author' });
    WB.DirtyGuard.mark('WB_Item');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  del: function (i) {
    var x = this._data[i];
    if (!x) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_Item');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, 'items', this._data);   // 桌面 :79
    return { ok: true };
  },
  set: function (idx, k, v) { this._data[idx][k] = v; WB.DirtyGuard.mark('WB_Item'); },
  setList: function (idx, k, v) { this._data[idx][k] = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Item'); },

  save: function () {
    if (WB.persist(this._cardId, 'items', this._data)) {
      WB.DirtyGuard.clear('WB_Item');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Item;

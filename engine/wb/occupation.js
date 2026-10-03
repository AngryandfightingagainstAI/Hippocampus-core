// ============================================================
// 世界书编辑器 · 职业（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/occupation_editor.js（window.WB_Occupation 段），去 DOM。
// 数据面：card.worldbook.occupations（数组）。workTime 枚举：自由 / 固定。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Occupation = {
  _cardId: null, _data: null, _curIdx: 0,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'occupations', []);
    this._data = Array.isArray(d) ? d : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  cur: function () { return this._data[this._curIdx] || null; },
  select: function (i) { this._curIdx = i; },

  add: function () {
    this._data.push({ id: WB.uid('occ'), name: '', desc: '', treatment: '', stanceOfficial: '', officiallyKnown: false, workTime: '自由', origin: '', necessity: '', tags: [] });
    WB.DirtyGuard.mark('WB_Occupation');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  del: function (i) {
    var x = this._data[i];
    if (!x) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_Occupation');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, 'occupations', this._data);   // 桌面 :83
    return { ok: true };
  },
  set: function (idx, k, v) { this._data[idx][k] = v; WB.DirtyGuard.mark('WB_Occupation'); },
  setList: function (idx, k, v) { this._data[idx][k] = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Occupation'); },

  save: function () {
    if (WB.persist(this._cardId, 'occupations', this._data)) {
      WB.DirtyGuard.clear('WB_Occupation');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Occupation;

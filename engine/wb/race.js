// ============================================================
// 世界书编辑器 · 种族（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/race_editor.js（window.WB_Race 段），去 DOM。
// 数据面：card.worldbook.hasRaces（开关）+ card.worldbook.races（数组），
//   save / del 均一次写两个字段（桌面 :115 / :122 同形）。
// 枚举：npcTendency 喜欢/厌恶/无感；socialType 群居/分散；rarity 稀有/常见。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Race = {
  _cardId: null, _data: null, _hasRaces: false, _curIdx: 0,

  init: function (cardId) {
    this._cardId = cardId;
    var card = Storage.getAllCards()[cardId];
    var wb = (card && card.worldbook) || {};
    this._hasRaces = !!wb.hasRaces;
    var d = wb.races || [];
    this._data = Array.isArray(d) ? JSON.parse(JSON.stringify(d)) : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  cur: function () { return this._data[this._curIdx] || null; },
  hasRaces: function () { return this._hasRaces; },
  toggleRaces: function (on) { this._hasRaces = on; WB.DirtyGuard.mark('WB_Race'); },
  select: function (i) { this._curIdx = i; },

  add: function () {
    this._data.push({ id: WB.uid('race'), name: '', desc: '', stanceOfficial: '', stancePeople: '', stanceReligion: '', npcTendency: '无感', talents: [], specials: '', habitat: '', socialType: '分散', rarity: '稀有', history: '', tags: [] });
    WB.DirtyGuard.mark('WB_Race');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  del: function (i) {
    var x = this._data[i];
    if (!x) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_Race');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, { hasRaces: this._hasRaces, races: this._data });   // 桌面 :115
    return { ok: true };
  },
  set: function (idx, k, v) { this._data[idx][k] = v; WB.DirtyGuard.mark('WB_Race'); },
  setList: function (idx, k, v) { this._data[idx][k] = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Race'); },

  save: function () {
    if (WB.persist(this._cardId, { hasRaces: this._hasRaces, races: this._data })) {
      WB.DirtyGuard.clear('WB_Race');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Race;

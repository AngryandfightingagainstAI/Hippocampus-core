// ============================================================
// 世界书编辑器 · 势力（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/faction_editor.js（window.WB_Faction 段），去 DOM。
// 数据面：card.worldbook.factions（数组）。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Faction = {
  _cardId: null,
  _data: null,
  _curIdx: 0,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'factions', []);
    this._data = Array.isArray(d) ? d : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  getFactionOptions: function () {
    return this._data.map(function (f) { return { id: f.id, name: f.name || f.id }; });
  },

  cur: function () { return this._data[this._curIdx] || null; },
  selectFaction: function (i) { this._curIdx = i; },

  addFaction: function () {
    this._data.push({
      id: WB.uid('faction'),
      name: '',
      hasHiddenSide: false,
      publicSide: { name: '', what: '', scope: '', resources: [] },
      hiddenSide: { name: '', what: '', scope: '', resources: [] },
      mainGoal: '', mainFace: '明面',
      stanceOfficial: '', stanceMilitary: '', stancePeople: '', stancePeers: '',
      relations: [], linkedNPCs: [], tags: []
    });
    WB.DirtyGuard.mark('WB_Faction');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  delFaction: function (i) {
    var f = this._data[i];
    if (!f) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_Faction');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, 'factions', this._data);   // 桌面 :188
    return { ok: true };
  },

  set: function (idx, key, value) { this._data[idx][key] = value; WB.DirtyGuard.mark('WB_Faction'); },
  setList: function (idx, key, value) { this._data[idx][key] = value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Faction'); },
  setSub: function (idx, subKey, key, value) {
    if (!this._data[idx][subKey]) this._data[idx][subKey] = {};
    this._data[idx][subKey][key] = value;
    WB.DirtyGuard.mark('WB_Faction');
  },
  setSubList: function (idx, subKey, key, value) {
    if (!this._data[idx][subKey]) this._data[idx][subKey] = {};
    this._data[idx][subKey][key] = value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    WB.DirtyGuard.mark('WB_Faction');
  },

  addRelation: function (idx) {
    if (!this._data[idx].relations) this._data[idx].relations = [];
    this._data[idx].relations.push({ targetId: '', type: '合作', level: '', reason: '' });
    WB.DirtyGuard.mark('WB_Faction');
  },
  delRelation: function (idx, ri) { this._data[idx].relations.splice(ri, 1); WB.DirtyGuard.mark('WB_Faction'); },
  setRelation: function (idx, ri, key, value) { this._data[idx].relations[ri][key] = value; WB.DirtyGuard.mark('WB_Faction'); },

  save: function () {
    if (WB.persist(this._cardId, 'factions', this._data)) {
      WB.DirtyGuard.clear('WB_Faction');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Faction;

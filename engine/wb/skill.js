// ============================================================
// 世界书编辑器 · 法术/技能（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/skill_editor.js（window.WB_Skill 段），去 DOM。
// 数据面：card.worldbook.skills（数组），每项含 levels[]。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Skill = {
  _cardId: null, _data: null, _curIdx: 0,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'skills', []);
    this._data = Array.isArray(d) ? d : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  cur: function () { return this._data[this._curIdx] || null; },
  select: function (i) { this._curIdx = i; },

  add: function () {
    this._data.push({ id: WB.uid('skill'), name: '', desc: '', hasSideEffect: false, sideEffect: '', hasLevels: false, levels: [], linkedMaps: [], linkedNPCs: [], tags: [] });
    WB.DirtyGuard.mark('WB_Skill');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  del: function (i) {
    var x = this._data[i];
    if (!x) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_Skill');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, 'skills', this._data);   // 桌面 :110
    return { ok: true };
  },
  set: function (idx, k, v) { this._data[idx][k] = v; WB.DirtyGuard.mark('WB_Skill'); },
  setList: function (idx, k, v) { this._data[idx][k] = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Skill'); },

  addLevel: function (idx) {
    if (!this._data[idx].levels) this._data[idx].levels = [];
    this._data[idx].levels.push({ level: this._data[idx].levels.length + 1, condition: '', requires: { items: [], exp: 0 }, effect: '' });
    WB.DirtyGuard.mark('WB_Skill');
  },
  delLevel: function (idx, li) { this._data[idx].levels.splice(li, 1); WB.DirtyGuard.mark('WB_Skill'); },
  setLevel: function (idx, li, k, v) { this._data[idx].levels[li][k] = (k === 'level' && v !== '') ? Number(v) : v; WB.DirtyGuard.mark('WB_Skill'); },
  setLevelReq: function (idx, li, k, v) {
    var lv = this._data[idx].levels[li];
    if (!lv.requires) lv.requires = { items: [], exp: 0 };
    lv.requires[k] = (k === 'items')
      ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      : (v === '' ? 0 : Number(v));
    WB.DirtyGuard.mark('WB_Skill');
  },

  save: function () {
    if (WB.persist(this._cardId, 'skills', this._data)) {
      WB.DirtyGuard.clear('WB_Skill');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Skill;

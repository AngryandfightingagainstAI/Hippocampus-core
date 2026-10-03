// ============================================================
// 世界书编辑器 · NPC（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/npc_editor.js（window.WB_NPC 段），
// 仅去 DOM：删 html() / renderNpcBody() / reRender()，
//   UI.confirmAsync('删除 NPC「…」？') 由组件层先问再调 delNpc(i)，
//   WB.msg 的 toast 文案由组件层照桌面文案发出。
// 数据面：card.worldbook.npcs（数组）。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_NPC = {
  _cardId: null,
  _data: null,
  _curIdx: 0,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'npcs', []);
    this._data = Array.isArray(d) ? d : [];
    if (this._data.length > 0 && this._curIdx >= this._data.length) this._curIdx = 0;
  },

  getNpcOptions: function () {
    return this._data.map(function (n) { return { id: n.id, name: n.name || n.id }; });
  },

  cur: function () { return this._data[this._curIdx] || null; },
  selectNpc: function (i) { this._curIdx = i; },

  addNpc: function () {
    this._data.push({
      id: WB.uid('npc'),
      name: '', isAlias: false, realNames: [],
      gender: '', height: '', age: '', born: null,
      weight: 5, keywords: [],
      abilities: [], likes: [], dislikes: [],
      factions: [], relations: [], periods: [],
      desc: '', tags: []
    });
    WB.DirtyGuard.mark('WB_NPC');
    this._curIdx = this._data.length - 1;
    return this._curIdx;
  },
  delNpc: function (i) {
    var n = this._data[i];
    if (!n) return { ok: false };
    this._data.splice(i, 1);
    WB.DirtyGuard.mark('WB_NPC');
    if (this._curIdx >= this._data.length) this._curIdx = Math.max(0, this._data.length - 1);
    WB.persist(this._cardId, 'npcs', this._data);   // 桌面 :236 立即持久化
    return { ok: true };
  },

  set: function (idx, key, value) { this._data[idx][key] = value; WB.DirtyGuard.mark('WB_NPC'); },
  setList: function (idx, key, value) { this._data[idx][key] = value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_NPC'); },

  addRealName: function (idx) {
    if (!this._data[idx].realNames) this._data[idx].realNames = [];
    this._data[idx].realNames.push({ name: '', type: 'real' });
    WB.DirtyGuard.mark('WB_NPC');
  },
  delRealName: function (idx, ri) { this._data[idx].realNames.splice(ri, 1); WB.DirtyGuard.mark('WB_NPC'); },
  setRealName: function (idx, ri, key, value) { this._data[idx].realNames[ri][key] = value; WB.DirtyGuard.mark('WB_NPC'); },

  addFaction: function (idx) {
    if (!this._data[idx].factions) this._data[idx].factions = [];
    this._data[idx].factions.push({ factionId: '', relation: '', attitude: '' });
    WB.DirtyGuard.mark('WB_NPC');
  },
  delFaction: function (idx, fi) { this._data[idx].factions.splice(fi, 1); WB.DirtyGuard.mark('WB_NPC'); },
  setFaction: function (idx, fi, key, value) { this._data[idx].factions[fi][key] = value; WB.DirtyGuard.mark('WB_NPC'); },

  addRelation: function (idx) {
    if (!this._data[idx].relations) this._data[idx].relations = [];
    this._data[idx].relations.push({ targetId: '', relation: '', attitude: '', events: '' });
    WB.DirtyGuard.mark('WB_NPC');
  },
  delRelation: function (idx, ri) { this._data[idx].relations.splice(ri, 1); WB.DirtyGuard.mark('WB_NPC'); },
  setRelation: function (idx, ri, key, value) { this._data[idx].relations[ri][key] = value; WB.DirtyGuard.mark('WB_NPC'); },

  addPeriod: function (idx) {
    if (!this._data[idx].periods) this._data[idx].periods = [];
    this._data[idx].periods.push({ periodName: '', timeRange: [null, null], data: '' });
    WB.DirtyGuard.mark('WB_NPC');
  },
  delPeriod: function (idx, pi) { this._data[idx].periods.splice(pi, 1); WB.DirtyGuard.mark('WB_NPC'); },
  setPeriod: function (idx, pi, key, value) { this._data[idx].periods[pi][key] = value; WB.DirtyGuard.mark('WB_NPC'); },
  setPeriodRange: function (idx, pi, pos, value) {
    var p = this._data[idx].periods[pi];
    if (!Array.isArray(p.timeRange)) p.timeRange = [null, null];
    p.timeRange[pos] = value === '' ? null : Number(value);
    WB.DirtyGuard.mark('WB_NPC');
  },

  save: function () {
    if (WB.persist(this._cardId, 'npcs', this._data)) {
      WB.DirtyGuard.clear('WB_NPC');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () {
    this.init(this._cardId);
    return { ok: true };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_NPC;

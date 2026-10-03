// ============================================================
// 世界书编辑器 · 产出物系统（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/outputs_editor.js（window.WB_Outputs 段），去 DOM。
// 数据面：card.worldbook.outputs（对象）：
//   { types[], audiences[], eventPool[],
//     settleRules{ when{type,years?}, affects[] }, fermentInterval }
// save 前自动补 id（桌面 :260-266，前缀取段名前三字母）。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Outputs = {
  _cardId: null, _data: null,

  _empty: function () {
    return {
      types: [],
      audiences: [],
      eventPool: [],
      settleRules: { when: { type: 'progress-full' }, affects: [] },
      fermentInterval: 'year'
    };
  },

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'outputs', null);
    this._data = (d && typeof d === 'object') ? d : this._empty();
    if (!Array.isArray(this._data.types)) this._data.types = [];
    if (!Array.isArray(this._data.audiences)) this._data.audiences = [];
    if (!Array.isArray(this._data.eventPool)) this._data.eventPool = [];
    if (!this._data.settleRules || typeof this._data.settleRules !== 'object') {
      this._data.settleRules = { when: { type: 'progress-full' }, affects: [] };
    }
    if (!this._data.settleRules.when || typeof this._data.settleRules.when !== 'object') {
      this._data.settleRules.when = { type: 'progress-full' };
    }
    if (!Array.isArray(this._data.settleRules.affects)) this._data.settleRules.affects = [];
    if (!this._data.fermentInterval) this._data.fermentInterval = 'year';
  },

  data: function () { return this._data; },

  set: function (key, value) { this._data[key] = value; WB.DirtyGuard.mark('WB_Outputs'); },

  // ===== types =====
  addType: function () { this._data.types.push({ id: '', name: '', icon: '' }); WB.DirtyGuard.mark('WB_Outputs'); },
  delType: function (i) { this._data.types.splice(i, 1); WB.DirtyGuard.mark('WB_Outputs'); },
  setType: function (i, key, value) { this._data.types[i][key] = value; WB.DirtyGuard.mark('WB_Outputs'); },

  // ===== audiences =====
  addAudience: function () { this._data.audiences.push({ id: '', name: '', weight: 5 }); WB.DirtyGuard.mark('WB_Outputs'); },
  delAudience: function (i) { this._data.audiences.splice(i, 1); WB.DirtyGuard.mark('WB_Outputs'); },
  setAudience: function (i, key, value) {
    if (key === 'weight') value = value === '' ? 5 : Number(value);
    this._data.audiences[i][key] = value;
    WB.DirtyGuard.mark('WB_Outputs');
  },

  // ===== eventPool =====
  addEvent: function () { this._data.eventPool.push({ id: '', name: '', weight: 5, effect: { promptHint: '' } }); WB.DirtyGuard.mark('WB_Outputs'); },
  delEvent: function (i) { this._data.eventPool.splice(i, 1); WB.DirtyGuard.mark('WB_Outputs'); },
  setEvent: function (i, key, value) {
    if (key === 'weight') value = value === '' ? 5 : Number(value);
    this._data.eventPool[i][key] = value;
    WB.DirtyGuard.mark('WB_Outputs');
  },
  setEventHint: function (i, value) {
    if (!this._data.eventPool[i].effect) this._data.eventPool[i].effect = {};
    this._data.eventPool[i].effect.promptHint = value;
    WB.DirtyGuard.mark('WB_Outputs');
  },

  // ===== settleRules =====
  setWhenType: function (type) { this._data.settleRules.when = { type: type }; WB.DirtyGuard.mark('WB_Outputs'); },
  setWhen: function (key, value) {
    if (key === 'years') value = value === '' ? 1 : Number(value);
    this._data.settleRules.when[key] = value;
    WB.DirtyGuard.mark('WB_Outputs');
  },
  addAffect: function () { this._data.settleRules.affects.push({ statKey: '', delta: 0 }); WB.DirtyGuard.mark('WB_Outputs'); },
  delAffect: function (i) { this._data.settleRules.affects.splice(i, 1); WB.DirtyGuard.mark('WB_Outputs'); },
  setAffect: function (i, key, value) {
    if (key === 'delta') value = value === '' ? 0 : Number(value);
    this._data.settleRules.affects[i][key] = value;
    WB.DirtyGuard.mark('WB_Outputs');
  },

  save: function () {
    // 自动补 id（空 id 用 WB.uid 生成，前缀取段名前 3 字母）
    var self = this;
    ['types', 'audiences', 'eventPool'].forEach(function (k) {
      self._data[k].forEach(function (x) { if (!x.id) x.id = WB.uid(k.slice(0, 3)); });
    });
    if (WB.persist(this._cardId, 'outputs', this._data)) {
      WB.DirtyGuard.clear('WB_Outputs');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Outputs;

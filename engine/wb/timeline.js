// ============================================================
// 世界书编辑器 · 时间线（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/timeline_editor.js（window.WB_Timeline 段），去 DOM。
// 数据面：card.worldbook.timeline = { official[], fanFuture[], playerLine[] }
// 三分段；impactFactions / impactNPCs 按 ';' 分隔，tags 按 ',' 分隔（桌面 :122-130）。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Timeline = {
  _cardId: null, _data: null,

  SECTIONS: ['official', 'fanFuture', 'playerLine'],

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'timeline', null);
    this._data = d || { official: [], fanFuture: [], playerLine: [] };
    if (!Array.isArray(this._data.official)) this._data.official = [];
    if (!Array.isArray(this._data.fanFuture)) this._data.fanFuture = [];
    if (!Array.isArray(this._data.playerLine)) this._data.playerLine = [];
  },

  data: function () { return this._data; },

  addItem: function (section) {
    this._data[section].push({
      id: WB.uid('tl'), time: '', event: '', impactWorld: '',
      impactFactions: [], impactNPCs: [], tags: []
    });
    WB.DirtyGuard.mark('WB_Timeline');
  },
  delItem: function (section, idx) {
    this._data[section].splice(idx, 1);
    WB.DirtyGuard.mark('WB_Timeline');
    return { ok: true };
  },
  setItem: function (section, idx, key, value) { this._data[section][idx][key] = value; WB.DirtyGuard.mark('WB_Timeline'); },
  setMulti: function (section, idx, key, value) {
    var item = this._data[section][idx];
    if (key === 'tags') item[key] = value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    else item[key] = value.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
    WB.DirtyGuard.mark('WB_Timeline');
  },

  save: function () {
    if (WB.persist(this._cardId, 'timeline', this._data)) {
      WB.DirtyGuard.clear('WB_Timeline');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Timeline;

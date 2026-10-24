// ============================================================
// 世界书编辑器 · 法术/技能（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/skill_editor.js（window.WB_Skill 段），去 DOM。
// 数据面：card.worldbook.skills（数组），每项含 levels[]。
// v3（阶段 C3）：加技能预算 skillPool 与数值规则 stat 的读写（不校验语义，
//   校验统一走 engine/core/skill_editor_helpers.js）。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var WB_Skill = {
  _cardId: null, _data: null, _curIdx: 0, _pool: null, _hadPool: false,

  init: function (cardId) {
    this._cardId = cardId;
    var d = WB.load(cardId, 'skills', []);
    this._data = Array.isArray(d) ? d : [];
    var p = WB.load(cardId, 'skillPool', null);
    this._pool = (p && typeof p === 'object') ? p : null;
    this._hadPool = this._pool != null;
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

  // ---------- C3：技能预算 ----------
  pool: function () { return this._pool; },
  setPoolEnabled: function (on) {
    this._pool = on ? { total: 0, mode: 'block', requireSpend: false } : null;
    WB.DirtyGuard.mark('WB_Skill');
  },
  setPoolField: function (k, v) {
    if (!this._pool) return;
    if (k === 'total') {
      var s = String(v == null ? '' : v).trim();
      if (!s) { delete this._pool.total; return; }
      this._pool.total = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
    } else if (k === 'mode') {
      this._pool.mode = v;
    } else if (k === 'requireSpend') {
      this._pool.requireSpend = !!v;
    }
    WB.DirtyGuard.mark('WB_Skill');
  },

  // ---------- C3：数值规则 stat ----------
  statOf: function (idx) {
    var x = this._data[idx];
    return (x && x.stat && typeof x.stat === 'object') ? x.stat : null;
  },
  enableStat: function (idx) {
    var x = this._data[idx]; if (!x) return;
    x.stat = {};
    WB.DirtyGuard.mark('WB_Skill');
  },
  disableStat: function (idx) {
    var x = this._data[idx]; if (!x) return;
    delete x.stat;
    WB.DirtyGuard.mark('WB_Skill');
  },
  setStatRaw: function (idx, k, raw) {
    var x = this._data[idx]; if (!x) return;
    if (!x.stat || typeof x.stat !== 'object') x.stat = {};
    var H = helpers();
    var v = H ? H.toStatValue(raw) : String(raw);
    if (v === undefined) delete x.stat[k];
    else x.stat[k] = v;
    WB.DirtyGuard.mark('WB_Skill');
  },
  setBound: function (idx, k, noBound) {
    var x = this._data[idx]; if (!x || !x.stat) return;
    if (noBound) x.stat[k] = null;
    else if (x.stat[k] == null) x.stat[k] = 0;
    WB.DirtyGuard.mark('WB_Skill');
  },
  setStatNum: function (idx, k, raw) {
    var x = this._data[idx]; if (!x || !x.stat) return;
    var s = String(raw == null ? '' : raw).trim();
    x.stat[k] = s === '' ? null : Number(s);
    WB.DirtyGuard.mark('WB_Skill');
  },
  toggleAttr: function (idx, key, on) {
    var x = this._data[idx]; if (!x) return;
    if (!x.stat || typeof x.stat !== 'object') x.stat = {};
    var bare = function (k) { return String(k == null ? '' : k).replace(/^attr_+/, ''); };
    var arr = Array.isArray(x.stat.attrs) ? x.stat.attrs : [];
    arr = arr.filter(function (k) { return bare(k) !== bare(key); });
    if (on) arr.push(bare(key));
    x.stat.attrs = arr;
    WB.DirtyGuard.mark('WB_Skill');
  },

  save: function () {
    var patch = { skills: this._data };
    if (this._pool != null) patch.skillPool = this._pool;
    else if (this._hadPool) patch.skillPool = null;
    if (WB.persist(this._cardId, patch)) {
      this._hadPool = this._pool != null;
      WB.DirtyGuard.clear('WB_Skill');
      return { ok: true };
    }
    return { ok: false, reason: '卡带不存在' };
  },
  reload: function () { this.init(this._cardId); return { ok: true }; }
};

function helpers() {
  if (typeof SkillEditorHelpers !== 'undefined' && SkillEditorHelpers && SkillEditorHelpers.validate) return SkillEditorHelpers;
  try {
    var H = require('../core/skill_editor_helpers.js');
    return (H && H.validate) ? H : null;
  } catch (e) { return null; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Skill;

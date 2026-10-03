// ============================================================
// 世界书编辑器 · 世界设定（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/world_setting_editor.js（window.WB_WorldSetting 段），去 DOM。
// 数据面：card.worldbook.worldSetting（对象，含 v2 迁移）。
// 关键：defaults() :21 / migrate() :42 逐字搬；set(path) 支持 'a.b' 点路径（桌面 :308-314）。
// RN 适配：init 卡带缺失 → 返回 {ok:false}（桌面用 UI.toast）；
//   addReligionToFactions 的 UI.toast → 返回值；save(silent) 语义不变。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

function uid(prefix) { return WB.uid(prefix); }

var WB_WorldSetting = {
  _data: null,
  _cardId: null,

  defaults: function () {
    return {
      worldName: '',
      mainStage: '',
      description: '',
      powerSystem: '',
      powerMix: false,
      powerCeiling: '',
      powerCounters: [],
      powerWeakness: '',
      officials: [],
      militaryUse: { used: false, inWar: false, note: '' },
      religions: [],
      newReligion: false,
      racialDiscrimination: { has: false, against: '' },
      // ★ v2 新增
      existence: { has: [], hasNot: [] },
      eraProducts: []
    };
  },

  migrate: function (saved) {
    var d = this.defaults();

    if (typeof saved.officialStance === 'string' && saved.officialStance && !saved.officials) {
      saved.officials = [{ id: uid('off'), name: '（原官方态度）', stance: saved.officialStance }];
    }
    if (typeof saved.religionStance === 'string' && saved.religionStance && !saved.religions) {
      saved.religions = [{ id: uid('rel'), name: '（原宗教态度）', faith: '', practice: '', stance: saved.religionStance, isNew: false }];
    }
    delete saved.officialStance;
    delete saved.religionStance;

    var out = Object.assign(d, saved);
    out.powerCounters = Array.isArray(out.powerCounters) ? out.powerCounters : [];
    out.officials = Array.isArray(out.officials) ? out.officials : [];
    out.religions = Array.isArray(out.religions) ? out.religions : [];
    out.militaryUse = Object.assign({ used: false, inWar: false, note: '' }, out.militaryUse || {});
    out.racialDiscrimination = Object.assign({ has: false, against: '' }, out.racialDiscrimination || {});

    // ★ v2 兼容
    if (!out.existence || typeof out.existence !== 'object') {
      out.existence = { has: [], hasNot: [] };
    }
    out.existence.has = Array.isArray(out.existence.has) ? out.existence.has : [];
    out.existence.hasNot = Array.isArray(out.existence.hasNot) ? out.existence.hasNot : [];
    out.eraProducts = Array.isArray(out.eraProducts) ? out.eraProducts : [];

    out.officials.forEach(function (o) { if (!o.id) o.id = uid('off'); });
    out.religions.forEach(function (r) { if (!r.id) r.id = uid('rel'); });
    out.eraProducts.forEach(function (e) {
      if (!e.id) e.id = uid('era');
      e.has = Array.isArray(e.has) ? e.has : [];
      e.hasNot = Array.isArray(e.hasNot) ? e.hasNot : [];
    });

    return out;
  },

  init: function (cardId) {
    this._cardId = cardId;
    var card = Storage.getAllCards()[cardId];
    if (!card) { this._data = null; return { ok: false, reason: '卡带不存在' }; }
    var saved = (card.worldbook && card.worldbook.worldSetting) || {};
    this._data = this.migrate(JSON.parse(JSON.stringify(saved)));
    return { ok: true };
  },

  data: function () { return this._data; },

  set: function (path, value) {
    var parts = path.split('.');
    var obj = this._data;
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    WB.DirtyGuard.mark('WB_WorldSetting');
  },

  // ===== existence =====
  addExistence: function (type) { this._data.existence[type].push(''); WB.DirtyGuard.mark('WB_WorldSetting'); },
  delExistence: function (type, i) { this._data.existence[type].splice(i, 1); WB.DirtyGuard.mark('WB_WorldSetting'); },
  setExistence: function (type, i, v) { this._data.existence[type][i] = v; WB.DirtyGuard.mark('WB_WorldSetting'); },

  // ===== eraProducts =====
  addEraSeg: function () {
    this._data.eraProducts.push({ id: uid('era'), from: null, to: null, has: [], hasNot: [] });
    WB.DirtyGuard.mark('WB_WorldSetting');
  },
  delEraSeg: function (i) { this._data.eraProducts.splice(i, 1); WB.DirtyGuard.mark('WB_WorldSetting'); return { ok: true }; },
  setEraSeg: function (i, key, v) {
    var seg = this._data.eraProducts[i];
    if (!seg) return;
    if (key === 'from' || key === 'to') { seg[key] = v === '' ? null : Number(v); }
    else { seg[key] = v; }
    WB.DirtyGuard.mark('WB_WorldSetting');
  },
  setEraList: function (i, key, v) {
    var seg = this._data.eraProducts[i];
    if (!seg) return;
    seg[key] = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    WB.DirtyGuard.mark('WB_WorldSetting');
  },

  // ===== 原有 =====
  addCounter: function () { this._data.powerCounters.push(''); WB.DirtyGuard.mark('WB_WorldSetting'); },
  delCounter: function (i) { this._data.powerCounters.splice(i, 1); WB.DirtyGuard.mark('WB_WorldSetting'); },
  setCounter: function (i, v) { this._data.powerCounters[i] = v; WB.DirtyGuard.mark('WB_WorldSetting'); },

  addOfficial: function () { this._data.officials.push({ id: uid('off'), name: '', stance: '' }); WB.DirtyGuard.mark('WB_WorldSetting'); },
  delOfficial: function (i) { this._data.officials.splice(i, 1); WB.DirtyGuard.mark('WB_WorldSetting'); return { ok: true }; },
  setOfficial: function (i, key, v) { this._data.officials[i][key] = v; WB.DirtyGuard.mark('WB_WorldSetting'); },

  addReligion: function () {
    this._data.religions.push({
      id: uid('rel'), name: '', faith: '', practice: '', stance: '',
      isNew: !!this._data.newReligion
    });
    WB.DirtyGuard.mark('WB_WorldSetting');
  },
  delReligion: function (i) { this._data.religions.splice(i, 1); WB.DirtyGuard.mark('WB_WorldSetting'); return { ok: true }; },
  setReligion: function (i, key, v) { this._data.religions[i][key] = v; WB.DirtyGuard.mark('WB_WorldSetting'); },

  // 桌面 :401-436：把宗教复制一条到势力栏（带 source/sourceRef 防重复）
  addReligionToFactions: function (i) {
    var r = this._data.religions[i];
    if (!r || !r.name) { return { ok: false, reason: '请先填写宗教名' }; }
    var card = Storage.getAllCards()[this._cardId];
    if (!card) { return { ok: false, reason: '卡带不存在' }; }

    this.save(true);

    var cardNow = Storage.getAllCards()[this._cardId];
    var cardCopy = JSON.parse(JSON.stringify(cardNow));
    if (!cardCopy.worldbook) cardCopy.worldbook = {};
    if (!Array.isArray(cardCopy.worldbook.factions)) cardCopy.worldbook.factions = [];

    var already = cardCopy.worldbook.factions.find(function (f) {
      return f.source === 'worldSetting' && f.sourceRef === r.id;
    });
    if (already) { return { ok: false, reason: '这个宗教已经添加过了' }; }

    cardCopy.worldbook.factions.push({
      id: uid('faction'),
      name: r.name,
      hasHiddenSide: false,
      publicSide: { name: r.name, what: r.faith || '', scope: '', resources: [] },
      hiddenSide: null,
      mainGoal: r.practice || '',
      mainFace: '明面',
      stanceOfficial: '', stanceMilitary: '', stancePeople: '', stancePeers: '',
      relations: [], linkedNPCs: [], tags: ['宗教'],
      source: 'worldSetting', sourceRef: r.id
    });

    var imported = Storage.getImportedCards();
    imported[this._cardId] = cardCopy;
    Storage.setImportedCards(imported);
    return { ok: true };
  },

  save: function (silent) {
    var d = this._data;
    if (!d || !d.worldName || !d.mainStage || !d.description) {
      if (!silent) return { ok: false, reason: '请填写：世界名、主要舞台、一句话总览' };
      return { ok: false, reason: '请填写：世界名、主要舞台、一句话总览' };
    }
    var card = Storage.getAllCards()[this._cardId];
    if (!card) return { ok: false, reason: '卡带不存在' };

    var cardCopy = JSON.parse(JSON.stringify(card));
    if (!cardCopy.worldbook) cardCopy.worldbook = {};
    cardCopy.worldbook.worldSetting = JSON.parse(JSON.stringify(d));

    var imported = Storage.getImportedCards();
    imported[this._cardId] = cardCopy;
    Storage.setImportedCards(imported);

    WB.DirtyGuard.clear('WB_WorldSetting');
    return { ok: true };
  },

  reload: function () { return this.init(this._cardId); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_WorldSetting;

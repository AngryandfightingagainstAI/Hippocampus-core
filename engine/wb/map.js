// ============================================================
// 世界书编辑器 · 地图（RN 侧纯逻辑，A 类）
// 逐条搬自桌面 worldbook/map_editor.js（window.WB_Map 段）：
//   TYPE_OPTIONS :17 / init :42 / _repairData :63 / currentNode :142 /
//   breadcrumb :147 / typeLabel :182 / setNode* :382-405 / switchTree :407 /
//   addTree :412 / delTree :429 / gotoNode :455 / addChild :459 / delChild :477 /
//   addAction :498 / delAction :512 / setAction* / addThen :544 / delThen :552 /
//   setThen :559 / save :566 / reload :580
// 两处 RN 适配：
//   1. typeIcon(:162) 返回的是 data-icon HTML，RN 不搬 engine/icons.js（任务书 S3），
//      改由组件层用 emoji 表渲染；引擎只保留 typeLabel。
//   2. addTree / addChild 的 UI.promptAsync 改名 → addTree(name) / addChild(name)，
//      名字由组件层弹输入框后传入；save 的 UI.toast → 返回 {ok, reason, repairLog}。
// 数据面：card.worldbook.maps（数组）+ card.worldbook.mapNodes（对象）。
// ============================================================

'use strict';

var WB = require('../wb_common.js');

var TYPE_OPTIONS = [
  { value: 'universe', label: '宇宙' },
  { value: 'galaxy', label: '星系' },
  { value: 'solar_system', label: '恒星系' },
  { value: 'planet', label: '星球' },
  { value: 'continent', label: '大陆' },
  { value: 'country', label: '国家' },
  { value: 'province', label: '省份' },
  { value: 'city', label: '城市' },
  { value: 'district', label: '区/县' },
  { value: 'street', label: '街道' },
  { value: 'community', label: '小区' },
  { value: 'building', label: '楼栋' },
  { value: 'floor', label: '楼层' },
  { value: 'room', label: '房间' },
  { value: 'custom', label: '自定义' }
];

var WB_Map = {
  _cardId: null,
  _data: null,
  _currentTreeId: null,
  _currentNodeId: null,
  _repairLog: [],

  TYPE_OPTIONS: TYPE_OPTIONS,

  init: function (cardId) {
    this._cardId = cardId;
    this._repairLog = [];
    var card = Storage.getAllCards()[cardId];
    if (!card) { this._data = null; return { ok: false, reason: '卡带不存在' }; }
    var wb = card.worldbook || {};
    this._data = {
      maps: JSON.parse(JSON.stringify(wb.maps || [])),
      mapNodes: JSON.parse(JSON.stringify(wb.mapNodes || {}))
    };
    this._repairData();
    if (this._data.maps.length > 0) {
      this._currentTreeId = this._data.maps[0].rootId;
      this._currentNodeId = this._currentTreeId;
    } else {
      this._currentTreeId = null;
      this._currentNodeId = null;
    }
    return { ok: true };
  },

  // ---- 数据兼容修复（桌面 :63-140 逐字）----
  _repairData: function () {
    var nodes = this._data.mapNodes;
    var log = this._repairLog;
    var self = this;

    // 1. mapNodes 若是数组 → 转对象
    if (Array.isArray(nodes)) {
      var obj = {};
      nodes.forEach(function (n) { if (n && n.id) obj[n.id] = n; });
      nodes = this._data.mapNodes = obj;
      log.push('mapNodes 是数组，已转为对象');
    }
    if (!nodes || typeof nodes !== 'object') {
      nodes = this._data.mapNodes = {};
    }

    // 2. 每个节点保证 id 和 key 一致，补默认值，清理非对象项
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (!n || typeof n !== 'object') { delete nodes[k]; return; }
      if (!n.id) n.id = k;
      if (!Array.isArray(n.childrenIds)) n.childrenIds = [];
      if (n.parentId === undefined) n.parentId = null;
    });

    // 3. 清理孤儿 parentId
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (n.parentId && !nodes[n.parentId]) {
        n.parentId = null;
        log.push('节点「' + (n.name || k) + '」的 parentId 指向无效节点，已转为根节点');
      }
    });

    // 4. maps 里的 rootId 修复
    this._data.maps.forEach(function (tree) {
      if (tree.rootId && nodes[tree.rootId]) return;
      var orphans = Object.keys(nodes).filter(function (k) { return !nodes[k].parentId; });
      if (orphans.length > 0) {
        tree.rootId = orphans[0];
        log.push('树「' + (tree.name || '?') + '」的 rootId 缺失，已自动绑定到「' + (nodes[orphans[0]].name || orphans[0]) + '」');
        return;
      }
      var newId = WB.uid('root');
      nodes[newId] = {
        id: newId, name: tree.name || '未命名', type: 'custom', desc: '',
        parentId: null, childrenIds: [], actions: [], linkedNPCs: [], linkedItems: [], tags: []
      };
      tree.rootId = newId;
      log.push('树「' + (tree.name || '?') + '」的 rootId 无效，已创建新根节点');
    });

    // 5. 重建 childrenIds
    var childMap = {};
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (n.parentId && nodes[n.parentId]) {
        if (!childMap[n.parentId]) childMap[n.parentId] = [];
        if (childMap[n.parentId].indexOf(k) === -1) childMap[n.parentId].push(k);
      }
    });
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      var merged = [];
      (n.childrenIds || []).forEach(function (c) { if (nodes[c] && merged.indexOf(c) === -1) merged.push(c); });
      (childMap[k] || []).forEach(function (c) { if (merged.indexOf(c) === -1) merged.push(c); });
      n.childrenIds = merged;
    });
  },

  data: function () { return this._data; },
  repairLog: function () { return this._repairLog; },
  currentNode: function () {
    if (!this._currentNodeId) return null;
    return this._data.mapNodes[this._currentNodeId] || null;
  },
  currentTreeId: function () { return this._currentTreeId; },
  currentNodeId: function () { return this._currentNodeId; },

  breadcrumb: function () {
    if (!this._currentNodeId) return [];
    var chain = [];
    var id = this._currentNodeId;
    var guard = 0;
    while (id && guard < 100) {
      var n = this._data.mapNodes[id];
      if (!n) break;
      chain.unshift(n);
      id = n.parentId;
      guard++;
    }
    return chain;
  },

  typeLabel: function (type) {
    for (var i = 0; i < TYPE_OPTIONS.length; i++) {
      if (TYPE_OPTIONS[i].value === type) return TYPE_OPTIONS[i].label;
    }
    return type;
  },

  setNode: function (key, value) {
    var n = this.currentNode();
    if (!n) return;
    n[key] = value;
    WB.DirtyGuard.mark('WB_Map');
  },
  setNodeTags: function (v) { var n = this.currentNode(); if (n) { n.tags = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Map'); } },
  setNodeLinkedNPCs: function (v) { var n = this.currentNode(); if (n) { n.linkedNPCs = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Map'); } },
  setNodeLinkedItems: function (v) { var n = this.currentNode(); if (n) { n.linkedItems = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); WB.DirtyGuard.mark('WB_Map'); } },

  switchTree: function (rootId) { this._currentTreeId = rootId; this._currentNodeId = rootId; },

  addTree: function (name) {
    if (!name) return { ok: false, reason: '名称为空' };
    var id = WB.uid('root');
    this._data.maps.push({ rootId: id, name: name });
    this._data.mapNodes[id] = {
      id: id, name: name, type: 'universe', desc: '',
      parentId: null, childrenIds: [],
      actions: [], linkedNPCs: [], linkedItems: [], tags: []
    };
    WB.DirtyGuard.mark('WB_Map');
    this._currentTreeId = id;
    this._currentNodeId = id;
    return { ok: true, id: id };
  },
  delTree: function () {
    if (!this._currentTreeId) return { ok: false };
    var rootId = this._currentTreeId;
    var toDel = [];
    var self = this;
    var walk = function (id) {
      var n = self._data.mapNodes[id];
      if (!n) return;
      toDel.push(id);
      (n.childrenIds || []).forEach(walk);
    };
    walk(rootId);
    toDel.forEach(function (id) { delete self._data.mapNodes[id]; });
    this._data.maps = this._data.maps.filter(function (m) { return m.rootId !== rootId; });
    WB.DirtyGuard.mark('WB_Map');
    if (this._data.maps.length > 0) {
      this._currentTreeId = this._data.maps[0].rootId;
      this._currentNodeId = this._currentTreeId;
    } else {
      this._currentTreeId = null;
      this._currentNodeId = null;
    }
    return { ok: true };
  },

  gotoNode: function (id) { this._currentNodeId = id; },
  addChild: function (name) {
    var cur = this.currentNode();
    if (!cur) return { ok: false };
    if (!name) return { ok: false, reason: '名称为空' };
    var id = WB.uid('n');
    this._data.mapNodes[id] = {
      id: id, name: name, type: 'custom', desc: '',
      parentId: cur.id, childrenIds: [],
      actions: [], linkedNPCs: [], linkedItems: [], tags: []
    };
    if (!cur.childrenIds) cur.childrenIds = [];
    cur.childrenIds.push(id);
    WB.DirtyGuard.mark('WB_Map');
    return { ok: true, id: id };
  },
  delChild: function (id) {
    var cn = this._data.mapNodes[id];
    if (!cn) return { ok: false };
    var cur = this.currentNode();
    if (!cur) return { ok: false };
    var toDel = [];
    var self = this;
    var walk = function (nid) {
      var n = self._data.mapNodes[nid];
      if (!n) return;
      toDel.push(nid);
      (n.childrenIds || []).forEach(walk);
    };
    walk(id);
    toDel.forEach(function (nid) { delete self._data.mapNodes[nid]; });
    cur.childrenIds = (cur.childrenIds || []).filter(function (c) { return c !== id; });
    WB.DirtyGuard.mark('WB_Map');
    return { ok: true };
  },

  addAction: function () {
    var cur = this.currentNode();
    if (!cur) return { ok: false };
    if (!cur.actions) cur.actions = [];
    cur.actions.push({
      id: WB.uid('act'), label: '',
      condition: null,
      cost: { money: null, time: null },
      gives: { items: [], states: [] },
      then: []
    });
    WB.DirtyGuard.mark('WB_Map');
    return { ok: true };
  },
  delAction: function (ai) {
    var cur = this.currentNode();
    if (!cur) return { ok: false };
    cur.actions.splice(ai, 1);
    WB.DirtyGuard.mark('WB_Map');
    return { ok: true };
  },
  setAction: function (ai, key, value) {
    var cur = this.currentNode();
    if (!cur) return;
    cur.actions[ai][key] = value;
    WB.DirtyGuard.mark('WB_Map');
  },
  setActionCost: function (ai, key, value) {
    var cur = this.currentNode();
    if (!cur) return;
    if (!cur.actions[ai].cost) cur.actions[ai].cost = {};
    cur.actions[ai].cost[key] = value === '' ? null : Number(value);
    WB.DirtyGuard.mark('WB_Map');
  },
  setActionGives: function (ai, key, value) {
    var cur = this.currentNode();
    if (!cur) return;
    if (!cur.actions[ai].gives) cur.actions[ai].gives = {};
    cur.actions[ai].gives[key] = value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    WB.DirtyGuard.mark('WB_Map');
  },
  addThen: function (ai) {
    var cur = this.currentNode();
    if (!cur) return { ok: false };
    if (!cur.actions[ai].then) cur.actions[ai].then = [];
    cur.actions[ai].then.push({ label: '', action: 'none' });
    WB.DirtyGuard.mark('WB_Map');
    return { ok: true };
  },
  delThen: function (ai, ti) {
    var cur = this.currentNode();
    if (!cur) return { ok: false };
    cur.actions[ai].then.splice(ti, 1);
    WB.DirtyGuard.mark('WB_Map');
    return { ok: true };
  },
  setThen: function (ai, ti, key, value) {
    var cur = this.currentNode();
    if (!cur) return;
    cur.actions[ai].then[ti][key] = value;
    WB.DirtyGuard.mark('WB_Map');
  },

  save: function () {
    var card = Storage.getAllCards()[this._cardId];
    if (!card) return { ok: false, reason: '卡带不存在' };
    var cardCopy = JSON.parse(JSON.stringify(card));
    if (!cardCopy.worldbook) cardCopy.worldbook = {};
    cardCopy.worldbook.maps = this._data.maps;
    cardCopy.worldbook.mapNodes = this._data.mapNodes;
    var imported = Storage.getImportedCards();
    imported[this._cardId] = cardCopy;
    Storage.setImportedCards(imported);
    this._repairLog = [];
    WB.DirtyGuard.clear('WB_Map');
    return { ok: true };
  },
  reload: function () { return this.init(this._cardId); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = WB_Map;

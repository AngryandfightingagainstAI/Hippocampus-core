// ============================================================
// P2 · S2 · 数值编辑器 smoke（cwd 必须是 RN 仓根：node tools/num_editor_smoke.js）
// 覆盖：
//   A 模块形态（纯逻辑 / 无 DOM 渲染函数 / 模板已装载 / 初值）
//   B pickCard + loadFromCard 三源装载（hud / sidebar / panel.number / panel.relation）
//   C whereOptions + getNpcOptions
//   D addItem 模板斗字段（gauge / relation + 深拷贝）
//   E set / addSeg / delSeg / setSeg / toggleTrigger / delItem
//   F saveAndSync 往返：卡带 JSON 真的变了（hud / sidebar / panels 段 + meta + 校验回执）
//   G reload / _ensureValidCard / 错误路径 reason 逐字
//   H 模板逐字节同源（RN vs 桌面）+ 与桌面 NumEditor 主体逐字同源
//   I B 类组件（babel transform + 零 DOM + 文案逐字 + 接线）+ 桌面三锁定基线自证
// ============================================================

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var root = path.resolve(__dirname, '..');
var DESK = 'd:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').toUpperCase(); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function lf(s) { return String(s).replace(/\r\n/g, '\n'); }

// ================= 内存 harness（同 p1_settings_smoke.js:794-819）=================

function installMemLocalStorage() {
  var mem = {};
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; }
  };
  return globalThis.localStorage;
}

function memStorageAdapter() {
  var map = {}, order = [];
  var api = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) order.push(k);
      map[k] = String(v);
    },
    removeItem: function (k) { delete map[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); },
    key: function (i) { return i < order.length ? order[i] : null; }
  };
  Object.defineProperty(api, 'length', { get: function () { return order.length; } });
  return api;
}

// ================= 卡带夹具 =================

function fixtureCard() {
  return {
    schemaVersion: 1,
    cardId: 'demo_ne',
    cardName: '数值测试卡带',
    game: { title: '数值测试' },
    hud: [
      { type: 'gauge', key: 'hp', name: '生命', icon: '❤', min: 0, max: 100, init: 60,
        showBar: true, color: 'red', desc: '血量',
        segments: [{ min: 0, max: 30, text: '重伤', trigger: true }] }
    ],
    sidebar: [
      { type: 'gauge', key: 'san', name: '理智', icon: '●', min: 0, max: 100, init: 80,
        showBar: true, color: 'blue', desc: '', segments: [] }
    ],
    panels: [
      { id: 'p2', num: 2, name: '状态', entries: [
        { type: 'number', key: 'gold', name: '金币', icon: '●', min: 0, max: 9999, current: 120,
          showBar: true, color: 'yellow', desc: '', segments: [] }
      ] },
      { id: 'p3', num: 3, name: '关系', entries: [
        { type: 'relation', key: 'rel_a', name: '好感', icon: '●', from: 'player', to: 'npc_a',
          min: -100, max: 100, current: 10, showBar: true, color: 'blue', desc: '', segments: [] }
      ] },
      { id: 'p4', num: 4, name: '物品', entries: [] },
      { id: 'p5', num: 5, name: '世界', entries: [] }
    ],
    attributes: [],
    worldbook: { npcs: [{ id: 'npc_a', name: '阿甲' }] }
  };
}

// ================= 主流程 =================

function runNE() {
  var Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  // 引擎模块裸用风格：rn_bootstrap 把 Storage 挂 globalThis，Node 侧同口径
  globalThis.Storage = Storage;

  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  globalThis.CardValidator = require(path.join(root, 'engine', 'core', 'card_validator.js'));
  globalThis.CARDS = { demo_ne: fixtureCard() };

  var NE = require(path.join(root, 'engine', 'num_editor.js'));

  // ---------- A 模块形态 ----------
  var METHODS = ['_ensureValidCard', 'whereOptions', 'getNpcOptions', 'loadFromCard', 'saveToCard',
    'pickCard', 'reload', 'addItem', 'delItem', 'set', 'addSeg', 'delSeg', 'setSeg', 'toggleTrigger', 'saveAndSync'];
  var missM = METHODS.filter(function (m) { return typeof NE[m] !== 'function'; });
  check('A1 15 个方法齐（缺：' + JSON.stringify(missM) + '）', missM.length === 0);
  check('A2 无 DOM 渲染函数（render / renderItem 已删）',
    typeof NE.render === 'undefined' && typeof NE.renderItem === 'undefined');
  check('A3 两模板已装载（TEMPLATE_NUMBER=gauge / TEMPLATE_RELATION=relation）',
    !!globalThis.TEMPLATE_NUMBER && globalThis.TEMPLATE_NUMBER.type === 'gauge' &&
    !!globalThis.TEMPLATE_RELATION && globalThis.TEMPLATE_RELATION.type === 'relation');
  check('A4 初值 cardId=null / items=[] / dirty=false',
    NE.cardId === null && Array.isArray(NE.items) && NE.items.length === 0 && NE.dirty === false);

  // ---------- B pickCard + loadFromCard 三源 ----------
  var rEmpty = NE.pickCard('');
  check('B1 pickCard("") → { ok:true, picked:null } 且复位',
    rEmpty.ok === true && rEmpty.picked === null && NE.cardId === null && NE.items.length === 0);

  var rGhost = NE.pickCard('nope');
  check('B2 pickCard(不存在) → ok:false reason 逐字 + 静默重置',
    rGhost.ok === false && rGhost.reason === '卡带不存在' &&
    NE.cardId === null && NE.items.length === 0 && NE.dirty === false);

  var rPick = NE.pickCard('demo_ne');
  check('B3 pickCard("demo_ne") → ok:true + 装载 4 条（hud1 + sidebar1 + panel.number1 + panel.relation1）',
    rPick.ok === true && rPick.picked === 'demo_ne' && NE.items.length === 4 && NE.dirty === false);

  eq('B4 hud 项 where=hud / type=gauge / label=生命', NE.items[0].where, 'hud');
  check('B4 补 hud 项字段（type=gauge / label=生命 / icon=❤ / init=60）',
    NE.items[0].type === 'gauge' && NE.items[0].label === '生命' && NE.items[0].icon === '❤' && NE.items[0].init === 60);
  eq('B5 sidebar 项 where=sidebar（key=san / init=80）', NE.items[1].where, 'sidebar');
  check('B5 补 sidebar 字段', NE.items[1].key === 'san' && NE.items[1].init === 80);
  eq('B6 panel.number 项 where=panel.p2', NE.items[2].where, 'panel.p2');
  check('B6 补 panel.number 字段（key=gold / init 取 current=120）',
    NE.items[2].key === 'gold' && NE.items[2].init === 120 && NE.items[2].type === 'gauge');
  eq('B7 panel.relation 项 where=panel.p3', NE.items[3].where, 'panel.p3');
  check('B7 补 relation 字段（from=player / to=npc_a / init 取 current=10）',
    NE.items[3].type === 'relation' && NE.items[3].from === 'player' &&
    NE.items[3].to === 'npc_a' && NE.items[3].init === 10);
  check('B8 segments 深拷贝（不与卡对象共引）',
    NE.items[0].segments.length === 1 &&
    NE.items[0].segments[0] !== globalThis.CARDS.demo_ne.hud[0].segments[0] &&
    NE.items[0].segments[0].text === '重伤' && NE.items[0].segments[0].trigger === true);

  // ---------- C whereOptions / getNpcOptions ----------
  var wo = NE.whereOptions();
  check('C1 whereOptions = 2 + 4 面板 = 6 项（首项顶栏（HUD））',
    wo.length === 6 && wo[0].value === 'hud' && wo[0].label === '顶栏（HUD）' &&
    wo[1].value === 'sidebar' && wo[1].label === '左侧状态栏');
  check('C1 补 面板项 label 逐字（面板 2 · 状态 / panel.p2）',
    wo[2].value === 'panel.p2' && wo[2].label === '面板 2 · 状态' &&
    wo[3].value === 'panel.p3' && wo[3].label === '面板 3 · 关系');
  var npc0 = NE.getNpcOptions();
  check('C2 选卡后 getNpcOptions 首项 玩家 (player) + 带出 worldbook.npcs',
    npc0.length === 2 && npc0[0].id === 'player' && npc0[0].name === '玩家 (player)' &&
    npc0[1].id === 'npc_a' && npc0[1].name === '阿甲 (npc_a)');

  // ---------- D addItem 模板 ----------
  var NEcardId = NE.cardId;
  NE.cardId = null;
  var rAddNo = NE.addItem('gauge');
  check('D1 未选卡带 addItem → ok:false reason 逐字「请先选择一个卡带」',
    rAddNo.ok === false && rAddNo.reason === '请先选择一个卡带');
  NE.cardId = NEcardId;

  var rAddG = NE.addItem('gauge');
  var gi = rAddG.index;
  check('D2 addItem("gauge") → ok + index=4 + 模板斗字段齐（sidebar/0/100/0）',
    rAddG.ok === true && gi === 4 && NE.items[gi].type === 'gauge' &&
    NE.items[gi].min === 0 && NE.items[gi].max === 100 && NE.items[gi].init === 0 &&
    NE.items[gi].where === 'sidebar' && NE.items[gi].key === '' && NE.items[gi].label === '');
  check('D2 补 深拷贝（新增项 !== TEMPLATE_NUMBER）', NE.items[gi] !== globalThis.TEMPLATE_NUMBER);

  var rAddR = NE.addItem('relation');
  var ri = rAddR.index;
  check('D3 addItem("relation") → 模板斗字段（panel.social / -100 / 100 / from=player）',
    rAddR.ok === true && ri === 5 && NE.items[ri].type === 'relation' &&
    NE.items[ri].from === 'player' && NE.items[ri].to === '' &&
    NE.items[ri].min === -100 && NE.items[ri].max === 100 && NE.items[ri].where === 'panel.social');
  check('D4 新增后 dirty=true', NE.dirty === true);

  // ---------- E 编辑原语 ----------
  NE.set(0, 'label', 'HP2');
  check('E1 set(0,"label","HP2") 改内存 + dirty=true',
    NE.items[0].label === 'HP2' && NE.dirty === true);
  NE.addSeg(0);
  check('E2 addSeg(0) → 默认段 { min:0, max:100, text:"", trigger:false }',
    NE.items[0].segments.length === 2 &&
    NE.items[0].segments[1].min === 0 && NE.items[0].segments[1].max === 100 &&
    NE.items[0].segments[1].text === '' && NE.items[0].segments[1].trigger === false);
  NE.setSeg(0, 1, 'min', '');
  NE.setSeg(0, 1, 'max', '55');
  NE.setSeg(0, 1, 'text', '半血');
  check('E3 setSeg 数值空串归 0 / 非空转 Number / 文本直存',
    NE.items[0].segments[1].min === 0 && NE.items[0].segments[1].max === 55 &&
    NE.items[0].segments[1].text === '半血');
  NE.toggleTrigger(0, 1);
  var t1 = NE.items[0].segments[1].trigger;
  NE.toggleTrigger(0, 1);
  var t2 = NE.items[0].segments[1].trigger;
  check('E4 toggleTrigger 往返（false → true → false）', t1 === true && t2 === false);
  NE.delSeg(0, 1);
  check('E5 delSeg(0,1) → 段数回落 1', NE.items[0].segments.length === 1);
  var nBefore = NE.items.length;
  NE.delItem(1);
  check('E6 delItem(1) → 条目数 -1', NE.items.length === nBefore - 1);

  // ---------- F saveAndSync 往返：卡带 JSON 真的变了 ----------
  NE.cardId = null;
  var rSaveNo = NE.saveAndSync();
  check('F1 未选卡带 saveAndSync → ok:false reason 逐字「未选择卡带」',
    rSaveNo.ok === false && rSaveNo.reason === '未选择卡带');

  NE.pickCard('demo_ne');
  // 种一次盘：把夹具完整写入 imported（后续比对基线）
  var rSeed = NE.saveAndSync();
  check('F2 首次 saveAndSync 落盘（ok + validation.ok）',
    rSeed.ok === true && !!rSeed.validation && rSeed.validation.ok === true && NE.dirty === false);

  var baseCard = JSON.parse(JSON.stringify(Storage.getImportedCards().demo_ne));
  var baseHudJson = JSON.stringify(baseCard.hud);
  var basePanelJson = JSON.stringify(baseCard.panels);

  // 错误路径：缺内部名 / 缺名称
  NE.items[0].key = '';
  var rNoKey = NE.saveAndSync();
  check('F3 第 1 条缺内部名 → ok:false reason 逐字',
    rNoKey.ok === false && rNoKey.reason === '第 1 条缺内部名');
  NE.items[0].key = 'hp';
  NE.items[0].label = '';
  var rNoLabel = NE.saveAndSync();
  check('F3b 第 1 条缺名称 → ok:false reason 逐字',
    rNoLabel.ok === false && rNoLabel.reason === '第 1 条缺名称');
  NE.items[0].label = '生命';

  // 真改：hud 首条 init 60→30 / name→生命值；panel.number gold 120→777；删 sidebar 项
  NE.set(0, 'label', '生命值');
  NE.set(0, 'init', 30);
  var goldIdx = -1;
  NE.items.forEach(function (it, i) { if (it.key === 'gold') goldIdx = i; });
  NE.set(goldIdx, 'init', 777);
  var sanIdx = -1;
  NE.items.forEach(function (it, i) { if (it.key === 'san') sanIdx = i; });
  NE.delItem(sanIdx);

  var rSave = NE.saveAndSync();
  check('F4 改后 saveAndSync → ok:true + cardId + validation.ok',
    rSave.ok === true && rSave.cardId === 'demo_ne' &&
    !!rSave.validation && rSave.validation.ok === true);

  var after = Storage.getImportedCards().demo_ne;
  check('F5 卡带 JSON 真的变了（hud 段与基线不同）',
    JSON.stringify(after.hud) !== baseHudJson);
  check('F6 hud[0] 写入新值（name=生命值 / init=30 / 关系字段未污染）',
    after.hud.length === 1 && after.hud[0].name === '生命值' && after.hud[0].init === 30 &&
    after.hud[0].key === 'hp' && after.hud[0].type === 'gauge' &&
    after.hud[0].from === undefined && after.hud[0].lockDown === undefined);
  check('F7 sidebar 段被删空（delItem 生效）', Array.isArray(after.sidebar) && after.sidebar.length === 0);
  check('F8 panels 段真的变了（与基线不同）', JSON.stringify(after.panels) !== basePanelJson);
  var p2 = null, p3 = null;
  after.panels.forEach(function (p) { if (p.num === 2) p2 = p; if (p.num === 3) p3 = p; });
  check('F8 补 panels num2 entries 重写为 number 且 current=777（init → current）',
    !!p2 && p2.entries.length === 1 && p2.entries[0].type === 'number' &&
    p2.entries[0].key === 'gold' && p2.entries[0].current === 777);
  check('F8 补 panels num3 entries 保留 relation 四字段（from/to/lockDown/lockUp）',
    !!p3 && p3.entries.length === 1 && p3.entries[0].type === 'relation' &&
    p3.entries[0].from === 'player' && p3.entries[0].to === 'npc_a' &&
    p3.entries[0].lockDown === false && p3.entries[0].lockUp === false);
  check('F9 attributes 段未被动（原样 []）', JSON.stringify(after.attributes) === '[]');
  check('F10 meta.lastModifiedBy=editor + lastModifiedAt 为 ISO 串',
    !!after.meta && after.meta.lastModifiedBy === 'editor' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(after.meta.lastModifiedAt)));
  check('F11 保存后 dirty=false', NE.dirty === false);

  // ---------- G reload / _ensureValidCard ----------
  NE.set(0, 'label', '脏值未存');
  var rReload = NE.reload();
  check('G1 reload() → ok:true + 回到磁盘值（生命值）',
    rReload.ok === true && NE.items[0].label === '生命值' && NE.dirty === false);

  var keepId = NE.cardId;
  NE.cardId = null;
  var rReloadNo = NE.reload();
  check('G2 未选卡带 reload → ok:false reason 逐字「未选择卡带」',
    rReloadNo.ok === false && rReloadNo.reason === '未选择卡带');
  NE.cardId = keepId;

  check('G3 _ensureValidCard 有效卡 → true', NE._ensureValidCard() === true);
  NE.cardId = 'ghost_card';
  var gv = NE._ensureValidCard();
  check('G3b _ensureValidCard 失效卡 → false 且清空 cardId / items',
    gv === false && NE.cardId === null && NE.items.length === 0);

  // 清理
  delete globalThis.CARDS;
  delete globalThis.VFS;
  delete globalThis.StorageAdapter;
  delete globalThis.localStorage;
  delete globalThis.CardValidator;
}

// ================= H 同源（模板逐字节 + NumEditor 主体逐字）=================

function runSource() {
  var deskNum = path.join(DESK, 'templates', 'number.js');
  var deskRel = path.join(DESK, 'templates', 'relation.js');
  var rnNum = path.join(root, 'templates', 'number.js');
  var rnRel = path.join(root, 'templates', 'relation.js');

  check('H1 templates/number.js 两仓同源（P30：行尾归一后比内容；桌面 CRLF 538 B / RN LF 518 B）',
    lf(read(rnNum)) === lf(read(deskNum)) &&
    fs.statSync(rnNum).size === 518 && md5(rnNum) === '3CEC67BAA209928D8AAEEED3D47D2166');
  check('H2 templates/relation.js 两仓同源（P30：行尾归一后比内容；桌面 CRLF 637 B / RN LF 617 B）',
    lf(read(rnRel)) === lf(read(deskRel)) &&
    fs.statSync(rnRel).size === 617 && md5(rnRel) === '44CE2AF0B93D1398F9F94C0817C425E5');

  var deskSrc = lf(read(path.join(DESK, 'engine', 'editor.js')));
  var rnSrc = lf(read(path.join(root, 'engine', 'num_editor.js')));

  // 桌面 NumEditor 段：L6-L214 → 去掉 render(L98-116) / renderItem(L117-147)
  var lines = deskSrc.split('\n');
  var block = lines.slice(5, 214);          // L6..L214
  var kept = block.slice(0, 92).concat(block.slice(142)); // 保留非 DOM 渲染函数行

  var needles = [
    // 整函数逐字（10 个纯逻辑函数）
    ['_ensureValidCard() {', '    return true;\n  },'],
    ['whereOptions() {', '    return out;\n  },'],
    ['getNpcOptions() {', '    return opts;\n  },'],
    ['loadFromCard(card) {', "    push(card.hud, 'hud'); push(card.sidebar, 'sidebar');"],
    ['saveToCard(card) {', '      }\n    });\n  },']
  ];
  var missed = [];
  needles.forEach(function (pair) {
    var a = deskSrc.indexOf(pair[0]);
    var b = deskSrc.indexOf(pair[1], a + pair[0].length);
    if (a < 0 || b < 0) { missed.push(pair[0] + ' :: 桌面锚点未找到'); return; }
    var seg = deskSrc.slice(a, b + pair[1].length);
    if (rnSrc.indexOf(seg) < 0) missed.push(pair[0]);
  });
  // 单行函数逐字
  var singleLines = [
    '  set(idx, key, value) { this.items[idx][key] = value; this.dirty = true; },',
    "  setSeg(idx, si, key, value) { const s = this.items[idx].segments[si]; if (key==='min'||key==='max') s[key] = value===''?0:Number(value); else s[key]=value; this.dirty=true; },",
    "  addSeg(idx) { if (!this.items[idx].segments) this.items[idx].segments = []; this.items[idx].segments.push({ min:0, max:100, text:'', trigger:false }); this.dirty=true;",
    '  delSeg(idx, si) { this.items[idx].segments.splice(si, 1); this.dirty=true;',
    '  toggleTrigger(idx, si) { const s = this.items[idx].segments[si]; s.trigger = !s.trigger; this.dirty=true;'
  ];
  singleLines.forEach(function (l) {
    if (deskSrc.indexOf(l) < 0) { missed.push(l + ' :: 桌面锚点未找到'); return; }
    if (rnSrc.indexOf(l) < 0) missed.push(l);
  });
  check('H3 桌面 NumEditor 主体（10 纯逻辑函数）逐字出现在 RN（missed=' + JSON.stringify(missed) + '）',
    missed.length === 0);

  check('H4 保存路径逐字同源（cardCopy → meta → 落盘）',
    rnSrc.indexOf('    const cardCopy = JSON.parse(JSON.stringify(card));\n    this.saveToCard(cardCopy);\n    if (!cardCopy.meta) cardCopy.meta = {};\n    cardCopy.meta.lastModifiedAt = new Date().toISOString();\n    cardCopy.meta.lastModifiedBy = \'editor\';') >= 0 &&
    rnSrc.indexOf('    const imported = Storage.getImportedCards();\n    imported[this.cardId] = cardCopy;\n    Storage.setImportedCards(imported);\n    this.dirty = false;') >= 0);

  // 非琐碎行全落（允许列表 = 已适配的 UI 行）
  var ADAPTED = [
    'window.NumEditor = {',
    "    if (!cardId) { this.cardId = null; this.items = []; this.render(document.getElementById('settings-tab-editor')); return; }",
    '      this.render(document.getElementById(\'settings-tab-editor\'));',
    '    this.render(document.getElementById(\'settings-tab-editor\'));',
    '    if (!this.cardId) return;',
    "    if (this.dirty && !(await UI.confirmAsync('放弃修改？'))) return;",
    "    if (!card) { this.cardId = null; this.items = []; this.render(document.getElementById('settings-tab-editor')); return; }",
    "    if (!this.cardId) { UI.toast('请先选择一个卡带', { type: 'warn' }); return; }",
    "    const tpl = type === 'relation' ? JSON.parse(JSON.stringify(window.TEMPLATE_RELATION || {})) : JSON.parse(JSON.stringify(window.TEMPLATE_NUMBER || {}));",
    '    this.items.push(tpl); this.dirty = true;',
    "  async delItem(idx) { if (!(await UI.confirmAsync('删除？'))) return; this.items.splice(idx, 1); this.dirty = true; this.render(document.getElementById('settings-tab-editor')); },",
    "    if (!this.cardId) { UI.toast('未选择卡带', { type: 'warn' }); return; }",
    "      if (!it.key) { UI.toast('第 ' + (i+1) + ' 条缺内部名', { type: 'error' }); return; }",
    "      if (!it.label) { UI.toast('第 ' + (i+1) + ' 条缺名称', { type: 'error' }); return; }",
    "    if (!card) { UI.toast('卡带不存在', { type: 'error' }); return; }",
    "      alertBox.className = 'alert show success';",
    "      alertBox.innerHTML = '<div class=\"title\"><span data-icon=\"check\"></span> 已保存</div>';",
    "      if (typeof UI !== 'undefined' && UI.fillIcons) UI.fillIcons(alertBox);"
  ];
  // 允许列表里的 render 调用行在 RN 应「不出现」
  var ghost = kept.filter(function (l) {
    var t = l.trim();
    if (t.length < 20) return false;
    if (t.indexOf('document.') >= 0) return false;
    if (ADAPTED.indexOf(l) >= 0) return false;
    if (t.indexOf('async ') === 0) return false;
    return rnSrc.indexOf(l) < 0;
  });
  check('H5 桌面 NumEditor 非琐碎非 UI 行全部逐字落 RN（ghost=' + JSON.stringify(ghost.slice(0, 5)) + '）',
    ghost.length === 0);

  // 代码体（去掉文件头注释，注释里提到 DOM API 名不算）
  var rnCode = rnSrc.slice(rnSrc.indexOf("'use strict';"));
  check('H6 RN 侧代码体零 DOM（无 document. / escapeAttr / escapeHtml / this.render(）',
    rnCode.indexOf('document.') < 0 && rnCode.indexOf('escapeAttr') < 0 &&
    rnCode.indexOf('escapeHtml') < 0 && rnCode.indexOf('this.render(') < 0);
  check('H7 错误 reason 文案逐字（第 N 条缺内部名 / 第 N 条缺名称 / 卡带不存在 / 未选择卡带 / 请先选择一个卡带）',
    rnSrc.indexOf("'第 ' + (i+1) + ' 条缺内部名'") >= 0 &&
    rnSrc.indexOf("'第 ' + (i+1) + ' 条缺名称'") >= 0 &&
    rnSrc.indexOf("'卡带不存在'") >= 0 &&
    rnSrc.indexOf("'未选择卡带'") >= 0 &&
    rnSrc.indexOf("'请先选择一个卡带'") >= 0);
  check('H8 双态导出（window + module.exports）',
    rnSrc.indexOf("if (typeof window !== 'undefined') window.NumEditor = NumEditor;") >= 0 &&
    rnSrc.indexOf('if (typeof module !== \'undefined\' && module.exports) module.exports = NumEditor;') >= 0);
}

// ================= I B 类组件 + 接线 + 基线自证 =================

function runComponent() {
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  var rel = 'rn/screens/settings/NumEditorTab.js';
  try {
    babel.transformFileSync(path.join(root, rel), { cwd: root, configFile: path.join(root, 'babel.config.js') });
    ok++; console.log('PASS: I1 babel transform ' + rel);
  } catch (e) {
    fail++; console.log('FAIL: I1 babel transform ' + rel + ' :: ' + e.message);
  }

  var src = read(path.join(root, rel));
  check('I2 NumEditorTab 零 DOM（无 document. / window.）',
    src.indexOf('document.') < 0 && src.indexOf('window.') < 0);
  var WORDS = ['数值编辑器', '-- 选择卡带 --', '选择一个卡带开始编辑。', ' 条数值。',
    '+ 新建连续数值', '+ 新建关系', '💾 保存', '↺ 重新读取', '关系', '连续数值',
    '删除', '内部名', '从', '对', '位置', '上下限', '颜色', '总说明', '分段说明',
    '+ 添加一段', '☑触发', '☐触发', '删除？', '放弃修改？', '已保存'];
  var gapW = WORDS.filter(function (w) { return src.indexOf(w) < 0; });
  check('I3 组件文案逐字齐（缺：' + JSON.stringify(gapW) + '）', gapW.length === 0);
  check('I3b 四色选项逐字（蓝/绿/黄/红）',
    src.indexOf("{ value: 'blue', label: '蓝' }") >= 0 &&
    src.indexOf("{ value: 'green', label: '绿' }") >= 0 &&
    src.indexOf("{ value: 'yellow', label: '黄' }") >= 0 &&
    src.indexOf("{ value: 'red', label: '红' }") >= 0);
  check('I3c 数据层取 globalThis.NumEditor（不引引擎裸变量）',
    src.indexOf('globalThis.NumEditor') >= 0);
  check('I3d 保存/重读走 Platform.ui.confirmAsync（删除？/ 放弃修改？）',
    src.indexOf("Platform.ui.confirmAsync('删除？')") >= 0 &&
    src.indexOf("Platform.ui.confirmAsync('放弃修改？')") >= 0);

  var ss = read(path.join(root, 'rn', 'screens', 'SettingsScreen.js'));
  check('I4 SettingsScreen 接线（require + editor 分支）',
    ss.indexOf("require('./settings/NumEditorTab.js').NumEditorTab") >= 0 &&
    ss.indexOf("if (id === 'editor') return React.createElement(NumEditorTab, null);") >= 0);

  // I5 P10·C1：死导出 PLACEHOLDER_TABS 已删（editor 于 P2·S2、search 于 P2·S1 实装）。
  //   改指理由：原断言读该导出的「已摘 editor/search」，删除后改为正向断言「导出不存在」。
  var Model = require(path.join(root, 'rn', 'settings_model.js'));
  check('I5 死导出 PLACEHOLDER_TABS 已删（editor/search 已实装）',
    Model.PLACEHOLDER_TABS === undefined);

  var boot = read(path.join(root, 'rn', 'rn_bootstrap.js'));
  check('I6 rn_bootstrap 装载 NumEditor（load(\'NumEditor\', ...) → engine/num_editor.js）',
    boot.indexOf("load('NumEditor'") >= 0 && boot.indexOf("require('../engine/num_editor.js')") >= 0);

  // P12·S1：桌面三锁定基线 → RN 本仓基线（方案 A，用户批准）。
  //   此改动源于 P11 复核发现的跨仓耦合：原桌面基线 10046/9B3FC583…、48055/DC7A753F…、
  //   38401/C0D889B6… 会在只改桌面时凭空把本套弄红。基线值改取 RN 现盘实测。
  //   prompt_builder 50772 为 P18·GM 提示词正向化（用户 m04975 批准）之后的现盘值
//   （此前 50503 为 P12·S4 行尾归一（42 裸 LF → CRLF）之后的现盘值）。
  //   断言条数不变（3 条），只换比较对象。
  //   P30 重记（gamestate 旧记录早于 RN 仓首次提交；prompt_builder 因 P26/P27/P28 改动而变）
  var BASE = [
    ['engine/core/gamestate.js', 10142, 'B8D49056F2DD4BD692CA5802434A324D'],
    ['engine/core/prompt_builder.js', 51020, '0AB162A92D1BBBCF1C273C369339C567'],
    ['engine/info_feed.js', 40628, 'B4533EC5ED9249BE1AA3C46CACF1DF22']
  ];
  BASE.forEach(function (b) {
    var p = path.join(root, b[0]);
    check('I7 RN 本仓只读基线未变 ' + b[0] + '（' + fs.statSync(p).size + ' B / ' + md5(p) + '）',
      fs.statSync(p).size === b[1] && md5(p) === b[2]);
  });
  // P12·S1：参考件本仓化（方案 A，用户批准）。
  //   RN 仓有的 engine/web_search.js 改指本仓；
  //   桌面独有件 engine/editor.js（RN 实测不存在，RN 是 engine/num_editor.js + engine/wb/* 结构）
  //   不参与 red —— 该槽位改锁 RN 本仓移植产物 engine/num_editor.js（条数不变，只换比较对象）。
  var REF = [
    ['engine/web_search.js', 11903, 'D769A793DE3484CCED48AAA588299D2B'],
    ['engine/num_editor.js', 11458, '01E7BED6AA56DA94FDC3CACFD89C9968']
  ];
  REF.forEach(function (b) {
    var p = path.join(root, b[0]);
    check('I8 RN 本仓参考件只读未变 ' + b[0] + '（' + fs.statSync(p).size + ' B / ' + md5(p) + '）',
      fs.statSync(p).size === b[1] && md5(p) === b[2]);
  });
  // 桌面独有件软提示：刻意的跨仓参考，不参与断言
  [['engine/editor.js'], ['engine/web_search.js']].forEach(function (b) {
    var dp = path.join(DESK, b[0]);
    console.log('  [软提示·桌面] ' + b[0] + ' 现值：' + (fs.existsSync(dp) ? (fs.statSync(dp).size + ' B / ' + md5(dp)) : '（不存在）'));
  });
}

// ============ J 组：真机只读 window 复现（RN setUpGlobals.js writable:false）============
// 真机崩溃取证：BOOTSTRAP_FAIL: NumEditor :: Cannot assign to read-only property 'window'
// （RN Libraries/Core/setUpGlobals.js:20 以 writable:false 定义 window）。
// 本组把同一前置态在 Node 里复现，断言 num_editor.js 仍能装载两模板。

function runReadonlyWindow() {
  var p = path.join(root, 'engine', 'num_editor.js');
  var desc = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: false });
  var threw = null;
  try {
    // 连模板一起清缓存，让模板顶层 window.TEMPLATE_* 赋值真的重跑一次
    [path.join(root, 'engine', 'num_editor.js'),
     path.join(root, 'templates', 'number.js'),
     path.join(root, 'templates', 'relation.js')].forEach(function (f) {
      delete require.cache[require.resolve(f)];
    });
    delete globalThis.TEMPLATE_NUMBER;
    delete globalThis.TEMPLATE_RELATION;
    require(p);
  } catch (e) { threw = e && e.message; }
  var tn = globalThis.TEMPLATE_NUMBER, tr = globalThis.TEMPLATE_RELATION;
  check('J1 只读 window 下 num_editor 可装载（threw=' + threw + '）', threw === null);
  check('J2 只读 window 下两模板仍装载成功（gauge/relation）',
    !!tn && tn.type === 'gauge' && !!tr && tr.type === 'relation');
  if (desc) Object.defineProperty(globalThis, 'window', desc); else delete globalThis.window;
}

// ================= 出口 =================

try {
  runNE();
  runSource();
  runComponent();
  runReadonlyWindow();
  console.log('NUM_EDITOR_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
} catch (e) {
  console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
  console.log('NUM_EDITOR_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(1);
}

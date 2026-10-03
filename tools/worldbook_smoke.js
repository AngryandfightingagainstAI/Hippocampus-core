// ============================================================
// P2·S3 · 世界书 smoke（cwd 必须是 RN 仓根：node tools/worldbook_smoke.js）
// 覆盖：
//   A 模块形态（13 文件可 require / 纯逻辑零 DOM / WB 工具函数）
//   B..M 12 个编辑器数据往返（改内存 → save 落卡 → WB.load 读回 → 字段相等）
//   N 空卡带默认值（无 worldbook 字段时各编辑器给出桌面默认结构）
//   O 非法输入不抛（mapNodes 畸形 / outputs 垃圾 / worldSetting 迁移）
//   P 关键纯逻辑（map _repairData 5 条 / worldSetting migrate / typeLabel
//     / timeline 分隔符 / outputs save 自动补 id / currency rate 数值化）
//   Q 桌面参考件只读未变（worldbook 13 文件 + engine/editor.js + 两锁定基线）
//   R B 类组件真落地（容器 + 12 子编辑器：在仓 / 导出名 / require 数据层 /
//     babel 编译 / 零 DOM / 非空壳 / 子页清单逐字 / 接线 + PLACEHOLDER 清零）
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

// ================= 内存 harness（同 num_editor_smoke.js:38-62）=================

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
    cardId: 'demo_wb',
    cardName: '世界书测试卡带',
    game: { title: '世界书测试' },
    hud: [], sidebar: [],
    panels: [
      { id: 'attr', num: 2, name: '属性', entries: [] },
      { id: 'fame', num: 3, name: '名望', entries: [] },
      { id: 'social', num: 4, name: '社交', entries: [] },
      { id: 'world', num: 5, name: '世界', entries: [] }
    ],
    attributes: [],
    worldbook: {
      worldSetting: { existence: { has: [], hasNot: [] }, eraProducts: [] },
      maps: [], mapNodes: {},
      timeline: { official: [], fanFuture: [], playerLine: [] },
      npcs: [], factions: [], items: [], skills: [], shops: [],
      currency: { currencies: [], allowBarter: false, allowSell: false },
      hasRaces: false, races: [], occupations: [],
      outputs: null
    }
  };
}

// 空卡带（无 worldbook 字段）
function bareCard() {
  return { schemaVersion: 1, cardId: 'demo_bare', cardName: '空卡带', game: { title: '空' },
    hud: [], sidebar: [], panels: [], attributes: [] };
}

var WB, Storage;
var mods = {};

function setup() {
  Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  globalThis.Storage = Storage;
  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  globalThis.CardValidator = require(path.join(root, 'engine', 'core', 'card_validator.js'));
  globalThis.CARDS = { demo_wb: fixtureCard(), demo_bare: bareCard() };

  WB = require(path.join(root, 'engine', 'wb_common.js'));
  globalThis.WB = WB;
  mods.NPC = require(path.join(root, 'engine', 'wb', 'npc.js'));
  mods.Faction = require(path.join(root, 'engine', 'wb', 'faction.js'));
  mods.Item = require(path.join(root, 'engine', 'wb', 'item.js'));
  mods.Skill = require(path.join(root, 'engine', 'wb', 'skill.js'));
  mods.Race = require(path.join(root, 'engine', 'wb', 'race.js'));
  mods.Occupation = require(path.join(root, 'engine', 'wb', 'occupation.js'));
  mods.Shop = require(path.join(root, 'engine', 'wb', 'shop.js'));
  mods.Currency = require(path.join(root, 'engine', 'wb', 'currency.js'));
  mods.Timeline = require(path.join(root, 'engine', 'wb', 'timeline.js'));
  mods.Outputs = require(path.join(root, 'engine', 'wb', 'outputs.js'));
  mods.WorldSetting = require(path.join(root, 'engine', 'wb', 'world_setting.js'));
  mods.Map = require(path.join(root, 'engine', 'wb', 'map.js'));
}

function teardown() {
  delete globalThis.CARDS;
  delete globalThis.VFS;
  delete globalThis.StorageAdapter;
  delete globalThis.localStorage;
  delete globalThis.CardValidator;
  delete globalThis.Storage;
  delete globalThis.WB;
}

// ================= A 模块形态 =================

function runA() {
  var names = ['NPC', 'Faction', 'Item', 'Skill', 'Race', 'Occupation', 'Shop', 'Currency', 'Timeline', 'Outputs', 'WorldSetting', 'Map'];
  names.forEach(function (n) { check('A1 模块已装载 ' + n, !!mods[n] && typeof mods[n].init === 'function'); });
  eq('A2 WB.esc 转义 &', WB.esc('a&b'), 'a&amp;b');
  eq('A3 WB.esc null → 空串', WB.esc(null), '');
  check('A4 WB.uid 前缀形态', /^npc_\d+_\d+$/.test(WB.uid('npc')));
  check('A5 WB.DirtyGuard.mark/clear', (function () {
    WB.DirtyGuard.mark('X'); var a = WB.DirtyGuard._dirtyMap.X;
    WB.DirtyGuard.clear('X'); var b = WB.DirtyGuard._dirtyMap.X;
    return a === true && b === false;
  })());
  // 13 个引擎文件不得含 DOM 渲染调用（任务书 S3：HTML 生成器不搬）
  var files = ['wb_common.js', 'wb/npc.js', 'wb/faction.js', 'wb/item.js', 'wb/skill.js', 'wb/race.js',
    'wb/occupation.js', 'wb/shop.js', 'wb/currency.js', 'wb/timeline.js', 'wb/outputs.js',
    'wb/world_setting.js', 'wb/map.js'];
  var domHits = [];
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(root, 'engine', f), 'utf8');
    if (/document\.(getElementById|querySelector|createElement|head)/.test(src)) domHits.push(f + ':document');
    if (/\.innerHTML\s*=/.test(src)) domHits.push(f + ':innerHTML');
    if (/\bWB\.(row|input|textarea|number|checkbox|msg|toolbar|listItem)\s*=/.test(src)) domHits.push(f + ':html-gen');
  });
  eq('A6 引擎层零 DOM / 零 HTML 生成器', domHits.join(','), '');
}

// ================= B NPC =================

function runB() {
  var M = mods.NPC;
  M.init('demo_wb');
  var i = M.addNpc();
  M.set(i, 'name', '汤姆');
  M.set(i, 'weight', 9);
  M.setList(i, 'keywords', '魔法, 魁地奇');
  M.addFaction(i); M.setFaction(i, 0, 'factionId', 'f1'); M.setFaction(i, 0, 'relation', '正式');
  M.addRelation(i); M.setRelation(i, 0, 'targetId', 'npc_2'); M.setRelation(i, 0, 'relation', '挚友');
  M.addPeriod(i); M.setPeriod(i, 0, 'periodName', '少年期'); M.setPeriodRange(i, 0, 0, '1991'); M.setPeriodRange(i, 0, 1, '1997');
  var r = M.save();
  eq('B1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'npcs', []);
  eq('B2 npcs 往返 name', back[0].name, '汤姆');
  eq('B3 npcs 往返 weight', back[0].weight, 9);
  eq('B4 npcs 往返 keywords', JSON.stringify(back[0].keywords), JSON.stringify(['魔法', '魁地奇']));
  eq('B5 npcs 往返 factions[0].factionId', back[0].factions[0].factionId, 'f1');
  eq('B6 npcs 往返 relations[0].relation', back[0].relations[0].relation, '挚友');
  eq('B7 npcs 往返 periods[0].timeRange', JSON.stringify(back[0].periods[0].timeRange), JSON.stringify([1991, 1997]));
  // setPeriodRange 空串 → null
  M.setPeriodRange(i, 0, 0, ''); eq('B8 setPeriodRange 空串 → null', M._data[i].periods[0].timeRange[0], null);
  // delNpc 立即持久化
  var before = WB.load('demo_wb', 'npcs', []).length;
  M.delNpc(0);
  var after = WB.load('demo_wb', 'npcs', []).length;
  eq('B9 delNpc 立即落卡（' + before + '→' + after + '）', after, before - 1);
  eq('B10 getNpcOptions 形态', M.getNpcOptions().length, M._data.length);
}

// ================= C Faction =================

function runC() {
  var M = mods.Faction;
  M.init('demo_wb');
  var i = M.addFaction();
  M.set(i, 'name', '银月学院');
  M.set(i, 'hasHiddenSide', true);
  M.setSub(i, 'publicSide', 'name', '银月学院'); M.setSub(i, 'publicSide', 'what', '教魔法');
  M.setSubList(i, 'publicSide', 'resources', '金库, 藏书阁');
  M.setSub(i, 'hiddenSide', 'name', '影月会');
  M.set(i, 'mainFace', '两面并用');
  M.addRelation(i); M.setRelation(i, 0, 'targetId', 'f2'); M.setRelation(i, 0, 'type', '敌对');
  var r = M.save();
  eq('C1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'factions', []);
  eq('C2 factions 往返 name', back[0].name, '银月学院');
  eq('C3 factions 往返 hasHiddenSide', back[0].hasHiddenSide, true);
  eq('C4 factions 往返 publicSide.what', back[0].publicSide.what, '教魔法');
  eq('C5 factions 往返 publicSide.resources', JSON.stringify(back[0].publicSide.resources), JSON.stringify(['金库', '藏书阁']));
  eq('C6 factions 往返 hiddenSide.name', back[0].hiddenSide.name, '影月会');
  eq('C7 factions 往返 relations[0].type', back[0].relations[0].type, '敌对');
  eq('C8 getFactionOptions 形态', M.getFactionOptions()[0].name, '银月学院');
}

// ================= D Item =================

function runD() {
  var M = mods.Item;
  M.init('demo_wb');
  var i = M.add();
  M.set(i, 'name', '觉明水'); M.set(i, 'category', '食物'); M.set(i, 'effects', '回蓝');
  M.setList(i, 'linkedMaps', 'n1, n2'); M.setList(i, 'tags', '消耗品');
  var r = M.save();
  eq('D1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'items', []);
  eq('D2 items 往返 name', back[0].name, '觉明水');
  eq('D3 items 往返 category', back[0].category, '食物');
  eq('D4 items 往返 linkedMaps', JSON.stringify(back[0].linkedMaps), JSON.stringify(['n1', 'n2']));
  eq('D5 items source 默认 author', back[0].source, 'author');
  eq('D6 CATS 六分类', M.CATS.join(','), '武器,食物,家具,电器,衣物,其他');
}

// ================= E Skill =================

function runE() {
  var M = mods.Skill;
  M.init('demo_wb');
  var i = M.add();
  M.set(i, 'name', '呼神护卫'); M.set(i, 'hasSideEffect', true); M.set(i, 'sideEffect', '耗蓝');
  M.set(i, 'hasLevels', true);
  M.addLevel(i); M.setLevel(i, 0, 'level', '2'); M.setLevel(i, 0, 'condition', '需练习');
  M.setLevelReq(i, 0, 'items', '魔杖, 药水'); M.setLevelReq(i, 0, 'exp', '100');
  var r = M.save();
  eq('E1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'skills', []);
  eq('E2 skills 往返 name', back[0].name, '呼神护卫');
  eq('E3 skills 往返 sideEffect', back[0].sideEffect, '耗蓝');
  eq('E4 skills 往返 levels[0].level 数值化', back[0].levels[0].level, 2);
  eq('E5 skills 往返 requires.items', JSON.stringify(back[0].levels[0].requires.items), JSON.stringify(['魔杖', '药水']));
  eq('E6 skills 往返 requires.exp', back[0].levels[0].requires.exp, 100);
}

// ================= F Race =================

function runF() {
  var M = mods.Race;
  M.init('demo_wb');
  M.toggleRaces(true);
  var i = M.add();
  M.set(i, 'name', '精灵'); M.set(i, 'npcTendency', '喜欢'); M.set(i, 'socialType', '群居'); M.set(i, 'rarity', '常见');
  M.setList(i, 'talents', '夜视, 长寿');
  var r = M.save();
  eq('F1 save ok', r.ok, true);
  eq('F2 hasRaces 往返', WB.load('demo_wb', 'hasRaces', false), true);
  var back = WB.load('demo_wb', 'races', []);
  eq('F3 races 往返 name', back[0].name, '精灵');
  eq('F4 races 往返 npcTendency', back[0].npcTendency, '喜欢');
  eq('F5 races 往返 talents', JSON.stringify(back[0].talents), JSON.stringify(['夜视', '长寿']));
  M.toggleRaces(false); M.save();
  eq('F6 toggleRaces(false) 往返', WB.load('demo_wb', 'hasRaces', true), false);
}

// ================= G Occupation =================

function runG() {
  var M = mods.Occupation;
  M.init('demo_wb');
  var i = M.add();
  M.set(i, 'name', '铸剑师'); M.set(i, 'desc', '打造兵器'); M.set(i, 'officiallyKnown', true); M.set(i, 'workTime', '固定');
  M.setList(i, 'tags', '工匠');
  var r = M.save();
  eq('G1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'occupations', []);
  eq('G2 occupations 往返 name', back[0].name, '铸剑师');
  eq('G3 occupations 往返 officiallyKnown', back[0].officiallyKnown, true);
  eq('G4 occupations 往返 workTime', back[0].workTime, '固定');
  eq('G5 occupations 往返 tags', JSON.stringify(back[0].tags), JSON.stringify(['工匠']));
}

// ================= H Shop =================

function runH() {
  var M = mods.Shop;
  M.init('demo_wb');
  var i = M.add();
  M.set(i, 'name', '破釜酒吧'); M.set(i, 'refresh', 'daily');
  M.addItem(i); M.setItem(i, 0, 'name', '黄油啤酒'); M.setItem(i, 0, 'price', '12'); M.setItem(i, 0, 'stock', '-1');
  M.addItem(i); M.setItem(i, 1, 'name', '南瓜汁');
  var r = M.save();
  eq('H1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'shops', []);
  eq('H2 shops 往返 name', back[0].name, '破釜酒吧');
  eq('H3 shops 往返 refresh', back[0].refresh, 'daily');
  eq('H4 shops 往返 items[0].price 数值化', back[0].items[0].price, 12);
  eq('H5 shops 往返 items[1].name', back[0].items[1].name, '南瓜汁');
  eq('H6 新商品默认 price=10 stock=-1 category=common', (function () {
    M.addItem(i); var it = M._data[i].items[2];
    return it.price === 10 && it.stock === -1 && it.category === 'common';
  })(), true);
  M.delItem(i, 2);
}

// ================= I Currency =================

function runI() {
  var M = mods.Currency;
  M.init('demo_wb');
  M.addCurrency(); M.setCurrency(0, 'name', '加隆'); M.setCurrency(0, 'symbol', 'G'); M.setCurrency(0, 'isMain', true);
  M.addRate(); M.setRate(0, 'from', '加隆'); M.setRate(0, 'to', '银可西'); M.setRate(0, 'rate', '17');
  M.set('purchasingPower', '1 加隆 ≈ 一顿丰盛晚餐');
  M.set('allowBarter', true);
  var r = M.save();
  eq('I1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'currency', null);
  eq('I2 currency 往返 currencies[0].name', back.currencies[0].name, '加隆');
  eq('I3 currency 往返 isMain', back.currencies[0].isMain, true);
  eq('I4 currency 往返 exchangeRates[0].rate 数值化', back.exchangeRates[0].rate, 17);
  eq('I5 currency 往返 purchasingPower', back.purchasingPower, '1 加隆 ≈ 一顿丰盛晚餐');
  eq('I6 currency 往返 allowBarter', back.allowBarter, true);
}

// ================= J Timeline =================

function runJ() {
  var M = mods.Timeline;
  M.init('demo_wb');
  M.addItem('official'); M.setItem('official', 0, 'time', '主线前 3 年'); M.setItem('official', 0, 'event', '大迁徙');
  M.setMulti('official', 0, 'impactFactions', '银月学院; 影月会');
  M.setMulti('official', 0, 'impactNPCs', '汤姆; 杰瑞');
  M.setMulti('official', 0, 'tags', '历史, 战争');
  M.addItem('playerLine'); M.setItem('playerLine', 0, 'event', '玩家入学');
  var r = M.save();
  eq('J1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'timeline', null);
  eq('J2 timeline.official 往返 event', back.official[0].event, '大迁徙');
  eq('J3 impactFactions 按 ; 分隔', JSON.stringify(back.official[0].impactFactions), JSON.stringify(['银月学院', '影月会']));
  eq('J4 impactNPCs 按 ; 分隔', JSON.stringify(back.official[0].impactNPCs), JSON.stringify(['汤姆', '杰瑞']));
  eq('J5 tags 按 , 分隔', JSON.stringify(back.official[0].tags), JSON.stringify(['历史', '战争']));
  eq('J6 playerLine 往返 event', back.playerLine[0].event, '玩家入学');
  eq('J7 三分段并存', Array.isArray(back.fanFuture), true);
}

// ================= K Outputs =================

function runK() {
  var M = mods.Outputs;
  M.init('demo_wb');
  M.addType(); M.setType(0, 'name', '著作'); M.setType(0, 'icon', 'book');
  M.addAudience(); M.setAudience(0, 'name', '文人圈'); M.setAudience(0, 'weight', '8');
  M.addEvent(); M.setEvent(0, 'name', '被评论家批评'); M.setEventHint(0, '文人圈哗然');
  M.setWhenType('fixed-years'); M.setWhen('years', '3');
  M.addAffect(); M.setAffect(0, 'statKey', 'fame'); M.setAffect(0, 'delta', '5');
  M.set('fermentInterval', 'month');
  var r = M.save();
  eq('K1 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'outputs', null);
  eq('K2 outputs 往返 types[0].name', back.types[0].name, '著作');
  eq('K3 outputs 往返 audiences[0].weight 数值化', back.audiences[0].weight, 8);
  eq('K4 outputs 往返 eventPool[0].effect.promptHint', back.eventPool[0].effect.promptHint, '文人圈哗然');
  eq('K5 outputs 往返 settleRules.when.years', back.settleRules.when.years, 3);
  eq('K6 outputs 往返 affects[0].delta', back.settleRules.affects[0].delta, 5);
  eq('K7 outputs 往返 fermentInterval', back.fermentInterval, 'month');
  check('K8 save 自动补 id（types/audiences/eventPool）',
    back.types[0].id && back.audiences[0].id && back.eventPool[0].id);
}

// ================= L WorldSetting =================

function runL() {
  var M = mods.WorldSetting;
  // 必填缺失 → 明确 reason
  M.init('demo_wb');
  M.set('worldName', '星轨大陆');
  var r0 = M.save();
  eq('L1 缺必填 → ok=false', r0.ok, false);
  eq('L2 缺必填 reason 逐字', r0.reason, '请填写：世界名、主要舞台、一句话总览');
  M.set('mainStage', '银月城'); M.set('description', '星辰共鸣的世界');
  M.set('powerSystem', '灵力'); M.set('powerMix', true); M.set('powerCeiling', '挪动山岳');
  M.addCounter(); M.setCounter(0, '冰系克制火系');
  M.addOfficial(); M.setOfficial(0, 'name', '银月王国'); M.setOfficial(0, 'stance', '扶持');
  M.set('militaryUse.used', true); M.set('militaryUse.note', '组建法师团');
  M.addReligion(); M.setReligion(0, 'name', '星辰教'); M.setReligion(0, 'faith', '星辰');
  M.set('racialDiscrimination.has', true); M.set('racialDiscrimination.against', '暗影系');
  M.addExistence('has'); M.setExistence('has', 0, '魔法'); M.addExistence('hasNot'); M.setExistence('hasNot', 0, '电力');
  M.addEraSeg(); M.setEraSeg(0, 'from', '1000'); M.setEraSeg(0, 'to', '1200'); M.setEraList(0, 'has', '蒸汽机, 马车');
  var r = M.save();
  eq('L3 save ok', r.ok, true);
  var back = WB.load('demo_wb', 'worldSetting', null);
  eq('L4 worldSetting 往返 worldName', back.worldName, '星轨大陆');
  eq('L5 worldSetting 往返 militaryUse.used（点路径）', back.militaryUse.used, true);
  eq('L6 worldSetting 往返 officials[0].stance', back.officials[0].stance, '扶持');
  eq('L7 worldSetting 往返 existence.has', JSON.stringify(back.existence.has), JSON.stringify(['魔法']));
  eq('L8 worldSetting 往返 eraProducts[0].from 数值化', back.eraProducts[0].from, 1000);
  eq('L9 worldSetting 往返 eraProducts[0].has', JSON.stringify(back.eraProducts[0].has), JSON.stringify(['蒸汽机', '马车']));
  // addReligionToFactions 真落 factions 段
  var r2 = M.addReligionToFactions(0);
  eq('L10 addReligionToFactions ok', r2.ok, true);
  var facs = WB.load('demo_wb', 'factions', []);
  var hit = facs.filter(function (f) { return f.source === 'worldSetting'; })[0];
  eq('L11 宗教已进 factions（name）', hit && hit.name, '星辰教');
  eq('L12 宗教 sourceRef 绑定', hit && hit.sourceRef, M._data.religions[0].id);
  var r3 = M.addReligionToFactions(0);
  eq('L13 重复添加被拦 reason', r3.reason, '这个宗教已经添加过了');
}

// ================= M Map =================

function runM() {
  var M = mods.Map;
  M.init('demo_wb');
  var t = M.addTree('A 号宇宙');
  eq('M1 addTree ok', t.ok, true);
  var c = M.addChild('北境');
  eq('M2 addChild ok', c.ok, true);
  M.gotoNode(c.id);
  M.setNode('name', '北境大陆'); M.setNode('type', 'continent'); M.setNode('desc', '寒冷');
  M.setNodeTags('冰原, 极光'); M.setNodeLinkedNPCs('npc_1'); M.setNodeLinkedItems('item_1');
  M.addAction(); M.setAction(0, 'label', '挖冰'); M.setActionCost(0, 'money', '5'); M.setActionGives(0, 'items', 'ice_1');
  M.addThen(0); M.setThen(0, 0, 'label', '现在用'); M.setThen(0, 0, 'action', 'drink_now');
  var r = M.save();
  eq('M3 save ok', r.ok, true);
  var nodes = WB.load('demo_wb', 'mapNodes', {});
  var n = nodes[c.id];
  eq('M4 mapNodes 往返 name', n.name, '北境大陆');
  eq('M5 mapNodes 往返 type', n.type, 'continent');
  eq('M6 mapNodes 往返 tags', JSON.stringify(n.tags), JSON.stringify(['冰原', '极光']));
  eq('M7 mapNodes 往返 actions[0].label', n.actions[0].label, '挖冰');
  eq('M8 mapNodes 往返 cost.money 数值化', n.actions[0].cost.money, 5);
  eq('M9 mapNodes 往返 gives.items', JSON.stringify(n.actions[0].gives.items), JSON.stringify(['ice_1']));
  eq('M10 mapNodes 往返 then[0].action', n.actions[0].then[0].action, 'drink_now');
  var maps = WB.load('demo_wb', 'maps', []);
  eq('M11 maps 往返 name', maps[0].name, 'A 号宇宙');
  eq('M12 maps.rootId 与节点一致', maps[0].rootId, t.id);
  eq('M13 breadcrumb 深度=2', M.breadcrumb().length, 2);
  eq('M14 typeLabel 映射', M.typeLabel('continent'), '大陆');
  eq('M15 TYPE_OPTIONS 15 项', M.TYPE_OPTIONS.length, 15);
  // 删子树
  var before = Object.keys(M.data().mapNodes).length;
  M.delChild(c.id);
  eq('M16 delChild 级联删除（' + before + '→' + Object.keys(M.data().mapNodes).length + '）',
    Object.keys(M.data().mapNodes).length, before - 1);
  M.delTree();
  eq('M17 delTree 后 maps 空', M.data().maps.length, 0);
}

// ================= N 空卡带默认值 =================

function runN() {
  var cases = [
    ['NPC', function (M) { M.init('demo_bare'); return M._data.length === 0; }],
    ['Faction', function (M) { M.init('demo_bare'); return M._data.length === 0; }],
    ['Item', function (M) { M.init('demo_bare'); return M._data.length === 0; }],
    ['Skill', function (M) { M.init('demo_bare'); return M._data.length === 0; }],
    ['Race', function (M) { M.init('demo_bare'); return M._data.length === 0 && M.hasRaces() === false; }],
    ['Occupation', function (M) { M.init('demo_bare'); return M._data.length === 0; }],
    ['Shop', function (M) { M.init('demo_bare'); return M._data.length === 0; }],
    ['Currency', function (M) { var d = M.data(); M.init('demo_bare'); d = M.data(); return d.currencies.length === 0 && d.allowBarter === false && d.allowSell === false; }],
    ['Timeline', function (M) { M.init('demo_bare'); var d = M.data(); return d.official.length === 0 && d.fanFuture.length === 0 && d.playerLine.length === 0; }],
    ['Outputs', function (M) { M.init('demo_bare'); var d = M.data(); return d.fermentInterval === 'year' && d.settleRules.when.type === 'progress-full' && d.types.length === 0; }],
    ['WorldSetting', function (M) { M.init('demo_bare'); var d = M.data(); return d.worldName === '' && d.existence.has.length === 0 && d.eraProducts.length === 0; }],
    ['Map', function (M) { M.init('demo_bare'); var d = M.data(); return d.maps.length === 0 && Object.keys(d.mapNodes).length === 0; }]
  ];
  cases.forEach(function (c) {
    check('N 空卡带默认值 ' + c[0], c[1](mods[c[0]]));
  });
}

// ================= O 非法输入不抛 =================

function runO() {
  // mapNodes 是数组（畸形）→ repairData 转对象且记日志
  var idx = jsonIndex();
  idx.demo_bad = {
    schemaVersion: 1, cardId: 'demo_bad', cardName: '畸形卡', game: { title: 'x' },
    hud: [], sidebar: [], panels: [], attributes: [],
    worldbook: {
      maps: [{ rootId: 'ghost', name: '幽灵树' }],
      mapNodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parentId: 'zzz' }]
    }
  };
  var threw1 = false;
  try { mods.Map.init('demo_bad'); } catch (e) { threw1 = true; }
  check('O1 mapNodes 畸形不抛', !threw1);
  check('O2 mapNodes 数组→对象 + 孤儿 parentId 清理', (function () {
    var d = mods.Map.data();
    return !Array.isArray(d.mapNodes) && d.mapNodes.b && d.mapNodes.b.parentId === null;
  })());
  check('O3 repairLog 有记录', mods.Map.repairLog().length > 0);
  check('O4 幽灵 rootId 已重建', (function () {
    var d = mods.Map.data();
    return d.maps.length === 1 && !!d.mapNodes[d.maps[0].rootId];
  })());

  // outputs 垃圾数据 → _empty 兜底
  idx.demo_junk = {
    schemaVersion: 1, cardId: 'demo_junk', cardName: '垃圾卡', game: { title: 'x' },
    hud: [], sidebar: [], panels: [], attributes: [],
    worldbook: { outputs: 'not-an-object' }
  };
  var threw2 = false;
  try { mods.Outputs.init('demo_junk'); } catch (e) { threw2 = true; }
  check('O5 outputs 垃圾输入不抛', !threw2);
  eq('O6 outputs 垃圾输入回落默认 fermentInterval', mods.Outputs.data().fermentInterval, 'year');

  // worldSetting 字符串垃圾 → migrate 兜底
  idx.demo_wsjunk = {
    schemaVersion: 1, cardId: 'demo_wsjunk', cardName: 'w', game: { title: 'x' },
    hud: [], sidebar: [], panels: [], attributes: [],
    worldbook: { worldSetting: { existence: 'bad', eraProducts: 'bad', militaryUse: null, officialStance: '旧态度' } }
  };
  var threw3 = false;
  try { mods.WorldSetting.init('demo_wsjunk'); } catch (e) { threw3 = true; }
  check('O7 worldSetting 畸形不抛', !threw3);
  eq('O8 migrate 旧 officialStance → officials', mods.WorldSetting.data().officials.length, 1);
  eq('O9 migrate existence 兜底', Array.isArray(mods.WorldSetting.data().existence.has), true);

  // 卡带不存在 → 明确 reason，不抛
  check('O10 卡带不存在 init 不抛 + reason', (function () {
    try {
      var r = mods.Map.init('no_such_card');
      return r.ok === false && r.reason === '卡带不存在';
    } catch (e) { return false; }
  })());
}

// 简易索引：给 Storage.getAllCards 追加一张卡（借 CARDS 合并口径）
function jsonIndex() { return globalThis.CARDS; }

// ================= P WB 工具层 =================

function runP() {
  eq('P1 WB.load 缺字段 → 默认值', WB.load('demo_wb', 'not_exist_field', 'DEF'), 'DEF');
  eq('P2 WB.load 深拷贝（改动不回写卡带）', (function () {
    var a = WB.load('demo_wb', 'worldSetting', null);
    a.worldName = '被改了';
    var b = WB.load('demo_wb', 'worldSetting', null);
    return b.worldName !== '被改了';
  })(), true);
  eq('P3 WB.persist 对象形（多字段一次写）', (function () {
    WB.persist('demo_wb', { hasRaces: true, races: [{ id: 'r1', name: 'X' }] });
    return WB.load('demo_wb', 'hasRaces', false) === true && WB.load('demo_wb', 'races', [])[0].name === 'X';
  })(), true);
  eq('P4 WB.persist 卡带不存在 → false', WB.persist('no_such_card', 'x', 1), false);
  check('P5 DirtyGuard.checkAny 无脏 → true', (function () {
    return WB.DirtyGuard.checkAny() instanceof Promise;
  })(), true);
}

// ================= Q RN 本仓参考件（P12·S1 方案 A 本仓化） =================

function runQ() {
  // P12·S1：REF/LOCK 比较对象由桌面仓改为 RN 本仓（path.join(root, …)），基线值取 RN 现盘实测。
  //   此改动源于 P11 复核发现的跨仓耦合，方案 A（用户批准）。断言条数不变，只换比较对象。
  //   RN 结构：engine/wb_common.js + engine/wb/{npc,faction,item,skill,race,occupation,shop,
  //   currency,timeline,outputs,world_setting,map}.js，对应桌面 worldbook/wb_common.js +
  //   worldbook/*_editor.js（两仓非逐字节同源：桌面件为含 DOM 的完整编辑器，RN 件为纯逻辑数据层）。
  //   桌面独有件 engine/editor.js（RN 实测不存在）不参与 red —— 该槽位改锁 RN 本仓移植产物
  //   engine/num_editor.js。桌面同名/独有件只打软提示。
  var REF = [
    ['engine/wb_common.js', 3587, 'EB5BC8F4DFA284CC33315B3BBACEECAD'],
    ['engine/wb/npc.js', 4600, '734B19BB8AD27B4652DD9FD7CE18B270'],
    ['engine/wb/faction.js', 3425, '8287CA7F9C56EE56D14F0D87832F08CA'],
    ['engine/wb/item.js', 2173, '6995D33AC91854172A382D9FD6C87FF7'],
    ['engine/wb/skill.js', 2937, '17108CA22A613A459C315D5790E63A37'],
    ['engine/wb/race.js', 2671, 'C98A39BBA86D434F9BED1AB352373DFD'],
    ['engine/wb/occupation.js', 2152, 'C156E98D8F488220479EF3CAE5EE8A86'],
    ['engine/wb/shop.js', 2528, '7401F9D1C1DBC2A06922A2CEA7E8E602'],
    ['engine/wb/currency.js', 2182, 'A926D97BB061C8BDBF571150E1CCC6DD'],
    ['engine/wb/timeline.js', 2286, 'A64C1B87BD53337F4973C84A6048C16D'],
    ['engine/wb/outputs.js', 4749, '05F63B7990E4ED2A26C4E8EBD76CF518'],
    ['engine/wb/world_setting.js', 8647, 'D0869881B785B3F935935AA878454C62'],
    ['engine/wb/map.js', 12226, '6C601F5C3393385B3C993B495721F2E9'],
    ['engine/num_editor.js', 11458, '01E7BED6AA56DA94FDC3CACFD89C9968'],
    ['engine/web_search.js', 12200, '8A06F6976DC21798B142BF8C82834587']
  ];
  REF.forEach(function (b) {
    var p = path.join(root, b[0]);
    check('Q RN 本仓参考件只读未变 ' + b[0] + '（' + fs.statSync(p).size + ' B / ' + md5(p) + '）',
      fs.statSync(p).size === b[1] && md5(p) === b[2]);
  });
  // 三锁定基线（RN 本仓；prompt_builder 50772 为 P18·GM 提示词正向化（用户 m04975 批准）后的现盘值）
  var LOCK = [
    ['engine/core/gamestate.js', 10383, 'DE10B95F1849A894ADC59AD5F2359A14'],
    ['engine/core/prompt_builder.js', 50772, '59DB55795079CA1D52551228D2E143F6'],
    ['engine/info_feed.js', 40628, 'B4533EC5ED9249BE1AA3C46CACF1DF22']
  ];
  LOCK.forEach(function (b) {
    var p = path.join(root, b[0]);
    check('Q RN 本仓锁定基线未变 ' + b[0] + '（' + fs.statSync(p).size + ' B / ' + md5(p) + '）',
      fs.statSync(p).size === b[1] && md5(p) === b[2]);
  });
  var wbTotal = 0;
  ['engine/wb_common.js'].concat(fs.readdirSync(path.join(root, 'engine', 'wb')).map(function (f) { return 'engine/wb/' + f; }))
    .forEach(function (rel) { wbTotal += fs.statSync(path.join(root, rel)).size; });
  eq('Q RN engine/wb_common.js + engine/wb/*.js 13 文件合计字节', wbTotal, 54163);
  // 桌面独有件/同名件软提示：刻意的跨仓参考，不参与断言
  ['worldbook/', 'engine/editor.js', 'engine/web_search.js'].forEach(function (rel) {
    var dp = path.join(DESK, rel);
    var val = fs.existsSync(dp)
      ? (fs.statSync(dp).isDirectory() ? (fs.readdirSync(dp).length + ' 文件') : (fs.statSync(dp).size + ' B / ' + md5(dp)))
      : '（不存在）';
    console.log('  [软提示·桌面] ' + rel + ' 现值：' + val);
  });
}

// ================= R B 类组件真落地（容器 + 12 子编辑器）=================

// 去注释后扫描，避免「注释里提到 innerHTML」被误判（红线：零 DOM 指代码层）
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');
}

// [文件名, 导出名, 对应数据层文件名]
var EDITORS = [
  ['worldSettingEditor.js', 'WorldSettingEditor', 'world_setting.js'],
  ['mapEditor.js', 'MapEditor', 'map.js'],
  ['timelineEditor.js', 'TimelineEditor', 'timeline.js'],
  ['npcEditor.js', 'NpcEditor', 'npc.js'],
  ['factionEditor.js', 'FactionEditor', 'faction.js'],
  ['itemEditor.js', 'ItemEditor', 'item.js'],
  ['skillEditor.js', 'SkillEditor', 'skill.js'],
  ['shopEditor.js', 'ShopEditor', 'shop.js'],
  ['currencyEditor.js', 'CurrencyEditor', 'currency.js'],
  ['raceEditor.js', 'RaceEditor', 'race.js'],
  ['occupationEditor.js', 'OccupationEditor', 'occupation.js'],
  ['outputsEditor.js', 'OutputsEditor', 'outputs.js']
];

function runR() {
  var WB_DIR = path.join(root, 'rn', 'screens', 'settings', 'worldbook');
  var TAB = path.join(root, 'rn', 'screens', 'settings', 'WorldBookTab.js');

  check('R0 容器 WorldBookTab.js 在仓', fs.existsSync(TAB));

  // R1 12 子编辑器在仓 + 导出名匹配
  var miss = [];
  EDITORS.forEach(function (e) {
    var p = path.join(WB_DIR, e[0]);
    if (!fs.existsSync(p)) { miss.push(e[0] + ':missing'); return; }
    var src = fs.readFileSync(p, 'utf8');
    if (src.indexOf('module.exports = { ' + e[1] + ': ' + e[1] + ' };') < 0) miss.push(e[0] + ':export');
  });
  eq('R1 12 子编辑器在仓且导出名匹配（缺：' + miss.join(',') + '）', miss.join(','), '');

  // R2 每个子编辑器 require 对应 engine/wb 数据层
  var noReq = [];
  EDITORS.forEach(function (e) {
    var src = fs.readFileSync(path.join(WB_DIR, e[0]), 'utf8');
    if (src.indexOf('engine/wb/' + e[2]) < 0) noReq.push(e[0]);
  });
  eq('R2 12 子编辑器均接数据层 engine/wb/*.js（缺：' + noReq.join(',') + '）', noReq.join(','), '');

  // R3 babel transform 全过（B 类语法真落地，非空壳文本）
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  var bFiles = [TAB].concat(EDITORS.map(function (e) { return path.join(WB_DIR, e[0]); }));
  var bFail = [];
  bFiles.forEach(function (p) {
    try {
      babel.transformFileSync(p, { cwd: root, configFile: path.join(root, 'babel.config.js') });
    } catch (err) { bFail.push(path.basename(p) + ':' + err.message); }
  });
  eq('R3 13 个 B 类文件 babel transform 全过（失败：' + bFail.join(' | ') + '）', bFail.join(','), '');

  // R4 零 DOM（去注释后扫描）
  var domHits = [];
  bFiles.forEach(function (p) {
    var src = stripComments(fs.readFileSync(p, 'utf8'));
    if (/document\.(getElementById|querySelector|createElement|head|body)/.test(src)) domHits.push(path.basename(p) + ':document');
    if (/\.innerHTML\s*=/.test(src)) domHits.push(path.basename(p) + ':innerHTML');
    if (/window\.document/.test(src)) domHits.push(path.basename(p) + ':window.document');
  });
  eq('R4 13 个 B 类文件零 DOM（命中：' + domHits.join(',') + '）', domHits.join(','), '');

  // R5 12 子编辑器非空壳（React.createElement 计数 >= 5）
  var thin = [];
  EDITORS.forEach(function (e) {
    var src = stripComments(fs.readFileSync(path.join(WB_DIR, e[0]), 'utf8'));
    var n = (src.match(/React\.createElement\(/g) || []).length;
    if (n < 5) thin.push(e[0] + ':' + n);
  });
  eq('R5 12 子编辑器非空壳（createElement>=5，低于阈值：' + thin.join(',') + '）', thin.join(','), '');

  // R6 子页清单 12 项，中文名与顺序逐字照桌面 ui_core.js:174-179
  var tabSrc = fs.readFileSync(TAB, 'utf8');
  var names = (tabSrc.match(/name: '([^']+)'/g) || []).map(function (s) { return s.replace(/^name: '/, '').replace(/'$/, ''); });
  var expectNames = ['世界设定', '地图', '时间线', 'NPC', '势力', '物品', '法术', '商店', '货币', '种族', '职业', '产出物'];
  eq('R6 WorldBookTab 子页 12 项中文名与顺序逐字照桌面（实取 ' + JSON.stringify(names) + '）',
    JSON.stringify(names), JSON.stringify(expectNames));

  // R7 P10·C1：死导出 PLACEHOLDER_TABS 已删（worldbook 于 P2+P3 轮实装，清单恒空）
  //   改指理由：原断言读该导出的「不含 worldbook」，删除后改为正向断言「导出不存在」。
  var Model = require(path.join(root, 'rn', 'settings_model.js'));
  eq('R7 死导出 PLACEHOLDER_TABS 已删（worldbook 已实装）',
    Model.PLACEHOLDER_TABS === undefined, true);

  // R8 SettingsScreen 接线（require + 分发分支）
  var ssSrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'SettingsScreen.js'), 'utf8');
  check('R8 SettingsScreen 接线（require + 分发 worldbook）',
    ssSrc.indexOf("require('./settings/WorldBookTab.js').WorldBookTab") >= 0 &&
    ssSrc.indexOf("if (id === 'worldbook') return React.createElement(WorldBookTab, null);") >= 0);

  // R9 13 个 B 类文件里所有相对 require 都能在磁盘解析（防路径层级写错）
  var badReq = [];
  bFiles.forEach(function (p) {
    var dir = path.dirname(p);
    var src = stripComments(fs.readFileSync(p, 'utf8'));
    var re = /require\(\s*'([^']+)'\s*\)/g, m;
    while ((m = re.exec(src)) !== null) {
      var req = m[1];
      if (req.charAt(0) !== '.') continue;
      var target = path.resolve(dir, req);
      if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
        badReq.push(path.basename(p) + ' -> ' + req);
      }
    }
  });
  eq('R9 13 个 B 类文件相对 require 均可解析（坏：' + badReq.join(' | ') + '）', badReq.join(','), '');
}

// ================= S 12 子编辑器真渲染（Node 内真跑组件函数，不是源码扫描）=================
// 真机事故（2026-09-30 14:53:26）：设置 → 08 世界书 → 点「NPC」子页 → 应用直接崩溃
//   logcat: JavascriptException: TypeError: Cannot read property 'map' of null
//           at NpcEditor → getNpcOptions（npc.js:27 this._data.map）
// 成因：组件在 useEffect（MOD.init）之前必先渲染一次，此刻 _data 仍为 null，
//       而 npc / faction 两个 getter 直接 map 未初始化数据。已按 shopEditor.js:62
//       / currencyEditor.js:50 同一道防线（未 init 即 return null）修复。
// 本组用 Module._load 钩子把 react / react-native / use_theme / controls /
// story_store 换成最小桩，把 12 个组件函数真跑一遍「未 init」与「已 init」两态：
//   修复前 S1 必红（npc / faction 抛错），这就是这条断言的存在理由。

var SKEY = {
  'worldSettingEditor.js': '世界名 *',
  'mapEditor.js': '保存地图',
  'timelineEditor.js': '保存时间线',
  'npcEditor.js': '姓名',
  'factionEditor.js': '势力名',
  'itemEditor.js': '物品名',
  'skillEditor.js': '技能名',
  'shopEditor.js': '商店名 *',
  'currencyEditor.js': '货币列表',
  'raceEditor.js': '种族名',
  'occupationEditor.js': '职业名',
  'outputsEditor.js': '产出物类型（types）'
};

function runS() {
  var Module = require('module');
  var origLoad = Module._load;

  var ReactStub = {
    createElement: function (type, props) {
      return { __el: true, type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) };
    },
    useState: function (init) { return [typeof init === 'function' ? init() : init, function () {}]; },
    useEffect: function () {}, useLayoutEffect: function () {},
    useRef: function (v) { return { current: v }; },
    useMemo: function (fn) { return fn(); }, useCallback: function (fn) { return fn; },
    Fragment: 'Fragment'
  };
  var RNStub = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
    TextInput: 'TextInput', Switch: 'Switch', Image: 'Image', Pressable: 'Pressable',
    StyleSheet: { create: function (o) { return o; }, absoluteFill: {}, flatten: function (o) { return o; } }
  };
  var TOKENS = { colors: {}, fontSizes: {}, radius: {}, spacing: {} };
  var ControlsStub = {};
  ['SetCard', 'SetRow', 'SetSwitchRow', 'SetSelect', 'SetStepper', 'SetChips',
    'SetTextInput', 'SetButton', 'SetNote'].forEach(function (n) {
    ControlsStub[n] = function (props) { return { __el: true, type: n, props: props || {}, children: [] }; };
  });

  globalThis.Platform = globalThis.Platform || { ui: { confirmAsync: function () { return Promise.resolve(true); } } };
  globalThis.UI = globalThis.UI || { confirmAsync: function () { return Promise.resolve(true); } };

  Module._load = function (request) {
    if (request === 'react') return ReactStub;
    if (request === 'react-native') return RNStub;
    if (/use_theme\.js$/.test(request)) return { useTheme: function () { return { tokens: TOKENS }; } };
    if (/settings[\\/]controls\.js$/.test(request)) return ControlsStub;
    if (/story_store\.js$/.test(request)) return { pushToast: function () {} };
    return origLoad.apply(this, arguments);
  };

  function collectText(node, out) {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(function (n) { collectText(n, out); }); return; }
    if (node && node.__el) {
      var p = node.props || {};
      Object.keys(p).forEach(function (k) {
        var v = p[k];
        if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
        // 标签可能是元素（star('姓名') 走 label 传的是元素而非字符串），一并展开
        else if (v && (v.__el || Array.isArray(v))) collectText(v, out);
      });
      collectText(node.children, out);
    }
  }

  // S 组专用夹具卡（新增卡 id，避免被前面 B~O 组的 persist 污染）
  if (!globalThis.CARDS) globalThis.CARDS = {};
  var sc = fixtureCard();
  sc.cardId = 'demo_s';
  sc.cardName = 'S 组渲染夹具';
  globalThis.CARDS.demo_s = sc;

  var WB_DIR = path.join(root, 'rn', 'screens', 'settings', 'worldbook');
  var preThrew = [], postThrew = [], thin = [], noKey = [], loaded = [];

  try {
    EDITORS.forEach(function (e) {
      var Ed = require(path.join(WB_DIR, e[0]))[e[1]];
      var MOD = require(path.join(root, 'engine', 'wb', e[2]));
      if (typeof Ed !== 'function' || !MOD) { loaded.push(e[0]); return; }

      // 1) 未 init（_data === null）——真机崩溃态
      MOD._data = null;
      try { Ed({ cardId: 'demo_s' }); } catch (err) { preThrew.push(e[0] + ': ' + (err && err.message)); }

      // 2) 已 init + 造一条真条目（用模块自己的新增原语，不改夹具手工捏数据）
      var fresh = fixtureCard();
      fresh.cardId = 'demo_s';
      fresh.cardName = 'S 组渲染夹具';
      globalThis.CARDS.demo_s = fresh;
      MOD.init('demo_s');
      try {
        if (e[2] === 'npc.js') { MOD.addNpc(); MOD.set(0, 'name', '阿甲'); }
        else if (e[2] === 'faction.js') { MOD.addFaction(); MOD.set(0, 'name', '星轨会'); }
        else if (e[2] === 'race.js') { MOD.toggleRaces(true); MOD.add(); MOD.set(0, 'name', '人族'); }
        else if (e[2] === 'item.js' || e[2] === 'skill.js' || e[2] === 'occupation.js' || e[2] === 'shop.js') {
          MOD.add(); if (MOD.set) MOD.set(0, 'name', '测试项');
        } else if (e[2] === 'timeline.js') { MOD.addItem('official'); }
        else if (e[2] === 'map.js') { MOD.addTree('主地图'); }
        else if (e[2] === 'currency.js') { MOD.addCurrency(); }
      } catch (eAdd) { /* 夹具与原语不匹配只影响关键词断言，不影响 S2/S3 */ }

      var msg = null, texts = [];
      try { collectText(Ed({ cardId: 'demo_s' }), texts); } catch (err2) { msg = err2 && err2.message; }
      if (msg) postThrew.push(e[0] + ': ' + msg);
      if (!msg && texts.length < 3) thin.push(e[0] + ':' + texts.length);
      var key = SKEY[e[0]];
      // star('姓名') 这类标签是文本节点 '姓名 '（尾随空格）+ 星号子节点，
      // 故以拼接后的整块文本做包含判断，而非逐节点严格相等。
      if (!msg && key && texts.join('\u0000').indexOf(key) < 0) noKey.push(e[0] + ':缺 ' + key);
    });
  } finally {
    Module._load = origLoad;
    delete globalThis.CARDS.demo_s;
  }

  eq('S0 12 个编辑器组件函数与数据层均已装载（缺：' + loaded.join(',') + '）', loaded.join(','), '');
  eq('S1 12 子编辑器「未 init（_data=null）」渲染不抛（抛：' + preThrew.join(' | ') + '）', preThrew.join(','), '');
  eq('S2 12 子编辑器 init 后渲染不抛（抛：' + postThrew.join(' | ') + '）', postThrew.join(','), '');
  eq('S3 12 子编辑器 init 后文本节点 >= 3（薄：' + thin.join(',') + '）', thin.join(','), '');
  eq('S4 关键字段标签真渲染（缺：' + noKey.join(' | ') + '）', noKey.join(','), '');
  eq('S5 S 组覆盖编辑器数', EDITORS.length, 12);
}

// ================= T 世界书脏闸在 RN 侧真能过（不是静默阻断）=================
// 真机事故（2026-09-30）：在 08 世界书里新建一条 NPC（DirtyGuard 置脏）后，
// 点子页 tab / 换卡带毫无反应。根因：rn_bootstrap 从没挂过 UI 全局，
// wb_common.js:76 的 typeof 兜底恒定返回 false ⇒ 脏闸永久关闭。
// T2 是行为断言（真调确认壳 + 文案逐字）；T1 是接线断言（Node 跑不了
// rn_bootstrap，只能核源码里 Platform.ui → UI 的挂载及其顺序）。

function runT() {
  var boot = fs.readFileSync(path.join(root, 'rn', 'rn_bootstrap.js'), 'utf8');
  var iInstall = boot.indexOf('RNPlatformShim.install(');
  var iUi = boot.indexOf('globalThis.UI = globalThis.Platform.ui;');
  eq('T1 rn_bootstrap 把 Platform.ui 挂成全局 UI（且在 RNPlatformShim.install 之后）',
    (iInstall >= 0 && iUi > iInstall), true);

  var spyMsg = null;
  var savedUI = globalThis.UI;
  globalThis.UI = { confirmAsync: function (m) { spyMsg = m; return Promise.resolve(true); } };
  // 前序 B..M 组退出时留下的脏标记会一并进入 checkAny 的 names 列表，
  // 使 spyMsg 变成多 key 串（测试自身 artifact，不是产品缺陷）。先全清再 mark。
  Object.keys(WB.DirtyGuard._dirtyMap).forEach(function (k) { WB.DirtyGuard.clear(k); });
  WB.DirtyGuard.mark('WB_NPC');
  var r = WB.DirtyGuard.checkAny();
  eq('T2 有脏数据时 checkAny 真调 UI.confirmAsync（文案逐字）',
    spyMsg, '有未保存的修改（WB_NPC），确定切换？');
  check('T2 补 checkAny 返回 Promise', !!(r && typeof r.then === 'function'));
  WB.DirtyGuard.clear('WB_NPC');
  if (savedUI === undefined) delete globalThis.UI; else globalThis.UI = savedUI;
}

// ================= 出口 =================

try {
  setup();
  runA(); runB(); runC(); runD(); runE(); runF(); runG(); runH(); runI(); runJ();
  runK(); runL(); runM(); runN(); runO(); runP(); runQ(); runR(); runS(); runT();
  teardown();
  console.log('WORLDBOOK_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
} catch (e) {
  console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
  console.log('WORLDBOOK_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(1);
}

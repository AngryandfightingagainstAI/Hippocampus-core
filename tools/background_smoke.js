// ============================================================
// background_smoke.js — P28 守卫：后台进程（世界自己在动）
//
// 用户诉求：「游戏方面我们目前没有默认后台自动运行的一些进程，这些进程可以由于各类权重触发随机事件」。
// 引擎侧新增 engine/background.js：卡带用 worldbook.background.processes 声明后台进程，
//   引擎每隔 everyRounds 轮按 weight × 关键词命中 × 冷却 挑一条写进 pending，交给 AI 带出。
// 断言分三层：
//   W-* 接线（两仓都真的会加载这个模块，否则 Node 冒烟全绿、真平台是死功能）
//   B-* 行为（默认开 / 间隔 / 权重 / 冷却 / 只给一轮 / 提示词形状 / 不注册工具）
//   O-* 落盘（runtime 写到 /saves/{cid}/{sid}/background_runtime.json）
// 用法：node tools/background_smoke.js   （cwd 随意，仓库根由 __dirname 推）
// ============================================================
'use strict';

var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var IS_RN = fs.existsSync(path.join(ROOT, 'rn', 'rn_bootstrap.js'));

var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('  ok   ' + name); }
  else { failN++; console.log('  FAIL ' + name + (detail ? ('  <<< ' + detail) : '')); }
}
function includes(name, hay, needle) {
  ok(name, String(hay).indexOf(needle) >= 0, 'missing=' + JSON.stringify(needle));
}
function section(t) { console.log('\n### ' + t); }

// ---------------- 内存 VFS（记录写入路径）----------------
var store = {}, writes = [];
globalThis.VFS = {
  writeFile: function (p, s) { store[p] = s; writes.push(p); return true; },
  readFile: function (p) { return store[p] === undefined ? null : store[p]; },
  readJSON: function (p) { try { return JSON.parse(store[p]); } catch (e) { return null; } },
  writeJSON: function (p, o) { store[p] = JSON.stringify(o); writes.push(p); return true; },
  listAll: function () { return []; },
  deleteFile: function (p) { delete store[p]; }
};

// ---------------- 最小运行时脚手架（Background 只在调用期解析全局）----------------
var ROUNDS = 0;
function installRuntime(card, opts) {
  opts = opts || {};
  globalThis.GameState = {
    currentCardId: 'demo_bg',
    currentSaveId: 's1',
    currentCard: card,
    chatHistory: [],
    _gameTime: { year: 2000, month: 10, day: 20, hour: 8, minute: 0 },
    formatGameTime: function () { return '2000-10-20 08:00'; }
  };
  for (var i = 0; i < ROUNDS; i++) globalThis.GameState.chatHistory.push({ role: 'user', content: '玩家第 ' + (i + 1) + ' 次行动' });
  var g = { settings: {} };
  if (opts.settings) g.settings = opts.settings;
  globalThis.Storage = {
    getGlobal: function () { return g; },
    setGlobal: function (x) { g = x; }
  };
  globalThis.NpcRuntime = {
    get: function (id) { return (opts.npcRuntime && opts.npcRuntime[id]) || null; }
  };
  globalThis.Events = opts.events === undefined ? { instantiateArchetype: function () { return { ok: true }; } } : opts.events;
}
function setRounds(n) { ROUNDS = n; }

// ---------------- 装载被测模块（缺文件 ⇒ 红，不崩）----------------
var BG = null, loadErr = '';
try { BG = require(path.join(ROOT, 'engine', 'background.js')); }
catch (e) { loadErr = e.message; }

// ============================================================
section('W 接线：两仓都真的会加载这个模块');
// ============================================================
ok('W-1 engine/background.js 可装载', !!BG, loadErr || 'module=null');

var idxPath = path.join(ROOT, 'index.html');
if (IS_RN) {
  ok('W-2 桌面仓判定（RN 仓无 index.html，跳过该项）', !fs.existsSync(idxPath));
} else {
  var idx = fs.existsSync(idxPath) ? fs.readFileSync(idxPath, 'utf8') : '';
  var bgAt = idx.indexOf('engine/background.js');
  var teAt = idx.indexOf('engine/core/tool_executor.js');
  ok('W-2 index.html 里加载了 engine/background.js', bgAt >= 0);
  ok('W-3 该 script 排在 engine/core/tool_executor.js 之后', bgAt >= 0 && teAt >= 0 && bgAt > teAt, 'bg=' + bgAt + ' te=' + teAt);
}

var bootPath = path.join(ROOT, 'rn', 'rn_bootstrap.js');
if (!IS_RN) {
  ok('W-4 手机仓判定（桌面仓无 rn_bootstrap.js，跳过该项）', !fs.existsSync(bootPath));
} else {
  var boot = fs.existsSync(bootPath) ? fs.readFileSync(bootPath, 'utf8') : '';
  var bAt = boot.indexOf("load('Background'");
  var tAt = boot.indexOf("load('ToolExecutor'");
  ok('W-4 rn_bootstrap.js 里 load 了 Background', bAt >= 0);
  ok('W-5 该 load 排在 load(\'ToolExecutor\' 之后', bAt >= 0 && tAt >= 0 && bAt > tAt, 'bg=' + bAt + ' te=' + tAt);
}

var stSrc = fs.readFileSync(path.join(ROOT, 'engine', 'core', 'storage.js'), 'utf8');
includes('W-6 storage.js 默认设置里有 background 开关', stSrc, 'background: { enabled: true }');
var storySrc = fs.readFileSync(path.join(ROOT, 'engine', 'story.js'), 'utf8');
includes('W-7 story.js 的 tick 链里有 Background.tick()', storySrc, 'Background.tick()');
var pbSrc = fs.readFileSync(path.join(ROOT, 'engine', 'core', 'prompt_builder.js'), 'utf8');
includes('W-8 prompt_builder.js 注入了 Background.formatForPrompt()', pbSrc, 'Background.formatForPrompt()');
var bgSrc = fs.existsSync(path.join(ROOT, 'engine', 'background.js')) ? fs.readFileSync(path.join(ROOT, 'engine', 'background.js'), 'utf8') : '';
ok('W-9 background.js 不注册工具（工具账保持 78）', bgSrc.indexOf('WHITELIST') < 0, '源码里出现了 WHITELIST');

// ============================================================
section('B 行为：默认开 / 到期才动 / 权重 / 冷却 / 只给一轮');
// ============================================================
var CARD = { game: { title: 'T' }, worldbook: { npcs: [{ id: 'npc_a', name: '甲', keywords: ['码头', '雨'] }, { id: 'npc_b', name: '乙', keywords: ['矿脉'] }] } };

setRounds(1);
installRuntime(CARD);
ok('B-1 默认开启（settings 里没有 background 也算开）', !!BG && BG.isEnabled() === true);
ok('B-2 显式关闭才关', !!BG && (function () {
  installRuntime(CARD, { settings: { background: { enabled: false } } });
  var off = BG.isEnabled() === false;
  installRuntime(CARD);
  return off;
})());

if (BG) {
  var procs = BG.listProcesses();
  ok('B-3 没有卡带配置时给 3 条通用进程', procs.length === 3, 'len=' + procs.length);
  var fieldsOk = procs.every(function (p) { return p.id && p.name && typeof p.weight === 'number' && typeof p.everyRounds === 'number' && typeof p.cooldownRounds === 'number' && Array.isArray(p.keywords) && typeof p.hint === 'string'; });
  ok('B-4 每条进程字段齐全（id/name/weight/everyRounds/cooldownRounds/keywords/hint）', fieldsOk, JSON.stringify(procs[0] || null));
  var custom = JSON.parse(JSON.stringify(CARD));
  custom.worldbook.background = { processes: [{ id: 'p1', name: '自定义一', weight: 1, everyRounds: 2, cooldownRounds: 2, keywords: [], hint: 'h1' }, { id: 'p2', name: '自定义二', weight: 1, everyRounds: 2, cooldownRounds: 2, keywords: [], hint: 'h2' }] };
  setRounds(2); installRuntime(custom);
  ok('B-5 卡带自定义进程覆盖默认（2 条）', BG.listProcesses().length === 2, 'len=' + BG.listProcesses().length);
  var dirty = JSON.parse(JSON.stringify(custom));
  dirty.worldbook.background.processes.push({ name: '没有 id' }, { id: 'no_name' });
  installRuntime(dirty);
  ok('B-6 过滤掉没有 id/name 的条目', BG.listProcesses().length === 2, 'len=' + BG.listProcesses().length);
}

setRounds(1);
installRuntime(CARD);
ok('B-7 _roundCount 口径：开场白算第 1 轮', !BG || BG._roundCount() === 1, BG ? String(BG._roundCount()) : 'module=null');

setRounds(1);
installRuntime(CARD);
var t1 = BG ? BG.tick() : null;
ok('B-8 第 1 轮不触发（everyRounds 最小 2）', !!(t1 && t1.ok === true && !t1.fired), JSON.stringify(t1 && t1.fired));

setRounds(2);
installRuntime(CARD);
var t2 = BG ? BG.tick() : null;
ok('B-9 第 2 轮触发 1 条', !!(t2 && t2.ok === true && t2.fired && t2.fired.id), JSON.stringify(t2 && t2.fired));
ok('B-10 触发后写进 pending（且只 1 条）', !!(BG && BG._data && BG._data.pending.length === 1), BG && BG._data ? String(BG._data.pending.length) : 'n/a');
ok('B-11 触发后该进程进入冷却', !!(BG && BG._data && BG._data.cooldowns[t2.fired.id] > 0), JSON.stringify(BG && BG._data ? BG._data.cooldowns : null));
ok('B-12 log 记了这次触发', !!(BG && BG._data && BG._data.log.length === 1));
var cands = BG ? BG._buildCandidates(2) : [];
var cooled = cands.filter(function (c) { return c.id === t2.fired.id; })[0];
ok('B-13 冷却中的进程权重被降到 0.2 档', !!(cooled && Math.abs(cooled.cool - 0.2) < 1e-9), JSON.stringify(cooled || null));

setRounds(3);
installRuntime(CARD);   // setRounds 只改 ROUNDS，chatHistory 要由 installRuntime 重造，否则还停在第 2 轮
var t3 = BG ? BG.tick() : null;
ok('B-14 上一轮的 pending 不残留（新一轮只留本轮的条）', !!BG && BG._data.pending.every(function (e) { return e.round === 3; }),
  JSON.stringify(BG && BG._data ? BG._data.pending : null));
ok('B-15 一轮最多 1 条（连续 6 轮 pending 从未超过 1）', !!BG && (function () {
  var max = 0;
  for (var r = 1; r <= 6; r++) { setRounds(r); installRuntime(CARD); BG.tick(); if (BG._data.pending.length > max) max = BG._data.pending.length; }
  return max <= 1;
})());

// 权重：命中 NPC 关键词的进程应当排在前面
var weighted = JSON.parse(JSON.stringify(CARD));
weighted.worldbook.background = { processes: [
  { id: 'hit', name: '命中进程', weight: 5, everyRounds: 1, cooldownRounds: 1, keywords: ['码头'], hint: '命中' },
  { id: 'miss', name: '零命中进程', weight: 9, everyRounds: 1, cooldownRounds: 1, keywords: ['不存在的词'], hint: '不命中' },
  { id: 'nokey', name: '无关键词进程', weight: 1, everyRounds: 1, cooldownRounds: 1, keywords: [], hint: '通用' }
] };
setRounds(2); installRuntime(weighted);
var cands2 = BG ? BG._buildCandidates(2) : [];
ok('B-16 命中的进程权重高于未命中者（关键词加权）', !!BG && cands2.length > 0 && cands2[0].id === 'hit', JSON.stringify(cands2.map(function (c) { return c.id + ':' + c.weight; })));
ok('B-17 有关键词但零命中的进程被跳过', !!BG && !cands2.some(function (c) { return c.id === 'miss'; }), JSON.stringify(cands2));
ok('B-18 无关键词的通用进程仍在候选里', !!BG && cands2.some(function (c) { return c.id === 'nokey'; }));

// 加权随机的可测性：把 _rnd 固定为 0 ⇒ 永远选权重最高那条
var rndSave = BG ? BG._rnd : null;
if (BG) {
  BG._rnd = function () { return 0; };
  setRounds(2); installRuntime(weighted);
  var tw = BG.tick();
  ok('B-19 _rnd 可注入（固定 0 ⇒ 选中权重最高的 hit）', !!(tw && tw.fired && tw.fired.id === 'hit'), JSON.stringify(tw && tw.fired));
  BG._rnd = rndSave;
}

// 提示词形状
setRounds(2); installRuntime(CARD);
if (BG) { BG.tick(); }
var prompt = BG ? BG.formatForPrompt() : '';
includes('B-20 提示词第一行标明「后台进程·世界自己在动」', prompt, '【后台进程·世界自己在动】');
includes('B-21 提示词带进程名与 hint', prompt, (BG && BG._data.pending[0]) ? BG._data.pending[0].name : '@@missing@@');
includes('B-22 提示词末行要求「不要硬插」', prompt, '不要硬插');
setRounds(2); installRuntime(CARD);
if (BG) { BG.clear(); }
ok('B-23 没有 pending 时提示词为空串', !!BG && BG.formatForPrompt() === '', JSON.stringify(BG ? BG.formatForPrompt() : null));
setRounds(2); installRuntime(CARD, { settings: { background: { enabled: false } } });
ok('B-24 关闭时提示词为空串', !!BG && BG.formatForPrompt() === '');
setRounds(2); installRuntime(CARD);
if (BG) { BG.tick(); }
ok('B-25 clear() 清空运行时', !!BG && (BG.clear(), BG._data.pending.length === 0 && BG._data.log.length === 0));

// log 上限（用 everyRounds:1 的卡带把 log 顶满：通用进程 2/3/4 轮才到期，30 轮只会记 ~15 条）
ok('B-26 log 上限 20 条', !!BG && (function () {
  for (var r = 1; r <= 30; r++) { setRounds(r); installRuntime(weighted); BG.tick(); }
  return BG._data.log.length === 20;
})(), BG && BG._data ? String(BG._data.log.length) : 'n/a');

// Events 缺失时不抛
setRounds(2); installRuntime(CARD, { events: null });
var tNoEv = BG ? BG.tick() : null;
ok('B-27 没有 Events 时照常触发不抛', !!(tNoEv && tNoEv.ok === true));

// ============================================================
section('O 落盘：runtime 写到存档目录');
// ============================================================
setRounds(2); installRuntime(CARD);
writes.length = 0;
if (BG) { BG.tick(); }
var wantPath = '/saves/demo_bg/s1/background_runtime.json';
ok('O-1 runtime 写在 ' + wantPath, writes.indexOf(wantPath) >= 0, JSON.stringify(writes.slice(-3)));
ok('O-2 runtime 里有 round/cooldowns/pending/log', !!BG && (function () {
  var d = JSON.parse(store[wantPath] || 'null');
  return !!d && typeof d.round === 'number' && typeof d.cooldowns === 'object' && Array.isArray(d.pending) && Array.isArray(d.log);
})(), String(store[wantPath] || '').slice(0, 160));

console.log('');
console.log('BACKGROUND_SMOKE: ' + okN + ' ok, ' + failN + ' failed');
if (failN > 0) process.exit(1);

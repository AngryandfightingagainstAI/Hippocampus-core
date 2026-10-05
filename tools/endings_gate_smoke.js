// ============================================================
// P24·④ 守卫：结局不得「开局即秒结局」
//
// 存在理由（用户 2026-10-03 报的第四条）：
//   「结局系统，现在内部标注的是数值满足条件即秒结局，但是这个我们需要数值或事件后
//     才可以结局的，如果有坏结局设置的是都是最低数值怎么办？你总不能秒结局吧？」
//   原实现 tick() 只问 checkTrigger，完全不看「玩到第几轮」；而开局数值就是卡带的
//   init，于是「某数值 ≤ 最低值」这类坏结局条件在第 1 轮（AI 回完开场白）就成立 ⇒
//   秒结局。本守卫守住三件事：
//     ① 门槛真拦得住：第 1 轮条件已成立也不触发；缺省 minRound = 2（玩家至少出手一次）。
//     ② 门槛不误伤：写 minRound:1 的卡仍在第 1 轮可触发；AI 主动 trigger_ending 不受拦。
//     ③ 作者写漏了能被查出来：CardValidator.auditEndingsAtStart 对「没写门槛而又开局即成立」
//        的结局报警（只警告，不拦导入）。
// 用法：node tools/endings_gate_smoke.js   （cwd 随意，根目录由 __dirname 推）
// ============================================================
'use strict';
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('ok   ' + name); }
  else { failN++; console.log('FAIL ' + name + (detail ? '  :: ' + detail : '')); }
}

// ---------- 内存 harness（照 tools/tool_ready_smoke.js 的 TR-4 范式） ----------
var LS = (function () {
  var mm = Object.create(null);
  return {
    getItem: function (k) { return mm[k] != null ? mm[k] : null; },
    setItem: function (k, v) { mm[k] = String(v); },
    removeItem: function (k) { delete mm[k]; },
    key: function (i) { return Object.keys(mm)[i] || null; },
    get length() { return Object.keys(mm).length; }
  };
})();
globalThis.localStorage = LS;
globalThis.window = globalThis;

var Platform = require(path.join(ROOT, 'platform', 'platform_adapter.js'));
globalThis.Platform = Platform;
Platform.ui = {};
Platform.dialog = { alert: function () { }, confirm: function () { return true; } };
Platform.http = { request: function () { return Promise.resolve({ ok: false, error: 'no-http' }); } };

var mem = Object.create(null), keys = [];
var SA = require(path.join(ROOT, 'vfs', 'storage_adapter.js'));
['getItem', 'setItem', 'removeItem', 'key', 'clear', 'estimateBytes'].forEach(function (k) {
  SA[k] = k === 'getItem' ? function (x) { return mem[x] != null ? mem[x] : null; }
    : k === 'setItem' ? function (x, v) { if (keys.indexOf(x) < 0) keys.push(x); mem[x] = String(v); }
    : k === 'removeItem' ? function (x) { delete mem[x]; var i = keys.indexOf(x); if (i >= 0) keys.splice(i, 1); }
    : k === 'key' ? function (i) { return keys[i] != null ? keys[i] : null; }
    : k === 'clear' ? function () { keys.length = 0; Object.keys(mem).forEach(function (x) { delete mem[x]; }); }
    : function () { return 0; };
});

var LIST = [
  ['GameState', 'engine/core/gamestate.js'], ['VFS', 'vfs/vfs.js'], ['Saves', 'vfs/saves.js'],
  ['VfsGuard', 'vfs/vfs_guard.js'], ['LocalStore', 'vfs/local_store.js'],
  ['Storage', 'engine/core/storage.js'], ['ToolExecutor', 'engine/core/tool_executor.js'],
  ['ErrorLog', 'engine/error_log_core.js'], ['ApiManager', 'engine/api_manager.js'],
  ['PromptBuilder', 'engine/core/prompt_builder.js'], ['Calendar', 'engine/calendar.js'],
  ['Events', 'engine/events.js'], ['Endings', 'engine/endings.js'],
  ['CardValidator', 'engine/core/card_validator.js']
];
var loadFail = [];
LIST.forEach(function (x) {
  try { globalThis[x[0]] = require(path.join(ROOT, x[1])); }
  catch (e) { loadFail.push(x[0] + '::' + e.message); }
});
ok('G0 模块可装载（GameState/VFS/Storage/Events/Endings/CardValidator）', loadFail.length === 0, loadFail.join(' ;; '));

var GameState = globalThis.GameState, Events = globalThis.Events;
var Endings = globalThis.Endings, CardValidator = globalThis.CardValidator;

if (GameState && typeof GameState.formatGameTime !== 'function') {
  GameState.formatGameTime = function () { return '第1天 08:00'; };
}

// ---------- 合成卡带：坏结局条件 =「生命 ≤ 5」，而开局生命就是 5 ----------
// withOpen=false 时不带 end_open（显式 minRound:1 的那个），用于验证「完全没写门槛的卡
// 第 1 轮一个结局都不该触发」
function makeCard(withOpen) {
  var panels = [2, 3, 4, 5].map(function (n) { return { num: n, id: 'p' + n, entries: [] }; });
  var endings = [
    // 没写门槛的坏结局（用户报的那种）
    { id: 'end_bad', name: '力竭而亡', type: 'bad', priority: 9, locked: true, desc: '生命归零',
      trigger: { type: 'value', key: 'hp', op: '<=', value: 5 } },
    // 要求先触发过事件
    { id: 'end_event', name: '封印之终', type: 'neutral', priority: 2, locked: false, requireEvents: ['ev_seal'],
      trigger: { type: 'value', key: 'hp', op: '<=', value: 5 } }
  ];
  if (withOpen !== false) {
    endings.splice(1, 0,
      // 作者显式要求「开局即终」→ 门槛不得误伤
      { id: 'end_open', name: '开局即终', type: 'bad', priority: 1, locked: false, minRound: 1,
        trigger: { type: 'value', key: 'hp', op: '<=', value: 5 } });
  }
  return {
    schemaVersion: 1, cardId: 'p24_gate', cardName: 'P24 门槛试验',
    game: { title: 'P24 门槛试验' },
    hud: [{ type: 'gauge', key: 'hp', name: '生命', min: 0, max: 100, init: 5, current: 5, color: 'red' }],
    sidebar: [], attributes: [], panels: panels,
    worldbook: { endings: endings }
  };
}

function reset(rounds, withOpen) {
  GameState.currentCardId = 'p24_gate';
  GameState.currentSaveId = 'p24_save';
  GameState.currentCard = makeCard(withOpen);
  GameState.currentState = { hud: [{ key: 'hp', current: 5 }], sidebar: [], panels: {} };
  GameState.chatHistory = [];
  for (var i = 0; i < rounds; i++) GameState.chatHistory.push({ role: 'user', content: '玩家第 ' + (i + 1) + ' 次行动' });
  // 每个用例从零开始：clear() 既清内存又清 endings_runtime.json，
  // 否则会读到上一个用例存下的结局进度（表现为「该结局已达成」这种串味红/绿）
  if (typeof Endings.clear === 'function') Endings.clear(); else Endings._data = null;
  Events._data = { triggered: {}, history: {} };
  if (Events._ensureShape) Events._ensureShape();
}

var BAD = { type: 'value', key: 'hp', op: '<=', value: 5 };

// 门槛查询包一层：旧代码没有 gateOf 时返回 {ok:'missing'}，让断言红而不是抛异常中断
function gate(def) {
  if (typeof Endings.gateOf !== 'function') return { ok: 'missing', reasons: [], round: 0, minRound: 0, missingEvents: [] };
  return Endings.gateOf(def);
}

// ---------- G1 门槛 API 存在 ----------
ok('G1 Endings.gateOf 存在（P24·④ 新增）', typeof Endings.gateOf === 'function');

// ---------- G2 第 1 轮：门槛拦得住 ----------
reset(1);
var g1 = gate({ trigger: BAD });
ok('G2a 第 1 轮门槛不过（ok=false）', g1.ok === false, 'ok=' + JSON.stringify(g1.ok));
ok('G2b 缺省 minRound = 2', g1.minRound === 2, 'minRound=' + g1.minRound);
ok('G2c 当前轮次 = 1（开局那一轮）', g1.round === 1, 'round=' + g1.round);
ok('G2d 给出人话原因', typeof g1.reasons === 'object' && g1.reasons.length > 0 && /第 2 轮/.test(g1.reasons.join('')), JSON.stringify(g1.reasons));

// ---------- G3 前提自检：条件本身确实成立（防「门槛测试因条件不成立而假绿」）----------
reset(1);
var ck = Events._checkTrigger({ trigger: BAD });
ok('G3a 条件自检：生命 5 <= 5 成立（否则本守卫全部无意义）', ck.ok === true, JSON.stringify(ck));

// ---------- G4 第 1 轮 tick 不得触发（卡带完全没写门槛）----------
reset(1, false);
var t1 = Endings.tick();
ok('G4a 第 1 轮 tick() 零触发', t1.triggered.length === 0, 'triggered=' + t1.triggered.length);
ok('G4b 第 1 轮没人达成结局', Endings.hasAnyReached() === false);
ok('G4c 第 1 轮主循环未被锁死', Endings.isLocked() === false);

// ---------- G5 显式 minRound:1 仍可在第 1 轮触发（门槛不误伤作者意图）----------
reset(1);
var t2 = Endings.tick();
ok('G5a 第 1 轮只有 minRound:1 的结局能触发', t2.triggered.length === 1 && t2.triggered[0].id === 'end_open',
  JSON.stringify(t2.triggered.map(function (x) { return x.id; })));

// ---------- G6 第 2 轮：门槛放行，条件成立即触发 ----------
reset(2);
var g2 = gate({ trigger: BAD });
ok('G6a 第 2 轮门槛放行', g2.ok === true, JSON.stringify(g2));
var t3 = Endings.tick();
ok('G6b 第 2 轮触发（优先级最高的 end_bad）', t3.triggered.length === 1 && t3.triggered[0].id === 'end_bad',
  JSON.stringify(t3.triggered.map(function (x) { return x.id; })));
ok('G6c 硬结局锁死主循环', Endings.isLocked() === true);

// ---------- G7 requireEvents：没触发过事件就不放行 ----------
reset(2);
var g3 = gate({ trigger: BAD, requireEvents: ['ev_seal'] });
ok('G7a 前置事件未触发 → 门槛不过', g3.ok === false && g3.missingEvents.length === 1 && g3.missingEvents[0] === 'ev_seal',
  JSON.stringify(g3));
reset(2);
Events._data.triggered['ev_seal'] = { at: '第1天 08:00' };
var g4 = gate({ trigger: BAD, requireEvents: ['ev_seal'] });
ok('G7b 前置事件已触发 → 门槛放行', g4.ok === true && g4.missingEvents.length === 0, JSON.stringify(g4));

// ---------- G8 面板/查询能看到门槛状态 ----------
reset(1);
var la = Endings.listAll();
var eBad = la.filter(function (x) { return x.id === 'end_bad'; })[0] || {};
var eOpen = la.filter(function (x) { return x.id === 'end_open'; })[0] || {};
ok('G8a listAll 带 minRound/requireEvents/gateOk/gateReason',
  eBad.minRound === 2 && Array.isArray(eBad.requireEvents) && eBad.gateOk === false && typeof eBad.gateReason === 'string' && eBad.gateReason.length > 0,
  JSON.stringify({ minRound: eBad.minRound, gateOk: eBad.gateOk, gateReason: eBad.gateReason }));
ok('G8b minRound:1 的结局此时 gateOk=true', eOpen.gateOk === true, JSON.stringify({ gateOk: eOpen.gateOk }));

// ---------- G9 AI 主动触发不受门槛拦（门槛只管引擎自动判定）----------
reset(1);
var byAi = Endings.triggerById('end_bad', '剧情杀');
ok('G9 AI 主动 trigger_ending 在第 1 轮仍可用', byAi.ok === true, JSON.stringify(byAi));

// ---------- G10 作者写漏了能被查出来（静态自查）----------
var card = makeCard();
var warns = (CardValidator && typeof CardValidator.auditEndingsAtStart === 'function')
  ? CardValidator.auditEndingsAtStart(card) : null;
ok('G10a auditEndingsAtStart 存在', Array.isArray(warns));
if (Array.isArray(warns)) {
  var txt = warns.join(' | ');
  ok('G10b 报出没门槛的 end_bad', /力竭而亡/.test(txt), txt);
  ok('G10c 不报写了 minRound:1 的 end_open', txt.indexOf('开局即终') < 0, txt);
  ok('G10d 不报写了 requireEvents 的 end_event', txt.indexOf('封印之终') < 0, txt);
}
var v = CardValidator.validate(card);
ok('G10e validate(card) 合法时带 warnings（不拦导入）', v.ok === true && Array.isArray(v.warnings) && v.warnings.length > 0,
  JSON.stringify(v));

// ---------- G11/G12 源码守卫：改动被回退时立刻红 ----------
var endSrc = fs.readFileSync(path.join(ROOT, 'engine', 'endings.js'), 'utf8');
ok('G11a 源码：endings.js 定义 DEFAULT_MIN_ROUND', endSrc.indexOf('DEFAULT_MIN_ROUND') >= 0);
ok('G11b 源码：tick() 里先过门槛再判条件', /var gate = self\.gateOf\(def\);\s*\n\s*if \(!gate\.ok\) return;\s*\n\s*var ck = self\.checkTrigger\(def\);/.test(endSrc));
var cvSrc = fs.readFileSync(path.join(ROOT, 'engine', 'core', 'card_validator.js'), 'utf8');
ok('G12 源码：card_validator.js 有 auditEndingsAtStart', cvSrc.indexOf('auditEndingsAtStart') >= 0);

console.log('');
console.log('ENDINGS_GATE_SMOKE: ' + okN + ' ok, ' + failN + ' failed');
if (failN > 0) process.exit(1);

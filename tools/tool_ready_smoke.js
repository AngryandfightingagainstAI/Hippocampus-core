// P16·B1 守卫：工具注册必须同步就绪，不能再靠 setTimeout 错峰。
//
// 背景：历史上 16 个模块用 setTimeout(registerTools/hook, 900~1900ms) 错峰注册工具，
//   冷启动后约 2 秒内 ToolExecutor.WHITELIST 只有内置的 15 个工具，AI 此时调用会拿到
//   「未知工具：xxx」；而未知工具要连续失败 3 次才会提示 AI，中间它会反复重试同一个
//   不存在的工具、白烧 token。
// 断言：① 16 个文件里不再有 setTimeout(..., 非 0) 形式的错峰注册；
//       ② 按真实装载顺序跑完所有 module body 后，白名单立刻就是 78 项（16 内置 + 62 惰性）；
//       ③ 两仓装载顺序里 ToolExecutor 都排在这些模块之前。
//
// 用法：node tools/tool_ready_smoke.js         （cwd 随意，根目录由 __dirname 推）
'use strict';
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('ok   ' + name); }
  else { failN++; console.log('FAIL ' + name + (detail ? '  :: ' + detail : '')); }
}

// ---------- 期望的工具账 ----------
var BUILTIN = ['modify_hud', 'modify_sidebar', 'modify_entry', 'modify_relation', 'add_item', 'remove_item',
  'query_player', 'query_npc', 'query_faction', 'query_map', 'query_worldsetting', 'roll_dice', 'roll_check',
  'roll_opposed', 'web_search', 'query_source'];

// 模块 -> 该模块注册的工具（顺序 = 文件内出现顺序）
var MODULE_TOOLS = [
  ['engine/shop.js', ['open_shop', 'buy_item', 'sell_item']],
  ['engine/dice.js', ['roll_sc', 'spend_luck', 'push_roll']],
  ['engine/dice_history.js', ['query_dice_history']],
  ['engine/npc_deduction.js', ['request_deduction', 'query_deductions']],
  ['engine/npc_runtime.js', ['add_keyword', 'npc_knows', 'npc_focus', 'npc_unfocus', 'npc_scene_enter',
    'npc_scene_leave', 'npc_follow', 'npc_unfollow', 'npc_reveal', 'npc_enter', 'npc_leave']],
  ['engine/status_card.js', ['update_status', 'update_status_bulk', 'set_inner_voice']],
  ['engine/weather.js', ['set_weather', 'query_weather']],
  ['engine/events.js', ['trigger_event', 'cancel_event', 'query_events', 'list_event_archetypes',
    'instantiate_archetype', 'propose_event', 'ban_event', 'unban_event']],
  ['engine/tasks.js', ['add_task', 'complete_step', 'complete_task', 'fail_task', 'abandon_task', 'query_tasks']],
  ['engine/achievements.js', ['add_achievement', 'unlock_achievement', 'query_achievements']],
  ['engine/endings.js', ['trigger_ending', 'query_endings', 'extend_epilogue']],
  ['engine/avatar.js', ['query_avatar']],
  ['engine/story_nodes.js', ['enter_node', 'complete_node', 'bury_foreshadow', 'reveal_foreshadow', 'query_nodes']],
  ['engine/proposals.js', ['propose_change', 'query_proposals']],
  ['engine/outputs.js', ['output_publish', 'output_stir', 'output_settle', 'query_outputs']],
  ['engine/info_feed.js', ['info_send', 'info_broadcast', 'info_read', 'info_promote']]
];
// log_query.js 本来就是同步注册（本仓的范式来源），一并纳入
var SYNC_ONLY = [['engine/log_query.js', ['query_log']]];

var LAZY = [];
MODULE_TOOLS.forEach(function (m) { m[1].forEach(function (t) { if (LAZY.indexOf(t) < 0) LAZY.push(t); }); });
SYNC_ONLY.forEach(function (m) { m[1].forEach(function (t) { if (LAZY.indexOf(t) < 0) LAZY.push(t); }); });
var EXPECT_TOTAL = BUILTIN.length + LAZY.length;

// ---------- TR-1 源码守卫：不再有非 0 的错峰注册 ----------
console.log('--- TR-1 源码守卫：16 个文件不得再有非 0 的错峰注册 ---');
MODULE_TOOLS.forEach(function (m) {
  var rel = m[0];
  var p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { ok('TR-1 ' + rel + ' 存在', false, '文件不存在'); return; }
  var s = fs.readFileSync(p, 'utf8');
  var bad = /setTimeout\(\s*(registerTools|hook)\s*,\s*[1-9]\d*\s*\)/.exec(s);
  var good = /[\r\n][ \t]*(registerTools|hook)\(\);/.test(s);
  ok('TR-1 ' + rel + ' 无非 0 错峰注册', !bad, bad ? ('仍有 ' + bad[0]) : '');
  ok('TR-1 ' + rel + ' 有同步调用', good, good ? '' : '找不到 registerTools(); 或 hook();');
});

// ---------- TR-2 log_query / dice_history 的范式一致性 ----------
console.log('--- TR-2 同步注册范式 ---');
var lq = fs.readFileSync(path.join(ROOT, 'engine/log_query.js'), 'utf8');
ok('TR-2 engine/log_query.js 同步守卫注册', lq.indexOf('if (typeof ToolExecutor !== \'undefined\' && ToolExecutor && ToolExecutor.WHITELIST) {') >= 0);
var dh = fs.readFileSync(path.join(ROOT, 'engine/dice_history.js'), 'utf8');
ok('TR-2 engine/dice_history.js 保留幂等标记', dh.indexOf('ToolExecutor._diceHistoryHooked') >= 0);
ok('TR-2 engine/dice_history.js hook 内保留就绪检查', /function hook\(\)\s*\{[^]*?typeof ToolExecutor === 'undefined'/.test(dh));

// ---------- TR-3 装载顺序：ToolExecutor 必须在这些模块之前 ----------
console.log('--- TR-3 装载顺序 ---');
var MODNAMES = ['engine/shop.js', 'engine/dice.js', 'engine/dice_history.js', 'engine/npc_deduction.js',
  'engine/npc_runtime.js', 'engine/status_card.js', 'engine/weather.js', 'engine/events.js', 'engine/tasks.js',
  'engine/achievements.js', 'engine/endings.js', 'engine/avatar.js', 'engine/story_nodes.js',
  'engine/proposals.js', 'engine/outputs.js', 'engine/info_feed.js', 'engine/log_query.js'];

var indexPath = path.join(ROOT, 'index.html');
if (fs.existsSync(indexPath)) {
  // 桌面仓：<script src="..."> 顺序（无 defer/async ⇒ 严格按文档顺序执行）
  var html = fs.readFileSync(indexPath, 'utf8');
  var order = [], re = /<script\s+src="([^"]+)"/g, m;
  while ((m = re.exec(html)) !== null) order.push(m[1]);
  var tePos = order.indexOf('engine/core/tool_executor.js');
  ok('TR-3 index.html 有 tool_executor.js', tePos >= 0, 'pos=' + tePos);
  ok('TR-3 index.html 无 defer/async（顺序有保证）', !/<script[^>]*\b(defer|async)\b/.test(html));
  var before = MODNAMES.filter(function (f) { return order.indexOf(f) >= 0 && order.indexOf(f) < tePos; });
  ok('TR-3 index.html 里所有注册模块都在 tool_executor 之后', before.length === 0, '提前的: ' + before.join(','));
} else {
  ok('TR-3 桌面 index.html 不存在（RN 仓，跳过）', true);
}

var bsPath = path.join(ROOT, 'rn/rn_bootstrap.js');
if (fs.existsSync(bsPath)) {
  var bs = fs.readFileSync(bsPath, 'utf8').split(/\r?\n/);
  var names = [], line = {}, i;
  for (i = 0; i < bs.length; i++) {
    var mm = /\bload\('([^']+)'/.exec(bs[i]);
    if (mm) { names.push(mm[1]); line[mm[1]] = i + 1; }
  }
  ok('TR-3 rn_bootstrap.js 有 ToolExecutor', names.indexOf('ToolExecutor') >= 0);
  var teI = names.indexOf('ToolExecutor');
  var MAP = { 'engine/shop.js': 'Shop', 'engine/dice.js': 'DiceEngine', 'engine/dice_history.js': 'DiceHistory',
    'engine/npc_deduction.js': 'NpcDeduction', 'engine/npc_runtime.js': 'NpcRuntime',
    'engine/status_card.js': 'StatusCard', 'engine/weather.js': 'Weather', 'engine/events.js': 'Events',
    'engine/tasks.js': 'Tasks', 'engine/achievements.js': 'Achievements', 'engine/endings.js': 'Endings',
    'engine/avatar.js': 'Avatar', 'engine/story_nodes.js': 'StoryNodes', 'engine/proposals.js': 'Proposals',
    'engine/outputs.js': 'Outputs', 'engine/info_feed.js': 'InfoFeed', 'engine/log_query.js': 'LogQuery' };
  var bad2 = [];
  Object.keys(MAP).forEach(function (f) {
    var idx = names.indexOf(MAP[f]);
    if (idx < 0) { bad2.push(f + '(未 load)'); return; }
    if (idx < teI) bad2.push(f + '(#' + (idx + 1) + ')');
  });
  ok('TR-3 rn_bootstrap.js 里所有注册模块都在 ToolExecutor 之后', bad2.length === 0, '提前/缺失: ' + bad2.join(','));
} else {
  ok('TR-3 RN rn_bootstrap.js 不存在（桌面仓，跳过）', true);
}

// ---------- TR-4 运行时就绪：module body 一跑完就必须是满的 ----------
console.log('--- TR-4 运行时就绪（T0，任何 timer 之前）---');
(function () {
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

  var Platform = require(path.join(ROOT, 'platform/platform_adapter.js'));
  globalThis.Platform = Platform;
  Platform.ui = {};
  Platform.dialog = { alert: function () { }, confirm: function () { return true; } };
  Platform.http = { request: function () { return Promise.resolve({ ok: false, error: 'no-http' }); } };

  var mem = Object.create(null), keys = [];
  var SA = require(path.join(ROOT, 'vfs/storage_adapter.js'));
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
    ['VfsGuard', 'vfs/vfs_guard.js'], ['LocalStore', 'vfs/local_store.js'], ['CARDS', 'engine/core/cards_demo.js'],
    ['Storage', 'engine/core/storage.js'], ['ToolExecutor', 'engine/core/tool_executor.js'],
    ['ApiManager', 'engine/api_manager.js'], ['PromptBuilder', 'engine/core/prompt_builder.js'],
    ['ErrorLog', 'engine/error_log_core.js'], ['Logger', 'vfs/logger.js'], ['Alias', 'engine/alias.js'],
    ['Calendar', 'engine/calendar.js'], ['DiceHistory', 'engine/dice_history.js'], ['DiceEngine', 'engine/dice.js'],
    ['Shop', 'engine/shop.js'], ['NpcDeduction', 'engine/npc_deduction.js'], ['NpcRuntime', 'engine/npc_runtime.js'],
    ['StatusCard', 'engine/status_card.js'], ['Weather', 'engine/weather.js'], ['Events', 'engine/events.js'],
    ['Tasks', 'engine/tasks.js'], ['Achievements', 'engine/achievements.js'], ['Endings', 'engine/endings.js'],
    ['Avatar', 'engine/avatar.js'], ['StoryNodes', 'engine/story_nodes.js'], ['Proposals', 'engine/proposals.js'],
    ['Outputs', 'engine/outputs.js'], ['InfoFeed', 'engine/info_feed.js'], ['LogQuery', 'engine/log_query.js']
  ];
  var loadFail = [];
  LIST.forEach(function (x) {
    try { globalThis[x[0]] = require(path.join(ROOT, x[1])); }
    catch (e) { loadFail.push(x[0] + '::' + e.message); }
  });

  ok('TR-4 全部模块可装载', loadFail.length === 0, loadFail.join(' ;; '));

  var TE = globalThis.ToolExecutor;
  var ks = (TE && TE.WHITELIST) ? Object.keys(TE.WHITELIST) : [];
  ok('TR-4 T0 白名单非空', ks.length > 0, 'ToolExecutor 未就绪');
  ok('TR-4 T0 白名单总数 = ' + EXPECT_TOTAL + '（实测 ' + ks.length + '）', ks.length === EXPECT_TOTAL);

  var missB = BUILTIN.filter(function (n) { return ks.indexOf(n) < 0; });
  ok('TR-4 T0 内置 ' + BUILTIN.length + ' 项齐全', missB.length === 0, '缺: ' + missB.join(','));
  var missL = LAZY.filter(function (n) { return ks.indexOf(n) < 0; });
  ok('TR-4 T0 惰性 ' + LAZY.length + ' 项齐全（不再等 timer）', missL.length === 0, '缺: ' + missL.join(','));

  // 逐模块归属：每个模块的工具都在 T0 就位
  MODULE_TOOLS.concat(SYNC_ONLY).forEach(function (m) {
    var miss = m[1].filter(function (n) { return ks.indexOf(n) < 0; });
    ok('TR-4 T0 ' + m[0] + ' 的 ' + m[1].length + ' 个工具就位', miss.length === 0, '缺: ' + miss.join(','));
  });
})();

console.log('');
console.log('TOOL_READY_SMOKE: ' + okN + ' ok, ' + failN + ' failed');
if (failN > 0) process.exit(1);

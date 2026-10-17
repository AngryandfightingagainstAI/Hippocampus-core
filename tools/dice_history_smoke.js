// ============================================================
// dice_history_smoke —— 骰子历史 行为级 smoke（净化批 EX6 新增）
//
// 存在理由：engine/dice_history.js 自入库以来只有「工具就绪」类被动检查，
//   五条主行为没有行为级断言（Phase 0 功能审查盲区）：
//     ① hook 挂接：WHITELIST.query_dice_history 注册 + executeAll 拦截入史
//     ② record 行为：正常骰 / check 骰入史，非骰与失败结果拒收
//     ③ 查询行为：listAll / listRecent / listByLabel / listByRound / getStats
//     ④ 组装行为：formatRecentForPrompt 头行与空态
//     ⑤ 落盘行为：save 截断 MAX_RECORDS=200、clear 清空落盘、空档不炸
// 用法：node tools/dice_history_smoke.js（cwd 随意，根目录由 __dirname 推）
// ============================================================
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');

var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('ok   ' + name); }
  else { failN++; console.log('FAIL ' + name + (detail ? '  :: ' + detail : '')); }
}

// ---------- 内存 harness（照 tools/endings_gate_smoke.js 的 TR-4 范式） ----------
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
  ['GameState', 'engine/core/gamestate.js'], ['VFS', 'vfs/vfs.js'],
  ['VfsGuard', 'vfs/vfs_guard.js'], ['LocalStore', 'vfs/local_store.js'],
  ['Storage', 'engine/core/storage.js'], ['ToolExecutor', 'engine/core/tool_executor.js'],
  ['ErrorLog', 'engine/error_log_core.js']
];
var loadFail = [];
LIST.forEach(function (x) {
  try { globalThis[x[0]] = require(path.join(ROOT, x[1])); }
  catch (e) { loadFail.push(x[0] + '::' + e.message); }
});
ok('G0 模块可装载（GameState/VFS/Storage/ToolExecutor/ErrorLog）', loadFail.length === 0, loadFail.join(' ;; '));

var GameState = globalThis.GameState, ToolExecutor = globalThis.ToolExecutor;

if (GameState && typeof GameState.formatGameTime !== 'function') {
  GameState.formatGameTime = function () { return '第1天 08:00'; };
}
GameState.currentCardId = 'smoke_card';
GameState.currentSaveId = 'smoke_save';
GameState.chatHistory = [];

// dice_history 本体（须在 ToolExecutor 之后 require → hook() 同步挂接）
var DiceHistory = require(path.join(ROOT, 'engine', 'dice_history.js'));
globalThis.DiceHistory = DiceHistory;

(async function () {
  // ---- ① hook 挂接 ----
  ok('H1 hook 幂等标记已打（ToolExecutor._diceHistoryHooked）',
    ToolExecutor._diceHistoryHooked === true);
  ok('H2 query_dice_history 已注册进 WHITELIST',
    ToolExecutor.WHITELIST && typeof ToolExecutor.WHITELIST.query_dice_history === 'object'
    && typeof ToolExecutor.WHITELIST.query_dice_history.run === 'function');

  // ---- ④ 组装行为：空态 ----
  DiceHistory.clear();
  ok('H3 空史 formatRecentForPrompt 返回空串', DiceHistory.formatRecentForPrompt() === '');

  // ---- ② record 行为 ----
  DiceHistory.record({ ok: true, type2: 'dice', type: 'normal', expression: '1d20+3', label: '攀爬检定', dice: [20], mod: 3, total: 23 });
  var l1 = DiceHistory.listAll();
  ok('H4 正常骰入史：total/expr/label/detail/type',
    l1.length === 1 && l1[0].total === 23 && l1[0].expr === '1d20+3'
    && l1[0].label === '攀爬检定' && l1[0].type === 'normal'
    && l1[0].detail === '20+3 → 23',
    JSON.stringify(l1[0]));

  DiceHistory.record({ ok: true, type: 'normal', total: 99 });   // 无 type2
  ok('H5 非 type2=dice 结果拒收', DiceHistory.listAll().length === 1);
  DiceHistory.record({ ok: false, type2: 'dice', type: 'normal', total: 99 });
  ok('H6 ok:false 结果拒收', DiceHistory.listAll().length === 1);

  // check 骰（顺带把 round 推到 2：两条真 user 消息；一条【系统 ·】不计）
  GameState.chatHistory = [
    { role: 'user', content: '推门' },
    { role: 'user', content: '【系统 · 开场白】' },
    { role: 'user', content: '撬锁' }
  ];
  DiceHistory.record({ ok: true, type2: 'dice', type: 'check', expression: '1d100', label: '力量', total: 15, target: 50, check: { level: '成功', class: '常规' } });
  var l2 = DiceHistory.listAll();
  ok('H7 check 骰 detail 格式与 round（系统消息不计轮）',
    l2.length === 2 && l2[1].detail === '1d100 → 15 / 目标 50 → 成功' && l2[1].round === 2,
    JSON.stringify(l2[1]));

  // ---- ③ 查询行为 ----
  ok('H8 listByLabel 关键词命中',
    DiceHistory.listByLabel('攀爬').length === 1 && DiceHistory.listByLabel('不存在').length === 0);
  // H4 首条记于 round=0（夹具 chatHistory 初始为空 → _roundCount()=0，AI 开场白阶段先骰属正常行为）；空轮是 1
  ok('H9 listByRound 命中（round=2）/ 空轮（round=1）不命中', DiceHistory.listByRound(2).length === 1 && DiceHistory.listByRound(1).length === 0);

  var st = DiceHistory.getStats();
  ok('H10 getStats：total/success/fail/byType',
    st.total === 2 && st.success === 1 && st.fail === 0
    && st.byType.normal === 1 && st.byType.check === 1, JSON.stringify(st));

  var fp = DiceHistory.formatRecentForPrompt();
  ok('H11 formatRecentForPrompt：头行 + 条目行',
    fp.indexOf('>>> 【最近骰子记录】') === 0
    && fp.split('\n').length === 3
    && fp.split('\n')[1].indexOf('· 【攀爬检定】') === 0, JSON.stringify(fp));

  // ---- ① executeAll 拦截链（假白名单工具回一个骰子结果） ----
  var before = DiceHistory.listAll().length;
  ToolExecutor.WHITELIST.__smoke_dice = { run: function () {
    return { ok: true, type2: 'dice', type: 'normal', expression: '2d6', dice: [3, 4], mod: 0, total: 7, label: '' };
  } };
  var results = await ToolExecutor.executeAll([JSON.stringify({ name: '__smoke_dice', args: {} })]);
  delete ToolExecutor.WHITELIST.__smoke_dice;
  ok('H12 executeAll 拦截链：结果自动入史',
    results.length === 1 && results[0].type2 === 'dice'
    && DiceHistory.listAll().length === before + 1
    && DiceHistory.listRecent(1)[0].total === 7);

  // ---- ③ 工具查询 ----
  var q = ToolExecutor.WHITELIST.query_dice_history.run({});
  ok('H13 query_dice_history 返回结构（type=query + stats + list≤30）',
    q && q.ok === true && q.type === 'query' && q.queryType === 'dice_history'
    && q.data && q.data.stats && q.data.stats.total === 3
    && Array.isArray(q.data.list) && q.data.list.length <= 30, JSON.stringify(q && q.data && q.data.stats));

  // ---- ⑤ 落盘行为 ----
  var big = [];
  for (var i = 0; i < 205; i++) big.push({ round: 1, type: 'normal', total: i, detail: 'x' + i });
  DiceHistory.setRuntime(big);
  ok('H14 save 截断 MAX_RECORDS=200（内存态）', DiceHistory.listAll().length === 200);
  DiceHistory.load();
  ok('H15 截断后落盘可回读（VFS 回路）', DiceHistory.listAll().length === 200);

  DiceHistory.setRuntime([1, 2, 3, 4, 5].map(function (n) { return { round: n, type: 'normal', total: n, detail: '第' + n + '条' }; }));
  var rec = DiceHistory.listRecent(2);
  ok('H16 listRecent 尾部截取', rec.length === 2 && rec[0].total === 4 && rec[1].total === 5);

  DiceHistory.clear();
  DiceHistory.load();
  ok('H17 clear 清空且落盘（回读仍空）', DiceHistory.listAll().length === 0);

  var savedCard = GameState.currentCardId;
  GameState.currentCardId = '';
  var boom = false;
  try { DiceHistory.load(); DiceHistory.listAll(); } catch (e) { boom = true; }
  GameState.currentCardId = savedCard;
  ok('H18 空档（currentCardId 为空）load/listAll 不炸', boom === false && DiceHistory.listAll().length === 0);

  // ---- 收尾 ----
  console.log('');
  console.log('SUMMARY: ' + okN + ' ok, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
})().catch(function (e) {
  console.error('SMOKE_CRASH', e);
  console.log('SUMMARY: ' + okN + ' ok, ' + failN + ' failed');
  process.exit(1);
});

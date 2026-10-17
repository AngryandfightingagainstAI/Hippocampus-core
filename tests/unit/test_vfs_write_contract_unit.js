// ============================================================
// P55 · 写入契约单测（V 组）
// 主题：VFS.writeJSON / Saves 写方法 / GameState.persist 的「写盘成功与否」
//   必须能被上层看见。旧实现里 writeJSON 丢弃 writeFile 的返回值 ⇒ 恒 undefined，
//   于是 engine/import/vault.js 的 `=== true` 判断恒假、O-2 只能绕过 writeJSON。
//
// 本套件加载的是**真实** vfs/vfs.js、vfs/saves.js、engine/core/gamestate.js，
// 只把 StorageAdapter 换成可控假件（能一键切成「写就抛错」），所以夹的是真行为，
// 不是源码字符串（源码哨兵只作最后一道钉子）。
//
// 跑法：node tests/unit/test_vfs_write_contract_unit.js
//      或 node tools/run_unit_tests.js（整目录）
// ============================================================
'use strict';
const H = require('./_harness.js');
const fs = require('fs');
const path = require('path');
const { makeSandbox, load, run, eq, deepEq, ok, notOk, noThrow, contains, finish } = H;

// ---------- 可控存储适配器 ----------
function makeStorage(opts) {
  opts = opts || {};
  const mem = Object.create(null);
  let fail = !!opts.fail;
  return {
    _mem: mem,
    _setFail: function (v) { fail = !!v; },
    _has: function (k) { return Object.prototype.hasOwnProperty.call(mem, k); },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { if (fail) throw new Error('QuotaExceededError(假)'); mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    key: function (i) { const ks = Object.keys(mem); return ks[i] != null ? ks[i] : null; },
    clear: function () { Object.keys(mem).forEach(function (k) { delete mem[k]; }); },
    estimateBytes: function () { return 0; },
    get length() { return Object.keys(mem).length; }
  };
}

// ---------- 装出一个「真实 vfs + 真实 saves」的沙箱 ----------
function bootVfs(opts) {
  opts = opts || {};
  const sa = makeStorage(opts);
  const win = {};
  if (opts.onWriteFail) win._vfsOnWriteFail = opts.onWriteFail;
  if (opts.onFatal) win._vfsOnFatal = opts.onFatal;
  const sb = makeSandbox({ StorageAdapter: sa, window: win });
  load(sb, 'vfs/vfs.js');
  const VFS = sb.window.VFS;
  sb.VFS = VFS;                                        // saves.js 用裸 VFS
  sb.CardValidator = { normalizeDefs: function (x) { return x; } };
  load(sb, 'vfs/saves.js');
  return { sb: sb, sa: sa, win: win, VFS: VFS, Saves: sb.window.Saves };
}

function src(rel) { return fs.readFileSync(path.join(H.ROOT, rel), 'utf8'); }

// ---------- V1~V5 VFS.writeFile / writeJSON 契约 ----------
run('V1 真实 vfs.js：writeFile 写成功返回 true（回归钉子）', function () {
  const e = bootVfs();
  eq(e.VFS.writeFile('/a.json', '{}'), true, 'writeFile 成功应 true');
  eq(e.VFS.readFile('/a.json'), '{}', '内容应已写入');
});

run('V2 真实 vfs.js：writeJSON 写成功也返回 true（旧实现恒 undefined）', function () {
  const e = bootVfs();
  const r = e.VFS.writeJSON('/b.json', { x: 1 });
  eq(r, true, 'writeJSON 成功应 true');
  deepEq(e.VFS.readJSON('/b.json'), { x: 1 }, '内容应已写入');
});

run('V3 存储抛错且无兜底 ⇒ writeFile 与 writeJSON 都返回 false', function () {
  const e = bootVfs({ fail: true });
  eq(e.VFS.writeFile('/c.json', '{}'), false, 'writeFile 失败应 false');
  eq(e.VFS.writeJSON('/c.json', { x: 1 }), false, 'writeJSON 失败应 false');
});

run('V4 兜底 _vfsOnWriteFail 救回 ⇒ 两者都 true，且不触发 _vfsOnFatal', function () {
  let fatal = 0;
  const sa = makeStorage({ fail: true });
  const sb = makeSandbox({
    StorageAdapter: sa,
    window: {
      // 模拟 vfs_guard：清掉最旧快照后重试（这里直接把「写失败」开关关掉）
      _vfsOnWriteFail: function () { sa._setFail(false); return true; },
      _vfsOnFatal: function () { fatal++; }
    }
  });
  load(sb, 'vfs/vfs.js');
  const VFS = sb.window.VFS;
  eq(VFS.writeJSON('/d.json', { y: 2 }), true, '兜底成功应 true');
  eq(fatal, 0, '兜底成功不该报 fatal');
});

run('V5 兜底也失败 ⇒ 返回 false 且 _vfsOnFatal 收到一次', function () {
  let fatal = 0, lastPath = null;
  const e = bootVfs({
    fail: true,
    onWriteFail: function () { return false; },
    onFatal: function (p) { fatal++; lastPath = p; }
  });
  eq(e.VFS.writeJSON('/e.json', { z: 3 }), false, '兜底失败应 false');
  eq(fatal, 1, 'fatal 应恰好一次');
  eq(lastPath, '/e.json', 'fatal 应收到路径');
});

// ---------- V6~V10 Saves 写方法布尔 ----------
run('V6 Saves.savePlayer：成功 true / 存储坏 false', function () {
  const e = bootVfs();
  eq(e.Saves.savePlayer('c1', 's1', { hp: 1 }, { x: 1 }, null), true, '成功应 true');
  e.sa._setFail(true);
  eq(e.Saves.savePlayer('c1', 's1', { hp: 2 }, { x: 2 }, null), false, '失败应 false');
});

run('V7 Saves.saveChat：成功 true / 存储坏 false（且不抛错）', function () {
  const e = bootVfs();
  const msgs = [];
  for (let i = 0; i < 35; i++) msgs.push({ role: 'user', content: 'm' + i });
  eq(e.Saves.saveChat('c1', 's1', msgs), true, '成功应 true');
  eq(e.VFS.readJSON('/saves/c1/s1/chat/index.json').totalMessages, 35, '索引应记 35');
  e.sa._setFail(true);
  eq(noThrow(function () { return e.Saves.saveChat('c1', 's1', msgs.concat([{ role: 'user', content: 'm35' }])); }, 'saveChat 失败不该抛错'), false, '失败应 false');
});

run('V8 Saves.saveCard：成功 true / 存储坏 false', function () {
  const e = bootVfs();
  eq(e.Saves.saveCard('c1', 's1', { cardId: 'c1' }), true, '成功应 true');
  e.sa._setFail(true);
  eq(e.Saves.saveCard('c1', 's1', { cardId: 'c1' }), false, '失败应 false');
});

run('V9 Saves.touch：没 meta ⇒ false；有 meta 正常 ⇒ true；有 meta 但写坏 ⇒ false', function () {
  const e = bootVfs();
  eq(e.Saves.touch('c1', 's1', 0), false, '没有 meta 应 false');
  e.VFS.writeJSON('/saves/c1/s1/meta.json', { saveId: 's1', cardId: 'c1', playTime: 0 });
  eq(e.Saves.touch('c1', 's1', 5), true, '正常应 true');
  eq(e.VFS.readJSON('/saves/c1/s1/meta.json').playTime, 5, 'playTime 应累加');
  e.sa._setFail(true);
  eq(e.Saves.touch('c1', 's1', 5), false, '写坏应 false');
});

run('V10 Saves.rename / setPlayerName：有 meta true，没 meta false', function () {
  const e = bootVfs();
  eq(e.Saves.rename('c1', 's1', '新名'), false, '没 meta 应 false');
  eq(e.Saves.setPlayerName('c1', 's1', '阿离'), false, '没 meta 应 false');
  e.VFS.writeJSON('/saves/c1/s1/meta.json', { saveId: 's1', cardId: 'c1' });
  eq(e.Saves.rename('c1', 's1', '新名'), true, '有 meta 应 true');
  eq(e.Saves.setPlayerName('c1', 's1', '阿离'), true, '有 meta 应 true');
  eq(e.VFS.readJSON('/saves/c1/s1/meta.json').displayName, '新名', '改名应落盘');
});

// ---------- V11 GameState.persist 透传 ----------
run('V11 GameState.persist：全成功 true / 有失败 false / 无存档 true / 不抛错', function () {
  const e = bootVfs();
  load(e.sb, 'engine/core/gamestate.js');
  e.sb.Saves = e.sb.window.Saves;              // gamestate.js 用裸 Saves
  const GS = e.sb.GameState;
  ok(GS && typeof GS.persist === 'function', 'gamestate.js 应导出 persist');
  GS.currentCardId = 'c1'; GS.currentSaveId = 's1';
  GS.playerData = {}; GS.currentState = {}; GS._gameTime = null; GS.chatHistory = [];
  GS._sessionStart = Date.now();
  e.VFS.writeJSON('/saves/c1/s1/meta.json', { saveId: 's1', cardId: 'c1', playTime: 0, displayName: '档一' });

  eq(noThrow(function () { return GS.persist(); }, 'persist 不该抛错'), true, '全成功应 true');

  const realSaves = e.sb.Saves;
  e.sb.Saves = {
    savePlayer: function () { return true; },
    saveChat: function () { return false; },
    touch: function () { return true; }
  };
  eq(GS.persist(), false, 'saveChat 失败 ⇒ false');
  e.sb.Saves = {
    savePlayer: function () { return true; },
    saveChat: function () { return true; },
    touch: function () { return false; }
  };
  eq(GS.persist(), false, 'touch 失败 ⇒ false');
  e.sb.Saves = realSaves;

  const cid = GS.currentCardId, sid = GS.currentSaveId;
  GS.currentCardId = null; GS.currentSaveId = null;
  eq(GS.persist(), true, '没有存档可写应 true（不是失败）');
  GS.currentCardId = cid; GS.currentSaveId = sid;
});

// ---------- V12 源码哨兵（两仓同源文件都要含） ----------
run('V12 源码哨兵：writeJSON 透出返回值 + Saves 写方法判失败 + persist 判失败', function () {
  const vfsSrc = src('vfs/vfs.js');
  contains(vfsSrc, 'writeJSON: function(path, obj) { return this.writeFile(path, JSON.stringify(obj)); }', 'vfs.js writeJSON 应 return writeFile');
  notOk(/writeJSON:\s*function\s*\(path,\s*obj\)\s*\{\s*this\.writeFile\(/.test(vfsSrc), 'vfs.js 不该再有丢弃返回值的 writeJSON');
  contains(vfsSrc, 'function saveDirs(dirs) {\n    try { StorageAdapter.setItem(DIRS_KEY', 'vfs.js saveDirs 应带兜底（索引写失败不抛）');

  const savesSrc = src('vfs/saves.js');
  const nGuard = (savesSrc.match(/!== false/g) || []).length;
  const nFalse = (savesSrc.match(/=== false/g) || []).length;
  ok(nGuard >= 7, 'saves.js 里 !== false 应至少 7 处（实际 ' + nGuard + '）');
  ok(nFalse >= 3, 'saveChat 里 === false 应至少 3 处（实际 ' + nFalse + '）');
  ['savePlayer', 'saveChat', 'saveCard', 'touch', 'rename', 'setPlayerName'].forEach(function (m) {
    contains(savesSrc, m, 'saves.js 应有 ' + m);
  });

  const gsSrc = src('engine/core/gamestate.js');
  contains(gsSrc, 'if (!this.currentCardId || !this.currentSaveId) return true;', 'persist 无存档应返回 true');
  contains(gsSrc, 'return ok;', 'persist 应返回累计结果');
  ok((gsSrc.match(/=== false/g) || []).length >= 3, 'persist 应逐项判 === false');
});

run('V13 存储只对目录索引写失败 ⇒ mkdir/writeFile 不抛，数据文件照常写入', function () {
  // 只让 vfs_dirs 这一个键写失败：模拟「数据写进去了、索引没写进去」的窄缝。
  const mem = Object.create(null);
  const sa = {
    _mem: mem,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { if (k === 'vfs_dirs') throw new Error('QuotaExceededError(假·仅索引)'); mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    key: function (i) { const ks = Object.keys(mem); return ks[i] != null ? ks[i] : null; },
    get length() { return Object.keys(mem).length; }
  };
  const sb = makeSandbox({ StorageAdapter: sa, window: {} });
  load(sb, 'vfs/vfs.js');
  const VFS = sb.window.VFS;
  noThrow(function () { VFS.mkdir('/a/b'); }, 'mkdir 不该把索引写失败抛出来');
  eq(VFS.writeFile('/a/b/c.json', '{}'), true, '数据写成功应仍返回 true');
  eq(VFS.readFile('/a/b/c.json'), '{}', '数据文件应已写入');
});

// ---------- V14~V16 P56：失败归因分流 + 存储可用性探针 ----------
function bootGuard() {
  const recs = [];
  const hints = [];
  const sb = makeSandbox({
    ErrorLog: {
      record: function (r) { recs.push(r); return true; },
      audit: function () { return true; }, action: function () {}, error: function () {}, log: function () {}
    },
    Platform: { ui: { appendHint: function (h) { hints.push(String(h)); } } }
  });
  load(sb, 'vfs/vfs_guard.js');
  return { sb: sb, recs: recs, hints: hints, fatal: sb.window._vfsOnFatal };
}

run('V14 真实 vfs_guard：失败按成因分流 —— 只有配额满才说「空间已满」', function () {
  // 配额满：保留旧文案与旧 type（诊断口径兼容）
  let g = bootGuard();
  g.fatal('/saves/c1/s1/chat.json', { name: 'QuotaExceededError', message: 'QuotaExceededError: quota exceeded' });
  eq(g.recs.length, 1, '应记一条 error_log');
  eq(g.recs[0].type, 'StorageFull', '配额满 ⇒ type 仍是 StorageFull');
  ok(g.hints[0].indexOf('存储空间已满') >= 0, '配额满 ⇒ 提示清空间');

  // op-sqlite 未就绪：让玩家去清空间解决不了问题
  g = bootGuard();
  g.fatal('/saves/c1/s1/chat.json', { name: 'StorageUnavailableError', message: 'StorageAdapter: op-sqlite unavailable' });
  eq(g.recs[0].type, 'StorageUnavailable', '库不可用 ⇒ type StorageUnavailable');
  ok(g.hints[0].indexOf('本地存储不可用') >= 0, '库不可用 ⇒ 提示重启/导出');
  notOk(g.hints[0].indexOf('存储空间已满') >= 0, '库不可用 ⇒ 不该说空间已满');

  // 其它（磁盘/数据库/序列化）：带出原因，不猜
  g = bootGuard();
  g.fatal('/saves/c1/s1/chat.json', { name: 'Error', message: 'disk I/O error' });
  eq(g.recs[0].type, 'StorageWriteFailed', '其它 ⇒ type StorageWriteFailed');
  ok(g.hints[0].indexOf('disk I/O error') >= 0, '其它 ⇒ 文案带原因');
  notOk(g.hints[0].indexOf('存储空间已满') >= 0, '其它 ⇒ 不该说空间已满');

  // 没有错误对象也不能崩
  g = bootGuard();
  noThrow(function () { g.fatal('/saves/c1/s1/chat.json', null); }, 'err 为 null 不该抛');
  eq(g.recs[0].type, 'StorageWriteFailed', '未知原因 ⇒ StorageWriteFailed');
  ok(g.hints[0].indexOf('未知') >= 0, '未知原因 ⇒ 文案标明未知');
});

run('V15 真实 storage_adapter：isAvailable 说真话，读静默/写抛的语义没被动', function () {
  const SA = require(path.join(H.ROOT, 'vfs', 'storage_adapter.js'));
  eq(typeof SA.isAvailable, 'function', '应有只读探针 isAvailable');
  eq(SA.isAvailable(), false, 'Node 环境既无 localStorage 也无可用 op-sqlite ⇒ 不可用');
  eq(SA.getItem('vfs:whatever'), null, '读仍静默返 null（刻意设计，本轮未改）');
  eq(SA.length, 0, 'length 仍为 0');
  let thrown = null;
  try { SA.setItem('vfs:whatever', 'x'); } catch (e) { thrown = e; }
  ok(thrown && thrown.name === 'StorageUnavailableError', '写仍抛 StorageUnavailableError（未改）');
});

run('V16 源码哨兵：guard 归因分流齐备 + adapter 三支都挂 isAvailable', function () {
  const g = src('vfs/vfs_guard.js');
  contains(g, 'function classifyFailure(err) {', 'guard 应有归因函数');
  contains(g, "'StorageFull'", 'quota 仍用 StorageFull');
  contains(g, "'StorageUnavailable'", '应有「库不可用」归类');
  contains(g, "'StorageWriteFailed'", '应有「其它错误」归类');
  contains(g, '本地存储不可用', '应有库不可用文案');
  contains(g, '存储空间已满', '配额文案应保留');
  notOk(/type:\s*'StorageFull',/.test(g), '不该再有无条件 type: StorageFull');

  const a = src('vfs/storage_adapter.js');
  eq((a.match(/isAvailable: function\(\)/g) || []).length, 3, 'adapter 三支都要有 isAvailable');
  contains(a, 'isAvailable: function() { return false; },', '兜底支应报不可用');
  contains(a, 'isAvailable: function() { return true; },', '可用支应报可用');
});

finish();

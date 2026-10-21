// ============================================================
// P54·§四 F1 单测：快照跨压缩回退（engine/snapshots.js）
//   F1-1 未压缩：切点 = 当时长度（与旧口径逐字一致）+ 数据回退 + 删后续快照
//   F1-2 压缩后锚点仍在：切在锚点之后（旧实现这里是静默 no-op）
//   F1-3 锚点也被压缩归档：整条拒绝，且 GameState 一点没动、后续快照没删
//   F1-4 旧快照（无 anchor）未压缩：沿用老口径（向后兼容）
//   F1-5 旧快照 + 已压缩：拒绝（老实现的静默 no-op 变成明确拒绝）
//   F1-6 重复输入：锚点没了但数组里还有同文条目 ⇒ 前驱指纹拦下，不许切错位置
//   F1-7 快照不存在：ok=false / reason='快照不存在'（既有行为）
//   F1-8 rollbackLast（=「重新生成」走的路）：仍能定位到最新那份快照
//   F1-9 源码哨兵：两仓 snapshots.js 归一后逐字同源 + 关键行在位（另一仓不可见则跳过）
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const RN_ROOT = H.ROOT;
// 另一仓（桌面）可能不在本机（CI 上就没有）：读不到就明确跳过跨仓那半，
// 不让 fs 抛异常把整套打红（同 tests/unit/test_prompt_deduction_unit.js）。
const PC_ROOT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';
const HAVE_PC = fs.existsSync(path.join(PC_ROOT, 'engine', 'snapshots.js'));
function readNorm(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
if (!HAVE_PC) console.log('       （另一仓不可见：' + PC_ROOT + ' ⇒ F1-9 的跨仓断言跳过，只查本仓）');

// 内存 VFS 补齐 snapshots.js 需要的目录级接口
function mkVFS() {
  const vfs = H.makeVFS();
  vfs.mkdir = function() { return true; };
  vfs.listAll = function(dir) {
    return Object.keys(vfs._files).filter(function(p) { return p.indexOf(dir + '/') === 0; });
  };
  vfs.deleteFile = function(p) { return vfs.remove(p); };
  vfs.rmdir = function(dir) {
    Object.keys(vfs._files).forEach(function(p) { if (p.indexOf(dir + '/') === 0) delete vfs._files[p]; });
  };
  return vfs;
}

function mk(history, extraGS) {
  const gs = Object.assign({
    currentCardId: 'c1',
    currentSaveId: 's1',
    chatHistory: history,
    playerData: { hp: 100 },
    currentState: { hud: [{ key: 'hp', current: 100 }] },
    _gameTime: { year: 2026, month: 1, day: 5, hour: 9, minute: 0 },
    _pendingSystemNotices: [],
    _sessionToken: 0,
    invalidateCache: function() { this._cacheInvalidated = true; }
  }, extraGS || {});
  const vfs = mkVFS();
  const sb = H.makeSandbox({ VFS: vfs, GameState: gs });
  H.load(sb, 'engine/snapshots.js');
  return { sb: sb, gs: gs, vfs: vfs, S: sb.window.Snapshots };
}

// 造 sys + 每轮 [user, assistant] 的历史
function rounds(upTo, startAt) {
  const out = [{ role: 'system', content: 'SYS' }];
  for (let r = (startAt || 1); r <= upTo; r++) {
    out.push({ role: 'user', content: '第' + r + '轮' });
    out.push({ role: 'assistant', content: 'GM' + r });
  }
  return out;
}
const SNAP = function(round) { return '/saves/c1/s1/snapshots/r' + String(round).padStart(4, '0') + '.json'; };

// ---------- F1-1 未压缩（回归锚：与旧行为逐字一致） ----------
H.run('F1-1 未压缩：切点=当时长度、数据回退、历史截断、删后续快照', function() {
  const full = rounds(2);                       // sys u1 G1 u2 G2
  const h = mk(full.slice(0, 2));               // 压快照时历史才到第 1 轮
  h.gs.playerData = { hp: 100 };
  H.ok(h.S.push('round') === true, 'F1-1 第 1 轮快照压下成功');
  H.contains(h.vfs.readFile(SNAP(1)), '"anchor"', 'F1-1 快照里应记下锚点');
  h.gs.chatHistory = full.slice();              // 继续玩到第 2 轮
  h.gs.playerData = { hp: 50 };
  const r = h.S.rollbackTo(1);
  H.ok(r.ok, 'F1-1 回退成功');
  H.eq(r.cut, 2, 'F1-1 切点=2（旧口径的 chatLength）');
  H.eq(r.cutBy, 'anchor', 'F1-1 走锚点定位');
  H.eq(h.gs.chatHistory.length, 2, 'F1-1 历史截断到 2 条');
  H.eq(h.gs.playerData.hp, 100, 'F1-1 玩家数据回退');
  H.deepEq(h.S.list().map(function(s) { return s.round; }), [1], 'F1-1 之后的快照被删');
});

// ---------- F1-2 压缩后锚点仍在：真截断 ----------
H.run('F1-2 压缩后锚点仍在：切在锚点之后（旧实现是静默 no-op）', function() {
  const full = rounds(6);                       // 13 条
  const h = mk(full.slice(0, 7));               // 压快照时到第 3 轮 → chatLength=7，锚点=G3、前驱=u3
  H.ok(h.S.push('round') === true, 'F1-2 第 3 轮快照压下成功');
  h.gs.chatHistory = full.slice();              // 玩到第 6 轮
  // 模拟 story.js maybeCompress：只保留尾部（从第 2 轮开始）⇒ 下标整体前移 2
  h.gs.chatHistory = [full[0]].concat(full.slice(3));
  H.eq(h.gs.chatHistory.length, 11, 'F1-2 压缩后数组 11 条');
  const r = h.S.rollbackTo(3);
  H.ok(r.ok, 'F1-2 回退成功（旧实现：slice(0,7) 长度够，但仍切错位置）');
  // 压缩丢掉 u1/G1 后整条数组前移 2 ⇒ 锚点 G3 的下标从 6 变成 4 ⇒ 切点 5（drift=2）
  H.eq(r.cut, 5, 'F1-2 切点=5（锚点 G3 压缩后的真实位置+1）');
  H.eq(r.cutBy, 'anchor', 'F1-2 走锚点定位');
  H.eq(h.gs.chatHistory.length, 5, 'F1-2 历史真的被截断');
  H.eq(h.gs.chatHistory[4].content, 'GM3', 'F1-2 最后一条是快照点的 GM3');
  H.eq(h.gs.chatHistory[3].content, '第3轮', 'F1-2 玩家输入留着');
});

// ---------- F1-3 锚点被压缩归档 ⇒ 拒绝且不动数据 ----------
H.run('F1-3 锚点也被压缩归档：整条拒绝，GameState 一点没动、后续快照没删', function() {
  const full = rounds(6);
  const h = mk(full.slice(0, 4));               // 第 2 轮快照（chatLength=4）
  h.S.push('round');
  h.S.push('round');                            // 同轮重复压：仍是 r0002
  h.gs.chatHistory = full.slice();
  h.gs.chatHistory = [full[0]].concat(full.slice(7));  // 压缩只留第 4..6 轮 ⇒ 锚点(u2)没了
  const before = JSON.stringify({
    hist: h.gs.chatHistory, pd: h.gs.playerData, st: h.gs.currentState,
    list: h.S.list().map(function(s) { return s.round; })
  });
  const r = h.S.rollbackTo(2);
  H.notOk(r.ok, 'F1-3 应拒绝');
  H.contains(r.reason, '压缩', 'F1-3 原因点明「已被压缩归档」');
  H.eq(r.split, true, 'F1-3 标记为「会造成分裂回退」');
  H.eq(JSON.stringify({
    hist: h.gs.chatHistory, pd: h.gs.playerData, st: h.gs.currentState,
    list: h.S.list().map(function(s) { return s.round; })
  }), before, 'F1-3 拒绝时不许改任何状态（旧实现是「状态回退、对话不动」）');
});

// ---------- F1-4 旧快照（无 anchor）未压缩 ⇒ 老口径 ----------
H.run('F1-4 旧快照（无 anchor）+ 未压缩：沿用老口径（向后兼容老存档）', function() {
  const full = rounds(3);
  const h = mk(full.slice());
  h.vfs.writeJSON(SNAP(2), {
    round: 2, timestamp: 1, reason: 'round', chatLength: 4,
    playerData: { hp: 7 }, currentState: null, gameTime: null, pendingNotices: [], systems: {}
  });
  const r = h.S.rollbackTo(2);
  H.ok(r.ok, 'F1-4 回退成功');
  H.eq(r.cutBy, 'legacy-length', 'F1-4 走老口径');
  H.eq(r.cut, 4, 'F1-4 切点=chatLength');
  H.eq(h.gs.chatHistory.length, 4, 'F1-4 历史截断到 4 条');
  H.eq(h.gs.playerData.hp, 7, 'F1-4 数据回退');
});

// ---------- F1-5 旧快照 + 已压缩 ⇒ 拒绝（不再静默 no-op） ----------
H.run('F1-5 旧快照 + 已压缩：拒绝，不再做静默 no-op 的分裂回退', function() {
  const full = rounds(6);
  const h = mk(full.slice());
  h.vfs.writeJSON(SNAP(2), {
    // 旧格式快照：记的是「当时 20 条」，现在只剩 13 条 ⇒ 中间被压缩过，但老快照没有锚点可核
    round: 2, timestamp: 1, reason: 'round', chatLength: 20,
    playerData: { hp: 7 }, currentState: null, gameTime: null, pendingNotices: [], systems: {}
  });
  const pdBefore = JSON.stringify(h.gs.playerData);
  const r = h.S.rollbackTo(2);
  H.notOk(r.ok, 'F1-5 应拒绝');
  H.contains(r.reason, '压缩归档', 'F1-5 原因');
  H.eq(JSON.stringify(h.gs.playerData), pdBefore, 'F1-5 没动数据');
});

// ---------- F1-6 重复输入：靠前驱指纹拦下切错位置 ----------
H.run('F1-6 重复输入：锚点没了但数组里还有同文条目 ⇒ 前驱对不上就不认', function() {
  const hist = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: '继续' }, { role: 'assistant', content: 'GM1' },
    { role: 'user', content: '继续' }, { role: 'assistant', content: 'GM2' },   // 第 2 轮快照的锚点
    { role: 'user', content: '继续' }, { role: 'assistant', content: 'GM3' }    // 之后又打了一次同样的
  ];
  const h = mk(hist);
  h.gs.chatHistory = hist;
  // 手工压第 2 轮的快照：锚点 = '继续'(idx 3)、前驱 = 'GM1'(idx 2)
  H.ok(h.S.push('round') === true, 'F1-6 第 3 轮快照压下成功（锚点=最后一条）');
  // 换个场景：直接构造「锚点=第 2 轮那条，但数组里只剩同文的新条目」
  h.vfs.writeJSON(SNAP(2), {
    round: 2, timestamp: 1, reason: 'round', chatLength: 5,
    anchor: { role: 'user', len: 2, hash: h.S._fp({ role: 'user', content: '继续' }).hash },
    anchorLead: { role: 'assistant', len: 3, hash: h.S._fp({ role: 'assistant', content: 'GM1' }).hash },
    playerData: { hp: 3 }, currentState: null, gameTime: null, pendingNotices: [], systems: {}
  });
  h.gs.chatHistory = [hist[0], hist[5], hist[6]];   // '继续'(第3轮) + GM3，第 2 轮那条已归档
  const before = JSON.stringify(h.gs.chatHistory);
  const r = h.S.rollbackTo(2);
  H.notOk(r.ok, 'F1-6 应拒绝（不许切在重复的第 3 轮输入后面）');
  H.eq(JSON.stringify(h.gs.chatHistory), before, 'F1-6 历史未动');
});

// ---------- F1-7 快照不存在 ----------
H.run("F1-7 快照不存在：ok=false / reason='快照不存在'", function() {
  const h = mk(rounds(2));
  const r = h.S.rollbackTo(99);
  H.notOk(r.ok, 'F1-7 拒绝');
  H.eq(r.reason, '快照不存在', 'F1-7 既有文案不变');
});

// ---------- F1-8 rollbackLast（重新生成） ----------
H.run('F1-8 rollbackLast：定位最新快照并按锚点截断', function() {
  const full = rounds(3);
  const h = mk(full.slice(0, 3));               // 到第 1 轮
  h.S.push('round');
  h.gs.chatHistory = full.slice(0, 5);          // 到第 2 轮
  h.S.push('round');
  h.gs.chatHistory = full.slice();              // 到第 3 轮
  const r = h.S.rollbackLast();
  H.ok(r.ok, 'F1-8 回退成功');
  H.eq(r.round, 2, 'F1-8 目标是第 2 轮');
  H.eq(h.gs.chatHistory.length, 5, 'F1-8 截断到第 2 轮快照点的长度');
  H.deepEq(h.S.list().map(function(s) { return s.round; }), [1, 2], 'F1-8 只剩两枚快照');
});

// ---------- F1-9 源码哨兵（两仓同源） ----------
H.run('F1-9 源码哨兵：两仓 snapshots.js 归一后逐字同源 + 关键行在位', function() {
  const rn = readNorm(path.join(RN_ROOT, 'engine', 'snapshots.js'));
  for (const must of [
    '_cutIndex: function(snap) {',
    'anchorLead: hist.length > 1 ? this._fp(hist[hist.length - 2]) : null,',
    'var cut = this._cutIndex(snap);',
    'if (cut.cut < 0) return { ok: false, reason: cut.reason, split: true };',
    'GameState.chatHistory = (GameState.chatHistory || []).slice(0, cut.cut);',
    // ★ P72·W0-b：返回值多了 lostMsgIds（被切走分支的节点 id，供 Logger.archiveAfter
    //   归档日志；不再物理删日志）。哨兵跟着 W0-b 的口径改，语义仍是"这条返回语句在"。
    'return { ok: true, round: round, snap: snap, cut: cut.cut, cutBy: cut.how, lostMsgIds: lostMsgIds };'
  ]) H.contains(rn, must, 'F1-9 本仓应有：' + must);
  H.notOk(rn.indexOf('slice(0, snap.chatLength)') >= 0, 'F1-9 老的下标截断写法应消失');
  if (HAVE_PC) {
    H.eq(rn, readNorm(path.join(PC_ROOT, 'engine', 'snapshots.js')), 'F1-9 两仓归一后应逐字相同');
  } else {
    console.log('       （F1-9 跨仓同源断言跳过：另一仓不可见）');
  }
});

H.finish();

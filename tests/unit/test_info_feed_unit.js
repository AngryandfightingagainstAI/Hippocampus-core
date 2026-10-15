// ============================================================
// 单元测试 · engine/info_feed.js（P54·第15条）
// 该模块此前只有 smoke 覆盖（info_tick / log_query / num_editor / worldbook），
// 没有单测。这里夹住它的数据层边界：缺字段补齐、未知枚举回落、坏档降级、
// 深拷贝不串改、线程幂等、未读计数。全部用内存 VFS 假件，不碰真实存储。
// 运行：node tests/unit/test_info_feed_unit.js
// ============================================================
const H = require('./_harness.js');

function sb(over) {
  const s = H.makeSandbox(Object.assign({
    GameState: {
      currentCardId: 'card1',
      currentSaveId: 'save1',
      currentRound: 3,
      formatGameTime: function() { return '第 1 天 08:00'; }
    },
    ErrorLog: { audit: function() { return true; }, action: function() {}, error: function() {}, log: function() {} }
  }, over || {}));
  H.load(s, 'engine/info_feed.js');
  s.IF = s.window.InfoFeed;
  return s;
}

// ============ I1–I5 · 空档与字段规范化 ============
H.run('I1-_empty 形状（version/seq/threads/threadOrder/broadcasts/seen/meta）', function() {
  const s = sb();
  const d = s.IF._empty();
  H.eq(d.version, 1, 'version');
  H.eq(d.seq, 0, 'seq');
  H.deepEq(d.threads, {}, 'threads');
  H.deepEq(d.threadOrder, [], 'threadOrder');
  H.deepEq(d.broadcasts, [], 'broadcasts');
  H.deepEq(d.seen, {}, 'seen');
  H.eq(d.meta.lastTickAt, null, 'meta.lastTickAt');
  H.eq(d.meta.lastTickRound, -1, 'meta.lastTickRound');
  H.eq(d.meta.aiSendCount, 0, 'meta.aiSendCount');
});

H.run('I2-未知 flow/importance 回落默认，缺字段补齐（不改对象身份）', function() {
  const s = sb();
  const m = { flow: '乱写', importance: '瞎编', id: 5, read: 'yes' };
  const out = s.IF._ensureMessage(m);
  H.eq(out, m, '就地规范化并返回同一对象');
  H.eq(m.flow, 'info', '未知 flow → info');
  H.eq(m.importance, 'background', '未知 importance → background');
  H.eq(m.id, '', '非字符串 id → 空串');
  H.eq(m.read, false, '非布尔 read → false');
  H.eq(m.origin, 'ai', '缺 origin → ai');
  H.eq(m.fromName, m.from, 'fromName 缺省跟随 from');
});

H.run('I3-非对象入参原样返回，不抛', function() {
  const s = sb();
  H.eq(s.IF._ensureMessage(null), null, 'null');
  H.eq(s.IF._ensureMessage(undefined), undefined, 'undefined');
});

H.run('I4-广播的 publicity/scope 未知值回落默认，数组字段兜底', function() {
  const s = sb();
  const bc = { publicity: '乱写', scope: '瞎编', tags: 'not-array', propagated: null };
  s.IF._ensureBroadcast(bc);
  H.eq(Array.isArray(bc.tags), true, 'tags 归一为数组');
  H.eq(Array.isArray(bc.propagated), true, 'propagated 归一为数组');
  H.eq(typeof bc.publicity, 'string', 'publicity 是字符串');
  H.eq(typeof bc.scope, 'string', 'scope 是字符串');
  H.eq(bc.round, -1, 'round 缺省 -1');
  H.eq(bc.flow, 'info', 'flow 缺省 info');
});

H.run('I5-_path 需要卡带 id 与存档 id', function() {
  const s = sb();
  H.eq(s.IF._path(), '/saves/card1/save1/info_feed.json', '完整 id');
  s.GameState.currentSaveId = null;
  H.eq(s.IF._path(), null, '缺存档 id');
});

// ============ I6–I9 · 读写与坏档降级 ============
H.run('I6-无档时 load 得到空档（不抛）', function() {
  const s = sb();
  s.IF.load();
  H.deepEq(s.IF.getRuntime().threads, {}, 'threads 为空');
});

H.run('I7-坏 JSON 降级为空档，不抛（vfs.readJSON 返回 null）', function() {
  const s = sb();
  s.VFS._files['/saves/card1/save1/info_feed.json'] = '{这不是 JSON';
  s.IF.load();
  const d = s.IF.getRuntime();
  H.eq(d.version, 1, '降级为空档');
  H.deepEq(d.threads, {}, 'threads 为空');
});

H.run('I8-setRuntime 规范化后落盘，且 getRuntime 拿到的是深拷贝', function() {
  const s = sb();
  s.IF.setRuntime({ seq: 7, threads: {} });
  const path = '/saves/card1/save1/info_feed.json';
  H.ok(s.VFS._files[path], '已落盘');
  const copy = s.IF.getRuntime();
  H.eq(copy.seq, 7, '读回 seq');
  copy.seq = 99;                       // 改副本
  H.eq(s.IF.getRuntime().seq, 7, '改副本不影响内部状态');
  H.deepEq(s.IF.getRuntime().meta, { lastTickAt: null, lastTickRound: -1, aiSendCount: 0 }, 'meta 补齐');
});

H.run('I9-_ensureShape 迁移残缺档：null 线程被删、非对象容器的字段补齐', function() {
  const s = sb();
  s.IF.setRuntime({ threads: { t1: {}, bad: null }, threadOrder: null, broadcasts: null, seen: null, meta: null });
  const d = s.IF.getRuntime();
  H.eq(d.threads.t1.id, 't1', '线程 id 补自键名');
  H.eq(d.threads.t1.kind, 'direct', 'kind 缺省 direct');
  H.eq(d.threads.t1.title, 't1', 'title 缺省取 id');
  H.eq(d.threads.t1.unread, 0, 'unread 缺省 0');
  H.eq(Array.isArray(d.threads.t1.participants), true, 'participants 归一为数组');
  H.eq(d.threads.bad, undefined, 'null 线程被删除');
  H.eq(Array.isArray(d.threadOrder), true, 'threadOrder 归一为数组');
  H.eq(Array.isArray(d.broadcasts), true, 'broadcasts 归一为数组');
  H.eq(typeof d.seen, 'object', 'seen 归一为对象');
  H.eq(d.meta.lastTickRound, -1, 'meta 补齐');
});

// ============ I10–I14 · 序列号与空态查询 ============
H.run('I10-_uid 递增 seq', function() {
  const s = sb();
  H.eq(s.IF._uid('m'), 'm1', '第一次');
  H.eq(s.IF._uid('m'), 'm2', '第二次');
  H.eq(s.IF._uid('t'), 't3', '前缀不同但序号共享');
});

H.run('I11-clear 复位为空档并落盘', function() {
  const s = sb();
  s.IF.setRuntime({ seq: 42, threads: { t1: { id: 't1' } }, threadOrder: ['t1'] });
  s.IF.clear();
  const d = s.IF.getRuntime();
  H.eq(d.seq, 0, 'seq 复位');
  H.deepEq(d.threads, {}, 'threads 清空');
  H.ok(s.VFS._files['/saves/card1/save1/info_feed.json'], '复位结果落盘');
});

H.run('I12-空档下的列表/计数接口返回空值', function() {
  const s = sb();
  H.deepEq(s.IF.listThreads(), [], 'listThreads');
  H.deepEq(s.IF.listBroadcasts(), [], 'listBroadcasts');
  H.eq(s.IF.unreadTotal(), 0, 'unreadTotal');
  H.eq(s.IF.getThread('不存在'), null, 'getThread 未知 id');
});

H.run('I13-_hasAnyInfo 空档为假', function() {
  const s = sb();
  H.eq(s.IF._hasAnyInfo(), false, '空档无情报');
});

// ============ I14–I17 · 写入路径 ============
H.run('I14-ensureThread 幂等：同一 key 反复调用只建一条', function() {
  const s = sb();
  const a = s.IF.ensureThread('npc:npc_a', { title: '阿甲', kind: 'direct', participants: ['player', 'npc_a'] });
  const b = s.IF.ensureThread('npc:npc_a', {});
  H.ok(a && b, '两次都返回线程对象');
  H.eq(a.id, b.id, '同一线程');
  H.eq(s.IF.listThreads().length, 1, '线程数');
});

H.run('I15-pushMessage 未知枚举回落默认并累加未读', function() {
  const s = sb();
  s.IF.pushMessage({ from: 'npc_a', fromName: '阿甲', to: 'player', text: '你好', flow: '乱写', importance: '瞎编' });
  const list = s.IF.listThreads();
  H.eq(list.length, 1, '自动建线程');
  const th = s.IF.getThread(list[0].id);
  H.eq(th.messages.length, 1, '消息数');
  H.eq(th.messages[0].flow, 'info', '未知 flow 回落');
  H.eq(th.messages[0].importance, 'background', '未知 importance 回落');
  H.eq(th.messages[0].text, '你好', '正文');
  H.eq(s.IF.unreadTotal(), 1, '未读 +1');
});

H.run('I16-markRead / setImportance 对未知 id 不抛', function() {
  const s = sb();
  H.noThrow(function() { s.IF.markRead('不存在的线程'); }, 'markRead');
  H.noThrow(function() { s.IF.setImportance('不存在的消息', 'actionable'); }, 'setImportance');
});

H.run('I17-_parseTick 面对垃圾输入不抛（畸形 JSON 只入 ErrorLog）', function() {
  const s = sb();
  const r = H.noThrow(function() { return s.IF._parseTick('这根本不是 JSON'); }, '_parseTick');
  H.ok(r === null || typeof r === 'object', '_parseTick 返回 null 或对象');
  H.noThrow(function() { return s.IF._parseTick(''); }, '空串');
  H.noThrow(function() { return s.IF._parseTick('{"threads": 不是数组}'); }, '结构不对');
});

H.finish();

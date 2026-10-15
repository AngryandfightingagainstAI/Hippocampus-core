// ============================================================
// 单元测试 · engine/info_feed.js（P54·第15条）
// 该模块此前只有 smoke 覆盖（info_tick / log_query / num_editor / worldbook），
// 没有单测。这里夹住它的数据层边界：缺字段补齐、未知枚举回落、坏档降级、
// 深拷贝不串改、线程幂等、未读计数。全部用内存 VFS 假件，不碰真实存储。
// 运行：node tests/unit/test_info_feed_unit.js
// ============================================================
const H = require('./_harness.js');

function sb(over) {
  const audits = [];
  const s = H.makeSandbox(Object.assign({
    GameState: {
      currentCardId: 'card1',
      currentSaveId: 'save1',
      currentRound: 3,
      formatGameTime: function() { return '第 1 天 08:00'; }
    },
    ErrorLog: { audit: function(k, t, d) { audits.push([k, t, String(d)]); return true; }, action: function() {}, error: function() {}, log: function() {} }
  }, over || {}));
  s.audits = audits;
  // O-8：JSON 提取已收敛到共享件，引擎件按裸名找 CardDiagnose ⇒ 沙箱要把它挂成上下文全局
  H.load(s, 'engine/card_diagnose.js');
  s.CardDiagnose = s.window.CardDiagnose;
  H.load(s, 'engine/info_feed.js');
  s.IF = s.window.InfoFeed;
  return s;
}

// ============ I1–I5 · 空档与字段规范化 ============
H.run('I1-_empty 形状（version/seq/threads/threadOrder/broadcasts/meta）', function() {
  const s = sb();
  const d = s.IF._empty();
  H.eq(d.version, 1, 'version');
  H.eq(d.seq, 0, 'seq');
  H.deepEq(d.threads, {}, 'threads');
  H.deepEq(d.threadOrder, [], 'threadOrder');
  H.deepEq(d.broadcasts, [], 'broadcasts');
  H.eq(typeof d.seen, 'undefined', 'seen 已从 schema 删除（I-11：有字段无读写，去重从未实现）');
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
  s.IF.setRuntime({ threads: { t1: {}, bad: null }, threadOrder: null, broadcasts: null, meta: null });
  const d = s.IF.getRuntime();
  H.eq(d.threads.t1.id, 't1', '线程 id 补自键名');
  H.eq(d.threads.t1.kind, 'direct', 'kind 缺省 direct');
  H.eq(d.threads.t1.title, 't1', 'title 缺省取 id');
  H.eq(d.threads.t1.unread, 0, 'unread 缺省 0');
  H.eq(Array.isArray(d.threads.t1.participants), true, 'participants 归一为数组');
  H.eq(d.threads.bad, undefined, 'null 线程被删除');
  H.eq(Array.isArray(d.threadOrder), true, 'threadOrder 归一为数组');
  H.eq(Array.isArray(d.broadcasts), true, 'broadcasts 归一为数组');
  H.eq(typeof d.seen, 'undefined', 'seen 不再被迁移补回（I-11）');
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

// ============ I18–I21 · 静默失败可见性（P54·I-4 / I-6）============
H.run('I18-_appendStoryLine 返回 {ok,reason}（不再把异常吞成空 catch）', function() {
  const boom = sb({ Platform: { ui: { appendStory: function() { throw new Error('渲染层爆了'); } } } });
  const r1 = boom.IF._appendStoryLine('【手机】阿甲：你好');
  H.eq(r1.ok, false, '抛错 ⇒ ok:false');
  H.contains(r1.reason, '渲染层爆了', 'reason 带原异常 message');

  const missing = sb(); // 默认 Platform.ui 没有 appendStory
  const r2 = missing.IF._appendStoryLine('x');
  H.eq(r2.ok, false, 'appendStory 不可用 ⇒ ok:false');
  H.contains(r2.reason, 'appendStory', 'reason 说明不可用');

  let got = null;
  const good = sb({ Platform: { ui: { appendStory: function(l) { got = l; } } } });
  const r3 = good.IF._appendStoryLine('【手机】阿甲：你好');
  H.eq(r3.ok, true, '可用 ⇒ ok:true');
  H.eq(got, '【手机】阿甲：你好', '正文透传给 Platform.ui.appendStory');
});

H.run('I19-promoteToStory 追加失败 ⇒ ok:false 且条目回到原状（不留半成品）', function() {
  const audits = [];
  const s = sb({
    Platform: { ui: { appendStory: function() { throw new Error('没有渲染容器'); } } },
    ErrorLog: { audit: function(k, t, d) { audits.push([k, t, String(d)]); return true; }, action: function() {}, error: function() {}, log: function() {} }
  });
  s.IF.pushMessage({ from: 'npc_a', fromName: '阿甲', to: 'player', text: '你好' });
  const id = s.IF.listThreads() && s.IF.getThread('th_npc_a').messages[0].id;
  const r = s.IF.promoteToStory(id, { by: 'ai', importance: 'actionable' });
  H.eq(r.ok, false, '失败 ⇒ ok:false');
  H.contains(r.reason, '混流未完成', 'reason 说明未完成');
  const it = s.IF.getThread('th_npc_a').messages[0];
  H.eq(it.flow, 'info', 'flow 未被改成 story');
  H.eq(it.importance, 'background', 'importance 也未被改');
  H.eq(audits.length, 1, '留一条审计');
  H.eq(audits[0][0], 'info_feed', '审计来源');
  H.eq(audits[0][1], 'promote_append_failed', '审计 kind');
});

H.run('I20-promoteToStory 成功路径 + chatHistory 写入失败留痕（不静默）', function() {
  const lines = [];
  const audits = [];
  const hist = [];
  hist.push = function() { throw new Error('对话历史只读'); };
  const s = sb({
    GameState: {
      currentCardId: 'card1', currentSaveId: 'save1', chatHistory: hist,
      formatGameTime: function() { return '1-1-1 08:00'; }
    },
    Platform: { ui: { appendStory: function(l) { lines.push(l); } } },
    ErrorLog: { audit: function(k, t, d) { audits.push([t, String(d)]); return true; }, action: function() {}, error: function() {}, log: function() {} }
  });
  s.IF.pushMessage({ from: 'npc_a', fromName: '阿甲', to: 'player', text: '你好' });
  const id = s.IF.getThread('th_npc_a').messages[0].id;
  const r = s.IF.promoteToStory(id, { by: 'player', note: '我去看看' });
  H.eq(r.ok, true, '正文已追加 ⇒ ok:true');
  H.eq(lines.length, 1, '叙事流 +1 行');
  H.eq(s.IF.getThread('th_npc_a').messages[0].flow, 'story', 'flow 改成 story');
  H.contains(r.warning || '', 'chatHistory', 'warning 指出历史写入失败');
  H.eq(audits.length, 1, '一条审计');
  H.eq(audits[0][0], 'promote_history_failed', '审计 kind');
});

H.run('I21-_validateTickBatch 逐条容错（坏条目不再连坐整批）', function() {
  const audits = [];
  const s = sb({ ErrorLog: { audit: function(k, t, d) { audits.push([t, String(d)]); return true; }, action: function() {}, error: function() {}, log: function() {} } });
  s.GameState.currentCard = { worldbook: { npcs: [{ id: 'npc_a', name: '阿甲' }] } };
  const kindOf = function(name) { return audits.some(function(a) { return a[0] === name; }); };

  // 一坏一好 + 合法广播：好条目与广播都要留下
  const b1 = s.IF._validateTickBatch({
    messages: [{ to: '', text: '缺收件人' }, { to: 'npc_a', text: '在' }],
    broadcast: { title: '号外', body: 'b', publicity: '公开', scope: '城市' }
  });
  H.ok(b1, '仍有可用条目 ⇒ 不为 null');
  H.eq(b1.messages.length, 1, '好条目保留');
  H.eq(b1.messages[0].to, 'npc_a', '保留的是好条目');
  H.ok(b1.broadcast && b1.broadcast.title === '号外', '广播保留');
  H.ok(kindOf('tick_batch_partial'), '留 partial 审计');
  H.contains(audits[0][1] || '', '缺 to/text', '审计写明跳过原因');

  // 超长正文：截断（与 pushMessage / publish 口径一致），不丢批
  const long = 'x'.repeat(600);
  const b2 = s.IF._validateTickBatch({ messages: [{ to: 'npc_a', text: long }], broadcast: null });
  H.ok(b2 && b2.messages.length === 1, '超长条目仍保留');
  H.eq(b2.messages[0].text.length, 500, '截断到 MAX_TEXT');

  // 收件人不存在：只丢那一条
  const b3 = s.IF._validateTickBatch({ messages: [{ to: 'npc_nope', text: '喂' }, { to: 'player', text: '喂' }], broadcast: null });
  H.ok(b3 && b3.messages.length === 1 && b3.messages[0].to === 'player', '未知收件人只丢自己那条');

  // 全坏 ⇒ null，并留 rejected 审计
  const before = audits.length;
  const b4 = s.IF._validateTickBatch({ messages: [{ to: '', text: '' }], broadcast: { title: '', body: '' } });
  H.eq(b4, null, '没有任何可用条目 ⇒ null');
  H.ok(audits.length > before && kindOf('tick_batch_rejected'), '留 rejected 审计');

  // 非对象入参不抛
  H.eq(s.IF._validateTickBatch(null), null, 'null 入参');
  H.eq(s.IF._validateTickBatch('字符串'), null, '字符串入参');
});


// ============ I22–I27 · P54 I-9 / I-10 / I-11 守卫 ============
H.run('I22-origin 白名单：pushMessage/publish 非法 origin 回落并记审计（I-9）', function() {
  const s = sb();
  const m = s.IF.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', text: 'hi', origin: 'bogus' });
  H.eq(m.origin, 'ai', '非法 origin ⇒ ai');
  const bc = s.IF.publish({ title: 't', body: 'b', origin: 'typo' });
  H.eq(bc.origin, 'ai', '广播非法 origin ⇒ ai');
  const kinds = s.audits.filter(function(a) { return a[1] === 'unknown_origin'; });
  H.eq(kinds.length, 2, '两条 unknown_origin 审计');
  const ok = s.IF.pushMessage({ from: 'laowang', to: 'player', text: 'hi2', origin: 'ai' });
  H.eq(ok.origin, 'ai', '合法值原样保留');
});

H.run('I23-旧档玩家发言缺 origin 按 from 认回 player（I-9）', function() {
  const s = sb();
  const p = s.IF._ensureMessage({ from: 'player', fromName: '你', to: 'laowang', text: '我说' });
  H.eq(p.origin, 'player', 'from=player ⇒ origin=player');
  const n = s.IF._ensureMessage({ from: 'laowang', to: 'player', text: '他说' });
  H.eq(n.origin, 'ai', 'NPC 发言 ⇒ origin=ai');
  const bad = s.IF._ensureMessage({ from: 'laowang', to: 'player', text: 'x', origin: '乱写' });
  H.eq(bad.origin, 'ai', '白名单外 ⇒ ai');
  const bc = s.IF._ensureBroadcast({ title: 't', body: 'b', origin: 42 });
  H.eq(bc.origin, 'ai', '广播白名单外 ⇒ ai');
});

H.run('I24-importance 非法值记审计后回落 background（I-10）', function() {
  const s = sb();
  const m = s.IF.pushMessage({ from: 'laowang', to: 'player', text: 'x', importance: 'urgent' });
  H.eq(m.importance, 'background', 'pushMessage 非法 ⇒ background');
  const bc = s.IF.publish({ title: 't', body: 'b', importance: 'urgent' });
  H.eq(bc.importance, 'background', 'publish 非法 ⇒ background');
  const a = s.IF.pushMessage({ from: 'laowang', to: 'player', text: 'y', importance: 'actionable' });
  s.IF.setImportance(a.id, '瞎编');
  const tid = s.IF.listThreads()[0].id;
  const last = s.IF.getThread(tid).messages.slice(-1)[0];
  H.eq(last.id, a.id, '取到的就是刚推的那条');
  H.eq(last.importance, 'actionable', 'setImportance 非法被忽略，原值不动');
  const kinds = s.audits.filter(function(x) { return x[1] === 'unknown_importance'; });
  H.eq(kinds.length, 3, '三条 unknown_importance 审计');
});

H.run('I25-tick 批 importance 缺省/非法都落 background，非法值随 partial 审计留痕（I-10）', function() {
  const s = sb();
  // 注意：_validateTickBatch 单批最多收 2 条（:851 out.messages.length < 2），所以分两次调用取三种情况
  const b1 = s.IF._validateTickBatch({ messages: [
    { to: 'player', text: 'a' },
    { to: 'player', text: 'b', importance: '瞎编' }
  ] });
  H.eq(b1.messages[0].importance, 'background', '缺 importance ⇒ background（与其它路径同口径）');
  H.eq(b1.messages[1].importance, 'background', '非法 ⇒ background');
  const partial = s.audits.filter(function(x) { return x[1] === 'tick_batch_partial'; });
  H.eq(partial.length, 1, '留 partial 审计');
  H.contains(partial[0][2], 'importance 非法', '审计写明非法值与处置');
  const b2 = s.IF._validateTickBatch({ messages: [{ to: 'player', text: 'c', importance: 'actionable' }] });
  H.eq(b2.messages[0].importance, 'actionable', '合法 actionable 原样保留');
});

H.run('I26-_emptyMessage 死代码已删（I-10）', function() {
  const s = sb();
  H.eq(typeof s.IF._emptyMessage, 'undefined', '_emptyMessage 已删除');
});

H.run('I27-_empty 与 _ensureShape 都不再有 seen（I-11）', function() {
  const s = sb();
  H.eq(Object.prototype.hasOwnProperty.call(s.IF._empty(), 'seen'), false, '_empty 无 seen');
  // 旧档里带 seen 时不强删（那是历史数据）；这里只验证「不再凭空补出 seen」
  s.IF.setRuntime({ threads: { t1: {} }, threadOrder: ['t1'], broadcasts: [], meta: {} });
  H.eq(Object.prototype.hasOwnProperty.call(s.IF.getRuntime(), 'seen'), false, '_ensureShape 不补 seen');
});



// ============ I28–I33 · I-5 / I-7 / I-8 ============
H.run('I28-_firstJsonObject 只取第一个花括号配平的对象（I-5）', function() {
  const s = sb();
  H.eq(s.IF._firstJsonObject('前面有解释 {"a":1} 后面又写了一段 {"b":2}'),
    '{"a":1}', '后文再出现花括号也不缝进来');
  H.eq(s.IF._firstJsonObject('{"t":"含 } 的字符串","n":[1,2]}'),
    '{"t":"含 } 的字符串","n":[1,2]}', '字符串里的花括号不算层级');
  H.eq(s.IF._firstJsonObject('{"a":"\\"}"}'), '{"a":"\\"}"}', '转义引号不误判字符串结束');
  H.eq(s.IF._firstJsonObject('没有花括号'), null, '没有 { ⇒ null');
  H.eq(s.IF._firstJsonObject('{"a":'), null, '没配平 ⇒ null（交给退化切片与修复路径）');
});

H.run('I29-_parseTick 在 JSON 后还有花括号段落时仍能解析（I-5）', function() {
  const s = sb();
  const txt = '这是我要给你的信息：\n{"messages":[{"to":"player","text":"在吗"}]}\n' +
    '（说明：上面就是结果；另外 {"note":"别理"} 只是举例。）';
  const r = s.IF._parseTick(txt);
  H.ok(r && Array.isArray(r.messages) && r.messages.length === 1, '解析出 1 条');
  H.eq(r.messages[0].text, '在吗', '正文正确');
  const fenced = s.IF._parseTick('\u0060\u0060\u0060json\n{"messages":[]}\n\u0060\u0060\u0060');
  H.ok(fenced && Array.isArray(fenced.messages), '代码块包裹照旧');
});

H.run('I30-tick 失败原因回灌下一轮提示词、成功后撤掉（I-5）', async function() {
  const mkSb = function(chat) {
    return sb({
      GameState: {
        currentCardId: 'card1', currentSaveId: 'save1', currentRound: 3,
        formatGameTime: function() { return '1-1-3 08:00'; }
      },
      ApiManager: { getActive: function() { return { id: 'p1' }; } },
      ApiClient: { chat: chat }
    });
  };
  const s = mkSb(async function() { return '抱歉，我这边暂时没有消息。'; });
  await s.IF.tick({ round: 3 });
  const rt = s.IF.getRuntime();
  H.ok(rt.meta.lastTickError && /无法解析/.test(rt.meta.lastTickError.reason), 'meta 记下失败原因');
  H.eq(rt.meta.lastTickError.round, 3, '记下轮次');
  H.eq(rt.meta.lastTickAt, null, '失败不算「已发起过」——冷却不推进');
  const p = s.IF._tickPrompt();
  H.contains(p, '【上一轮失败', '提示词里有失败段');
  H.contains(p, '无法解析成 JSON 对象', '带具体原因');
  H.contains(p, '抱歉，我这边暂时没有消息。', '带上一次输出开头，便于自纠');
  H.ok(s.audits.some(function(a) { return a[1] === 'tick_retry_feedback'; }), '留 tick_retry_feedback 审计');

  const s2 = mkSb(async function() { return '{"messages":[{"to":"player","text":"我是老王"}]}'; });
  await s2.IF.tick({ round: 3 });
  const rt2 = s2.IF.getRuntime();
  H.eq(typeof rt2.meta.lastTickError, 'undefined', '成功一轮后撤掉回灌');
  H.eq(rt2.meta.lastTickRound, 3, '成功路径照旧推进');
  H.ok(!/【上一轮失败/.test(s2.IF._tickPrompt()), '提示词恢复干净');
});

H.run('I31-坏档（数组/坏 JSON）先备份再空手起，并留审计（I-7）', function() {
  const p = '/saves/card1/save1/info_feed.json';
  const bak = '/saves/card1/save1/info_feed.bad.json';
  const s = sb();
  s.VFS._files[p] = '[1,2,3]';
  s.IF.load();
  H.eq(s.VFS._files[bak], '[1,2,3]', '数组档原样备份');
  H.eq(Object.keys(s.IF.getRuntime().threads).length, 0, '空档起步');
  H.ok(s.audits.some(function(a) { return a[1] === 'load_corrupt'; }), '留 load_corrupt 审计');

  const s2 = sb();
  s2.VFS._files[p] = '{"threads": ';
  s2.IF.load();
  H.eq(s2.VFS._files[bak], '{"threads": ', '坏 JSON 也备份');
  H.ok(s2.audits.some(function(a) { return a[1] === 'load_corrupt'; }), '留审计');
  H.eq(s2.IF.getRuntime().meta.lastTickRound, -1, '降级为空档形状');
});

H.run('I32-坏线程条目被移除时留审计（I-7）', function() {
  const s = sb();
  s.IF.setRuntime({ threads: { good: {}, bad: null }, threadOrder: [], broadcasts: [], meta: {} });
  const d = s.IF.getRuntime();
  H.eq(d.threads.bad, undefined, '坏条目仍会被移除（结构不变量不变）');
  H.eq(d.threads.good.id, 'good', '好条目照旧补全');
  const a = s.audits.filter(function(x) { return x[1] === 'thread_dropped'; });
  H.eq(a.length, 1, '留一条 thread_dropped 审计');
  H.contains(a[0][2], 'bad', '审计含键名，便于从备份里捞');
});

H.run('I33-save 跳过/归属不符都不再静默：返回 false 并留审计（I-7/I-8）', function() {
  const s = sb();
  const p1 = '/saves/card1/save1/info_feed.json';
  const p2 = '/saves/card1/save2/info_feed.json';
  s.IF.load();
  s.IF._data.meta.aiSendCount = 1;
  s.GameState.currentSaveId = null;
  H.eq(s.IF.save(), false, '没有存档 id ⇒ 返回 false');
  H.ok(s.audits.some(function(a) { return a[1] === 'save_skipped'; }), '留 save_skipped 审计');
  s.GameState.currentSaveId = 'save2';
  H.eq(s.IF.save(), false, '归属不符 ⇒ 拒绝写');
  H.ok(s.audits.some(function(a) { return a[1] === 'save_owner_mismatch'; }), '留 save_owner_mismatch 审计');
  H.eq(s.VFS._files[p2], undefined, 'B 档文件没被写脏');
  s.GameState.currentSaveId = 'save1';
  H.eq(s.IF.save(), true, '回到原档 ⇒ 正常写');
  H.eq(s.VFS._files[p1] !== undefined, true, 'A 档文件在');
});
H.finish();

// ============================================================
// P54·第12条 §四 story.js 组单测（除 F1 跨压缩回退，另批）
//   K1 applyWindow 的「轮」口径（回归锚：本批不能改变它）
//   K2 提前返回不发进度提示（「假挂的（正在生成日志…）」修复）
//   K3 成功压缩：进度→成功两条提示 + 保留窗口按「轮」计（系统消息不再挤占配额）
//   K4 压缩失败：提示落地 + 原文与计数都没动
//   K5 Logger.compress：chunks / fullText 留原文，只有喂摘要模型的节选被截
//   K6 shouldCompress：首日志 ≥20 条 / 跨日不看条数（新参数名语义）
//   K7 死配置 autoCompressRounds 已从 storage.js 摘掉，三个真配置项仍在
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

// 内存 VFS 补齐 logger.js 需要的目录级接口
function mkVFS() {
  const vfs = H.makeVFS();
  vfs.mkdir = function() { return true; };
  vfs.listAll = function(dir) {
    return Object.keys(vfs._files).filter(function(p) { return p.indexOf(dir + '/') === 0; });
  };
  vfs.deleteFile = function(p) { return vfs.remove(p); };
  return vfs;
}

function mkVFSLogger() {
  const vfs = mkVFS();
  const calls = [];
  const sb = H.makeSandbox({
    VFS: vfs,
    GameState: { _gameTime: { year: 2026, month: 1, day: 5, hour: 9, minute: 0 } },
    ApiClient: {
      chat: function(msgs) {
        calls.push(msgs);
        return Promise.resolve('{"title":"日志标题","summary":"摘要","entities":{},"unresolved":[],"tags":[]}');
      }
    }
  });
  H.load(sb, 'vfs/logger.js');
  return { sb: sb, LG: sb.window.Logger, vfs: vfs, calls: calls };
}

// 造 14 轮历史（前 6 轮每轮多插一条「【系统 · 」的 user 消息）
function makeHistory(rounds) {
  const history = [{ role: 'system', content: 'SYS' }];
  for (let r = 1; r <= rounds; r++) {
    history.push({ role: 'user', content: '第' + r + '轮' });
    history.push({ role: 'assistant', content: 'GM' + r });
    if (r <= 6) history.push({ role: 'user', content: '【系统 · 提示' + r });
  }
  return history;
}

function mkVFSStory(opts) {
  const hints = [];
  const compressCalls = [];
  const gs = {
    currentCardId: 'c1',
    currentSaveId: 's1',
    chatHistory: opts.history,
    _gameTime: { year: 2026, month: 1, day: 5, hour: 9, minute: 0 },
    _lastCompressMsgCount: opts.lastCount || 0
  };
  const sb = H.makeSandbox({
    VFS: mkVFS(),
    GameState: gs,
    Storage: { getGlobal: function() { return { logging: { enabled: true, windowRounds: 10, summaryInject: 3 } }; } },
    Platform: {
      ui: {
        appendHint: function(t) { hints.push(t); },
        renderTopbar: function() {},
        renderSidebarExpanded: function() {}
      }
    },
    Logger: {
      listLogs: function() { return []; },
      shouldCompress: function() { return { yes: true, reason: opts.reason || 'crossDay' }; },
      compress: function(o) { compressCalls.push(o); return Promise.resolve(opts.compressResult === undefined ? { title: '日志标题' } : opts.compressResult); }
    }
  });
  H.load(sb, 'engine/story.js');
  return { sb: sb, SL: sb.window.StoryLoop, gs: gs, hints: hints, compressCalls: compressCalls };
}

const realUser = function(m) { return !!m && m.role === 'user' && String(m.content || '').indexOf('【系统 ·') !== 0; };

// ---------- K1 ----------
H.run('K1 applyWindow：按「轮」保留，窗口内的【系统 · 条目保留、首条仍是 system', function() {
  const s = mkVFSStory({ history: [] });
  const sys = { role: 'system', content: 'SYS' };
  const hist = [sys,
    { role: 'user', content: '第1轮' }, { role: 'assistant', content: 'GM1' },
    { role: 'user', content: '【系统 · 提示A' }, { role: 'assistant', content: 'GM1b' },
    { role: 'user', content: '第2轮' }, { role: 'assistant', content: 'GM2' },
    { role: 'user', content: '第3轮' }, { role: 'assistant', content: 'GM3' }
  ];
  const out = s.SL.applyWindow(hist, 2);
  H.eq(out[0].role, 'system', 'K1 首条仍是 system');
  H.eq(out[1].content, '第2轮', 'K1 从倒数第 2 个真实轮起步');
  H.eq(out.length, 5, 'K1 保留 4 条 + system');
  H.eq(out.filter(realUser).length, 2, 'K1 恰好两轮真实玩家发言');
});

// ---------- K2 ----------
H.run('K2 可压缩量 < 4 条时提前返回：一条提示都不发（不再假挂）', function() {
  const hist = [{ role: 'system', content: 'SYS' }, { role: 'user', content: '第1轮' }, { role: 'assistant', content: 'GM1' }];
  const s = mkVFSStory({ history: hist });
  const before = JSON.stringify(hist);
  return s.SL.maybeCompress().then(function() {
    H.deepEq(s.hints, [], 'K2 无任何提示');
    H.eq(JSON.stringify(s.gs.chatHistory), before, 'K2 历史未动');
    H.eq(s.compressCalls.length, 0, 'K2 没有调用压缩');
  });
});

// ---------- K3 ----------
H.run('K3 成功压缩：进度+成功两条提示；保留 10 轮真实玩家发言（系统消息不占配额）', function() {
  const hist = makeHistory(14);   // rest = 34 条
  const s = mkVFSStory({ history: hist, reason: 'firstLog' });
  return s.SL.maybeCompress().then(function() {
    H.deepEq(s.hints, ['（正在生成日志…）', '（日志已生成：日志标题）'], 'K3 两条提示、顺序正确');
    const kept = s.gs.chatHistory.slice(1);
    H.eq(s.gs.chatHistory[0].role, 'system', 'K3 首条仍是 system');
    H.eq(kept.filter(realUser).length, 10, 'K3 保留窗口 = 10 轮真实玩家发言');
    const firstKeptRound = kept.filter(realUser)[0];
    H.eq(firstKeptRound.content, '第5轮', 'K3 从第 5 轮起保留');
    H.eq(s.compressCalls.length, 1, 'K3 压缩调用一次');
    const batch = s.compressCalls[0].messages;
    H.eq(batch.length, 34 - kept.length, 'K3 压缩的是边界之前的全部条目');
    H.eq(batch[0].content, '第1轮', 'K3 批次从第 1 轮开始');
    H.eq(batch[batch.length - 1].content, '第4轮', 'K3 批次停在边界轮');
    H.eq(batch.filter(realUser).length, 4, 'K3 批次含 4 轮真实玩家发言');
  });
});

// ---------- K4 ----------
H.run('K4 压缩失败：进度提示后接失败提示，历史与计数都没动', function() {
  const hist = makeHistory(14);
  const s = mkVFSStory({ history: hist, compressResult: null, lastCount: 7 });
  const before = JSON.stringify(hist);
  return s.SL.maybeCompress().then(function() {
    H.deepEq(s.hints, ['（正在生成日志…）', '（日志生成失败，保留原文）'], 'K4 两条提示');
    H.eq(JSON.stringify(s.gs.chatHistory), before, 'K4 原文保留');
    H.eq(s.gs._lastCompressMsgCount, 7, 'K4 计数未动');
  });
});

// ---------- K5 ----------
H.run('K5 Logger.compress：归档留原文，只有喂摘要模型的节选被截到 3000 字', function() {
  const m = mkVFSLogger();
  const long = new Array(4001).join('长');   // 4000 字
  const messages = [{ role: 'user', content: '开始' }, { role: 'assistant', content: long }];
  return m.LG.compress({
    cardId: 'c1', saveId: 's1',
    startGameDate: { year: 2026, month: 1, day: 5 },
    gameDate: { year: 2026, month: 1, day: 5, hour: 10, minute: 0 },
    messages: messages
  }).then(function(r) {
    H.ok(!!r, 'K5 压缩返回对象');
    H.eq(r.chunks.length, 1, 'K5 一块（两条消息 < BLOCK）');
    H.ok(r.chunks[0].text.indexOf(long) >= 0, 'K5 归档保留完整 4000 字');
    H.notOk(r.chunks[0].text.indexOf('已截断') >= 0, 'K5 归档里不该再有「已截断」');
    H.ok(r.fullText.indexOf(long) >= 0, 'K5 fullText 由 chunks 拼出，同样完整');
    H.eq(m.calls.length, 1, 'K5 只调一次 LLM');
    H.eq(m.calls[0][0].role, 'system', 'K5 第一条是系统提示');
    H.ok(m.calls[0][1].content.indexOf('送入摘要时节选前 3000 字') >= 0, 'K5 节选带截断标记');
    H.notOk(m.calls[0][1].content.indexOf(long) >= 0, 'K5 节选里没有 4000 字全文');
    H.ok(m.vfs.exists('/saves/c1/s1/logs/2026/01/W01/2026-01-05.json'), 'K5 日志已落盘');
  });
});

// ---------- K6 ----------
H.run('K6 shouldCompress：首日志 ≥20 条触发、跨日不看条数、同日已有日志不再触发', function() {
  const today = { year: 2026, month: 1, day: 5 };
  const m = mkVFSLogger();
  H.deepEq(m.LG.shouldCompress(null, today, 19), { yes: false }, 'K6 19 条不触发');
  H.deepEq(m.LG.shouldCompress(null, today, 20), { yes: true, reason: 'firstLog' }, 'K6 20 条触发首日志');
  H.deepEq(m.LG.shouldCompress({ year: 2026, month: 1, day: 4 }, today, 2), { yes: true, reason: 'crossDay' }, 'K6 跨日即使只有 2 条也触发');
  H.deepEq(m.LG.shouldCompress(today, today, 99), { yes: false }, 'K6 同日已有日志不触发');
});

// ---------- K7 ----------
H.run('K7 死配置 autoCompressRounds 已摘掉，三个真配置项仍在', function() {
  const src = fs.readFileSync(path.join(H.ROOT, 'engine', 'core', 'storage.js'), 'utf8');
  H.notOk(src.indexOf('autoCompressRounds') >= 0, 'K7 源码零残留');
  H.contains(src, 'logging: { enabled: true, windowRounds: 10, summaryInject: 3 }', 'K7 三个真配置项仍在同一行');
});

H.finish();

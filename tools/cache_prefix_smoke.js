// ============================================================
// 历史记录 Prompt Cache 前缀稳定性 smoke（2026-10-17 批 · RN 侧）
// 与桌面 tests/unit/test_cache_prefix.js 同夹具同断言（27 条），
// 锁 story.js（两仓逐字节同源）锚定滞回窗口的前缀稳定契约：
//   - 锚点固定 ⇒ 相邻请求公共前缀覆盖全部携带历史（失配只在锚点跳动轮）
//   - 冷启动（K1 口径）/ 系统消息不计轮 / 日志压缩跨接 / 重试不挪锚
// 真跑 StoryLoop.sendAction → callAI 全链，在 ApiClient.chat 处
// 捕获实际发送的 messages 做逐条比对 —— 比较真实请求前缀。
// ============================================================
'use strict';

// ---------- 夹具：全局依赖 ----------
var captured = [];   // 每次 ApiClient.chat 实收的 messages 深拷贝
var dynCounter = 0;  // 快照递变计数器：模拟 buildDynamic 每轮内容不同
var REPLY = '【正文】\n剧情推进。\n【时间】+3分\n【选项】\n1. a\n2. b\n3. c\n4. d';

var CARD = {
  cardId: 'c1', cardName: '测试卡',
  game: { title: 'T', openingPrompt: 'op' },
  hud: [], sidebar: [], panels: [], attributes: [],
  worldbook: { npcs: [], events: [], storyNodes: [] }
};

global.VFS = {
  readJSON: function () { return null; },
  writeJSON: function () {},
  deleteFile: function () {}
};
global.Alias = require('../engine/alias.js');
global.getDiceConfig = function () { return { enabled: false }; };
global.Storage = {
  getGlobal: function () {
    return {
      gm: {},
      logging: { enabled: true, windowRounds: 3 },   // N = 3，滞回上限 2N = 6
      api: { profiles: [], activeId: null },
      weather: { mode: 'off' }
    };
  },
  setGlobal: function () {}
};
global.GameState = {
  currentCard: CARD,
  currentCardId: 'c1', currentSaveId: 's1',
  chatHistory: [],
  playerData: {},
  _sessionToken: 1,
  _gameTime: { year: 1, month: 1, day: 1, hour: 8, minute: 0 },
  _lastReasoning: '', _lastUsage: null,
  advanceTime: function () {},
  persist: function () {}
};
global.PromptBuilder = {
  buildStatic: function () { return '【STATIC-RULES】'; },
  buildSemiStatic: function () { return '【SEMI-ENTITY】'; },
  buildDynamic: function () { dynCounter++; return '【DYN-SNAPSHOT-' + dynCounter + '】'; },
  updateEstimate: function () {}
};
global.ApiClient = {
  chat: async function (messages) {
    captured.push(JSON.parse(JSON.stringify(messages)));
    return REPLY;
  }
};
global.ApiManager = { getActive: function () { return { max_tokens: 1024, stream: false }; } };
global.Platform = {
  ui: {
    setBusy: function () {}, showStoryLoading: function () {}, clearStory: function () {},
    appendHint: function () {}, toast: function () {}, render: function () {},
    showScreen: function () {}, appendStory: function () {}, appendDiceResult: function () {},
    setOptions: function () {}, streamStartLive: function () {}, streamFinishLive: function () {},
    updateTime: function () {}, showStoryError: function (msg) { console.log('[showStoryError] ' + msg); },
    _currentRoundNum: function () { return 1; },
    renderChapterHead: function () {}, renderTopbar: function () {},
    renderSidebarExpanded: function () {}, updateTokenBadge: function () {}
  },
  dialog: { alert: function () {}, confirmAsync: async function () { return true; } }
};
global.ToolExecutor = {
  extract: function () { return ''; },
  executeAll: async function () { return []; },
  formatForHistory: function () { return ''; },
  formatDiceForUI: function () { return ''; },
  strip: function (s) { return s; },
  WHITELIST: {}
};

// P72：story.js 各 push 点改为 MessageTree.append（无树态 fail-open 直写
// chatHistory）。沙箱注入模块本体；GameState.messageTree 保持未建（undefined），
// append 走 fail-open 旧口径，本套 27 条断言语义与 P72 之前完全一致。
global.MessageTree = require('../engine/message_tree.js');

var StoryLoop = require('../engine/story.js');

// ---------- 断言器 ----------
var pass = 0, fail = 0;
function chk(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// 预置历史：[system, u1,a1, ..., uN,aN]（可选在指定轮后插【系统 ·消息）
function seed(nRounds, sysAfter) {
  GameState.chatHistory = [{ role: 'system', content: 'S-OLD' }];
  for (var i = 1; i <= nRounds; i++) {
    GameState.chatHistory.push({ role: 'user', content: 'u' + i });
    GameState.chatHistory.push({ role: 'assistant', content: 'a' + i });
    if (sysAfter && sysAfter.indexOf(i) >= 0) {
      GameState.chatHistory.push({ role: 'user', content: '【系统 · 工具反馈】fx' + i });
    }
  }
}
function lastCaptured() { return captured[captured.length - 1]; }
function resetAll() { StoryLoop._windowAnchor = null; captured.length = 0; }
// prev 除最后一条（快照注入位）外，全部消息在 cur 同位置逐字节相同
function stablePrefix(prev, cur) {
  if (cur.length < prev.length - 1) return false;
  for (var i = 0; i <= prev.length - 2; i++) {
    if (prev[i].role !== cur[i].role || prev[i].content !== cur[i].content) return false;
  }
  return true;
}
// 模拟 maybeCompress 的保留窗口（与真实代码同口径）：
// 从尾部数真实玩家发言，数到第 N+1 条时，保留它之后的所有消息
function compressTrim() {
  var hist = GameState.chatHistory;
  var rest = hist.slice(1);
  var keepFrom = 0, roundsKept = 0;
  for (var i = rest.length - 1; i >= 0; i--) {
    var m = rest[i];
    if (m && m.role === 'user' && !String(m.content || '').startsWith('【系统 ·')) {
      roundsKept++;
      if (roundsKept > 3) { keepFrom = i + 1; break; }
    }
  }
  GameState.chatHistory = [hist[0]].concat(rest.slice(keepFrom));
}

(async function main() {
  // ========== S1 连续对局（真实流）：fresh 开局连打 14 轮 ==========
  resetAll();
  GameState.chatHistory = [{ role: 'system', content: 'S-OLD' }];
  for (var r = 1; r <= 14; r++) await StoryLoop.sendAction('t' + r);
  var M = captured.slice();   // m1..m14
  chk('CP1a 生长到 2N 不裁：m6 共 12 条（system + 5 轮 + 新输入），m6[1] 是 t1',
    M[5].length === 12 && M[5][1].role === 'user' && M[5][1].content === 't1');
  chk('CP1b 窗口峰值有界（≤ 2N 轮 ⇒ ≤ 12 条）：全部 14 次请求都不超',
    M.every(function (m) { return m.length <= 12; }));

  // 非跳动轮的相邻请求：前缀逐字节稳定（只有 prev 最后一条快照位不同）
  var growthPairs = [[1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8], [8, 9], [10, 11], [11, 12], [12, 13]];
  chk('CP2 非跳动轮相邻请求公共前缀覆盖全部携带历史（10 对逐字节稳定）',
    growthPairs.every(function (p) { return stablePrefix(M[p[0]], M[p[1]]); }));
  var firsts = M.slice(1).map(function (m) { return m[1] && m[1].content; });   // m2..m14 的首条历史
  var jumps = [];
  for (var k = 1; k < firsts.length; k++) if (firsts[k] !== firsts[k - 1]) jumps.push(k + 2);
  chk('CP2b 锚点只在第 7 / 11 轮跳动（失配 2/13 轮，其余全稳定）',
    jumps.length === 2 && jumps[0] === 7 && jumps[1] === 11);
  chk('CP3 锚点序列：t1×5 → t5×4 → t9×4（跳一次管 N+1 轮）',
    firsts.join(',') === 't1,t1,t1,t1,t1,t5,t5,t5,t5,t9,t9,t9,t9');
  chk('CP4 跳动轮裁法与旧版一致：m7 = [sys,u5,a5,u6,a6,快照+t7] 共 6 条',
    M[6].length === 6 && M[6][1].content === 't5' && M[6][2].content === REPLY &&
    M[6][3].content === 't6' && M[6][4].content === REPLY &&
    String(M[6][5].content).indexOf('【系统状态快照') === 0);
  chk('CP4b 第二次跳动同形：m11 = [sys,t9,a9,t10,a10,快照+t11] 共 6 条',
    M[10].length === 6 && M[10][1].content === 't9' && M[10][3].content === 't10');
  chk('CP5 system 头 14 次请求逐字节相同（重写幂等，覆盖预置 S-OLD）',
    M.every(function (m) { return m[0].role === 'system' && m[0].content === '【STATIC-RULES】\n【SEMI-ENTITY】'; }));
  chk('CP6a 快照只出现在每次请求的最后一条 user（不进 system / 历史中段）',
    M.every(function (m) {
      var hits = m.filter(function (x) { return String(x.content || '').indexOf('【系统状态快照') >= 0; });
      return hits.length === 1 && String(m[m.length - 1].content || '').indexOf('【系统状态快照') === 0;
    }));
  var snapSet = {};
  M.forEach(function (m) { snapSet[m[m.length - 1].content] = 1; });
  chk('CP6b 快照逐请求变化（动态状态每轮更新）且历史段不受影响',
    Object.keys(snapSet).length === M.length);
  chk('CP6c 历史卫生：上一轮玩家输入以纯文本入史（m8 里有裸 t7，无快照前缀）',
    M[7].some(function (x) { return x.role === 'user' && x.content === 't7'; }));
  await StoryLoop.retryLast();
  var m15 = lastCaptured();
  chk('CP7 重试不挪锚点：窗口与 m14 同起点，历史段 0..10 逐字节相同，只重付快照段',
    m15.length === 14 && m15[1].content === 't9' && m15[11].content === 't14' &&
    String(m15[13].content).indexOf('【系统状态快照') === 0 &&
    m15[13].content.indexOf('请根据以上状态继续推进剧情') > 0 &&
    (function () { for (var i = 0; i <= 10; i++) { if (m15[i].content !== M[13][i].content) return false; } return true; })());

  // ========== S2 冷启动（读档场景，K1 口径）：seed 5 轮后第一请 ==========
  resetAll();
  seed(5);
  await StoryLoop.sendAction('t6');
  var c1 = lastCaptured();
  await StoryLoop.sendAction('t7');
  var c2 = lastCaptured();
  chk('CP8a 冷启动按旧语义裁：6 轮真实发言 > N=3 ⇒ [sys,u4,a4,u5,a5,快照+t6] 共 6 条',
    c1.length === 6 && c1[1].content === 'u4' && c1[3].content === 'u5');
  chk('CP8b 冷启动后锚点立即稳定：下一轮 [1] 仍是 u4、只追加不重裁',
    c2.length === 8 && c2[1].content === 'u4' && stablePrefix(c1, c2));

  // ========== S3 【系统 ·消息不计轮，且随窗口携带 ==========
  resetAll();
  seed(7, [2, 6]);
  await StoryLoop.sendAction('t8');
  var s1 = lastCaptured();
  await StoryLoop.sendAction('t9');
  var s2 = lastCaptured();
  var has = function (arr, txt) { return arr.some(function (x) { return x.content === txt; }); };
  chk('CP9a 系统消息不计轮：8 轮+2 系统消息仍判 8 轮并冷启动裁 3 轮；窗口内 fx6 保留、窗口外 fx2 裁掉',
    s1.length === 7 && s1[1].content === 'u6' && has(s1, '【系统 · 工具反馈】fx6') && !has(s1, '【系统 · 工具反馈】fx2') && !has(s1, 'u5'));
  chk('CP9b 生长段系统消息随窗携带：t9 轮窗口从 u6 起共 9 条，fx6 仍在',
    s2.length === 9 && s2[1].content === 'u6' && has(s2, '【系统 · 工具反馈】fx6') && stablePrefix(s1, s2));

  // ========== S4 日志压缩跨接（maybeCompress 同口径保留窗） ==========
  // S4a 裁剪轮内压缩：锚点落在保留区 ⇒ 跨压缩请求前缀不变
  resetAll();
  seed(7);
  await StoryLoop.sendAction('t8');   // 冷启动裁 → 锚=u6
  compressTrim();                     // 保留 [a5,u6,a6,u7,a7,t8,a8]，u6 在保留区
  await StoryLoop.sendAction('t9');
  var p1 = lastCaptured();
  chk('CP10a 压缩保留锚点：跨压缩请求仍从 u6 起（与不压缩时同窗，前缀命中不吃日志压缩）',
    p1.length === 8 && p1[1].content === 'u6' && p1[5].content === 't8' && p1[6].content === REPLY);
  // S4b 生长段压缩：锚点被清出 ⇒ 冷启动重置，下一轮重新稳定
  resetAll();
  seed(7);
  await StoryLoop.sendAction('t8');   // 锚=u6
  await StoryLoop.sendAction('t9');   // 生长（从 u6 数 4 ≤ 6，不裁）
  compressTrim();                     // 保留 [a6,u7,a7,t8,a8,t9,a9]，u6 被清出
  await StoryLoop.sendAction('t10');
  var q1 = lastCaptured();
  await StoryLoop.sendAction('t11');
  var q2 = lastCaptured();
  chk('CP10b 锚点被压缩清出 ⇒ 冷启动重裁不崩溃：[sys,t8,a8,t9,a9,快照+t10] 共 6 条',
    q1.length === 6 && q1[1].content === 't8' && q1[3].content === 't9');
  chk('CP10c 清出重置后下一轮立即恢复稳定：[1] 仍是 t8、只追加',
    q2.length === 8 && q2[1].content === 't8' && stablePrefix(q1, q2));

  // ========== S5 K1 冷启动契约（与 RN test_story_compress_unit K1 同口径） ==========
  resetAll();
  var k1hist = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: '第1轮' }, { role: 'assistant', content: 'GM1' },
    { role: 'user', content: '【系统 · 提示A' }, { role: 'assistant', content: 'GM1b' },
    { role: 'user', content: '第2轮' }, { role: 'assistant', content: 'GM2' },
    { role: 'user', content: '第3轮' }, { role: 'assistant', content: 'GM3' }
  ];
  var out = StoryLoop.applyWindow(k1hist, 2);
  var realUser = function (m) { return !!m && m.role === 'user' && String(m.content || '').indexOf('【系统 ·') !== 0; };
  chk('CP11a K1 口径：首条仍是 system', out[0].role === 'system');
  chk('CP11b K1 口径：从倒数第 2 个真实轮起步（第2轮）', out[1].content === '第2轮');
  chk('CP11c K1 口径：保留 4 条 + system 共 5 条', out.length === 5);
  chk('CP11d K1 口径：恰好两轮真实玩家发言', out.filter(realUser).length === 2);

  // ========== S6 源码锚点（防回归的排列契约） ==========
  var fs = require('fs');
  var storySrc = fs.readFileSync(require.resolve('../engine/story.js'), 'utf8');
  var pbSrc = fs.readFileSync(require.resolve('../engine/core/prompt_builder.js'), 'utf8');
  chk('CP12a 快照拼装点在 applyWindow 之后（先裁窗后拼快照，尾部注入）',
    storySrc.indexOf('applyWindow(GameState.chatHistory') < storySrc.indexOf('【系统状态快照'));
  chk('CP12b system 头只含 static+semiStatic（不含 buildDynamic）',
    /chatHistory\[0\]\.content = PromptBuilder\.buildStatic\(\) \+ '\\n' \+ PromptBuilder\.buildSemiStatic\(\)/.test(storySrc));
  chk('CP12c 前情摘要注入位于 buildDynamic（尾部快照段），不进 system 头',
    pbSrc.indexOf('buildDynamic') < pbSrc.indexOf('>>> 前情') && pbSrc.indexOf('>>> 前情') > 0);
  chk('CP12d 锚定滞回在位（_windowAnchor / indexOf 清出重置 / 2N 上限）',
    storySrc.indexOf('_windowAnchor') > 0 &&
    storySrc.indexOf('rest.indexOf(this._windowAnchor)') > 0 &&
    storySrc.indexOf('rounds * 2') > 0);

  console.log('CACHE_PREFIX_SMOKE: ' + pass + ' ok, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL: ' + (e && e.stack || e));
  process.exit(1);
});

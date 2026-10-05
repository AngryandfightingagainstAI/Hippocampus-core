// ============================================================
// P4 · smoke（cwd 必须是 RN 仓根：node tools/log_query_smoke.js）
// 覆盖：
//   A query_log 模块形态与注册
//   B S1 · 40 条截断修复（chunks / msgFrom / msgTo / 全量入 fullText）
//   C S2 · query_log 行为（排序 / 时间闸门 / 片段与总量硬上限 / 空命中 / 无 keyword）
//   D S3 · prompt 预算刹车（阶梯触发 / 可复现 / enabled:false 不裁剪 / sum0 保提示）
//   E S4 · 回退按轮次截断（当天只截尾 / 旧签名兼容 / 跨天整条删）
//   F 源码防回退锚点
//   G 桌面只读基线自证
// ============================================================

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var root = path.resolve(__dirname, '..');
var DESK = 'd:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').toUpperCase(); }
function read(p) { return fs.readFileSync(p, 'utf8'); }

// P30：桌面仓文件是 CRLF、RN 仓是 LF —— 同源判定按内容比（行尾归一），不再比字节
function lfText(p) { return fs.readFileSync(p, 'utf8').split('\r\n').join('\n'); }

// ================= 内存 harness =================
function installMemLocalStorage() {
  var mem = {};
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; }
  };
  return globalThis.localStorage;
}

function memStorageAdapter() {
  var map = {}, order = [];
  var api = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) order.push(k);
      map[k] = String(v);
    },
    removeItem: function (k) { delete map[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); },
    key: function (i) { return i < order.length ? order[i] : null; }
  };
  Object.defineProperty(api, 'length', { get: function () { return order.length; } });
  return api;
}

// ================= boot =================
var CARD = 'demo_log', SAVE = 's1';
var TODAY = { year: 2000, month: 10, day: 20, hour: 8, minute: 0 };

function boot() {
  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));

  globalThis.GameState = {
    _gameTime: Object.assign({}, TODAY),
    currentCardId: CARD,
    currentSaveId: SAVE,
    chatHistory: [],
    formatGameTime: function () { return '2000-10-20 08:00'; }
  };
  globalThis.ApiClient = {
    chat: function () {
      return Promise.resolve(JSON.stringify({
        title: '压缩标题', summary: '压缩摘要', entities: {}, unresolved: [], tags: []
      }));
    }
  };
  globalThis.ToolExecutor = require(path.join(root, 'engine', 'core', 'tool_executor.js'));
  globalThis.Logger = require(path.join(root, 'vfs', 'logger.js'));
  globalThis.LogQuery = require(path.join(root, 'engine', 'log_query.js'));
}

// 造 n 条 user/assistant 交替消息（第 1 条是 user）
function makeMessages(n, tag) {
  var out = [];
  for (var i = 1; i <= n; i++) {
    out.push({ role: (i % 2 === 1) ? 'user' : 'assistant', content: tag + i });
  }
  return out;
}

function dateOf(y, m, d) { return { year: y, month: m, day: d }; }

// ================= A 模块形态 =================
function runA() {
  var LQ = globalThis.LogQuery;
  check('A1 LogQuery.run 是函数', typeof LQ.run === 'function');
  check('A2 硬上限常量齐（80 / 3 / 3 / 1200）',
    LQ.LIMITS.SNIPPET_PAD === 80 && LQ.LIMITS.SNIPPETS_PER_LOG === 3 &&
    LQ.LIMITS.LOGS === 3 && LQ.LIMITS.CHARS === 1200);
  check('A3 已自注册 ToolExecutor.WHITELIST.query_log',
    !!globalThis.ToolExecutor.WHITELIST.query_log &&
    typeof globalThis.ToolExecutor.WHITELIST.query_log.run === 'function');
  check('A4 原有工具未被覆盖（query_npc / query_worldsetting 仍在）',
    !!globalThis.ToolExecutor.WHITELIST.query_npc && !!globalThis.ToolExecutor.WHITELIST.query_worldsetting);
}

// ================= B S1 40 条截断 =================
async function runB() {
  var Logger = globalThis.Logger;

  // B1：45 条（40 + 5）
  var msgs = makeMessages(45, '第');
  var log1 = await Logger.compress({
    cardId: CARD, saveId: SAVE, gameDate: dateOf(2000, 10, 20),
    msgFrom: 1, messages: msgs
  });
  check('B1a compress 返回 logData', !!log1 && typeof log1.fullText === 'string');
  check('B1b ★ 第 1 条内容进了 fullText（红证锚点）',
    !!log1 && log1.fullText.indexOf('[玩家] 第1\n') >= 0);
  check('B1c 第 41 条内容也进了 fullText（分块后不再丢）',
    !!log1 && log1.fullText.indexOf('[玩家] 第41') >= 0);
  check('B1d 第 45 条内容也进了 fullText',
    !!log1 && log1.fullText.indexOf('[玩家] 第45') >= 0);
  eq('B1e messageCount 记满 45 条（旧版只记 40）', log1.messageCount, 45);
  check('B1f chunks 分两块（40 + 5）',
    Array.isArray(log1.chunks) && log1.chunks.length === 2 &&
    log1.chunks[0].msgTo === 20 && log1.chunks[1].msgFrom === 21 && log1.chunks[1].msgTo === 23);
  eq('B1g 顶层 msgFrom', log1.msgFrom, 1);
  eq('B1h 顶层 msgTo', log1.msgTo, 23);
  check('B1i fullText 由 chunks 拼出（逐字一致）',
    log1.fullText === log1.chunks.map(function (c) { return c.text; }).join('\n\n---\n\n'));

  // B2：小批量（≤40）与旧行为逐字一致：单块、无多余分隔符
  var log2 = await Logger.compress({
    cardId: CARD, saveId: SAVE, gameDate: dateOf(2000, 10, 19),
    msgFrom: 1, messages: makeMessages(6, '甲')
  });
  eq('B2a ≤40 条只有 1 块', log2.chunks.length, 1);
  check('B2b ≤40 条 fullText 无分隔符',
    log2.fullText.indexOf('---') < 0 && log2.fullText.indexOf('[玩家] 甲1') >= 0);
  eq('B2c messageCount', log2.messageCount, 6);

  // B3：老日志（有 fullText、无 chunks）再压缩 ⇒ 老全文原样保留并补上 chunks
  var legacy = {
    id: 'log_2000-10-18',
    gameDate: dateOf(2000, 10, 18),
    title: '老日志', summary: '老摘要',
    entities: { npcs: [], places: [], items: [], factions: [] },
    unresolved: [], tags: [],
    messageCount: 12,
    fullText: '【老全文】这一段不能丢'
  };
  Logger.writeLog(CARD, SAVE, legacy);
  // startGameDate 把本批落在 10-18（=老日志那天），compress 才会读到 legacy 复用它
  var log3 = await Logger.compress({
    cardId: CARD, saveId: SAVE, startGameDate: dateOf(2000, 10, 18),
    gameDate: dateOf(2000, 10, 18),
    msgFrom: 1, messages: makeMessages(4, '乙')
  });
  check('B3a 老 fullText 逐字保留在头部',
    log3.fullText.indexOf('【老全文】这一段不能丢') === 0);
  check('B3b 老文本装成 msgFrom/msgTo 为 null 的块 + 新块',
    log3.chunks.length === 2 && log3.chunks[0].msgFrom === null &&
    log3.chunks[1].msgFrom === 1);
  eq('B3c messageCount 累加', log3.messageCount, 16);
}

// ================= C S2 query_log =================
function runC() {
  var Logger = globalThis.Logger, LQ = globalThis.LogQuery;

  // 三档日志：过去 / 今天 / 未来，都含关键词「张三」
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-18b', gameDate: dateOf(2000, 10, 18),
    title: '过去的一天', summary: '张三在码头出现', entities: { npcs: ['张三'], places: [], items: [], factions: [] },
    unresolved: [], tags: [], messageCount: 3,
    fullText: 'x'.repeat(200) + '张三' + 'y'.repeat(200)
  });
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-20', gameDate: dateOf(2000, 10, 20),
    title: '张三进城', summary: '张三今天进城了', entities: { npcs: ['张三'], places: [], items: [], factions: [] },
    unresolved: [], tags: [], messageCount: 3,
    fullText: '本日正文里也有张三。'
  });
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-25', gameDate: dateOf(2000, 10, 25),
    title: '未来的事', summary: '张三会在五天后回来', entities: { npcs: ['张三'], places: [], items: [], factions: [] },
    unresolved: [], tags: [], messageCount: 3,
    fullText: '未来正文，也有张三。'
  });

  var rNone = LQ.run({});
  eq('C1 无 keyword → reason 逐字', rNone.reason, 'keyword 为空');
  eq('C1 补 ok=false', rNone.ok, false);

  var r = LQ.run({ keyword: '张三' });
  check('C2 返回结构 {ok,type,queryType,data}',
    r.ok === true && r.type === 'query' && r.queryType === 'log' && Array.isArray(r.data));
  eq('C2 补 条目字段齐（date/title/summary/hits）',
    Object.keys(r.data[0]).sort().join(','), 'date,hits,summary,title');

  // C3 时间闸门：今天(2000-10-20) 搜得到过去与今天，搜不到未来(10-25)
  var dates = r.data.map(function (x) { return x.date; });
  check('C3a 搜得到：2000-10-20（今天）', dates.indexOf('2000-10-20') >= 0);
  check('C3b 搜得到：2000-10-18（过去）', dates.indexOf('2000-10-18') >= 0);
  check('C3c ★ 搜不到：2000-10-25（未来）', dates.indexOf('2000-10-25') < 0);
  check('C3d 排序：标题/摘要命中(10分)排在只有全文命中(3分)之前',
    dates[0] === '2000-10-20');

  // C4 片段长度上限：前后各 80 字 + 两端省略号 = 1 + 80 + 2 + 80 + 1 = 164
  var past = r.data.filter(function (x) { return x.date === '2000-10-18'; })[0];
  check('C4a 片段存在', !!past && past.hits.length >= 1);
  eq('C4b 片段长度 = 前后各 80 字 + 省略号 = 164', past.hits[0].length, 164);
  check('C4c 片段两端都有省略号', past.hits[0].indexOf('…') === 0 &&
    past.hits[0].slice(-1) === '…');

  // C5 上限：≤3 条日志 / 每条 ≤3 段 / 总字符 ≤1200
  var L2 = globalThis.Logger;
  for (var i = 0; i < 6; i++) {
    L2.writeLog(CARD, SAVE, {
      id: 'log_2000-10-' + (10 + i), gameDate: dateOf(2000, 10, 10 + i),
      title: '多命中' + i, summary: '张三' + i, entities: { npcs: ['张三'], places: [], items: [], factions: [] },
      unresolved: [], tags: [], messageCount: 3,
      fullText: ('张三' + 'z'.repeat(150)).repeat(20)
    });
  }
  var r5 = LQ.run({ keyword: '张三' });
  check('C5a 日志条数 ≤3', r5.data.length <= 3);
  check('C5b 每条片段 ≤3 段',
    r5.data.every(function (x) { return x.hits.length <= 3; }));
  var totalChars = 0;
  r5.data.forEach(function (x) {
    totalChars += (x.title || '').length + (x.summary || '').length;
    x.hits.forEach(function (h) { totalChars += h.length; });
  });
  check('C5c 总字符 ≤1200（实际 ' + totalChars + '）', totalChars <= 1200);
  eq('C5d 超限时标 truncated', r5.truncated, true);

  var rLimit = LQ.run({ keyword: '张三', limit: 99 });
  check('C5e limit 传再大也被压到 3 条', rLimit.data.length <= 3);

  // C6 无命中：空数组、不抛
  var rEmpty = LQ.run({ keyword: '不存在的人名XYZ' });
  check('C6 无命中 → ok + data:[] + 不抛',
    rEmpty.ok === true && Array.isArray(rEmpty.data) && rEmpty.data.length === 0);

  // C8 from / to 过滤
  var rFrom = LQ.run({ keyword: '张三', from: '2000-10-19' });
  check('C8a from 过滤掉更早的日志',
    rFrom.data.every(function (x) { return x.date >= '2000-10-19'; }));
  var rTo = LQ.run({ keyword: '张三', to: '2000-10-19' });
  check('C8b to 过滤掉更晚的日志',
    rTo.data.every(function (x) { return x.date <= '2000-10-19'; }));
}

// ================= D S3 预算刹车 =================
function bigLines(tag, n) {
  var a = [];
  for (var i = 0; i < n; i++) a.push('· ' + tag + i + ' 一段不算长的描述文字用于撑预算');
  return a.join('\n');
}

function runD() {
  var PB = require(path.join(root, 'engine', 'core', 'prompt_builder.js'));
  var saved = {
    GS: globalThis.GameState, Alias: globalThis.Alias, Logger: globalThis.Logger,
    NpcRuntime: globalThis.NpcRuntime, StoryNodes: globalThis.StoryNodes,
    Endings: globalThis.Endings, Events: globalThis.Events, InfoFeed: globalThis.InfoFeed,
    Tasks: globalThis.Tasks, Achievements: globalThis.Achievements,
    Proposals: globalThis.Proposals, DiceHistory: globalThis.DiceHistory,
    Outputs: globalThis.Outputs, Shop: globalThis.Shop, Storage: globalThis.Storage
  };
  var Storage = globalThis.Storage;

  var gs = {
    currentCard: { name: 'T', steps: [], worldbook: {} },
    playerData: {},
    chatHistory: [],
    currentCardId: CARD,
    currentSaveId: SAVE,
    _gameTime: Object.assign({}, TODAY),
    _pendingSystemNotices: [],
    currentState: { hud: [{ key: 'hp', current: 10, max: 100 }], sidebar: [], panels: {} },
    formatGameTime: function () { return '2000-10-20 08:00'; },
    computeAge: function () { return null; },
    getSegmentText: function () { return ''; },
    getEntrySegmentText: function () { return ''; },
    invalidateCache: function () {}
  };

  globalThis.GameState = gs;
  globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
  globalThis.Logger = {
    getRecentSummaries: function (c, s, n) {
      var out = [];
      for (var i = 0; i < n; i++) out.push({ date: '2000-10-' + (10 + i), title: '前情' + i, summary: '摘要' + i });
      return out;
    },
    getActiveEntities: function () { return { npcs: ['甲', '乙'], places: [], items: [], factions: [], unresolved: ['未了'] }; }
  };
  // P10·B1：formatter 假件改为「生产形态」——npc_runtime.js:822-838 直接返回
  //   「甲、乙、丙」名字串，原 bigLines 带 `·` 条目行是假形态，掩盖了 names 档空档。
  globalThis.NpcRuntime = {
    formatFocusBrief: function () { return '镜头内甲'; },
    formatSceneBrief: function () { return '现场甲、现场乙、现场丙、现场丁'; },
    formatFollowBrief: function () { return '跟随甲、跟随乙'; },
    formatActiveForPrompt: function () { return '镜头内状态'; }
  };
  globalThis.StoryNodes = { formatForPrompt: function () { return '>>> 【剧情节点】\n' + bigLines('节点', 10); } };
  globalThis.Endings = { formatForPrompt: function () { return '>>> 【结局】\n' + bigLines('结局', 10); } };
  globalThis.Events = { formatPendingForPrompt: function () { return null; }, formatLocalForPrompt: function () { return null; }, formatProposalsForPrompt: function () { return null; } };
  globalThis.InfoFeed = { formatForPrompt: function () { return '>>> 【信息层·手机】\n' + bigLines('讯息', 20); } };
  globalThis.Tasks = { formatForPrompt: function () { return '>>> 【进行中任务】\n' + bigLines('任务', 20); } };
  globalThis.Achievements = { formatRecentForPrompt: function () { return '>>> 【最近成就】\n' + bigLines('成就', 20); } };
  globalThis.Proposals = { formatForPrompt: function () { return '>>> 【待确认的变更提议】5 条（用 propose_change 处理）'; } };
  globalThis.DiceHistory = { formatRecentForPrompt: function (n) { var a = []; for (var i = 0; i < (n || 3); i++) a.push('· 骰子' + i); return '>>> 【最近骰子记录】\n' + a.join('\n'); } };
  globalThis.Outputs = { formatForPrompt: function () { return '>>> 【发酵中的产出物】\n' + bigLines('产出', 20); } };
  globalThis.Shop = { formatShopsForPrompt: function () { return bigLines('商店', 12); } };

  function setBudget(o) {
    var g = Storage.getGlobal();
    g.promptBudget = o;
    localStorage.setItem(Storage.GLOBAL_KEY, JSON.stringify(g));
  }

  // D0：默认配置（不写 promptBudget）⇒ 默认 3000，正常量不降级
  delete Storage.getGlobal().promptBudget;
  var t0 = PB.buildDynamic();
  eq('D0a 未配置时用默认 maxTokens=3000', gs._lastPromptBudget.maxTokens, 3000);
  check('D0b 默认值不触发降级（' + JSON.stringify(gs._lastTrimLog) + '）',
    gs._lastTrimLog.length === 0 || gs._lastPromptBudget.maxTokens >= 3000);

  // D1：超大输入 + 小预算 ⇒ 真触发并最终 ≤ maxTokens
  //   说明：本夹具里「最后防线」区块（时间/HUD/镜头内 NPC 状态等）本身约 911 token，
  //   是不可裁剪的地板。故 maxTokens 取 1000（> 地板、< 未降级的 2081），
  //   阶梯会在 count1 档收敛。若取 400 则地板已高于预算，阶梯走完也到不了 400。
  setBudget({ enabled: true, maxTokens: 1000 });
  var t1 = PB.buildDynamic();
  var est1 = PB.estimateTokens(t1);
  check('D1a 真触发降级（_lastTrimLog 非空，' + gs._lastTrimLog.length + ' 档）',
    gs._lastTrimLog.length > 0);
  check('D1b ★ 最终 token ≤ maxTokens（est=' + est1 + ' ≤ 1000）', est1 <= 1000);
  check('D1c 阶梯元素结构 {section,before,after,reason}',
    gs._lastTrimLog.every(function (x) {
      return typeof x.section === 'string' && typeof x.before === 'number' &&
        typeof x.after === 'number' && typeof x.reason === 'string';
    }));
  check('D1d 降级顺序严格按阶梯（档序 === DEGRADE_STEPS 前 N 项）',
    gs._lastTrimLog.every(function (x, i) {
      // P10·B1 改指：'names' 档已删（对真实数据是空档，DEGRADE_STEPS 7 档 → 6 档）。
      var names = ['recent1', 'clip2', 'count1', 'sum2', 'sum1', 'sum0'];
      return x.section === names[i];
    }));
  check('D1e 每档 after ≤ before（单调下降）',
    gs._lastTrimLog.every(function (x) { return x.after <= x.before; }));

  // D2：同一输入连跑两次 ⇒ _lastTrimLog 逐字一致
  var first = JSON.stringify(gs._lastTrimLog);
  var t2 = PB.buildDynamic();
  var second = JSON.stringify(gs._lastTrimLog);
  eq('D2a 两次 _lastTrimLog 逐字一致', second, first);
  eq('D2b 两次输出文本逐字一致', t2, t1);

  // D3：enabled:false ⇒ 不裁剪（红证对照）
  setBudget({ enabled: false, maxTokens: 400 });
  var t3 = PB.buildDynamic();
  eq('D3a enabled:false ⇒ _lastTrimLog 为空', gs._lastTrimLog.length, 0);
  check('D3b enabled:false ⇒ 输出比降级后长得多（' + t3.length + ' > ' + t1.length + '）',
    t3.length > t1.length);
  check('D3c enabled:false ⇒ 未降级的区块原文还在',
    t3.indexOf('产出19') >= 0);

  // D4：降到 sum0 时 query_log 提示必须还在
  setBudget({ enabled: true, maxTokens: 1 });
  PB.buildDynamic();
  var hitSum0 = gs._lastTrimLog.filter(function (x) { return x.section === 'sum0'; }).length > 0;
  check('D4a 预算极小 ⇒ 阶梯走到底（含 sum0）', hitSum0);
  var t4 = PB._buildDynamicLines(7);
  check('D4b sum0 档输出仍带 query_log 提示', t4.indexOf('（更早的事可调 query_log({keyword})）') >= 0);
  check('D4c level 0（未降级）有摘要时也带 query_log 提示',
    PB._buildDynamicLines(0).indexOf('（更早的事可调 query_log({keyword})）') >= 0);
  check('D4d level 0 带【镜头内】（最后防线不动）',
    PB._buildDynamicLines(7).indexOf('>>> 【镜头内】') >= 0);
  check('D4e recent1 档产出物只剩 1 条（不再有「产出19」）',
    PB._buildDynamicLines(1).indexOf('产出19') < 0);

  // ---- P9·S4：预算降级时系统通知不许丢（红→绿） ----
  // 失效模式：_buildDynamicLines 里系统通知 forEach 后立刻清空；刹车会重渲染多档，
  //   若不回填则从第二档起通知消失。此处先用两次裸调用复现「改前丢」，
  //   再用 buildDynamic 证明「改后留」。同一夹具、同一段文本。
  gs._pendingSystemNotices = ['N1'];
  var redFirst = PB._buildDynamicLines(0);
  var redSecond = PB._buildDynamicLines(1);
  check('D5a 红证：裸连续两档渲染，第一档含 N1',
    redFirst.indexOf('N1') >= 0);
  check('D5b 红证：裸连续两档渲染，第二档已丢 N1（降级即丢的失效模式）',
    redSecond.indexOf('N1') < 0);
  setBudget({ enabled: true, maxTokens: 1 });
  gs._pendingSystemNotices = ['N1'];
  var green = PB.buildDynamic();
  check('D5c 绿证：预算设 1 + 塞入 [N1] ⇒ 最终文本仍含 N1（降级走到底）',
    green.indexOf('N1') >= 0);
  check('D5d 绿证：确系触发降级（_lastTrimLog 非空）',
    gs._lastTrimLog.length > 0);
  gs._pendingSystemNotices = [];

  // ---- P9·S12：clip2 档不许砍信息层块尾「不进正文」与「【信息层结束】」 ----
  var savedInfo = globalThis.InfoFeed;
  globalThis.InfoFeed = {
    formatForPrompt: function () {
      return [
        '>>> 【信息层·手机】玩家在剧情外收到的信息',
        '· [讯息 未读1] 老张 → 你 · 2000-10-20 08:00 「西街有人盯梢」',
        '· [广播 公开/街区] 城防司 · 2000-10-20 07:00 「今夜宵禁」',
        '（你可用 info_send 发讯息、info_broadcast 发广播；已列出的内容不要重复发送。）',
        '（分流/混流：默认只写在手机里、不进正文。若某条会改变主角处境、需要他立刻回应、或牵动当前目标/场景，',
        '  发的时候带 importance:\'actionable\' 作建议；要直接把它写进正文，用 info_promote(id)。',
        '  玩家也能在手机上点「跟进正文」自己升级 —— 玩家优先。）',
        '>>> 【信息层结束】'
      ].join('\n');
    }
  };
  // level 2 = clip2 档生效（recent1=1, clip2=2）
  var clip2Text = PB._buildDynamicLines(2);
  check('D6a clip2 档信息层仍含「（你可用 info_send 发讯息',
    clip2Text.indexOf('（你可用 info_send 发讯息') >= 0);
  check('D6b clip2 档信息层仍含「不进正文」分流说明',
    clip2Text.indexOf('不进正文') >= 0);
  check('D6c clip2 档信息层仍含「>>> 【信息层结束】」结束标记',
    clip2Text.indexOf('>>> 【信息层结束】') >= 0);
  // 对照：条目行确被截到 ≤2 行（说明 clip2 真的生效了，不是整体跳过）
  var infoBlock = (clip2Text.split('>>> 【信息层·手机】')[1] || '').split('>>> 【信息层结束】')[0];
  var bodyItems = infoBlock.split('\n').filter(function (l) { return /^\s*·/.test(l); });
  check('D6d clip2 档信息层条目行仍 ≤2（降级确实生效）', bodyItems.length <= 2);
  // D6e 红证：把 P9 之前的裁剪原语（无 _isTailLine，续行一律吃预算）就地重放一遍，
  //   证明同一段文本在旧原语下确会丢「不进正文」与「【信息层结束】」——即 D6b/D6c 是绿。
  var oldClip = (function (text, n) {
    var ls = String(text).split('\n'), out = [], cnt = 0, inItem = false;
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i];
      if (/^\s*[·\-*]/.test(l)) { inItem = true; cnt = 1; out.push(l); continue; }
      if (inItem && l !== '') { if (cnt < n) { out.push(l); cnt++; } continue; }
      out.push(l);
    }
    return out.join('\n');
  })(globalThis.InfoFeed.formatForPrompt(), 2);
  check('D6e 红证：旧原语下「不进正文」已丢', oldClip.indexOf('不进正文') < 0);
  check('D6f 红证：旧原语下「【信息层结束】」已丢', oldClip.indexOf('【信息层结束】') < 0);
  globalThis.InfoFeed = savedInfo;

  // 复位
  globalThis.GameState = saved.GS;
  globalThis.Alias = saved.Alias;
  globalThis.Logger = saved.Logger;
  globalThis.NpcRuntime = saved.NpcRuntime;
  globalThis.StoryNodes = saved.StoryNodes;
  globalThis.Endings = saved.Endings;
  globalThis.Events = saved.Events;
  globalThis.InfoFeed = saved.InfoFeed;
  globalThis.Tasks = saved.Tasks;
  globalThis.Achievements = saved.Achievements;
  globalThis.Proposals = saved.Proposals;
  globalThis.DiceHistory = saved.DiceHistory;
  globalThis.Outputs = saved.Outputs;
  globalThis.Shop = saved.Shop;
  globalThis.Storage = saved.Storage;
}

// ================= E S4 按轮次回退 =================
function runE() {
  var Logger = globalThis.Logger;
  var day = dateOf(2000, 10, 21);
  // 隔离：B/C 组留下的日志（含 C 组的 10-25 未来日志）会污染「受影响条数」，
  //   先清空本卡带的全部日志，E 组只跑自己的夹具。
  Logger.listLogs(CARD, SAVE).forEach(function (l) {
    Logger.deleteLog(CARD, SAVE, l.gameDate);
  });
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-21', gameDate: day,
    title: '当天', summary: '当天', entities: {}, unresolved: [], tags: [], messageCount: 30,
    chunks: [
      { msgFrom: 1, msgTo: 5, text: 'AAA' },
      { msgFrom: 6, msgTo: 10, text: 'BBB' },
      { msgFrom: 11, msgTo: 15, text: 'CCC' }
    ],
    fullText: 'AAA\n\n---\n\nBBB\n\n---\n\nCCC',
    msgFrom: 1, msgTo: 15
  });
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-22', gameDate: dateOf(2000, 10, 22),
    title: '次日', summary: '次日', entities: {}, unresolved: [], tags: [], messageCount: 10,
    fullText: 'DDD'
  });

  // E1 回退到 10-21 的第 10 轮 ⇒ 删 10-22 整条；10-21 只截掉 CCC
  var n = Logger.deleteLogsAfter(CARD, SAVE, day, 10);
  eq('E1a 返回受影响条数 = 2（1 条整删 + 1 条截断）', n, 2);
  var dayLog = Logger.readLog(CARD, SAVE, day);
  check('E1b ★ 当天更早的原文仍在（AAA / BBB）',
    !!dayLog && dayLog.fullText.indexOf('AAA') >= 0 && dayLog.fullText.indexOf('BBB') >= 0);
  check('E1c ★ 该轮之后的原文被删（CCC 没了）',
    !!dayLog && dayLog.fullText.indexOf('CCC') < 0);
  eq('E1d 截断后 fullText 逐字', dayLog.fullText, 'AAA\n\n---\n\nBBB');
  eq('E1e chunks 只剩前两块', dayLog.chunks.length, 2);
  check('E1f 次日的日志整条删了', Logger.readLog(CARD, SAVE, dateOf(2000, 10, 22)) === null);

  // E2 老签名（不传 round）⇒ 只按天删，当天的原文一字不动
  var day2 = dateOf(2000, 10, 23);
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-23', gameDate: day2,
    title: '当天2', summary: 's', entities: {}, unresolved: [], tags: [], messageCount: 9,
    chunks: [{ msgFrom: 1, msgTo: 5, text: 'EEE' }, { msgFrom: 6, msgTo: 9, text: 'FFF' }],
    fullText: 'EEE\n\n---\n\nFFF'
  });
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-24', gameDate: dateOf(2000, 10, 24),
    title: '次日2', summary: 's', entities: {}, unresolved: [], tags: [], messageCount: 3,
    fullText: 'GGG'
  });
  var n2 = Logger.deleteLogsAfter(CARD, SAVE, day2);
  eq('E2a 老签名只删跨天的 1 条', n2, 1);
  var d2 = Logger.readLog(CARD, SAVE, day2);
  check('E2b 老签名下当天原文一字未动',
    !!d2 && d2.fullText === 'EEE\n\n---\n\nFFF' && d2.chunks.length === 2);

  // E3 老日志（无 chunks）在传 round 时保守不动
  var day3 = dateOf(2000, 10, 25);
  Logger.writeLog(CARD, SAVE, {
    id: 'log_2000-10-25b', gameDate: day3,
    title: '老式', summary: 's', entities: {}, unresolved: [], tags: [], messageCount: 4,
    fullText: '老式全文'
  });
  var n3 = Logger.deleteLogsAfter(CARD, SAVE, day3, 1);
  eq('E3a 老日志无 chunks ⇒ 不删也不改（返回 0）', n3, 0);
  var d3 = Logger.readLog(CARD, SAVE, day3);
  check('E3b 老日志原文仍在', !!d3 && d3.fullText === '老式全文');
}

// ================= F 源码防回退 =================
function runF() {
  var lg = read(path.join(root, 'vfs', 'logger.js'));
  var st = read(path.join(root, 'engine', 'story.js'));
  var pb = read(path.join(root, 'engine', 'core', 'prompt_builder.js'));
  var sa = read(path.join(root, 'rn', 'snapshot_actions.js'));
  var lp = read(path.join(root, 'rn', 'panels', 'LogPanel.js'));
  var pd = read(path.join(root, 'rn', 'panels', 'panel_data.js'));

  check('F1 logger.js 已无 messages.slice(-40)', lg.indexOf('messages.slice(-40)') < 0);
  check('F2 logger.js 有 chunks / msgFrom / msgTo',
    lg.indexOf('newChunks') >= 0 && lg.indexOf('msgFrom') >= 0 && lg.indexOf('msgTo') >= 0);
  check('F3 logger.js deleteLogsAfter 带第 4 参 round',
    lg.indexOf('deleteLogsAfter: function(cardId, saveId, gameDate, round)') >= 0);
  check('F4 story.js compress 传 msgFrom', st.indexOf('msgFrom: batchMsgFrom') >= 0);
  check('F5 snapshot_actions.js 传 snap.round',
    sa.indexOf('snap.gameTime, snap.round') >= 0);
  check('F6 prompt_builder.js 工具清单含 query_log({keyword, from?, to?})',
    pb.indexOf('/ query_log({keyword, from?, to?})') >= 0);
  check('F7 prompt_builder.js 有预算刹车入口与阶梯常量',
    pb.indexOf('buildDynamic() {') >= 0 && pb.indexOf('var DEGRADE_STEPS = [') >= 0 &&
    pb.indexOf('_lastTrimLog') >= 0);
  check('F8 prompt_builder.js 前情处带 query_log 提示',
    pb.indexOf('（更早的事可调 query_log({keyword})）') >= 0);
  check('F9 LogPanel.js 搜索框接 Logger.search', lp.indexOf('Logger.search(') >= 0 &&
    lp.indexOf('onSubmitEditing={doSearch}') >= 0);
  check('F10 LogPanel.js 搜索结果补 date（列表行可见日期）',
    lp.indexOf('Object.assign({}, l, { date: ds })') >= 0);
  check('F11 panel_data.js 注释已改（不再写「搜索/清空按钮不搬」）',
    pd.indexOf('搜索/清空按钮不搬（DOM 依赖）') < 0);
  check('F12 rn_bootstrap.js 装载 LogQuery',
    read(path.join(root, 'rn', 'rn_bootstrap.js')).indexOf("load('LogQuery'") >= 0);
  check('F13 桌面 vfs/logger.js 与 RN 同源（P30：行尾归一后比内容；桌面 20301 B CRLF / RN 19817 B LF）',
    lfText(path.join(DESK, 'vfs', 'logger.js')) === lfText(path.join(root, 'vfs', 'logger.js')));
}

// ================= G RN 本仓基线自证（P12·S1 方案 A 本仓化） =================
function runG() {
  // P12·S1：比较对象由桌面仓改为 RN 本仓（path.join(root, …)），基线值取 RN 现盘实测。
  //   此改动源于 P11 复核发现的跨仓耦合，方案 A（用户批准）。
  //   原桌面基线 10046/9B3FC583…、48055/DC7A753F…、38401/C0D889B6… 会在只改桌面时
  //   凭空把本套弄红（P11 已实际发生一次）。桌面同名件只打软提示，不参与断言。
//   P18·GM 提示词正向化（用户 m04975 批准）后，prompt_builder.js 基线更新为 59DB55795079CA1D52551228D2E143F6。
  //   跨仓同源哨兵（F13 于 :578-579、info_feed 两仓同源于下文末条）保持不变。
  //   P30 重记两条基线（见 p30_baseline_align_patch.js 的查证）：
  //     · gamestate.js：旧记录 10383/DE10B95F… 早于 RN 仓首次提交 44a15e4（git 证该文件自那以后未动）
  //     · prompt_builder.js：P26 query_source 协议行 / P27 产出物 title,content,desc / P28 后台进程注入 之后的现盘值
  var bases = [
    ['engine/core/gamestate.js', 'B8D49056F2DD4BD692CA5802434A324D'],
    ['engine/core/prompt_builder.js', '0AB162A92D1BBBCF1C273C369339C567'],
    ['engine/info_feed.js', 'B4533EC5ED9249BE1AA3C46CACF1DF22']
  ];
  bases.forEach(function (b) {
    eq('G RN 本仓 ' + b[0] + ' MD5 与记录一致', md5(path.join(root, b[0])), b[1]);
  });
  eq('G RN engine/info_feed.js 与桌面逐字节同源（P9·S13 两仓同步改）', md5(path.join(root, 'engine', 'info_feed.js')),
    md5(path.join(DESK, 'engine', 'info_feed.js')));
  // 桌面同名件软提示：刻意的跨仓参考，不参与断言
  bases.forEach(function (b) {
    var dp = path.join(DESK, b[0]);
    console.log('  [软提示·桌面] ' + b[0] + ' 现值：' + (fs.existsSync(dp) ? (fs.statSync(dp).size + ' B / ' + md5(dp)) : '（不存在）'));
  });
}

// ================= 主流程 =================
(async function main() {
  boot();
  runA();
  await runB();
  runC();
  runD();
  runE();
  runF();
  runG();
  console.log('');
  console.log('LOG_QUERY_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
})();

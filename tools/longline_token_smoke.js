// ============================================================
// P11 · S10 长线 token 测试（cwd 必须是 RN 仓根：node tools/longline_token_smoke.js）
//
// 目的：在 Node 侧用内存夹具模拟 30+ 回合，观察三件事：
//   ① 预算刹车真的会触发，并按 DEGRADE_STEPS（6 档）收敛，不越档、不倒退；
//   ② Logger 的「摘要 + 40 条分块」两层不会随轮次无限膨胀（分块线性、不重复累积）；
//   ③ 压缩/降级之后，地板区关键状态（当前时间/今天明天/第四部分表头）仍在 prompt 里。
//
// 纪律：只读 + 内存夹具；不写盘到产品目录；不改既有断言。
// ============================================================

'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

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
    setItem: function (k, v) { if (!Object.prototype.hasOwnProperty.call(map, k)) order.push(k); map[k] = String(v); },
    removeItem: function (k) { delete map[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); },
    key: function (i) { return i < order.length ? order[i] : null; }
  };
  Object.defineProperty(api, 'length', { get: function () { return order.length; } });
  return api;
}

// ================= 增长中的动态内容（每轮 +1，模拟长线） =================
var GROW = {
  outs: [], dice: [], ach: [], props: [], tasks: [], nodes: [], summaries: [], notices: []
};
function linesOf(head, arr) {
  if (!arr.length) return null;
  return '>>> ' + head + '\n' + arr.map(function (x) { return '· ' + x; }).join('\n');
}

function boot() {
  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  globalThis.getDiceConfig = globalThis.Storage.getDiceConfig;

  globalThis.GameState = {
    currentCard: {
      name: 'LL',
      game: { title: '长线测试卡', background: '', eraRange: null },
      steps: [],
      statusCard: { enabled: false },
      worldbook: {
        npcs: [
          { id: 'npc_a', name: '甲' }, { id: 'npc_b', name: '乙' },
          { id: 'npc_c', name: '丙' }, { id: 'npc_d', name: '丁' }
        ],
        mapNodes: {}, worldSetting: {}, weather: { mode: 'off' }
      }
    },
    currentCardId: 'card_ll', currentSaveId: 's_ll',
    playerData: {
      portrait: { aiVersion: 1, summary: '一个沉默的调查员，说话很短。', traits: ['说话很冷淡'] },
      inventory: { bar: [], common: [], story: [], rare: [] },
      _openingPrompt: '我从港口醒来'
    },
    chatHistory: [],
    _pendingSystemNotices: [],
    _gameTime: { year: 2000, month: 10, day: 20, hour: 8, minute: 0 },
    currentState: {
      hud: [{ key: 'hp', current: 80, max: 100 }, { key: 'mp', current: 40, max: 60 }],
      sidebar: [{ name: '体力', current: 70, max: 100 }],
      panels: {}
    },
    formatGameTime: function () { return '2000-10-20 08:00'; },
    computeAge: function () { return null; },
    getSegmentText: function () { return '状态正常'; },
    getEntrySegmentText: function () { return ''; },
    invalidateCache: function () {}
  };

  globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
  // 刹车测试用确定性 Logger 桩（真实 Logger.getRecentSummaries 需要 cardId/saveId 参数）
  globalThis.Logger = {
    getRecentSummaries: function () { return GROW.summaries.slice(0, 3).map(function (s, i) { return { date: '2000-10-' + (10 + i), title: '前情' + i, summary: s }; }); },
    getActiveEntities: function () { return { npcs: ['甲'], places: [], items: [], factions: [], unresolved: [] }; }
  };
  globalThis.NpcRuntime = {
    formatFocusBrief: function () { return '镜头内甲'; },
    formatSceneBrief: function () { return '现场甲、现场乙、现场丙'; },
    formatFollowBrief: function () { return '跟随甲'; },
    formatActiveForPrompt: function () { return '镜头内状态'; }
  };
  globalThis.StoryNodes = { formatForPrompt: function () { return linesOf('【剧情节点】进行中', GROW.nodes); } };
  globalThis.Endings = { formatForPrompt: function () { return null; } };
  globalThis.Events = {
    formatPendingForPrompt: function () { return null; },
    formatLocalForPrompt: function () { return null; },
    formatProposalsForPrompt: function () { return null; }
  };
  globalThis.InfoFeed = { formatForPrompt: function () { return null; } };
  globalThis.Tasks = { formatForPrompt: function () { return linesOf('【任务】', GROW.tasks); } };
  globalThis.Achievements = { formatRecentForPrompt: function () { return linesOf('【成就】', GROW.ach); } };
  globalThis.Proposals = { formatForPrompt: function () { return linesOf('【变更提议】', GROW.props); } };
  globalThis.DiceHistory = { formatRecentForPrompt: function () { return linesOf('【骰子历史】', GROW.dice); } };
  globalThis.Outputs = { formatForPrompt: function () { return linesOf('【产出物】', GROW.outs); } };
  globalThis.Shop = { formatShopsForPrompt: function () { return null; } };
  globalThis.Portrait = require(path.join(root, 'engine', 'portrait.js'));
  globalThis.PromptBuilder = require(path.join(root, 'engine', 'core', 'prompt_builder.js'));
}

// ================= ① 30+ 回合预算刹车曲线 =================
function runBrakeTest() {
  var PB = globalThis.PromptBuilder;
  var GS = globalThis.GameState;

  // 预算设小 ⇒ 随内容增长，刹车会逐档触发
  var g = globalThis.Storage.getGlobal();
  g.promptBudget = { enabled: true, maxTokens: 900 };
  globalThis.localStorage.setItem(globalThis.Storage.GLOBAL_KEY, JSON.stringify(g));

  var ROUNDS = 36;
  var rows = [];
  var levelSeq = [];
  var allSteps = [];

  for (var r = 1; r <= ROUNDS; r++) {
    // 每轮增长内容
    GROW.outs.push('产出' + r + '：一件被反复提及的物品' + r);
    GROW.dice.push('第' + r + '轮 判定 → 成功');
    GROW.props.push('变更提议' + r + '：建议把属性 X 改为 ' + r);
    GROW.tasks.push('任务' + r + '：去找甲确认第 ' + r + ' 件事');
    GROW.nodes.push('节点' + r + 'A');
    GROW.nodes.push('节点' + r + 'B');
    if (r % 2 === 0) GROW.ach.push('成就' + r);
    if (r % 3 === 0) GROW.notices.push('系统：第 ' + r + ' 轮触发了一条状态变更通知');
    if (r === 5 || r === 15 || r === 25) GROW.summaries.push('第' + r + '轮之前的前情摘要，讲了很长的一段往事。');

    GS.chatHistory.push({ role: 'user', content: '第' + r + '轮：玩家走进码头查看那艘船。' });
    GS.chatHistory.push({ role: 'assistant', content: '第' + r + '轮正文：你看到船身有新补的木板。' });
    GS._cachedStaticDynamic = null;

    var txt = PB.buildDynamic();
    var est = GS._lastPromptEstimate || 0;
    var level = GS._lastTrimmedLevel || 0;
    var hist = GS.chatHistory.length;

    rows.push({ r: r, est: est, level: level, hist: hist, trimLog: (GS._lastTrimLog || []).slice() });
    levelSeq.push(level);
    (GS._lastTrimLog || []).forEach(function (x) {
      if (allSteps.indexOf(x.section) < 0) allSteps.push(x.section);
    });
  }

  // ---- 数据表：每 5 回合一行 + 末行 ----
  console.log('');
  console.log('---- S10 长线曲线（36 回合）----');
  console.log('回合 | 第四部分 est(token) | 已降级档数 | chatHistory 条数');
  rows.forEach(function (x, i) {
    if ((i + 1) % 5 === 0 || i === rows.length - 1 || i === 0) {
      console.log(String(x.r).padStart(4) + ' | ' + String(x.est).padStart(20) + ' | ' +
        String(x.level).padStart(10) + ' | ' + String(x.hist).padStart(16));
    }
  });
  console.log('--------------------------------');
  console.log('');

  var maxLevel = Math.max.apply(null, levelSeq);
  var firstTrim = -1;
  for (var i = 0; i < levelSeq.length; i++) { if (levelSeq[i] > 0) { firstTrim = i + 1; break; } }

  // ①-a 刹车真触发
  check('S10-a 预算刹车真触发（首次降级出现在第 ' + firstTrim + ' 回合）', firstTrim > 0);
  // ①-b 落到 6 档并收敛（不越档）
  check('S10-b 降级档数封顶 6（实测 maxLevel=' + maxLevel + '）', maxLevel === 6);
  check('S10-c 档数单调不倒退（序列=' + levelSeq.join(',') + '）',
    levelSeq.every(function (v, i) { return i === 0 || v >= levelSeq[i - 1]; }));
  // ①-d 档序与 DEGRADE_STEPS 前缀一致（DEGRADE_STEPS 未导出，从源码切出）
  var pbSrc = read('engine/core/prompt_builder.js');
  var seg = pbSrc.slice(pbSrc.indexOf('var DEGRADE_STEPS'), pbSrc.indexOf('];', pbSrc.indexOf('var DEGRADE_STEPS')));
  var ids = (seg.match(/id:\s*'([^']+)'/g) || []).map(function (m) { return m.replace(/id:\s*'/, '').replace(/'$/, ''); });
  check('S10-d0 从源码读到阶梯常量 6 档（' + ids.join(',') + '）', ids.length === 6);
  check('S10-d 实际降级档序是 DEGRADE_STEPS 的前缀（实测 ' + JSON.stringify(allSteps) + '）',
    allSteps.length > 0 && allSteps.every(function (s, i) { return ids[i] === s; }));
  // ①-e 每档 after ≤ before
  var mono = true;
  rows.forEach(function (x) {
    (x.trimLog || []).forEach(function (t) { if (t.after > t.before) mono = false; });
  });
  check('S10-e 每档降级后 token 不增（after ≤ before）', mono);
  // ①-f 最终收敛到 6 档
  check('S10-f 末轮收敛在第 6 档（实测 ' + levelSeq[levelSeq.length - 1] + '）', levelSeq[levelSeq.length - 1] === 6);

  // ================= ③ 压缩/降级后地板区仍在 =================
  GS._cachedStaticDynamic = null;
  var text0 = PB._buildDynamicLines(0);
  var text6 = PB._buildDynamicLines(6);
  check('S10-g 降级到 6 档后仍含「第四部分 · 系统状态快照」表头', text6.indexOf('第四部分 · 系统状态快照') >= 0);
  check('S10-h 降级到 6 档后仍含「>>> 当前时间：」', text6.indexOf('>>> 当前时间：') >= 0);
  check('S10-i 降级到 6 档后仍含「>>> 今天是 …昨天…明天…」', text6.indexOf('>>> 今天是 ') >= 0 && text6.indexOf('昨天是') >= 0);
  check('S10-j 降级确实压缩了体积（level0=' + text0.length + ' → level6=' + text6.length + ' 字符）',
    text6.length < text0.length);
}

// ================= ② Logger 两层不膨胀 =================
async function runLoggerTest() {
  var LogMod = require(path.join(root, 'vfs', 'logger.js'));

  var summaryText = '这一天玩家在码头与甲交谈，确认了船的身世。'.repeat(3);
  globalThis.ApiClient = {
    chat: async function () {
      return JSON.stringify({
        title: '码头的一天',
        summary: summaryText,
        entities: { npcs: ['甲'], places: ['码头'], items: [], factions: [] },
        unresolved: [], tags: ['码头']
      });
    }
  };

  function mkMsgs(n, from) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: '消息' + (from + i) });
    }
    return out;
  }

  var gd = { year: 2000, month: 10, day: 20 };
  var log1 = await LogMod.compress({ cardId: 'card_ll2', saveId: 's_ll2', gameDate: gd, startGameDate: gd, messages: mkMsgs(120, 0) });
  check('S10-k Logger.compress 返回日志对象', !!log1);
  if (!log1) return;

  check('S10-l 120 条按 40 切块 → chunks = 3（实测 ' + log1.chunks.length + '）', log1.chunks.length === 3);
  var joined = log1.chunks.map(function (c) { return c.text; }).filter(function (t) { return !!t; }).join('\n\n---\n\n');
  check('S10-m fullText 由 chunks 拼出（唯一真源，长度 ' + log1.fullText.length + '）', log1.fullText === joined);
  check('S10-n 摘要受控（长度 ' + String(log1.summary || '').length + ' ≤ 200）', String(log1.summary || '').length <= 200);
  check('S10-o messageCount 累计正确（' + log1.messageCount + ' === 120）', log1.messageCount === 120);

  // 同日再压 40 条：应「追加」而不是「重算/重复」
  var log2 = await LogMod.compress({ cardId: 'card_ll2', saveId: 's_ll2', gameDate: gd, startGameDate: gd, messages: mkMsgs(40, 120) });
  check('S10-p 二次压缩返回日志对象（复用同日档位）', !!log2);
  if (!log2) return;
  check('S10-q 二次压缩后 chunks = 4（120+40 → 3+1，未重复累积；实测 ' + log2.chunks.length + '）', log2.chunks.length === 4);
  check('S10-r 二次压缩后 messageCount = 160（累计非重置）', log2.messageCount === 160);
  check('S10-s 二次压缩后 fullText 仍由 chunks 拼出', log2.fullText === log2.chunks.map(function (c) { return c.text; }).filter(function (t) { return !!t; }).join('\n\n---\n\n'));

  // 源码层：确认两层常量仍在（防未来被改掉）
  var src = read('vfs/logger.js');
  check('S10-t logger.js 仍按 BLOCK = 40 分块', /var\s+BLOCK\s*=\s*40/.test(src));
  check('S10-u logger.js 仍把 chunks 作为 fullText 唯一真源', src.indexOf('chunks 是 fullText 的唯一真源') >= 0);
}

// ================= main =================
(async function main() {
  boot();
  runBrakeTest();
  await runLoggerTest();
  console.log('');
  console.log('LONGLINE_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('LONGLINE_SMOKE 崩了：', e && e.stack || e);
  process.exit(2);
});

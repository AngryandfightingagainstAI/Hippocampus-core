// ============================================================
// 剧情外信息层 · 空闲发起触达 smoke（P16·C）
// 用法：cwd 任意 → node tools/info_tick_smoke.js
// 目的：锁住「玩家几回合内一定能见到手机里来东西」这条可玩性，
//       同时证明冷却 / 概率 / 每回合上限三道闸没有被绕过。
// 两仓逐字节同源：桌面 tools/info_tick_smoke.js 与 RN tools/info_tick_smoke.js 必须一致。
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const isRN = fs.existsSync(path.join(root, 'rn', 'rn_bootstrap.js'));
const otherRoot = isRN
  ? (process.env.HIPPOCAMPUS_DESKTOP || 'D:/AI文游/神秘小引擎测试版/神秘小引擎测试版')
  : (process.env.HIPPOCAMPUS_RN || 'D:/HippocampusRN');

let ok = 0;
let fail = 0;
const failures = [];
function failMsg(n, d) { fail++; failures.push(n + ' :: ' + d); }
async function check(n, fn) {
  try {
    const r = await fn();
    if (r === true) { ok++; console.log('PASS: ' + n); return; }
    failMsg(n, (typeof r === 'string') ? r : '断言为假');
  } catch (e) {
    failMsg(n, '抛错 ' + ((e && e.message) ? e.message : String(e)));
  }
}
async function withRandomFn(gen, body) {
  const R = Math.random;
  Math.random = gen;
  try { return await body(); } finally { Math.random = R; }
}
function withRandom(v, body) { return withRandomFn(function () { return v; }, body); }

// ============================================================
// 平台 mock（与 tools/info_phone_smoke.js 同款口径）
// ============================================================
const vfsData = {};
globalThis.VFS = {
  readJSON: function (p) { return (p in vfsData) ? JSON.parse(JSON.stringify(vfsData[p])) : null; },
  writeJSON: function (p, d) { vfsData[p] = JSON.parse(JSON.stringify(d)); },
  exists: function (p) { return p in vfsData; }
};

const gs = {
  currentCardId: 'card1',
  currentSaveId: 'save1',
  currentCard: { name: '测试卡', worldbook: { npcs: [{ id: 'laowang', name: '老王' }] } },
  chatHistory: [],
  _t: { year: 2000, month: 10, day: 20, hour: 8, minute: 0 },
  formatGameTime: function () {
    const t = this._t;
    const p = function (n) { return String(n).padStart(2, '0'); };
    return t.year + '-' + p(t.month) + '-' + p(t.day) + ' ' + p(t.hour) + ':' + p(t.minute);
  },
  advance: function (mins) {
    const t = this._t;
    t.minute += mins;
    while (t.minute >= 60) { t.minute -= 60; t.hour++; }
    while (t.hour >= 24) { t.hour -= 24; t.day++; }
  }
};
globalThis.GameState = gs;

let settings = { infoFeed: { enabled: true } };
globalThis.Storage = { getGlobal: function () { return settings; } };
globalThis.ToolExecutor = { WHITELIST: {} };
globalThis.NpcRuntime = {
  getFocus: function () { return []; },
  getSceneOnly: function () { return []; },
  addKnowledge: function () { return { ok: true }; }
};
globalThis.Logger = { getRecentSummaries: function () { return []; } };

let apiProfile = { id: 'p_test', max_tokens: 2048 };
let chatImpl = null;
let chatCalls = 0;
globalThis.ApiManager = { getActive: function () { return apiProfile; } };
globalThis.ApiClient = {
  chat: function (msgs, opts) {
    chatCalls++;
    if (!chatImpl) return Promise.reject(new Error('未注入 chatImpl'));
    return chatImpl(msgs, opts);
  }
};
globalThis.Platform = { ui: { appendStory: function () {}, toast: function () {} } };
globalThis.ErrorLog = { action: function () {} };

const InfoFeed = require(path.join(root, 'engine', 'info_feed.js'));
globalThis.InfoFeed = InfoFeed;

const SRC = path.join(root, 'engine', 'info_feed.js');
const src = fs.readFileSync(SRC, 'utf8');
function num(re) { const m = src.match(re); return m ? Number(m[1]) : NaN; }
const COOLDOWN_MIN = num(/var COOLDOWN_MIN = (\d+);/);
const TICK_PROBABILITY = num(/var TICK_PROBABILITY = ([0-9.]+);/);
const FIRST_CONTACT_ROUND = num(/var FIRST_CONTACT_ROUND = (\d+);/);

const ONE_MSG = JSON.stringify({ messages: [{ to: 'laowang', text: '老地方见。' }], broadcast: null });

function resetAll() {
  Object.keys(vfsData).forEach(function (k) { delete vfsData[k]; });
  gs.currentCardId = 'card1';
  gs.currentSaveId = 'save1';
  gs.currentCard = { name: '测试卡', worldbook: { npcs: [{ id: 'laowang', name: '老王' }] } };
  gs.chatHistory = [];
  gs._t = { year: 2000, month: 10, day: 20, hour: 8, minute: 0 };
  chatCalls = 0;
  chatImpl = null;
  apiProfile = { id: 'p_test', max_tokens: 2048 };
  settings = { infoFeed: { enabled: true } };
  InfoFeed._data = null;
}

function msgTotal() {
  const rt = InfoFeed.getRuntime();
  let n = 0;
  Object.keys(rt.threads).forEach(function (k) {
    const th = rt.threads[k];
    if (th && Array.isArray(th.messages)) n += th.messages.length;
  });
  return n + rt.broadcasts.length;
}

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex').toUpperCase(); }

// ============================================================
// 主流程
// ============================================================
(async function main() {
  console.log('INFO_TICK 常量：COOLDOWN_MIN=' + COOLDOWN_MIN +
    ' TICK_PROBABILITY=' + TICK_PROBABILITY +
    ' FIRST_CONTACT_ROUND=' + FIRST_CONTACT_ROUND);

  // ---------------- IT-1 触达率常量 ----------------
  await check('IT-1a 三个常量都能从源码读到', function () {
    return Number.isFinite(COOLDOWN_MIN) && Number.isFinite(TICK_PROBABILITY) && Number.isFinite(FIRST_CONTACT_ROUND);
  });
  await check('IT-1b 冷却 ≤ 30 游戏分钟（原 60 ⇒ 每 4 回合才掷一次骰，太稀）', function () {
    return COOLDOWN_MIN <= 30 ? true : ('COOLDOWN_MIN=' + COOLDOWN_MIN);
  });
  await check('IT-1c 单次掷骰概率 ≥ 0.2（原 0.12）', function () {
    return TICK_PROBABILITY >= 0.2 ? true : ('TICK_PROBABILITY=' + TICK_PROBABILITY);
  });
  await check('IT-1d 首条触达回合是正整数且 ≤ 5', function () {
    return (Number.isInteger(FIRST_CONTACT_ROUND) && FIRST_CONTACT_ROUND >= 1 && FIRST_CONTACT_ROUND <= 5)
      ? true : ('FIRST_CONTACT_ROUND=' + FIRST_CONTACT_ROUND);
  });

  // ---------------- IT-2 首条触达保证（最坏情况也不掷概率） ----------------
  await check('IT-2 空档 + 概率闸恒不过（random=0.999）⇒ 到 FIRST_CONTACT_ROUND 必然发起', async function () {
    resetAll();
    return withRandom(0.999, async function () {
      chatImpl = function () { return Promise.resolve(ONE_MSG); };
      const seen = [];
      for (let r = 1; r <= FIRST_CONTACT_ROUND; r++) {
        chatCalls = 0;
        await InfoFeed.tick({ round: r });
        seen.push(chatCalls);
      }
      const before = seen.slice(0, FIRST_CONTACT_ROUND - 1);
      const last = seen[FIRST_CONTACT_ROUND - 1];
      if (!before.every(function (v) { return v === 0; })) {
        return '首条之前就发起了：' + JSON.stringify(seen);
      }
      if (last !== 1) return '第 ' + FIRST_CONTACT_ROUND + ' 回合没发起：' + JSON.stringify(seen);
      return msgTotal() === 1 ? true : ('写入条数=' + msgTotal());
    });
  });

  // ---------------- IT-3 已有内容后概率闸恢复生效 ----------------
  await check('IT-3 已收到过讯息 + random=0.999 ⇒ 不发起（保证只对首条）', async function () {
    resetAll();
    return withRandom(0.999, async function () {
      InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: '在吗' });
      chatImpl = function () { return Promise.resolve(ONE_MSG); };
      chatCalls = 0;
      await InfoFeed.tick({ round: 9 });
      return chatCalls === 0 ? true : ('chatCalls=' + chatCalls);
    });
  });

  // ---------------- IT-4 首条保证不绕过冷却 ----------------
  await check('IT-4 无内容但刚 tick 过（冷却未满）⇒ 即使到首条回合也不发起', async function () {
    resetAll();
    return withRandom(0.999, async function () {
      chatImpl = function () { return Promise.resolve(ONE_MSG); };
      InfoFeed.load();
      InfoFeed._ensureShape();
      InfoFeed._data.meta.lastTickAt = InfoFeed._nowMinutes();
      chatCalls = 0;
      await InfoFeed.tick({ round: FIRST_CONTACT_ROUND + 5 });
      return chatCalls === 0 ? true : ('chatCalls=' + chatCalls);
    });
  });

  // ---------------- IT-5 概率闸对稳态仍然生效 ----------------
  await check('IT-5 已收到过讯息 + 冷却满足 + random=0.01 ⇒ 发起', async function () {
    resetAll();
    return withRandom(0.01, async function () {
      InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: '在吗' });
      chatImpl = function () { return Promise.resolve(ONE_MSG); };
      chatCalls = 0;
      const before = msgTotal();
      await InfoFeed.tick({ round: 9 });
      if (chatCalls !== 1) return 'chatCalls=' + chatCalls;
      return msgTotal() === before + 1 ? true : ('写入条数=' + (msgTotal() - before));
    });
  });

  // ---------------- IT-6 每回合上限 ----------------
  await check('IT-6 同一回合连调两次 tick ⇒ 只发起一次', async function () {
    resetAll();
    return withRandom(0.01, async function () {
      InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: '在吗' });
      chatImpl = function () { return Promise.resolve(ONE_MSG); };
      chatCalls = 0;
      await InfoFeed.tick({ round: 4 });
      await InfoFeed.tick({ round: 4 });
      return chatCalls === 1 ? true : ('chatCalls=' + chatCalls);
    });
  });

  // ---------------- IT-7 60 回合投递量（确定性伪随机，给数字） ----------------
  await check('IT-7 60 回合稳态投递：首条 ≤ FIRST_CONTACT_ROUND 且有后续讯息', async function () {
    resetAll();
    let seed = 12345;
    const lcg = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    return withRandomFn(lcg, async function () {
      chatImpl = function () { return Promise.resolve(ONE_MSG); };
      let firstAt = 0;
      for (let r = 1; r <= 60; r++) {
        const before = msgTotal();
        await InfoFeed.tick({ round: r });
        if (!firstAt && msgTotal() > before) firstAt = r;
        gs.advance(15);
      }
      const total = msgTotal();
      console.log('INFO_TICK 60 回合：首条=%s 总条数=%s', firstAt, total);
      if (!firstAt || firstAt > FIRST_CONTACT_ROUND) return '首条回合=' + firstAt;
      if (total < 3) return '60 回合只有 ' + total + ' 条，投递过稀';
      return true;
    });
  });

  // ---------------- IT-8 源码守卫（防被删） ----------------
  await check('IT-8a 源码含 _hasAnyInfo 且 tick 里用了 firstContact', function () {
    if (!/_hasAnyInfo:\s*function/.test(src)) return '缺 _hasAnyInfo 定义';
    if (!/var firstContact = /.test(src)) return '缺 firstContact 计算';
    if (!/if \(!firstContact && Math\.random\(\) >= TICK_PROBABILITY\) return;/.test(src)) {
      return '概率闸没接上 firstContact';
    }
    return true;
  });

  await check('IT-8b _hasAnyInfo 的口径：有讯息或有广播都为真，空档为假', function () {
    resetAll();
    InfoFeed.load();
    InfoFeed._ensureShape();
    if (InfoFeed._hasAnyInfo() !== false) return '空档应为 false';
    InfoFeed.publish({ title: '公告', body: 'b' });
    if (InfoFeed._hasAnyInfo() !== true) return '有广播应为 true';
    resetAll();
    InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: 'x' });
    return InfoFeed._hasAnyInfo() === true ? true : '有讯息应为 true';
  });

  await check('IT-8c 三道闸的判定顺序未变（每回合上限 → 冷却 → 概率）', function () {
    const iRound = src.indexOf('this._data.meta.lastTickRound === round && MAX_AI_PER_TURN <= 1');
    const iCool = src.indexOf('(now - last) < COOLDOWN_MIN');
    const iProb = src.indexOf('Math.random() >= TICK_PROBABILITY');
    if (iRound < 0 || iCool < 0 || iProb < 0) return '闸门判定缺失';
    return (iRound < iCool && iCool < iProb) ? true : ('顺序变了：' + iRound + '/' + iCool + '/' + iProb);
  });

  // ---------------- IT-9 两仓同源 ----------------
  await check('IT-9 engine/info_feed.js 两仓逐字节同源', function () {
    const other = path.join(otherRoot, 'engine', 'info_feed.js');
    if (!fs.existsSync(other)) return '找不到对仓文件 ' + other;
    const a = fs.readFileSync(SRC);
    const b = fs.readFileSync(other);
    if (!a.equals(b)) return '字节不同：' + a.length + '/' + md5(a) + ' vs ' + b.length + '/' + md5(b);
    console.log('INFO_TICK 同源件 engine/info_feed.js = %s B / %s', a.length, md5(a));
    return true;
  });

  console.log('---------------------------------');
  failures.forEach(function (f) { console.log('FAIL: ' + f); });
  console.log('INFO_TICK_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
})();

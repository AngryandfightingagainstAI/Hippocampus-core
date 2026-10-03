// ============================================================
// 剧情外信息层（手机）smoke · P1-H / H7 一期
// 用法：cwd 必须是仓根 → node tools/info_phone_smoke.js
// 分组：A 数据层 / B 工具 / C 提示词 / D 传播 / E 玩家·空闲 / F 分流·混流
// 说明：Node 直跑，不依赖 RN 运行时；所有平台依赖以内存 mock 注入 globalThis。
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');

let ok = 0;
let fail = 0;
const failures = [];

function failMsg(name, detail) {
  fail++;
  failures.push(name + ' :: ' + detail);
}

async function check(name, fn) {
  try {
    const r = await fn();
    if (r === true) { ok++; return; }
    failMsg(name, (typeof r === 'string') ? r : '断言为假');
  } catch (e) {
    failMsg(name, '抛错 ' + ((e && e.message) ? e.message : String(e)));
  }
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ============================================================
// 平台 mock
// ============================================================
const vfsData = {};
globalThis.VFS = {
  readJSON: function (p) { return (p in vfsData) ? JSON.parse(JSON.stringify(vfsData[p])) : null; },
  writeJSON: function (p, d) { vfsData[p] = JSON.parse(JSON.stringify(d)); },
  exists: function (p) { return p in vfsData; }
};

const gs = {
  currentCardId: null,
  currentSaveId: null,
  currentCard: null,
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

const knowledge = {};
let focusList = [];
let sceneOnlyList = [];
globalThis.NpcRuntime = {
  getFocus: function () { return focusList.slice(); },
  getSceneOnly: function () { return sceneOnlyList.slice(); },
  addKnowledge: function (id, opts) {
    if (!knowledge[id]) knowledge[id] = [];
    if (knowledge[id].some(function (k) { return k.text === opts.text; })) {
      return { ok: false, reason: '该知识已存在' };
    }
    if (knowledge[id].length >= 20) return { ok: false, reason: '知识已达上限' };
    knowledge[id].push({ text: opts.text, source: opts.source, sourceNote: opts.sourceNote });
    return { ok: true, id: id };
  }
};

globalThis.Logger = {
  getRecentSummaries: function () {
    return [{ date: '2000-10-19', title: '旧事', summary: '昨天发生的事。' }];
  }
};

let apiProfile = null;
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

const storyLines = [];
globalThis.Platform = {
  ui: {
    appendStory: function (line) { storyLines.push(String(line)); },
    toast: function () {}
  }
};

const errLog = [];
globalThis.ErrorLog = { action: function (tag, msg) { errLog.push(tag + ':' + String(msg)); } };

const InfoFeed = require('../engine/info_feed.js');
globalThis.InfoFeed = InfoFeed;
// P9·S13：混流写 chatHistory 的 role:'user' 必须带【系统 · 前缀，否则会被
//   Snapshots._currentRound()（以及全仓 6 处同口径判定）当成真实玩家输入。
const Snapshots = require('../engine/snapshots.js');

// ============================================================
// 复位与工具
// ============================================================
function resetAll() {
  Object.keys(vfsData).forEach(function (k) { delete vfsData[k]; });
  Object.keys(knowledge).forEach(function (k) { delete knowledge[k]; });
  focusList = [];
  sceneOnlyList = [];
  gs.currentCardId = 'card1';
  gs.currentSaveId = 'save1';
  gs.currentCard = {
    name: '测试卡',
    worldbook: { npcs: [{ id: 'laowang', name: '老王' }, { id: 'lisi', name: '李四' }] }
  };
  gs.chatHistory = [];
  gs._t = { year: 2000, month: 10, day: 20, hour: 8, minute: 0 };
  storyLines.length = 0;
  errLog.length = 0;
  chatCalls = 0;
  chatImpl = null;
  apiProfile = { id: 'p_test', max_tokens: 2048 };
  settings = { infoFeed: { enabled: true } };
  InfoFeed._data = null;
}

// ============================================================
// 主流程
// ============================================================
(async function main() {
  // 等 InfoFeed.registerTools（setTimeout 1900ms）落地
  await sleep(2100);
  const wl = globalThis.ToolExecutor.WHITELIST;

  // ---------------- A 数据层 ----------------
  await check('A1 _path 无 cardId/saveId ⇒ null', function () {
    gs.currentCardId = null;
    gs.currentSaveId = null;
    return InfoFeed._path() === null;
  });

  await check('A2 _ensureShape 缺字段旧档补齐不抛', function () {
    const old = { threads: { th_x: { messages: 'oops' } } };
    const out = InfoFeed._ensureShape(old);
    return out === old && out.version === 1 && out.seq === 0 &&
      Array.isArray(out.threadOrder) && Array.isArray(out.broadcasts) &&
      out.threads.th_x && Array.isArray(out.threads.th_x.messages) &&
      out.meta.lastTickAt === null && out.meta.lastTickRound === -1 && out.meta.aiSendCount === 0;
  });

  await check('A3 MAX_MESSAGES_PER_THREAD 裁剪 41⇒40', function () {
    resetAll();
    for (let i = 0; i < 41; i++) {
      InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: 'm' + i });
    }
    const th = InfoFeed.getThread('th_laowang');
    return th && th.messages.length === 40 && th.messages[39].text === 'm40';
  });

  await check('A4 MAX_BROADCASTS 裁剪 61⇒60', function () {
    resetAll();
    for (let i = 0; i < 61; i++) InfoFeed.publish({ title: 't' + i, body: 'b' + i });
    const rt = InfoFeed.getRuntime();
    return rt.broadcasts.length === 60 && rt.broadcasts[59].title === 't60';
  });

  await check('A5 clear() 后 threads={} / broadcasts=[]', function () {
    InfoFeed.clear();
    const rt = InfoFeed.getRuntime();
    return Object.keys(rt.threads).length === 0 && rt.broadcasts.length === 0;
  });

  // ---------------- B 工具 ----------------
  await check('B1 WHITELIST 含 4 个 info_* 工具', function () {
    return ['info_send', 'info_broadcast', 'info_read', 'info_promote'].every(function (k) {
      return wl[k] && typeof wl[k].run === 'function';
    });
  });

  await check('B2 info_send 未知收件人 ⇒ ok:false', function () {
    resetAll();
    const r = wl.info_send.run({ to: 'nobody', text: 'hi' });
    return r.ok === false && /未知收件人/.test(String(r.reason));
  });

  await check('B3 info_broadcast 非法 publicity ⇒ ok:false', function () {
    const r = wl.info_broadcast.run({ title: 't', body: 'b', publicity: '乱写' });
    return r.ok === false && /非法 publicity/.test(String(r.reason));
  });

  await check('B4 合法 info_send ⇒ type:info', function () {
    resetAll();
    const r = wl.info_send.run({ to: 'laowang', text: '老地方见。', importance: 'actionable' });
    return r.ok === true && r.type === 'info' && r.action === 'send' && typeof r.messageId === 'string';
  });

  await check('B5 合法 info_broadcast ⇒ type:info + propagated', function () {
    resetAll();
    focusList = [{ id: 'laowang', name: '老王' }];
    const r = wl.info_broadcast.run({
      title: '今夜停电检修', body: '城北片区 22:00 起停电。',
      publicity: '公开', scope: '城市', sourceName: '市广播'
    });
    return r.ok === true && r.type === 'info' && Array.isArray(r.propagated) && r.propagated.length === 1;
  });

  await check('B6 info_read ⇒ type:query/queryType:info', function () {
    const r = wl.info_read.run({ limit: 5 });
    return r.ok === true && r.type === 'query' && r.queryType === 'info' && r.data && Array.isArray(r.data.threads);
  });

  // ---------------- C 提示词 ----------------
  await check('C1 有数据 ⇒ 含 >>> 【信息层·手机】', function () {
    resetAll();
    wl.info_send.run({ to: 'laowang', text: '老地方见。' });
    const s = InfoFeed.formatForPrompt();
    return typeof s === 'string' && s.indexOf('>>> 【信息层·手机】') >= 0;
  });

  await check('C2 讯息 ≤ PROMPT_THREADS(5)', function () {
    resetAll();
    for (let i = 0; i < 7; i++) {
      InfoFeed.pushMessage({ from: 'npc' + i, fromName: 'N' + i, to: 'player', threadId: 'th_npc' + i, text: 'x' + i });
    }
    const s = InfoFeed.formatForPrompt() || '';
    return (s.match(/· \[讯息/g) || []).length === 5;
  });

  await check('C3 广播 ≤ PROMPT_BROADCASTS(3)', function () {
    for (let i = 0; i < 5; i++) InfoFeed.publish({ title: 'bc' + i, body: 'b' });
    const s = InfoFeed.formatForPrompt() || '';
    return (s.match(/· \[广播/g) || []).length === 3;
  });

  await check('C4 空数据 ⇒ formatForPrompt() === null', function () {
    resetAll();
    return InfoFeed.formatForPrompt() === null;
  });

  await check('C5 提示词不含 fanFuture/endings/foreshadows', function () {
    resetAll();
    InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: '老地方见。' });
    InfoFeed.publish({ title: '停电', body: 'b', sourceName: '市广播' });
    const s = InfoFeed.formatForPrompt() || '';
    return !/fanFuture|endings|foreshadows/.test(s);
  });

  // ---------------- D 传播 ----------------
  await check('D1 公开+城市 ⇒ focus NPC 各 +1 source:public', function () {
    resetAll();
    focusList = [{ id: 'laowang', name: '老王' }, { id: 'lisi', name: '李四' }];
    InfoFeed.publish({ title: '停电公告', body: 'b', publicity: '公开', scope: '城市', sourceName: '市广播' });
    return knowledge.laowang && knowledge.laowang.length === 1 &&
      knowledge.laowang[0].source === 'public' &&
      knowledge.laowang[0].text === '公开消息：停电公告' &&
      knowledge.lisi && knowledge.lisi.length === 1;
  });

  await check('D2 暗中 ⇒ 0 传播', function () {
    resetAll();
    focusList = [{ id: 'laowang', name: '老王' }];
    const bc = InfoFeed.publish({ title: '秘密', body: 'b', publicity: '暗中', scope: '城市' });
    return bc.propagated.length === 0 && !knowledge.laowang;
  });

  await check('D3 半公开 ⇒ 仅 focus（不含 sceneOnly）', function () {
    resetAll();
    focusList = [{ id: 'laowang', name: '老王' }];
    sceneOnlyList = [{ id: 'lisi', name: '李四' }];
    const bc = InfoFeed.publish({ title: '半公开事', body: 'b', publicity: '半公开', scope: '城市' });
    return bc.propagated.length === 1 && bc.propagated[0] === 'laowang' && !knowledge.lisi;
  });

  await check('D4 连发 25 条不超 MAX_KNOWLEDGE(20)', function () {
    resetAll();
    focusList = [{ id: 'laowang', name: '老王' }];
    for (let i = 0; i < 25; i++) InfoFeed.publish({ title: '公告' + i, body: 'b' });
    return knowledge.laowang && knowledge.laowang.length === 20;
  });

  // ---------------- E 玩家 / 空闲 ----------------
  await check('E1 playerSend ⇒ origin:player / flow:info / unread 归零 / 叙事流不变', function () {
    resetAll();
    InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: '在吗' });
    InfoFeed.markRead('th_laowang');
    const c0 = gs.chatHistory.length;
    const s0 = storyLines.length;
    const m = InfoFeed.playerSend('th_laowang', '在的');
    const th = InfoFeed.getThread('th_laowang');
    return m && m.origin === 'player' && m.flow === 'info' && th.unread === 0 &&
      gs.chatHistory.length === c0 && storyLines.length === s0;
  });

  await check('E2 tick 注入 mock chat ⇒ 写入 1 条 + meta.lastTickAt 更新 + flow:info', async function () {
    resetAll();
    const origRandom = Math.random;
    Math.random = function () { return 0.01; };
    chatImpl = function () {
      return Promise.resolve(JSON.stringify({ messages: [{ to: 'laowang', text: '老地方见。' }], broadcast: null }));
    };
    gs._t = { year: 2000, month: 10, day: 20, hour: 8, minute: 0 };
    await InfoFeed.tick({ round: 1 });
    Math.random = origRandom;
    const rt = InfoFeed.getRuntime();
    const msgs = (rt.threads.th_laowang && rt.threads.th_laowang.messages) || [];
    return msgs.length === 1 && msgs[0].flow === 'info' &&
      typeof rt.meta.lastTickAt === 'number' && rt.meta.lastTickRound === 1;
  });

  await check('E3 冷却期内二次 tick ⇒ 不再发起', async function () {
    const origRandom = Math.random;
    Math.random = function () { return 0.01; };
    chatCalls = 0;
    chatImpl = function () { return Promise.resolve('{}'); };
    gs.advance(10); // 距上次 10 游戏分钟 < COOLDOWN_MIN(25，P16·C 由 60 改)
    await InfoFeed.tick({ round: 2 });
    Math.random = origRandom;
    const rt = InfoFeed.getRuntime();
    return chatCalls === 0 && rt.threads.th_laowang.messages.length === 1;
  });

  await check('E4 坏 JSON ⇒ 0 写入且不抛', async function () {
    resetAll();
    const origRandom = Math.random;
    Math.random = function () { return 0.01; };
    chatImpl = function () { return Promise.resolve('这不是 JSON'); };
    await InfoFeed.tick({ round: 1 });
    Math.random = origRandom;
    const rt = InfoFeed.getRuntime();
    return Object.keys(rt.threads).length === 0 && rt.broadcasts.length === 0 && rt.meta.lastTickAt === null;
  });

  await check('E5 无 key（getActive 为 null）⇒ 0 写入且不抛', async function () {
    resetAll();
    const origRandom = Math.random;
    Math.random = function () { return 0.01; };
    apiProfile = null;
    chatImpl = function () { throw new Error('不该被调用'); };
    let threw = false;
    try { await InfoFeed.tick({ round: 1 }); } catch (e) { threw = true; }
    Math.random = origRandom;
    const rt = InfoFeed.getRuntime();
    return !threw && Object.keys(rt.threads).length === 0 && rt.broadcasts.length === 0;
  });

  await check('E6 三处空态文案逐字（RN 侧源文件）', function () {
    const phoneSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'InfoPhonePanel.js'), 'utf8');
    const pdSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'panel_data.js'), 'utf8');
    return phoneSrc.indexOf('还没有收到任何讯息。') >= 0 &&
      phoneSrc.indexOf('还没有广播。') >= 0 &&
      pdSrc.indexOf('手机模块未加载。') >= 0;
  });

  // ---------------- F 分流 / 混流 ----------------
  let fMsg = null;
  let fMsg2 = null;

  await check('F1 默认条目 flow:info 且 chatHistory / 叙事流不变', function () {
    resetAll();
    fMsg = InfoFeed.pushMessage({ from: 'laowang', fromName: '老王', to: 'player', threadId: 'th_laowang', text: '老地方见。' });
    return fMsg.flow === 'info' && gs.chatHistory.length === 0 && storyLines.length === 0;
  });

  await check('F2 importance:actionable 不改 flow', function () {
    InfoFeed.setImportance(fMsg.id, 'actionable');
    const it = InfoFeed.getThread('th_laowang').messages[0];
    return it.importance === 'actionable' && it.flow === 'info';
  });

  await check('F3 promoteToStory(by:ai) ⇒ flow:story / 叙事流+1 / chatHistory 不变', function () {
    const b0 = storyLines.length;
    const c0 = gs.chatHistory.length;
    const r = InfoFeed.promoteToStory(fMsg.id, { by: 'ai' });
    const it = InfoFeed.getThread('th_laowang').messages[0];
    return r.ok === true && it.flow === 'story' &&
      storyLines.length === b0 + 1 && gs.chatHistory.length === c0 &&
      storyLines[storyLines.length - 1].indexOf('【手机】') === 0;
  });

  await check('F4 promoteToStory(by:player) ⇒ 叙事流+1 且 chatHistory+1(role:user)', function () {
    fMsg2 = InfoFeed.pushMessage({ from: 'lisi', fromName: '李四', to: 'player', threadId: 'th_lisi', text: '来一趟。' });
    const b1 = storyLines.length;
    const c1 = gs.chatHistory.length;
    const r = InfoFeed.promoteToStory(fMsg2.id, { by: 'player', note: '我去看看' });
    const it = InfoFeed.getThread('th_lisi').messages[0];
    const last = gs.chatHistory[gs.chatHistory.length - 1];
    return r.ok === true && it.flow === 'story' &&
      storyLines.length === b1 + 1 && gs.chatHistory.length === c1 + 1 &&
      last && last.role === 'user';
  });

  await check('F4b promoteToStory(by:player) 写入带【系统 · 前缀（Snapshots._currentRound 不变）', function () {
    const m3 = InfoFeed.pushMessage({ from: 'lisi', fromName: '李四', to: 'player', threadId: 'th_lisi', text: '速来。' });
    const r0 = Snapshots._currentRound();
    const c0 = gs.chatHistory.length;
    const r = InfoFeed.promoteToStory(m3.id, { by: 'player', note: '我去看看' });
    const last = gs.chatHistory[gs.chatHistory.length - 1];
    return r.ok === true && gs.chatHistory.length === c0 + 1 &&
      last && last.role === 'user' && String(last.content).indexOf('【系统 ·') === 0 &&
      Snapshots._currentRound() === r0;
  });

  await check('F5 二次调用 ⇒ {ok:false, reason:已混流}', function () {
    const r = InfoFeed.promoteToStory(fMsg.id, { by: 'ai' });
    return r.ok === false && r.reason === '已混流';
  });

  await check('F6 未知 id ⇒ {ok:false}', function () {
    const r = InfoFeed.promoteToStory('msg_nope', { by: 'ai' });
    return r.ok === false && /未知条目/.test(String(r.reason));
  });

  await check('F7 广播可升级 + tick 产物永不 story', async function () {
    resetAll();
    const bc = InfoFeed.publish({ title: '停电', body: 'b' });
    const r = InfoFeed.promoteToStory(bc.id, { by: 'ai' });
    if (!(r.ok === true && r.line.indexOf('【手机·广播】') === 0)) return '广播升级失败';
    // tick 产物一律 info
    const origRandom = Math.random;
    Math.random = function () { return 0.01; };
    chatImpl = function () {
      return Promise.resolve(JSON.stringify({ messages: [{ to: 'laowang', text: '你好' }], broadcast: { title: '号外', body: 'b', publicity: '公开', scope: '城市' } }));
    };
    gs._t = { year: 2000, month: 10, day: 20, hour: 9, minute: 0 };
    await InfoFeed.tick({ round: 3 });
    Math.random = origRandom;
    const rt = InfoFeed.getRuntime();
    const all = [];
    Object.keys(rt.threads).forEach(function (k) {
      rt.threads[k].messages.forEach(function (m) { all.push(m.flow); });
    });
    rt.broadcasts.forEach(function (b) { if (b.origin === 'ai' && b.title === '号外') all.push(b.flow); });
    return all.length > 0 && all.every(function (f) { return f === 'info'; });
  });

  // ---------------- G RN 接线（H7R 补漏） ----------------
  // G3/G4/G6 走真身 gamestate.js / prompt_builder.js 的行为断言：只有 RN 侧补了
  // InfoFeed.load / InfoFeed.formatForPrompt 两处 hook 才会绿。G1/G2 为源码防回退断言。
  function runRealBuildDynamic(infoFeedGlobal) {
    const RealGS = require('../engine/core/gamestate.js');
    const PB = require('../engine/core/prompt_builder.js');
    const saved = {
      GS: globalThis.GameState, Npc: globalThis.NpcRuntime,
      Alias: globalThis.Alias, IF: globalThis.InfoFeed
    };
    globalThis.GameState = RealGS;
    // 真身 buildDynamic 会调 NpcRuntime.format*Brief，smoke 的 mock 无这些方法
    globalThis.NpcRuntime = undefined;
    globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
    globalThis.InfoFeed = infoFeedGlobal;
    RealGS.currentCard = { name: '测试卡', steps: [], worldbook: {} };
    RealGS.playerData = {};
    RealGS.chatHistory = [];
    RealGS.currentCardId = null;
    RealGS.currentSaveId = null;
    RealGS._gameTime = { year: 2000, month: 10, day: 20, hour: 8, minute: 0 };
    RealGS._pendingSystemNotices = [];
    RealGS.currentState = { hud: [], sidebar: [], panels: {} };
    RealGS._cachedStaticDynamic = null;
    try {
      return PB.buildDynamic();
    } finally {
      globalThis.GameState = saved.GS;
      globalThis.NpcRuntime = saved.Npc;
      globalThis.Alias = saved.Alias;
      globalThis.InfoFeed = saved.IF;
    }
  }

  await check('G1 RN gamestate.js 源码含 InfoFeed.load 调用', function () {
    const src = fs.readFileSync(path.join(root, 'engine', 'core', 'gamestate.js'), 'utf8');
    return src.indexOf("if (typeof InfoFeed !== 'undefined' && typeof InfoFeed.load === 'function') InfoFeed.load();") >= 0;
  });

  await check('G2 RN prompt_builder.js 源码含 InfoFeed.formatForPrompt 注入块', function () {
    const src = fs.readFileSync(path.join(root, 'engine', 'core', 'prompt_builder.js'), 'utf8');
    return src.indexOf('// 信息层（剧情外）') >= 0 &&
      src.indexOf("if (typeof InfoFeed !== 'undefined' && typeof InfoFeed.formatForPrompt === 'function') {") >= 0;
  });

  await check('G3 跨档 loadFromSave 两次 ⇒ InfoFeed._data 换第二档、第一档不残留', function () {
    const RealGS = require('../engine/core/gamestate.js');
    const saved = {
      GS: globalThis.GameState, Npc: globalThis.NpcRuntime,
      Saves: globalThis.Saves, dialog: globalThis.Platform.dialog
    };
    globalThis.GameState = RealGS;
    globalThis.NpcRuntime = undefined; // 真身 loadFromSave 会调 NpcRuntime.load()，mock 无
    globalThis.Saves = {
      load: function (cardId) {
        return {
          card: { name: '卡' + cardId, steps: [], worldbook: {}, hud: [], sidebar: [], panels: [] },
          player: { playerData: {}, gameTime: { year: 2000, month: 1, day: 1, hour: 8, minute: 0 } },
          chat: { messages: [] }
        };
      }
    };
    globalThis.Platform.dialog = { alert: function () {} };

    vfsData['/saves/card1/save1/info_feed.json'] = {
      threads: { th_a: { id: 'th_a', name: '甲', messages: [{ id: 'm1', from: 'laowang', fromName: '老王', to: 'player', text: '第一档消息', flow: 'info' }] } },
      broadcasts: []
    };
    vfsData['/saves/card2/save2/info_feed.json'] = {
      threads: { th_b: { id: 'th_b', name: '乙', messages: [{ id: 'm2', from: 'lisi', fromName: '李四', to: 'player', text: '第二档消息', flow: 'info' }] } },
      broadcasts: []
    };

    RealGS.loadFromSave('card1', 'save1');
    const after1 = JSON.stringify(InfoFeed._data || {});
    RealGS.loadFromSave('card2', 'save2');
    const after2 = JSON.stringify(InfoFeed._data || {});

    globalThis.GameState = saved.GS;
    globalThis.NpcRuntime = saved.Npc;
    globalThis.Saves = saved.Saves;
    globalThis.Platform.dialog = saved.dialog;

    return after1.indexOf('第一档消息') >= 0 &&
      after2.indexOf('第二档消息') >= 0 &&
      after2.indexOf('第一档消息') < 0;
  });

  await check('G4 真实 buildDynamic 路径调用 InfoFeed.formatForPrompt ≥1 次且非空入结果', function () {
    let calls = 0;
    const MARK = '>>> 【信息层·手机】SPY_MARKER_H7R';
    const spy = { formatForPrompt: function () { calls++; return MARK; } };
    const out = runRealBuildDynamic(spy);
    return calls >= 1 && String(out).indexOf(MARK) >= 0;
  });

  await check('G5 无数据时 InfoFeed.formatForPrompt() 返回 null', function () {
    gs.currentCardId = 'cardX';
    gs.currentSaveId = 'saveX';
    InfoFeed._data = null;
    return InfoFeed.formatForPrompt() === null;
  });

  await check('G6 无数据时真实 buildDynamic 结果不含「>>> 【信息层·手机】」', function () {
    InfoFeed._data = null;
    const out = runRealBuildDynamic(InfoFeed);
    return String(out).indexOf('>>> 【信息层·手机】') < 0;
  });

  // ============================================================
  // P13·S5-a：未读可见性出口 + 三处同真源（源码级，可被 S1 改动推翻）
  // ============================================================
  await check('G7 S1-a 侧栏未读徽标出口（panelRow 第三参 badge + infoPhone 传未读数 + 徽标渲染）', function () {
    const src = fs.readFileSync(path.join(root, 'rn', 'components', 'SidebarDrawer.js'), 'utf8');
    return src.indexOf('function panelRow(key, label, badge) {') >= 0 &&
      src.indexOf("var showBadge = (typeof badge === 'number' && badge > 0);") >= 0 &&
      src.indexOf('style={styles.panelBadge}') >= 0 &&
      src.indexOf("{panelRow('infoPhone', '手机', infoUnread)}") >= 0;
  });

  await check('G8 S5-a 三处未读同真源（SidebarDrawer / StoryScreen / panel_data 各消费点逐字）', function () {
    const sidebar = fs.readFileSync(path.join(root, 'rn', 'components', 'SidebarDrawer.js'), 'utf8');
    const story = fs.readFileSync(path.join(root, 'rn', 'screens', 'StoryScreen.js'), 'utf8');
    const panel = fs.readFileSync(path.join(root, 'rn', 'panels', 'panel_data.js'), 'utf8');
    const hitSidebar = sidebar.indexOf('infoUnread = InfoFeed.unreadTotal() || 0') >= 0;
    const hitStory = story.indexOf('phoneUnread = InfoFeed.unreadTotal() || 0') >= 0;
    const hitPanel = panel.indexOf('out.unread = InfoFeed.unreadTotal() || 0') >= 0;
    // 反向：不许另立第二真源（组件内自增计数器）
    const noSecondSource = sidebar.indexOf('setUnread') < 0 && story.indexOf('setPhoneUnread') < 0;
    return hitSidebar && hitStory && hitPanel && noSecondSource;
  });

  await check('G9 S1-b 叙事页顶栏未读出口（无未读不占位：三元 + null 分支）', function () {
    const src = fs.readFileSync(path.join(root, 'rn', 'screens', 'StoryScreen.js'), 'utf8');
    return src.indexOf('{phoneUnread > 0 ? (') >= 0 &&
      src.indexOf('StoryStore.openPanel(\'infoPhone\');') >= 0 &&
      src.indexOf('style={styles.topPhoneBadge}') >= 0 &&
      src.indexOf('{phoneUnread > 99 ? \'99+\' : String(phoneUnread)}') >= 0 &&
      src.indexOf('        ) : null}') >= 0;
  });

  await check('G10 S1-c 页边注出口（story_changes info 分支 + engine/story tick 后 appendHint）', function () {
    const changes = fs.readFileSync(path.join(root, 'rn', 'story_changes.js'), 'utf8');
    const story = fs.readFileSync(path.join(root, 'engine', 'story.js'), 'utf8');
    return changes.indexOf("} else if (r.type === 'info') {") >= 0 &&
      changes.indexOf("if (r.action === 'send') lines.push({ icon: 'device-mobile', text: '手机收到了新讯息' });") >= 0 &&
      changes.indexOf("else if (r.action === 'broadcast') lines.push({ icon: 'device-mobile', text: '手机收到了新广播' });") >= 0 &&
      story.indexOf("Platform.ui.appendHint('📱 手机收到了新讯息');") >= 0 &&
      story.indexOf('if (__unreadAfter <= __unreadBefore) return;') >= 0;
  });

  await check('G11 S5-a 面板内未读出口 + PanelHost 分派（InfoPhonePanel 渲染出口 / infoPhone 路由）', function () {
    const panel = fs.readFileSync(path.join(root, 'rn', 'components', 'InfoPhonePanel.js'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'rn', 'components', 'PanelHost.js'), 'utf8');
    return panel.indexOf("Text style={styles.statusUnread}>{'未读 ' + view.unread}") >= 0 &&
      panel.indexOf("{t.unread > 0 ? (") >= 0 &&
      host.indexOf("var InfoPhonePanel = require('./InfoPhonePanel.js');") >= 0 &&
      host.indexOf("panelId === 'infoPhone' ? <InfoPhonePanel") >= 0;
  });

  // ---------------- 汇总 ----------------
  console.log('INFO_PHONE_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) {
    console.log('FAILURES:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  process.exit(0);
})().catch(function (e) {
  console.log('INFO_PHONE_SMOKE: ' + ok + ' ok, ' + (fail + 1) + ' failed');
  console.log('FAILURES:');
  console.log('  - 主流程抛错 :: ' + ((e && e.stack) ? e.stack : String(e)));
  process.exit(1);
});
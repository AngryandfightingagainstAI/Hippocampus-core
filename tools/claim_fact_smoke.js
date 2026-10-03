// ============================================================
// P14 · Claim / Fact 隔离 smoke
//   cwd 必须是仓根：
//     RN   : cd D:\HippocampusRN && node tools/claim_fact_smoke.js
//     桌面 : cd 神秘小引擎测试版 && node tools/claim_fact_smoke.js
//
// 覆盖（对应用户 2026-10-02 设计稿第八节 CF-1…CF-6）：
//   CF-1 内核规则：玩家陈述 ≠ 世界事实（engineRules + promptRules 裂痕原则）
//   CF-2 知识条目可表达「来源=玩家本人 / 未确认」
//   CF-3 未确认标记在注入 AI 的两条链路上都可见（formatActiveForPrompt /
//        buildForm 的 knownFactsText）
//   CF-4 NPC 更新：玩家听说的事实不得升格为 deduced；保留 unverified
//   CF-5 日志压缩提示词保留「声称」语气（防 Claim→Fact 洗白；含兜底摘要路径）
//   CF-6 工具协议声明与实现一致（npc_knows 有 origin/unverified；枚举含 legacy）
//
// 纪律：只读产品代码 + 内存夹具；不改既有断言。
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

// ---------------- 内存夹具 ----------------
function installMemLocalStorage() {
  var mem = {};
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; }
  };
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

var PB, NR, LG, STORE;
var NPC_ID = 'npc_a', NPC_NAME = '阿甲';

function boot() {
  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  STORE = globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  globalThis.getDiceConfig = STORE.getDiceConfig;
  if (STORE.getThinkingConfig) globalThis.getThinkingConfig = STORE.getThinkingConfig;

  globalThis.GameState = {
    currentCard: {
      name: 'CF',
      game: { title: 'claim/fact 测试卡', background: '', eraRange: null },
      steps: [],
      statusCard: { enabled: false },
      worldbook: {
        npcs: [{ id: NPC_ID, name: NPC_NAME, gender: '女', age: 20, desc: '测试 NPC' }],
        mapNodes: {}, worldSetting: {}, weather: { mode: 'off' }
      }
    },
    currentCardId: 'card_cf', currentSaveId: 's_cf',
    playerData: { portrait: null, inventory: { bar: [], common: [], story: [], rare: [] }, name: '测试者' },
    chatHistory: [], _pendingSystemNotices: [],
    _gameTime: { year: 2000, month: 11, day: 14, hour: 7, minute: 8 },
    currentState: { hud: [], sidebar: [], panels: {} },
    formatGameTime: function () { return '2000-11-14 07:08'; },
    computeAge: function () { return null; },
    getSegmentText: function () { return ''; },
    invalidateCache: function () {}
  };
  globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
  globalThis.WebSearchManager = { isEnabled: function () { return false; } };

  globalThis.ToolExecutor = require(path.join(root, 'engine', 'core', 'tool_executor.js'));
  globalThis.ApiClient = { chat: function () { return Promise.resolve('{}'); } };
  NR = globalThis.NpcRuntime = require(path.join(root, 'engine', 'npc_runtime.js'));
  LG = globalThis.Logger = require(path.join(root, 'vfs', 'logger.js'));
  PB = globalThis.PromptBuilder = require(path.join(root, 'engine', 'core', 'prompt_builder.js'));
}

// ---------------- CF-1 内核规则 ----------------
function runCF1() {
  var rules = (PB.GM_DEFAULTS && PB.GM_DEFAULTS.engineRules) || [];
  var joined = rules.join('\n');
  var stmt = rules.filter(function (r) { return /声称|陈述/.test(r) && /事实/.test(r); });
  check('CF-1a engineRules 含「玩家陈述 ≠ 世界事实」规则（实测命中 ' + stmt.length + ' 条）', stmt.length >= 1);
  check('CF-1b 该规则写明玩家可以撒谎/吹牛/试探（不替玩家判断真假）',
    stmt.length >= 1 && /撒谎|吹牛|试探|真假/.test(stmt[0]));
  check('CF-1c 该规则点明「当作事实叙述的只有三种」（正向表述）',
    stmt.length >= 1 && stmt[0].indexOf('当作事实叙述的只有三种') >= 0 && /他说\s*\/\s*他自称/.test(stmt[0]));
  check('CF-1d 该规则与「玩家主体归玩家」并存（engineRules ≥ 12 条，实测 ' + rules.length + '）',
    rules.length >= 12 && /玩家主体归玩家/.test(joined));
  var prules = (PB.GM_DEFAULTS && PB.GM_DEFAULTS.promptRules) || [];
  var rift = prules.filter(function (r) { return r.indexOf('【裂痕原则】') >= 0; })[0] || '';
  check('CF-1e【裂痕原则】把玩家陈述也纳入（"线索"覆盖玩家）',
    rift.indexOf('玩家的陈述') >= 0 && rift.indexOf('线索') >= 0);
}

// ---------------- CF-2 / CF-3 知识条目与渲染 ----------------
function runCF2() {
  var r = NR.addKnowledge(NPC_ID, {
    text: '玩家曾向阿甲声称自己是皇家骑士',
    source: 'told',
    origin: 'player',
    unverified: true
  });
  check('CF-2a addKnowledge 接受 origin / unverified', !!r && r.ok === true);
  check('CF-2b 返回值带 source=told', !!r && r.source === 'told');

  var rt = NR.get(NPC_ID) || {};
  var item = (rt.knownFacts || []).filter(function (f) { return f && f.text && f.text.indexOf('皇家骑士') >= 0; })[0];
  check('CF-2c 条目含 origin 字段且 = player', !!item && item.origin === 'player');
  check('CF-2d 条目含 unverified 字段且 = true', !!item && item.unverified === true);

  // 普通知识默认不带未确认标记（向后兼容：旧档语义不变）
  var r2 = NR.addKnowledge(NPC_ID, { text: '阿甲亲眼看见门开了', source: 'witness' });
  var rt2 = NR.get(NPC_ID) || {};
  var item2 = (rt2.knownFacts || []).filter(function (f) { return f && f.text === '阿甲亲眼看见门开了'; })[0];
  check('CF-2e 未传 unverified 的条目默认为 false（旧档语义不变）',
    !!r2 && r2.ok === true && !!item2 && item2.unverified === false);

  // 渲染：注入 AI 的知识块必须能看出「未确认」
  //   formatActiveForPrompt 只渲染「镜头内」NPC ⇒ 先聚焦，否则返回空串（会造成假红）
  NR.setRuntime({
    npcs: (NR.getRuntime() || {}).npcs || {},
    focus: [NPC_ID], scene: [], follow: []
  });
  var block = NR.formatActiveForPrompt();
  check('CF-3a formatActiveForPrompt 输出含该条目', block.indexOf('皇家骑士') >= 0);
  check('CF-3b 该行标注「未确认」', /未确认/.test(block));
  check('CF-3c 该行标注来源为玩家本人', /玩家自称|玩家声称|来源.?玩家/.test(block));

  // 合并路径保留字段（NPC 更新走 _mergeKnowledge）
  NR.applyUpdate(NPC_ID, { heardClaims: ['玩家说他昨天杀了城主'] });
  var rt3 = NR.get(NPC_ID) || {};
  var claim = (rt3.knownFacts || []).filter(function (f) { return f && f.text && f.text.indexOf('杀了城主') >= 0; })[0];
  check('CF-3d applyUpdate 的 heardClaims 落库为 unverified=true', !!claim && claim.unverified === true);
  check('CF-3e 该条 origin = player', !!claim && claim.origin === 'player');
}

// ---------------- CF-4 更新提示词与落库 ----------------
function runCF4() {
  var p = NR.buildUpdatePrompt(NPC_ID, 20);
  check('CF-4a buildUpdatePrompt 可用', !!p && typeof p.sys === 'string');
  check('CF-4b 输出格式区分「已确认」与「听说的/未确认」两类（含 heardClaims）',
    p && p.sys.indexOf('heardClaims') >= 0);
  check('CF-4c 系统提示词写明玩家说的进 heardClaims',
    p && /玩家(单方面)?(说|告诉|声称|自称)/.test(p.sys) && /heardClaims/.test(p.sys));

  // 关键：AI 把声称混写进 knownFacts 时，必须降级而非升格为 deduced
  NR.applyUpdate(NPC_ID, { knownFacts: ['玩家自称他是国王的亲信'] });
  var rt = NR.get(NPC_ID) || {};
  var mixed = (rt.knownFacts || []).filter(function (f) { return f && f.text && f.text.indexOf('国王的亲信') >= 0; })[0];
  check('CF-4d 命中「自称」的知识未被标为 deduced（实测 source=' + (mixed && mixed.source) + '）',
    !!mixed && mixed.source !== 'deduced');
  check('CF-4e 且被标记 unverified=true', !!mixed && mixed.unverified === true);

  // UI 层：buildForm 不得把 AI 新提的知识一律标「推演」
  var formSrc = '', isRN = fs.existsSync(path.join(root, 'rn', 'npc_actions_rn.js'));
  formSrc = read(isRN ? 'rn/npc_actions_rn.js' : 'engine/ui_npc.js');
  check('CF-4f UI 知识来源映射补齐 rumor（传闻）',
    /rumor\s*:\s*'/.test(formSrc));
  check('CF-4g UI 知识来源映射补齐 misconception（误信/误解）',
    /misconception\s*:\s*'/.test(formSrc));
  check('CF-4h buildForm 不再把 AI 新提知识一律标 deduced',
    formSrc.indexOf("factLines.push('[' + KNOWLEDGE_SRC_CN.deduced + '] ' + t)") < 0 &&
    formSrc.indexOf('KNOWLEDGE_SRC_CN.deduced + \'] \' + t') < 0);
}

// ---------------- CF-5 日志压缩保语气 ----------------
async function runCF5() {
  var captured = null;
  globalThis.ApiClient = {
    chat: function (messages) {
      captured = messages;
      return Promise.resolve(JSON.stringify({
        title: '走廊相遇',
        summary: '玩家声称自己是皇家骑士，但该身份尚未验证。',
        entities: { npcs: [NPC_NAME], places: [], items: [], factions: [] },
        unresolved: [], tags: []
      }));
    }
  };
  try {
    await LG.compress({
      cardId: 'card_cf', saveId: 's_cf',
      gameDate: { year: 2000, month: 11, day: 14, hour: 7, minute: 8 },
      startGameDate: { year: 2000, month: 11, day: 14, hour: 7, minute: 8 },
      msgFrom: 0,
      messages: [
        { role: 'user', content: '我是皇家骑士。' },
        { role: 'assistant', content: '「哦？」她抬了抬眼。' }
      ]
    });
  } catch (e) {
    console.log('（CF-5 compress 抛错，按提示词断言继续）: ' + (e && e.message));
  }
  var sys = (captured && captured[0] && captured[0].content) || '';
  check('CF-5a compress 真的发起了 AI 调用并带上 system 提示词', sys.length > 0);
  check('CF-5b 压缩提示词要求保留「声称」语气（防 Claim→Fact 洗白）',
    /声称|自称|未经(验证|确认)|未确认/.test(sys));
  check('CF-5c 压缩提示词明写不得写成客观事实',
    /(不要|不得|勿).{0,10}(写成|当作|视为).{0,10}事实/.test(sys) || /不(要|得).{0,20}客观事实/.test(sys));

  var src = read('vfs/logger.js');
  check('CF-5d 兜底摘要（LLM 失败）明确标注为原始对话摘录',
    /原始对话|未经整理|玩家的话/.test(src));
}

// ---------------- CF-6 工具协议与实现一致 ----------------
function runCF6() {
  // 注意：npc_knows 在 npc_runtime.js:1189 用 setTimeout(...,1000) 延迟注册，
  //   同步 boot 后 WHITELIST 里拿不到（这是 P13 已记录的冷启动时序问题）。
  //   这里改用源码断言，避免依赖计时器。
  var nrsrc = read('engine/npc_runtime.js');
  check('CF-6a npc_knows 注册点在 WHITELIST（源码断言，避开 1000ms 延迟注册）',
    /ToolExecutor\.WHITELIST\.npc_knows\s*=/.test(nrsrc));

  var src = read('engine/core/prompt_builder.js');
  var line = (src.split('\n').filter(function (l) { return l.indexOf('NPC 知识：npc_knows') >= 0; })[0] || '');
  check('CF-6b 工具协议声明 npc_knows 的 origin 参数', line.indexOf('origin') >= 0);
  check('CF-6c 工具协议声明 npc_knows 的 unverified 参数', line.indexOf('unverified') >= 0);
  check('CF-6d 工具协议 source 枚举含 legacy（与实现 8 项一致）', line.indexOf('legacy') >= 0);
}

// ---------------- CF-7 npc_knows 工具处理器接住 origin / unverified ----------------
// 反例（P14 实测）：工具协议在 prompt_builder.js:206 声明了 origin? / unverified?，
//   但 npc_runtime.js 的 handler 只转交 text/source/sourceNote ⇒ 玩家自称被记成「已确认事实」。
function runCF7() {
  var nrsrc = read('engine/npc_runtime.js');
  var hi = nrsrc.indexOf('ToolExecutor.WHITELIST.npc_knows');
  var body = hi >= 0 ? nrsrc.slice(hi, hi + 1200) : '';
  check('CF-7a handler 接住 origin', /var origin\s*=\s*\(typeof a\.origin/.test(body));
  check('CF-7b handler 接住 unverified', /var unverified\s*=/.test(body));
  check('CF-7c handler 把两字段转交给 addKnowledge', /origin:\s*origin/.test(body) && /unverified:\s*unverified/.test(body));

  var r1 = NR.addKnowledge(NPC_ID, { text: 'A7-来自玩家', source: 'told', origin: 'player', unverified: true });
  var item1 = r1 && r1.ok ? r1 : null;
  check('CF-7d 玩家来源的声称落库为 told + origin=player + unverified',
    !!item1 && item1.source === 'told' && item1.origin === 'player' && item1.unverified === true);

  var r2 = NR.addKnowledge(NPC_ID, { text: 'A7-转述', source: 'told', origin: 'npc:阿乙' });
  check('CF-7e 转述自其他 NPC 的声称也标未确认', !!r2 && r2.ok && r2.unverified === true);

  var r3 = NR.addKnowledge(NPC_ID, { text: 'A7-目击', source: 'witness' });
  check('CF-7f 目击（引擎确认）不标未确认——不能把什么都降级', !!r3 && r3.ok && r3.unverified === false);

  var tagged = NR._knowledgeTag({ text: 't', acquiredAt: 'D1', source: 'told', origin: 'npc:阿乙', unverified: true });
  check('CF-7g 转述口径标签含「转述自阿乙」', tagged.indexOf('转述自阿乙') >= 0);

  var tagged2 = NR._knowledgeTag({ text: 't', acquiredAt: 'D1', source: 'told', origin: 'player', unverified: true });
  check('CF-7h 玩家口径标签含「玩家自称」与「未确认」',
    tagged2.indexOf('玩家自称') >= 0 && tagged2.indexOf('未确认') >= 0);
}

// ---------------- CF-8 读档保守加固（旧档里被洗成 deduced 的 heard 类知识）----------------
// 背景：P11 之前 addKnowledge 对非法 source 静默降级为 deduced ⇒ 旧档里
//   「玩家告诉他的事」可能已经被洗成高可信度。_normalizeAllKnowledge(true) 只降不删。
function runCF8() {
  var path0 = '/saves/card_cf/s_cf/npc_runtime.json';
  var legacy = {
    sceneLocationId: '', focus: [NPC_ID], scene: [], follow: [],
    npcs: {},
    lastTickRound: -1
  };
  legacy.npcs[NPC_ID] = {
    knownFacts: [
      // 这笔是「被洗白的声称」：文本有听说的语气，却挂着 deduced
      { text: '玩家自称他是皇家骑士', acquiredAt: 'D9', source: 'deduced', sourceNote: '' },
      // 这笔是真正的推演结论，不该被动
      { text: '钟楼的齿轮在夜里会转', acquiredAt: 'D9', source: 'deduced', sourceNote: '' }
    ],
    recentEvents: [], keywords: [], mood: '', locationId: '', playerRelation: '', alive: true
  };
  VFS.writeJSON(path0, legacy);
  NR._data = null;
  NR.load();
  var rt = NR.get(NPC_ID) || {};
  var facts = rt.knownFacts || [];
  var claim = facts.filter(function (f) { return f && f.text && f.text.indexOf('皇家骑士') >= 0; })[0];
  var deduced = facts.filter(function (f) { return f && f.text && f.text.indexOf('齿轮') >= 0; })[0];
  check('CF-8a 读档后被洗白的声称被降级为 told（实测 source=' + (claim && claim.source) + '）',
    !!claim && claim.source === 'told');
  check('CF-8b 且被标记 unverified=true', !!claim && claim.unverified === true);
  check('CF-8c 且补上 origin=player', !!claim && claim.origin === 'player');
  check('CF-8d 真正的推演结论不受影响（仍 deduced / 未确认=false）',
    !!deduced && deduced.source === 'deduced' && deduced.unverified === false);
  check('CF-8e 旧条目一个都没丢（只降级不删除）', facts.length === 2);
}

// ---------------- 主流程 ----------------
(async function main() {
  boot();
  console.log('=== P14 Claim/Fact 隔离 smoke ===');
  runCF1();
  runCF2();
  runCF4();
  await runCF5();
  runCF6();
  runCF7();
  runCF8();
  console.log('---------------------------------');
  console.log('CLAIM_FACT_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})();

// ============================================================
// P11 · S11 NPC 行为边界 smoke（cwd 必须是 RN 仓根：node tools/npc_boundary_smoke.js）
//
// 覆盖：
//   ① 引擎级规则含「玩家主体归玩家」细则 与「NPC 可以不行动/拒绝/忽略/离场后继续」；
//   ② npc_knows 的 source 枚举校验（含 P11·S6 新增 rumor / misconception）；
//   ③ 「异性接近 ≠ 暧昧」：提示词全文不含「暧昧 / 恋爱」这类默认解释词（现存即绿，防回退）；
//   ④ 默认 cardStyle 已不含被搬走的规则段（P11·S1 防回退）。
//
// 纪律：只读 + 内存夹具；不改既有断言。
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
    setItem: function (k, v) { if (!Object.prototype.hasOwnProperty.call(map, k)) order.push(k); map[k] = String(v); },
    removeItem: function (k) { delete map[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); },
    key: function (i) { return i < order.length ? order[i] : null; }
  };
  Object.defineProperty(api, 'length', { get: function () { return order.length; } });
  return api;
}

var PB, STORE;

function boot() {
  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  STORE = globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  globalThis.getDiceConfig = STORE.getDiceConfig;

  globalThis.GameState = {
    currentCard: {
      name: 'NB',
      game: { title: '边界测试卡', background: '', eraRange: null },
      steps: [],
      statusCard: { enabled: false },
      worldbook: { npcs: [], mapNodes: {}, worldSetting: {}, weather: { mode: 'off' } }
    },
    currentCardId: 'card_nb', currentSaveId: 's_nb',
    playerData: { portrait: null, inventory: { bar: [], common: [], story: [], rare: [] } },
    chatHistory: [], _pendingSystemNotices: [],
    _gameTime: { year: 2000, month: 10, day: 20, hour: 8, minute: 0 },
    currentState: { hud: [], sidebar: [], panels: {} },
    formatGameTime: function () { return '2000-10-20 08:00'; },
    computeAge: function () { return null; },
    getSegmentText: function () { return ''; },
    invalidateCache: function () {}
  };
  globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
  globalThis.WebSearchManager = { isEnabled: function () { return false; } };
  PB = globalThis.PromptBuilder = require(path.join(root, 'engine', 'core', 'prompt_builder.js'));
}

// ================= ① 引擎级规则 =================
function runRules() {
  var rules = PB.GM_DEFAULTS.engineRules;
  var joined = rules.join('\n');

  var playerRule = rules.filter(function (r) { return r.indexOf('玩家主体归玩家') >= 0; })[0] || '';
  check('S11-a 引擎级 engineRules 含「玩家主体归玩家」细则', !!playerRule);
  check('S11-b 该细则列全 5 项（说了什么/想了什么/感受到什么/决定了什么/下一步一定会做什么）',
    ['说了什么', '想了什么', '感受到什么', '决定了什么', '下一步一定会做什么']
      .every(function (k) { return playerRule.indexOf(k) >= 0; }));
  check('S11-c 该细则写明「只有两种情况你代玩家落笔」（玩家输入明确要求 / 引擎已产生确定状态）',
    playerRule.indexOf('只有两种情况你代玩家落笔') >= 0 && playerRule.indexOf('玩家输入明确要求') >= 0 && playerRule.indexOf('引擎已产生确定状态') >= 0);
  check('S11-d 该细则对齐【用户指令识别】的 OOC 口径', playerRule.indexOf('OOC') >= 0);

  var npcRule = rules.filter(function (r) { return r.indexOf('NPC 可以拒绝') >= 0; })[0] || '';
  check('S11-e 引擎级 engineRules 含 NPC 自主细则', !!npcRule);
  check('S11-f 该细则列全「可以」侧（拒绝/误解/不信/忽略玩家/改变计划/与他人行动/产生玩家不知道的信息/在玩家离开后继续行动）',
    ['拒绝', '误解', '不信', '忽略玩家', '改变计划', '与他人行动', '产生玩家不知道的信息', '在玩家离开后继续行动']
      .every(function (k) { return npcRule.indexOf(k) >= 0; }));
  check('S11-g 该细则写明「可以行动 ≠ 必须行动」并允许不行动/等待/观察/犹豫',
    npcRule.indexOf('可以行动 ≠ 必须行动') >= 0 &&
    ['不行动', '等待', '观察', '犹豫'].every(function (k) { return npcRule.indexOf(k) >= 0; }));

  // 两条细则必须在引擎级，而不是用户可清的 cardStyle
  var cs = STORE.defaultGlobal().gm.cardStyle;
  check('S11-h 默认 cardStyle 不含这两条细则（在引擎级）',
    cs.indexOf('玩家主体归玩家') < 0 && cs.indexOf('NPC 可以拒绝') < 0);
  check('S11-i engineRules 整组非空（' + rules.length + ' 条）', rules.length >= 11);
}

// ================= ④ S1 防回退 =================
function runStyleMove() {
  var pr = PB.GM_DEFAULTS.promptRules;
  var cs = STORE.defaultGlobal().gm.cardStyle;

  check('S11-j promptRules 含【世界自行运转】（引擎级）', pr.join('\n').indexOf('【世界自行运转】') >= 0);
  check('S11-k promptRules 含【NPC 社交距离三档】（引擎级）', pr.join('\n').indexOf('【NPC 社交距离三档】') >= 0);
  check('S11-l 默认 cardStyle 不含【世界自行运转】（防回退）', cs.indexOf('【世界自行运转】') < 0);
  check('S11-m 默认 cardStyle 不含【NPC 社交距离三档】（防回退）', cs.indexOf('【NPC 社交距离三档】') < 0);

  // S1 去重：默认 cardStyle 不含 promptRules / engineRules 任一条（去空白后 ≥10 字）
  function nz(s) { return String(s).replace(/\s+/g, ''); }
  var csNz = nz(cs);
  var dupP = pr.filter(function (r) { return nz(r).length >= 10 && csNz.indexOf(nz(r)) >= 0; });
  var dupE = PB.GM_DEFAULTS.engineRules.filter(function (r) { return nz(r).length >= 10 && csNz.indexOf(nz(r)) >= 0; });
  check('S11-n 默认 cardStyle 与 promptRules 无重复（命中 ' + dupP.length + '）', dupP.length === 0);
  check('S11-o 默认 cardStyle 与 engineRules 无重复（命中 ' + dupE.length + '）', dupE.length === 0);
}

// ================= ② npc_knows source 枚举 =================
function runKnowledgeEnum() {
  var src = read('engine/npc_runtime.js');
  var m = src.match(/KNOWLEDGE_SOURCES\s*=\s*\[([^\]]*)\]/);
  check('S11-p npc_runtime.js 有 KNOWLEDGE_SOURCES 白名单', !!m);
  var body = m ? m[1] : '';
  check('S11-q KNOWLEDGE_SOURCES 含 rumor / misconception（P11·S6 新增）',
    body.indexOf("'rumor'") >= 0 && body.indexOf("'misconception'") >= 0);
  check('S11-r KNOWLEDGE_SOURCES 保留原有 witness/told/public/deduced/manual/legacy',
    ['witness', 'told', 'public', 'deduced', 'manual', 'legacy'].every(function (s) { return body.indexOf("'" + s + "'") >= 0; }));

  // 校验点：至少 4 处用 indexOf 白名单校验（存档归一化 / 合并默认值 / API 入参 / 工具入参）
  var hits = 0, i = 0;
  while (true) { var j = src.indexOf('KNOWLEDGE_SOURCES.indexOf(', i); if (j < 0) break; hits++; i = j + 1; }
  check('S11-s KNOWLEDGE_SOURCES.indexOf 校验点 ≥ 4 处（实测 ' + hits + '）', hits >= 4);
  check('S11-t npc_knows 工具用白名单校验 source（非法回落 deduced）',
    /ToolExecutor\.WHITELIST\.npc_knows/.test(src) && /KNOWLEDGE_SOURCES\.indexOf\(a\.source\)\s*>=\s*0\s*\?\s*a\.source\s*:\s*'deduced'/.test(src));

  // 提示词工具说明同步枚举
  var pb = read('engine/core/prompt_builder.js');
  check('S11-u 提示词 npc_knows 行同步含 rumor/misconception',
    /npc_knows\([^\n]*source:\s*witness\/told\/rumor\/public\/deduced\/misconception\/manual/.test(pb));
}

// ================= ③ 暧昧/恋爱 不出现在提示词 =================
function runNoRomanceDefault() {
  var staticText = '';
  try { staticText = PB.buildStatic(); } catch (e) { staticText = ''; }
  check('S11-v buildStatic 产出非空（' + staticText.length + ' 字符）', staticText.length > 0);
  check('S11-w 提示词全文不含「暧昧」', staticText.indexOf('暧昧') < 0);
  check('S11-x 提示词全文不含「恋爱」', staticText.indexOf('恋爱') < 0);

  var defs = PB.GM_DEFAULTS.engineRules.join('\n') + '\n' + PB.GM_DEFAULTS.promptRules.join('\n');
  check('S11-y GM_DEFAULTS 全文不含「暧昧/恋爱」', defs.indexOf('暧昧') < 0 && defs.indexOf('恋爱') < 0);
  var cs = STORE.defaultGlobal().gm.cardStyle;
  check('S11-z 默认 cardStyle 不含「暧昧/恋爱」', cs.indexOf('暧昧') < 0 && cs.indexOf('恋爱') < 0);
}

// ================= ⑤ S12 旧存档 → 打开时的降级/拦截路径 =================
// 说明：任务书 S12 原指桌面 tests\e2e\test_card_malformed_import.js（畸形卡带），
//   ④「旧存档（缺 portrait / 缺 playerData 子字段）→ 打开时的降级/拦截路径」在
//   RN 侧落在 rn/story_runtime.js 的 routeMissingStep / openSave（P6·S2 接真跳转）。
//   本块只读源码 + 内存假件，不触碰产品写盘。
var RT = null;
function runS12RN() {
  var src = read('rn/story_runtime.js');
  // 源码口径：两个缺失原因都必须真跳转，不许只弹文案
  check('S12-a routeMissingStep 处理 create-flow（切创角屏）', /reason === 'create-flow'[\s\S]{0,200}NavStore\.navigate\('create'\)/.test(src));
  check('S12-b routeMissingStep 处理 portrait（UI_Portrait.start 起回合）',
    /reason === 'portrait'[\s\S]{0,600}UI_Portrait[\s\S]{0,400}up\.start\(pd,/.test(src));
  check('S12-c openSave 缺 playerData → reason=create-flow 且 routed 接管',
    /!hasPlayerData[\s\S]{0,120}reason:\s*'create-flow',\s*routed:\s*routeMissingStep\('create-flow'\)/.test(src));
  check('S12-d openSave 缺 portrait → reason=portrait 且 routed 接管',
    /!hasPortrait[\s\S]{0,120}reason:\s*'portrait',\s*routed:\s*routeMissingStep\('portrait'\)/.test(src));
  check('S12-e playerData 子字段判定排除 inventory（缺子字段才算缺）',
    /Object\.keys\(pd\)\.filter\(function \(k\) \{ return k !== 'inventory'; \}\)/.test(src));
  check('S12-f CONTINUE_REASONS 给 create-flow / portrait 面向玩家的可执行文案',
    src.indexOf("'create-flow': '该存档尚未完成角色创建") >= 0 && src.indexOf("'portrait': '该存档缺少角色肖像") >= 0);

  // 行为口径：真调 openSave，验证三条旧档路径的返回
  var seq = [];
  globalThis.GameState = {
    playerData: {}, chatHistory: [], _pendingSystemNotices: [],
    loadFromSave: function () { return true; }
  };
  globalThis.Platform = { ui: {
    showScreen: function (s) { seq.push('screen:' + s); },
    renderGame: function () { seq.push('renderGame'); },
    showHome: function () {}
  } };
  var portraitStarted = false;
  globalThis.UI_Portrait = { start: function (pd, cb) { portraitStarted = true; } };
  globalThis.StoryLoop = { start: function () { seq.push('storyStart'); }, };

  return Promise.resolve()
    .then(function () {
      // 旧档 A：缺 playerData 子字段（只有 inventory）→ create-flow
      globalThis.GameState.playerData = { inventory: { bar: [] } };
      seq = []; portraitStarted = false;
      return RT.openSave('c', 's').then(function (r) {
        check('S12-g 旧档缺 playerData 子字段 → {ok:false, reason:create-flow, routed:true}',
          r && r.ok === false && r.reason === 'create-flow' && r.routed === true);
      });
    })
    .then(function () {
      // 旧档 B：有 playerData 子字段但缺 portrait → portrait，且 UI_Portrait.start 真被调
      globalThis.GameState.playerData = { name: '旧档角色' };
      seq = []; portraitStarted = false;
      return RT.openSave('c', 's').then(function (r) {
        check('S12-h 旧档缺 portrait → {ok:false, reason:portrait, routed:true}',
          r && r.ok === false && r.reason === 'portrait' && r.routed === true);
        check('S12-i 缺 portrait 时 UI_Portrait.start 真被调用（含 complete 回调）', portraitStarted === true);
      });
    })
    .then(function () {
      // 旧档 C：playerData 子字段 + portrait 齐 → 放行进叙事页（fresh）
      globalThis.GameState.playerData = { name: '旧档角色', portrait: { summary: '一名旅人' } };
      globalThis.GameState.chatHistory = [];
      seq = [];
      return RT.openSave('c', 's').then(function (r) {
        check('S12-j 旧档字段齐 → {ok:true, mode:fresh} 并进叙事页',
          r && r.ok === true && r.mode === 'fresh' && seq.indexOf('screen:screen-game') >= 0);
      });
    });
}

(function main() {
  boot();
  RT = require(path.join(root, 'rn', 'story_runtime.js'));
  runRules();
  runStyleMove();
  runKnowledgeEnum();
  runNoRomanceDefault();
  runS12RN().then(function () {
    console.log('');
    console.log('NPC_BOUNDARY_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
  });
})();

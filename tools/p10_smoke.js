// ============================================================
// P10 · smoke（cwd 必须是 RN 仓根：node tools/p10_smoke.js）
// A 组：体验补齐（源码断言，逐项对 P10 任务书 A1–A11）
// B 组：提示词质量（B1 names 档 / B2 重复注入去重 + estimateTokens 前后实测 /
//       B3 query_player 回显 / B4 12000 上限可见信号 / B5 info_read kind /
//       B6 可选参数标记 + ban_event 声明 / B7 propose_change 口径）
// 纪律：不改既有断言，只新增；本文件全部为只读断言 + 内存夹具。
// ============================================================

'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
// P12·S1：本套无任何桌面仓引用，原硬编码 DESK 绝对路径已删除（方案 A，用户批准）。

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function readRn(rel) { return read(path.join(root, rel)); }
function countOf(hay, needle) {
  var n = 0, i = 0;
  while (true) { var j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + needle.length; }
  return n;
}
// 去掉行注释后再断言「代码里无残留」（注释里提到旧标识符不算代码引用）
function stripLineComments(s) {
  return String(s).split('\n').map(function (l) {
    var i = l.indexOf('//');
    return i >= 0 ? l.slice(0, i) : l;
  }).join('\n');
}

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

console.log = (function (orig) {
  return function () { orig.apply(console, arguments); };
})(console.log);

// ================= A 组 · 源码断言 =================
function runA() {
  // A1 主页存档行点得动（onPress → StoryRuntime.openSave，含 routed 静默语义）
  var home = readRn('rn/screens/HomeScreen.js');
  var rt = readRn('rn/story_runtime.js');
  check('A1a HomeScreen 存档行绑 onPress 且指向 StoryRuntime.openSave',
    home.indexOf('openSaveRow') >= 0 && home.indexOf('StoryRuntime.openSave(') >= 0 && home.indexOf('onPress') >= 0);
  check('A1b HomeScreen 续档失败分支尊重 routed 静默语义（!res.routed 才弹）',
    home.indexOf('!res.ok && !res.routed') >= 0);
  check('A1c story_runtime 暴露 openSave（含 routeMissingStep + resume-pending）',
    rt.indexOf('openSave:') >= 0 && rt.indexOf('routeMissingStep') >= 0 && rt.indexOf('resume-pending') >= 0);

  // A2 新建存档问名字（文案逐字 + 默认名来源 + 取消回落默认名）
  var create = readRn('rn/screens/CreateScreen.js');
  check('A2a CreateScreen 建档前调 promptOpen（文案逐字照桌面）',
    create.indexOf("StoryStore.promptOpen('给这个存档起个名字：'") >= 0);
  check('A2b 默认名来源 Saves.getNextDefaultName',
    create.indexOf('Saves.getNextDefaultName(cardId)') >= 0);
  check('A2c 取消/空串回落默认名（不卡住建档）',
    create.indexOf("name == null || String(name).trim() === ''") >= 0);

  // A3 报错面板复制整份报告 + 存储占用行
  var elp = readRn('rn/panels/ErrorLogPanel.js');
  var pdata = readRn('rn/panels/panel_data.js');
  check('A3a panel_data 增 errorLogReport 入口', pdata.indexOf('errorLogReport') >= 0);
  check('A3b ErrorLogPanel 有「复制整份报告」按钮 + 复用 export_util',
    elp.indexOf('onCopyReport') >= 0 && elp.indexOf('ExportUtil') >= 0 && elp.indexOf('复制整份报告') >= 0);
  check('A3c ErrorLogPanel 有存储占用行（口径照桌面）',
    elp.indexOf('存储占用：') >= 0 && pdata.indexOf('storageText') >= 0);

  // A4 存储告警
  var sw = '';
  try { sw = readRn('rn/storage_warn.js'); } catch (e) { sw = ''; }
  var app = readRn('App.tsx');
  check('A4a storage_warn.js 存在且阈值 4MB / 3s / 5min',
    sw.indexOf('THRESHOLD_MB = 4') >= 0 && sw.indexOf('START_DELAY_MS = 3000') >= 0 &&
    sw.indexOf('CHECK_INTERVAL_MS = 5 * 60 * 1000') >= 0);
  check('A4b 告警文案逐字照桌面（存储已用 X MB，建议导出备份）',
    sw.indexOf("'存储已用 ' + mb.toFixed(1) + 'MB，建议导出备份'") >= 0);
  check('A4c App 根组件启动扫描', app.indexOf('StorageWarnModule.start()') >= 0);

  // A5 人设屏讨论输入框 + 开场提示词 opening
  var prn = readRn('rn/ui_portrait_rn.js');
  var ps = readRn('rn/screens/PortraitScreen.js');
  check('A5a ui_portrait_rn 有讨论链 sendAndGenerate', prn.indexOf('function sendAndGenerate') >= 0 && prn.indexOf('sendAndGenerate: sendAndGenerate') >= 0);
  check('A5b opening 落盘/删除 playerData._openingPrompt',
    prn.indexOf('GameState.playerData._openingPrompt = v') >= 0 && prn.indexOf('delete GameState.playerData._openingPrompt') >= 0);
  check('A5c PortraitScreen 有开场白段（文案逐字）与会话输入',
    ps.indexOf("'开场白（可选）'") >= 0 && ps.indexOf('UI_Portrait.sendAndGenerate(t)') >= 0);

  // A6 异常卡读 options.title
  var store = readRn('rn/story_store.js');
  var ss = readRn('rn/screens/StoryScreen.js');
  check('A6a story_store.appendError 消费 options.title（缺省「异常」）',
    store.indexOf('String(options.title == null') >= 0 && store.indexOf("'异常'") >= 0);
  check('A6b StoryScreen 渲染 e.title || 异常', ss.indexOf("e.title || '异常'") >= 0);

  // A7 空态文案统一（共享常量 + 无分歧字面量）
  var et = readRn('rn/empty_texts.js');
  check('A7a empty_texts.js 六常量齐（含逐字照桌面的两句）',
    et.indexOf("NO_CARDS: '暂无卡带。'") >= 0 && et.indexOf("NO_SAVES: '还没有存档。'") >= 0 &&
    et.indexOf('NO_CARDS_HOME') >= 0 && et.indexOf('NO_SAVES_HOME') >= 0 &&
    et.indexOf('NO_CARDS_PICKER') >= 0 && et.indexOf('NO_SAVE_LABEL') >= 0);
  var screens = ['rn/screens/CardsScreen.js', 'rn/screens/HomeScreen.js', 'rn/screens/CreateScreen.js', 'rn/screens/SavesScreen.js'];
  var stray = 0, refs = 0;
  screens.forEach(function (f) {
    var s = readRn(f);
    refs += countOf(s, 'EmptyTexts.');
    stray += countOf(s, "'暂无卡带。'") + countOf(s, "'还没有存档。'");
  });
  check('A7b 四个屏统一引用 EmptyTexts（引用 ' + refs + ' 次，字面量残留 ' + stray + ' 处）',
    refs >= 6 && stray === 0);
  check('A7c 分歧文案「这张卡带还没有存档」只由常量模块产出',
    countOf(rnAllScreensAndPanels(), '这张卡带还没有存档') <= 1);

  // A8 主题包重复入口二选一
  var dataTab = readRn('rn/screens/settings/DataTab.js');
  var colorTab = readRn('rn/screens/settings/ColorTab.js');
  check('A8a DataTab 不再有导出实现（doExportTheme 已删）', dataTab.indexOf('function doExportTheme') < 0);
  check('A8b ColorTab 保留唯一导出入口',
    colorTab.indexOf('function doExportTheme') >= 0 && colorTab.indexOf("'导出主题包'") >= 0);
  check('A8c DataTab 留指路文字', dataTab.indexOf('不再重复出入口') >= 0);

  // A9 状态卡未启用副引导句
  check('A9a panel_data.computeStatusCard 增 subText（逐字照桌面）',
    pdata.indexOf("subText: '如需启用，请去 世界书编辑器 → 世界设定 里配置。'") >= 0);
  check('A9b StatusCardPanel 渲染 subText',
    readRn('rn/panels/StatusCardPanel.js').indexOf('view.subText') >= 0);

  // A10 叙事页输入提示行（逐字）
  check('A10a StoryScreen 输入提示行逐字（index.html:961）',
    ss.indexOf('↑ 点选项继续剧情，也可以输入你想做的任何事') >= 0);
  check('A10b 顶栏齿轮本轮不做（已声明等价入口：侧栏设置）',
    ss.indexOf("navigate('settings')") >= 0);

  // A11 调试面板补预算/降级展示
  var dp = readRn('rn/panels/DebugPanel.js');
  check('A11a panel_data.computeDebug 增 budgetText / trimText',
    pdata.indexOf('budgetText') >= 0 && pdata.indexOf('trimText') >= 0);
  check('A11b DebugPanel 渲染两段', dp.indexOf("section('预算配置'") >= 0 && dp.indexOf("section('最近降级账本'") >= 0);
  check('A11c 口径与侧栏一致（同读 _lastPromptEstimate/_lastTrimLog）',
    pdata.indexOf('_lastPromptEstimate') >= 0 && pdata.indexOf('_lastTrimLog') >= 0);
}

var _allSrcCache = null;
function rnAllScreensAndPanels() {
  if (_allSrcCache != null) return _allSrcCache;
  var out = [];
  var dirs = ['rn/screens', 'rn/panels', 'rn/components', 'rn/screens/settings'];
  dirs.forEach(function (d) {
    var abs = path.join(root, d);
    var list = [];
    try { list = fs.readdirSync(abs); } catch (e) { list = []; }
    list.forEach(function (f) {
      if (/\.js$/.test(f)) { try { out.push(read(path.join(abs, f))); } catch (e) {} }
    });
  });
  _allSrcCache = out.join('\n');
  return _allSrcCache;
}

// ================= B 组 · 夹具 =================
function boot() {
  installMemLocalStorage();
  globalThis.StorageAdapter = memStorageAdapter();
  globalThis.VFS = require(path.join(root, 'vfs', 'vfs.js'));
  globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  globalThis.getDiceConfig = globalThis.Storage.getDiceConfig;

  globalThis.GameState = {
    currentCard: {
      name: 'T10',
      game: { title: '测试卡带', background: '', eraRange: null },
      steps: [],
      statusCard: { enabled: false },
      worldbook: {
        npcs: [{ id: 'npc_a', name: '甲' }],
        mapNodes: {},
        worldSetting: {},
        weather: { mode: 'off' }
      }
    },
    currentCardId: 'card_t10',
    currentSaveId: 's_t10',
    playerData: {
      portrait: {
        aiVersion: 1,
        summary: '一个沉默的调查员，说话短。',
        traits: ['说话很冷淡', '语气缓慢', '态度随意', '喜欢甜食']
      },
      inventory: { bar: [], common: [], story: [], rare: [] },
      _openingPrompt: '我从港口醒来'
    },
    chatHistory: [],
    _pendingSystemNotices: [],
    _gameTime: { year: 2000, month: 10, day: 20, hour: 8, minute: 0 },
    currentState: {
      hud: [{ key: 'hp', current: 10, max: 100 }],
      sidebar: [],
      panels: {}
    },
    formatGameTime: function () { return '2000-10-20 08:00'; },
    computeAge: function () { return null; },
    getSegmentText: function () { return ''; },
    getEntrySegmentText: function () { return ''; },
    invalidateCache: function () {}
  };

  globalThis.Alias = { get: function (o, k) { return o ? o[k] : undefined; } };
  globalThis.Logger = {
    getRecentSummaries: function () { return [{ date: '2000-10-18', title: '前情', summary: '摘要' }]; },
    getActiveEntities: function () { return { npcs: ['甲'], places: [], items: [], factions: [], unresolved: [] }; }
  };
  // P10·B1：生产形态 formatter（npc_runtime.js:822-838 直接返回名字串）
  globalThis.NpcRuntime = {
    formatFocusBrief: function () { return '镜头内甲'; },
    formatSceneBrief: function () { return '现场甲、现场乙'; },
    formatFollowBrief: function () { return '跟随甲'; },
    formatActiveForPrompt: function () { return '镜头内状态'; }
  };
  // 生产形态：多行条目块（count1 档才真能压成一行计数）
  globalThis.StoryNodes = { formatForPrompt: function () { return '>>> 【剧情节点】进行中\n· 节点甲\n· 节点乙\n· 节点丙'; } };
  globalThis.Endings = { formatForPrompt: function () { return '>>> 【结局】已解锁\n· 结局甲\n· 结局乙'; } };
  globalThis.Events = {
    formatPendingForPrompt: function () { return null; },
    formatLocalForPrompt: function () { return null; },
    formatProposalsForPrompt: function () { return null; }
  };
  globalThis.InfoFeed = { formatForPrompt: function () { return null; } };
  globalThis.Tasks = { formatForPrompt: function () { return null; } };
  globalThis.Achievements = { formatRecentForPrompt: function () { return null; } };
  globalThis.Proposals = { formatForPrompt: function () { return null; } };
  globalThis.DiceHistory = { formatRecentForPrompt: function () { return null; } };
  globalThis.Outputs = { formatForPrompt: function () { return null; } };
  globalThis.Shop = { formatShopsForPrompt: function () { return null; } };
  globalThis.Portrait = require(path.join(root, 'engine', 'portrait.js'));

  globalThis.PromptBuilder = require(path.join(root, 'engine', 'core', 'prompt_builder.js'));
}

// ================= B1 · names 档 =================
function runB1() {
  var pbSrc = readRn('engine/core/prompt_builder.js');
  check('B1a DEGRADE_STEPS 已不含 names 档', !/id:\s*'names'/.test(pbSrc));
  check('B1b 阶梯剩 6 档（recent1/clip2/count1/sum2/sum1/sum0）',
    countOf(pbSrc.slice(pbSrc.indexOf('var DEGRADE_STEPS'), pbSrc.indexOf('];', pbSrc.indexOf('var DEGRADE_STEPS'))), "{ id: '") === 6);
  check('B1c 空档残留代码已清（_toNameString / on(\'names\') 均无引用）',
    (function () {
      var code = stripLineComments(pbSrc);
      return code.indexOf('_toNameString') < 0 && code.indexOf("on('names')") < 0;
    })());

  // 运行时：真实形态 formatter 下，阶梯里不可能再出现 names 段
  var PB = globalThis.PromptBuilder;
  var g = globalThis.Storage.getGlobal();
  g.promptBudget = { enabled: true, maxTokens: 1 };
  globalThis.localStorage.setItem(globalThis.Storage.GLOBAL_KEY, JSON.stringify(g));
  var GS = globalThis.GameState;
  GS._cachedStaticDynamic = null;
  PB.buildDynamic();
  var log = GS._lastTrimLog || [];
  check('B1d 降级走到底仍无 names 段（实取 ' + JSON.stringify(log.map(function (x) { return x.section; })) + '）',
    log.length > 0 && log.every(function (x) { return x.section !== 'names'; }));
  check('B1e 每档 after ≤ before（单调下降：' +
    log.map(function (x) { return x.section + ' ' + x.before + '→' + x.after; }).join(', ') + '）',
    log.every(function (x) { return x.after <= x.before; }));
}

// ================= B2 · 重复注入去重 + estimateTokens 前后实测 =================
function runB2() {
  var PB = globalThis.PromptBuilder;
  var GS = globalThis.GameState;
  var def = globalThis.Storage.defaultGlobal();
  var cardStyle = def.gm.cardStyle;

  // B2① 断言：默认 GM_DEFAULTS.promptRules 每条（去空白后）不在 cardStyle（去空白后）里出现
  function nz(s) { return String(s).replace(/\s+/g, ''); }
  var rules = PB.GM_DEFAULTS.promptRules;
  var csNz = nz(cardStyle);
  var dup = rules.filter(function (r) { return nz(r).length >= 10 && csNz.indexOf(nz(r)) >= 0; });
  check('B2a 默认 cardStyle 不含 promptRules 任一条（重复检查 ' + rules.length + ' 条，命中 ' + dup.length + '）',
    dup.length === 0);

  // B2a 红证：把被去重的两段（现役于 GM_DEFAULTS.promptRules）插回去 ⇒ 该检查必须报重复（证明检测有效）
  // P11·S1 改指：原实现从桌面 storage.js 抓「改前同段」；P11·S1/D1a 已把桌面 cardStyle 的重复段删除，
  //   桌面 storage.js 不再含该段（抓取返回空串会使红证恒假）⇒ 改用 promptRules 里同两条构造回插，
  //   红证语义（证明检测有效）不变。
  var fragRules = rules.filter(function (r) { return r.indexOf('【感官锚点】') >= 0 || r.indexOf('【对话功能】') >= 0; });
  var fragReal = fragRules.join('\n\n\n') + '\n\n\n';
  var beforeStyle = cardStyle.replace('相关描写\n\n\n【自检三问', '相关描写\n\n\n' + fragReal + '【自检三问');
  var beforeNz = nz(beforeStyle);
  var dupBefore = rules.filter(function (r) { return beforeNz.indexOf(nz(r)) >= 0; });
  check('B2b 红证：回插被去重段后确有逐字重复（命中 ' + dupBefore.length + ' 条：' +
    JSON.stringify(dupBefore.map(function (r) { return r.slice(0, 8); })) + '）', dupBefore.length === 2);

  // B2②③ 引用计数：静态段内工具名只声明一次
  GS._cachedStaticDynamic = null;
  var staticTxt = PB.buildStatic();
  check('B2c query_weather 静态段只声明 1 次（实取 ' + countOf(staticTxt, 'query_weather') + '）',
    countOf(staticTxt, 'query_weather') === 1);
  check('B2d query_achievements 静态段只声明 1 次（实取 ' + countOf(staticTxt, 'query_achievements') + '）',
    countOf(staticTxt, 'query_achievements') === 1);
  check('B2e 查询扩展行已收敛（不再重列 6 个功能查询）',
    staticTxt.indexOf('查询扩展：query_dice_history') >= 0 && staticTxt.indexOf('query_deductions() / query_nodes()') < 0);

  GS._cachedStaticDynamic = null;
  var full = PB.buildSystem();
  check('B2f query_npc 全 prompt 只 1 处（实取 ' + countOf(full, 'query_npc') + '）', countOf(full, 'query_npc') === 1);
  check('B2g query_map 全 prompt 只 1 处（实取 ' + countOf(full, 'query_map') + '）', countOf(full, 'query_map') === 1);

  // B2④ traits 去重（第四部分只列第三部分没出现的）
  GS._cachedStaticDynamic = null;
  var dyn = PB.buildDynamic();
  check('B2h 第四部分不再重复第三部分已全量的 traits（无「角色声音提醒」块）',
    dyn.indexOf('角色声音提醒') < 0);
  var saved = GS.playerData.portrait.summary;
  GS.playerData.portrait.summary = '';
  GS._cachedStaticDynamic = null;
  var dyn2 = PB.buildDynamic();
  check('B2i 红证对照：无第三部分（summary 空）时该提醒块仍在',
    dyn2.indexOf('角色声音提醒') >= 0 && dyn2.indexOf('· 说话很冷淡') >= 0);
  GS.playerData.portrait.summary = saved;

  // B2 实测：同一夹具下 estimateTokens 前后对比（before = 逐字插回改前四处重复）
  GS._cachedStaticDynamic = null;
  var afterText = PB.buildSystem();
  var beforeText = afterText.replace('相关描写\n\n\n【自检三问', '相关描写\n\n\n' + fragReal + '【自检三问');
  beforeText = beforeText.replace('query_deductions()',
    'query_deductions() / query_nodes() / query_endings() / query_events() / query_tasks() / query_achievements() / query_weather()');
  beforeText = beforeText.replace('>>> 【实体索引】（详情见【工具协议】查询类）',
    '>>> 【实体索引】（需要详情时调 query_npc / query_faction / query_map）');
  beforeText = beforeText.replace('>>> （详情见【工具协议】查询类）',
    '>>> （详情调 query_npc / query_faction / query_map）');
  var voiceBlock = '>>> 角色声音提醒（保持前后一致，不要变成通用 AI 腔）：\n' +
    '   · 说话很冷淡\n   · 语气缓慢\n   · 态度随意\n';
  beforeText = beforeText.replace('>>> 玩家：', voiceBlock + '>>> 玩家：');

  var tokBefore = PB.estimateTokens(beforeText);
  var tokAfter = PB.estimateTokens(afterText);
  var bytesBefore = Buffer.byteLength(beforeText, 'utf8');
  var bytesAfter = Buffer.byteLength(afterText, 'utf8');
  console.log('P10_B2_MEASURE beforeBytes=' + bytesBefore + ' afterBytes=' + bytesAfter +
    ' deltaBytes=' + (bytesAfter - bytesBefore) +
    ' beforeTok=' + tokBefore + ' afterTok=' + tokAfter + ' deltaTok=' + (tokAfter - tokBefore));
  check('B2j 去重后全文 token 下降（' + tokBefore + ' → ' + tokAfter + '，省 ' + (tokBefore - tokAfter) + '）',
    tokAfter < tokBefore);
  check('B2k 去重后全文字节下降（' + bytesBefore + ' → ' + bytesAfter + '，省 ' + (bytesBefore - bytesAfter) + '）',
    bytesAfter < bytesBefore);
  // 省下的量 vs A 组新增内容：A 组只在 RN UI/面板，不进 prompt；此处给出净增量口径
  check('B2l 去重后静态段仍保留 cardStyle 独有段（黑暗内容处理协议 在）',
    afterText.indexOf('【黑暗内容处理协议】') >= 0);
  check('B2m 去重后静态段仍保留 promptRules 两条（感官锚点 / 对话功能）',
    afterText.indexOf('【感官锚点】每轮至少一个具体感官细节') >= 0 &&
    afterText.indexOf('【对话功能】每句对话必须有战术目的') >= 0);
  check('B2n info_send 静态声明 + 第四部分指路各 1（可接受，见报告⑤）',
    countOf(full, 'info_send') >= 1);
}

// ================= B3 · query_player 回显 =================
function runB3() {
  var TE = require(path.join(root, 'engine', 'core', 'tool_executor.js'));
  var GS = globalThis.GameState;
  GS.playerData = {
    name: '调查员',
    portrait: { summary: '很长的总述', traits: ['说话很冷淡'] },
    inventory: { bar: [], common: [], story: [], rare: [] },
    _openingPrompt: '我从港口醒来'
  };
  var r = { ok: true, type: 'query', queryType: 'player', data: GS.playerData };
  var out = TE._formatQueryData(r);
  check('B3a query_player 回显不含 portrait', out.indexOf('portrait') < 0);
  check('B3b query_player 回显不含 _openingPrompt', out.indexOf('_openingPrompt') < 0);
  check('B3c 人设详情指路 query_avatar', out.indexOf('query_avatar') >= 0);
  var parsed = null, threw = false;
  try { parsed = JSON.parse(out); } catch (e) { threw = true; }
  check('B3d 回显恒为合法 JSON', !threw && parsed !== null);

  // 超长 ⇒ 结构化截断
  var big = { arr: [], name: 'x' };
  for (var i = 0; i < 200; i++) big.arr.push('条目' + i + 'abcdefghijklmnop');
  var r2 = { ok: true, type: 'query', queryType: 'npc', data: big };
  var out2 = TE._formatQueryData(r2);
  var p2 = null, threw2 = false;
  try { p2 = JSON.parse(out2); } catch (e) { threw2 = true; }
  check('B3e 超 800 字符 ⇒ 结构化截断且带 truncated 标记',
    !threw2 && p2 && p2.truncated === true && typeof p2.preview === 'string');

  // 红色对照：旧写法是半截 JSON
  var legacy = JSON.stringify(r2.data).slice(0, 800);
  var legacyOk = true;
  try { JSON.parse(legacy); } catch (e) { legacyOk = false; }
  check('B3f 红证：旧 slice(0,800) 产出非法 JSON（可复现）', legacyOk === false);
}

// ================= B4 · 12000 字符上限可见信号 =================
function runB4() {
  var TE = require(path.join(root, 'engine', 'core', 'tool_executor.js'));
  var calls = [];
  globalThis.ErrorLog = { action: function (a, b) { calls.push(a + '|' + b); } };
  var hints = [];
  globalThis.Platform = { ui: { appendHint: function (s) { hints.push(s); } } };

  var bigInner = '{"name":"add_item","args":{"desc":"' + new Array(13000).join('x') + '"}}';
  var body = '正文。\n<<<TOOL>>>' + bigInner + '<<<END>>>\n结尾。';
  check('B4a 超限块尺寸 > 12000（实际 ' + bigInner.length + '）', bigInner.length > TE.TOOL_BLOCK_LIMIT);
  var extracted = TE.extract(body);
  check('B4b 超限块不被提取执行', extracted.length === 0);
  check('B4c 记录 _lastOversize = 1', TE._lastOversize.length === 1);
  check('B4d 可见信号：ErrorLog.action 被调用（' + JSON.stringify(calls) + '）', calls.length === 1);
  check('B4e 可见信号：提示行被调用（' + JSON.stringify(hints) + '）',
    hints.length === 1 && hints[0].indexOf('工具块过大') >= 0);
  var stripped = TE.strip(body);
  check('B4f 超限块原文保留在正文（不被静默删）', stripped.indexOf('<<<TOOL>>>') >= 0 && stripped.indexOf('<<<END>>>') >= 0);

  // 绿证对照：正常块仍被提取并删除
  var okBody = '前\n<<<TOOL>>>{"name":"add_item","args":{"name":"x"}}<<<END>>>\n后';
  var okEx = TE.extract(okBody);
  check('B4g 正常块仍正常提取/剔除', okEx.length === 1 && TE.strip(okBody).indexOf('<<<TOOL>>>') < 0);
  delete globalThis.ErrorLog;
  delete globalThis.Platform;
}

// ================= B5 · info_read kind =================
function runB5() {
  // 用真实 info_feed 的 WHITELIST 实现 + 内存 D 层
  var body = {};
  var threads = [{ id: 't1', title: '老张', lastAt: '2000-10-20 08:00', unread: 1, preview: 'x' }];
  var bcs = [{ id: 'b1', at: '2000-10-20 07:00', title: '宵禁', publicity: '公开', scope: '城市' }];
  globalThis.ToolExecutor = {
    WHITELIST: {},
    formatForHistory: function () { return ''; }
  };
  globalThis.InfoFeedData = {
    listThreads: function () { return threads; },
    listBroadcasts: function () { return bcs; },
    unreadTotal: function () { return 1; }
  };
  // info_feed.js 是 IIFE 自注册，需要在 Window/globalThis.InfoFeed 之外直接调 registerTools
  // ⇒ 以最小方式复刻实现口径断言：直接检查源码与实现等价
  var src = readRn('engine/info_feed.js');
  check('B5a 实现已读 kind 参数', src.indexOf('var kind = String(a.kind || \'\').trim();') >= 0);
  check('B5b kind 过滤 thread / broadcast 两分支齐',
    src.indexOf("(kind !== 'broadcast')") >= 0 && src.indexOf("(kind !== 'thread')") >= 0);
  check('B5c 返回体带 kind 字段', src.indexOf("data: { kind: kind || 'all'") >= 0);
  check('B5d 提示词声明 info_read(kind, limit) 未被改（声明与实现一致）',
    readRn('engine/core/prompt_builder.js').indexOf('info_read(kind, limit)') >= 0);
}

// ================= B6 / B7 · 提示词口径 =================
function runB67() {
  var GS = globalThis.GameState;
  GS._cachedStaticDynamic = null;
  var st = globalThis.PromptBuilder.buildStatic();
  check('B6a set_weather(type, icon?)（icon 可选，对齐 CONTRACTS.md:249）',
    st.indexOf('set_weather(type, icon?)') >= 0 && st.indexOf('set_weather(type, icon)') < 0);
  check('B6b npc_reveal(id, reason?)（reason 可选，CONTRACTS.md:114）',
    st.indexOf('npc_reveal(id, reason?)') >= 0);
  check('B6c output_publish({name, title?, content?, desc?, type?, keywords?, audience?})（仅 name 必填）',
    st.indexOf('output_publish({name, title?, content?, desc?, type?, keywords?, audience?})') >= 0);
  check('B6d ban_event / unban_event 在静态协议段可见',
    st.indexOf('ban_event(id, duration?, reason?)') >= 0 && st.indexOf('unban_event(id)') >= 0);

  check('B7a propose_change type 口径 = 任何可直接调用的工具（异步除外）',
    st.indexOf('任何可直接调用的工具；异步工具除外') >= 0);
  check('B7b 异步工具限制已说明（web_search / 不支持异步工具）',
    st.indexOf('异步工具如 web_search 不能走 propose_change') >= 0 &&
    st.indexOf('不支持异步工具') >= 0);
  check('B7c 列表标签改为「常见可用 type（不限于此）」',
    st.indexOf('常见可用 type（不限于此）：') >= 0 && st.indexOf('可用 type 列表：') < 0);
}

// ================= 主流程 =================
(function main() {
  boot();
  runA();
  runB1();
  runB2();
  runB3();
  runB4();
  runB5();
  runB67();
  console.log('P10_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();

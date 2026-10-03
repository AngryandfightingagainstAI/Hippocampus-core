// ============================================================
// RN 设置页 smoke · 战役 4 · 批次 4-5a + 4-5b
// 用法：node tools/settings_smoke.js（cwd = RN 仓根）
//
// A. settings_model 纯逻辑（内存 localStorage + 真 storage.js）：
//    tab 清单 / dice 15 键默认与翻转 / general 读侧缺省语义与
//    saveGeneralState 一次写全 / gm 读写 / updateGlobal /
//    getModelsForBaseUrl（4-5b：命中预设 / 未命中去重合并 / 尾斜杠）
// B. 数据层真实模块 API 存在性（weather/realtime/theme/api_manager
//    直接 require——四模块双态导出，Node 可载）
// C. 占位/实装 tab 与 RN 仓文件存在性交叉验证（web_search/editor
//    确实不在；prompt_builder 等确实在——防未来搬运后忘记更新占位）
// E. ApiManager 生命周期（4-5b）：getAll 归一化 → add → update →
//    duplicate → setActive → remove → 末位阻断
// D. 含 JSX 的 B 类文件经仓内 babel transform 语法验证（同 story_smoke E 组）
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

// ---------- 内存 localStorage（Node 无此全局；storage.js 顶层迁移
// IIFE 在 VFS 未定义时直接 return，不会触达）----------
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; },
  clear: function () { mem = {}; }
};

var Model = require(path.join(root, 'rn', 'settings_model.js'));

// ============ A 组：settings_model ============
function runA() {
  // 预热：空库时 storage.js getGlobal 在 L109 提前 return defaults（不写
  // dice 迁移标记）；先落库一次默认值，使后续读走完整合并路径。
  Model.updateGlobal(function (g) {});

  // A1 tab 清单
  eq('A1 tab 数 = 10', Model.SETTINGS_TABS.length, 10);
  var ids = Model.SETTINGS_TABS.map(function (t) { return t.id; });
  check('A2 tab id 序列', JSON.stringify(ids) === JSON.stringify([
    'api', 'search', 'general', 'dice', 'weather', 'realtime', 'editor', 'worldbook', 'data', 'gm'
  ]));
  // P10·C1：死导出 PLACEHOLDER_TABS 已删（产品零引用）。改指理由：原断言读该导出
  //   的「占位 0 项」，删除后改成正向断言「导出不存在 + SETTINGS_TABS 恰 10 项全实装」
  //   （与 A2 的 tab id 序列同义；P2+P3 合并轮 data/search/editor/worldbook 均已实装）。
  check('A3 死导出 PLACEHOLDER_TABS 已删，SETTINGS_TABS 恰 10 项全实装',
    Model.PLACEHOLDER_TABS === undefined && Model.SETTINGS_TABS.length === 10);

  // A4-A6 dice 默认与翻转
  var dk = Object.keys(Model.DICE_DEFAULTS);
  eq('A4 dice 默认 15 键', dk.length, 15);
  eq('A5 dice 默认 enabled=true / combatOpposed=false / aiHidden=false',
    Model.DICE_DEFAULTS.enabled === true && Model.DICE_DEFAULTS.combatOpposed === false && Model.DICE_DEFAULTS.aiHidden === false, true);
  var cfg0 = Model.getDiceConfig();
  eq('A6 空库读 dice = 全默认', JSON.stringify(cfg0), JSON.stringify(Model.DICE_DEFAULTS));
  var flipped = Object.assign({}, Model.DICE_DEFAULTS, { enabled: false, sc: true, luckSpend: true, aiHidden: true });
  Model.saveDiceConfig(flipped);
  eq('A7 dice 写后回读', JSON.stringify(Model.getDiceConfig()), JSON.stringify(flipped));

  // A8 general 读侧缺省语义（endings 缺省启用 / nodes/outputs 缺省关闭）
  Model.updateGlobal(function (g) {
    delete g.settings.endings;
    delete g.settings.storyNodes;
    delete g.settings.outputs;
  });
  var gs0 = Model.loadGeneralState();
  check('A8 endings 缺省=true / nodes=false / outputs=false',
    gs0.endingsEnabled === true && gs0.nodesEnabled === false && gs0.outputsEnabled === false);
  check('A9 thinking 缺省全 true / logging 10+3 / strictness=normal',
    gs0.thinking.showReasoning === true && gs0.thinking.showSearch === true && gs0.thinking.showUsage === true &&
    gs0.logging.windowRounds === 10 && gs0.logging.summaryInject === 3 && gs0.strictness === 'normal');
  check('A10 proposalCheck 缺省（关/空/3）',
    gs0.proposalCheck.enabled === false && gs0.proposalCheck.profileId === null && gs0.proposalCheck.triggerAfterRounds === 3);

  // A11 saveGeneralState 一次写全 → 回读一致
  var gs1 = Model.loadGeneralState();
  gs1.logging.enabled = false; gs1.logging.windowRounds = 22; gs1.logging.summaryInject = 5;
  gs1.thinking.showReasoning = false; gs1.thinking.showUsage = false;
  gs1.endingsEnabled = false; gs1.nodesEnabled = true; gs1.outputsEnabled = true;
  gs1.strictness = 'hard';
  gs1.proposalCheck = { enabled: true, profileId: 'p_x', triggerAfterRounds: 7 };
  gs1.npcDeduction = { enabled: true, profileId: null, autoTrigger: true };
  Model.saveGeneralState(gs1);
  var gs2 = Model.loadGeneralState();
  check('A11 saveGeneralState 回读一致',
    gs2.logging.enabled === false && gs2.logging.windowRounds === 22 && gs2.logging.summaryInject === 5 &&
    gs2.thinking.showReasoning === false && gs2.thinking.showUsage === false &&
    gs2.endingsEnabled === false && gs2.nodesEnabled === true && gs2.outputsEnabled === true &&
    gs2.strictness === 'hard' &&
    gs2.proposalCheck.enabled === true && gs2.proposalCheck.profileId === 'p_x' && gs2.proposalCheck.triggerAfterRounds === 7 &&
    gs2.npcDeduction.enabled === true && gs2.npcDeduction.profileId === null && gs2.npcDeduction.autoTrigger === true);

  // A12-A13 gm 读写（defaultGlobal cardStyle 默认长文）
  var gm0 = Model.loadGmState();
  check('A12 gm 读侧默认', gm0.density === 'normal' && gm0.cardStyle.indexOf('黑暗内容处理协议') >= 0 && gm0.bannedWords.indexOf('仿佛') >= 0);
  Model.saveGmState({ cardStyle: '风格X', bannedWords: '词1\n词2', density: 'rich' });
  var gm1 = Model.loadGmState();
  check('A13 gm 写后回读', gm1.cardStyle === '风格X' && gm1.bannedWords === '词1\n词2' && gm1.density === 'rich');

  // A14-A16 getModelsForBaseUrl（4-5b，_getModelsForBaseUrl 同构下沉）
  var dsModels = Model.getModelsForBaseUrl('https://api.deepseek.com/v1/'); // 尾斜杠应被去掉后命中
  check('A14 命中预设（尾斜杠归一）', dsModels.length === 4 && dsModels.indexOf('deepseek-chat') >= 0 && dsModels.indexOf('deepseek-reasoner') >= 0);
  var merged = Model.getModelsForBaseUrl('https://my-own.example/v1');
  var allModels = [];
  require(path.join(root, 'engine', 'api_manager.js')).PRESETS.forEach(function (p) {
    (p.models || []).forEach(function (m) { if (allModels.indexOf(m) < 0) allModels.push(m); });
  });
  check('A15 未命中全去重合并', merged.length === allModels.length && merged.length === new Set(merged).size);
  check('A16 空串不命中任何预设（返回去重合并）', Model.getModelsForBaseUrl('').length === allModels.length);
}

// ============ B 组：数据层真实模块 ============
function runB() {
  // weather/realtime/theme/api_manager 裸调全局 Storage（浏览器挂载
  // 形态）；Node 下注入同模块实例（settings_model 已 require，缓存同对象）
  globalThis.Storage = require(path.join(root, 'engine', 'core', 'storage.js'));
  // realtime.js 模块体顶层裸调 Platform.lifecycle.onForeground（L166，
  // RN 运行时由 bootstrap 挂载）；Node smoke 注入最小假件。
  // dialog.alert：E 组 remove 末位阻断路径会调用（api_manager L163）
  if (typeof globalThis.Platform === 'undefined') {
    globalThis.Platform = {
      lifecycle: { onForeground: function () {}, onBackground: function () {}, onPageHide: function () {} },
      dialog: { alert: function () {} }
    };
  }
  if (!globalThis.Platform.dialog) globalThis.Platform.dialog = { alert: function () {} };

  var Weather = require(path.join(root, 'engine', 'weather.js'));
  ['getConfig', 'setConfig', 'getCurrent', 'refreshNow', 'refreshIpCache'].forEach(function (m) {
    check('B weather.' + m, typeof Weather[m] === 'function');
  });
  var w = Weather.getConfig();
  check('B weather.getConfig 默认（mode=off）', w && w.mode === 'off');

  var Realtime = require(path.join(root, 'engine', 'realtime.js'));
  ['isEnabled', 'getGlobalConfig', 'setGlobalConfig', 'formatNow', 'getLastSeenAt', 'formatGap'].forEach(function (m) {
    check('B realtime.' + m, typeof Realtime[m] === 'function');
  });

  var Theme = require(path.join(root, 'engine', 'theme.js'));
  // 2026-09-28 审计修正：H2 把桌面 13 套主题整文件同步进来（原 9 套 + high-contrast/solarized/dark/sepia），
  // 本断言是移植前的旧期望值，H2-R 只修了 theme_tokens_smoke，漏了本套 ⇒ 补正为 13。
  eq('B theme.listBuiltins = 13', Theme.listBuiltins().length, 13);
  eq('B theme.FONT_SCALES = 3 档', Theme.FONT_SCALES.length, 3);
  ['setFontScale', 'setFont', 'getFontId'].forEach(function (m) {
    check('B theme.' + m, typeof Theme[m] === 'function');
  });
  check('B theme.FONT_OPTIONS.sans/serif 非空',
    Array.isArray(Theme.FONT_OPTIONS.sans) && Theme.FONT_OPTIONS.sans.length > 0 &&
    Array.isArray(Theme.FONT_OPTIONS.serif) && Theme.FONT_OPTIONS.serif.length > 0);
  var fr = Theme.setFontScale(1.15);
  check('B theme.setFontScale 返回 ok 且落库',
    fr && fr.ok === true && fr.fontScale === 1.15 &&
    JSON.parse(globalThis.localStorage.getItem('ai_tg_global')).settings.theme.fontScale === 1.15);

  // 4-6c：背景 API（use_theme.setBackground/clearBackground 的 Theme 层依托）
  ['setBackground', 'clearBackground'].forEach(function (m) {
    check('B theme.' + m, typeof Theme[m] === 'function');
  });
  var br = Theme.setBackground({ image: 'data:image/jpeg;base64,AAAA', opacity: 0.6, hack: 'x' });
  var gBg = JSON.parse(globalThis.localStorage.getItem('ai_tg_global')).settings.theme.backgroundOverrides;
  check('B theme.setBackground 白名单落库（image/opacity 存，非法键滤）',
    br && br.ok === true && gBg.image === 'data:image/jpeg;base64,AAAA' &&
    gBg.opacity === 0.6 && !('hack' in gBg));
  var cr = Theme.clearBackground();
  var gBg2 = JSON.parse(globalThis.localStorage.getItem('ai_tg_global')).settings.theme.backgroundOverrides;
  check('B theme.clearBackground 清空', cr && cr.ok === true &&
    gBg2 && Object.keys(gBg2).length === 0);

  var ApiManager = require(path.join(root, 'engine', 'api_manager.js'));
  ['getAll', 'getActive', 'setActive', 'update', 'add', 'remove', 'duplicate'].forEach(function (m) {
    check('B apiManager.' + m, typeof ApiManager[m] === 'function');
  });
  check('B apiManager.PRESETS 非空', Array.isArray(ApiManager.PRESETS) && ApiManager.PRESETS.length > 0);

  // GM_DEFAULTS（prompt_builder 双态导出）
  var pb = require(path.join(root, 'engine', 'core', 'prompt_builder.js'));
  var rules = (pb.GM_DEFAULTS && pb.GM_DEFAULTS.engineRules) || [];
  check('B GM_DEFAULTS.engineRules 非空（GmTab 只读块数据源）', rules.length >= 9);
}

// ============ C 组：占位/实装与 RN 仓文件交叉验证 ============
function runC() {
  check('C web_search.js 已入 RN（02 实装）', fs.existsSync(path.join(root, 'engine', 'web_search.js')));
  // P2·S2：桌面 editor.js 整文件不搬（内含 WB_WorldBook 容器），只搬 NumEditor 段
  // ⇒ RN 侧文件名是 engine/num_editor.js；editor.js 仍不应存在。
  check('C editor.js 未入 RN（只搬 NumEditor 段为 num_editor.js）', !fs.existsSync(path.join(root, 'engine', 'editor.js')));
  check('C num_editor.js 已入 RN（07 实装）', fs.existsSync(path.join(root, 'engine', 'num_editor.js')));
  check('C templates/number.js + templates/relation.js 已入 RN（逐字节同源）',
    fs.existsSync(path.join(root, 'templates', 'number.js')) &&
    fs.existsSync(path.join(root, 'templates', 'relation.js')));
  ['weather.js', 'realtime.js', 'api_manager.js', 'theme.js',
   'core/storage.js', 'core/prompt_builder.js'].forEach(function (rel) {
    check('C 实装数据层在仓：engine/' + rel, fs.existsSync(path.join(root, 'engine', rel)));
  });
  ['rn/settings_model.js',
   'rn/components/settings/controls.js',
   'rn/screens/settings/DiceTab.js',
   'rn/screens/settings/GeneralTab.js',
   'rn/screens/settings/GmTab.js',
   'rn/screens/settings/WeatherTab.js',
   'rn/screens/settings/RealtimeTab.js',
   'rn/screens/settings/ApiTab.js',
   'rn/screens/settings/SearchTab.js',
   'rn/screens/settings/NumEditorTab.js',
   'rn/screens/settings/DataTab.js',
   'rn/screens/settings/ColorTab.js',
   // P2+P3 合并轮：世界书容器 + 12 个子编辑器（真落地证据：文件在仓）
   'rn/screens/settings/WorldBookTab.js',
   'rn/screens/settings/worldbook/worldSettingEditor.js',
   'rn/screens/settings/worldbook/mapEditor.js',
   'rn/screens/settings/worldbook/timelineEditor.js',
   'rn/screens/settings/worldbook/npcEditor.js',
   'rn/screens/settings/worldbook/factionEditor.js',
   'rn/screens/settings/worldbook/itemEditor.js',
   'rn/screens/settings/worldbook/skillEditor.js',
   'rn/screens/settings/worldbook/shopEditor.js',
   'rn/screens/settings/worldbook/currencyEditor.js',
   'rn/screens/settings/worldbook/raceEditor.js',
   'rn/screens/settings/worldbook/occupationEditor.js',
   'rn/screens/settings/worldbook/outputsEditor.js',
   'rn/screens/SettingsScreen.js'].forEach(function (rel) {
    check('C 页面文件在仓：' + rel, fs.existsSync(path.join(root, rel)));
  });

  // P6·S4-4 死代码清除（两条替代原 PlaceholderTab.js 的「文件在仓 / transform」
  // 断言，总数不变，理由：事实变了——该页与 controls.SetPlaceholder 互为死代码，
  // 已删除；原两条断言的对象不存在了，不能留假绿）。
  check('C 死代码已删：rn/screens/settings/PlaceholderTab.js 不存在',
    !fs.existsSync(path.join(root, 'rn', 'screens', 'settings', 'PlaceholderTab.js')));
  var ctlSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'settings', 'controls.js'), 'utf8');
  check('C 死导出已删：controls.js 无 SetPlaceholder 定义/导出',
    ctlSrc.indexOf('function SetPlaceholder') < 0 &&
    ctlSrc.indexOf('SetPlaceholder:') < 0);
}

// ============ E 组：ApiManager 生命周期（4-5b，ApiTab 数据链）============
function runE() {
  var ApiManager = require(path.join(root, 'engine', 'api_manager.js'));

  // 首次归一化：g.api 此前为 null，getAll 建默认配置并落库
  var a0 = ApiManager.getAll();
  check('E1 getAll 归一化（profiles>=1 且 activeId 有效）',
    Array.isArray(a0.profiles) && a0.profiles.length >= 1 &&
    a0.profiles.some(function (p) { return p.id === a0.activeId; }));

  var n0 = a0.profiles.length;
  var added = ApiManager.add({ name: 'E组配置', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' });
  check('E2 add 返回新 profile 且数量 +1',
    added && added.id && ApiManager.getAll().profiles.length === n0 + 1 &&
    ApiManager.getById(added.id).name === 'E组配置');

  ApiManager.update(added.id, { temperature: 0.3, max_tokens: 4096 });
  var afterUpd = ApiManager.getById(added.id);
  check('E3 update 落库', afterUpd.temperature === 0.3 && afterUpd.max_tokens === 4096);

  var dup = ApiManager.duplicate(added.id);
  check('E4 duplicate 新 id + 副本名 + 数量 +1',
    dup && dup.id !== added.id && dup.name === 'E组配置 副本' &&
    ApiManager.getAll().profiles.length === n0 + 2);

  ApiManager.setActive(dup.id);
  eq('E5 setActive 后 getActive 切换', ApiManager.getActive().id, dup.id);

  ApiManager.remove(dup.id);
  check('E6 remove 删除 + activeId 回落 profiles[0]',
    ApiManager.getById(dup.id) === null && ApiManager.getAll().profiles.length === n0 + 1 &&
    ApiManager.getActive().id === a0.activeId);

  // 收敛到只剩 1 个，验证末位阻断（api_manager L163 Platform.dialog.alert）
  var rest = ApiManager.getAll().profiles.filter(function (p) { return p.id !== added.id; });
  rest.forEach(function (p) { ApiManager.remove(p.id); });
  var n1 = ApiManager.getAll().profiles.length;
  ApiManager.remove(ApiManager.getActive().id);
  eq('E7 末位阻断（仅剩 1 个时 remove 无效）', ApiManager.getAll().profiles.length, n1);
}

// ============ D 组：babel transform（同 story_smoke E 组范式）============
function runD() {
  var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
  ['rn/components/settings/controls.js',
   'rn/screens/settings/DiceTab.js',
   'rn/screens/settings/GeneralTab.js',
   'rn/screens/settings/GmTab.js',
   'rn/screens/settings/WeatherTab.js',
   'rn/screens/settings/RealtimeTab.js',
   'rn/screens/settings/ApiTab.js',
   'rn/screens/settings/SearchTab.js',
   'rn/screens/settings/NumEditorTab.js',
   'rn/screens/settings/DataTab.js',
   'rn/screens/settings/ColorTab.js',
   // P2+P3 合并轮：世界书容器 + 12 个子编辑器（真落地证据：能被 babel 编译）
   'rn/screens/settings/WorldBookTab.js',
   'rn/screens/settings/worldbook/worldSettingEditor.js',
   'rn/screens/settings/worldbook/mapEditor.js',
   'rn/screens/settings/worldbook/timelineEditor.js',
   'rn/screens/settings/worldbook/npcEditor.js',
   'rn/screens/settings/worldbook/factionEditor.js',
   'rn/screens/settings/worldbook/itemEditor.js',
   'rn/screens/settings/worldbook/skillEditor.js',
   'rn/screens/settings/worldbook/shopEditor.js',
   'rn/screens/settings/worldbook/currencyEditor.js',
   'rn/screens/settings/worldbook/raceEditor.js',
   'rn/screens/settings/worldbook/occupationEditor.js',
   'rn/screens/settings/worldbook/outputsEditor.js',
   'rn/screens/SettingsScreen.js',
   'rn/use_theme.js'].forEach(function (rel) {
    try {
      babel.transformFileSync(path.join(root, rel), {
        cwd: root,
        configFile: path.join(root, 'babel.config.js')
      });
      ok++; console.log('PASS: D babel transform ' + rel);
    } catch (e) {
      fail++; console.log('FAIL: D babel transform ' + rel + ' :: ' + e.message);
    }
  });
}

// ============ F 组：P1-B 外观色盘 / 槽位 / 主题包（真 Theme 模块 + 源码断言）============
function runF() {
  var Theme = require(path.join(root, 'engine', 'theme.js'));
  var ColorTabPath = path.join(root, 'rn', 'screens', 'settings', 'ColorTab.js');
  var ColorSrc = fs.readFileSync(ColorTabPath, 'utf8');

  // F1-F2 色键表与分组（桌面 ui_theme.js 取色器数据源）
  var varKeys = Object.keys(Theme.COLOR_VAR_MAP);
  eq('F1 COLOR_VAR_MAP = 43 键', varKeys.length, 43);
  var groupKeyCount = 0;
  var allGroupKeys = [];
  Theme.COLOR_GROUPS.forEach(function (g) {
    groupKeyCount += g.keys.length;
    allGroupKeys = allGroupKeys.concat(g.keys);
  });
  check('F2 COLOR_GROUPS = 7 组 且组键累计 43（无重无漏）',
    Theme.COLOR_GROUPS.length === 7 && groupKeyCount === 43 &&
    allGroupKeys.filter(function (k, i) { return allGroupKeys.indexOf(k) === i; }).length === 43);

  // F3 未知键拒绝（ui_theme/theme.js:723 逐字）
  var bad = Theme.setColorOverride('__no_such_key__', '#000000');
  check('F3 setColorOverride 未知键拒绝（reason 逐字）',
    bad && bad.ok === false && bad.reason === '未知色键：__no_such_key__');

  // F4 已知键落库（settings.theme.overrides[key]）
  var good = Theme.setColorOverride('bgCard', '#123456');
  var g4 = JSON.parse(globalThis.localStorage.getItem('ai_tg_global'));
  check('F4 setColorOverride 已知键落库',
    good && good.ok === true &&
    g4.settings.theme.overrides && g4.settings.theme.overrides.bgCard === '#123456');

  // F5 重置清空 overrides（ui_theme.js:191 reset 语义）
  var clr = Theme.clearOverrides();
  var g5 = JSON.parse(globalThis.localStorage.getItem('ai_tg_global'));
  check('F5 clearOverrides 清空',
    clr && clr.ok === true &&
    g5.settings.theme.overrides && Object.keys(g5.settings.theme.overrides).length === 0);

  // F6 槽位 round trip（SLOT_COUNT=7，桌面 ui_theme.js:200-246 同语义）
  eq('F6a SLOT_COUNT = 7', Theme.SLOT_COUNT, 7);
  var sr = Theme.saveSlot(2, 'F组主题');
  var sl = Theme.listSlots();
  check('F6b saveSlot 落库 + listSlots 7 项对齐',
    sr && sr.ok === true && sl.length === 7 && sl[2] && sl[2].hasData === true && sl[2].name === 'F组主题' &&
    sl[0] && sl[0].hasData === false);
  var rr = Theme.renameSlot(2, 'F组改名');
  check('F6c renameSlot 生效', rr && rr.ok === true && Theme.listSlots()[2].name === 'F组改名');
  var lr = Theme.loadSlot(2);
  check('F6d loadSlot 切到 custom 且名字正确', lr && lr.ok === true && lr.name === 'F组改名' &&
    JSON.parse(globalThis.localStorage.getItem('ai_tg_global')).settings.theme.activeId === 'custom');
  var dr = Theme.deleteSlot(2);
  check('F6e deleteSlot 后该项 hasData=false',
    dr && dr.ok === true && Theme.listSlots()[2].hasData === false);

  // F7 主题包导出/导入 round trip（ui_theme.js:48-91）
  var exported = Theme.exportTheme();
  var parsed = null;
  try { parsed = JSON.parse(exported); } catch (e) {}
  check('F7a exportTheme 产出可 JSON.parse 且含 schemaVersion',
    parsed && typeof parsed === 'object' && parsed.schemaVersion != null && parsed.colors);
  var imported = Theme.importTheme(exported);
  check('F7b importTheme 回灌 ok 且切 custom',
    imported && imported.ok === true &&
    JSON.parse(globalThis.localStorage.getItem('ai_tg_global')).settings.theme.activeId === 'custom');

  // F8 源码断言：改色后必须显式触发重渲染（bumpThemeRev），
  //    否则 use_theme.js 的 rev 只在 setTheme/setFontScale 路径 bump，
  //    直写 override 不会自动重算 tokens（P1-B 关键验收点）。
  check('F8a ColorTab 调用 bumpThemeRev（应用/重置路径）',
    ColorSrc.indexOf('bumpThemeRev()') >= 0 && ColorSrc.indexOf('setColorOverride') >= 0);
  check('F8b ColorTab toast 文案逐字（ui_theme.js:180/:191）',
    ColorSrc.indexOf('已应用自定义色值') >= 0 && ColorSrc.indexOf('已重置为预设主题') >= 0);
  check('F8c ColorTab 自绘取色器（零 iro 库 / 零渐变库）',
    ColorSrc.indexOf('iro.min') < 0 && ColorSrc.indexOf('vendor/iro') < 0 &&
    ColorSrc.indexOf('new iro.') < 0 && ColorSrc.indexOf('LinearGradient') < 0 &&
    ColorSrc.indexOf('hsvToHex') >= 0 && ColorSrc.indexOf('onResponderMove') >= 0);
  check('F8d ColorTab 覆盖 7 槽位操作 API',
    ColorSrc.indexOf('saveSlot') >= 0 && ColorSrc.indexOf('loadSlot') >= 0 &&
    ColorSrc.indexOf('deleteSlot') >= 0 && ColorSrc.indexOf('renameSlot') >= 0);

  // F9 复位：把槽位/主题状态还原成纸白，免污染后续组
  Theme.setBuiltin('paper-white');
  Theme.clearOverrides();
}

// ============ G 组：S1 输出上限存量迁移（幂等 / 不误伤 / 只写一次）============
function runG() {
  var ApiManager = require(path.join(root, 'engine', 'api_manager.js'));

  // 直接铺一份 apiProfiles 到 ai_tg_global（绕开 Storage 合并语义干扰），
  // 并清掉迁移标记，模拟「老落盘配置首次被加载」。
  function seed(profiles) {
    delete mem['max_tokens_migrated_v2'];
    var raw = mem['ai_tg_global'];
    var g = raw ? JSON.parse(raw) : {};
    g.api = { profiles: profiles, activeId: profiles[0].id };
    mem['ai_tg_global'] = JSON.stringify(g);
  }
  function mtOf(id) { return ApiManager.getById(id).max_tokens; }

  // G1 历史默认值 2048（非思考模型）⇒ 抬到 16384（S1 新增迁移，独立于思考规则）
  seed([{ id: 'g_a', name: '默认配置', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', max_tokens: 2048 }]);
  ApiManager.getAll();
  eq('G1 存量默认值 2048 ⇒ 16384', mtOf('g_a'), 16384);

  // G2 版本标记落盘
  eq('G2 迁移标记 max_tokens_migrated_v2=1', globalThis.localStorage.getItem('max_tokens_migrated_v2'), '1');

  // G3 幂等：再调一次 getAll，值不回退、标记仍在
  ApiManager.getAll();
  check('G3 幂等（再跑一次仍 16384 且标记在）', mtOf('g_a') === 16384 &&
    globalThis.localStorage.getItem('max_tokens_migrated_v2') === '1');

  // G4 不误伤：用户显式设过的 4096（非思考模型）不动
  seed([{ id: 'g_b', name: '我的配置', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', max_tokens: 4096 }]);
  ApiManager.getAll();
  eq('G4 用户显式 4096 不被覆盖', mtOf('g_b'), 4096);

  // G5 思考模型 4096 ⇒ 16384（既有 :102-103 口径回归守卫）
  seed([{ id: 'g_c', name: '思考', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner', max_tokens: 4096 }]);
  ApiManager.getAll();
  eq('G5 思考模型 4096 ⇒ 16384（既有口径）', mtOf('g_c'), 16384);

  // G6 标记已存在 ⇒ 不再迁移（证明「迁移只写一次」）
  seed([{ id: 'g_d', name: '默认配置', baseUrl: '', model: 'deepseek-flash', max_tokens: 2048 }]);
  globalThis.localStorage.setItem('max_tokens_migrated_v2', '1');
  ApiManager.getAll();
  eq('G6 标记已存在 ⇒ 2048 不再抬升（只写一次）', mtOf('g_d'), 2048);

  // G7 源码断言：迁移版本标记键 + 判定条件存在
  var src = fs.readFileSync(path.join(root, 'engine', 'api_manager.js'), 'utf8');
  check('G7 源码含一次性迁移（max_tokens_migrated_v2 + ===2048 判定）',
    src.indexOf('max_tokens_migrated_v2') >= 0 && src.indexOf('p.max_tokens === 2048') >= 0);

  // 复位：清标记免污染后续
  delete mem['max_tokens_migrated_v2'];
}

// P13·S5-b（RN）：设置页切 tab 脏守卫的守卫点 —— 「进入 worldbook、或从 worldbook 离开到别处」都要过闸。
// 这里只做源码级定位（守卫点必须逐字存在），行为面红证由「临时移除守卫 → 断言变红 → 还原」构造。
function runH() {
  var s = fs.readFileSync(path.join(root, 'rn', 'screens', 'SettingsScreen.js'), 'utf8');
  check('H1 P13·S2 切 tab 守卫点：WB 引入 + 双向条件 + checkAny + 竞态护栏',
    s.indexOf("var WB = require('../../engine/wb_common.js');") >= 0 &&
    s.indexOf("var needGuard = (id === 'worldbook' || curTab === 'worldbook');") >= 0 &&
    s.indexOf('Promise.resolve(WB.DirtyGuard.checkAny()).then(function (okGo) {') >= 0 &&
    s.indexOf('if (pendingGuard.current) return;') >= 0);
  // 反向：两处 onPress 必须走 switchTab（不得残留裸 setCurTab 直切）
  check('H2 P13·S2 全部 tab onPress 走 switchTab（无裸 setCurTab 直切残留）',
    s.indexOf('onPress: function () { switchTab(t.id); }') >= 0 &&
    s.indexOf('onPress: function () { setCurTab(') < 0);
}

try {
  runA();
  runB();
  runC();
  runE();
  runF();
  runG();
  runH();
  runD();
  console.log('SETTINGS_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
} catch (e) {
  console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
}

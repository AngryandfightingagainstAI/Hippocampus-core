// ============================================================
// 批次 H6 · 面板 smoke（纯 Node 断言）
// 范围：
//   A. 结构：7 新文件存在 + 导出名 + PanelHost 引用 + SidebarDrawer 7 入口 + nav_store portrait
//   B. babel transform 7 个新组件
//   C. 三态空态：delete globalThis.Tasks 等后 compute 不抛 + 空态文案逐字断言
//   D. 无 hex 色值
//   E. 引擎 API 存在性
//   F. UI_Portrait 已定义
// 纪律：纯 Node，零 RN 运行时；不引新依赖。
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0;
var fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// ============================================================
// A. 源码结构断言
// ============================================================
var H6_FILES = [
  'rn/panels/TasksPanel.js',
  'rn/panels/AchievementsPanel.js',
  'rn/panels/EndingsPanel.js',
  'rn/panels/StoryNodesPanel.js',
  'rn/panels/EventProposalsPanel.js',
  'rn/panels/ChangeProposalsPanel.js',
  'rn/panels/NpcPanel.js',
  'rn/ui_portrait_rn.js',
  'rn/screens/PortraitScreen.js'
];

H6_FILES.forEach(function (rel, i) {
  check('A' + (i + 1) + ' 文件存在 ' + rel,
    fs.existsSync(path.join(root, rel)));
});

// panel_data 导出 14 个 compute
var pd = require(path.join(root, 'rn', 'panels', 'panel_data.js'));
var COMPUTES = ['computeTasks', 'computeAchievements', 'computeEndings',
  'computeStoryNodes', 'computeEventProposals', 'computeChangeProposals', 'computeNpc'];
COMPUTES.forEach(function (name, i) {
  check('A' + (10 + i) + ' panel_data 导出 ' + name, typeof pd[name] === 'function');
});

// PanelHost 引用 7 新面板
var phSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'PanelHost.js'), 'utf8');
check('A17 PanelHost require TasksPanel', phSrc.indexOf("require('../panels/TasksPanel.js')") >= 0);
check('A18 PanelHost require AchievementsPanel', phSrc.indexOf("require('../panels/AchievementsPanel.js')") >= 0);
check('A19 PanelHost require EndingsPanel', phSrc.indexOf("require('../panels/EndingsPanel.js')") >= 0);
check('A20 PanelHost require StoryNodesPanel', phSrc.indexOf("require('../panels/StoryNodesPanel.js')") >= 0);
check('A21 PanelHost require EventProposalsPanel', phSrc.indexOf("require('../panels/EventProposalsPanel.js')") >= 0);
check('A22 PanelHost require ChangeProposalsPanel', phSrc.indexOf("require('../panels/ChangeProposalsPanel.js')") >= 0);
check('A23 PanelHost require NpcPanel', phSrc.indexOf("require('../panels/NpcPanel.js')") >= 0);

// PanelHost TITLE_MAP 含 7 新标题
check('A24 TITLE_MAP tasks', phSrc.indexOf("tasks: '任务'") >= 0);
check('A25 TITLE_MAP achievements', phSrc.indexOf("achievements: '成就'") >= 0);
check('A26 TITLE_MAP endings', phSrc.indexOf("endings: '结局'") >= 0);
check('A27 TITLE_MAP storyNodes', phSrc.indexOf("storyNodes: '剧情节点'") >= 0);
check('A28 TITLE_MAP eventProposals', phSrc.indexOf("eventProposals: '事件提议'") >= 0);
check('A29 TITLE_MAP changeProposals', phSrc.indexOf("changeProposals: '变更提议'") >= 0);
check('A30 TITLE_MAP npc', phSrc.indexOf("npc: '人物'") >= 0);

// SidebarDrawer 7 新入口
var sdSrc = fs.readFileSync(path.join(root, 'rn', 'components', 'SidebarDrawer.js'), 'utf8');
check('A31 SidebarDrawer npc 入口', sdSrc.indexOf("panelRow('npc'") >= 0);
check('A32 SidebarDrawer tasks 入口', sdSrc.indexOf("panelRow('tasks'") >= 0);
check('A33 SidebarDrawer achievements 入口', sdSrc.indexOf("panelRow('achievements'") >= 0);
check('A34 SidebarDrawer eventProposals 入口', sdSrc.indexOf("panelRow('eventProposals'") >= 0);
check('A35 SidebarDrawer changeProposals 入口', sdSrc.indexOf("panelRow('changeProposals'") >= 0);
check('A36 SidebarDrawer endings 条件渲染', sdSrc.indexOf("endingsEnabled ? panelRow('endings'") >= 0);
check('A37 SidebarDrawer storyNodes 条件渲染', sdSrc.indexOf("storyNodesEnabled ? panelRow('storyNodes'") >= 0);

// SidebarDrawer 注释已收窄
// 2026-09-30 P1-I（I-3）：调试面板已实现并加入侧栏面板区，故「未实现」清单
// 由「调试/设置」收窄为「设置」——断言随之更新（理由：事实变了，非放宽）。
// 2026-10-01 P6·S3-1：设置入口已实装（panelRow('settings') → nav.navigate('settings')），
// 过期注释「未实现：设置」已删——断言随之改为验证真入口（理由同上：事实变了，非放宽）。
check('A38 SidebarDrawer 设置已实装（真入口 + 过期注释已删）',
  sdSrc.indexOf("NavStore.navigate('settings')") >= 0 &&
  sdSrc.indexOf("'设置'") >= 0 &&
  sdSrc.indexOf('未实现：设置') < 0);

// nav_store portrait
var nsSrc = fs.readFileSync(path.join(root, 'rn', 'nav_store.js'), 'utf8');
check('A39 nav_store SCREENS 含 portrait', nsSrc.indexOf("'portrait'") >= 0);

// rn_bootstrap UI_Portrait
var bsSrc = fs.readFileSync(path.join(root, 'rn', 'rn_bootstrap.js'), 'utf8');
check('A40 rn_bootstrap 装载 UI_Portrait', bsSrc.indexOf("load('UI_Portrait'") >= 0);

// App.tsx portrait 路由
var appSrc = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
check('A41 App.tsx require PortraitScreen', appSrc.indexOf('PortraitScreen') >= 0);
check('A42 App.tsx portrait 路由分支', appSrc.indexOf("currentScreen === 'portrait'") >= 0);

// CharacterPanel 重审人设按钮
var cpSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'CharacterPanel.js'), 'utf8');
check('A43 CharacterPanel 含重审人设按钮', cpSrc.indexOf('重审人设') >= 0);
check('A44 CharacterPanel showScreen portrait', cpSrc.indexOf("showScreen('portrait')") >= 0);

// LogPanel 搜索功能
var lpSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'LogPanel.js'), 'utf8');
check('A45 LogPanel 含 TextInput 搜索框', lpSrc.indexOf('TextInput') >= 0);
check('A46 LogPanel 含搜索按钮', lpSrc.indexOf("'搜索'") >= 0);
check('A47 LogPanel 含清空按钮', lpSrc.indexOf("'清空'") >= 0);
// P6·S3-7：日志删除（桌面 ui_panels.js:644-651 deleteLog）+ 骰子清空历史
// （桌面 ui_panels.js:177-182 clearDiceHistory）——本轮新增的落地断言。
check('A48 LogPanel 含日志删除（doDeleteLog 真入口）',
  lpSrc.indexOf('function doDeleteLog') >= 0 &&
  lpSrc.indexOf("confirmAsync('确定删除？')") >= 0);
var dhSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'DiceHistoryPanel.js'), 'utf8');
check('A49 DiceHistoryPanel 含清空历史（doClear 真入口）',
  dhSrc.indexOf('function doClear') >= 0 &&
  dhSrc.indexOf("confirmAsync('清空所有骰子历史？')") >= 0 &&
  dhSrc.indexOf("'清空历史'") >= 0);

// ============================================================
// A2. P9 结构性断言补强（本轮血泪教训：源码「文本包含」断言看不到
//     「导出写错 / 组件只渲染 children 却传了 text」这类静默死链）
// ============================================================
// ① PanelHost.js require 的每个面板模块，require 结果必须是函数或含组件函数。
//    RN 组件在纯 Node 下无法直接 require（会拉 react-native 的 Flow 源码），
//    故照 worldbook_smoke.js:743-779 的 Module._load 钩子把 react / react-native /
//    use_theme / story_store 换成最小桩，把「模块出口形状」真 require 一遍。
// ② 全仓 Controls.SetNote 调用都带非空 child 或 text（SetNote 渲染 props.children，
//    传 { text } 会静默不显示——即 P9·S2 那类失败）。
(function structuralGuards() {
  var Module = require('module');
  var origLoad = Module._load;
  var BabelCore = require(path.join(root, 'node_modules', '@babel', 'core'));
  var ReactStub = {
    createElement: function () { return { __el: true }; },
    useState: function (i) { return [typeof i === 'function' ? i() : i, function () {}]; },
    useEffect: function () {}, useLayoutEffect: function () {},
    useRef: function (v) { return { current: v }; },
    useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
    Fragment: 'Fragment'
  };
  var RNStub = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
    TouchableWithoutFeedback: 'TouchableWithoutFeedback', Pressable: 'Pressable',
    TextInput: 'TextInput', Switch: 'Switch', Image: 'Image', Modal: 'Modal',
    ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: function (o) { return o; }, absoluteFill: {}, flatten: function (o) { return o; } }
  };
  var TOKENS = { colors: {}, fontSizes: {}, radius: {}, spacing: {}, fonts: {} };
  Module._load = function (request, parent) {
    if (request === 'react') return ReactStub;
    if (request === 'react/jsx-runtime' || request === 'react/jsx-dev-runtime') {
      var jsxStub = function () { return { __el: true }; };
      return { jsx: jsxStub, jsxs: jsxStub, jsxDEV: jsxStub, Fragment: 'Fragment' };
    }
    if (request === 'react-native') return RNStub;
    if (/use_theme\.js$/.test(request)) return { useTheme: function () { return { tokens: TOKENS }; } };
    if (/story_store\.js$/.test(request)) {
      return {
        pushToast: function () {}, subscribe: function () {}, getSnapshot: function () { return {}; },
        openPanel: function () {}, closePanel: function () {}
      };
    }
    // 仓内 rn/ 下的 .js（B 类组件）可能含 JSX：先 babel 再 eval。面板的传递依赖
    //   （如 NpcPanel → NpcUpdateModal.js）也走这里，否则会 "Unexpected token '<'"。
    try {
      var from = (parent && parent.filename) ? parent.filename : path.join(root, 'rn', 'components', 'PanelHost.js');
      var resolved = Module.createRequire(from).resolve(request);
      if (/\.js$/.test(resolved) && resolved.indexOf(path.join(root, 'rn') + path.sep) === 0) {
        return requireJsx(resolved);
      }
    } catch (e) { /* 解析失败 → 走原加载 */ }
    return origLoad.apply(this, arguments);
  };
  // RN 组件用 JSX，Node 直接 require 会 "Unexpected token '<'"；先用仓内 babel
  //   配置 transform 成 CJS（自动 runtime → require('react/jsx-runtime')，已在
  //   _load 里打桩），再在模块作用域（createRequire 绑定该文件路径）里 eval，
  //   拿到真实 module.exports。
  function requireJsx(abs) {
    var code = BabelCore.transformFileSync(abs, {
      cwd: root, configFile: path.join(root, 'babel.config.js')
    }).code;
    var mod = { exports: {} };
    var fn = new Function('module', 'exports', 'require', '__filename', '__dirname', code);
    fn(mod, mod.exports, Module.createRequire(abs), abs, path.dirname(abs));
    return mod.exports;
  }

  var missing = [], notComp = [], reqs = [];
  try {
    var reqRe = /require\('(\.{1,2}\/[^']*Panel\.js)'\)/g;
    var m;
    while ((m = reqRe.exec(phSrc)) !== null) reqs.push(m[1]);
    reqs.forEach(function (rel) {
      var abs = path.resolve(path.join(root, 'rn', 'components'), rel);
      var mod = null;
      try { mod = requireJsx(abs); }
      catch (e) { missing.push(rel + '(' + (e && e.message) + ')'); return; }
      var isFn = typeof mod === 'function';
      var hasFn = !!mod && typeof mod === 'object' &&
        Object.keys(mod).some(function (k) { return typeof mod[k] === 'function'; });
      if (!isFn && !hasFn) notComp.push(rel);
    });
  } finally {
    Module._load = origLoad;
  }
  check('A50 PanelHost 的 ' + reqs.length + ' 个面板模块 require 结果为函数或含组件函数（缺：' + missing.join(' | ') + ' 非组件：' + notComp.join(',') + '）',
    reqs.length >= 15 && missing.length === 0 && notComp.length === 0);

  // ② 全仓 Controls.SetNote 调用都带非空 child 或 text
  var noteFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (n) {
      var p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.js$/.test(n)) noteFiles.push(p);
    });
  })(path.join(root, 'rn'));
  var bad = [], total = 0;
  noteFiles.forEach(function (p) {
    var rel = path.relative(root, p).replace(/\\/g, '/');
    if (rel === 'rn/components/settings/controls.js') return; // SetNote 定义处
    var txt = fs.readFileSync(p, 'utf8').replace(/\s+/g, ' ');
    var re = /SetNote\s*,\s*(\{[^{}]*\}|null)\s*(?:,\s*([^,)]+))?/g;
    var mm;
    while ((mm = re.exec(txt)) !== null) {
      total++;
      var props = mm[1] || '';
      var child = (mm[2] || '').trim();
      var hasChild = child.length > 0 && child.charAt(0) !== ')';
      var hasText = /text:\s*['"][^'"]+['"]/.test(props);
      if (!hasChild && !hasText) bad.push(rel + ' @' + mm.index);
    }
  });
  check('A51 全仓 Controls.SetNote 调用都带非空 child 或 text（异常：' + bad.join(', ') + '）', bad.length === 0);
  check('A52 SetNote 调用点统计未失真（>=40，实计 ' + total + '）', total >= 40);
})();

// ============================================================
// B. babel transform 7 新组件
// ============================================================
var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
H6_FILES.forEach(function (rel, i) {
  try {
    // P6·S4-2：显式锚定仓根 babel.config.js —— babel 的配置查找随
    // process.cwd() 漂移，本 smoke 必须在任意 cwd 下结果一致（对照
    // home_smoke.js:290-304 的正确写法）。断言与期望值均不变。
    babel.transformFileSync(path.join(root, rel), {
      cwd: root,
      configFile: path.join(root, 'babel.config.js')
    });
    check('B' + (i + 1) + ' babel transform ' + rel, true);
  } catch (e) {
    check('B' + (i + 1) + ' babel transform ' + rel, false);
    console.log('  ERROR: ' + e.message);
  }
});

// ============================================================
// C. 三态空态：delete globalThis 后 compute 不抛 + 空态文案
// ============================================================
// 假 GameState
function mockGameState() {
  globalThis.GameState = {
    currentCardId: 'test_card',
    currentSaveId: 'test_save',
    currentCard: { worldbook: { npcs: {}, tasks: [], achievements: [], endings: [], storyNodes: [] } },
    currentState: { panels: {} },
    playerData: { name: 'test' },
    computeAge: function () { return 20; }
  };
}

// C1: 全部模块未装载
['Tasks', 'Achievements', 'Endings', 'StoryNodes', 'Events', 'Proposals', 'NpcRuntime', 'NpcDeduction'].forEach(function (mod) {
  delete globalThis[mod];
});
mockGameState();

try {
  var r1 = pd.computeTasks();
  check('C1 computeTasks 未装载不抛', !r1.error);
  check('C2 computeTasks 空态文案', r1.emptyText === '任务模块未加载。');
} catch (e) { check('C1 computeTasks 未装载不抛', false); }

try {
  var r2 = pd.computeAchievements();
  check('C3 computeAchievements 未装载不抛', !r2.error);
  check('C4 computeAchievements 空态文案', r2.emptyText === '成就模块未加载。');
} catch (e) { check('C3 computeAchievements 未装载不抛', false); }

try {
  var r3 = pd.computeEndings();
  check('C5 computeEndings 未装载不抛', !r3.error);
  check('C6 computeEndings 空态文案', r3.emptyText === '结局模块未加载。');
} catch (e) { check('C5 computeEndings 未装载不抛', false); }

try {
  var r4 = pd.computeStoryNodes();
  check('C7 computeStoryNodes 未装载不抛', !r4.error);
  check('C8 computeStoryNodes 空态文案', r4.emptyText === '节点模块未加载。');
} catch (e) { check('C7 computeStoryNodes 未装载不抛', false); }

try {
  var r5 = pd.computeEventProposals();
  check('C9 computeEventProposals 未装载不抛', !r5.error);
  check('C10 computeEventProposals 空态文案', r5.emptyText === '事件模块未加载。');
} catch (e) { check('C9 computeEventProposals 未装载不抛', false); }

try {
  var r6 = pd.computeChangeProposals();
  check('C11 computeChangeProposals 未装载不抛', !r6.error);
  check('C12 computeChangeProposals 空态文案', r6.emptyText === '提议模块未加载。');
} catch (e) { check('C11 computeChangeProposals 未装载不抛', false); }

// C2: 无 NPC 定义
try {
  var r7 = pd.computeNpc();
  check('C13 computeNpc 无NPC不抛', !r7.error);
  check('C14 computeNpc 空态文案', r7.emptyText === '这个卡带还没有 NPC。去设置 → 世界书 → NPC 添加。');
} catch (e) { check('C13 computeNpc 无NPC不抛', false); }

// C3: 正常态（模块存在 + 有数据）
globalThis.Tasks = { listAll: function () { return [{ id: 't1', name: '测试任务', steps: [{ id: 's1', desc: '步骤1', done: true }] }]; } };
globalThis.Achievements = { listAll: function () { return [{ id: 'a1', name: '成就1', unlocked: true }]; } };
globalThis.Endings = { isEnabled: function () { return true; }, listAll: function () { return [{ id: 'e1', name: '结局1', reached: true, epilogue: '后日谈' }]; }, isLocked: function () { return false; } };
globalThis.StoryNodes = { isEnabled: function () { return true; }, getSummary: function () { return { currentNode: { id: 'n1', name: '节点1' }, completed: [], available: [{ id: 'n2', name: '节点2' }] }; } };
globalThis.Events = { getPendingProposals: function () { return [{ id: 'p1', title: '提议1' }]; } };
globalThis.Proposals = { list: function () { return [{ id: 'c1', title: '变更1' }]; }, describe: function () { return '描述'; } };
globalThis.NpcRuntime = { getFocus: function () { return ['laowang']; }, getSceneOnly: function () { return ['yt']; }, get: function (id) { return { mood: 'happy', playerRelation: '朋友' }; } };
globalThis.NpcDeduction = { listPending: function () { return []; }, listHistory: function () { return []; } };
globalThis.GameState.currentCard.worldbook.npcs = { laowang: { name: '老王', weight: 8 } };

try {
  var rt = pd.computeTasks();
  check('C15 computeTasks 正常态不抛', rt.tasks.length === 1);
  check('C16 computeTasks step done', rt.tasks[0].steps[0].done === true);
} catch (e) { check('C15 computeTasks 正常态不抛', false); }

try {
  var ra = pd.computeAchievements();
  check('C17 computeAchievements 正常态不抛', ra.achievements.length === 1);
  check('C18 computeAchievements hidden 改名', (function () {
    globalThis.Achievements.listAll = function () { return [{ id: 'a2', name: '真名', hidden: true, unlocked: false }]; };
    var r = pd.computeAchievements();
    return r.achievements[0].name === '神秘成就' && r.achievements[0].desc === '';
  })());
} catch (e) { check('C17 computeAchievements 正常态不抛', false); }

try {
  var re = pd.computeEndings();
  check('C19 computeEndings 正常态不抛', re.endings.length === 1);
  check('C20 computeEndings 统计 reachedCount', re.reachedCount === 1);
} catch (e) { check('C19 computeEndings 正常态不抛', false); }

try {
  var rn = pd.computeStoryNodes();
  check('C21 computeStoryNodes 正常态不抛', rn.currentNode !== null);
  check('C22 computeStoryNodes available', rn.available.length === 1);
} catch (e) { check('C21 computeStoryNodes 正常态不抛', false); }

try {
  var rp = pd.computeEventProposals();
  check('C23 computeEventProposals 正常态不抛', rp.proposals.length === 1);
} catch (e) { check('C23 computeEventProposals 正常态不抛', false); }

try {
  var rc = pd.computeChangeProposals();
  check('C24 computeChangeProposals 正常态不抛', rc.proposals.length === 1);
} catch (e) { check('C24 computeChangeProposals 正常态不抛', false); }

try {
  var rnpc = pd.computeNpc();
  check('C25 computeNpc 正常态不抛', rnpc.focus.length === 1);
  check('C26 computeNpc runtime mood', rnpc.runtime.laowang.mood === 'happy');
} catch (e) { check('C25 computeNpc 正常态不抛', false); }

// C4: 缺字段（currentState.panels 为 undefined）
globalThis.GameState.currentState = { panels: undefined };
try {
  pd.computeTasks();
  check('C27 computeTasks panels undefined 不抛', true);
} catch (e) { check('C27 computeTasks panels undefined 不抛', false); }

try {
  pd.computeNpc();
  check('C28 computeNpc panels undefined 不抛', true);
} catch (e) { check('C28 computeNpc panels undefined 不抛', false); }

// ============================================================
// G. H6R 订正：computeEndings 的 isLocked 误用回归防护 + 两段式断言
// 假数据：def1 reached:true locked:true；def2 reached:false；
// 系统 Endings.isLocked() 无参返回 false。
// 桌面口径：engine/ui_core.js:1085-1125 + engine/endings.js:99/111-114。
// ============================================================
globalThis.Endings = {
  isEnabled: function () { return true; },
  isLocked: function () { return false; },   // 系统锁：无参，false
  listAll: function () {
    return [
      { id: 'e_hard', name: '硬结局A', type: 'hard', desc: '硬', priority: 9,
        locked: true, reached: true, reachedAt: '2000-01-01', reachedRound: 3,
        reachedBy: 'x', epilogue: '', extensions: [], isDefEpilogue: false },
      { id: 'e_open', name: '开放结局B', type: 'neutral', desc: '未达成', priority: 5,
        locked: false, reached: false, reachedAt: '', reachedRound: 0,
        reachedBy: '', epilogue: '', extensions: [], isDefEpilogue: false }
    ];
  }
};
try {
  var rg = pd.computeEndings();
  var eHard = null;
  var eOpen = null;
  for (var gi = 0; gi < rg.endings.length; gi++) {
    if (rg.endings[gi].id === 'e_hard') eHard = rg.endings[gi];
    if (rg.endings[gi].id === 'e_open') eOpen = rg.endings[gi];
  }
  // G1 防本次缺陷回归：reached 项 locked 必须取自 def（true），不是无参系统锁（false）
  check('G1 computeEndings reached 项 locked 取 def（true）', !!(eHard && eHard.locked === true));
  // G2 系统锁字段独立返回，且 === false
  check('G2 computeEndings systemLocked === false', rg.systemLocked === false);
  // G3 reachedCount/totalCount 正确
  check('G3 computeEndings 计数 1/2', rg.reachedCount === 1 && rg.totalCount === 2);
  // G4 未达成项 locked 取 def（false）
  check('G4 computeEndings 未达成项 locked 取 def（false）', !!(eOpen && eOpen.locked === false));
} catch (e) {
  check('G1 computeEndings reached 项 locked 取 def（true）', false);
  check('G2 computeEndings systemLocked === false', false);
  check('G3 computeEndings 计数 1/2', false);
  check('G4 computeEndings 未达成项 locked 取 def（false）', false);
}

// EndingsPanel.js 源码两段式断言（桌面 ui_core.js:1116 的「未达成（N）」标题）
var epSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'EndingsPanel.js'), 'utf8');
check('G5 EndingsPanel 含「未达成（」段标题', epSrc.indexOf('未达成（') >= 0);
check('G6 EndingsPanel 含「已达成」段标题', epSrc.indexOf("'已达成'") >= 0 || epSrc.indexOf('已达成') >= 0);
check('G7 EndingsPanel 系统锁 banner「主循环已锁死」', epSrc.indexOf('主循环已锁死') >= 0);
// 未达成项渲染路径零标签：源码断言——全文不得再出现「已解锁/未解锁」字样
check('G8 EndingsPanel 不含「已解锁/未解锁」标签', epSrc.indexOf('已解锁') < 0 && epSrc.indexOf('未解锁') < 0);
// 已达成项硬结局标签仍保留（e.locked 真时挂）
check('G9 EndingsPanel 保留硬结局标签', epSrc.indexOf('硬结局') >= 0);

// ============================================================
// D. 无 hex 色值
// ============================================================
var HEX_RE = /#(?:[0-9a-fA-F]{6})\b/;
H6_FILES.forEach(function (rel, i) {
  var src = fs.readFileSync(path.join(root, rel), 'utf8');
  check('D' + (i + 1) + ' 无 hex 色值 ' + rel, !HEX_RE.test(src));
});

// ============================================================
// E. 引擎 API 存在性
// ============================================================
// 在 RN bootstrap 环境下检查
var RN_FILES = [
  'rn/rn_bootstrap.js'
];
// 检查 rn_bootstrap 装载了所有引擎模块
var API_CHECKS = [
  ['Tasks', 'Tasks'],
  ['Achievements', 'Achievements'],
  ['Endings', 'Endings'],
  ['StoryNodes', 'StoryNodes'],
  ['Events', 'Events'],
  ['Proposals', 'Proposals'],
  ['NpcRuntime', 'NpcRuntime'],
  ['NpcDeduction', 'NpcDeduction'],
  ['Portrait', 'Portrait'],
  ['ApiManager', 'ApiManager'],
  ['ApiClient', 'ApiClient']
];
API_CHECKS.forEach(function (pair, i) {
  check('E' + (i + 1) + ' rn_bootstrap 装载 ' + pair[0],
    bsSrc.indexOf("load('" + pair[1] + "'") >= 0);
});

// ============================================================
// F. UI_Portrait 已定义
// ============================================================
var upSrc = fs.readFileSync(path.join(root, 'rn', 'ui_portrait_rn.js'), 'utf8');
check('F1 UI_Portrait 文件含 start', upSrc.indexOf('start') >= 0);
check('F2 UI_Portrait 文件含 confirm', upSrc.indexOf('confirm') >= 0);
check('F3 UI_Portrait 文件含 skip', upSrc.indexOf('skip') >= 0);
check('F4 UI_Portrait 文件含 cancel', upSrc.indexOf('cancel') >= 0);
check('F5 UI_Portrait 文件含 generate', upSrc.indexOf('generate') >= 0);
check('F6 UI_Portrait 挂 globalThis', upSrc.indexOf('globalThis.UI_Portrait') >= 0);

// ============================================================

// ============================================================
// H. 产出物面板（P27 收尾）：OutputsPanel 文件 + 全接线点 + 引擎接口引用
//    H-1 文件在盘 / H-2 PanelHost 三处（require + TITLE_MAP + 分派）/
//    H-3 SidebarDrawer 入口 / H-4 panel_data 导出 / H-5 引擎调用非空壳
//    + 审核状态文案 / H-6 babel 可编
// ============================================================
var opRel = 'rn/panels/OutputsPanel.js';
var opAbs = path.join(root, opRel);
var opSrc = fs.existsSync(opAbs) ? fs.readFileSync(opAbs, 'utf8') : '';
check('H1 文件存在 ' + opRel, fs.existsSync(opAbs));

check('H2 PanelHost require OutputsPanel', phSrc.indexOf("require('../panels/OutputsPanel.js')") >= 0);
check('H3 TITLE_MAP outputs', phSrc.indexOf("outputs: '产出物'") >= 0);
check('H4 PanelHost 分派 outputs', phSrc.indexOf("panelId === 'outputs' ? <OutputsPanel") >= 0);

check('H5 SidebarDrawer outputs 入口', sdSrc.indexOf("panelRow('outputs'") >= 0);

var pdSrc = fs.readFileSync(path.join(root, 'rn', 'panels', 'panel_data.js'), 'utf8');
check('H6 panel_data 定义 computeOutputs', pdSrc.indexOf('function computeOutputs') >= 0);
check('H7 panel_data 导出 computeOutputs', typeof pd.computeOutputs === 'function');

check('H8 OutputsPanel 引用 Outputs.create', opSrc.indexOf('Outputs.create') >= 0);
check('H9 OutputsPanel 引用 Outputs.update', opSrc.indexOf('Outputs.update') >= 0);
check('H10 OutputsPanel 引用 Outputs.review', opSrc.indexOf('Outputs.review') >= 0);
check('H11 OutputsPanel 引用 Outputs.settle', opSrc.indexOf('Outputs.settle') >= 0);
check('H12 OutputsPanel 含审核状态文案（待审/已纳入/已驳回 至少两个）',
  ['待审', '已纳入', '已驳回'].filter(function (s) { return opSrc.indexOf(s) >= 0; }).length >= 2);

try {
  babel.transformFileSync(path.join(root, opRel), {
    cwd: root,
    configFile: path.join(root, 'babel.config.js')
  });
  check('H13 babel transform ' + opRel, true);
} catch (e) {
  check('H13 babel transform ' + opRel, false);
  console.log('  ERROR: ' + e.message);
}

console.log('\nH6_PANELS_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);

// ============================================================
// RN 主页 smoke · 战役 4 · 批次 4-2
// 用法：node tools/home_smoke.js（cwd = RN 仓根）
//
// 四组：
//   A. nav_store 路由单例：切屏/栈/映射/通知/订阅/快照稳定性/复位
//   B. home_model 主页数据模型：注入内存假 Storage/Saves/LocalStore/GameState，
//      身份描述走真实共享 card_display.js（RN 副本）
//   C. navigation React 绑定：react-test-renderer 实渲 Probe，验证
//      useNavigation 形状 + 外部 store 变更驱动重渲染
//   D. 4 壳桥接：rn_platform.install 后 showHome/showScreen/renderTopbar/
//      updateTokenBadge 真实驱动 nav_store，原 __calls 日志链与 false 语义保留
// 另：HomeScreen.js（含 JSX，Node 不能直 require）用仓内 babel 配置做
// transform 语法验证。
// H3：SCREENS 由 6 屏扩为 7 屏（新增 'create' 最小创角屏），
//     screen-create 映射由 'story' 改为 'create'，D13 同步改期望。
//     F5 计数 6→7；F6 02 行 meta 文案改为「最小创角 · 基于当前卡带」；
//     新增 F8 断言 HomeScreen 含 navigate('create') 真入口。
// ============================================================

'use strict';

var path = require('path');
var root = path.resolve(__dirname, '..');

var ok = 0;
var fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

// ---------- A. nav_store ----------

var NavStore = require(path.join(root, 'rn', 'nav_store.js'));
NavStore.reset();

eq('A1 初始屏 home', NavStore.getSnapshot().screen, 'home');
check('A2 初始栈空/计数 0',
  NavStore.getSnapshot().stack.length === 0 &&
  NavStore.getSnapshot().topbarSeq === 0 &&
  NavStore.getSnapshot().badgeSeq === 0);
check('A3 SCREENS 九屏登记（H3 加 create、H6 加 portrait、P1-G 加 classify）',
  NavStore.SCREENS.join(',') === ['home', 'story', 'settings', 'cards', 'saves', 'create', 'portrait', 'classify', '__boot'].join(','));
check('A4 Electron 屏映射表',
  NavStore.ELECTRON_SCREEN_MAP['screen-home'] === 'home' &&
  NavStore.ELECTRON_SCREEN_MAP['screen-game'] === 'story' &&
  NavStore.ELECTRON_SCREEN_MAP['screen-settings'] === 'settings' &&
  NavStore.ELECTRON_SCREEN_MAP['screen-create'] === 'create');

NavStore.navigate('story');
eq('A5 navigate story', NavStore.getSnapshot().screen, 'story');
eq('A6 压栈 home', NavStore.getSnapshot().stack[0], 'home');
var snap1 = NavStore.getSnapshot();
NavStore.navigate('story');
check('A7 同屏不重复压栈', NavStore.getSnapshot().stack.length === 1 && NavStore.getSnapshot() === snap1);
NavStore.navigate('settings');
eq('A8 再压一屏', NavStore.getSnapshot().stack.length, 2);
NavStore.goBack();
eq('A9 goBack 回 story', NavStore.getSnapshot().screen, 'story');
eq('A10 栈弹出', NavStore.getSnapshot().stack.length, 1);
NavStore.goBack();
eq('A11 回 home', NavStore.getSnapshot().screen, 'home');
NavStore.goBack();
check('A12 栈空 goBack 无操作', NavStore.getSnapshot().screen === 'home' && NavStore.getSnapshot().stack.length === 0);
NavStore.navigate('__boot');
eq('A13 __boot 可达', NavStore.getSnapshot().screen, '__boot');
NavStore.navigate('not-exist');
eq('A14 非法 id 回落 home', NavStore.getSnapshot().screen, 'home');
// 非法 id 被规范为 home 后等同按 home 键：正常压栈（goBack 可回 __boot）
check('A15 非法导航按规范后正常压栈',
  NavStore.getSnapshot().stack.length === 2 &&
  NavStore.getSnapshot().stack[1] === '__boot');
NavStore.reset();

eq('A16 screen-game 映射', NavStore.navigateByElectronId('screen-game'), 'story');
eq('A17 screen-home 映射', NavStore.navigateByElectronId('screen-home'), 'home');
eq('A18 未知 Electron id 回落 home', NavStore.navigateByElectronId('screen-portrait'), 'home');
NavStore.reset();

var hits = 0;
var unsub = NavStore.subscribe(function () { hits++; });
NavStore.notify('topbar');
eq('A19 topbar 通知计数', NavStore.getSnapshot().topbarSeq, 1);
NavStore.notify('tokenBadge');
eq('A20 badge 通知计数', NavStore.getSnapshot().badgeSeq, 1);
NavStore.notify('other');
check('A21 未知 kind 不动计数',
  NavStore.getSnapshot().topbarSeq === 1 && NavStore.getSnapshot().badgeSeq === 1);
eq('A22 订阅者收到 2 次', hits, 2);
unsub();
NavStore.notify('topbar');
eq('A23 退订后不再收到', hits, 2);
NavStore.reset();

// ---------- B. home_model（内存假件 + 真实 CardDisplay）----------

var CardDisplay = require(path.join(root, 'engine', 'card_display.js'));

var lsMap = {};
var cards = {
  c1: { cardId: 'c1', cardName: '修仙模拟器', description: '一介凡人的长生梦',
        display: { title: '玄门问道', seal: '玄门', glyph: '玄', genre: '修仙', volume: '卷一',
                   sub: '天命如何', accent: '#7a4a1a', theme: 'glass' } },
  c2: { cardId: 'c2', cardName: 'CoC 雾都',
        display: { genre: '恐怖', theme: 'scroll' } },
  c3: { cardId: 'c3', cardName: '无名老卡', description: '老卡无 display' }
};
var savesAll = [
  { cardId: 'c1', saveId: 's1', displayName: '陈七档', playerName: '陈七',
    lastPlayedAt: '2026-09-26T22:10:00', playTime: 3725 }
];
var globalDoc = { settings: { skinOverride: { c2: 'paper' } } };

globalThis.Storage = {
  getAllCards: function () { return cards; },
  getGlobal: function () { return globalDoc; },
  setGlobal: function (g) { globalDoc = g; }
};
globalThis.LocalStore = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(lsMap, k) ? lsMap[k] : null; },
  setItem: function (k, v) { lsMap[k] = String(v); }
};
globalThis.Saves = {
  listAll: function () { return savesAll; },
  listByCard: function (id) { return savesAll.filter(function (s) { return s.cardId === id; }); },
  formatPlayTime: function (sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return (h ? h + 'h' : '') + m + 'm';
  }
};
globalThis.GameState = { _totalTokens: 0 };

var Model = require(path.join(root, 'rn', 'home_model.js'));

eq('B1 无记忆→最近存档卡 c1', Model.getHomeCardId(), 'c1');
lsMap[Model.HOME_CARD_KEY] = 'c2';
eq('B2 LocalStore 记忆优先 c2', Model.getHomeCardId(), 'c2');
lsMap[Model.HOME_CARD_KEY] = 'missing';
eq('B3 失效记忆回落最近存档', Model.getHomeCardId(), 'c1');
delete lsMap[Model.HOME_CARD_KEY];
Model.setHomeCardId('c3');
eq('B4 setHomeCardId 落 LocalStore', lsMap[Model.HOME_CARD_KEY], 'c3');
delete lsMap[Model.HOME_CARD_KEY];

var picked = Model.getHomePicked();
check('B5 picked 形状（id/card/display）', !!picked && picked.id === 'c1' && !!picked.display);
eq('B6 display 题名透传', picked.display.title, '玄门问道');
eq('B7 overline genre · volume', Model.buildHomeModel().overline, '修仙 · 卷一');
eq('B8 身份色透传', picked.display.accent, '#7a4a1a');
eq('B9 默认书票取 display.theme', picked.display.theme, 'glass');
eq('B10 生效书票：无 c1 覆盖 → glass', Model.effectiveSkin(picked), 'glass');
Model.setSkinOverride('c1', 'scroll');
eq('B11 按卡覆盖优先 scroll', Model.effectiveSkin(picked), 'scroll');
check('B12 override 已落 Storage', globalDoc.settings.skinOverride.c1 === 'scroll');
Model.setSkinOverride('c1', null);
eq('B13 空值删覆盖回 glass', Model.effectiveSkin(picked), 'glass');

var homeModel = Model.buildHomeModel();
eq('B14 在库数 3', homeModel.cardCount, 3);
check('B15 三书票', homeModel.skinThemes.join(',') === 'paper,glass,scroll');
eq('B16 最近存档 c1', homeModel.lastSave && homeModel.lastSave.cardId, 'c1');
eq('B17 存档目录 1 条', homeModel.saves.length, 1);
eq('B18 书票名表', Model.HOME_SKIN_NAMES.glass, '流光');

var rows = Model.listCardsForPicker();
eq('B19 picker 行数', rows.length, 3);
var c2row = rows.filter(function (r) { return r.id === 'c2'; })[0];
eq('B20 c2 覆盖生效 paper', c2row.skin, 'paper');
check('B21 c1 为当前卡（最近存档）', rows.filter(function (r) { return r.id === 'c1'; })[0].current === true);
eq('B22 glyph 身份字段', c2row.display.glyph, 'C');

eq('B23 游玩时长委托', Model.formatPlayTimeSafe(3725), '1h2m');
eq('B24 token 0', Model.formatTokenBadge(0), '0');
eq('B25 token 999', Model.formatTokenBadge(999), '999');
eq('B26 token k 档', Model.formatTokenBadge(1500), '1.5k');
eq('B27 token M 档', Model.formatTokenBadge(2000000), '2.00M');
globalThis.GameState._totalTokens = 2500;
eq('B28 readTotalTokens 现读', Model.readTotalTokens(), 2500);
eq('B29 徽章 2.5k', Model.formatTokenBadge(Model.readTotalTokens()), '2.5k');
check('B30 无档时钟为 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(Model.buildClock()));
globalThis.GameState._totalTokens = 0;

// 空库分支
var savedCards = cards;
cards = {};
var emptyModel = Model.buildHomeModel();
eq('B31 空库 picked null', Model.getHomeCardId(), null);
// 期望字面量 grounding 自 card_display.js：FALLBACK_TITLE='未命名卡带'
// （私有变量未导出）、FALLBACK_GENRE 已导出
check('B32 空库全回退不白屏',
  emptyModel.display.title === '未命名卡带' &&
  emptyModel.display.genre === CardDisplay.FALLBACK_GENRE &&
  emptyModel.cardCount === 0 &&
  emptyModel.lastSave === null &&
  emptyModel.saves.length === 0);
eq('B33 空库存档目录空', emptyModel.skin, 'paper');
cards = savedCards;

// ---------- C. navigation React 绑定 ----------

var React = require('react');
var TestRenderer = require('react-test-renderer');
var Navigation = require(path.join(root, 'rn', 'navigation.js'));
NavStore.reset();

var actFn = (typeof React.act === 'function') ? React.act : TestRenderer.act;
var probe = { count: 0 };
function Probe() {
  var n = Navigation.useNavigation();
  probe.last = n;
  probe.count++;
  return React.createElement('box', null,
    n.currentScreen + '|' + n.ui.topbarSeq + '|' + n.ui.badgeSeq);
}

var inst;
actFn(function () {
  inst = TestRenderer.create(
    React.createElement(Navigation.NavigationProvider, null,
      React.createElement(Probe))
  );
});
check('C1 Provider 渲染', !!inst);
check('C2 useNavigation 形状',
  probe.last && probe.last.currentScreen === 'home' &&
  typeof probe.last.navigate === 'function' &&
  typeof probe.last.goBack === 'function' &&
  probe.last.ui && probe.last.ui.topbarSeq === 0);
var rendered1 = probe.count;
actFn(function () { probe.last.navigate('story'); });
eq('C3 navigate 后 Probe 看到 story', probe.last.currentScreen, 'story');
check('C4 切屏触发重渲染', probe.count > rendered1);
actFn(function () { probe.last.goBack(); });
eq('C5 goBack 回 home', probe.last.currentScreen, 'home');
var rendered2 = probe.count;
actFn(function () { NavStore.notify('tokenBadge'); });
eq('C6 badge 信号到组件', probe.last.ui.badgeSeq, 1);
check('C7 信号触发重渲染', probe.count > rendered2);
if (inst) {
  actFn(function () { inst.unmount(); });
}
NavStore.reset();

// ---------- D. 4 壳桥接 ----------

var RNPlatform = require(path.join(root, 'rn', 'rn_platform.js'));
var base = {};
RNPlatform.install(base);
check('D1 install 标记', base.__rnPlatform === '2-5');
check('D2 21 接口齐全',
  RNPlatform.UI_NAMES.every(function (n) { return typeof base.ui[n] === 'function'; }));

NavStore.reset();
check('D3 showHome 不抛', (function () { base.ui.showHome(); return true; })());
eq('D4 showHome 驱动到 home', NavStore.getSnapshot().screen, 'home');
check('D5 showScreen(screen-game) 不抛', (function () { base.ui.showScreen('screen-game'); return true; })());
eq('D6 → story', NavStore.getSnapshot().screen, 'story');
base.ui.showScreen('screen-settings');
eq('D7 → settings', NavStore.getSnapshot().screen, 'settings');
base.ui.showScreen('screen-unknown');
eq('D8 未知回落 home', NavStore.getSnapshot().screen, 'home');
base.ui.renderTopbar();
eq('D9 renderTopbar 通知', NavStore.getSnapshot().topbarSeq, 1);
base.ui.updateTokenBadge();
eq('D10 updateTokenBadge 通知', NavStore.getSnapshot().badgeSeq, 1);
var calls = base.ui.__calls || [];
check('D11 原壳 __calls 日志链保留',
  calls.some(function (r) { return r.name === 'showHome'; }) &&
  calls.some(function (r) { return r.name === 'showScreen'; }) &&
  calls.some(function (r) { return r.name === 'renderTopbar'; }) &&
  calls.some(function (r) { return r.name === 'updateTokenBadge'; }));
eq('D12 false 语义保留（未投递 DOM 层）', base.ui.showHome(), false);
check('D13 story.js 真实序列不抛（H3：screen-create 现映射 create 屏）', (function () {
  base.ui.showScreen('screen-create');
  var s1 = NavStore.getSnapshot().screen;
  base.ui.showScreen('screen-game');
  var s2 = NavStore.getSnapshot().screen;
  base.ui.showHome();
  var s3 = NavStore.getSnapshot().screen;
  return s1 === 'create' && s2 === 'story' && s3 === 'home';
})());
NavStore.reset();

// ---------- E. JSX 文件语法（HomeScreen 经仓内 babel 配置 transform）----------

var babel = require(path.join(root, 'node_modules', '@babel', 'core'));
['rn/nav_store.js', 'rn/navigation.js', 'rn/home_model.js',
 'rn/screens/HomeScreen.js', 'rn/rn_platform.js'].forEach(function (rel) {
  try {
    // 显式锚定仓根 babel.config.js：babel 的配置查找随 process.cwd() 漂移，
    // 本 smoke 必须在任意 cwd 下结果一致
    babel.transformFileSync(path.join(root, rel), {
      cwd: root,
      configFile: path.join(root, 'babel.config.js')
    });
    ok++; console.log('PASS: E babel transform ' + rel);
  } catch (e) {
    fail++; console.log('FAIL: E babel transform ' + rel + ' :: ' + e.message);
  }
});

// ---------- F. 六行结构（H1：源码文本断言，不引渲染器，零新依赖）----------

var fs = require('fs');
var homeSrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'HomeScreen.js'), 'utf8');
var SIX_LABELS = ['继续上次会话', '新建存档', '换一张卡带', '管理卡带与导入', '存档管理', '设置'];
var SIX_NUMS = ['01', '02', '03', '04', '05', '06'];
check('F1 六条标签文案齐全',
  SIX_LABELS.every(function (t) { return homeSrc.indexOf(t) >= 0; }));
check('F2 编号 01-06 齐全',
  SIX_NUMS.every(function (t) { return homeSrc.indexOf("'" + t + "'") >= 0; }));
check('F3 divider/sectionOverline 样式键存在',
  /divider:\s*\{/.test(homeSrc) && /sectionOverline:\s*\{/.test(homeSrc));
var pickCount = homeSrc.split('管理卡带与导入').length - 1;
// styles.empty 全文三处使用：目录区「无卡」空态、目录区「无存档」三元中间分支
// 「这张卡带还没有存档，从 02 新建存档开始」（H3 起 02 为真入口，文案同步更新）、
// picker 空态。F4 守的是 empty 行不含「管理卡带与导入」短语，不是 empty 用法计数。
var emptyLines = homeSrc.split('\n').filter(function (l) { return l.indexOf('styles.empty') >= 0; });
check('F4 死引用清空（短语仅余 04 行 1 处，三处 empty 行均不含死引用）',
  pickCount === 1 &&
  emptyLines.length === 3 &&
  emptyLines.every(function (l) { return l.indexOf('管理卡带与导入') < 0; }));
eq('F5 SCREENS 九屏（H3 加 create、H6 加 portrait、P1-G 加 classify）', NavStore.SCREENS.length, 9);
check('F6 02 行 meta 对齐「最小创角 · 基于当前卡带」（H3 真入口文案）',
  homeSrc.indexOf('最小创角 · 基于当前卡带') >= 0 &&
  homeSrc.indexOf('角色创建三步 · 后续批次') < 0);

// ---------- F7. 全局背景渲染层（H2：源码文本断言 BackgroundLayer 被引用）----------
var bgLayerPath = path.join(root, 'rn', 'components', 'BackgroundLayer.js');
var bgLayerSrc = fs.readFileSync(bgLayerPath, 'utf8');
var storySrc = fs.readFileSync(path.join(root, 'rn', 'screens', 'StoryScreen.js'), 'utf8');
check('F7 BackgroundLayer 被 HomeScreen/StoryScreen 引用 + 组件存在',
  homeSrc.indexOf('BackgroundLayer') >= 0 &&
  storySrc.indexOf('BackgroundLayer') >= 0 &&
  bgLayerSrc.indexOf('useTheme') >= 0 &&
  bgLayerSrc.indexOf('Image') >= 0 &&
  bgLayerSrc.indexOf('pointerEvents') >= 0);
check('F8 HomeScreen 02 行为真入口（H3：TouchableOpacity + navigate(create)）',
  homeSrc.indexOf("navigate('create')") >= 0 &&
  homeSrc.indexOf("<TouchableOpacity") >= 0);

console.log('HOME_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);

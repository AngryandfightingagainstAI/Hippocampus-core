// ============================================================
// P33 · 手机版体验 smoke（纯 Node 断言，零 RN 运行时）
// 用户 m07904 四条裁决的守卫：
//   ① 叙事屏菜单入口放大带字 + 顶部横滑状态条下线（数值搬进侧栏抽屉）
//   ② 侧栏把「人物卡 / 个人素质 / 属性 / 素质」并成一条（不再分开放）
//   ③ Android 返回键优先「返回上一屏」，栈空才交还系统
//   ④ 导入卡带界面「选择文件…」与「解析资料」分开成组
// 用法：node tools/mobile_ux_smoke.js（cwd 随意）
// 纪律：纯 Node；源码级断言 + 数据层/路由层行为级断言；不引新依赖。
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0;
var fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' <<< ' + detail : '')); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function section(t) { console.log('---- ' + t + ' ----'); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// ============================================================
// ① 叙事屏：菜单入口 / 状态条下线
// ============================================================
section('U-1 叙事屏菜单入口（①）');
var story = read('rn/screens/StoryScreen.js');
check('U-1a 菜单按钮有独立样式（menuBtn）', story.indexOf('styles.menuBtn') >= 0);
check('U-1b 菜单按钮带文字「☰ 菜单」', story.indexOf("'☰ 菜单'") >= 0);
check('U-1c 旧的单一 ◇ 字形入口已移除',
  story.indexOf('sbGlyph') < 0 && story.indexOf('sbBtn') < 0);
check('U-1d 菜单按钮有内边距（点得到的体量）',
  /menuBtn: \{[\s\S]{0,160}paddingHorizontal: 12, paddingVertical: 6/.test(story));

section('U-2 顶部横滑状态条下线（①）');
check('U-2a 叙事屏不再有 hudBar/hudRow',
  story.indexOf('hudBar') < 0 && story.indexOf('hudRow') < 0);
check('U-2b 叙事屏不再自算 hudItems()',
  story.indexOf('hudItems(') < 0 && story.indexOf('hudColorOf') < 0);
check('U-2c 叙事屏不再自读天气/节日/token',
  story.indexOf('Weather.getCurrent') < 0 &&
  story.indexOf('Calendar.getTodayHolidays') < 0 &&
  story.indexOf('_totalTokens') < 0);

section('U-3 侧栏抽屉「数值」区接管（①）');
var drawer = read('rn/components/SidebarDrawer.js');
check('U-3a 抽屉有「数值」小节', drawer.indexOf("'数值'") >= 0);
check('U-3b 抽屉读数走 readHud()/readHudInfo()',
  drawer.indexOf('readHud()') >= 0 && drawer.indexOf('readHudInfo()') >= 0);
check('U-3c 抽屉显示 天气 / 节日 / 游戏时间 / 累计 token',
  drawer.indexOf('Weather.getCurrent') >= 0 &&
  drawer.indexOf('Calendar.getTodayHolidays') >= 0 &&
  drawer.indexOf('formatGameTime') >= 0 &&
  drawer.indexOf("'⟡ '") >= 0);
check('U-3d 数值进度色复用同一条 barColor 规则',
  /barColor\(h, h\.pct\)/.test(drawer));
check('U-3e 抽屉不再自己扫面板（改走数据层规则）',
  drawer.indexOf('function readCustomPanels') < 0);

// ============================================================
// ② 人物卡 / 个人素质面板合并
// ============================================================
section('U-4 面板合并（②）');
var panelDataSrc = read('rn/panels/panel_data.js');
check('U-4a 合并规则在数据层单一来源',
  panelDataSrc.indexOf('function computeMergedCharPanels()') >= 0 &&
  panelDataSrc.indexOf('computeMergedCharPanels: computeMergedCharPanels') >= 0);
check('U-4b 抽屉用合并结果列面板 + 角色行改名',
  drawer.indexOf('PanelData.computeMergedCharPanels()') >= 0 &&
  drawer.indexOf('charMerge.others') >= 0 &&
  /panelRow\('character', charMerge\.label \|\| '角色'\)/.test(drawer));
var charSrc = read('rn/panels/CharacterPanel.js');
check('U-4c 角色面板承载被并入面板的条目',
  charSrc.indexOf("require('./EntriesPanel.js')") >= 0 &&
  charSrc.indexOf('<EntriesPanel panelId={mv.id} tokens={tk} />') >= 0 &&
  charSrc.indexOf('computeMergedCharPanels().ids') >= 0);

// 行为级：喂假 GameState 跑真实 computeMergedCharPanels
var pd = require(path.join(root, 'rn', 'panels', 'panel_data.js'));
function setPanels(panels) {
  global.GameState = {
    currentState: { panels: panels },
    getEntrySegmentText: function () { return ''; }
  };
}
setPanels({
  sheet: { num: 1, name: '人物卡', entries: [{ type: 'switch', name: '觉醒', value: true }] },
  attrs: { num: 2, name: '个人素质', entries: [{ type: 'number', name: '力量', current: 10, max: 20 }] },
  fame: { num: 3, name: '声望与名誉', entries: [] },
  world: { num: 5, name: '世界百科', entries: [] }
});
// 老代码上没有这个函数 ⇒ 包一层，让守卫红而不是崩
function mergedCall(mod) {
  try { return mod.computeMergedCharPanels(); }
  catch (e) { return { label: '<missing>', ids: ['<missing>'], others: ['<missing>'], err: String(e && e.message || e) }; }
}
var m1 = mergedCall(pd);
eq('U-4d 人物卡 + 个人素质 并成一条（按 num 序）', m1.ids.join(','), 'sheet,attrs');
eq('U-4e 合并行显示名取第一个匹配面板名', m1.label, '人物卡');
eq('U-4f 无关面板仍单列（声望与名誉 / 世界百科）', m1.others.map(function (p) { return p.name; }).join(','), '声望与名誉,世界百科');
var mvAttrs = pd.computeEntries('attrs');
eq('U-4g 被并入面板的条目仍可取到（力量）', mvAttrs.entries.length, 1);
eq('U-4h 被并入面板条目名', mvAttrs.entries[0].name, '力量');

setPanels({
  attrs: { num: 2, name: '个人素质', entries: [] },
  fame: { num: 3, name: '声望与名誉', entries: [] }
});
var m2 = mergedCall(pd);
eq('U-4i 名「属性」也并入', m2.ids.join(','), 'attrs');
eq('U-4j 被并入的「个人素质」不接管行名（调用方仍显示「角色」）', m2.label, '');

setPanels({ fame: { num: 3, name: '声望与名誉', entries: [] } });
var m3 = mergedCall(pd);
eq('U-4k 无匹配面板时不吞任何面板', m3.ids.length, 0);
eq('U-4l 无匹配时自定义面板原样单列', m3.others.length, 1);
eq('U-4m 无匹配面板时合并行名回落空串（调用方显示「角色」）', m3.label, '');

// ============================================================
// ③ Android 返回键
// ============================================================
section('U-5 返回键（③）');
var appSrc = read('App.tsx');
check('U-5a App.tsx 订阅硬件返回键',
  appSrc.indexOf("BackHandler.addEventListener('hardwareBackPress'") >= 0);
check('U-5b 返回键走路由栈 goBack（不是退出应用）',
  appSrc.indexOf('NavStoreModule.goBack()') >= 0);
var nav = require(path.join(root, 'rn', 'nav_store.js'));
nav.reset();
eq('U-5c 栈空 goBack 返回 false（交还系统 ⇒ 主页才退出应用）', nav.goBack(), false);
nav.navigate('story');
eq('U-5d 有上一屏时 goBack 返回 true', nav.goBack(), true);
eq('U-5e 回退后停在 home', nav.getSnapshot().screen, 'home');
nav.reset();

// ============================================================
// ④ 导入卡带界面按钮分离
// ============================================================
section('U-6 导入界面按钮分离（④）');
var cards = read('rn/screens/CardsScreen.js');
check('U-6a 「或 从 手 机 选 文 件」独立小标题已就位',
  cards.indexOf("'或 从 手 机 选 文 件'") >= 0);
check('U-6b 选文件与解析分属两组（中间有分隔与小标题）',
  /或 从 手 机 选 文 件[\s\S]{0,700}doParseMaterial/.test(cards) &&
  cards.indexOf("'解 析 与 落 库'") >= 0);
check('U-6c 选文件按钮保留原入口与文案',
  cards.indexOf('onPress={doPickMaterialFile}') >= 0 && cards.indexOf("'选择文件…'") >= 0);
check('U-6d 解析 / AI 补全 / 落库三按钮仍在',
  cards.indexOf("'解析资料'") >= 0 && cards.indexOf("'让 AI 补全'") >= 0 &&
  cards.indexOf("'落库为卡带'") >= 0);

// ============================================================
// ⑦ P42·输入体验（用户 m09047）
//   ① 打字时看不到自己在打什么：键盘盖住输入条 + 输入框不长高
//   ② 内容太长时卡带页滑不动：多行框吃掉竖直拖动
//   ③ 其他输入过长「一条到底」：没有扩充 / 回缩
// ============================================================
section('U-7 输入框自动增高与键盘避让（⑦）');
var metricsPath = path.join(root, 'rn', 'ui_input_metrics.js');
check('U-7a 度量模块存在（纯 JS，可被本守卫直接 require）', fs.existsSync(metricsPath));
var M = require(metricsPath);
eq('U-7b 低于下限抬到下限', M.clampHeight(10, 40, 200).height, 40);
eq('U-7c 区间内跟内容走', M.clampHeight(88, 40, 200).height, 88);
eq('U-7d 超上限夹到上限并标记 clipped', M.clampHeight(900, 40, 200).height, 200);
eq('U-7e 超上限时 clipped=true（交给输入框自己滚）', M.clampHeight(900, 40, 200).clipped, true);
eq('U-7f 未超上限 clipped=false（手势留给外层滚动）', M.clampHeight(88, 40, 200).clipped, false);
eq('U-7g 上限小于下限时按上限=下限夹（不反转）', M.clampHeight(500, 40, 10).height, 40);
eq('U-7h 行数换算高度（3 行 × 22 + 2×8）', M.linesToHeight(3, 22, 8), 82);
eq('U-7i 键盘没弹时不补底距', M.resolveKeyboardInset(0, 800, 800), 0);
eq('U-7j 窗口已被系统压短（正好压掉键盘高度）⇒ 不再二次抬升',
  M.resolveKeyboardInset(600, 800, 200), 0);
eq('U-7k 窗口没被压短（edge-to-edge）⇒ 按键盘高度补底距',
  M.resolveKeyboardInset(600, 800, 800), 600);
eq('U-7l 窗口只压了一点点 ⇒ 仍按键盘高度补',
  M.resolveKeyboardInset(600, 800, 700), 600);
eq('U-7m 键盘高度缺失兜底为 0', M.resolveKeyboardInset(undefined, 800, 800), 0);

var autoSrc = fs.existsSync(path.join(root, 'rn', 'components', 'AutoInput.js'))
  ? read('rn/components/AutoInput.js') : '';
check('U-7n AutoInput 组件存在', autoSrc.length > 0);
check('U-7o 用「隐藏测量文本 + onLayout」跟内容走（onContentSizeChange 真机实测是视图高度，会自喂）',
  autoSrc.indexOf('pointerEvents') >= 0 && /opacity: 0/.test(autoSrc) &&
  autoSrc.indexOf('onLayout') >= 0 && autoSrc.indexOf('contentSize') < 0);
check('U-7p 没超上限时关掉内部滚动（外层才滑得动）',
  /scrollEnabled: fit\.clipped/.test(autoSrc));
check('U-7q 高度按夹取结果写死（height）', /height: fit\.height/.test(autoSrc));
check('U-7r 支持折叠/展开（collapsedLines + 展开文案）',
  autoSrc.indexOf('collapsedLines') >= 0 && autoSrc.indexOf('展开') >= 0 &&
  autoSrc.indexOf('收起') >= 0);
check('U-7s 多行文本顶部对齐（textAlignVertical）',
  autoSrc.indexOf("textAlignVertical") >= 0);

var kbSrc = fs.existsSync(path.join(root, 'rn', 'use_keyboard_inset.js'))
  ? read('rn/use_keyboard_inset.js') : '';
check('U-7t 键盘避让 hook 存在', kbSrc.length > 0);
check('U-7u hook 订阅键盘显隐（Android didShow/didHide）',
  kbSrc.indexOf('keyboardDidShow') >= 0 && kbSrc.indexOf('keyboardDidHide') >= 0);
check('U-7v hook 走纯函数判据（不自己拍脑袋加）',
  kbSrc.indexOf('resolveKeyboardInset') >= 0);

check('U-7w 叙事屏输入框改用 AutoInput', story.indexOf('components/AutoInput.js') >= 0 &&
  story.indexOf('<AutoInput') >= 0);
check('U-7x 叙事屏接了键盘避让', story.indexOf('useKeyboardInset()') >= 0 &&
  /paddingBottom[\s\S]{0,80}kbInset/.test(story));
check('U-7y 叙事屏输入框不再写死 maxHeight 96', story.indexOf('maxHeight: 96') < 0);
check('U-7z 叙事屏输入框给了 autoInput 行数档位',
  /minLines=\{?1\}?/.test(story) && /maxLines=\{?5\}?/.test(story));

var cards2 = read('rn/screens/CardsScreen.js');
check('U-7aa 卡带库两个粘贴框改用 AutoInput',
  cards2.indexOf('components/AutoInput.js') >= 0 &&
  (cards2.match(/<AutoInput/g) || []).length >= 2);
check('U-7ab 卡带库粘贴框可折叠/展开（默认收起，长文点展开）',
  /collapsedLines=\{6\}/.test(cards2) && /maxLines=\{22\}/.test(cards2));
check('U-7ac 卡带库 ScrollView 不再被键盘吞掉点击',
  /keyboardShouldPersistTaps="handled"/.test(cards2));

var controls = read('rn/components/settings/controls.js');
check('U-7ad 设置/世界书多行输入一并自动增高',
  controls.indexOf('AutoInput') >= 0 && /multiline/.test(controls));
var overlay = read('rn/components/OverlayHost.js');
check('U-7ae 全局弹窗的多行输入一并自动增高',
  overlay.indexOf('AutoInput') >= 0);

// ---- P77（用户 m00890）：人设页键盘遮挡 + 长文看不到后面 ----
var portrait = read('rn/screens/PortraitScreen.js');
check('U-7ax 人设页接了键盘避让', portrait.indexOf('useKeyboardInset()') >= 0 &&
  /paddingBottom[\s\S]{0,80}kbInset/.test(portrait));
check('U-7ay 人设页两个多行输入框改用 AutoInput',
  portrait.indexOf('components/AutoInput.js') >= 0 &&
  (portrait.match(/<AutoInput/g) || []).length >= 2);
check('U-7az 人设页多行框不再写死高度（minHeight 120 / 60 已去掉）',
  portrait.indexOf('minHeight: 120') < 0 && portrait.indexOf('minHeight: 60') < 0);
check('U-7ba 人设页长文随字数长高且能展开/收起',
  /collapsedLines=\{6\}/.test(portrait) && /maxLines=\{12\}/.test(portrait) &&
  portrait.indexOf('展开 ▾') >= 0 && portrait.indexOf('收起 ▴') >= 0);
check('U-7bb 人设页聚焦输入框会滚进可视区（scrollTo + onFocus）',
  /scrollTo\(\{ y:/.test(portrait) && /onFocus=\{focusTo/.test(portrait));

// ---- P77b（用户 m01337「改」）：创角页同类问题 ----
var create = read('rn/screens/CreateScreen.js');
check('U-7bc 创角页接了键盘避让', create.indexOf('useKeyboardInset()') >= 0 &&
  /paddingBottom[\s\S]{0,100}kbInset/.test(create));
check('U-7bd 创角页字段聚焦会滚进可视区（onLayout + onFocus）',
  /onLayout=\{rememberY\(key\)\}/.test(create) &&
  (create.match(/onFocus=\{focusTo\(key\)\}/g) || []).length >= 2 &&
  /scrollTo\(\{ y:/.test(create));
check('U-7be 创角页 ScrollView 挂了 ref（否则拿不到滚动句柄）',
  /ref=\{scrollRef\}/.test(create));

// ---- P78（用户 m01511「做吧」）：世界书 NPC 台词库 ----
var npcEditor = read('rn/screens/settings/worldbook/npcEditor.js');
check('U-7bf 世界书 NPC 编辑器有台词库卡片', npcEditor.indexOf('台词库（给 AI 参考）') >= 0);
check('U-7bg 台词库四类分组都在（情绪 / 对某 NPC / 喜欢 / 讨厌）',
  ['emotion', 'npc', 'like', 'dislike'].every(function (k) {
    return npcEditor.indexOf("kindBlock('" + k + "')") >= 0;
  }));
check('U-7bh 台词库每组可加/删/改台词行',
  npcEditor.indexOf('MOD.addCue(idx, kind)') >= 0 &&
  npcEditor.indexOf('MOD.addCueLine(idx, ci)') >= 0 &&
  npcEditor.indexOf('MOD.setCueLine(idx, ci, li, val)') >= 0 &&
  npcEditor.indexOf('MOD.delCueLine(idx, ci, li)') >= 0 &&
  npcEditor.indexOf('MOD.delCue(idx, ci)') >= 0);
var npcPanel = read('rn/panels/NpcPanel.js');
check('U-7bi NPC 面板显示当前情绪组台词（此刻 + 运行时 voiceCues）',
  npcPanel.indexOf("'此刻：'") >= 0 && npcPanel.indexOf('rt.voiceCues') >= 0);

// ---- 设置区「键盘打开时第一次点击被吞」的通用防护（P79）----
//   起因（真机 vivo V2118A）：键盘弹出时单击「+ 新建 NPC」「+ 添加一组对某个 NPC」没反应，
//   同一位置再点一次才生效。根因不是渲染：RN ScrollView 默认 keyboardShouldPersistTaps='never'，
//   键盘打开时第一次点击被用来收键盘、事件不下发给按钮。
//   这里逐个文件核对「ScrollView 数 == keyboardShouldPersistTaps 数」，以后新写设置页漏了就红。
var persistFiles = [
  'rn/screens/SettingsScreen.js',
  'rn/screens/settings/ColorTab.js',
  'rn/screens/settings/DataTab.js',
  'rn/screens/settings/DiceTab.js',
  'rn/screens/settings/GeneralTab.js',
  'rn/screens/settings/GmTab.js',
  'rn/screens/settings/RealtimeTab.js',
  'rn/screens/settings/WeatherTab.js',
  'rn/screens/settings/worldbook/factionEditor.js',
  'rn/screens/settings/worldbook/itemEditor.js',
  'rn/screens/settings/worldbook/mapEditor.js',
  'rn/screens/settings/worldbook/npcEditor.js',
  'rn/screens/settings/worldbook/occupationEditor.js',
  'rn/screens/settings/worldbook/outputsEditor.js',
  'rn/screens/settings/worldbook/raceEditor.js',
  'rn/screens/settings/worldbook/skillEditor.js',
  'rn/screens/settings/worldbook/worldSettingEditor.js'
];
var persistShort = [];
var persistDetail = [];
persistFiles.forEach(function (rel) {
  var t = read(rel);
  var scrolls = (t.match(/ScrollView,\s*\{/g) || []).length;
  var guards = (t.match(/keyboardShouldPersistTaps: 'handled'/g) || []).length;
  if (scrolls === 0 || guards < scrolls) {
    persistShort.push(rel + '(' + guards + '/' + scrolls + ')');
  } else if (guards > scrolls) {
    persistDetail.push(rel + '(' + guards + '>' + scrolls + ')');
  }
});
check('U-7bj 设置区所有 ScrollView 都带 keyboardShouldPersistTaps（键盘打开时首次点击不被吞）',
  persistShort.length === 0, persistShort.join(' '));
check('U-7bk NPC 编辑器空态与表单态两个 ScrollView 都有该属性',
  (read('rn/screens/settings/worldbook/npcEditor.js').match(/keyboardShouldPersistTaps: 'handled'/g) || []).length >= 2);
check('U-7bl 世界书 9 个分页编辑器一个不漏',
  persistShort.filter(function (s) { return s.indexOf('worldbook/') >= 0; }).length === 0);
check('U-7bm 没有多余挂载（属性数不超过 ScrollView 数）', persistDetail.length === 0, persistDetail.join(' '));

// ---- 真渲染：用 react-test-renderer 把 AutoInput 跑起来（不是 grep 源码） ----
//   手法照 tools/theme_switch_smoke.js：Module._load 桩掉 react-native，react 用真的。
//   覆盖：跟内容长高 → 到上限夹住并开内部滚 → 内容变短自己缩回 → 折叠/展开开关。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
var Module = require('module');
var origLoad = Module._load;
var RNStub = {
  Platform: { OS: 'android' },
  View: 'View', Text: 'Text', TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity', TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  StyleSheet: { create: function (o) { return o; }, flatten: function (o) { return o; } },
  // 给键盘 hook 用：把监听器收下来，测试里手动发事件（真机 adb 弹不出输入法时的替代验法）
  Keyboard: {
    addListener: function (name, cb) {
      RNStub.__kb[name] = cb;
      return { remove: function () { delete RNStub.__kb[name]; } };
    }
  },
  __kb: {},
  Dimensions: { get: function () { return { width: 400, height: 800 }; } }
};
Module._load = function (request) {
  if (request === 'react-native') return RNStub;
  return origLoad.apply(this, arguments);
};
var React = require('react');
var TestRenderer = require('react-test-renderer');
var actFn = (typeof React.act === 'function') ? React.act : TestRenderer.act;
var AutoInput = require(path.join(root, 'rn', 'components', 'AutoInput.js')).AutoInput;

function mountInput(props) {
  var holder = null;
  actFn(function () { holder = TestRenderer.create(React.createElement(AutoInput, props)); });
  return holder;
}
function inputNode(h) { return h.root.findByType('TextInput'); }
function inputH(h) { return inputNode(h).props.style[1].height; }
// 隐藏测量文本：pointerEvents=none 的那个 Text（开关文案也是 Text，靠这条区分）
function measureNode(h) {
  return h.root.findAllByType('Text').filter(function (n) {
    return n.props && n.props.pointerEvents === 'none';
  })[0];
}
function fireWidth(h, w) {
  actFn(function () {
    inputNode(h).props.onLayout({ nativeEvent: { layout: { width: w, height: 40 } } });
  });
}
function fireSize(h, px) {
  actFn(function () {
    measureNode(h).props.onLayout({ nativeEvent: { layout: { width: 300, height: px } } });
  });
}
function textOf(h) {
  return h.root.findAllByType('Text').map(function (n) { return String(n.props.children); }).join('|');
}

// A. 叙事屏口径：1~5 行（行高 20 + 上下 10 ⇒ 下限 40 / 上限 120）
var a = mountInput({ value: '', minLines: 1, maxLines: 5, lineHeight: 20, paddingV: 10, style: {} });
fireWidth(a, 300);
eq('U-7af 真渲染·初始高度=一行下限（40）', inputH(a), 40);
fireSize(a, 100);
eq('U-7ag 真渲染·内容变高后跟内容走（100）', inputH(a), 100);
eq('U-7ah 真渲染·未超上限时内部滚动关闭（手势留给页面）', inputNode(a).props.scrollEnabled, false);
fireSize(a, 400);
eq('U-7ai 真渲染·超上限夹到 5 行（120）', inputH(a), 120);
eq('U-7aj 真渲染·超上限才开内部滚动', inputNode(a).props.scrollEnabled, true);
fireSize(a, 20);
eq('U-7ak 真渲染·内容变短自己缩回下限（回缩）', inputH(a), 40);

// B. 卡带库口径：默认收起 3 行（上限 80），点展开到 10 行（上限 220）
var b = mountInput({
  value: '', collapsedLines: 3, maxLines: 10, lineHeight: 20, paddingV: 10, style: {},
  toggleStyle: {}, toggleTextStyle: {}
});
fireWidth(b, 300);
eq('U-7al 真渲染·默认收起时高度=3 行上限（80）', inputH(b), 40);
check('U-7am 真渲染·空内容不显示展开开关', textOf(b).indexOf('展开') < 0);
fireSize(b, 400);
eq('U-7an 真渲染·收起态塞满：夹在 3 行（80）', inputH(b), 80);
check('U-7ao 真渲染·塞满后出现「展开 ▾」开关', textOf(b).indexOf('展开 ▾') >= 0);
actFn(function () { b.root.findByType('TouchableOpacity').props.onPress(); });
eq('U-7ap 真渲染·展开后上限抬到 10 行（220）', inputH(b), 220);
check('U-7aq 真渲染·展开态文案变「收起 ▴」', textOf(b).indexOf('收起 ▴') >= 0);
fireSize(b, 50);
actFn(function () { b.root.findByType('TouchableOpacity').props.onPress(); });
eq('U-7ar 真渲染·内容变短再收起 ⇒ 跟着内容落到 50', inputH(b), 50);
check('U-7as 真渲染·内容不多时开关自己消失', textOf(b).indexOf('展开') < 0);

// ---- C. 键盘 hook 真跑：手动发 didShow/didHide，看 inset 是否按纯函数判据走 ----
//   为什么这么测：真机（vivo V2118A）这台机器 adb 里连输入法都弹不出来（原本一个输入法都没选），
//   键盘避让只能这样验「事件 → 判据 → inset」这一条链；真机视觉仍要人手点一次。
var useKeyboardInset = require(path.join(root, 'rn', 'use_keyboard_inset.js')).useKeyboardInset;
function Harness() {
  return React.createElement('Text', { p42inset: useKeyboardInset() });
}
var hv = null;
actFn(function () { hv = TestRenderer.create(React.createElement(Harness)); });
function insetOf() { return hv.root.findByType('Text').props.p42inset; }
eq('U-7at 真渲染·键盘未弹时 inset=0', insetOf(), 0);
actFn(function () { RNStub.__kb['keyboardDidShow']({ endCoordinates: { height: 300 } }); });
eq('U-7au 真渲染·收到 didShow(300) 且窗口没被压短 ⇒ inset=300（叙事屏据此抬输入条）', insetOf(), 300);
actFn(function () { RNStub.__kb['keyboardDidHide']({}); });
eq('U-7av 真渲染·收到 didHide ⇒ inset 归零（输入条落回底部）', insetOf(), 0);
check('U-7aw 真渲染·卸载后监听器已摘掉（不留悬挂回调）',
  (actFn(function () { hv.unmount(); }), !RNStub.__kb['keyboardDidShow'] && !RNStub.__kb['keyboardDidHide']));

console.log('\nMOBILE_UX_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);

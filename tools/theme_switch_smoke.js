// ============================================================
// P19 · RN 切主题跨实例生效 smoke（用户 m05320 报「rn版本切主题不起作用」）
// 用法：cwd = RN 仓根 → node tools/theme_switch_smoke.js
//
// 背景：rn/use_theme.js 的 setTheme / setFontScale / setFont /
//   setBackground / clearBackground 只做**本地** bump（只刷新调用方
//   自己那个 useTheme 实例），而 tokens 的 useMemo 依赖 [rev]——即使
//   父组件重渲染把子控件一起重渲，子控件自己的 useTheme 实例 rev 没变，
//   仍旧返回**缓存的旧主题对象**。
//   真正画设置页控件的是 rn/components/settings/controls.js 里各自的
//   useTheme 实例（controls.js:36,43 useTk()）⇒ 点「主题」只有
//   GeneralTab 自己重算，控件颜色不变 = 玩家看到的「点了没反应」。
//   同文件的 bumpThemeRev() 模块级广播本来就是为这个场景做的
//   （ColorTab 改色路径已用它），但五个包装器没接上。
//
// 本测试不依赖真机：真 React + react-test-renderer 渲染消费者，
// 用 react-native 最小桩（Platform/View/Text/TouchableOpacity/…）。
//
// A. 两个 useTheme 消费者：调用方 setTheme 后，另一个消费者必须换
// B. 五个包装器全部要广播（本地 bump 不够）
// C. 真实控件 Controls.SetChips（独立实例）：手指点另一枚主题 chip，
//    存储真的换了、但控件配色必须跟着换成新主题色
// D. bumpThemeRev 在消费者卸载后仍安全（不炸）
// ============================================================

'use strict';

var path = require('path');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name + (detail ? (' :: ' + detail) : '')); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------- react-native 最小桩（只替掉 RN 宿主件，react 用真的） ----------
var Module = require('module');
var origLoad = Module._load;
var RNStub = {
  Platform: { OS: 'android' },
  View: 'View', Text: 'Text', TextInput: 'TextInput', Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity', TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image',
  ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', SafeAreaView: 'SafeAreaView',
  StyleSheet: {
    create: function (o) { return o; },
    flatten: function (o) { return o; },
    absoluteFill: {}
  }
};
Module._load = function (request) {
  if (request === 'react-native') return RNStub;
  return origLoad.apply(this, arguments);
};

// ---------- 内存 localStorage 后起真链（与 settings_smoke.js 同款） ----------
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; },
  clear: function () { mem = {}; }
};

require(path.join(root, 'rn', 'rn_bootstrap.js'));
var Theme = require(path.join(root, 'engine', 'theme.js'));
var TT = require(path.join(root, 'rn', 'theme_tokens.js'));
var UseTheme = require(path.join(root, 'rn', 'use_theme.js'));
var useTheme = UseTheme.useTheme;
var bumpThemeRev = UseTheme.bumpThemeRev;
var Controls = require(path.join(root, 'rn', 'components', 'settings', 'controls.js'));

var React = require('react');
var TestRenderer = require('react-test-renderer');
var actFn = (typeof React.act === 'function') ? React.act : TestRenderer.act;

function tokensOf(id) {
  var th = Theme.getBuiltin(id);
  return TT.buildStyleTokens(Theme.buildCssVars(th), {
    fontScale: th.fontScale != null ? th.fontScale : 1,
    platform: 'android'
  });
}

var FROM = 'paper-white';
var TO = 'midnight-blue';
var fromTk = tokensOf(FROM);
var toTk = tokensOf(TO);
check('前置：两套主题 token 颜色确实不同（primary / bg）',
  fromTk.colors.primary !== toTk.colors.primary && fromTk.colors.bg !== toTk.colors.bg,
  'from.primary=' + fromTk.colors.primary + ' to.primary=' + toTk.colors.primary);

Theme.setBuiltin(FROM);

// ============ A 组：两个 useTheme 消费者 ============
console.log('---- A 组：跨实例广播 ----');

var seen = {};
var renderCount = {};
function Consumer(props) {
  var api = useTheme();
  seen[props.id] = api;
  renderCount[props.id] = (renderCount[props.id] || 0) + 1;
  return React.createElement('view', { testID: props.id }, api.currentThemeId);
}

var inst;
actFn(function () {
  inst = TestRenderer.create(
    React.createElement('root', null,
      React.createElement(Consumer, { id: 'caller' }),
      React.createElement(Consumer, { id: 'other' }))
  );
});

eq('A1 初始两消费者同主题', seen.caller.currentThemeId + '/' + seen.other.currentThemeId, FROM + '/' + FROM);
eq('A2 初始两消费者同 primary', seen.caller.tokens.colors.primary + '/' + seen.other.tokens.colors.primary,
  fromTk.colors.primary + '/' + fromTk.colors.primary);

var otherRenders = renderCount.other;
actFn(function () { seen.caller.setTheme(TO); });

eq('A3 调用方 setTheme 后已换主题', seen.caller.currentThemeId, TO);
eq('A4 另一个已挂载消费者也换主题（跨实例广播）', seen.other.currentThemeId, TO);
eq('A5 另一个消费者的 token 颜色真的换了', seen.other.tokens.colors.primary, toTk.colors.primary);
check('A6 另一消费者确实被重渲染（render 次数 +' + (renderCount.other - otherRenders) + '）',
  renderCount.other > otherRenders);

// ============ B 组：五个包装器都要广播 ============
console.log('---- B 组：包装器广播覆盖 ----');

function probeBroadcast(name, fn) {
  var before = renderCount.other;
  var r;
  actFn(function () { r = fn(); });
  check(name + '：调用被接受（r.ok === true）', !!(r && r.ok === true),
    'actual=' + JSON.stringify(r));
  check(name + '：另一消费者被通知重渲染', renderCount.other > before,
    'render 次数 ' + before + ' → ' + renderCount.other);
}

probeBroadcast('B1 setFontScale', function () { return seen.caller.setFontScale(1.25); });
probeBroadcast('B2 setFont', function () { return seen.caller.setFont('serif', 'lxgw-wenkai'); });
probeBroadcast('B3 setBackground', function () { return seen.caller.setBackground({ image: 'x.png', opacity: 0.5 }); });
probeBroadcast('B4 clearBackground', function () { return seen.caller.clearBackground(); });
probeBroadcast('B5 setTheme', function () { return seen.caller.setTheme(FROM); });

// ============ C 组：真实控件（独立 useTheme 实例）+ 真手指路径 ============
console.log('---- C 组：controls.js SetChips 真实渲染 ----');

Theme.setBuiltin(FROM);

var THEME_OPTS = [
  { value: 'paper-white', label: '纸白' },
  { value: 'midnight-blue', label: '午夜蓝' }
];
function ThemeChips() {
  // 与 GeneralTab.js:376-380 同构：父层自己 useTheme 拿 value + onChange
  var api = useTheme();
  return React.createElement(Controls.SetChips, {
    options: THEME_OPTS,
    value: api.currentThemeId,
    onChange: api.setTheme
  });
}

var inst2;
actFn(function () { inst2 = TestRenderer.create(React.createElement(ThemeChips)); });

function chipBgs(instX) {
  return instX.root.findAllByType('TouchableOpacity').map(function (n) { return n.props.style.backgroundColor; });
}

var bgsBefore = chipBgs(inst2);
check('C1 chip 两枚（纸白活动 / 午夜蓝未活动）',
  inst2.root.findAllByType('TouchableOpacity').length === 2 &&
  inst2.root.findAllByType('TouchableOpacity')[0].props.style.backgroundColor === fromTk.colors.primary &&
  inst2.root.findAllByType('TouchableOpacity')[1].props.style.backgroundColor === fromTk.colors.bgCard,
  'actual=' + JSON.stringify(bgsBefore));

// 真手指：点第二枚「午夜蓝」
var chips = inst2.root.findAllByType('TouchableOpacity');
actFn(function () { chips[1].props.onPress(); });

eq('C2 点击后存储里的主题确实换了（engine/theme.js 写成功）', Theme.getActive().id, TO);
check('C3 点击后活动 chip 换成新主题色（primary）',
  inst2.root.findAllByType('TouchableOpacity')[1].props.style.backgroundColor === toTk.colors.primary,
  'actual=' + JSON.stringify(chipBgs(inst2)) + ' expected[1]=' + toTk.colors.primary);
check('C4 未活动 chip 底色也换成新主题 bgCard',
  inst2.root.findAllByType('TouchableOpacity')[0].props.style.backgroundColor === toTk.colors.bgCard,
  'actual=' + JSON.stringify(chipBgs(inst2)) + ' expected[0]=' + toTk.colors.bgCard);

// ============ D 组：卸载后广播安全 ============
console.log('---- D 组：卸载后广播安全 ----');
actFn(function () { inst.unmount(); });
actFn(function () { inst2.unmount(); });
var threw = null;
try { actFn(function () { bumpThemeRev(); }); } catch (e) { threw = e && e.message; }
check('D1 全部消费者卸载后 bumpThemeRev 不抛异常' + (threw ? ('（' + threw + '）') : ''), threw === null);

console.log('----');
console.log(ok + ' ok, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);

// ============================================================
// 战役 4 · 批次 4-1：useTheme · RN 主题 hook（B 类，依赖 React）
// RN 独有。消费双仓共享的 engine/theme.js（纯 A 类）+ 4-1 的
// buildStyleTokens，给 RN 页面提供当前主题 tokens 与切换方法。
//
// 返回：{ tokens, theme, currentThemeId, setTheme, setFontScale, setFont,
//         setBackground, clearBackground }
// - theme：Theme.getActive() 当前主题完整对象（已含 custom/overrides/
//   backgroundOverrides/fontScale/fontIds 全部 Electron 同构逻辑）
// - tokens：buildStyleTokens(Theme.buildCssVars(theme)) 的 RN 样式 tokens
// - currentThemeId：当前主题 id（内置 9 选 1，或 'custom'）
// - setTheme(id)：委托 Theme.setBuiltin（同步写 Storage），成功后刷新
// - setFontScale(v)/setFont(kind,id)：4-5a 增量。Theme.setFontScale/
//   setFont 是 Theme 层直写 Storage，不会触发本 hook 的 rev——包装后
//   成功即 bump，否则字号/字体改动后 tokens 不重算，页面不更新。
//
// 数据链与 Electron 完全同源：Storage（4-4 polyfill/op-sqlite）→
// Storage.getGlobal().settings.theme → Theme.getActive()，RN 不另建
// 主题状态存储。
// ============================================================

'use strict';

var React = require('react');
var RNPlatform = require('react-native').Platform;
var Theme = require('../engine/theme.js');
var buildStyleTokens = require('./theme_tokens.js').buildStyleTokens;

// P19（用户 m05320「切主题不起作用」）：下面五个包装器除本地 bump 外
// 必须再调 bumpThemeRev()。只本地 bump 时，别的 useTheme 实例 rev 不变，
// tokens 的 useMemo 依赖 [rev] 仍返回缓存的旧主题对象——父层重渲染把
// 子控件一起重渲也没用（controls.js 的控件正是独立实例）。
// P1-A：模块级 rev 广播。Theme.setColorOverride / clearOverrides /
// importTheme / loadSlot 等直写 Storage 的路径不经本 hook 包装，单个
// useTheme 实例的本地 bump 只刷新自己——改色后其它页面不重算 tokens。
// bumpThemeRev() 通知所有已挂载的 useTheme 消费者各 bump 一次本地 rev。
var themeRevListeners = [];
function bumpThemeRev() {
  themeRevListeners.slice().forEach(function (fn) {
    try { fn(); } catch (e) { /* 单个消费者异常不阻断其余 */ }
  });
}

function useTheme() {
  var useState = React.useState;
  var useMemo = React.useMemo;
  var useCallback = React.useCallback;

  // rev 仅作切换后的重算信号；主题源真相在 Storage/Theme。
  var revState = useState(0);
  var rev = revState[0];
  var bump = revState[1];

  // P1-A：挂进模块级广播（见上），卸载时摘除
  React.useEffect(function () {
    function onRev() { bump(function (v) { return v + 1; }); }
    themeRevListeners.push(onRev);
    return function () {
      var i = themeRevListeners.indexOf(onRev);
      if (i >= 0) themeRevListeners.splice(i, 1);
    };
  }, [bump]);

  var theme = useMemo(function () {
    try {
      return Theme.getActive();
    } catch (e) {
      // 极端情况下 Storage 不可用：退回内置第一主题，渲染不炸
      return Theme.getBuiltin('paper-white') || Theme.BUILTIN_THEMES[0];
    }
  }, [rev]);

  var tokens = useMemo(function () {
    var vars = Theme.buildCssVars(theme);
    return buildStyleTokens(vars, {
      fontScale: theme.fontScale != null ? theme.fontScale : 1,
      platform: RNPlatform.OS
    });
  }, [theme]);

  var setTheme = useCallback(function (id) {
    var r = Theme.setBuiltin(id);
    if (r && r.ok) { bump(function (v) { return v + 1; }); bumpThemeRev(); }
    return r;
  }, [bump]);

  // 4-5a：字号/字体包装（Theme 层直写不触发 rev，见文件头注释）
  var setFontScale = useCallback(function (value) {
    var r = Theme.setFontScale(value);
    if (r && r.ok) { bump(function (v) { return v + 1; }); bumpThemeRev(); }
    return r;
  }, [bump]);

  var setFont = useCallback(function (kind, fontId) {
    var r = Theme.setFont(kind, fontId);
    if (r && r.ok) { bump(function (v) { return v + 1; }); bumpThemeRev(); }
    return r;
  }, [bump]);

  // 4-6c：背景包装（裁决 6）。Theme.setBackground/clearBackground 同为
  // Theme 层直写 Storage，不触发 rev——包装后 r.ok 即 bump，与
  // setFontScale/setFont 同一手法，否则背景改动后 tokens 不重算。
  var setBackground = useCallback(function (patch) {
    var r = Theme.setBackground(patch);
    if (r && r.ok) { bump(function (v) { return v + 1; }); bumpThemeRev(); }
    return r;
  }, [bump]);

  var clearBackground = useCallback(function () {
    var r = Theme.clearBackground();
    if (r && r.ok) { bump(function (v) { return v + 1; }); bumpThemeRev(); }
    return r;
  }, [bump]);

  return {
    tokens: tokens,
    theme: theme,
    currentThemeId: theme.id || 'paper-white',
    setTheme: setTheme,
    setFontScale: setFontScale,
    setFont: setFont,
    setBackground: setBackground,
    clearBackground: clearBackground
  };
}

module.exports = { useTheme: useTheme, bumpThemeRev: bumpThemeRev };

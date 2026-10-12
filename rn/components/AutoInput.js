// ============================================================
// P42（用户 m09047）· AutoInput：会自己长高、也能自己收回去的多行输入框。
//   为什么需要它：
//     ① TextInput 写死高度 ⇒ 玩家打字时看不到自己在打什么（单行更是一条到底）；
//     ② 多行框默认 scrollEnabled=true ⇒ 竖直拖动被输入框吃掉，页面（卡带库）滑不动；
//     ③ 想扩充却没人管 ⇒ 长文只能在小框里挤。
//   规则：内容 ≤ 上限时高度跟着内容走（此时关闭内部滚动，手势交给外层页面）；
//         超过上限才开内部滚动（不会长成整屏）；
//         传了 collapsedLines 就多一个「展开 / 收起」开关（默认收起）。
//
//   高度怎么量：真机实测（vivo V2118A / Android，RN 0.87 Fabric）两条路都不行 ——
//     ① 光靠 minHeight/maxHeight 不写 height：原生 EditText 在行内 flex 布局里不会自己长
//        （打 216 个字符，uiautomator 量到的框高仍是 113px = 一行）；
//     ② onContentSizeChange：报回来的是「视图高度」而不是文本高度，和我们写进去的 height
//        互相喂 ⇒ 在 36/53 之间来回震荡，框永远长不起来。
//   ⇒ 改用「隐藏测量文本」：与输入框同宽同字体、absolute + opacity:0 + pointerEvents:none，
//      用它的 onLayout 高度当内容高度（不参与布局，也不吃触摸）。
//
// 写法纪律：本文件**不用 JSX**，全部 React.createElement。
//   原因：手机仓的纯 Node 冒烟（tools/theme_switch_smoke.js、tools/mobile_ux_smoke.js）
//   也会 require 到它（components/settings/controls.js 的依赖链），而 Node 不认 JSX。
//   P42 首版写成 JSX，theme_switch_smoke 当场红「SyntaxError: Unexpected token '<'」。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var TextInput = RN.TextInput;
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var Metrics = require('../ui_input_metrics.js');

function AutoInput(props) {
  var lineH = props.lineHeight || 22;
  var padV = props.paddingV == null ? 8 : props.paddingV;
  var minH = props.minHeight != null
    ? props.minHeight
    : Metrics.linesToHeight(props.minLines || 1, lineH, padV);
  var maxH = props.maxHeight != null
    ? props.maxHeight
    : Metrics.linesToHeight(props.maxLines || 6, lineH, padV);
  var collapseLines = props.collapsedLines || 0;
  var capH = collapseLines > 0 ? Metrics.linesToHeight(collapseLines, lineH, padV) : maxH;

  var expandedState = React.useState(collapseLines > 0 ? false : true);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];

  var sizeState = React.useState(0);
  var contentH = sizeState[0];
  var setContentH = sizeState[1];

  var widthState = React.useState(0);
  var inputW = widthState[0];
  var setInputW = widthState[1];

  var effMax = expanded ? maxH : capH;
  var fit = Metrics.clampHeight(contentH || minH, minH, effMax);
  var canToggle = collapseLines > 0 && (expanded || fit.clipped || contentH > capH + 1);

  var input = React.createElement(TextInput, {
    style: [props.style, { height: fit.height }],
    value: props.value,
    onChangeText: props.onChangeText,
    placeholder: props.placeholder,
    placeholderTextColor: props.placeholderTextColor,
    multiline: true,
    textAlignVertical: 'top',
    scrollEnabled: fit.clipped,
    onLayout: function (e) {
      var w = e && e.nativeEvent && e.nativeEvent.layout ? e.nativeEvent.layout.width : 0;
      if (w && w !== inputW) setInputW(w);
    },
    editable: props.editable,
    autoFocus: props.autoFocus,
    keyboardType: props.keyboardType,
    returnKeyType: props.returnKeyType,
    onBlur: props.onBlur,
    onFocus: props.onFocus,
    onSelectionChange: props.onSelectionChange,
    selection: props.selection
  });

  // 隐藏测量文本：同宽同字体，只在 onLayout 里把「文本实际占多高」回报上来。
  var measure = React.createElement(Text, {
    style: [props.style, {
      position: 'absolute',
      left: 0,
      top: 0,
      width: inputW > 0 ? inputW : undefined,
      opacity: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      height: undefined,
      minHeight: undefined,
      maxHeight: undefined
    }],
    pointerEvents: 'none',
    onLayout: function (e) {
      var h = e && e.nativeEvent && e.nativeEvent.layout ? e.nativeEvent.layout.height : 0;
      if (h && h !== contentH) setContentH(h);
    }
  }, (props.value && String(props.value).length) ? String(props.value) : ' ');

  var toggle = null;
  if (canToggle) {
    toggle = React.createElement(
      TouchableOpacity,
      {
        style: props.toggleStyle,
        activeOpacity: 0.6,
        onPress: function () { setExpanded(!expanded); }
      },
      React.createElement(Text, { style: props.toggleTextStyle },
        expanded ? (props.collapseText || '收起 ▴') : (props.expandText || '展开 ▾'))
    );
  }

  // 没有开关时不套外层 View：调用方给输入框的 flex 必须原样生效（P42 第一版套了 View，
  // 结果叙事屏的「发送」按钮被挤出屏幕 —— 真机 dump 里只剩「掷骰」）。
  if (!toggle) {
    return React.createElement(React.Fragment, null, input, measure);
  }
  return React.createElement(View, { style: props.wrapStyle }, input, toggle, measure);
}

module.exports = { AutoInput: AutoInput };

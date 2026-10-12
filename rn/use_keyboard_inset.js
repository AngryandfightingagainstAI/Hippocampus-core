// ============================================================
// P42（用户 m09047）· 键盘避让：算出输入条还需要补多少底部内边距。
//   背景：Android targetSdk 36 起强制 edge-to-edge，Manifest 里的
//   adjustResize 不再缩窗口 ⇒ 键盘直接盖住底部输入条，玩家打字时看不到自己打的字。
//   判据交给 rn/ui_input_metrics.js（纯函数，可被冒烟守卫直接验）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var Keyboard = RN.Keyboard;
var Dimensions = RN.Dimensions;
var Platform = RN.Platform;

var Metrics = require('./ui_input_metrics.js');

function useKeyboardInset() {
  var state = React.useState(0);
  var inset = state[0];
  var setInset = state[1];

  React.useEffect(function () {
    var baseH = Dimensions.get('window').height;
    var showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    var hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    var subShow = Keyboard.addListener(showEvt, function (e) {
      var kb = e && e.endCoordinates ? e.endCoordinates.height : 0;
      var now = Dimensions.get('window').height;
      var ins = Metrics.resolveKeyboardInset(kb, baseH, now);
      setInset(ins);
    });
    var subHide = Keyboard.addListener(hideEvt, function () {
      setInset(0);
    });

    return function () {
      try { if (subShow && subShow.remove) subShow.remove(); } catch (e1) {}
      try { if (subHide && subHide.remove) subHide.remove(); } catch (e2) {}
    };
  }, []);

  return inset;
}

module.exports = { useKeyboardInset: useKeyboardInset };

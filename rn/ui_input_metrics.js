// ============================================================
// P42（用户 m09047）· 输入框度量：纯 JS，不 require react-native。
//   放这里的唯一原因：让 tools/mobile_ux_smoke.js 能在没有真机、
//   没有 RN 运行时的情况下把「长高 / 收住 / 键盘补多少」这三条判据钉死。
// ============================================================

'use strict';

// 多行输入框：把实测内容高度夹进 [minH, maxH]
//   返回 { height, clipped }
//   clipped = true 表示内容比上限还高 ⇒ 由输入框自己内部滚（外层滚动交还页面）
function clampHeight(contentH, minH, maxH) {
  var lo = Math.max(0, Math.round(Number(minH) || 0));
  var hi = Math.round(Number(maxH) || 0);
  if (!(hi > lo)) hi = lo;              // 上限小于下限时不反转，按单行算
  var h = Math.round(Number(contentH) || 0);
  if (h < lo) h = lo;
  var clipped = h > hi;
  if (clipped) h = hi;
  return { height: h, clipped: clipped };
}

// 行数 → 高度：行高 × 行数 + 上下内边距，最少一行
function linesToHeight(lines, lineH, padV) {
  var n = Math.max(1, Math.round(Number(lines) || 1));
  var lh = Math.max(1, Math.round(Number(lineH) || 20));
  var pad = Math.max(0, Math.round(Number(padV) || 0)) * 2;
  return n * lh + pad;
}

// 键盘要不要再补底部内边距
//   keyboardH 键盘高度 · baseH 键盘弹出前的窗口高 · nowH 当前窗口高
//   系统/RN 已经把窗口压短（差值与键盘高相当）⇒ 返回 0，
//   否则（Android targetSdk 36 强制 edge-to-edge 时 adjustResize 不缩窗口）
//   返回键盘高度，由调用方给输入条补 paddingBottom。
function resolveKeyboardInset(keyboardH, baseH, nowH) {
  var kb = Math.max(0, Math.round(Number(keyboardH) || 0));
  if (!kb) return 0;
  var base = Math.round(Number(baseH) || 0);
  var now = Math.round(Number(nowH) || 0);
  if (base > 0 && now > 0 && base - now >= kb * 0.8) return 0;
  return kb;
}

module.exports = {
  clampHeight: clampHeight,
  linesToHeight: linesToHeight,
  resolveKeyboardInset: resolveKeyboardInset
};

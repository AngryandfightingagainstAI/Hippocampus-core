// ============================================================
// P10·A4 · 存储告警（A 类，零 React / 零 RN API）
// 桌面锚点：engine/mobile.js:132-140（checkStorage 阈值 + 文案）
//   与 :154-155（init 里 setTimeout 3s 一次 + setInterval 每 5 分钟）。
// 桌面读 StorageAdapter.estimateBytes()，RN 同（bootstrap 挂载全局）；
// 提示走 Platform.ui.toast（收口到 story_store.pushToast），
// 文案逐字照桌面 :138：'存储已用 ' + mb.toFixed(1) + 'MB，建议导出备份'。
// 触发时机等价：启动 3s 后一次 + 每 5 分钟一次 + 每次回前台一次
// （桌面靠页面常驻，RN 靠 Platform.lifecycle.onForeground = AppState active）。
// 只告警一次（warned 幂等，对齐桌面 window._storageWarned）。
// ============================================================

'use strict';

var THRESHOLD_MB = 4;               // 桌面 mobile.js:136 `mb > 4`
var START_DELAY_MS = 3000;          // 桌面 mobile.js:154 setTimeout(checkStorage, 3000)
var CHECK_INTERVAL_MS = 5 * 60 * 1000; // 桌面 mobile.js:155 每 5 分钟

var warned = false;

// 返回本次实测 MB（便于断言）；超阈值且未告警过 ⇒ 弹一次 toast。
function checkStorage() {
  var total = 0;
  try {
    if (typeof StorageAdapter !== 'undefined' && StorageAdapter
      && typeof StorageAdapter.estimateBytes === 'function') {
      total = Number(StorageAdapter.estimateBytes()) || 0;
    }
  } catch (e) { /* 估算失败按 0，不告警 */ }
  var mb = total / 1024 / 1024;
  if (mb > THRESHOLD_MB && !warned) {
    warned = true;
    try {
      Platform.ui.toast('存储已用 ' + mb.toFixed(1) + 'MB，建议导出备份', { type: 'warn' });
    } catch (e2) { /* toast 失败不影响启动链 */ }
  }
  return mb;
}

// 启动接线：3s 后一次 + 每 5 分钟 + 回前台一次。
function start() {
  setTimeout(checkStorage, START_DELAY_MS);
  setInterval(checkStorage, CHECK_INTERVAL_MS);
  try {
    if (typeof Platform !== 'undefined' && Platform.lifecycle
      && typeof Platform.lifecycle.onForeground === 'function') {
      Platform.lifecycle.onForeground(checkStorage);
    }
  } catch (e) { /* lifecycle 不可用则退化为定时检查 */ }
}

// 测试复位（smoke 用）
function reset() { warned = false; }

module.exports = {
  THRESHOLD_MB: THRESHOLD_MB,
  START_DELAY_MS: START_DELAY_MS,
  CHECK_INTERVAL_MS: CHECK_INTERVAL_MS,
  checkStorage: checkStorage,
  start: start,
  reset: reset
};

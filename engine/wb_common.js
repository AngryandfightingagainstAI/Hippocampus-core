// ============================================================
// 世界书编辑器通用工具（RN 侧纯逻辑，A 类：零 React / 零 RN API / 零 DOM）
// 纯逻辑逐字搬自桌面 worldbook/wb_common.js：
//   WB.esc :8 / WB.uid :14 / WB.load :19 / WB.persist :28 / WB.DirtyGuard :100
// 不搬这些 HTML 字符串生成器（RN 用组件渲染，任务书 S3 明列）：
//   WB.row :48 / WB.input :52 / WB.textarea :56 / WB.number :60 /
//   WB.checkbox :65 / WB.msg :71 / WB.toolbar :83 / WB.listItem :91
//   （连同文件尾 :114-124 的样式注入 IIFE 一并舍弃）
// 三处必要适配：
//   1. window.WB → var WB + 文件尾双态导出（同 theme.js / num_editor.js 范式）；
//   2. window.Storage → 裸全局 Storage（RN 引擎模块统一口径）；
//   3. WB.DirtyGuard.checkAny 的 UI.confirmAsync 加 typeof 兜底，
//      Node smoke（无 UI）时为「有脏数据 → false」，不抛。
// ============================================================

'use strict';

var WB = {};

// 桌面 wb_common.js:8-12 逐字
WB.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
};

// 桌面 wb_common.js:14-16 逐字
WB.uid = function (prefix) {
  return (prefix || 'id') + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
};

// 从卡带读一个世界书字段（桌面 wb_common.js:19-25 逐字，Storage 走裸全局）
WB.load = function (cardId, key, defaultValue) {
  var card = Storage.getAllCards()[cardId];
  if (!card || !card.worldbook) return defaultValue;
  var v = card.worldbook[key];
  if (v == null) return defaultValue;
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
};

// 写世界书字段。key 可以是字符串（写一个），也可以是对象（写多个）
// 桌面 wb_common.js:28-46 逐字
WB.persist = function (cardId, keyOrObj, value) {
  var card = Storage.getAllCards()[cardId];
  if (!card) return false;
  var cardCopy = JSON.parse(JSON.stringify(card));
  if (!cardCopy.worldbook) cardCopy.worldbook = {};

  if (typeof keyOrObj === 'string') {
    cardCopy.worldbook[keyOrObj] = value;
  } else if (keyOrObj && typeof keyOrObj === 'object') {
    Object.keys(keyOrObj).forEach(function (k) {
      cardCopy.worldbook[k] = keyOrObj[k];
    });
  }

  var imported = Storage.getImportedCards();
  imported[cardId] = cardCopy;
  Storage.setImportedCards(imported);
  return true;
};

// 通用：脏标记 + 切 tab 前提醒（桌面 wb_common.js:100-113）
WB.DirtyGuard = {
  _dirtyMap: {},
  mark: function (editorName) { this._dirtyMap[editorName] = true; },
  clear: function (editorName) { this._dirtyMap[editorName] = false; },
  // RN 适配：UI.confirmAsync 缺席（Node smoke）时按「有脏 → 不允许切」返回 false
  checkAny: function () {
    var names = Object.keys(this._dirtyMap);
    var dirty = [];
    for (var i = 0; i < names.length; i++) {
      if (this._dirtyMap[names[i]]) dirty.push(names[i]);
    }
    if (dirty.length === 0) return Promise.resolve(true);
    if (typeof UI === 'undefined' || !UI || typeof UI.confirmAsync !== 'function') {
      return Promise.resolve(false);
    }
    return UI.confirmAsync('有未保存的修改（' + dirty.join('、') + '），确定切换？');
  }
};

// RN 侧导出（同 theme.js / num_editor.js 双态范式）
if (typeof window !== 'undefined') window.WB = WB;
if (typeof module !== 'undefined' && module.exports) module.exports = WB;

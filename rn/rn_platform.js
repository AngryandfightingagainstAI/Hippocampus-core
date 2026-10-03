// ============================================================
// RN Platform 实装 · 战役 2 · 批次 2-5b（RN 侧唯一允许的新代码）
// 落点（已批盘点表 2）：
//   http                  → 透传 RN 全局 fetch；
//   dialog.alert          → console.warn + 事件数组（同步签名 void，不 import Alert）；
//   dialog.confirm        → stub return false（战役 3 换 Alert + Promise）；
//   lifecycle.onForeground→ AppState active；
//   lifecycle.onBackground→ AppState background（inactive 故意不触发，防误存）；
//   lifecycle.onPageHide  → 与 background 合并触发（RN 无 pagehide，
//                           "存档最后防线"语义挂到真实后台切换上）；
//   image.compressFile    → 4-6 已实装（compressFileImpl，见下）；本行原为
//                           「RN 未实装」占位注释，P6·S4-3 更正；
//   ui.* 21 接口          → 4-2/4-3 起已逐键桥接（导航/叙事族壳，
//                           见 bridgeNavigation / buildUiShell），原「战役 3
//                           桥接层覆盖」为计划期注释，P6·S4-3 更正。
//
// 合并形态（install）：对搬运来的 Platform 对象"就地浅合并"——
//   1) http/dialog/image/lifecycle 四组整体替换为 RN 实装；
//   2) ui 组逐键合并：21 个 RN 壳无条件记日志/记调用，同时委托保留搬运实现
//      （如 ui.openShop 的 UI_Shop 转发）；base 返回 null/false 时壳返回 false，
//      保持"未投递"语义；base 未来有真实有效返回则透传；
//   3) 就地变更而非换对象：require 缓存（如 shop.js 加载期捕获）、
//      window.Platform、globalThis.Platform 三条引用路径全部指向同一对象。
// 搬运文件零改动，一切覆盖只发生在本文件 + bootstrap 挂载层。
// ============================================================

'use strict';

var AppState = null;
try {
  // 字面量 require，Metro 可静态收集；react-native 为 RN 仓内置依赖
  AppState = require('react-native').AppState;
} catch (e) {
  AppState = null;
}

// 战役 4 · 4-2：导航桥接单例（A 类，零 React 依赖，Node 下同样可装载）。
// 装载失败（极端环境）时 4 个壳退回纯日志 no-op，业务调用路径不炸。
var NavStore = null;
try {
  NavStore = require('./nav_store.js');
} catch (eNav) {
  NavStore = null;
}

// ============================================================
// 战役 4 · 4-6：image.compressFile 实装（方案 B：File/asset 双形态归一）
//
// Electron 基准（platform_adapter.js L50-88）：
//   FileReader → dataURL → Image 解码 w/h → 等比缩放 → canvas
//   → toDataURL('image/jpeg', quality) → bytes 估算
//   → 超 maxBytes 用 fallbackQuality 重压一次
//   返回 { src: 完整 dataURL, bytes, w: nw, h: nh }
//   Error：'没有文件' / '不是图片文件' / '图片解析失败' / '文件读取失败'
//
// RN 实装（批次 E · 2026-09-28 改写）：
//   原计划 expo-image-manipulator manipulateAsync 替代 canvas，但 G9-5 实测
//   真包与 RN 0.87 不兼容（expo SDK 57 面向 RN 0.86，expo-asset/build/Asset.js:1
//   引用 RN 0.87 已移除的 @react-native/assets-registry/registry，红屏实锤
//   g9_shots/G9-boot-02.png）。
//   批次 E 真解：压缩前移到 picker 原生实现（launchImageLibrary 的
//   maxWidth/maxHeight/quality 在系统选择器内做尺寸 + JPEG 质量压缩），
//   compressFileImpl 改为 base64 直收 + bytes 估算 + oversize 标记，
//   不再有第二趟可压。
//   bytes 估算仍用 base64 长度 0.75 系数（与 Electron 同算法）。
//   '文件读取失败' 为 FileReader 独有，RN 路径合并为 '图片解析失败'；
//   无 base64（File 形态或 picker 未 includeBase64）亦走 '图片解析失败'，
//   保 image_smoke B6 语义（39 项断言一条不改）。
//
// 纯函数（A 类，Node 可直测，image_smoke A 组直测导出）：
//   calcFit(w, h, maxSize)           → {nw, nh}（等比，不放大）
//   estimateDataUrlBytes(dataUrl)    → bytes（0.75 系数同 Electron）
//   selectQuality(bytes, maxBytes, quality, fallbackQuality)
//     → { quality, secondPass } 两级质量决策
//   注：calcFit/selectQuality 自批次 E 起 compressFileImpl 不再调用，
//   但仍导出（A 组断言不改）；保留为 Electron 端压缩算法的参考实现，
//   后续 RN 侧若引入真压缩（如原生 canvas / expo-image）可直接复用。
// ============================================================

function calcFit(w, h, maxSize) {
  if (!w || !h || w <= 0 || h <= 0) return { nw: 0, nh: 0 };
  var scale = Math.min(1, maxSize / Math.max(w, h));
  return { nw: Math.round(w * scale), nh: Math.round(h * scale) };
}

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  var comma = dataUrl.indexOf(',');
  var head = comma >= 0 ? comma + 1 : 0;
  return Math.round((dataUrl.length - head) * 0.75);
}

function selectQuality(bytes, maxBytes, quality, fallbackQuality) {
  if (bytes > maxBytes) {
    return { quality: fallbackQuality, secondPass: true };
  }
  return { quality: quality, secondPass: false };
}

// image-picker asset 形态识别：有 uri 即视为 asset；否则按 File 形态
function normalizeImageInput(file) {
  if (!file || typeof file !== 'object') return null;
  // 守卫：'不是图片文件' —— File 形态查 type，asset 形态查 type 或文件名后缀
  var type = file.type || '';
  if (type && typeof type === 'string' && type.indexOf('image/') !== 0) {
    return { err: '不是图片文件' };
  }
  if (!type) {
    // asset 无 type 时按文件名后缀兜底
    var name = file.fileName || file.name || file.uri || '';
    if (!/\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(name)) {
      return { err: '不是图片文件' };
    }
  }
  var uri = file.uri || null;
  if (!uri) return { err: '没有文件' };
  return {
    uri: uri,
    // asset 自带原始尺寸；File 形态 RN 无法预读（无 FileReader），由
    // manipulator 返回的 width/height 回填，此处先取 asset 声明值
    width: typeof file.width === 'number' ? file.width : 0,
    height: typeof file.height === 'number' ? file.height : 0
  };
}

function compressFileImpl(file, opts) {
  var o = Object.assign({
    maxSize: 256,
    quality: 0.8,
    fallbackQuality: 0.6,
    maxBytes: 81920
  }, opts || {});

  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('没有文件')); return; }
    var input = normalizeImageInput(file);
    if (!input) { reject(new Error('没有文件')); return; }
    if (input.err) { reject(new Error(input.err)); return; }

    // 批次 E（2026-09-28）：expo-image-manipulator 真包与 RN 0.87 不兼容，
    // 已摘依赖（npm uninstall）。压缩前移到 launchImageLibrary 系统选择器
    // 原生实现（maxWidth/maxHeight/quality），asset.base64 由 picker 直接返回。
    // 本函数仅做：dataURL 组装 + bytes 估算 + oversize 标记，不再有第二趟可压。
    // 旧实装的 manipulateAsync 两趟压缩链路（含 fallbackQuality 二趟）整体移除；
    // 纯函数 calcFit/selectQuality 仍导出（image_smoke A 组断言不改），保留为
    // Electron 端压缩算法参考实现，后续 RN 侧若引入真压缩可直接复用。
    // 无 base64（File 形态或 picker 未 includeBase64）→ '图片解析失败'，
    // 保 image_smoke B6 语义（39 项断言一条不改）。
    if (!file.base64) {
      reject(new Error('图片解析失败'));
      return;
    }

    var src = 'data:image/jpeg;base64,' + file.base64;
    var bytes = estimateDataUrlBytes(src);
    var w = (typeof file.width === 'number') ? file.width : 0;
    var h = (typeof file.height === 'number') ? file.height : 0;
    var oversize = bytes > o.maxBytes;
    resolve({ src: src, bytes: bytes, w: w, h: h, oversize: oversize });
  });
}

// 战役 4 · 4-3：叙事页状态仓库（A 类）。装载失败时叙事族壳退回纯日志
// no-op（confirmAsync 此时无 Promise 可给——仅极端环境，bootstrap 正常链必装）。
var StoryStore = null;
try {
  StoryStore = require('./story_store.js');
} catch (eStory) {
  StoryStore = null;
}

// 战役 4 · 4-3c：提议卡交互（A 类）。装载失败时提议卡壳退回 no-op。
var StoryProposals = null;
try {
  StoryProposals = require('./story_proposals.js');
} catch (eProp) {
  StoryProposals = null;
}

// 战役 4 · 4-6b：商店状态仓库（A 类）。装载失败时 openShop 壳退回纯日志
// no-op（同 4-2 导航桥防御范式）。
var ShopStore = null;
try {
  ShopStore = require('./shop_store.js');
} catch (eShop) {
  ShopStore = null;
}

// UI 收口 21 接口（20 NAMES + openShop，口径与 platform_adapter.js 一致；
// renderChapterHead 为 2026-09-25 契约漏登补登、showGame 为 2026-09-27
// 空头契约删除，均与 Electron 仓同批同步）
var UI_NAMES = [
  'toast', 'appendHint', 'fillIcons', 'confirmAsync',
  'showScreen', 'appendStory', 'appendDiceResult',
  'setBusy', 'showStoryLoading', 'renderTopbar',
  'renderSidebarExpanded', 'appendProposalCard', 'updateTokenBadge',
  'showStoryError', '_currentRoundNum', 'showSettingsTab',
  'showHome', 'renderGame', 'renderChapterHead', 'clearStory',
  'openShop'
];

var MAX_RECORDS = 300;

function safePreview(args) {
  try {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a == null) parts.push(String(a));
      else if (typeof a === 'object') {
        try { parts.push(JSON.stringify(a)); }
        catch (e2) { parts.push('[object]'); }
      } else {
        parts.push(String(a));
      }
    }
    return parts.join(', ').slice(0, 200);
  } catch (e3) {
    return '[unserializable]';
  }
}

// P9·S10：fillIcons 在 RN 侧为「故意 no-op」——RN 无 Electron 那套 <svg> 图标体系，
//   故 buildUiShell 对该键与其他键一样返回 false。引擎侧 4 处调用点
//   （runtime_repair.js:405 / card_diagnose.js:618 / audit.js:363 / classify.js:305）
//   保留不动；语义 = 「已接、RN 无图标体系、故意不做事」，不再"看像接上了"。
function buildUiShell() {
  var calls = [];
  var shell = {};
  shell.__calls = calls;
  UI_NAMES.forEach(function (name) {
    shell[name] = function () {
      try {
        calls.push({ name: name, ts: Date.now(), argc: arguments.length });
        if (calls.length > MAX_RECORDS) calls.shift();
        console.log('[Platform.ui] ' + name + '(' + safePreview(arguments) + ')');
      } catch (recErr) {
        // 记录失败不得影响业务调用路径
      }
      return false; // RN 侧 2-5 阶段一律"未投递"，战役 3 桥接层逐键覆盖
    };
  });
  return shell;
}

function mergeUi(baseUi, shell) {
  var merged = {};
  var k;
  // 先保留搬运实现已定义的全部键
  if (baseUi && typeof baseUi === 'object') {
    Object.keys(baseUi).forEach(function (key) {
      if (key !== '__calls') merged[key] = baseUi[key];
    });
  }
  // 21 个 RN 壳覆盖同键：日志/记录无条件发生（返回 false，丢弃）。
  //
  // 2026-10-01 P8 根因修复：RN 侧 ui 壳不再"委托 base 的 DOM 转发桩"。
  // 搬运实现 platform_adapter.js:144-151 的每个 ui 方法都转发裸全局 UI：
  //     ui[name] = function () { return UI[name].apply(UI, arguments); };
  // 而 rn_bootstrap.js:136 为了让 engine 里裸引用 UI 的模块（wb_common
  // DirtyGuard.checkAny 等）拿到 RN 行为，把 UI 指到了 Platform.ui 本身
  // ⇒ Platform.ui.X → base(X) → UI.X（同一函数）→ Platform.ui.X 无限自递归，
  // 直到栈溢出（真机 Hermes 约 269 层；Node 约 2600 层，探针实测一次逻辑
  // appendHint 触发 2462 次 store 写入）。mergeUi 的 bridge 包装在每一层都会
  // 再跑一次，故一次逻辑调用会扇出约 269 次叙事入队 ⇒ 叙事页堆满重复提示行。
  // RN 侧不存在 Electron 那套独立 UI 对象，"委托"在这里是恒等转发且成环；
  // RN 壳 + bridge 已是完整实现，直接切断回环（不再有 base 委托异常路径）。
  Object.keys(shell).forEach(function (key) {
    if (key === '__calls') { merged.__calls = shell.__calls; return; }
    merged[key] = shell[key];
  });
  return merged;
}

function buildLifecycle() {
  var fgCbs = [];
  var bgCbs = [];
  var hideCbs = [];
  var listening = false;

  function fire(list) {
    list.slice().forEach(function (cb) {
      try { cb(); }
      catch (e5) {
        var m = (e5 && e5.message) ? e5.message : String(e5);
        console.warn('[Platform.lifecycle] 回调异常 :: ' + m);
      }
    });
  }

  function ensureListener() {
    if (listening) return;
    if (!AppState || typeof AppState.addEventListener !== 'function') {
      console.warn('[Platform.lifecycle] AppState 不可用，生命周期钩子将永不触发');
      return;
    }
    listening = true;
    AppState.addEventListener('change', function (state) {
      if (state === 'active') {
        fire(fgCbs);
      } else if (state === 'background') {
        // RN 无 pagehide：真实切后台时合并触发 background + pageHide，
        // pagehide"存档最后防线"语义由后台切换承接。
        fire(bgCbs);
        fire(hideCbs);
      }
      // inactive（iOS 下拉通知栏/多任务切换中途态等）：故意不触发任何
      // 存档路径，防瞬时态造成误存（2-5 已批口径）。
    });
  }

  return {
    onForeground: function (cb) {
      if (typeof cb === 'function') { fgCbs.push(cb); ensureListener(); }
    },
    onBackground: function (cb) {
      if (typeof cb === 'function') { bgCbs.push(cb); ensureListener(); }
    },
    onPageHide: function (cb) {
      if (typeof cb === 'function') { hideCbs.push(cb); ensureListener(); }
    }
  };
}

function build() {
  var alertEvents = [];

  var dialog = {
    // 同步签名 void：console.warn + 全局事件数组；不使用 Alert.alert，
    // 调用点零修改、零 await 传染。
    alert: function (msg) {
      try {
        alertEvents.push({ type: 'alert', message: String(msg), ts: Date.now() });
        if (alertEvents.length > MAX_RECORDS) alertEvents.shift();
      } catch (recErr2) { /* 记录失败不影响告警路径 */ }
      console.warn('[Platform.dialog.alert] ' + String(msg));
      // P9·S3：收口在桥层——6 个 Platform.dialog.alert 调用点原本对玩家完全静默
      // （只落 console.warn）。此处统一转发到叙事 toast 桥（story_store.pushToast），
      // 调用点零修改即获得可见告警。桥未装载（极端环境）时退回纯 console.warn 语义。
      try {
        if (StoryStore && typeof StoryStore.pushToast === 'function') {
          StoryStore.pushToast(String(msg), { type: 'warn' });
        }
      } catch (toastErr) { /* toast 失败不影响告警路径 */ }
    },
    // stub：同步 boolean，RN 2-5 阶段恒 false（等价"用户取消"），
    // 战役 3 换 Alert.alert + Promise 时改签名并收口调用点。
    confirm: function () { return false; },
    __events: alertEvents
  };

  return {
    // 透传 RN 内置全局 fetch，接口与 window.fetch 一致：Promise<Response>
    http: function (url, options) {
      return fetch(url, options);
    },
    dialog: dialog,
    image: {
      // 4-6：方案 B —— 内部归一两种入参：
      //   · Electron File 形态：{ type, size, ... }（type 前缀 'image/'）
      //   · image-picker asset 形态：{ uri, fileName, type, fileSize, width, height }
      // RN 无 FileReader；File 形态下 uri 取 file.uri（RN 场景不存在该路径，
      // 兜底报错走 '没有文件'）。
      // 纯函数 calcFit/estimateDataUrlBytes/selectQuality 导出在模块尾部（A 类可测）。
      compressFile: function (file, opts) {
        return compressFileImpl(file, opts);
      }
    },
    lifecycle: buildLifecycle(),
    ui: buildUiShell()
  };
}

// 战役 4 · 4-2：主页 4 接口壳从"纯 no-op"升级为"日志链 + 导航桥接"。
// 原壳（console.log / __calls 记录 / base 委托 / false 语义）完整保留前置执行，
// 桥接只做新增投递，Electron 调用方（story.js 等）一行不改：
//   showHome()         → nav_store.navigate('home')
//   showScreen(eId)    → nav_store.navigateByElectronId（screen-game→story 等）
//   renderTopbar()     → nav_store.notify('topbar')（组件现读 GameState HUD）
//   updateTokenBadge() → nav_store.notify('tokenBadge')（组件现读 _totalTokens）
function bridgeNavigation(ui) {
  if (!NavStore || !ui) return;
  function wrap(name, bridge) {
    var orig = ui[name];
    ui[name] = function () {
      var ret;
      if (typeof orig === 'function') ret = orig.apply(ui, arguments);
      try { bridge.apply(null, arguments); } catch (eBridge) {
        // 桥接异常不得影响 engine 业务调用路径
      }
      return ret;
    };
  }
  wrap('showHome', function () { NavStore.navigate('home'); });
  wrap('showScreen', function (id) { NavStore.navigateByElectronId(id); });
  wrap('renderTopbar', function () { NavStore.notify('topbar'); });
  wrap('updateTokenBadge', function () { NavStore.notify('tokenBadge'); });
}

// 战役 4 · 4-3a：叙事族 P0+P1 壳桥接（Electron 调用方一行不改）。
// 与导航桥同范式：原壳（console.log / __calls / base 委托）前置执行，
// 桥接只做新增投递；但 P0 两壳必须替换返回值：
//   confirmAsync     → 返回 store 的 Promise<bool>（原壳 false 会卡死 3 处 await）
//   _currentRoundNum → 返回 store 直算的真实轮次数字（false 会致章头 NaN）
// 其余六壳无返回值依赖，保持原壳 false 语义透传。
var BRIDGE_VOID = { __bridgeVoid: true };

function bridgeStory(ui) {
  if (!StoryStore || !ui) return;
  // bridge 返回 BRIDGE_VOID（或 undefined）→ 透传原壳返回值；
  // 返回其他值（Promise/数字）→ 以桥接返回值为准。
  function wrapRet(name, bridge) {
    var orig = ui[name];
    ui[name] = function () {
      var ret;
      if (typeof orig === 'function') ret = orig.apply(ui, arguments);
      var bridgeRet;
      try { bridgeRet = bridge.apply(null, arguments); } catch (eBridge) {
        bridgeRet = BRIDGE_VOID; // 桥接异常不影响原链返回
      }
      return (bridgeRet !== undefined && bridgeRet !== BRIDGE_VOID) ? bridgeRet : ret;
    };
  }
  function wrapVoid(name, fn) {
    wrapRet(name, function () {
      try { fn.apply(null, arguments); } catch (eFn) { /* 隔离 */ }
      return BRIDGE_VOID;
    });
  }

  // P0
  wrapRet('confirmAsync', function (message, options) {
    return StoryStore.confirmOpen(message, options);
  });
  wrapRet('_currentRoundNum', function () {
    return StoryStore.currentRoundNum();
  });

  // P1
  wrapVoid('appendStory', function (storyText, options, timeDelta, toolResults, roundNum, meta) {
    StoryStore.appendSegment(storyText, options, timeDelta, toolResults, roundNum, meta);
  });
  wrapVoid('appendHint', function (text) { StoryStore.appendHint(text); });
  wrapVoid('appendDiceResult', function (text) { StoryStore.appendDiceResult(text); });
  wrapVoid('renderChapterHead', function (roundNum) { StoryStore.setChapter(roundNum); });
  wrapVoid('clearStory', function () { StoryStore.clear(); });
  // renderGame = renderTopbar + 侧栏：topbar 信号投导航 store（与 4-2 一致），
  // 侧栏重渲染计数投叙事 store
  wrapVoid('renderGame', function () {
    if (NavStore) NavStore.notify('topbar');
    StoryStore.renderGame();
  });

  // P2（4-3b）
  wrapVoid('setBusy', function (busy) { StoryStore.setBusy(busy); });
  wrapVoid('showStoryLoading', function () { StoryStore.setLoading(true); });
  wrapVoid('showStoryError', function (msg, options) { StoryStore.appendError(msg, options); });
  wrapVoid('toast', function (msg, opts) { StoryStore.pushToast(msg, opts); });

  // P3（4-3c）：侧栏重渲染只发数据信号（抽屉开关是 RN 自有 UI 态）；
  // 提议卡由 story.js 实时事件经壳入流
  wrapVoid('renderSidebarExpanded', function () { StoryStore.renderGame(); });
  if (StoryProposals) {
    wrapVoid('appendProposalCard', function (proposalId) { StoryProposals.appendCard(proposalId); });
  }

  // 4-6b：open_shop 工具 → 商店浮层（shop_store → ShopModal）。
  // 买卖直调 Shop.buy/sell（裁决 2：不走 Propose）。
  if (ShopStore) {
    wrapVoid('openShop', function (shopId) { ShopStore.open(shopId); });
  }
}

// 对搬运 Platform 对象就地浅合并；返回同一引用
function install(base) {
  base = base || {};
  var rn = build();
  base.http = rn.http;
  base.dialog = rn.dialog;
  base.image = rn.image;
  base.lifecycle = rn.lifecycle;
  base.ui = mergeUi(base.ui, rn.ui);
  bridgeNavigation(base.ui);
  bridgeStory(base.ui);
  base.__rnPlatform = '2-5'; // 合并已发生的自检标记
  return base;
}

module.exports = {
  install: install,
  UI_NAMES: UI_NAMES,
  // 4-6：图片压缩纯函数导出（A 类，Node smoke 可直测）
  imageCalcFit: calcFit,
  imageEstimateBytes: estimateDataUrlBytes,
  imageSelectQuality: selectQuality,
  imageNormalizeInput: normalizeImageInput
};

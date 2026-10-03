// ============================================================
// RN 入口的模块引导层 · 战役 2 · 批次 2-4
// 目标：按 tools/rn_startup_smoke.js 的 require 顺序，把启动全集 49 模块
//       逐个 require 挂到 globalThis，让 A 类业务模块的裸引用能命中。
// 纪律：
// - 模块清单/顺序/extra 与 Electron 仓 tools/rn_startup_smoke.js 严格同构；
// - 逐模块 try/catch：失败记名不中断，末尾输出 BOOTSTRAP SUMMARY；
// - 不在本文件改任何引擎模块一个字节（路径只在此处 require 层解决）；
// - 结果对象同时 module.exports，供 App.tsx 日志界面渲染。
//
// Metro 约束：require 的参数必须是字符串字面量（Metro 静态收集依赖，
// 变量动态 require 不被收集、运行时被拒）。故每个模块用 thunk 包裹
// 字面量 require，交给统一 load() 执行并 try/catch——依赖收集看字面量，
// 失败隔离靠 thunk 延迟执行。
// ============================================================

'use strict';

var ok = 0;
var failed = 0;
var failures = [];

// 2-5b：RN Platform 实装（本战役唯一 RN 侧新代码）。
// 在顶部仅加载定义，真正合并发生在 Platform 槽位挂载之后、业务模块之前。
var RNPlatformShim = require('./rn_platform.js');

function load(name, thunk, extra) {
  try {
    var exp = thunk();
    globalThis[name] = exp;
    if (extra && exp && exp[extra]) globalThis[extra] = exp[extra];
    ok++;
  } catch (e) {
    failed++;
    var msg = (e && e.message) ? String(e.message) : String(e);
    failures.push({ name: name, message: msg });
    console.warn('BOOTSTRAP_FAIL: ' + name + ' :: ' + msg);
  }
}

// ============================================================
// 战役 4 · 批次 4-4：路径 B · globalThis.localStorage 同步 polyfill
// engine/core/storage.js 有 11 处裸 localStorage（文件顶部迁移 IIFE 在
// require 瞬间即执行 getItem），RN（Hermes）无 localStorage 全局。
// 此处补同步 polyfill，全部方法委托 StorageAdapter（RN 真机 = op-sqlite
// 同步 kv 表），key 统一加 'global:' 前缀，与 VFS 的 'vfs:' 命名空间
// 物理隔离；clear() 只清自己前缀，绝不误删 VFS 数据。
// storage.js 两仓同源，本批零改动。
// 工厂单独导出（result.createLocalStoragePolyfill），供 Node 验证脚本
// 注入内存同形 adapter 跑委托契约断言。
// ============================================================
var GLOBAL_LS_PREFIX = 'global:';
function createLocalStoragePolyfill(adapter, prefix) {
  function ownPrefixedKeys() {
    var out = [];
    for (var i = 0; i < adapter.length; i++) {
      var k = adapter.key(i);
      if (k && k.indexOf(prefix) === 0) out.push(k);
    }
    return out;
  }
  var poly = {
    getItem: function (key) {
      return adapter.getItem(prefix + key);
    },
    setItem: function (key, value) {
      adapter.setItem(prefix + key, String(value));
    },
    removeItem: function (key) {
      adapter.removeItem(prefix + key);
    },
    clear: function () {
      ownPrefixedKeys().forEach(function (k) { adapter.removeItem(k); });
    },
    key: function (index) {
      var count = 0;
      for (var i = 0; i < adapter.length; i++) {
        var k = adapter.key(i);
        if (k && k.indexOf(prefix) === 0) {
          if (count === index) return k.slice(prefix.length);
          count++;
        }
      }
      return null;
    }
  };
  Object.defineProperty(poly, 'length', {
    get: function () { return ownPrefixedKeys().length; }
  });
  return poly;
}
function installLocalStoragePolyfill() {
  // typeof 对未声明全局返回 'undefined'（不抛 ReferenceError）；
  // 已存在（宿主自带或已挂载）则不覆盖。
  if (typeof localStorage !== 'undefined') return false;
  globalThis.localStorage =
    createLocalStoragePolyfill(globalThis.StorageAdapter, GLOBAL_LS_PREFIX);
  return true;
}

// 启动全集 50 模块（H6 加 UI_Portrait、P1-F 加 CARDS、P1-G 加 CardClassifyPure、P1-H 加 InfoFeed、P2·S1 加 WebSearchManager、P2·S2 加 NumEditor；Electron 侧名单 46，未同步）
// —— 核心层 ——
load('CardValidator',  function () { return require('../engine/core/card_validator.js'); });
load('GameState',      function () { return require('../engine/core/gamestate.js'); });
load('VFS',            function () { return require('../vfs/vfs.js'); });
load('StorageAdapter', function () { return require('../vfs/storage_adapter.js'); });
load('LocalStore',     function () { return require('../vfs/local_store.js'); });
load('Saves',          function () { return require('../vfs/saves.js'); });
load('VfsGuard',       function () { return require('../vfs/vfs_guard.js'); });
// 4-4：必须在 Storage 槽位之前挂载——storage.js 文件顶部的 VFS 迁移 IIFE
// 在 require 瞬间即裸调 localStorage.getItem/setItem。
installLocalStoragePolyfill();
// P1-F：内置示例卡带注册表（CARDS["demo_v1"]）——修「清数据/新装机冷启空库」。
// 逐字节搬自桌面 engine/core/cards_demo.js（2457 B / MD5 AA393C3F50A4C2FD0F732D29C95115C4）；
// Storage 合并口径 getRawAllCards 以内置 CARDS + VFS 导入（storage.js:165/169）。
load('CARDS',          function () { return require('../engine/core/cards_demo.js'); });
load('Storage',        function () { return require('../engine/core/storage.js'); });
load('ToolExecutor',   function () { return require('../engine/core/tool_executor.js'); });
load('ApiClient',      function () { return require('../engine/core/api_client.js'); });
load('ApiManager',     function () { return require('../engine/api_manager.js'); });
load('PromptBuilder',  function () { return require('../engine/core/prompt_builder.js'); });
load('Platform',       function () { return require('../platform/platform_adapter.js'); });
// 2-5b：Platform 槽位挂载后、业务层之前，RN 实装就地浅合并进搬运对象。
// 搬运文件零改动；require 缓存（shop.js 式捕获）/ window.Platform /
// globalThis.Platform 三条引用路径因就地变更同对象而同时生效。
try {
  RNPlatformShim.install(globalThis.Platform || {});
  if (typeof globalThis.window !== 'undefined' && globalThis.window) {
    globalThis.window.Platform = globalThis.Platform;
  }
  // 桌面引擎模块用裸全局 UI 当确认/提示门面（worldbook/wb_common.js:76
  // DirtyGuard.checkAny 调 UI.confirmAsync）。RN 侧此前没有 UI 全局，checkAny
  // 只能走 typeof 兜底返回 false —— 世界书一旦有未保存修改就永远切不了子页、
  // 换不了卡带（静默阻断，真机 2026-09-30 复现）。把 Platform.ui 挂成 UI，
  // 与桌面同语义：同一个确认壳，返回 Promise<boolean>。
  globalThis.UI = globalThis.Platform.ui;
  console.log('RN_PLATFORM: merged tag=' + globalThis.Platform.__rnPlatform);
} catch (e6) {
  var pmsg = (e6 && e6.message) ? String(e6.message) : String(e6);
  console.warn('RN_PLATFORM_INSTALL_FAIL: ' + pmsg);
}
load('ErrorLog',       function () { return require('../engine/error_log_core.js'); });
load('Logger',         function () { return require('../vfs/logger.js'); });
load('LogQuery',       function () { return require('../engine/log_query.js'); });
// —— 业务层 ——
load('Events',                function () { return require('../engine/events.js'); });
load('Tasks',                 function () { return require('../engine/tasks.js'); });
load('Achievements',          function () { return require('../engine/achievements.js'); });
load('Endings',               function () { return require('../engine/endings.js'); });
load('StoryNodes',            function () { return require('../engine/story_nodes.js'); });
load('Shop',                  function () { return require('../engine/shop.js'); });
load('StatusCard',            function () { return require('../engine/status_card.js'); });
load('Alias',                 function () { return require('../engine/alias.js'); });
load('DiceHistory',           function () { return require('../engine/dice_history.js'); });
load('Outputs',               function () { return require('../engine/outputs.js'); });
load('ProposalValidator',     function () { return require('../engine/proposal_validator.js'); });
load('Proposals',             function () { return require('../engine/proposals.js'); });
load('Calendar',              function () { return require('../engine/calendar.js'); });
load('CardDiagnose',          function () { return require('../engine/card_diagnose.js'); });
// P1-G：卡带分类审核的纯逻辑（buildPrompt / parseSuggestions / applyMovements）。
// 严禁挂成 CardClassify —— 该名在文件内自带 {open,close,isLoaded}，open() 走
// renderPanel(document.*) 必崩。RN 只用本模块导出的 5 个纯函数。
load('CardClassifyPure',      function () { return require('../engine/classify.js'); });
load('DiceEngine',            function () { return require('../engine/dice.js'); });
load('NpcDeduction',          function () { return require('../engine/npc_deduction.js'); });
load('NpcDeductionAI',        function () { return require('../engine/npc_deduction_ai.js'); });
// P1-H：剧情外信息层（手机）——两仓逐字节同源（37,520 B / MD5 09CF6E57A6117064605E06131BC9484D）
load('InfoFeed',              function () { return require('../engine/info_feed.js'); });
load('NpcRuntime',            function () { return require('../engine/npc_runtime.js'); });
load('Portrait',              function () { return require('../engine/portrait.js'); });
load('ProposalSemanticCheck', function () { return require('../engine/proposal_semantic_check.js'); });
load('Snapshots',             function () { return require('../engine/snapshots.js'); });
load('Theme',                 function () { return require('../engine/theme.js'); });
load('Weather',               function () { return require('../engine/weather.js'); });
// P2 · S1：联网搜索多后端（搬自桌面 engine/web_search.js，主体逐字节同源 + 双态导出）。
// 装上后 prompt_builder.js:248 的 if (searchOn) 分支才会真正注入【联网搜索协议】。
load('WebSearchManager',      function () { return require('../engine/web_search.js'); });
// P2 · S2：数值编辑器纯逻辑（搬自桌面 engine/editor.js NumEditor 段，去 DOM 适配）。
// templates/number.js + templates/relation.js 逐字节同源，由本模块 require 装载。
load('NumEditor',             function () { return require('../engine/num_editor.js'); });
load('WordFamilies',          function () { return require('../engine/words.js'); });
load('Realtime',              function () { return require('../engine/realtime.js'); });
load('RuntimeRepair',         function () { return require('../engine/runtime_repair.js'); });
load('Audit',                 function () { return require('../engine/audit.js'); });
load('Avatar',                function () { return require('../engine/avatar.js'); });
// H6 G9: RN 侧 UI_Portrait 实现（修 engine/story.js:650 调用缺口）
load('UI_Portrait',           function () { return require('./ui_portrait_rn.js'); });
load('StoryLoop',             function () { return require('../engine/story.js'); }, 'CreateFlow');

// ============================================================
// P15：导入文游资料（engine/import/**）
//   纯 JS、零原生依赖 ⇒ 同一套代码桌面/RN 通用。
//   加载顺序 = 依赖顺序：底层基础 → 解析器 → 流水线 → 保管库/草稿 → 门面。
//   ImportHtml 走 extra 挂到 globalThis（archive.js 的 epub 分支要用）。
// ============================================================
load('ImportDecode',        function () { return require('../engine/import/decode.js'); });
load('ImportFormats',       function () { return require('../engine/import/formats.js'); });
load('ImportMiddle',        function () { return require('../engine/import/middle.js'); });
load('ImportReport',        function () { return require('../engine/import/report.js'); });
load('ImportUnzip',         function () { return require('../engine/import/unzip.js'); });
load('ImportParseTextlike', function () { return require('../engine/import/parsers/textlike.js'); }, 'ImportHtml');
load('ImportParseArchive',  function () { return require('../engine/import/parsers/archive.js'); });
load('ImportParsePdf',      function () { return require('../engine/import/parsers/pdf.js'); });
load('ImportPipeline',      function () { return require('../engine/import/pipeline.js'); });
load('ImportVault',         function () { return require('../engine/import/vault.js'); });
load('ImportDraft',         function () { return require('../engine/import/draft.js'); });
load('Import',              function () { return require('../engine/import/index.js'); });

// ============================================================
// P9·S5：后台 / 定时落盘接线（对齐桌面 engine/ui.js:143-163 语义）。
//   桌面在 window 上注册 onBackground / onPageHide + 30s interval，全部带
//   「有进行中存档（+ !StoryLoop.busy）」守卫。RN 侧此前 lifecycle 钩子零调用点、
//   全仓零 setInterval，只在轮末（story.js）与显式退出落盘 ⇒ 后台被杀可能丢进度。
//   此处注册同语义三条路径。AppState listener 由 rn_platform.buildLifecycle
//   的 ensureListener() 在首次 onBackground/onPageHide 注册时挂载。
// ============================================================
(function registerPersistHooks() {
  function canPersist(requireIdle) {
    try {
      var gs = globalThis.GameState;
      if (!gs || !gs.currentCardId || !gs.currentSaveId) return false;
      if (requireIdle) {
        var loop = globalThis.StoryLoop;
        if (loop && loop.busy) return false;
      }
      return true;
    } catch (e) { return false; }
  }
  function persistNow(requireIdle) {
    try {
      if (!canPersist(requireIdle)) return;
      globalThis.GameState.persist();
    } catch (e) { /* 落盘失败不影响主流程 */ }
  }
  try {
    var P = globalThis.Platform;
    if (P && P.lifecycle) {
      // background：带 busy 守卫（与桌面 :143-149 同）；pageHide：无 busy 守卫
      // （桌面 :150-156 的「存档最后防线」语义；RN 无 pagehide，由真实后台切换承接）
      P.lifecycle.onBackground(function () { persistNow(true); });
      P.lifecycle.onPageHide(function () { persistNow(false); });
    }
  } catch (eLife) { /* lifecycle 不可用不阻断引导 */ }
  // 前台 30s 定时落盘（带 busy 守卫，对齐桌面 :157-163）
  var _persistTimer = setInterval(function () { persistNow(true); }, 30000);
  // Node（smoke 直跑 rn_bootstrap）下 unref，避免定时器吊住事件循环；
  //   RN 里 setInterval 返回数字，无 unref，此分支自动跳过。
  if (_persistTimer && typeof _persistTimer.unref === 'function') { _persistTimer.unref(); }
  console.log('RN_PERSIST_HOOKS: onBackground/onPageHide + 30s interval 已注册');
})();

var summary = 'BOOTSTRAP: ' + ok + ' ok, ' + failed + ' failed';
console.log(summary);

// 2-5b：Platform 合并结果自检（在 bootstrap 模块内、44 模块全挂载后取值，
// 与业务模块运行时所处的 globalThis 视角一致）
var P = globalThis.Platform || {};
function pt(o) { return typeof o === 'function' ? 'fn' : typeof o; }
var platformCheck = {
  tag: P.__rnPlatform || null,
  http: typeof P.http === 'function',
  dialogAlert: typeof (P.dialog && P.dialog.alert) === 'function',
  dialogConfirm: typeof (P.dialog && P.dialog.confirm) === 'function',
  lcFg: typeof (P.lifecycle && P.lifecycle.onForeground) === 'function',
  lcBg: typeof (P.lifecycle && P.lifecycle.onBackground) === 'function',
  lcHide: typeof (P.lifecycle && P.lifecycle.onPageHide) === 'function',
  imageCompress: typeof (P.image && P.image.compressFile) === 'function',
  uiFns: {},
  sameWindow: null
};
RNPlatformShim.UI_NAMES.forEach(function (n) {
  platformCheck.uiFns[n] = typeof (P.ui && P.ui[n]) === 'function';
});
if (typeof globalThis.window !== 'undefined' && globalThis.window) {
  platformCheck.sameWindow = (globalThis.window.Platform === P);
}
console.log('RN_PLATFORM_CHECK: tag=' + platformCheck.tag +
  ' http=' + pt(P.http) +
  ' alert=' + pt(P.dialog && P.dialog.alert) +
  ' confirm=' + pt(P.dialog && P.dialog.confirm) +
  ' fg=' + pt(P.lifecycle && P.lifecycle.onForeground) +
  ' bg=' + pt(P.lifecycle && P.lifecycle.onBackground) +
  ' hide=' + pt(P.lifecycle && P.lifecycle.onPageHide) +
  ' compress=' + pt(P.image && P.image.compressFile) +
  ' uiToast=' + pt(P.ui && P.ui.toast) +
  ' uiOpenShop=' + pt(P.ui && P.ui.openShop) +
  ' sameWindow=' + platformCheck.sameWindow);

var result = {
  total: ok + failed,
  ok: ok,
  failed: failed,
  failures: failures,
  summary: summary,
  platformTag: (globalThis.Platform && globalThis.Platform.__rnPlatform) || null,
  platformCheck: platformCheck,
  // 4-4：polyfill 挂载状态 + 工厂导出（Node 验证脚本注入内存 adapter 复用）
  localStoragePolyfill: typeof globalThis.localStorage === 'object',
  createLocalStoragePolyfill: createLocalStoragePolyfill
};

module.exports = result;

// ============================================================
// P60 守卫：UI 自动代理的自递归（真机「外部 AI 通道一点就崩」）
//
// 事故（2026-10-17 真机 1.3.1 实机复现）：
//   设置 → 对话通道 → 外部 AI → 存档里发一句 → 立刻
//   「异常出错了：Maximum call stack size exceeded (native stack depth)」，
//   「复制提示词」弹窗一次都没出现。
// 成因链（三层，缺一层都不崩）：
//   ① 搬运实现 platform_adapter.js 的 ui 组是「裸全局自动代理」：
//      ui[name] = function () { if (typeof UI !== 'undefined' && typeof UI[name] === 'function')
//                                  return UI[name].apply(UI, arguments); return false; };
//   ② rn_bootstrap.js:136 `globalThis.UI = globalThis.Platform.ui;` —— 裸 UI 就是 Platform.ui 本身；
//   ③ rn_platform.mergeUi 用 UI_NAMES 里的 RN 壳逐个顶掉这些代理，把环切断（P8 修的就是这个）；
//      但 P54·第10条新增的 requestExternalReply 只登记在 platform_adapter NAMES，
//      没登记进 rn_platform 的 UI_NAMES ⇒ 该键保留 base 代理 ⇒ 代理调 UI.x（= 同一函数）⇒ ∞。
//
// 本套钉住：
//   C1 名单对账：搬运实现里「裸 UI 自动代理」的每个键，RN 壳名单都必须有（防下一次漏登）
//   C2 行为：真 adapter + 真 rn_platform.install() 合体后，requestExternalReply 走桥接、不递归
//   C3 行为：桥接拿到的 copyText 是整轮提示词（【系统】/【玩家】标记齐）
//   C4 行为：壳名单故意漏掉一个「自动代理键」时，install 必须切环（返回 false + warn），不许栈溢出
//   C5 源码守卫：mergeUi 的 PASSTHROUGH 白名单与切断告警不许被删
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const ROOT = path.resolve(__dirname, '..', '..');
const RNP = 'rn/rn_platform.js';
const ADAPTER = 'platform/platform_adapter.js';

// 沙箱里的 require 桩：rn_platform 只在这个范围内碰外部模块
function makeSandbox(store) {
  const sb = H.makeSandbox({
    module: { exports: {} },
    require: function (p) {
      if (p === 'react-native') return { AppState: { addEventListener: function () {} } };
      if (p === './story_store.js') return store;
      if (p === './shop_store.js') return { open: function () {}, subscribe: function () {}, getSnapshot: function () { return {}; } };
      if (p === './story_proposals.js') return { appendCard: function () {} };
      if (p === './nav_store.js') return { navigate: function () {}, navigateByElectronId: function () {}, notify: function () {} };
      return {};
    }
  });
  return sb;
}

function makeStore(calls) {
  var noop = function () {};
  return {
    promptOpen: function (msg, def, opts) {
      calls.prompt = { msg: msg, def: def, opts: opts };
      return Promise.resolve('AI 回的正文');
    },
    confirmOpen: function () { return Promise.resolve(true); },
    currentRoundNum: function () { return 7; },
    appendError: noop, appendSegment: noop, appendHint: noop, appendDiceResult: noop,
    setChapter: noop, clear: noop, renderGame: noop, setBusy: noop, setLoading: noop,
    pushToast: noop, subscribe: noop, getSnapshot: function () { return {}; }
  };
}

// 真 adapter + 真 rn_platform.install()，返回 { sb, base, calls }
function mkWired() {
  var calls = {};
  var sb = makeSandbox(makeStore(calls));
  H.load(sb, ADAPTER);
  var base = sb.window.Platform;
  if (!base || !base.ui) throw new Error('platform_adapter 没挂出 window.Platform.ui');
  // 与 rn_bootstrap.js:136 同一条挂载：裸全局 UI 就是 Platform.ui 本身
  // （vm 沙箱里给上下文对象加属性即挂到它的全局）
  sb.UI = base.ui;
  H.load(sb, RNP);
  var RN = sb.module.exports;
  if (!RN || typeof RN.install !== 'function') throw new Error('rn_platform 没导出 install');
  RN.install(base);
  return { sb: sb, base: base, RN: RN, calls: calls };
}

// ---------- C1 名单对账 ----------
H.run('C1 搬运实现里每个「裸 UI 自动代理」键都登记进了 RN 壳名单', function () {
  var sb = makeSandbox(makeStore({}));
  H.load(sb, ADAPTER);
  var base = sb.window.Platform;
  var rnpSrc = fs.readFileSync(path.join(ROOT, RNP), 'utf8');
  var m = rnpSrc.match(/var UI_NAMES = \[([\s\S]*?)\];/);
  if (!m) throw new Error('rn_platform 里找不到 UI_NAMES 名单');
  var shellNames = (m[1].match(/'[^']+'/g) || []).map(function (s) { return s.slice(1, -1); });

  // 自动代理判定：调用时把「裸全局 UI 同名函数」转发出去。手写实现（openShop / stream*）
  // 转发的是 UI_Shop / UI_Thinking，不在裸 UI 上，故不在此列。
  var proxied = [];
  Object.keys(base.ui).forEach(function (k) {
    if (/^(openShop|streamStartLive|streamAppendReasoning|streamFinishLive)$/.test(k)) return;
    if (typeof base.ui[k] !== 'function') return;
    var mark = {};
    var prev = sb.UI;
    sb.UI = mark;
    mark[k] = function () { return '__proxied__'; };
    var r;
    try { r = base.ui[k]('x'); } catch (e) { r = null; }
    sb.UI = prev;
    if (r === '__proxied__') proxied.push(k);
  });
  if (proxied.length < 15) throw new Error('自动代理判定失准（只认出 ' + proxied.length + ' 个）');
  var missing = proxied.filter(function (k) { return shellNames.indexOf(k) < 0; });
  H.eq(missing.length, 0, '漏登 RN 壳名单的键：' + missing.join(', '));
});

// ---------- C2 行为：外部通道不再自递归 ----------
H.run('C2 install 后 requestExternalReply 正常走桥接（不再栈溢出）', function () {
  var w = mkWired();
  var r;
  try {
    r = w.base.ui.requestExternalReply([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
  } catch (e) {
    throw new Error('调用直接抛了：' + e.message);
  }
  if (!r || typeof r.then !== 'function') throw new Error('没返回 Promise，实际：' + typeof r);
  return r.then(function (v) {
    H.eq(v, 'AI 回的正文', '桥接应把用户粘贴的回复原样交回');
    H.eq(!!w.calls.prompt, true, 'promptOpen 被调用（提示词弹窗路径）');
  });
});

// ---------- C3 行为：copyText 是整轮提示词 ----------
H.run('C3 弹窗选项里的 copyText 带【系统】/【玩家】标记（formatExternalPrompt 生效）', function () {
  var w = mkWired();
  return w.base.ui.requestExternalReply([
    { role: 'system', content: '你是 GM' },
    { role: 'user', content: '看窗口' }
  ]).then(function () {
    var opts = (w.calls.prompt && w.calls.prompt.opts) || {};
    H.eq(typeof opts.copyText, 'string', 'copyText 应是字符串');
    H.contains(opts.copyText, '【系统】\n你是 GM', 'copyText 带上系统段');
    H.contains(opts.copyText, '【玩家】\n看窗口', 'copyText 带上玩家段');
    H.eq(opts.multiline, true, '多行输入（粘贴回复）');
    H.eq(opts.okText, '提交这条回复', '确认按钮文案');
  });
});

// ---------- C4 行为：漏登键被切断，不许栈溢出 ----------
H.run('C4 壳名单漏登的自动代理键 ⇒ 切成 false + warn（P60 兜底，不递归）', function () {
  var w = mkWired();
  // 伪装「未来又往 adapter 加了一个契约名、忘了登记 RN 壳名单」
  w.base.ui.__p60Probe = function () {
    var UI = w.sb.UI;
    if (typeof UI !== 'undefined' && typeof UI.__p60Probe === 'function') return UI.__p60Probe.apply(UI, arguments);
    return false;
  };
  // 重新 install 一次（模拟启动链再次合并）
  w.RN.install(w.base);
  var warns = [];
  var oldWarn = w.sb.console.warn;
  w.sb.console.warn = function (m) { warns.push(String(m)); };
  var r;
  try { r = w.base.ui.__p60Probe('x'); }
  catch (e) {
    w.sb.console.warn = oldWarn;
    throw new Error('漏登键调用仍抛错：' + e.message);
  }
  w.sb.console.warn = oldWarn;
  H.eq(r, false, '切断后返回 false（不静默成功，也不崩）');
  H.eq(warns.some(function (m) { return m.indexOf('__p60Probe') >= 0; }), true,
    'warn 里点名漏登的键：' + JSON.stringify(warns.slice(0, 2)));
});

// ---------- C5 源码守卫 ----------
H.run('C5 源码：PASSTHROUGH 白名单与切断告警都在（防被当死代码删掉）', function () {
  var src = fs.readFileSync(path.join(ROOT, RNP), 'utf8');
  H.contains(src, 'var PASSTHROUGH = {', 'mergeUi 里的手写实现白名单');
  H.contains(src, "openShop: 1, streamStartLive: 1", '白名单内容（openShop + 三个 stream 手写实现）');
  H.contains(src, '__cutWarn_', '切断只告警一次的实现痕迹');
  H.contains(src, "'requestExternalReply'", 'UI_NAMES 里已登记外部通道契约');
  var hdr = fs.readFileSync(path.join(ROOT, 'vfs', 'secure_envelope.js'), 'utf8'); // 仅确认仓根可读
  H.eq(hdr.length > 1000, true, '仓根路径解析正常（防 ROOT 算错导致空跑）');
});

H.finish();

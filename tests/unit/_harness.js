// ============================================================
// 单元测试脚手架（P54·第15条）
// 纯 node + vm 沙箱，零新依赖。被 tests/unit/*_unit.js 引用，
// 由 tools/run_unit_tests.js 逐个拉起（不匹配 tools/run_all_smokes.js 的
// /_smoke\.js$/ 扫描规则 ⇒ 不计入 37 套 smoke / 2502 条断言的基线）。
//
// 定位差别：
//   tools/*_smoke.js = 集成测试，走真实模块 + 真实存储，答「整条链路还能不能跑」；
//   本目录的单测 = 用最小假件把单个模块的边界行为夹到台面上，答「改这一处会不会
//   踩到那条边」，定位比 smoke 快得多。
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0;
let fail = 0;
let chain = Promise.resolve();

// 内存版 VFS：坏 JSON 解析失败返回 null（与 vfs/vfs.js:66 的真实行为一致）
function makeVFS(seed) {
  const files = Object.assign({}, seed || {});
  return {
    _files: files,
    readFile: function(p) { return Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null; },
    writeFile: function(p, s) { files[p] = String(s); return true; },
    readJSON: function(p) {
      if (!Object.prototype.hasOwnProperty.call(files, p)) return null;
      try { return JSON.parse(files[p]); } catch (e) { return null; }
    },
    writeJSON: function(p, d) { files[p] = JSON.stringify(d); return true; },
    exists: function(p) { return Object.prototype.hasOwnProperty.call(files, p); },
    remove: function(p) { delete files[p]; return true; }
  };
}

function makeSandbox(extra) {
  const sb = Object.assign({
    console: console,
    // 引擎件在模块级会排布定时器（如 info_feed 的节流/延迟落盘），沙箱必须提供这些
    // 宿主 API：给不会触发的桩，让单测自己决定何时调内部函数，不引入真实时序。
    setTimeout: function() { return 0; },
    clearTimeout: function() {},
    setInterval: function() { return 0; },
    clearInterval: function() {},
    window: {},
    GameState: {},
    VFS: makeVFS(),
    ErrorLog: { audit: function() { return true; }, action: function() {}, error: function() {}, log: function() {} },
    Platform: { ui: { appendHint: function() {}, renderTopbar: function() {}, renderSidebarExpanded: function() {} } }
  }, extra || {});
  vm.createContext(sb);
  return sb;
}

// 以仓根为基准加载引擎文件（假件需在 load 之前放进沙箱）
function load(sb, rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, sb, { filename: rel });
  return sb;
}

// 串行执行，保证 PASS/FAIL 顺序与用例顺序一致；fn 可返回 Promise
function run(name, fn) {
  chain = chain.then(function() {
    return Promise.resolve().then(fn).then(function() {
      pass++;
      console.log('PASS: ' + name);
    }, function(e) {
      fail++;
      console.log('FAIL: ' + name + ' / ' + ((e && e.message) || e));
    });
  });
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + '：期望 ' + JSON.stringify(expected) + ' 实际 ' + JSON.stringify(actual));
  }
}

function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(label + '：期望 ' + b + ' 实际 ' + a);
}

function ok(v, label) {
  if (!v) throw new Error(label + '：期望为真，实际 ' + JSON.stringify(v));
}

function notOk(v, label) {
  if (v) throw new Error(label + '：期望为假，实际 ' + JSON.stringify(v));
}

function contains(hay, needle, label) {
  if (String(hay).indexOf(needle) < 0) {
    throw new Error(label + '：应含 ' + JSON.stringify(needle) + ' 实际 ' + JSON.stringify(hay));
  }
}

function noThrow(fn, label) {
  try { return fn(); } catch (e) { throw new Error(label + '：不应抛错，实际 ' + e.message); }
}

function finish() {
  return chain.then(function() {
    console.log('');
    console.log('SUMMARY: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
}

module.exports = {
  ROOT: ROOT,
  makeSandbox: makeSandbox,
  makeVFS: makeVFS,
  load: load,
  run: run,
  eq: eq,
  deepEq: deepEq,
  ok: ok,
  notOk: notOk,
  contains: contains,
  noThrow: noThrow,
  finish: finish
};

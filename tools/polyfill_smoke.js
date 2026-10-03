// ============================================================
// 战役 4 · 批次 4-4 · localStorage polyfill 最小验证（Node 模拟 RN）
// 用法：node tools/polyfill_smoke.js
//
// 环境事实：Node 仓内无 @op-engineering/op-sqlite（MODULE_NOT_FOUND），
// StorageAdapter 走 storage_adapter.js 的兜底分支——读静默（null/0）、
// 写抛 StorageUnavailableError。真机 op-sqlite 同步 KV 往返不在本机
// Node 可验，留给 G9 Pixel7。故本脚本分两层：
//
// A 层 · 真链：require rn/rn_bootstrap.js 跑真实 47 模块加载链，验证
//   polyfill 挂载时机（早于 Storage 槽位顶部迁移 IIFE）、对象形状、
//   兜底后端下读路径不抛，并记录"写必抛 StorageUnavailableError"的
//   环境事实。
// B 层 · 委托契约：用与 StorageAdapter 同形的内存同步 adapter
//   （Map 后端 + length getter）喂给 bootstrap 导出的同一工厂，验证
//   写往返、length/key 枚举（去前缀）、setItem 强 String、'global:'
//   物理前缀、clear() 只清自己前缀不删 'vfs:' 数据、removeItem 幂等。
// ============================================================

'use strict';

var ok = 0, fail = 0;
var failures = [];

function check(name, cond, detail) {
  if (cond) {
    ok++;
    console.log('PASS: ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? (' :: ' + detail) : ''));
    console.log('FAIL: ' + name + (detail ? (' :: ' + detail) : ''));
  }
}

// ------------------------------------------------------------
// A 层 · 真链（Node 兜底后端）
// ------------------------------------------------------------
console.log('---- A 层：rn_bootstrap 真链 ----');
var result = require('../rn/rn_bootstrap.js');

// P4 同步 50→51：rn_bootstrap 新增 LogQuery（P4·S2 query_log 检索入口），断言随模块清单同步
check('BOOTSTRAP 63/0（H6 加 UI_Portrait、P1-F 加 CARDS、P1-G 加 CardClassifyPure、P1-H 加 InfoFeed、P2·S1 加 WebSearchManager、P2·S2 加 NumEditor、P4·S2 加 LogQuery、P15 加 12 个导入层模块）', result.ok === 63 && result.failed === 0,
  'ok=' + result.ok + ' failed=' + result.failed);
check('result.localStoragePolyfill === true', result.localStoragePolyfill === true);
check('typeof globalThis.localStorage === object',
  typeof globalThis.localStorage === 'object');

// P1-F：内置示例卡随 bootstrap 挂载，且 Storage 合并口径可见（冷启不空库）
check('P1F 冷启卡库含内置「示例卡带」',
  !!(function () {
    try {
      var all = globalThis.Storage.getAllCards();
      return all && all.demo_v1 && all.demo_v1.cardName === '示例卡带';
    } catch (e) { return false; }
  })());

var ls = globalThis.localStorage;
check('形状 getItem/setItem/removeItem/clear/key 全 function',
  typeof ls.getItem === 'function' &&
  typeof ls.setItem === 'function' &&
  typeof ls.removeItem === 'function' &&
  typeof ls.clear === 'function' &&
  typeof ls.key === 'function');
check('形状 length 为 number', typeof ls.length === 'number', 'actual=' + typeof ls.length);

// 兜底后端：读静默不抛
var readVal = 'NOT_CALLED';
var readThrew = null;
try { readVal = ls.getItem('polyfill_smoke_read_probe'); } catch (e) { readThrew = e.message; }
check('兜底读 getItem 不抛且返回 null', readThrew === null && readVal === null,
  'threw=' + readThrew + ' val=' + readVal);

// 兜底后端：写必抛 StorageUnavailableError（环境事实，证明 B 层必要性）
var writeErrName = null;
try { ls.setItem('polyfill_smoke_write_probe', 'x'); } catch (e) { writeErrName = e.name; }
check('兜底写按设计抛 StorageUnavailableError',
  writeErrName === 'StorageUnavailableError', 'actual=' + writeErrName);

// Storage 槽位真调：getGlobal 在裸 localStorage 全链路下不炸
var globalThrew = null, globalObj = null;
try { globalObj = globalThis.Storage.getGlobal(); } catch (e) { globalThrew = e.message; }
check('Storage.getGlobal() 真调不抛且返回对象',
  globalThrew === null && globalObj && typeof globalObj === 'object',
  'threw=' + globalThrew);

// ------------------------------------------------------------
// B 层 · 委托契约（内存同形 adapter，严格镜像 StorageAdapter 语义）
// ------------------------------------------------------------
console.log('---- B 层：内存 adapter 委托契约 ----');

var mem = new Map();
var memAdapter = {
  getItem: function (k) { return mem.has(k) ? mem.get(k) : null; },
  setItem: function (k, v) { mem.set(k, String(v)); },
  removeItem: function (k) { mem.delete(k); },
  key: function (i) {
    var ks = Array.from(mem.keys());
    if (i < 0 || i >= ks.length) return null;
    return ks[i];
  },
  clear: function () { mem.clear(); },
  estimateBytes: function () {
    var t = 0;
    mem.forEach(function (v, k) { t += (k.length + String(v).length) * 2; });
    return t;
  }
};
Object.defineProperty(memAdapter, 'length', { get: function () { return mem.size; } });

var factory = result.createLocalStoragePolyfill;
check('工厂已导出且为 function', typeof factory === 'function');

var p = factory(memAdapter, 'global:');

// 任务书 2.1 七断言（写往返在可写后端上）
var setThrew = null;
try { p.setItem('test_key', 'hello'); } catch (e) { setThrew = e.message; }
check('setItem(test_key, hello) 不抛', setThrew === null, setThrew);
check('物理键带 global: 前缀（隔离）', mem.has('global:test_key') === true,
  'keys=' + Array.prototype.slice.call(mem.keys()).join(','));
check('getItem(test_key) === hello', p.getItem('test_key') === 'hello',
  'actual=' + p.getItem('test_key'));
check('length >= 1（实际 ===1）', p.length === 1, 'actual=' + p.length);

// setItem 强制 String
p.setItem('num', 123);
check('setItem 值强制 String（123 -> "123"）', mem.get('global:num') === '123',
  'actual=' + mem.get('global:num'));

// key() 去前缀
check('key(0)/key(1) 去前缀且越界返回 null',
  (p.key(0) === 'test_key' || p.key(0) === 'num') &&
  (p.key(1) === 'test_key' || p.key(1) === 'num') &&
  p.key(0) !== p.key(1) && p.key(99) === null);

// VFS 共存 + clear 隔离（任务书红线：不能误删 VFS 数据）
mem.set('vfs:keep', 'must-survive');
p.setItem('other', 'y');
var sizeBeforeClear = mem.size;
p.clear();
check('clear() 后 global: 键全清',
  p.getItem('test_key') === null && p.getItem('num') === null &&
  p.getItem('other') === null && p.length === 0);
check('clear() 不删 vfs: 前缀数据',
  mem.get('vfs:keep') === 'must-survive',
  'actual=' + mem.get('vfs:keep') + ' sizeBefore=' + sizeBeforeClear);
check('clear() 后 length 只数 global:（===0）', p.length === 0,
  'actual=' + p.length + ' memSize=' + mem.size);

// removeItem 幂等（含不存在键）
p.setItem('a', '1');
var rmThrew = null;
try { p.removeItem('a'); p.removeItem('absent_key'); } catch (e) { rmThrew = e.message; }
check('removeItem 往返 + 不存在键不抛',
  rmThrew === null && p.getItem('a') === null, rmThrew);
check('removeItem 删除的是带前缀物理键',
  mem.has('global:a') === false && mem.has('a') === false);

// 物理层最终全量键审计
var finalKeys = Array.prototype.slice.call(mem.keys());
check('最终物理键无裸 global 域键（全部前缀化）',
  finalKeys.every(function (k) { return k.indexOf('global:') === 0 || k.indexOf('vfs:') === 0; }),
  'keys=' + finalKeys.join(','));

// ------------------------------------------------------------
// 汇总
// ------------------------------------------------------------
console.log('POLYFILL_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) {
  console.log('FAILURES:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}

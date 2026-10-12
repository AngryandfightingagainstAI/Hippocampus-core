// ============================================================
// P53·③ 守卫：静默 fail-open 必须留审计痕
//
// 存在理由（Kimi 评估清单第 ③ 条，用户 2026-10-08 裁决按 ①②③④ 顺序做）：
//   engine/proposal_validator.js 是 A 层「存在性校验」。它最危险的地方不是拦错，
//   而是**两条静默放行路径**：① 提议类型没有校验规则 → 直接 { ok: true }；
//   ② 校验器自身抛异常 → 也 { ok: true }。两条都只留（或根本不写）一行 console.warn，
//   玩家看不见、诊断报告里也没有 ⇒ 真出了「AI 提议了不存在的 NPC 却照样执行」，
//   事后完全无法反查。本守卫锁住四件事：
//     ① 放行语义不变：两条路径仍然返回 { ok: true }（审计不得把正常放行变成故障）。
//     ② 两条路径都真的写进行为日志（ErrorLog.audit），且只进 actions、不进 errors
//        （不触发桌面高亮/Toast——那会把正常放行渲染成崩溃）。
//     ③ 限流：同一 kind+type 每局最多 5 条，跨上限只补一条 audit_limited 汇总，
//        不让「每轮一个未知类型」把 200 条的 actions 环刷爆。
//     ④ 日志自洁：detail 只带键名与截断后的异常消息，不把整坨 payload 塞进日志。
// 用法：node tools/proposal_audit_smoke.js   （cwd 随意，根目录由 __dirname 推）
// ============================================================
'use strict';
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

var okN = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('ok   ' + name); }
  else { failN++; console.log('FAIL ' + name + (detail ? '  :: ' + detail : '')); }
}

var core = require(path.join(ROOT, 'engine', 'error_log_core.js'));
var PV = require(path.join(ROOT, 'engine', 'proposal_validator.js'));

// ErrorLog 是引擎层约定的全局挂载名（浏览器 window.ErrorLog / RN globalThis.ErrorLog）
globalThis.ErrorLog = core;

function actList() { return (core._state && core._state.actions) || []; }
function kinds() { return actList().map(function (a) { return a.kind; }); }
function countKind(prefix) {
  return kinds().filter(function (k) { return String(k).indexOf(prefix) === 0; }).length;
}
function reset() { try { core.clear(); } catch (e) {} }

// ---------- PA-1 审计槽存在 ----------
ok('PA-1 core 契约导出 audit(kind, type, detail)', typeof core.audit === 'function');

// ---------- PA-2..PA-5 未知类型：放行 + 留痕 + 只进 actions ----------
reset();
var errsBefore = (core._state && core._state.errors ? core._state.errors.length : -1);
var r1 = PV.validate({ type: 'never_registered_op', payload: { foo: 1, bar: 2, baz: 3 } });
ok('PA-2 未知类型仍然放行（fail-open 语义不变）', !!(r1 && r1.ok === true), JSON.stringify(r1));
ok('PA-3 未知类型放行写进 actions', countKind('audit:proposal_validator/unknown_op') === 1, kinds().join(' | '));
ok('PA-4 审计只进 actions、不进 errors（不触发高亮/Toast）',
  (core._state && core._state.errors ? core._state.errors.length : -1) === errsBefore,
  'errors=' + (core._state && core._state.errors ? core._state.errors.length : '?'));
var a1 = actList()[0] || {};
ok('PA-5 detail 只带键名且有长度上限（不整坨 payload 进日志）',
  /keys=foo,bar,baz/.test(String(a1.detail || '')) && String(a1.detail || '').length <= 80,
  JSON.stringify(a1.detail));

// ---------- PA-6..PA-7 校验器自身异常：放行 + 留痕（带异常消息） ----------
reset();
PV._handlers.__boom = function () { throw new Error('审计探针异常'); };
var warn0 = console.warn;
console.warn = function () { };
var r2 = PV.validate({ type: '__boom', payload: {} });
console.warn = warn0;
ok('PA-6 校验器自身异常仍然放行（不阻塞）', !!(r2 && r2.ok === true), JSON.stringify(r2));
ok('PA-7 异常放行写进 actions 且带异常消息',
  countKind('audit:proposal_validator/crash') === 1 && /审计探针异常/.test(String((actList()[0] || {}).detail || '')),
  JSON.stringify(actList()[0] || {}));

// ---------- PA-8..PA-10 限流 ----------
reset();
for (var i = 0; i < 20; i++) PV.validate({ type: 'flood_op', payload: { i: i } });
var floodN = countKind('audit:proposal_validator/unknown_op:flood_op');
ok('PA-8 限流：同 kind+type 每局最多 5 条（实测 ' + floodN + '）', floodN === 5);
ok('PA-9 限流：跨上限只补一条 audit_limited 汇总', countKind('audit_limited') === 1,
  '实测 ' + countKind('audit_limited'));
for (var j = 0; j < 20; j++) PV.validate({ type: 'other_op', payload: { j: j } });
ok('PA-10 限流按 kind+type 分组（另一个 type 仍能记满 5 条）',
  countKind('audit:proposal_validator/unknown_op:other_op') === 5,
  '实测 ' + countKind('audit:proposal_validator/unknown_op:other_op'));

// ---------- PA-11 clear() 复位「每局」计数 ----------
reset();
for (var k1 = 0; k1 < 5; k1++) PV.validate({ type: 'flood_op', payload: {} });
reset();
for (var k2 = 0; k2 < 5; k2++) PV.validate({ type: 'flood_op', payload: {} });
ok('PA-11 clear() 复位每局计数（诊断页清空后可重新记满）',
  countKind('audit:proposal_validator/unknown_op:flood_op') === 5,
  '实测 ' + countKind('audit:proposal_validator/unknown_op:flood_op'));

// ---------- PA-12 ErrorLog 缺失时不阻塞校验 ----------
var savedEL = globalThis.ErrorLog;
try { delete globalThis.ErrorLog; } catch (e) { globalThis.ErrorLog = undefined; }
var r3 = null, threw = null;
try { r3 = PV.validate({ type: 'no_errorlog_op', payload: {} }); } catch (e4) { threw = e4; }
globalThis.ErrorLog = savedEL;
ok('PA-12 ErrorLog 缺失时静默降级（不抛、仍放行）',
  !threw && !!(r3 && r3.ok === true), threw ? String(threw.message) : JSON.stringify(r3));

// ---------- PA-13 诊断报告里能反查到审计行 ----------
reset();
PV.validate({ type: 'report_probe_op', payload: { z: 1 } });
var rep = '';
try { rep = core.getReport(); } catch (e5) { rep = 'ERR:' + e5.message; }
ok('PA-13 审计行出现在诊断报告（最近 50 条行为日志）',
  rep.indexOf('audit:proposal_validator/unknown_op:report_probe_op') >= 0);

// ---------- PA-14..PA-19 源码守卫：改动被回退时立刻红 ----------
var coreSrc = fs.readFileSync(path.join(ROOT, 'engine', 'error_log_core.js'), 'utf8');
var pvSrc = fs.readFileSync(path.join(ROOT, 'engine', 'proposal_validator.js'), 'utf8');
ok('PA-14 源码：core 契约对象在 action 之后导出 audit',
  /record: recordError,\s*\n\s*action: recordAction,\s*\n\s*audit: audit,/.test(coreSrc));
ok('PA-15 源码：审计限流上限 = 5', /var AUDIT_LIMIT = 5;/.test(coreSrc));
ok('PA-16 源码：未知类型分支先审计再放行',
  /this\._audit\('unknown_op', type, pl\);\s*\n\s*return \{ ok: true \};/.test(pvSrc));
ok('PA-17 源码：catch 分支先审计再放行',
  /this\._audit\('crash', type, e\);[\s\S]{0,200}?return \{ ok: true \};/.test(pvSrc));
ok('PA-18 源码：审计走 ErrorLog.audit 且 kind 前缀固定',
  pvSrc.indexOf("ErrorLog.audit('proposal_validator'") >= 0);
ok('PA-19 源码：core 的 actions 环上限仍是 200（审计不得把环撑大）',
  /var MAX_ACTIONS = 200;/.test(coreSrc));

console.log('');
console.log('PROPOSAL_AUDIT_SMOKE: ' + okN + ' ok, ' + failN + ' failed');
if (failN > 0) process.exit(1);

// ============================================================
// 单元测试跑批器（P54·第15条）
// 扫描 tests/unit/*_unit.js（下划线开头的公共脚手架不算套件），逐个用子进程跑，
// 汇总套件数/断言数/耗时，任一失败则退出码 1。
// P57 硬化：① 崩溃到「没有 SUMMARY」的套件也算失败（旧实现只累加 SUMMARY 里的失败数，
//   套件崩了反而静默变绿）；② 失败时打印 ::error:: annotation 带失败套件名 —— 公开仓的
//   annotations API 无需鉴权即可读，job 日志下载要鉴权（见 .github/workflows/smoke.yml）。
// 与 tools/run_all_smokes.js 的关系：互不包含 —— run_all_smokes 只匹配 /_smoke\.js$/，
// 本跑批器只匹配 /_unit\.js$/，所以补单测不会改动 37 套 / 2502 条断言的 smoke 基线。
// 用法：node tools/run_unit_tests.js
// ============================================================
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'tests', 'unit');

if (!fs.existsSync(DIR)) {
  console.log('UNIT_END SUITES=0 UNIT_OK=0 UNIT_FAIL=0 NOTE=no-tests-dir');
  process.exit(0);
}

const files = fs.readdirSync(DIR).filter(function(f) {
  return /_unit\.js$/.test(f) && f.charAt(0) !== '_';
}).sort();

const started = Date.now();
let ok = 0;
let fail = 0;
const bad = [];
const badDetail = [];

files.forEach(function(f) {
  const abs = path.join(DIR, f);
  const r = spawnSync(process.execPath, [abs], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/SUMMARY:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
  const p = m ? Number(m[1]) : 0;
  const q = m ? Number(m[2]) : 0;
  ok += p;
  fail += q;
  if (r.status === 0 && m && q === 0) {
    console.log('OK   ' + f + '（' + p + ' 条）');
  } else {
    bad.push(f);
    // 没有 SUMMARY 说明套件根本没跑完（崩溃 / 超时被杀），这时 q 是 0
    const why = m ? (p + ' 通过 / ' + q + ' 失败，exit=' + r.status)
                  : ('没有 SUMMARY（套件没跑完，可能崩溃），exit=' + r.status);
    console.log('FAIL ' + f + '（' + why + '）');
    const lines = out.split(/\r?\n/);
    const failsOfSuite = lines.filter(function(l) { return l.indexOf('FAIL: ') === 0; });
    failsOfSuite.forEach(function(l) { console.log('     ' + l); });
    // P57：annotation 只带套件名时，看详情仍要能免鉴权拿到 —— 把第一条断言失败原文
    // 一并塞进 annotation（GitHub annotation 是单行，故截断），并把这套的输出尾巴
    // 打进 step 日志（CI 里 tee 成 rn_unit_*.log 随 artifact 上传，仍无需 token）。
    if (failsOfSuite.length) badDetail.push(f + ' → ' + failsOfSuite[0].slice(6, 160));
    else badDetail.push(f + '（无 FAIL 行，疑似崩溃）');
    console.log('     --- ' + f + ' 输出末尾 ---');
    lines.slice(-12).forEach(function(l) { if (l.trim()) console.log('     ' + l); });
  }
});

console.log('');
console.log('UNIT_END SUITES=' + files.length + ' UNIT_OK=' + ok + ' UNIT_FAIL=' + fail +
  ' BAD_SUITES=' + bad.length + ' DURATION=' + Math.round((Date.now() - started) / 1000) + 's');
// P57：失败时把失败套件名写进 GitHub annotation —— annotations API 无需鉴权即可读，
// 而 job 日志下载要鉴权（见 .github/workflows/smoke.yml 的 flake 取证注释）。
// 本地跑只是多一行普通输出，不影响任何人。
if (bad.length) {
  console.log('::error title=单元测试失败::' + badDetail.join(' ｜ ').slice(0, 700) +
    '（失败套件与首条断言；详见 job 日志或 rn_unit_*.log artifact）');
}
// 退出码必须把「崩溃到没有 SUMMARY」也算失败：只累加 SUMMARY 里的失败数会让崩溃静默变绿。
process.exit((fail || bad.length) ? 1 : 0);

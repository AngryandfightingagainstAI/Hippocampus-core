// ============================================================
// 单元测试跑批器（P54·第15条）
// 扫描 tests/unit/*_unit.js（下划线开头的公共脚手架不算套件），逐个用子进程跑，
// 汇总套件数/断言数/耗时，任一失败则退出码 1。
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
    console.log('FAIL ' + f + '（' + p + ' 通过 / ' + q + ' 失败，exit=' + r.status + '）');
    out.split(/\r?\n/).filter(function(l) { return l.indexOf('FAIL: ') === 0; }).forEach(function(l) {
      console.log('     ' + l);
    });
  }
});

console.log('');
console.log('UNIT_END SUITES=' + files.length + ' UNIT_OK=' + ok + ' UNIT_FAIL=' + fail +
  ' BAD_SUITES=' + bad.length + ' DURATION=' + Math.round((Date.now() - started) / 1000) + 's');
process.exit(fail ? 1 : 0);

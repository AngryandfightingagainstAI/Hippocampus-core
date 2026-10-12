// ============================================================
// tools/run_all_smokes.js —— 手机仓（RN）全量 smoke 跑批器（P53·④ 入库）
//
// 存在理由（Kimi 评估清单第 ④ 条，用户 2026-10-08 裁决）：
//   手机仓此前没有**仓库内**的跑批器——「一键全跑」一直是我在交付目录里临时拼的循环
//   （D:\AI文游\神秘小引擎测试版\p24_rn_all.js，依赖机器上的绝对路径）。
//   换台机器 / 交给 CI / 交给别人复现时，第 4 步「跑回归」没有可执行的入口。
//   本文件把它搬进仓库，并改成自定位：RN = path.join(__dirname, '..')，
//   cwd 随意、不读环境变量、可被 GitHub Actions 直接调用（见 .github/workflows/smoke.yml）。
//
// 跑法：node tools/run_all_smokes.js [--only a_smoke.js,b_smoke.js] [--list] [--timeout <ms>]
// 输出：每套一行（✓/✗ + 该套汇总行 + 秒数 + exit），结尾一行机器可读总计：
//   RN_ALL_END SUITES=<套数> TOTAL_OK=<断言数> TOTAL_FAIL=<失败数> BAD_SUITES=<非零退出/有红条套数> DURATION=<秒>s
// 退出码：0 = 全绿；1 = 有 bad suite（CI 靠它判定）
// 全量日志：%TEMP%/rn_all_<时间>.log（每套 stdout+stderr 原样留在里面，便于事后查）
//
// 注意：4 套 smoke 真的 require('react') / require('react-test-renderer')
//   （file_picker / h6_panels / mobile_ux / theme_switch 等按需转译 JSX），
//   所以干净环境里要先 npm ci —— CI 里已这么写。
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const RN = path.join(__dirname, '..');          // 自定位：不依赖 cwd，也不读 HIPPOCAMPUS_RN
const TOOLS = path.join(RN, 'tools');
const args = process.argv.slice(2);
const onlyArg = (args.find(function (a) { return a.indexOf('--only=') === 0 || a === '--only'; }) || '');
let only = [];
if (args.indexOf('--only') >= 0) only = String(args[args.indexOf('--only') + 1] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
else if (onlyArg.indexOf('--only=') === 0) only = onlyArg.slice(7).split(',').map(function (s) { return s.trim(); }).filter(Boolean);

const timeoutArg = args.find(function (a) { return a.indexOf('--timeout=') === 0; }) || '';
const tIdx = args.indexOf('--timeout');
const TIMEOUT = Number((timeoutArg ? timeoutArg.slice(10) : (tIdx >= 0 ? args[tIdx + 1] : 0)) || 600000);

let files = fs.readdirSync(TOOLS).filter(function (f) { return /_smoke\.js$/.test(f) && f[0] !== '_'; }).sort();
if (only.length) files = files.filter(function (f) { return only.indexOf(f) >= 0; });

if (args.indexOf('--list') >= 0) { files.forEach(function (f) { console.log(f); }); process.exit(0); }

const logPath = path.join(os.tmpdir(), 'rn_all_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.log');
const logFd = fs.openSync(logPath, 'w');
const log = function (s) { fs.writeSync(logFd, s + '\n'); };

console.log('手机仓跑批：' + files.length + ' 套（' + RN + '）');
console.log('node ' + process.version + ' · 单套超时 ' + (TIMEOUT / 1000) + 's');
console.log('日志：' + logPath);
console.log('---------------------------------');

let totals = { ok: 0, fail: 0, skip: 0 }, badSuites = [], t0 = Date.now();
files.forEach(function (f, i) {
  const full = path.join(TOOLS, f);
  const outPath = path.join(os.tmpdir(), 'rn_one_' + f + '.log');
  const fd = fs.openSync(outPath, 'w');
  let res;
  const started = Date.now();
  try {
    res = cp.spawnSync(process.execPath, [full], { cwd: RN, stdio: ['ignore', fd, fd], timeout: TIMEOUT, windowsHide: true });
  } finally { fs.closeSync(fd); }
  const text = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  try { fs.unlinkSync(outPath); } catch (e) { /* 清不掉就留着 */ }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sumLine = lines.slice().reverse().find(function (l) { return /\d+ ok,\s*\d+ failed/.test(l); }) || '(无汇总行)';
  const m = sumLine.match(/(\d+)\s*ok,\s*(\d+)\s*failed/);
  if (m) { totals.ok += Number(m[1]); totals.fail += Number(m[2]); }
  const msk = sumLine.match(/(\d+)\s*skipped/);
  if (msk) totals.skip += Number(msk[1]);
  const fails = lines.filter(function (l) { return /^FAIL\b/.test(l); });
  const exit = res ? res.status : null;
  const bad = (exit !== 0) || (m && Number(m[2]) > 0) || !m;
  if (bad) badSuites.push({ file: f, exit: exit, sum: sumLine.trim(), fails: fails.slice(0, 8) });
  const mark = bad ? '✗' : '✓';
  console.log(mark + ' [' + String(i + 1).padStart(2) + '/' + files.length + '] ' + f.padEnd(34) + sumLine.trim() + '   (' + ((Date.now() - started) / 1000).toFixed(1) + 's, exit=' + exit + ')');
  log('=== ' + f + ' exit=' + exit + ' ===\n' + text);
});

console.log('---------------------------------');
console.log('RN_ALL_END SUITES=' + files.length + ' TOTAL_OK=' + totals.ok + ' TOTAL_FAIL=' + totals.fail + ' TOTAL_SKIP=' + totals.skip + ' BAD_SUITES=' + badSuites.length + ' DURATION=' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
if (badSuites.length) {
  console.log('非零退出/有红条的套件：');
  badSuites.forEach(function (b) {
    console.log('  - ' + b.file + '（exit=' + b.exit + '）：' + b.sum);
    b.fails.forEach(function (l) { console.log('      ' + l); });
  });
}
fs.closeSync(logFd);
process.exit(badSuites.length ? 1 : 0);

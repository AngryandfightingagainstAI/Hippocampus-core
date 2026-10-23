// P49 守卫：产品版本号必须「一处口径、两仓同步」。
//
// 背景（P49 的由来）：P1→P48 四十多轮里版本号一次都没动过 —— 桌面 package.json 停在
//   1.1.0、手机 package.json 还是 RN CLI 模板默认的 0.0.1、Android build.gradle 停在
//   versionCode 1 / versionName "1.0"。三套编号同时存在，而全仓没人读它
//   （桌面 grep getVersion / appVersion / 「关于」 / autoUpdater / electron-updater = 0 命中），
//   所以就算三套互相矛盾，两仓回归也不会红。这个守卫把「版本」变成可验证事实：
//     ① 四处声明（PC package.json / PC package-lock 根版本 / RN package.json /
//        Android versionName）必须是同一个值，且等于本文件顶部的基线；
//     ② versionCode 必须是 versionName 的 major*10000+minor*100+patch 派生值，
//        且不低于 MIN_VERSION_CODE（只增不回退）；
//     ③ 两仓的 tools/version_sync_smoke.js 是逐字节同源件，这里也守一遍；
//     ④ PC dist/latest.yml（如存在）的 version 必须与 package.json 一致 —— 将来若接
//        electron-updater，客户端认的就是它里面的版本。
//
// 改版本的规矩（守卫故意做成「必须显式改基线」）：改四处声明，同时改本文件顶部的
//   EXPECT_VERSION / MIN_VERSION_CODE，并在提交信息里写清为什么 bump。禁止悄悄漂移。
//
// 用法：node tools/version_sync_smoke.js      （cwd 随意，根目录由 __dirname 推）
'use strict';
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var PC_HINT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';
var RN_HINT = process.env.HIPPOCAMPUS_RN || 'D:\\HippocampusRN';

// ---- 版本基线（改版本时这里一起改）----
var EXPECT_VERSION = '1.3.4';
var MIN_VERSION_CODE = 10304;

var okN = 0, failN = 0;
var skipN = 0;
function ok(name, cond, detail) {
  if (cond) { okN++; console.log('ok   ' + name); }
  else { failN++; console.log('FAIL ' + name + (detail ? '  :: ' + detail : '')); }
}
// P53：CI 只有一个仓 —— 跨仓断言在「另一仓不可见」时降级为 SKIP（本机两仓同在时行为不变）。
function skip(name, why) { skipN++; console.log('SKIP ' + name + (why ? '  :: ' + why : '')); }
function okOrSkip(name, cond, detail, side) { if (side) ok(name, cond, detail); else skip(name, detail || '另一仓不可见'); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

function pkgInfo(root) {
  var s = read(path.join(root, 'package.json'));
  if (s === null) return { err: '缺 package.json' };
  try { var j = JSON.parse(s); return { name: j.name, version: j.version }; }
  catch (e) { return { err: 'package.json 不是合法 JSON：' + e.message }; }
}
function lockVersion(root) {
  var s = read(path.join(root, 'package-lock.json'));
  if (s === null) return { err: '缺 package-lock.json' };
  try {
    var j = JSON.parse(s);
    var inner = j.packages && j.packages[''] ? j.packages[''].version : undefined;
    return { root: j.version, inner: inner };
  } catch (e) { return { err: 'package-lock.json 不是合法 JSON：' + e.message }; }
}
function gradleInfo(root) {
  var s = read(path.join(root, 'android', 'app', 'build.gradle'));
  if (s === null) return { err: '缺 android/app/build.gradle' };
  var mName = s.match(/versionName\s+"([^"]+)"/g) || [];
  var mCode = s.match(/versionCode\s+(\d+)/g) || [];
  var one = s.match(/versionName\s+"([^"]+)"/);
  var onec = s.match(/versionCode\s+(\d+)/);
  return {
    versionName: one ? one[1] : undefined,
    versionCode: onec ? Number(onec[1]) : undefined,
    nameDecls: mName.length,
    codeDecls: mCode.length
  };
}
function deriveCode(v) {
  var p = String(v == null ? '' : v).split('.');
  if (p.length !== 3) return null;
  for (var i = 0; i < 3; i++) if (!/^\d+$/.test(p[i])) return null;
  return Number(p[0]) * 10000 + Number(p[1]) * 100 + Number(p[2]);
}
function isSemver(v) { return /^\d+\.\d+\.\d+$/.test(String(v == null ? '' : v)); }

// ---------- 0. 认出「我是哪个仓」，再定对仓根 ----------
var self = pkgInfo(ROOT);
var isPC = self.name === 'hippocampus-core';
var isRN = self.name === 'HippocampusRN';
var PC_ROOT = isPC ? ROOT : PC_HINT;
var RN_ROOT = isRN ? ROOT : RN_HINT;
ok('VS-1 本仓可识别（' + (isPC ? '桌面' : (isRN ? '手机' : '未知')) + '：' + (self.name || String(self.err)) + '）',
  isPC || isRN, 'package.json 的 name 既不是 hippocampus-core 也不是 HippocampusRN');

var pc = pkgInfo(PC_ROOT);
var rn = pkgInfo(RN_ROOT);
var lock = lockVersion(PC_ROOT);
var grad = gradleInfo(RN_ROOT);
var peer = path.join(RN_ROOT, 'tools', 'version_sync_smoke.js');

// P53：站在哪个仓、另一仓是否可见（CI 只有手机仓 ⇒ 桌面侧断言 SKIP，本机两仓同在时照旧全跑）
var PC_SIDE = isPC || !pc.err;
var RN_SIDE = isRN || !rn.err;
var OTHER_SIDE = isPC ? RN_SIDE : PC_SIDE;

okOrSkip('VS-2 两仓仓根都可达', !pc.err && !rn.err,
  'PC=' + (pc.err || 'ok') + ' / RN=' + (rn.err || 'ok'), PC_SIDE && RN_SIDE);

// ---------- 1. 四处声明同一口径 ----------
okOrSkip('VS-3 桌面 package.json version = ' + EXPECT_VERSION + '（实测 ' + pc.version + '）',
  pc.version === EXPECT_VERSION, '桌面 package.json 写的是 ' + pc.version, PC_SIDE);
okOrSkip('VS-4 桌面 package-lock.json 根 version = ' + EXPECT_VERSION + '（实测 ' + lock.root + '，packages[""] = ' + lock.inner + '）',
  !!lock.err ? false : (lock.root === EXPECT_VERSION && (lock.inner === undefined || lock.inner === EXPECT_VERSION)),
  lock.err || ('根 ' + lock.root + ' / packages[""] ' + lock.inner), PC_SIDE);
okOrSkip('VS-5 手机 package.json version = ' + EXPECT_VERSION + '（实测 ' + rn.version + '）',
  rn.version === EXPECT_VERSION, '手机 package.json 写的是 ' + rn.version, RN_SIDE);
okOrSkip('VS-6 Android versionName = ' + EXPECT_VERSION + '（实测 ' + grad.versionName + '）',
  grad.versionName === EXPECT_VERSION, grad.err || ('build.gradle 写的是 ' + grad.versionName), RN_SIDE);

// ---------- 2. versionCode 派生 + 只增不回退 ----------
okOrSkip('VS-7 Android versionCode = versionName 派生值 ' + deriveCode(EXPECT_VERSION) + '（实测 ' + grad.versionCode + '）',
  grad.versionCode === deriveCode(grad.versionName),
  'versionCode ' + grad.versionCode + ' ≠ major*10000+minor*100+patch(' + grad.versionName + ') = ' + deriveCode(grad.versionName), RN_SIDE);
okOrSkip('VS-8 Android versionCode >= 底线 ' + MIN_VERSION_CODE + '（只增不回退）',
  typeof grad.versionCode === 'number' && grad.versionCode >= MIN_VERSION_CODE,
  '实测 ' + grad.versionCode + '（低于底线说明被改小了）', RN_SIDE);
ok('VS-9 基线自身自洽：EXPECT_VERSION 派生的 code ' + deriveCode(EXPECT_VERSION) + ' >= MIN_VERSION_CODE ' + MIN_VERSION_CODE,
  deriveCode(EXPECT_VERSION) !== null && deriveCode(EXPECT_VERSION) >= MIN_VERSION_CODE,
  'EXPECT_VERSION=' + EXPECT_VERSION + ' / MIN_VERSION_CODE=' + MIN_VERSION_CODE);

// ---------- 3. 两仓对文件、格式与「不许出现第四处声明」 ----------
okOrSkip('VS-10 两仓 package.json version 逐字相等（桌面 ' + pc.version + ' / 手机 ' + rn.version + '）',
  pc.version === rn.version, '两仓写的不一样', PC_SIDE && RN_SIDE);
ok('VS-11 三处版本串都是合法 semver（' + [EXPECT_VERSION, pc.version, rn.version].join(' / ') + '）',
  isSemver(EXPECT_VERSION) && (!RN_SIDE || isSemver(rn.version)) && (!PC_SIDE || isSemver(pc.version)),
  '有非法格式（必须是 x.y.z 三段数字）');
okOrSkip('VS-12 build.gradle 里 versionName / versionCode 各只声明一次',
  grad.nameDecls === 1 && grad.codeDecls === 1,
  'versionName 出现 ' + grad.nameDecls + ' 次、versionCode 出现 ' + grad.codeDecls + ' 次（加 flavor 会引入第二处口径）', RN_SIDE);

var appJson = read(path.join(RN_ROOT, 'app.json'));
var appHasVersion = false;
try { appHasVersion = !!appJson && Object.prototype.hasOwnProperty.call(JSON.parse(appJson), 'version'); }
catch (e) { appHasVersion = false; }
okOrSkip('VS-13 手机 app.json 没有引入第二个 version 字段（版本只在 package.json 与 build.gradle）',
  !appHasVersion, 'app.json 里出现了 version ⇒ 版本口径变四处', RN_SIDE);

// ---------- 4. dist/latest.yml（有就守）----------
var ymlPath = path.join(PC_ROOT, 'dist', 'latest.yml');
if (fs.existsSync(ymlPath)) {
  var yml = read(ymlPath) || '';
  var mv = yml.match(/^version:\s*(.+)$/m);
  okOrSkip('VS-14 dist/latest.yml 的 version = package.json version（实测 ' + (mv ? mv[1].trim() : '解析失败') + '）',
    !!mv && mv[1].trim() === pc.version,
    'latest.yml 决定将来 electron-updater 认哪个版本，必须与 package.json 同值', PC_SIDE);
} else {
  ok('VS-14 dist/latest.yml 不存在 ⇒ 跳过（未打包过）', true);
}

// ---------- 5. 本守卫本身两仓逐字节同源 ----------
var selfFile = path.join(ROOT, 'tools', 'version_sync_smoke.js');
var a = fs.readFileSync(selfFile);
if (fs.existsSync(peer)) {
  var b = fs.readFileSync(peer);
  ok('VS-15 两仓 tools/version_sync_smoke.js 逐字节同源（' + a.length + ' B）',
    a.equals(b), '本仓 ' + a.length + ' B vs 对仓 ' + b.length + ' B');
} else {
  okOrSkip('VS-15 对仓 tools/version_sync_smoke.js 存在', false, '缺文件：' + peer, OTHER_SIDE);
}

console.log('');
console.log('VERSION_SYNC_SMOKE: ' + okN + ' ok, ' + failN + ' failed' + (skipN ? ', ' + skipN + ' skipped' : ''));
if (failN > 0) process.exit(1);

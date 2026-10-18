#!/usr/bin/env node
// ============================================================
// 两仓同源件登记册 · 单源化工具（P66）
//
// 背景（用户 m14969 之前的那轮 review）：两仓共用同一套 engine/，过去靠
//   「人肉同步 + 每个守卫各记一份整文件 MD5」来维持，代价是
//   ① 改一个共享文件要在两仓各改一遍，还要在 4 个冒烟脚本里重算 6~20 个指纹；
//   ② 指纹按磁盘字节算，一次 git 的全仓行尾翻转（P65 的 CI 就是这么红的）会把
//      一大片「内容其实没变」的断言全部弄红，排查方向被带偏。
//
// 本工具把「谁和谁是同一份文件」收进一份登记册（engine_sync_manifest.json）：
//   · mirror —— 内容同源（行尾差异允许，比较时按 LF 归一）。canonical 是手机仓，
//              `--write` 会把手机仓的字节写进桌面仓（保留桌面侧原有的行尾风格）。
//   · fork   —— 两仓**故意不同**（平台碎片）。登记两侧各自的行尾归一哈希；
//              任何一侧变了就红，并在报错里点名是哪一侧变了。
//
// 用法：
//   node tools/engine_sync.js --check           # 守卫用；漂移则退出码 1
//   node tools/engine_sync.js --check --json    # 机器可读（单测/CI 用）
//   node tools/engine_sync.js --write           # 把 mirror 件从手机仓推到桌面仓
//   node tools/engine_sync.js --regen           # 重算登记册（人工确认后跑）
//   node tools/engine_sync.js --list            # 打印三张清单
//
// 环境变量：HIPPOCAMPUS_PC 覆盖桌面仓根（默认本机路径）。
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RN_ROOT = path.resolve(__dirname, '..');
const DESK_ROOT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';
const MANIFEST_PATH = path.join(__dirname, 'engine_sync_manifest.json');

// 与 tests/unit/test_p53_license_docs.js 的 collectJs 保持一致：跳过非源码目录
const SKIP_DIR = /(^|\/)(node_modules|android|build|dist|docs|ios|vendor|\.git)(\/|$)/;

function collectJs(root, rel, out) {
  rel = rel || '';
  out = out || [];
  let ents = [];
  try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIR.test('/' + r + '/')) collectJs(root, r, out);
    } else if (e.name.endsWith('.js')) out.push(r);
  }
  return out;
}

function lfText(buf) { return buf.toString('utf8').split('\r\n').join('\n'); }
function md5lf(buf) { return crypto.createHash('md5').update(lfText(buf), 'utf8').digest('hex').toUpperCase(); }
function hasCrlf(buf) { return buf.indexOf('\r\n') >= 0; }
function readOrNull(p) { try { return fs.readFileSync(p); } catch (e) { return null; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

function gitHead(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch (e) { return null; }
}

// 行数级差异统计（只用于报错时说「差在哪几行」，不做语义判断）
function diffLineCount(aText, bText) {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const n = Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}

// ---------- 分类（--regen / --check 共用） ----------
function classify() {
  const res = { mirror: [], mirrorEol: [], fork: {}, unsharedDesktop: [], unsharedRn: [] };
  const deskFiles = collectJs(DESK_ROOT);
  const seen = new Set();
  for (const rel of deskFiles) {
    const pa = path.join(DESK_ROOT, rel);
    const pb = path.join(RN_ROOT, rel);
    const A = readOrNull(pa);
    const B = readOrNull(pb);
    if (!B) { res.unsharedDesktop.push(rel); continue; }
    seen.add(rel);
    if (A.equals(B)) { res.mirror.push(rel); continue; }
    const la = lfText(A);
    const lb = lfText(B);
    if (la === lb) { res.mirror.push(rel); res.mirrorEol.push(rel); continue; }
    res.fork[rel] = {
      rn: md5lf(B),
      desktop: md5lf(A),
      diffLines: diffLineCount(la, lb)
    };
  }
  for (const rel of collectJs(RN_ROOT)) {
    if (!seen.has(rel) && !res.unsharedDesktop.includes(rel)) res.unsharedRn.push(rel);
  }
  res.mirror.sort();
  res.mirrorEol.sort();
  res.unsharedDesktop.sort();
  res.unsharedRn.sort();
  return res;
}

function buildManifest(cls, reason) {
  const forks = {};
  Object.keys(cls.fork).sort().forEach(function (k) { forks[k] = cls.fork[k]; });
  return {
    v: 1,
    note: '两仓同源件登记册。mirror = 内容同源（行尾差异允许）；fork = 故意不同，锁两侧行尾归一哈希。'
      + ' 改共享文件请改手机仓（canonical）后跑 --write；改 fork 件请两侧同改后跑 --regen。',
    reason: reason || '',
    recordedAt: new Date().toISOString().slice(0, 19) + 'Z',
    heads: { rn: gitHead(RN_ROOT), desktop: gitHead(DESK_ROOT) },
    counts: {
      mirror: cls.mirror.length,
      mirrorEol: cls.mirrorEol.length,
      fork: Object.keys(cls.fork).length,
      unsharedDesktop: cls.unsharedDesktop.length,
      unsharedRn: cls.unsharedRn.length
    },
    mirror: cls.mirror,
    mirrorEol: cls.mirrorEol,
    fork: forks
  };
}

function loadManifest() {
  const t = readText(MANIFEST_PATH);
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

// ---------- --check ----------
function check(opts) {
  const out = { ok: true, failures: [], notes: [], counts: {} };
  function fail(msg) { out.ok = false; out.failures.push(msg); }

  const mf = loadManifest();
  if (!mf) {
    fail('登记册不存在或不是合法 JSON：' + MANIFEST_PATH + '（先跑 node tools/engine_sync.js --regen）');
    return finish();
  }
  if (!fs.existsSync(DESK_ROOT)) {
    out.skipped = true;
    out.notes.push('桌面仓不可见，跳过同源校验（' + DESK_ROOT + '）');
    return finish();
  }

  const mirror = Array.isArray(mf.mirror) ? mf.mirror : [];
  const fork = mf.fork || {};
  const registered = new Set(mirror.concat(Object.keys(fork)));

  // 1) mirror：内容必须同源（允许行尾差异）
  let eolOnly = 0;
  for (const rel of mirror) {
    const A = readOrNull(path.join(DESK_ROOT, rel));
    const B = readOrNull(path.join(RN_ROOT, rel));
    if (!A || !B) {
      fail('mirror 缺文件：' + rel + (A ? '（手机仓缺）' : '（桌面仓缺）'));
      continue;
    }
    if (A.equals(B)) continue;
    if (lfText(A) === lfText(B)) { eolOnly++; continue; }
    fail('mirror 内容已漂移：' + rel + '（差 ' + diffLineCount(lfText(A), lfText(B))
      + ' 行；改手机仓后跑 --write，或两侧手动对齐）');
  }

  // 2) fork：两侧哈希都要与登记一致
  for (const rel of Object.keys(fork)) {
    const rec = fork[rel] || {};
    const A = readOrNull(path.join(DESK_ROOT, rel));
    const B = readOrNull(path.join(RN_ROOT, rel));
    if (!A || !B) {
      fail('fork 缺文件：' + rel + (A ? '（手机仓缺）' : '（桌面仓缺）'));
      continue;
    }
    const rnChanged = rec.rn && md5lf(B) !== rec.rn;
    const deskChanged = rec.desktop && md5lf(A) !== rec.desktop;
    if (rnChanged && deskChanged) {
      fail('fork 两侧都变了：' + rel + '（确实两侧同改就重跑 --regen）');
    } else if (rnChanged) {
      fail('fork 手机侧变了：' + rel + '（预期 ' + rec.rn + '，实际 ' + md5lf(B) + '）');
    } else if (deskChanged) {
      fail('fork 桌面侧变了：' + rel + '（预期 ' + rec.desktop + '，实际 ' + md5lf(A) + '）');
    }
  }

  // 3) 未登记的共有文件（新文件必须登记，否则「单源」会悄悄漏掉它）
  const deskFiles = collectJs(DESK_ROOT);
  for (const rel of deskFiles) {
    if (registered.has(rel)) continue;
    if (!fs.existsSync(path.join(RN_ROOT, rel))) continue;
    fail('未登记的共有文件：' + rel + '（两仓都有但登记册没记；跑 --regen 写入）');
  }

  out.counts = {
    mirror: mirror.length,
    mirrorEol: eolOnly,
    fork: Object.keys(fork).length,
    failures: out.failures.length
  };
  if (out.ok) {
    out.notes.push('mirror ' + mirror.length + ' 个同源（其中 ' + eolOnly + ' 个仅行尾不同）');
    out.notes.push('fork ' + Object.keys(fork).length + ' 个（两侧哈希均与登记一致）');
  }
  return finish();

  function finish() {
    if (opts.json) {
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } else {
      out.notes.forEach(function (n) { console.log('OK: ' + n); });
      out.failures.forEach(function (f) { console.log('FAIL: ' + f); });
      if (out.skipped) console.log('SKIP: 桌面仓不可见');
      console.log(out.ok ? 'ENGINE_SYNC: ok' : 'ENGINE_SYNC: ' + out.failures.length + ' 处漂移');
    }
    return out.ok ? 0 : 1;
  }
}

// ---------- --write ----------
// 关键：分类必须按**登记册**来，不能按「现在两侧像不像」——
//   否则一个漂移过的 mirror 件会因为「现在有差异」被误判成 fork 件而拒绝自愈
//   （P66 首次实测就是这么卡住的：--write 写入 0 个）。
function write(opts) {
  const mf = loadManifest();
  if (!mf) { console.log('FAIL: 登记册不存在，先跑 --regen'); return 1; }
  const mirror = Array.isArray(mf.mirror) ? mf.mirror : [];
  const forks = Object.keys(mf.fork || {});
  let n = 0;
  let same = 0;
  for (const rel of mirror) {
    const pa = path.join(DESK_ROOT, rel);
    const pb = path.join(RN_ROOT, rel);
    const A = readOrNull(pa);
    const B = readOrNull(pb);
    if (!A || !B) { console.log('SKIP: 缺文件 ' + rel); continue; }
    if (A.equals(B)) { same++; continue; }
    if (lfText(A) === lfText(B)) { same++; continue; }   // 仅行尾不同：不动磁盘
    // 内容漂移：以手机仓为准写入桌面仓，保留桌面侧原来的行尾风格
    let text = lfText(B);
    if (hasCrlf(A)) text = text.split('\n').join('\r\n');
    fs.writeFileSync(pa, text, 'utf8');
    console.log('WROTE: ' + rel + (hasCrlf(A) ? '（CRLF）' : '（LF）'));
    n++;
  }
  forks.forEach(function (rel) { console.log('MANUAL: ' + rel + ' 是 fork 件，需两侧手工同改（改完 --regen）'); });
  // 未登记但两仓都有的文件：提示先登记，否则以后漏管
  const registered = new Set(mirror.concat(forks));
  collectJs(DESK_ROOT).forEach(function (rel) {
    if (registered.has(rel)) return;
    if (fs.existsSync(path.join(RN_ROOT, rel))) console.log('UNREG: ' + rel + ' 两仓都有但未登记（跑 --regen）');
  });
  console.log('ENGINE_SYNC: 写入 ' + n + ' 个 mirror 件，' + same + ' 个已一致'
    + (forks.length ? '，' + forks.length + ' 个 fork 件跳过' : ''));
  return 0;
}

// ---------- main ----------
const argv = process.argv.slice(2);
const has = function (f) { return argv.indexOf(f) >= 0; };
const opts = { json: has('--json') };

if (has('--regen')) {
  const cls = classify();
  const mf = buildManifest(cls, argv[argv.indexOf('--reason') + 1] || '');
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(mf, null, 2) + '\n', 'utf8');
  console.log('REGEN: ' + MANIFEST_PATH);
  console.log('  mirror=' + mf.counts.mirror + '（含仅行尾不同 ' + mf.counts.mirrorEol + '）'
    + ' fork=' + mf.counts.fork
    + ' 桌面独有=' + mf.counts.unsharedDesktop + ' 手机独有=' + mf.counts.unsharedRn);
  process.exit(0);
}

if (has('--write')) process.exit(write(opts));

if (has('--list')) {
  const cls = classify();
  console.log('mirror ' + cls.mirror.length + '：');
  cls.mirror.forEach(function (r) { console.log('  ' + r + (cls.mirrorEol.indexOf(r) >= 0 ? '   [仅行尾不同]' : '')); });
  console.log('fork ' + Object.keys(cls.fork).length + '：');
  Object.keys(cls.fork).forEach(function (r) { console.log('  ' + r + '   diffLines=' + cls.fork[r].diffLines); });
  process.exit(0);
}

// 默认就是 --check
process.exit(check(opts));

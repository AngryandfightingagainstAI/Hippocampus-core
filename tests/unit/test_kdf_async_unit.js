// ============================================================
// P61 守卫：长口令 KDF 不许冻住界面（真机 PBKDF2 100000 轮 ≈ 8.4 s）
//
// 背景（2026-10-17 真机 1.3.1 实测）：
//   · 带口令导出：从点「导出」到系统分享面板出现 ELAPSED_MS=8403 / 8426（两次），
//     空口令（明文，不走 PBKDF2）= 73 ms —— 差别就是 100000 轮 PBKDF2。
//   · 桌面 V8 同实现对照：iter=1000 → 22 ms、20000 → 128 ms、100000 → 689 ms，
//     即 Hermes 上慢约 12 倍；这 8.4 s 里 JS 线程被同步占满，连「正在加密」都刷不出来。
// 修法：vfs/secure_envelope.js 增 pbkdf2Async / encryptAsync / decryptAsync /
//   wrapAsync / unwrapAsync —— 同一个 KDF，按 chunk 分块，每块 await 一帧再算；
//   rn/export_util.js 增 secureWrapAsync / secureUnwrapAsync / progressReporter，
//   三个屏幕（存档导出、卡带导出、存档导入、卡带导入）改走异步版并就地刷百分比。
// 本套钉住：
//   A1 同步/异步 KDF 逐字节一致（分块不许改算法）
//   A2 固定 salt/nonce 下 encrypt 与 encryptAsync 产出同一段信封文本（可互相解开）
//   A3 进度回调单调、末次 = 100%
//   A4 错口令/被改动 仍走原来的 reason，async 版不许把失败说成成功
//   A5 wrapAsync/unwrapAsync 的空口令 = 明文语义不变
//   A6 export_util 的异步壳：有 *Async 就用、没有就回落同步（旧桩/老模块不炸）
//   A7 progressReporter 节流：同一百分比不重复刷、步长够大才刷
//   A8 源码守卫：三个屏幕不再用同步 secureWrap/secureUnwrap；导出表齐全
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const ROOT = path.resolve(__dirname, '..', '..');
const SE_PATH = 'vfs/secure_envelope.js';
const EU_PATH = 'rn/export_util.js';

const SE = require(path.join(ROOT, SE_PATH));
const I = SE._internals;

function hex(u8) { return Buffer.from(u8).toString('hex'); }

// ---------- A1 同步 / 异步 KDF 逐字节一致 ----------
H.run('A1 pbkdf2 与 pbkdf2Async 同输入同输出（分块不改算法）', function () {
  const cases = [
    { pw: 'test1234', salt: '0123456789abcdef', iter: 1, len: 64 },
    { pw: 'test1234', salt: '0123456789abcdef', iter: 999, len: 64 },
    { pw: '', salt: '', iter: 1, len: 32 },
    { pw: '口令带中文', salt: '盐', iter: 1000, len: 16 }
  ];
  return cases.reduce(function (p, c) {
    return p.then(function () {
      const a = hex(I.pbkdf2(I.utf8Encode(c.pw), I.utf8Encode(c.salt), c.iter, c.len));
      return I.pbkdf2Async(I.utf8Encode(c.pw), I.utf8Encode(c.salt), c.iter, c.len, { chunk: 37 })
        .then(function (b) {
          H.eq(hex(b), a, 'iter=' + c.iter + ' len=' + c.len + ' 的派生值应逐字节相同');
        });
    });
  }, Promise.resolve());
});

// ---------- A2 固定 salt/nonce：sync 与 async 的信封文本完全相同 ----------
H.run('A2 固定 salt/nonce 下 encrypt 与 encryptAsync 产出同一段信封（可互相解开）', function () {
  const salt = new Uint8Array(16); for (let i = 0; i < 16; i++) salt[i] = i;
  const nonce = new Uint8Array(12); for (let i = 0; i < 12; i++) nonce[i] = 200 + i;
  const sync = SE.encrypt('中文内容 test', 'pw', { iter: 800, salt: salt, nonce: nonce });
  return SE.encryptAsync('中文内容 test', 'pw', { iter: 800, salt: salt, nonce: nonce, kdf: { chunk: 100 } })
    .then(function (asy) {
      H.eq(asy.ok, true, 'encryptAsync 应成功');
      H.eq(asy.text, sync.text, '同一 salt/nonce/明文/口令 ⇒ 信封文本应逐字相同');
      H.eq(SE.decrypt(asy.text, 'pw').text, '中文内容 test', '同步解密能开异步产物');
      return SE.decryptAsync(sync.text, 'pw', { kdf: { chunk: 100 } }).then(function (d) {
        H.eq(d.ok, true, '异步解密能开同步产物');
        H.eq(d.text, '中文内容 test', '明文一致');
      });
    });
});

// ---------- A3 进度回调 ----------
H.run('A3 KDF 进度单调、末次打满（屏幕层才能显示「正在加密 x%」）', function () {
  const seen = [];
  return I.pbkdf2Async(I.utf8Encode('p'), I.utf8Encode('s'), 5000, 64, {
    chunk: 64,
    onProgress: function (done, total) { seen.push([done, total]); }
  }).then(function () {
    H.ok(seen.length >= 2, '至少回调两次，实际 ' + seen.length);
    const mono = seen.every(function (v, i) { return i === 0 || v[0] >= seen[i - 1][0]; });
    H.eq(mono, true, 'done 单调不减');
    const last = seen[seen.length - 1];
    H.eq(last[0], last[1], '末次 done === total（打满 100%）');
    // 总工作量 = 输出块数 × 轮数：dkLen=64 ⇒ 2 个 32 字节块 ⇒ 2 × 5000
    H.eq(last[1], 10000, 'total = ceil(len/32) × iter');
  });
});

// ---------- A4 失败语义不变 ----------
H.run('A4 错口令 / 被改动 在异步版里仍是 {ok:false, reason}，不许说成功', function () {
  const env = SE.encrypt('secret', 'right', { iter: 500 });
  return SE.decryptAsync(env.text, 'wrong', { kdf: { chunk: 100 } }).then(function (bad) {
    H.eq(bad.ok, false, '错口令必须 ok:false');
    H.contains(String(bad.reason), '口令不对', 'reason 仍说「口令不对，或文件被改动过」');
    return SE.decryptAsync(env.text, '', { kdf: { chunk: 100 } }).then(function (empty) {
      H.eq(empty.ok, false, '空口令必须 ok:false');
      H.eq(empty.reason, '口令为空', '空口令原文案');
    });
  });
});

// ---------- A5 空口令 = 明文 ----------
H.run('A5 wrapAsync 空口令 ⇒ 明文放行；unwrapAsync 明文原样返回', function () {
  return SE.wrapAsync('abc', '').then(function (w) {
    H.eq(w.ok, true, 'wrapAsync 空口令应成功');
    H.eq(w.encrypted, false, 'encrypted 应为 false（明文语义）');
    H.eq(w.text, 'abc', '文本原样');
    return SE.unwrapAsync('plain text', 'pw').then(function (u) {
      H.eq(u.ok, true, '非信封原样放行');
      H.eq(u.text, 'plain text', '明文不被改写');
      H.eq(u.encrypted, false, 'encrypted=false');
    });
  });
});

// ---------- A6 export_util 异步壳 ----------
function makeEuSandbox(sol) {
  const sb = H.makeSandbox({
    module: { exports: {} },
    require: function (p) {
      if (p === 'react-native') return { Share: { share: function () { return Promise.resolve({ action: 'dismissedAction' }); } }, Clipboard: { setString: function () {} } };
      if (p === '../vfs/secure_envelope.js') return sol;
      if (p === '../vfs/vfs.js') return { readFile: function () { return null; }, list: function () { return []; } };
      if (p === '../settings_model.js') return {};
      if (p === './rn_platform.js') return {};
      return {};
    }
  });
  return sb;
}

H.run('A6 export_util：有 *Async 就走异步、没有就回落同步（老桩不炸）', function () {
  const calls = [];
  const realLike = {
    isEnvelope: function (s) { return String(s).indexOf('ai_tg_secure') >= 0; },
    wrapAsync: function (text, pass, opts) {
      calls.push(opts && opts.kdf);
      return Promise.resolve({ ok: true, text: 'ENV(' + text + ')', encrypted: true });
    },
    unwrapAsync: function (text, pass, opts) {
      calls.push(opts && opts.kdf);
      return Promise.resolve({ ok: true, text: 'PLAIN', encrypted: true });
    },
    encrypt: function (text) { return { ok: true, text: 'SYNC(' + text + ')' }; },
    decrypt: function () { return { ok: true, text: 'SYNC_PLAIN' }; }
  };
  const sb = makeEuSandbox(realLike);
  H.load(sb, EU_PATH);
  const E = sb.module.exports;
  H.eq(typeof E.secureWrapAsync, 'function', '导出表里有 secureWrapAsync');
  H.eq(typeof E.secureUnwrapAsync, 'function', '导出表里有 secureUnwrapAsync');
  H.eq(typeof E.progressReporter, 'function', '导出表里有 progressReporter');
  const prog = function () {};
  return E.secureWrapAsync('abc', 'pw', { onProgress: prog, chunk: 111 }).then(function (w) {
    H.eq(w.ok, true, '异步封装成功');
    H.eq(w.text, 'ENV(abc)', '走了 wrapAsync');
    H.eq(w.encrypted, true, 'encrypted=true');
    H.eq(calls[0].chunk, 111, 'chunk 透传给 KDF');
    H.eq(calls[0].onProgress, prog, 'onProgress 透传给 KDF');
    return E.secureUnwrapAsync('{"format":"ai_tg_secure"}', 'pw').then(function (u) {
      H.eq(u.ok, true, '异步解封成功');
      H.eq(u.text, 'PLAIN', '走了 unwrapAsync');
      // 回落：只有同步 API 的旧模块
      const sb2 = makeEuSandbox({ isEnvelope: function () { return false; }, encrypt: realLike.encrypt, decrypt: realLike.decrypt });
      H.load(sb2, EU_PATH);
      const E2 = sb2.module.exports;
      return E2.secureWrapAsync('x', 'pw').then(function (w2) {
        H.eq(w2.text, 'SYNC(x)', '没有 wrapAsync 时回落同步 encrypt');
      });
    });
  });
});

// ---------- A7 progressReporter 节流 ----------
H.run('A7 progressReporter：同百分比不重复刷、跳小于步长不刷、打满必刷', function () {
  const sb = makeEuSandbox({ isEnvelope: function () { return false; } });
  H.load(sb, EU_PATH);
  const E = sb.module.exports;
  const out = [];
  const rep = E.progressReporter(function (t) { out.push(t); }, '正在加密');
  rep(0, 1000);        // 0% ⇒ 刷
  rep(1, 1000);        // 0% ⇒ 不刷（同百分比）
  rep(50, 1000);       // 5% ⇒ 不刷（<10 步长，且 last 已 >=0）
  rep(100, 1000);      // 10% ⇒ 刷
  rep(100, 1000);      // 10% ⇒ 不刷
  rep(1000, 1000);     // 100% ⇒ 刷
  H.eq(out.length, 3, '只刷 3 次，实际 ' + JSON.stringify(out));
  H.eq(out[0], '正在加密 0%', '首刷 0%');
  H.eq(out[1], '正在加密 10%', '第二刷 10%');
  H.eq(out[2], '正在加密 100%', '末刷 100%');
});

// ---------- A8 源码守卫 ----------
H.run('A8 源码：三个屏幕不再同步封装 / 导出表留全 / 信封模块有异步 API', function () {
  ['rn/screens/CardsScreen.js', 'rn/screens/SavesScreen.js', 'rn/screens/settings/DataTab.js'].forEach(function (rel) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    H.eq(/ExportUtil\.secureWrap\(/.test(src), false, rel + ' 不再用同步 secureWrap');
    H.eq(/ExportUtil\.secureUnwrap\(/.test(src), false, rel + ' 不再用同步 secureUnwrap');
    H.contains(src, 'ProgressReporter', rel + ' 接了进度回显');
  });
  const eu = fs.readFileSync(path.join(ROOT, EU_PATH), 'utf8');
  H.contains(eu, 'secureWrapAsync: secureWrapAsync', '导出表登记异步封装');
  H.contains(eu, 'secureUnwrapAsync: secureUnwrapAsync', '导出表登记异步解封');
  H.contains(eu, 'progressReporter: progressReporter', '导出表登记进度节流器');
  H.contains(eu, 'toastProgressReporter: toastProgressReporter', '导出表登记 toast 进度（长列表屏才看得见）');
  const se = fs.readFileSync(path.join(ROOT, SE_PATH), 'utf8');
  H.contains(se, 'function pbkdf2Async(', '信封模块有分块 KDF');
  H.contains(se, 'function wrapAsync(', '信封模块有异步封装');
  H.contains(se, 'function unwrapAsync(', '信封模块有异步解封');
});

H.finish();

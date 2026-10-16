// ============================================================
// P54 · 第 17 条：导出信封加密（vfs/secure_envelope.js）smoke（纯 Node，零 RN 运行时）
//
// 需求（《Hippocampus-core_评估清单.md》第 17 条「存档加密」）：
//   「当前存档明文 JSON 导出。如果未来支持分享卡带或云同步，需要加一层对称加密（密钥由用户密码派生）」。
//   P54 把这一条拆成 stage 1（引擎层信封原语，本文件钉住它）/ stage 2（接线到导出/导入 UI + 用户口令）。
//
// 为什么手写而不引库：
//   Hermes 没有 WebCrypto、也没有 crypto.getRandomValues；两仓既有立场是零依赖（package.json 里没有任何
//   加密库），CI 只跑 `npm ci --ignore-scripts`。所以 PBKDF2 / ChaCha20 / HMAC-SHA256 全部手写在
//   vfs/secure_envelope.js 里，本套用 Node crypto + RFC 8439 官方向量对拍，钉死「手写 = 标准」。
//
// 算法口径：
//   PBKDF2-HMAC-SHA256(iter=100000, salt=16B) ⇒ 64B ⇒ 前 32B 加密密钥、后 32B 认证密钥；
//   ChaCha20（RFC 8439，12B nonce，32 位计数器）加密；HMAC-SHA256 覆盖「规范头 || ct」，
//   规范头含 format/v/kdf/iter/cipher/mac/salt/nonce ⇒ 改轮数 / 改 salt / 改 nonce 都会验签失败。
//
// 用法：node tools/secure_envelope_smoke.js（cwd 随意）
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var root = path.resolve(__dirname, '..');
var PC_ROOT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';

var ok = 0;
var fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' <<< ' + detail : '')); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}

// P53：CI 只有一个仓 —— 跨仓（两仓同源）断言在「另一仓不可见」时降级为 SKIP，不再是 FAIL。
var HAVE_OTHER = fs.existsSync(path.join(PC_ROOT, 'package.json'));
var skipN = 0;
function skip(name, why) { skipN++; console.log('  SKIP ' + name + (why ? ' <<< ' + why : '')); }
function section(t) { console.log('---- ' + t + ' ----'); }
function norm(t) { return t === null ? null : t.split('\r\n').join('\n'); }

var SE = require(path.join(root, 'vfs', 'secure_envelope.js'));
var I = SE._internals;
var hex = function (x) { return Buffer.from(x).toString('hex'); };
var b = function (s) { return new Uint8Array(Buffer.from(s, 'utf8')); };
var bhex = function (h) { return new Uint8Array(Buffer.from(h.replace(/\s+/g, ''), 'hex')); };

// ------------------------------------------------------------
section('1. 常量与 API 形状');
eq('A-1 FORMAT', SE.FORMAT, 'ai_tg_secure');
eq('A-2 VERSION', SE.VERSION, 1);
eq('A-3 DEFAULT_ITER', SE.DEFAULT_ITER, 100000);
eq('A-4 encrypt/decrypt/isEnvelope/parseEnvelope 都是函数',
  typeof SE.encrypt === 'function' && typeof SE.decrypt === 'function' &&
  typeof SE.isEnvelope === 'function' && typeof SE.parseEnvelope === 'function', true);

// ------------------------------------------------------------
section('2. SHA-256 与 Node crypto 对拍');
[
  ['S-1 空串', ''],
  ['S-2 abc', 'abc'],
  ['S-3 fox', 'The quick brown fox jumps over the lazy dog'],
  ['S-4 中文 + emoji', '中文 🧠 emoji'],
  ['S-5 55 字节（跨填充边界前）', 'a'.repeat(55)],
  ['S-6 56 字节（填充临界）', 'a'.repeat(56)],
  ['S-7 64 字节（整块）', 'a'.repeat(64)],
  ['S-8 1000 字节（多块）', 'a'.repeat(1000)]
].forEach(function (c) {
  var mine = hex(I.sha256(b(c[1])));
  var ref = crypto.createHash('sha256').update(Buffer.from(c[1], 'utf8')).digest('hex');
  check(c[0], mine === ref, 'mine=' + mine.slice(0, 16));
});

// ------------------------------------------------------------
section('3. HMAC-SHA256 与 Node crypto 对拍（含 key 长于 / 等于 / 短于块长）');
[
  ['H-1 短 key', b('key'), b('The quick brown fox jumps over the lazy dog')],
  ['H-2 key == 64B（块长）', bhex('0b'.repeat(64)), b('Hi There')],
  ['H-3 key == 100B（长于块长 ⇒ 先哈希）', bhex('aa'.repeat(100)), b('Test Using Larger Than Block-Size Key - Hash Key First')],
  ['H-4 空 key', new Uint8Array(0), b('空 key 也要能用')]
].forEach(function (c) {
  var mine = hex(I.hmacSha256(c[1], c[2]));
  var ref = crypto.createHmac('sha256', Buffer.from(c[1])).update(Buffer.from(c[2])).digest('hex');
  check(c[0], mine === ref, 'mine=' + mine.slice(0, 16));
});

// ------------------------------------------------------------
section('4. PBKDF2-HMAC-SHA256 与 Node crypto 对拍（含 iter=1/2/3 的循环不变量）');
[
  ['K-1 iter=1 dk=32', 1, 32],
  ['K-2 iter=2 dk=32', 2, 32],
  ['K-3 iter=3 dk=32', 3, 32],
  ['K-4 iter=1000 dk=32', 1000, 32],
  ['K-5 iter=4096 dk=40（跨块）', 4096, 40],
  ['K-6 iter=500 dk=64（恰两块）', 500, 64]
].forEach(function (c) {
  var pass = b('password'), salt = b('salt');
  var mine = hex(I.pbkdf2(pass, salt, c[1], c[2]));
  var ref = crypto.pbkdf2Sync(Buffer.from(pass), Buffer.from(salt), c[1], c[2], 'sha256').toString('hex');
  check(c[0], mine === ref, 'mine=' + mine.slice(0, 16));
});

// ------------------------------------------------------------
section('5. ChaCha20 与 RFC 8439 官方向量对拍');
var RFC_KEY = bhex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
{
  // §2.3.2 的 nonce 与 §2.4.2 不同，别抄错（本轮实测踩过）
  var nonce = bhex('000000090000004a00000000');
  var want = '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4ed2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e';
  check('C-1 块向量（counter=1）== RFC 8439 §2.3.2', hex(I.chacha20Block(RFC_KEY, nonce, 1)) === want);
}
var RFC_PLAIN = "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
{
  var nonce2 = bhex('000000000000004a00000000');
  var want2 = '6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0bf91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d807ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab77937365af90bbf74a35be6b40b8eedf2785e42874d';
  check('C-2 加密向量 == RFC 8439 §2.4.2（114 字节）', hex(I.chacha20Xor(RFC_KEY, nonce2, b(RFC_PLAIN))) === want2);
  check('C-3 流密码自逆（密文再异或回明文）', I.utf8Decode(I.chacha20Xor(RFC_KEY, nonce2, bhex(want2))) === RFC_PLAIN);
}

// ------------------------------------------------------------
section('6. base64 / UTF-8 与 Node 一致');
{
  var raw = new Uint8Array(101);
  for (var i = 0; i < raw.length; i++) raw[i] = (i * 37) & 0xff;
  check('B-1 base64 往返（101 字节）', hex(I.b64decode(I.b64encode(raw))) === hex(raw));
  check('B-2 base64 与 Node 一致', I.b64encode(raw) === Buffer.from(raw).toString('base64'));
  check('B-3 base64 非法字符 ⇒ null', I.b64decode('!!!!') === null);
  check('B-4 base64 长度不对 ⇒ null', I.b64decode('AAA') === null);
  var s = '中文\u0000\u001f emoji 🧠 长串' + '句'.repeat(300) + '\ud83d\ude80';
  check('U-1 UTF-8 往返（含 NUL / 代理对）', I.utf8Decode(I.utf8Encode(s)) === s);
  check('U-2 UTF-8 与 Node 一致', hex(I.utf8Encode(s)) === Buffer.from(s, 'utf8').toString('hex'));
}

// ------------------------------------------------------------
section('7. 信封行为（往返 / 拒收 / 篡改）');
var PLAIN = JSON.stringify({ format: 'ai_tg_save', saveId: 's1', chat: { messages: [{ role: 'user', content: '你好。' }] } });
var enc = SE.encrypt(PLAIN, '口令-abc123', { iter: 1000 });
check('E-1 加密成功且 text 是 JSON', enc.ok === true && enc.text.charAt(0) === '{', enc.reason);
check('E-2 isEnvelope(信封) === true', SE.isEnvelope(enc.text) === true);
check('E-3 isEnvelope(明文存档) === false', SE.isEnvelope(PLAIN) === false);
check('E-4 isEnvelope(别的 JSON) === false', SE.isEnvelope('{"format":"ai_tg_save"}') === false);
check('E-5 isEnvelope 容忍 BOM / 前后空白', SE.isEnvelope('\uFEFF  ' + enc.text + '\n') === true);

var dec = SE.decrypt(enc.text, '口令-abc123');
check('E-6 正确口令往返逐字一致', dec.ok === true && dec.text === PLAIN, dec.reason);

var badPass = SE.decrypt(enc.text, '口令-abc124');
check('E-7 错口令 ⇒ ok:false + tampered:true', badPass.ok === false && badPass.tampered === true && badPass.reason === '口令不对，或文件被改动过', JSON.stringify(badPass));

var e1 = JSON.parse(enc.text);
var flip = function (s) { return (s.charAt(0) === 'A' ? 'B' : 'A') + s.slice(1); };
var t1 = JSON.parse(enc.text); t1.ct = flip(t1.ct);
check('E-8 改一个字节的 ct ⇒ 拒收', SE.decrypt(JSON.stringify(t1), '口令-abc123').ok === false);
var t2 = JSON.parse(enc.text); t2.tag = flip(t2.tag);
check('E-9 改一个字节的 tag ⇒ 拒收', SE.decrypt(JSON.stringify(t2), '口令-abc123').ok === false);
var t3 = JSON.parse(enc.text); t3.iter = 2000;
check('E-10 改 iter（规范头在 MAC 覆盖内）⇒ 拒收', SE.decrypt(JSON.stringify(t3), '口令-abc123').ok === false);
var t4 = JSON.parse(enc.text); t4.salt = I.b64encode(I.utf8Encode('0123456789abcdef'));
check('E-11 改 salt ⇒ 拒收', SE.decrypt(JSON.stringify(t4), '口令-abc123').ok === false);
var t5 = JSON.parse(enc.text); delete t5.salt;
var r5 = SE.decrypt(JSON.stringify(t5), '口令-abc123');
check('E-12 缺 salt 字段 ⇒ 「salt 字段不合法」', r5.ok === false && r5.reason === 'salt 字段不合法', r5.reason);
var t6 = JSON.parse(enc.text); t6.v = 2;
var r6 = SE.decrypt(JSON.stringify(t6), '口令-abc123');
check('E-13 版本不支持 ⇒ 明确文案', r6.ok === false && r6.reason === '信封版本不支持：2', r6.reason);
var t7 = JSON.parse(enc.text); t7.kdf = 'scrypt';
check('E-14 KDF 不支持 ⇒ 拒收', SE.decrypt(JSON.stringify(t7), '口令-abc123').ok === false);
var r8 = SE.decrypt(enc.text, '');
check('E-15 空口令解密 ⇒ 「口令为空」', r8.ok === false && r8.reason === '口令为空', r8.reason);
var r9 = SE.encrypt('', 'pw', { iter: 1000 });
check('E-16 空明文加密 ⇒ 「内容为空，无法加密」', r9.ok === false && r9.reason === '内容为空，无法加密', r9.reason);
var r10 = SE.encrypt('x', '', { iter: 1000 });
check('E-17 空口令加密 ⇒ 「口令为空，无法加密」', r10.ok === false && r10.reason === '口令为空，无法加密', r10.reason);
check('E-18 iter 越界（超上限 / 负数）⇒ 拒收',
  SE.encrypt('x', 'pw', { iter: SE.DEFAULT_ITER * 100 }).ok === false && SE.encrypt('x', 'pw', { iter: -1 }).ok === false);
check('E-18b iter 显式 0 视为「未给」⇒ 回落 DEFAULT_ITER', (function () {
  var r = SE.encrypt('x', 'pw', { iter: 0 });
  return r.ok === true && r.env.iter === SE.DEFAULT_ITER;
})());
check('E-19 decrypt(明文) ⇒ ok:false 且不是 tampered', (function () { var r = SE.decrypt(PLAIN, 'pw'); return r.ok === false && r.tampered === false; })());
var pe = SE.parseEnvelope(enc.text);
check('E-20 parseEnvelope 字段长度正确（16/12/明文长/32）',
  pe.ok === true && pe.salt.length === 16 && pe.nonce.length === 12 &&
  pe.ct.length === Buffer.byteLength(PLAIN, 'utf8') && pe.tag.length === 32, JSON.stringify(pe.reason));
check('E-21 规范头逐字（改任一字段都会验签失败）',
  I.canonicalHeader(1000, 'S', 'N') === 'ai_tg_secure|1|pbkdf2-sha256|1000|chacha20|hmac-sha256|S|N', I.canonicalHeader(1000, 'S', 'N'));
var saltFix = bhex('000102030405060708090a0b0c0d0e0f'), nonceFix = bhex('000102030405060708090a0b');
var d1 = SE.encrypt(PLAIN, 'pw', { iter: 1000, salt: saltFix, nonce: nonceFix });
var d2 = SE.encrypt(PLAIN, 'pw', { iter: 1000, salt: saltFix, nonce: nonceFix });
check('E-22 定值 salt/nonce ⇒ 密文逐字可复现', d1.ok === true && d1.text === d2.text);
var d3 = SE.encrypt(PLAIN, 'pw', { iter: 1000 });
check('E-23 不定值 ⇒ 每次 salt/nonce 都不同', d3.env.salt !== d1.env.salt && d3.env.nonce !== d1.env.nonce);

// ------------------------------------------------------------
section('8. 边界长度与大载荷');
{
  var lens = [1, 63, 64, 65, 127, 128, 129];
  var allOk = true, why = '';
  lens.forEach(function (n) {
    var s = 'x'.repeat(n);
    var e = SE.encrypt(s, 'pw', { iter: 500 });
    var d = e.ok ? SE.decrypt(e.text, 'pw') : { ok: false };
    if (!e.ok || !d.ok || d.text !== s) { allOk = false; why = 'len=' + n; }
  });
  check('L-1 边界长度 1/63/64/65/127/128/129 全部往返', allOk, why);
  var big = JSON.stringify({ chat: { messages: [{ role: 'assistant', content: '长'.repeat(80000) }] } });
  var eb = SE.encrypt(big, 'pw', { iter: 1000 });
  var db = SE.decrypt(eb.text, 'pw');
  check('L-2 200KB 级载荷往返一致（' + Buffer.byteLength(big, 'utf8') + ' 字节）', db.ok === true && db.text === big, db.reason);
  check('L-3 信封比明文字节数大 1/3 左右（base64 膨胀，不是压缩）',
    eb.text.length > Buffer.byteLength(big, 'utf8') && eb.text.length < Buffer.byteLength(big, 'utf8') * 2);
}

// ------------------------------------------------------------
section('9. 源码哨兵（stage 1 边界 / 零依赖 / 两仓同源）');
var SRC_PATH = path.join(root, 'vfs', 'secure_envelope.js');
var src = fs.readFileSync(SRC_PATH, 'utf8');
check('R-1 源码零 require（不引任何库）', src.indexOf('require(') < 0);
check('R-2 只挂 window / module，不污染其它全局', src.indexOf('window.SecureEnvelope = SecureEnvelope') >= 0 && src.indexOf('module.exports = SecureEnvelope') >= 0);
check('R-3 MAC 覆盖「规范头 || ct」（加密与解密两侧都在）',
  src.indexOf('concatBytes(header, ct)') >= 0 && src.indexOf('concatBytes(header, p.ct)') >= 0);
check('R-4 stage 1 边界：本文件不碰引擎全局（Storage.getGlobal / VFS. / GameState）',
  src.indexOf('Storage.getGlobal') < 0 && src.indexOf('VFS.') < 0 && src.indexOf('GameState') < 0);
check('R-5 本仓文件是 LF（与 vfs/ 惯例一致）', src.indexOf('\r') < 0);
var PC_PATH = path.join(PC_ROOT, 'vfs', 'secure_envelope.js');
if (!HAVE_OTHER || !fs.existsSync(PC_PATH)) {
  skip('R-6 两仓 vfs/secure_envelope.js 归一后同源', '另一仓不可见（' + PC_PATH + '）');
} else {
  check('R-6 两仓 vfs/secure_envelope.js 归一后逐字相同（本仓 LF / 桌面 CRLF）',
    norm(fs.readFileSync(PC_PATH, 'utf8')) === norm(src));
}

// ------------------------------------------------------------
console.log('SECURE_ENVELOPE_SMOKE: ' + ok + ' ok, ' + fail + ' failed' + (skipN ? ', ' + skipN + ' skipped' : ''));
process.exit(fail ? 1 : 0);

// ============================================================
// 导出信封加密 · secure_envelope.js（P54 · 第 17 条 · stage 1）
// ------------------------------------------------------------
// 用途：《Hippocampus-core_评估清单.md》第 17 条 —— 存档导出目前是明文
//   JSON，分享 / 云同步时谁拿到文件都能读。这里给一层「口令派生密钥 +
//   对称加密」的信封：导出时口令留空 ⇒ 不加密（与旧版逐字相同）；
//   填了口令 ⇒ 落成信封 JSON；导入侧自动识别信封并要口令。
//   stage 1（本文件）只做引擎层：加解密 + 信封识别 + 口令校验。
//   导出/导入的 UI 接线（手机 OverlayHost 的 promptAsync、桌面
//   engine/ui_prompt.js）留 stage 2；本文件不碰任何 UI。
//
// 设计（全部用标准件，不自创密码学）：
//   · KDF     PBKDF2-HMAC-SHA256，默认 100000 轮，salt 16 字节随机
//   · 密钥    一次派生 64 字节 ⇒ 前 32 字节加密钥 / 后 32 字节 MAC 钥
//   · 加密    ChaCha20（RFC 8439，12 字节 nonce，块计数器从 1 起）
//   · 完整性  HMAC-SHA256，encrypt-then-MAC，覆盖「规范头 || 密文」；
//             校验走常数时间比较，错口令与被改动同样只回到「打不开」。
//   · 密钥不落盘：口令只在调用栈里活一次，派生密钥不写磁盘、不进 Storage。
//   · iter 记在信封里 ⇒ 以后调轮数不会打不开旧文件（导入按信封里的值算）。
//
// 性能：纯 JS 的 PBKDF2 是这条路上最贵的一步。压缩函数走「中间态复用 +
//   零分配」（详见下面 prf32）：每轮 2 次 SHA-256 压缩而不是 4 次。
//   Node/V8 实测 100000 轮 ≈ 0.42s（加密）/ 0.57s（解密），Hermes 上更慢，
//   故默认轮数取 100000 而不是 OWASP 推荐的 600000 —— 这一层保护的是
//   「导出的存档文件」，口令由玩家自选，安全性主要取决于口令强度；
//   要更强的口径，改 DEFAULT_ITER 即可，旧信封照样能开。
//
// 为什么手写而不用库：手机仓（Hermes）没有 WebCrypto，也没有 Node 的
//   crypto；加 npm 依赖会进 Metro bundle、进 CI 的 npm ci。所以这里自己
//   实现 SHA-256 / HMAC / PBKDF2 / ChaCha20 —— 都是公开标准件，
//   tools/secure_envelope_smoke.js 逐条拿 Node 的 crypto 与 RFC 8439
//   官方向量对拍（对不上就是实现错，不靠「看起来能用」）。
//
// 随机数来源：先 crypto.getRandomValues（Node / Electron 有），再退到
//   Math.random + Date.now + 进程内计数器混合。RN 通常没有
//   crypto.getRandomValues ⇒ 真机走兜底分支。salt 只要求「不重复」
//   （16 字节 + 每次导出重取），不要求不可预测；所以兜底分支不影响
//   「安全性由口令强度决定」这个结论，但**不要**把它当密钥材料。
//
// 信封格式（JSON，字段全部必填）：
//   { format:'ai_tg_secure', v:1, kdf:'pbkdf2-sha256', iter:100000,
//     cipher:'chacha20', mac:'hmac-sha256',
//     salt:<b64 16B>, nonce:<b64 12B>, ct:<b64>, tag:<b64 32B> }
//   MAC 的规范头（UTF-8 逐字拼，与 JSON 字段顺序无关）：
//     'ai_tg_secure|1|pbkdf2-sha256|<iter>|chacha20|hmac-sha256|<saltB64>|<nonceB64>'
//   ⇒ 校验时不依赖 JSON 序列化顺序，也不给「改 iter 降轮数」留口子。
// ============================================================

(function() {
  var FORMAT = 'ai_tg_secure';
  var VERSION = 1;
  var KDF = 'pbkdf2-sha256';
  var CIPHER = 'chacha20';
  var MAC = 'hmac-sha256';
  // P61：KDF 迭代轮数不变（安全性不动），只把「怎么跑这 100000 轮」改成可分块 ——
  //   同步入口 pbkdf2/encrypt/decrypt 逐字节行为与旧实现相同；异步入口 pbkdf2Async/
  //   encryptAsync/decryptAsync 每块让出事件循环，界面能刷进度（真机实测 8.4s 全程冻结）。
  var DEFAULT_ITER = 100000;
  var MAX_ITER = 2000000;
  var SALT_LEN = 16;
  var NONCE_LEN = 12;
  var TAG_LEN = 32;

  // ---------------- base64（RN / Hermes 无 Buffer、无 atob） ----------------
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64REV = (function() {
    var m = {};
    for (var i = 0; i < B64.length; i++) m[B64.charAt(i)] = i;
    return m;
  })();

  function b64encode(bytes) {
    var out = '';
    var n = bytes.length;
    var i = 0;
    for (; i + 2 < n; i += 3) {
      var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64.charAt((v >> 18) & 63) + B64.charAt((v >> 12) & 63) + B64.charAt((v >> 6) & 63) + B64.charAt(v & 63);
    }
    var rem = n - i;
    if (rem === 1) {
      var a = bytes[i] << 16;
      out += B64.charAt((a >> 18) & 63) + B64.charAt((a >> 12) & 63) + '==';
    } else if (rem === 2) {
      var c = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64.charAt((c >> 18) & 63) + B64.charAt((c >> 12) & 63) + B64.charAt((c >> 6) & 63) + '=';
    }
    return out;
  }

  // 严格解码：非法字符 / 长度不对 / 填充不对 ⇒ null（不做模糊容错）
  function b64decode(str) {
    var s = String(str == null ? '' : str);
    if (s.length % 4 !== 0) return null;
    var pad = 0;
    if (s.length && s.charAt(s.length - 1) === '=') pad++;
    if (s.length > 1 && s.charAt(s.length - 2) === '=') pad++;
    var body = pad ? s.slice(0, s.length - pad) : s;
    var out = [];
    var acc = 0;
    var bits = 0;
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (!Object.prototype.hasOwnProperty.call(B64REV, ch)) return null;
      acc = (acc << 6) | B64REV[ch];
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 0xff);
      }
    }
    return new Uint8Array(out);
  }

  // ---------------- UTF-8 ----------------
  function utf8Encode(str) {
    var s = String(str == null ? '' : str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
          i++;
        } else {
          out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return new Uint8Array(out);
  }

  function utf8Decode(bytes) {
    var out = '';
    var i = 0;
    var n = bytes.length;
    while (i < n) {
      var b = bytes[i];
      var cp;
      if (b < 0x80) {
        cp = b;
        i += 1;
      } else if (b >= 0xc2 && b <= 0xdf && i + 1 < n && (bytes[i + 1] & 0xc0) === 0x80) {
        cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
        i += 2;
      } else if (b >= 0xe0 && b <= 0xef && i + 2 < n && (bytes[i + 1] & 0xc0) === 0x80 && (bytes[i + 2] & 0xc0) === 0x80) {
        cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
        i += 3;
      } else if (b >= 0xf0 && b <= 0xf4 && i + 3 < n && (bytes[i + 1] & 0xc0) === 0x80 && (bytes[i + 2] & 0xc0) === 0x80 && (bytes[i + 3] & 0xc0) === 0x80) {
        cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
        i += 4;
      } else {
        cp = 0xfffd;
        i += 1;
      }
      if (cp > 0xffff) {
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else {
        out += String.fromCharCode(cp);
      }
    }
    return out;
  }

  // ---------------- SHA-256（压缩函数 + 中间态复用） ----------------
  var INIT_H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(v, n) { return ((v >>> n) | (v << (32 - n))) >>> 0; }

  var _W = new Int32Array(64); // 压缩工作区：单线程 + 本文件无回调 ⇒ 可复用，不可重入

  // 处理一个 64 字节块：H（Uint32Array(8)）原地更新
  function shaCompress(H, block, off) {
    var i;
    for (i = 0; i < 16; i++) {
      _W[i] = (block[off + i * 4] << 24) | (block[off + i * 4 + 1] << 16) | (block[off + i * 4 + 2] << 8) | block[off + i * 4 + 3];
    }
    for (i = 16; i < 64; i++) {
      var x = _W[i - 15];
      var y = _W[i - 2];
      var s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      var s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      _W[i] = (_W[i - 16] + s0 + _W[i - 7] + s1) | 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      var ch = ((e & f) ^ ((~e) & g)) >>> 0;
      var t1 = (h + S1 + ch + K[i] + _W[i]) | 0;
      var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  function writeLenBE(buf, at, byteLen) {
    var hi = Math.floor(byteLen / 536870912);
    var lo = (byteLen << 3) >>> 0;
    buf[at] = (hi >>> 24) & 0xff; buf[at + 1] = (hi >>> 16) & 0xff;
    buf[at + 2] = (hi >>> 8) & 0xff; buf[at + 3] = hi & 0xff;
    buf[at + 4] = (lo >>> 24) & 0xff; buf[at + 5] = (lo >>> 16) & 0xff;
    buf[at + 6] = (lo >>> 8) & 0xff; buf[at + 7] = lo & 0xff;
  }

  function writeHBE(out, H, at) {
    for (var i = 0; i < 8; i++) {
      var w = H[i];
      out[at + i * 4] = (w >>> 24) & 0xff;
      out[at + i * 4 + 1] = (w >>> 16) & 0xff;
      out[at + i * 4 + 2] = (w >>> 8) & 0xff;
      out[at + i * 4 + 3] = w & 0xff;
    }
    return out;
  }

  var _suf = new Uint8Array(64);

  // 在「已经处理过 prefixLen 字节」的中间态 H 上继续吃 suffix（含 SHA-256 填充）
  function shaSuffix(H, suffix, prefixLen) {
    var len = prefixLen + suffix.length;
    var total = (((len + 8) >> 6) + 1) << 6;
    var rem = total - prefixLen;
    var buf = rem <= 64 ? _suf : new Uint8Array(rem);
    buf.fill(0);
    buf.set(suffix, 0);
    buf[suffix.length] = 0x80;
    writeLenBE(buf, rem - 8, len);
    for (var off = 0; off < rem; off += 64) shaCompress(H, buf, off);
    return H;
  }

  function sha256(bytes) {
    var H = INIT_H.slice();
    shaSuffix(H, bytes, 0);
    return writeHBE(new Uint8Array(32), H, 0);
  }

  // ---------------- HMAC-SHA256 ----------------
  // ipad / opad 两个块的中间态只算一次；PBKDF2 的每一轮都复用它
  function hmacPadStates(key) {
    var k = key.length > 64 ? sha256(key) : key;
    var ipad = new Uint8Array(64);
    var opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) {
      var b = i < k.length ? k[i] : 0;
      ipad[i] = b ^ 0x36;
      opad[i] = b ^ 0x5c;
    }
    var ip = INIT_H.slice();
    shaCompress(ip, ipad, 0);
    var op = INIT_H.slice();
    shaCompress(op, opad, 0);
    return { ip: ip, op: op };
  }

  function hmacSha256(key, msg) {
    var st = hmacPadStates(key);
    var H = st.ip.slice();
    shaSuffix(H, msg, 64);
    var inner = writeHBE(new Uint8Array(32), H, 0);
    var Ho = st.op.slice();
    shaSuffix(Ho, inner, 64);
    return writeHBE(new Uint8Array(32), Ho, 0);
  }

  // ---------------- PBKDF2-HMAC-SHA256 ----------------
  var _ip = new Uint32Array(8);
  var _op = new Uint32Array(8);
  var _suf2 = new Uint8Array(64);
  var _prfOut = new Uint8Array(32);

  // PRF 的输入固定 32 字节（PBKDF2 迭代轮）⇒ 全零分配：ipad 态吃 m32+填充 1 块、
  // opad 态吃 inner32+填充 1 块 = 每轮 2 次压缩（通用写法要 4 次）
  function prf32(states, m32) {
    var i;
    _suf2.fill(0);
    _suf2.set(m32, 0);
    _suf2[32] = 0x80;
    _suf2[62] = 0x03; _suf2[63] = 0x00; // (64 + 32) * 8 = 768 = 0x300
    _ip.set(states.ip);
    shaCompress(_ip, _suf2, 0);
    _suf2.fill(0);
    for (i = 0; i < 8; i++) {
      var w = _ip[i];
      _suf2[i * 4] = (w >>> 24) & 0xff;
      _suf2[i * 4 + 1] = (w >>> 16) & 0xff;
      _suf2[i * 4 + 2] = (w >>> 8) & 0xff;
      _suf2[i * 4 + 3] = w & 0xff;
    }
    _suf2[32] = 0x80;
    _suf2[62] = 0x03; _suf2[63] = 0x00;
    _op.set(states.op);
    shaCompress(_op, _suf2, 0);
    for (i = 0; i < 8; i++) {
      var v = _op[i];
      _prfOut[i * 4] = (v >>> 24) & 0xff;
      _prfOut[i * 4 + 1] = (v >>> 16) & 0xff;
      _prfOut[i * 4 + 2] = (v >>> 8) & 0xff;
      _prfOut[i * 4 + 3] = v & 0xff;
    }
    return _prfOut;
  }

  // ---- P61：分块 KDF ----
  //   背景：Hermes 下 100000 轮 PBKDF2 实测 ≈ 8.4 s（桌面 V8 ≈ 0.69 s，慢 ≈ 12 倍），
  //   同步调用会把 JS 线程整段按住、界面全冻、没有任何提示。这里把 PRF 循环做成可步进的
  //   状态机：同步实现（pbkdf2）输出与旧实现逐字节相同，异步实现（pbkdf2Async）每块之间
  //   让出事件循环，并把单块耗时自适应控制在 ~20-60 ms，界面能继续画帧。
  function pbkdf2State(pass, salt, iter, dkLen) {
    var hLen = 32;
    var blocks = Math.ceil(dkLen / hLen);
    var st = {
      hLen: hLen, iter: iter, blocks: blocks, dkLen: dkLen,
      b: 1, i: 1, done: 0,
      states: hmacPadStates(pass),
      si: new Uint8Array(salt.length + 4),
      u: new Uint8Array(32),
      t: new Uint8Array(32),
      out: new Uint8Array(blocks * hLen),
      saltLen: salt.length,
      salt: salt
    };
    pbkdf2StartBlock(st);
    return st;
  }

  function pbkdf2StartBlock(st) {
    st.si.set(st.salt, 0);
    st.si[st.saltLen] = (st.b >>> 24) & 0xff;
    st.si[st.saltLen + 1] = (st.b >>> 16) & 0xff;
    st.si[st.saltLen + 2] = (st.b >>> 8) & 0xff;
    st.si[st.saltLen + 3] = st.b & 0xff;
    // U1：输入是 salt || INT(i)，长度不定 ⇒ 走通用路径（每块只一次，含外层）
    var Hi = st.states.ip.slice();
    shaSuffix(Hi, st.si, 64);
    var inner = writeHBE(new Uint8Array(32), Hi, 0);
    var Ho = st.states.op.slice();
    shaSuffix(Ho, inner, 64);
    writeHBE(st.u, Ho, 0);
    st.t.set(st.u);
    st.i = 1;
    st.done = (st.b - 1) * st.iter + 1;
  }

  // 推进至多 budget 轮 PRF；返回「是否已全部完成」
  function pbkdf2Step(st, budget) {
    var n = 0;
    while (st.b <= st.blocks && n < budget) {
      if (st.i < st.iter) {
        var o = prf32(st.states, st.u);
        for (var j = 0; j < 32; j++) { st.u[j] = o[j]; st.t[j] ^= o[j]; }
        st.i++;
        st.done++;
        n++;
      } else {
        st.out.set(st.t, (st.b - 1) * st.hLen);
        st.b++;
        if (st.b <= st.blocks) pbkdf2StartBlock(st);
      }
    }
    return st.b > st.blocks;
  }

  function pbkdf2Finish(st) {
    return st.out.subarray(0, st.dkLen);
  }

  function pbkdf2(pass, salt, iter, dkLen) {
    var st = pbkdf2State(pass, salt, iter, dkLen);
    while (!pbkdf2Step(st, 1 << 28)) { /* 同步口径：一次跑完，不主动让出 */ }
    return pbkdf2Finish(st);
  }

  // 让出事件循环必须用宏任务：微任务不会把控制权还给原生，进度照样刷不出来。
  function deferTick(fn) {
    if (typeof setTimeout === 'function') { setTimeout(fn, 0); return; }
    if (typeof setImmediate === 'function') { setImmediate(fn); return; }
    Promise.resolve().then(fn);
  }

  // 异步 PBKDF2：把 KDF 切片跑，每片结束用宏任务让出一帧，屏幕才有机会刷「正在加密 x%」。
  //   opts.chunk    初始切片（默认 800 轮；下面按实测耗时自适应）
  //   opts.targetMs 每片的目标计算耗时（默认 90ms）—— 太小则让出次数过多（真机上每次让出
  //                 约 30~50ms 原生调度开销，切 500 轮要切 200 次，8.4s 的活拖成 14.6s）；
  //                 太大则掉帧明显。90ms 是「看得见进度、又不把时间浪费在调度上」的折中。
  //   opts.onProgress(done, total) 进度回调（至少 120ms 一次，末次必打）
  function pbkdf2Async(pass, salt, iter, dkLen, opts) {
    var o = opts || {};
    var st = pbkdf2State(pass, salt, iter, dkLen);
    var total = st.blocks * st.iter;
    var chunk = Math.max(50, o.chunk || 800);
    var targetMs = Math.max(20, o.targetMs || 90);
    var onProgress = typeof o.onProgress === 'function' ? o.onProgress : null;
    function nowMs() { return (typeof Date !== 'undefined' && typeof Date.now === 'function') ? Date.now() : 0; }
    return new Promise(function (resolve, reject) {
      var lastEmit = 0;
      var perIterMs = 0;   // 平滑后的「每轮耗时」，用来算下一片该切多大
      function tick() {
        var t0 = nowMs();
        var finished;
        try { finished = pbkdf2Step(st, chunk); }
        catch (e) { reject(e); return; }
        var t1 = nowMs();
        var ms = t1 - t0;
        if (ms > 0 && chunk > 0) {
          var sample = ms / chunk;
          perIterMs = perIterMs > 0 ? (perIterMs * 0.6 + sample * 0.4) : sample;
          var want = perIterMs > 0 ? Math.round(targetMs / perIterMs) : chunk;
          if (want < 50) want = 50;
          if (want > 20000) want = 20000;
          chunk = want;
        }
        if (onProgress && (finished || t1 - lastEmit >= 120)) {
          lastEmit = t1;
          try { onProgress(Math.min(st.done, total), total); }
          catch (eCb) { /* 进度回调抛错不得中断 KDF */ }
        }
        if (finished) { resolve(pbkdf2Finish(st)); return; }
        deferTick(tick);
      }
      deferTick(tick);
    });
  }

  // ---------------- ChaCha20（RFC 8439；12 字节 nonce，32 位计数器） ----------------
  function readU32LE(a, o) {
    return (a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>> 0;
  }

  function writeU32LE(out, o, v) {
    out[o] = v & 0xff;
    out[o + 1] = (v >>> 8) & 0xff;
    out[o + 2] = (v >>> 16) & 0xff;
    out[o + 3] = (v >>> 24) & 0xff;
  }

  function rotl(v, n) { return ((v << n) | (v >>> (32 - n))) >>> 0; }

  function qr(x, a, b, c, d) {
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 16);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 12);
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 8);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 7);
  }

  function chachaBlock(key, nonce, counter) {
    var st = new Uint32Array(16);
    st[0] = 0x61707865; st[1] = 0x3320646e; st[2] = 0x79622d32; st[3] = 0x6b206574;
    for (var i = 0; i < 8; i++) st[4 + i] = readU32LE(key, i * 4);
    st[12] = counter >>> 0;
    st[13] = readU32LE(nonce, 0);
    st[14] = readU32LE(nonce, 4);
    st[15] = readU32LE(nonce, 8);
    var x = st.slice(0);
    for (var r = 0; r < 10; r++) {
      qr(x, 0, 4, 8, 12); qr(x, 1, 5, 9, 13); qr(x, 2, 6, 10, 14); qr(x, 3, 7, 11, 15);
      qr(x, 0, 5, 10, 15); qr(x, 1, 6, 11, 12); qr(x, 2, 7, 8, 13); qr(x, 3, 4, 9, 14);
    }
    var out = new Uint8Array(64);
    for (i = 0; i < 16; i++) writeU32LE(out, i * 4, (x[i] + st[i]) >>> 0);
    return out;
  }

  // 块计数器从 1 起（0 在 RFC 8439 里留给 AEAD 的一次密钥；本文件不用 AEAD，
  // 但从 1 起才能与官方向量逐字对拍）。
  function chacha20Xor(key, nonce, data) {
    var out = new Uint8Array(data.length);
    var counter = 1;
    for (var off = 0; off < data.length; off += 64) {
      var ks = chachaBlock(key, nonce, counter++);
      var n = Math.min(64, data.length - off);
      for (var i = 0; i < n; i++) out[off + i] = data[off + i] ^ ks[i];
    }
    return out;
  }

  // ---------------- 随机 ----------------
  var _counter = 0;

  function randomBytes(n) {
    var out = new Uint8Array(n);
    var g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : null);
    var cr = g && g.crypto && typeof g.crypto.getRandomValues === 'function' ? g.crypto : null;
    if (cr) {
      try {
        cr.getRandomValues(out);
        return out;
      } catch (e) { /* 落到兜底分支 */ }
    }
    for (var i = 0; i < n; i++) {
      var r = Math.floor(Math.random() * 256);
      var t = (Date.now() >>> (i % 4)) & 0xff;
      _counter = (_counter + 1) >>> 0;
      var c = (_counter >>> (i % 4)) & 0xff;
      out[i] = (r ^ t ^ c) & 0xff;
    }
    return out;
  }

  // ---------------- 信封 ----------------
  function canonicalHeader(iter, saltB64, nonceB64) {
    return FORMAT + '|' + VERSION + '|' + KDF + '|' + iter + '|' + CIPHER + '|' + MAC + '|' + saltB64 + '|' + nonceB64;
  }

  function deriveKeys(passphrase, salt, iter) {
    var dk = pbkdf2(utf8Encode(passphrase), salt, iter, 64);
    return { enc: dk.subarray(0, 32), mac: dk.subarray(32, 64) };
  }

  function deriveKeysAsync(passphrase, salt, iter, opts) {
    return pbkdf2Async(utf8Encode(passphrase), salt, iter, 64, opts).then(function (dk) {
      return { enc: dk.subarray(0, 32), mac: dk.subarray(32, 64) };
    });
  }

  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  // 加密：text 明文 / passphrase 口令 / opts.iter、opts.salt、opts.nonce 供测试定值
  // 返回 { ok:true, text:<信封 JSON 字符串>, env:<对象> } 或 { ok:false, reason }
  function encrypt(text, passphrase, opts) {
    var o = opts || {};
    var plain = String(text == null ? '' : text);
    var pass = String(passphrase == null ? '' : passphrase);
    if (!plain) return { ok: false, reason: '内容为空，无法加密' };
    if (!pass) return { ok: false, reason: '口令为空，无法加密' };
    var iter = o.iter || DEFAULT_ITER;
    if (!(iter >= 1 && iter <= MAX_ITER)) return { ok: false, reason: '迭代轮数越界' };
    var salt = o.salt || randomBytes(SALT_LEN);
    var nonce = o.nonce || randomBytes(NONCE_LEN);
    return encryptTail(plain, iter, salt, nonce, deriveKeys(pass, salt, iter));
  }

  // 加密尾段（同步/异步共用，保证两条路产出的信封逐字节一致）
  function encryptTail(plain, iter, salt, nonce, keys) {
    var ct = chacha20Xor(keys.enc, nonce, utf8Encode(plain));
    var saltB64 = b64encode(salt);
    var nonceB64 = b64encode(nonce);
    var header = utf8Encode(canonicalHeader(iter, saltB64, nonceB64));
    var tag = hmacSha256(keys.mac, concatBytes(header, ct));
    var env = {
      format: FORMAT,
      v: VERSION,
      kdf: KDF,
      iter: iter,
      cipher: CIPHER,
      mac: MAC,
      salt: saltB64,
      nonce: nonceB64,
      ct: b64encode(ct),
      tag: b64encode(tag)
    };
    return { ok: true, text: JSON.stringify(env), env: env };
  }

  // P61：异步加密 —— 校验口径与 encrypt() 完全一致，只有 KDF 变成分块让出。
  //   opts.kdf = { chunk, onProgress } 透传给 pbkdf2Async。
  function encryptAsync(text, passphrase, opts) {
    var o = opts || {};
    var plain = String(text == null ? '' : text);
    var pass = String(passphrase == null ? '' : passphrase);
    if (!plain) return Promise.resolve({ ok: false, reason: '内容为空，无法加密' });
    if (!pass) return Promise.resolve({ ok: false, reason: '口令为空，无法加密' });
    var iter = o.iter || DEFAULT_ITER;
    if (!(iter >= 1 && iter <= MAX_ITER)) return Promise.resolve({ ok: false, reason: '迭代轮数越界' });
    var salt = o.salt || randomBytes(SALT_LEN);
    var nonce = o.nonce || randomBytes(NONCE_LEN);
    return deriveKeysAsync(pass, salt, iter, o.kdf).then(function (keys) {
      return encryptTail(plain, iter, salt, nonce, keys);
    });
  }

  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  // 只认信封：解析失败 / format 不符 ⇒ { ok:false, reason }
  function parseEnvelope(input) {
    var obj = input;
    if (typeof input === 'string') {
      var s = input.replace(/^\uFEFF/, '').trim();
      if (!s) return { ok: false, reason: '内容为空' };
      if (s.charAt(0) !== '{') return { ok: false, reason: '不是加密信封（不是 JSON 对象）' };
      try { obj = JSON.parse(s); } catch (e) { return { ok: false, reason: '不是加密信封（JSON 解析失败）' }; }
    }
    if (!obj || typeof obj !== 'object') return { ok: false, reason: '不是加密信封（不是对象）' };
    if (obj.format !== FORMAT) return { ok: false, reason: '不是加密信封（format 不符）' };
    if (Number(obj.v) !== VERSION) return { ok: false, reason: '信封版本不支持：' + obj.v };
    if (obj.kdf !== KDF) return { ok: false, reason: 'KDF 不支持：' + obj.kdf };
    if (obj.cipher !== CIPHER) return { ok: false, reason: '加密算法不支持：' + obj.cipher };
    if (obj.mac !== MAC) return { ok: false, reason: '校验算法不支持：' + obj.mac };
    var iter = Number(obj.iter);
    if (!(iter >= 1 && iter <= MAX_ITER)) return { ok: false, reason: '迭代轮数越界：' + obj.iter };
    var salt = b64decode(obj.salt);
    var nonce = b64decode(obj.nonce);
    var ct = b64decode(obj.ct);
    var tag = b64decode(obj.tag);
    if (!salt || salt.length !== SALT_LEN) return { ok: false, reason: 'salt 字段不合法' };
    if (!nonce || nonce.length !== NONCE_LEN) return { ok: false, reason: 'nonce 字段不合法' };
    if (!ct) return { ok: false, reason: 'ct 字段不合法' };
    if (!tag || tag.length !== TAG_LEN) return { ok: false, reason: 'tag 字段不合法' };
    return { ok: true, env: obj, iter: iter, salt: salt, nonce: nonce, ct: ct, tag: tag };
  }

  function isEnvelope(input) {
    var obj = input;
    if (typeof input === 'string') {
      var s = input.replace(/^\uFEFF/, '').trim();
      if (!s || s.charAt(0) !== '{') return false;
      try { obj = JSON.parse(s); } catch (e) { return false; }
    }
    return !!(obj && typeof obj === 'object' && obj.format === FORMAT);
  }

  // 解密：错口令 / 被改动 / 字段不合法都只回 { ok:false, reason }
  function decrypt(input, passphrase) {
    var p = parseEnvelope(input);
    if (!p.ok) return { ok: false, reason: p.reason, tampered: false };
    var pass = String(passphrase == null ? '' : passphrase);
    if (!pass) return { ok: false, reason: '口令为空', tampered: false };
    return decryptTail(p, deriveKeys(pass, p.salt, p.iter));
  }

  // 解密尾段（同步/异步共用）
  function decryptTail(p, keys) {
    var header = utf8Encode(canonicalHeader(p.iter, p.env.salt, p.env.nonce));
    var expect = hmacSha256(keys.mac, concatBytes(header, p.ct));
    if (!timingSafeEqual(expect, p.tag)) {
      return { ok: false, reason: '口令不对，或文件被改动过', tampered: true };
    }
    var plain = utf8Decode(chacha20Xor(keys.enc, p.nonce, p.ct));
    return { ok: true, text: plain };
  }

  // P61：异步解密 —— 与 decrypt() 同文案（错口令/被改动仍共用一句，不替攻击者分辨）
  function decryptAsync(input, passphrase, opts) {
    var o = opts || {};
    var p = parseEnvelope(input);
    if (!p.ok) return Promise.resolve({ ok: false, reason: p.reason, tampered: false });
    var pass = String(passphrase == null ? '' : passphrase);
    if (!pass) return Promise.resolve({ ok: false, reason: '口令为空', tampered: false });
    return deriveKeysAsync(pass, p.salt, p.iter, o.kdf).then(function (keys) {
      return decryptTail(p, keys);
    });
  }


  // ---- P54·第17条 stage 2：给导出/导入用的薄封装（仍然零依赖、不碰 UI） ----
  // 空口令 ⇒ 明文原样返回（「默认不加密」的语义就落在这里，调用方只管传口令）
  function wrap(text, passphrase, opts) {
    var s = String(text == null ? '' : text);
    var pass = String(passphrase == null ? '' : passphrase);
    if (!pass) return { ok: true, text: s, encrypted: false };
    var r = encrypt(s, pass, opts);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, text: r.text, encrypted: true };
  }

  // 明文原样放行；信封则必须口令对；解不开只回 { ok:false, reason }（绝不吐半截明文）
  function unwrap(text, passphrase) {
    var s = String(text == null ? '' : text);
    if (!isEnvelope(s)) return { ok: true, text: s, encrypted: false };
    var r = decrypt(s, passphrase);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, text: r.text, encrypted: true };
  }

  // P61：异步薄封装（口令语义与同步版一致：空口令 ⇒ 明文放行）
  function wrapAsync(text, passphrase, opts) {
    var s = String(text == null ? '' : text);
    var pass = String(passphrase == null ? '' : passphrase);
    if (!pass) return Promise.resolve({ ok: true, text: s, encrypted: false });
    return encryptAsync(s, pass, opts).then(function (r) {
      if (!r.ok) return { ok: false, reason: r.reason };
      return { ok: true, text: r.text, encrypted: true };
    });
  }

  function unwrapAsync(text, passphrase, opts) {
    var s = String(text == null ? '' : text);
    if (!isEnvelope(s)) return Promise.resolve({ ok: true, text: s, encrypted: false });
    return decryptAsync(s, passphrase, opts).then(function (r) {
      if (!r.ok) return { ok: false, reason: r.reason };
      return { ok: true, text: r.text, encrypted: true };
    });
  }


  var SecureEnvelope = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    DEFAULT_ITER: DEFAULT_ITER,
    encrypt: encrypt,
    decrypt: decrypt,
    isEnvelope: isEnvelope,
    parseEnvelope: parseEnvelope,
    wrap: wrap,
    unwrap: unwrap,
    // P61：分块 KDF 与异步信封（Hermes 上 100000 轮 ≈ 8.4 s，同步会把界面冻住）
    pbkdf2Async: pbkdf2Async,
    encryptAsync: encryptAsync,
    decryptAsync: decryptAsync,
    wrapAsync: wrapAsync,
    unwrapAsync: unwrapAsync,
    // 内部件给单测 / 冒烟对拍用（不做兼容承诺）
    _internals: {
      sha256: sha256,
      hmacSha256: hmacSha256,
      hmacPadStates: hmacPadStates,
      pbkdf2: pbkdf2,
      pbkdf2Async: pbkdf2Async,
      pbkdf2State: pbkdf2State,
      pbkdf2Step: pbkdf2Step,
      pbkdf2Finish: pbkdf2Finish,
      chacha20Block: chachaBlock,
      chacha20Xor: chacha20Xor,
      b64encode: b64encode,
      b64decode: b64decode,
      utf8Encode: utf8Encode,
      utf8Decode: utf8Decode,
      randomBytes: randomBytes,
      canonicalHeader: canonicalHeader
    }
  };

  if (typeof window !== 'undefined') window.SecureEnvelope = SecureEnvelope;
  if (typeof module !== 'undefined' && module.exports) module.exports = SecureEnvelope;
})();

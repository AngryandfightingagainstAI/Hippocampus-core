// ============================================================
// 导入层 · 字节与文本基础工具
// 三件事：把各种输入统一成 Uint8Array、把字节变成文本（带编码判定）、算 sha256。
// 纯 JS，不依赖 Node（Buffer/fs）也不依赖 RN 原生模块，两仓共用。
// ============================================================

function isBytes(v) {
  return v && typeof v.length === 'number' && (v instanceof Uint8Array || Object.prototype.toString.call(v) === '[object Uint8Array]');
}

// 各种入口统一成 Uint8Array：Uint8Array / ArrayBuffer / 普通数组 / base64 字符串 / data: URI
function toBytes(input) {
  if (input == null) return new Uint8Array(0);
  if (isBytes(input)) return input;
  if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return new Uint8Array(input);
  if (typeof input === 'string') {
    var s = input;
    var m = /^data:[^;]+;base64,(.*)$/i.exec(s);
    if (m) s = m[1];
    return fromBase64(s);
  }
  throw new Error('无法识别的字节输入类型：' + Object.prototype.toString.call(input));
}

var B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function fromBase64(s) {
  var clean = String(s).replace(/[\r\n\s]/g, '');
  var pad = 0;
  while (clean.length && clean.charAt(clean.length - 1) === '=') { clean = clean.slice(0, -1); pad++; }
  var outLen = Math.floor(clean.length * 3 / 4);
  var out = new Uint8Array(outLen);
  var acc = 0, bits = 0, o = 0;
  for (var i = 0; i < clean.length; i++) {
    var c = B64CHARS.indexOf(clean.charAt(i));
    if (c < 0) continue; // 宽容：忽略非法字符而不是抛（很多来源带换行/空格）
    acc = (acc << 6) | c; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xFF; }
  }
  return o === outLen ? out : out.slice(0, o);
}

function toBase64(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out.push(B64CHARS.charAt(b0 >> 2));
    out.push(B64CHARS.charAt(((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)));
    out.push(b1 === undefined ? '=' : B64CHARS.charAt(((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)));
    out.push(b2 === undefined ? '=' : B64CHARS.charAt(b2 & 63));
  }
  return out.join('');
}

// JS string -> UTF-8 bytes (hand-written, does not depend on TextEncoder)
function toUTF8(str) {
  var s = String(str == null ? '' : str);
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
      var lo = s.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        c = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

// ---- 手写 UTF-8 解码（不依赖 TextDecoder，Hermes 上不一定有）----
// 返回 { text, invalid }，invalid = 非法字节序列的处数（>0 说明这大概率不是 UTF-8）
function decodeUTF8(bytes) {
  var out = [], invalid = 0;
  var i = 0, n = bytes.length;
  while (i < n) {
    var b = bytes[i];
    if (b < 0x80) { out.push(b); i++; continue; }
    var need = 0, cp = 0;
    if ((b & 0xE0) === 0xC0) { need = 1; cp = b & 0x1F; }
    else if ((b & 0xF0) === 0xE0) { need = 2; cp = b & 0x0F; }
    else if ((b & 0xF8) === 0xF0) { need = 3; cp = b & 0x07; }
    else { invalid++; out.push(0xFFFD); i++; continue; }
    if (i + need >= n) { invalid++; out.push(0xFFFD); i++; continue; }
    var ok = true;
    for (var k = 1; k <= need; k++) {
      var c = bytes[i + k];
      if ((c & 0xC0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (c & 0x3F);
    }
    if (!ok) { invalid++; out.push(0xFFFD); i++; continue; }
    // 过长编码与代理区按非法处理
    if ((need === 2 && cp < 0x800) || (need === 3 && cp < 0x10000) || (cp >= 0xD800 && cp <= 0xDFFF)) {
      invalid++; out.push(0xFFFD); i += need + 1; continue;
    }
    if (cp > 0xFFFF) {
      cp -= 0x10000;
      out.push(0xD800 + (cp >> 10));
      out.push(0xDC00 + (cp & 0x3FF));
    } else out.push(cp);
    i += need + 1;
  }
  return { text: fromCodePoints(out), invalid: invalid };
}

function fromCodePoints(cps) {
  // 分块 fromCharCode，避免超长参数列表爆栈
  var CH = 8192, parts = [];
  for (var i = 0; i < cps.length; i += CH) {
    parts.push(String.fromCharCode.apply(null, cps.slice(i, i + CH)));
  }
  return parts.join('');
}

function tryTextDecoder(label, bytes) {
  if (typeof TextDecoder === 'undefined') return null;
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch (e) { return null; }
}

var ImportDecode = {
  toBytes: toBytes,
  toBase64: toBase64,
  fromBase64: fromBase64,
  toUTF8: toUTF8,
  isBytes: isBytes,

  // 返回 { text, encoding, warnings }
  // 判定顺序：BOM → UTF-8 严判 → GBK（TextDecoder 可用时）→ latin1 兜底 + 报警
  text: function (bytes) {
    bytes = toBytes(bytes);
    var warnings = [];
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { text: decodeUTF8(bytes.subarray(3)).text, encoding: 'utf-8-bom', warnings: warnings };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { text: decodeUTF16(bytes.subarray(2), true).text, encoding: 'utf-16le', warnings: warnings };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { text: decodeUTF16(bytes.subarray(2), false).text, encoding: 'utf-16be', warnings: warnings };
    }
    var u8 = decodeUTF8(bytes);
    if (u8.invalid === 0) return { text: u8.text, encoding: 'utf-8', warnings: warnings };
    // 含 NUL 字节：常见于截断的 UTF-16（无 BOM）
    if (hasManyNuls(bytes)) {
      var guessLe = decodeUTF16(bytes, true);
      if (!guessLe.hasNul) {
        warnings.push('无 BOM 的 UTF-16 猜测为 LE，若出现乱码请另存为 UTF-8 再导入');
        return { text: guessLe.text, encoding: 'utf-16le-guessed', warnings: warnings };
      }
    }
    var gbk = tryTextDecoder('gbk', bytes);
    if (gbk !== null) {
      warnings.push('该文件不是合法 UTF-8（' + u8.invalid + ' 处非法字节），已按 GBK 解码');
      return { text: gbk, encoding: 'gbk', warnings: warnings };
    }
    warnings.push('该文件既不是合法 UTF-8，本环境也没有 GBK 解码器（TextDecoder 不可用），已按单字节兜底——**可能乱码**；建议另存为 UTF-8 再导入');
    var latin = [];
    for (var i = 0; i < bytes.length; i++) latin.push(bytes[i]);
    return { text: fromCodePoints(latin), encoding: 'fallback-latin1', warnings: warnings };
  },

  // ---- sha256（纯 JS，用于原文件留存的完整性标识）----
  sha256Hex: function (bytes) {
    var h = sha256Bytes(toBytes(bytes));
    var s = '';
    for (var i = 0; i < h.length; i++) s += (h[i] < 16 ? '0' : '') + h[i].toString(16);
    return s;
  },

  // 简单指纹（只用于「同一个文件重复导入」这类弱判定，不用于安全）
  fingerprint: function (bytes) {
    bytes = toBytes(bytes);
    var h1 = 0x811C9DC5, h2 = 0x01000193;
    for (var i = 0; i < bytes.length; i++) {
      h1 = (h1 ^ bytes[i]) >>> 0; h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + bytes[i] * (i + 1)) >>> 0;
    }
    return bytes.length.toString(16) + '-' + h1.toString(16) + h2.toString(16);
  }
};

function hasManyNuls(bytes) {
  var n = 0, lim = Math.min(bytes.length, 512);
  for (var i = 0; i < lim; i++) if (bytes[i] === 0) n++;
  return n > lim / 8;
}

function decodeUTF16(bytes, le) {
  var out = [], hasNul = false;
  for (var i = 0; i + 1 < bytes.length; i += 2) {
    var c = le ? (bytes[i] | (bytes[i + 1] << 8)) : ((bytes[i] << 8) | bytes[i + 1]);
    if (c === 0) hasNul = true;
    out.push(c);
  }
  return { text: fromCodePoints(out), hasNul: hasNul };
}

// ---- sha256 ----
var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes(bytes) {
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var len = bytes.length;
  var bitLen = len * 8;
  var withPad = len + 1 + 8;
  var total = Math.ceil(withPad / 64) * 64;
  var msg = new Uint8Array(total);
  msg.set(bytes);
  msg[len] = 0x80;
  // 64 位长度（高 32 位按 0 处理；导入场景不可能有 4GB 文件）
  var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
  msg[total - 8] = (hi >>> 24) & 255; msg[total - 7] = (hi >>> 16) & 255; msg[total - 6] = (hi >>> 8) & 255; msg[total - 5] = hi & 255;
  msg[total - 4] = (lo >>> 24) & 255; msg[total - 3] = (lo >>> 16) & 255; msg[total - 2] = (lo >>> 8) & 255; msg[total - 1] = lo & 255;

  var w = new Array(64);
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  for (var off = 0; off < total; off += 64) {
    for (var i = 0; i < 16; i++) {
      w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
    }
    for (i = 16; i < 64; i++) {
      var s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      var s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      var ch = ((e & f) ^ (~e & g)) >>> 0;
      var t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  var out = new Uint8Array(32);
  for (var k = 0; k < 8; k++) {
    out[k * 4] = (H[k] >>> 24) & 255; out[k * 4 + 1] = (H[k] >>> 16) & 255;
    out[k * 4 + 2] = (H[k] >>> 8) & 255; out[k * 4 + 3] = H[k] & 255;
  }
  return out;
}

if (typeof window !== 'undefined') window.ImportDecode = ImportDecode;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportDecode;

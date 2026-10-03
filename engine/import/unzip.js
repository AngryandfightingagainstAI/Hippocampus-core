// ============================================================
// 导入层 · ZIP 读取 + raw DEFLATE 解压（纯 JS，无依赖）
// 支撑 docx / odt / epub / zip 四种格式。
// 只依赖 Uint8Array —— Node、Electron、Hermes 都能跑。
// ============================================================

// ---------- raw inflate（puff.c 同构的规范哈夫曼解码）----------
var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DEXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var CLCIDX = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function Huff() { this.count = new Int32Array(16); this.symbol = new Int32Array(320); this.maxLen = 0; }

function buildHuff(h, lengths, off, num) {
  var i, l;
  for (i = 0; i < 16; i++) h.count[i] = 0;
  for (i = 0; i < num; i++) h.count[lengths[off + i]]++;
  h.count[0] = 0;
  var left = 1;
  h.maxLen = 0;
  for (l = 1; l < 16; l++) {
    left <<= 1;
    left -= h.count[l];
    if (left < 0) throw new Error('哈夫曼表过长（lengths 非法）');
    if (h.count[l]) h.maxLen = l;
  }
  var offs = new Int32Array(16);
  for (l = 1; l < 16; l++) offs[l] = offs[l - 1] + h.count[l - 1];
  for (i = 0; i < num; i++) if (lengths[off + i]) h.symbol[offs[lengths[off + i]]++] = i;
  return h;
}

function BitReader(bytes) {
  this.b = bytes;
  this.pos = 0;
  this.bitBuf = 0;
  this.bitCnt = 0;
}

BitReader.prototype.bit = function () {
  if (this.bitCnt === 0) {
    if (this.pos >= this.b.length) throw new Error('解压数据提前结束');
    this.bitBuf = this.b[this.pos++];
    this.bitCnt = 8;
  }
  var v = this.bitBuf & 1;
  this.bitBuf >>>= 1;
  this.bitCnt--;
  return v;
};

BitReader.prototype.bits = function (n) {
  var v = 0;
  for (var i = 0; i < n; i++) v |= this.bit() << i;
  return v;
};

function decodeSym(r, h) {
  var code = 0, first = 0, index = 0;
  for (var len = 1; len <= h.maxLen; len++) {
    code |= r.bit();
    var count = h.count[len];
    if (code - count < first) return h.symbol[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new Error('哈夫曼解码失败（码表越界）');
}

var FIXED_LIT = null, FIXED_DIST = null;
function fixedTrees() {
  if (FIXED_LIT) return;
  var l = new Uint8Array(288), i;
  for (i = 0; i < 144; i++) l[i] = 8;
  for (i = 144; i < 256; i++) l[i] = 9;
  for (i = 256; i < 280; i++) l[i] = 7;
  for (i = 280; i < 288; i++) l[i] = 8;
  FIXED_LIT = buildHuff(new Huff(), l, 0, 288);
  var d = new Uint8Array(30);
  for (i = 0; i < 30; i++) d[i] = 5;
  FIXED_DIST = buildHuff(new Huff(), d, 0, 30);
}

function OutBuf(estimate) {
  this.buf = new Uint8Array(Math.max(estimate || 1024, 256));
  this.len = 0;
}
OutBuf.prototype.ensure = function (extra) {
  if (this.len + extra <= this.buf.length) return;
  var cap = this.buf.length;
  while (cap < this.len + extra) cap *= 2;
  var nb = new Uint8Array(cap);
  nb.set(this.buf.subarray(0, this.len));
  this.buf = nb;
};
OutBuf.prototype.push = function (b) { this.ensure(1); this.buf[this.len++] = b; };
OutBuf.prototype.copyFrom = function (dist, length) {
  if (dist > this.len) throw new Error('解压回溯距离越界（数据损坏）');
  this.ensure(length);
  var src = this.len - dist;
  for (var i = 0; i < length; i++) this.buf[this.len++] = this.buf[src + i];
};
OutBuf.prototype.bytes = function () { return this.buf.subarray(0, this.len); };

function inflateRaw(data, hintSize) {
  var r = new BitReader(data);
  var out = new OutBuf(hintSize);
  var lit = null, dist = null;
  var clLens = new Uint8Array(320);
  var lens = new Uint8Array(320);
  var dynamicLit = new Huff(), dynamicDist = new Huff(), clHuff = new Huff();
  var done = false;

  while (!done) {
    var last = r.bit();
    var type = r.bits(2);
    if (type === 0) {
      // 非压缩块：对齐到字节边界
      r.bitCnt = 0;
      if (r.pos + 4 > r.b.length) throw new Error('非压缩块头部越界');
      var len = r.b[r.pos] | (r.b[r.pos + 1] << 8);
      var nlen = r.b[r.pos + 2] | (r.b[r.pos + 3] << 8);
      r.pos += 4;
      if ((len ^ 0xFFFF) !== nlen) throw new Error('非压缩块 LEN/NLEN 不匹配');
      if (r.pos + len > r.b.length) throw new Error('非压缩块数据越界');
      out.ensure(len);
      for (var i = 0; i < len; i++) out.buf[out.len++] = r.b[r.pos++];
    } else if (type === 1) {
      fixedTrees();
      lit = FIXED_LIT; dist = FIXED_DIST;
      inflateBlock(r, out, lit, dist);
    } else if (type === 2) {
      var hlit = r.bits(5) + 257;
      var hdist = r.bits(5) + 1;
      var hclen = r.bits(4) + 4;
      if (hlit > 286 || hdist > 30) throw new Error('动态哈夫曼头参数越界');
      for (var c = 0; c < 19; c++) clLens[c] = 0;
      for (var ci = 0; ci < hclen; ci++) clLens[CLCIDX[ci]] = r.bits(3);
      buildHuff(clHuff, clLens, 0, 19);
      var n = 0;
      while (n < hlit + hdist) {
        var sym = decodeSym(r, clHuff);
        if (sym < 16) lens[n++] = sym;
        else if (sym === 16) {
          if (n === 0) throw new Error('码长重复码出现在首位');
          var prev = lens[n - 1], rep = 3 + r.bits(2);
          while (rep-- && n < hlit + hdist) lens[n++] = prev;
        } else if (sym === 17) {
          var rep17 = 3 + r.bits(3);
          while (rep17-- && n < hlit + hdist) lens[n++] = 0;
        } else {
          var rep18 = 11 + r.bits(7);
          while (rep18-- && n < hlit + hdist) lens[n++] = 0;
        }
      }
      if (lens[256] === 0) throw new Error('动态块缺少结束码 256');
      buildHuff(dynamicLit, lens, 0, hlit);
      buildHuff(dynamicDist, lens, hlit, hdist);
      inflateBlock(r, out, dynamicLit, dynamicDist);
    } else {
      throw new Error('非法的块类型 type=3');
    }
    if (last) done = true;
  }
  return out.bytes();
}

function inflateBlock(r, out, lit, dist) {
  for (;;) {
    var sym = decodeSym(r, lit);
    if (sym < 256) { out.push(sym); continue; }
    if (sym === 256) return;
    var li = sym - 257;
    if (li >= LBASE.length) throw new Error('长度码越界：' + sym);
    var length = LBASE[li] + r.bits(LEXTRA[li]);
    var dsym = decodeSym(r, dist);
    if (dsym >= DBASE.length) throw new Error('距离码越界：' + dsym);
    var distance = DBASE[dsym] + r.bits(DEXTRA[dsym]);
    out.copyFrom(distance, length);
  }
}

// 兼容 zlib 包装（0x78 开头，末尾 4 字节 adler32）
function inflateMaybeZlib(data, hint) {
  if (data.length > 2 && (data[0] & 0x0F) === 8 && ((data[0] << 8 | data[1]) % 31) === 0) {
    return inflateRaw(data.subarray(2, data.length - 4), hint);
  }
  return inflateRaw(data, hint);
}

// ---------- ZIP 中央目录 ----------
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

function findEOCD(b) {
  var min = Math.max(0, b.length - 65557);
  for (var i = b.length - 22; i >= min; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
  }
  return -1;
}

var ImportUnzip = {
  inflateRaw: inflateRaw,

  // 列成员（只读中央目录，不解压）
  list: function (input) {
    var b = input;
    var eocd = findEOCD(b);
    if (eocd < 0) throw new Error('不是有效 ZIP（找不到中央目录结尾）');
    var count = u16(b, eocd + 10);
    var cdOff = u32(b, eocd + 16);
    var entries = [];
    var p = cdOff;
    for (var i = 0; i < count; i++) {
      if (p + 46 > b.length || u32(b, p) !== 0x02014B50) break;
      var method = u16(b, p + 10);
      var csize = u32(b, p + 20);
      var usize = u32(b, p + 24);
      var nameLen = u16(b, p + 28);
      var extraLen = u16(b, p + 30);
      var cmtLen = u16(b, p + 32);
      var extAttr = u32(b, p + 38);
      var lho = u32(b, p + 42);
      var name = utf8Name(b.subarray(p + 46, p + 46 + nameLen));
      var isDir = /\/$/.test(name) || ((extAttr >>> 16) & 0x10) === 0x10;
      entries.push({ name: name, method: method, compressedSize: csize, uncompressedSize: usize, localHeaderOffset: lho, isDir: isDir, encrypted: (u16(b, p + 8) & 1) === 1 });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return entries;
  },

  // 解压一个成员，返回 Uint8Array（找不到返回 null）
  read: function (input, name) {
    var b = input;
    var list = this.list(b);
    for (var i = 0; i < list.length; i++) {
      if (list[i].name !== name) continue;
      var e = list[i];
      if (e.encrypted) throw new Error('成员「' + name + '」已加密，无法解压');
      var lho = e.localHeaderOffset;
      if (u32(b, lho) !== 0x04034B50) throw new Error('成员「' + name + '」本地头非法');
      var nameLen = u16(b, lho + 26);
      var extraLen = u16(b, lho + 28);
      var start = lho + 30 + nameLen + extraLen;
      var raw = b.subarray(start, start + e.compressedSize);
      if (e.method === 0) return raw;
      if (e.method === 8) return inflateRaw(raw, e.uncompressedSize || raw.length * 4);
      throw new Error('成员「' + name + '」使用了不支持的压缩方式 method=' + e.method);
    }
    return null;
  },

  readText: function (input, name, decode) {
    var bytes = this.read(input, name);
    if (bytes === null) return null;
    var dec = decode || (typeof ImportDecode !== 'undefined' ? ImportDecode : null);
    if (!dec || typeof dec.text !== 'function') throw new Error('readText 缺少解码器（engine/import/decode.js 未加载）');
    return dec.text(bytes);
  },

  // 按后缀找成员，返回第一个命中的名字
  find: function (input, re) {
    var list = this.list(input);
    for (var i = 0; i < list.length; i++) {
      if (re.test(list[i].name)) return list[i];
    }
    return null;
  }
};

// ZIP 名字通常是 UTF-8（未设 flag 时按 CP437，这里只做 UTF-8 兜底）
function utf8Name(sub) {
  var invalid = 0, i = 0, out = [];
  while (i < sub.length) {
    var c = sub[i];
    if (c < 0x80) { out.push(c); i++; continue; }
    var need = 0, cp = 0;
    if ((c & 0xE0) === 0xC0) { need = 1; cp = c & 0x1F; }
    else if ((c & 0xF0) === 0xE0) { need = 2; cp = c & 0x0F; }
    else if ((c & 0xF8) === 0xF0) { need = 3; cp = c & 0x07; }
    else { invalid++; out.push(c); i++; continue; }
    if (i + need >= sub.length) { invalid++; out.push(c); i++; continue; }
    var ok = true;
    for (var k = 1; k <= need; k++) {
      if ((sub[i + k] & 0xC0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (sub[i + k] & 0x3F);
    }
    if (!ok) { invalid++; out.push(c); i++; continue; }
    out.push(cp);
    i += need + 1;
  }
  var s = '';
  for (var j = 0; j < out.length; j++) {
    var v = out[j];
    if (v > 0xFFFF) { v -= 0x10000; s += String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF)); }
    else s += String.fromCharCode(v);
  }
  // 非 UTF-8 名字（CP437 中文乱码）时至少保证可读：把无效字节转成 \xNN
  return invalid ? s : s;
}

if (typeof window !== 'undefined') window.ImportUnzip = ImportUnzip;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportUnzip;

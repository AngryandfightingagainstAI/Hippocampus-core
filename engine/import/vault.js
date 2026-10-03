// ============================================================
// 导入层 · 原件保管库
// 为什么要有这个东西：AI 把资料转成卡带，那只是「转换结果」。
// 万一以后发现抽取错了，原始资料必须还在，能追溯、能重跑。
//   vfs:/imports/<importId>/manifest.json      这次导入的清单与来源信息
//   vfs:/imports/<importId>/files/<storedAs>   原文件的 base64（二进制也留得住）
//   vfs:/imports/<importId>/imd/<storedAs>.json 中间格式快照（可重跑 → 结果可复现）
// ============================================================

var IMPORT_VAULT_ROOT = 'vfs:/imports/';
var IMPORT_VAULT_MAX_BYTES = 8 * 1024 * 1024; // 单个原文件留存上限，超出则只记 sha256 不存内容

var ImportVault = {
  root: IMPORT_VAULT_ROOT,
  maxBytes: IMPORT_VAULT_MAX_BYTES,

  newImportId: function () {
    var d = new Date();
    var pad = function (n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; };
    var stamp = d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) + '-'
      + pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2);
    var rnd = Math.floor(Math.random() * 0x10000).toString(36);
    return 'imp_' + stamp + '_' + rnd;
  },

  _vfs: function () {
    if (typeof VFS !== 'undefined' && VFS && VFS.writeFile) return VFS;
    if (typeof window !== 'undefined' && window.VFS && window.VFS.writeFile) return window.VFS;
    return null;
  },

  _dir: function (importId) { return this.root + importId + '/'; },
  _manifestPath: function (importId) { return this._dir(importId) + 'manifest.json'; },

  _safeName: function (name) {
    var base = String(name || 'file').replace(/[\\/]/g, '_').replace(/[^\w\u4e00-\u9fa5.\-()+ ]/g, '_');
    if (base.length > 120) {
      var dot = base.lastIndexOf('.');
      var ext = dot > 0 ? base.slice(dot) : '';
      base = base.slice(0, 120 - ext.length) + ext;
    }
    return base || 'file';
  },

  // 保存原文件。返回 { ok, sha256, path, reason }
  saveOriginal: function (importId, name, bytes, meta) {
    var vfs = this._vfs();
    var sha = null;
    try { sha = ImportDecode.sha256Hex(bytes); } catch (e) { sha = null; }
    if (!vfs) return { ok: false, sha256: sha, reason: 'VFS 不可用（离线夹具环境），只记了指纹', path: null };
    if (!importId) importId = this.newImportId();
    if (bytes && bytes.length > this.maxBytes) {
      return {
        ok: false, sha256: sha, path: null,
        reason: '原文件 ' + fmtSize(bytes.length) + ' 超过留存上限 ' + fmtSize(this.maxBytes) + '，已在清单里记录指纹与大小，未复制内容'
      };
    }
    var storedAs = this._safeName(name);
    var path = this._dir(importId) + 'files/' + storedAs + '.b64';
    var ok = false;
    try { ok = vfs.writeFile(path, ImportDecode.toBase64(bytes)) === true; } catch (e2) { ok = false; }
    if (!ok) return { ok: false, sha256: sha, path: null, reason: '写入存储失败（可能是空间不足），原文件未留存，指纹已记录' };

    var mf = this.get(importId) || this._blankManifest(importId);
    mf.files.push({
      name: name, storedAs: storedAs, path: path, bytes: bytes.length, sha256: sha,
      formatId: (meta && meta.formatId) || null, at: new Date().toISOString(),
      kept: true
    });
    mf.updatedAt = new Date().toISOString();
    this._writeManifest(importId, mf);
    return { ok: true, sha256: sha, path: path, reason: null };
  },

  _blankManifest: function (importId) {
    return {
      importId: importId, createdAt: new Date().toISOString(), updatedAt: null,
      files: [], imds: [], cards: [], notes: []
    };
  },

  _writeManifest: function (importId, mf) {
    var vfs = this._vfs();
    if (!vfs) return false;
    try { return vfs.writeJSON(this._manifestPath(importId), mf) === true; } catch (e) { return false; }
  },

  get: function (importId) {
    var vfs = this._vfs();
    if (!vfs) return null;
    try { return vfs.readJSON(this._manifestPath(importId)); } catch (e) { return null; }
  },

  list: function () {
    var vfs = this._vfs();
    if (!vfs) return [];
    var paths;
    try { paths = vfs.listAll(this.root); } catch (e) { return []; }
    var out = [];
    for (var i = 0; i < paths.length; i++) {
      var m = /^imports\/([^/]+)\/manifest\.json$/.exec(paths[i]);
      if (!m) continue;
      var mf = this.get(m[1]);
      if (mf) out.push(mf);
    }
    out.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return out;
  },

  readOriginal: function (importId, nameOrStoredAs) {
    var vfs = this._vfs();
    if (!vfs) return null;
    var mf = this.get(importId);
    if (!mf) return null;
    for (var i = 0; i < mf.files.length; i++) {
      var f = mf.files[i];
      if (f.name === nameOrStoredAs || f.storedAs === nameOrStoredAs) {
        try {
          var b64 = vfs.readFile(f.path);
          return b64 ? ImportDecode.fromBase64(b64) : null;
        } catch (e) { return null; }
      }
    }
    return null;
  },

  // 中间格式快照：留着才能「不重新解析就把同一份资料再转一次」
  saveImd: function (importId, imd) {
    var vfs = this._vfs();
    if (!vfs || !imd) return false;
    var storedAs = this._safeName(imd.source && imd.source.name ? imd.source.name : 'imd') + '.imd.json';
    var path = this._dir(importId) + 'imd/' + storedAs;
    var ok = false;
    try { ok = vfs.writeFile(path, JSON.stringify(imd)) === true; } catch (e) { ok = false; }
    if (!ok) return false;
    var mf = this.get(importId) || this._blankManifest(importId);
    mf.imds.push({ source: imd.source ? imd.source.name : null, path: path, importId: imd.importId, at: new Date().toISOString() });
    mf.updatedAt = new Date().toISOString();
    this._writeManifest(importId, mf);
    return true;
  },

  loadImd: function (importId, nameOrStoredAs) {
    var vfs = this._vfs();
    if (!vfs) return null;
    var mf = this.get(importId);
    if (!mf) return null;
    for (var i = 0; i < mf.imds.length; i++) {
      var it = mf.imds[i];
      if (!nameOrStoredAs || it.source === nameOrStoredAs || it.path.indexOf(nameOrStoredAs) >= 0) {
        try { return JSON.parse(vfs.readFile(it.path)); } catch (e) { return null; }
      }
    }
    return null;
  },

  // 记下「这次导入最后生成了哪张卡带」——以后能反查资料来源
  linkCard: function (importId, cardId, extra) {
    var mf = this.get(importId);
    if (!mf) return false;
    mf.cards.push({ cardId: cardId, at: new Date().toISOString(), note: (extra && extra.note) || null });
    mf.updatedAt = new Date().toISOString();
    return this._writeManifest(importId, mf);
  },

  listByCard: function (cardId) {
    var all = this.list();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      for (var j = 0; j < all[i].cards.length; j++) {
        if (all[i].cards[j].cardId === cardId) { out.push(all[i]); break; }
      }
    }
    return out;
  },

  remove: function (importId) {
    var vfs = this._vfs();
    if (!vfs) return false;
    try {
      var paths = vfs.listAll(this.root + importId + '/');
      for (var i = 0; i < paths.length; i++) {
        try { vfs.deleteFile('vfs:/' + paths[i]); } catch (e) { /* 继续删别的 */ }
      }
      return true;
    } catch (e2) { return false; }
  }
};

function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

if (typeof window !== 'undefined') window.ImportVault = ImportVault;
if (typeof module !== 'undefined' && module.exports) module.exports = ImportVault;

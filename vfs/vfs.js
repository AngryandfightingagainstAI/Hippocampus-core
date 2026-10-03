// ============================================================
// VFS · 虚拟文件系统
// v2：writeFile 加配额兜底 + usage / deleteOldestSnapshot
// StorageAdapter 模拟文件夹。打包 EXE 后换 fs 即可。
// ============================================================

(function() {
  var PREFIX = 'vfs:';
  var DIRS_KEY = 'vfs_dirs';

  function getDirs() {
    try { return JSON.parse(StorageAdapter.getItem(DIRS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveDirs(dirs) { StorageAdapter.setItem(DIRS_KEY, JSON.stringify(dirs)); }
  function addDir(path) {
    var dirs = getDirs();
    var parts = path.split('/').filter(Boolean);
    var cur = '';
    for (var i = 0; i < parts.length; i++) {
      cur += '/' + parts[i];
      if (dirs.indexOf(cur) === -1) dirs.push(cur);
    }
    saveDirs(dirs);
  }
  function normalizePath(p) {
    var out = String(p || '').trim();
    if (out.charAt(0) !== '/') out = '/' + out;
    out = out.replace(/\/+/g, '/');
    if (out.length > 1 && out.charAt(out.length - 1) === '/') out = out.slice(0, -1);
    return out;
  }

  var VFS = {
    writeFile: function(path, content) {
      path = normalizePath(path);
      var str = (typeof content === 'string') ? content : JSON.stringify(content);
      var ok = false;
      try {
        StorageAdapter.setItem(PREFIX + path, str);
        ok = true;
      } catch (e) {
        // 存储满 / 隐私模式：交给全局兜底处理（清旧数据 + 重试）
        if (typeof window !== 'undefined' && typeof window._vfsOnWriteFail === 'function') {
          try { ok = !!window._vfsOnWriteFail(path, str, e); }
          catch (_) { ok = false; }
        }
        if (!ok && typeof window !== 'undefined' && typeof window._vfsOnFatal === 'function') {
          try { window._vfsOnFatal(path, e); } catch (_) {}
        }
      }
      if (!ok) return false;
      var dir = path.slice(0, path.lastIndexOf('/')) || '/';
      if (dir !== '/') addDir(dir);
      return true;
    },

    readFile: function(path) {
      return StorageAdapter.getItem(PREFIX + normalizePath(path));
    },

    readJSON: function(path) {
      var s = this.readFile(path);
      if (!s) return null;
      try { return JSON.parse(s); } catch (e) { return null; }
    },

    writeJSON: function(path, obj) { this.writeFile(path, JSON.stringify(obj)); },

    exists: function(path) { return StorageAdapter.getItem(PREFIX + normalizePath(path)) !== null; },

    deleteFile: function(path) {
      StorageAdapter.removeItem(PREFIX + normalizePath(path));
      this.gcDirs();
    },

    listAll: function(prefix) {
      prefix = normalizePath(prefix);
      if (prefix.charAt(prefix.length - 1) !== '/') prefix += '/';
      var out = [];
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          var p = k.slice(PREFIX.length);
          if (p.indexOf(prefix) === 0) out.push(p);
        }
      }
      return out;
    },

    listDir: function(path) {
      path = normalizePath(path);
      var prefix = (path === '/') ? '/' : path + '/';
      var seen = {};
      var out = [];
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (!k || k.indexOf(PREFIX) !== 0) continue;
        var p = k.slice(PREFIX.length);
        if (p.indexOf(prefix) !== 0) continue;
        var rest = p.slice(prefix.length);
        if (!rest) continue;
        var slash = rest.indexOf('/');
        if (slash === -1) {
          if (!seen[rest]) { seen[rest] = true; out.push({ name: rest, type: 'file', path: p }); }
        } else {
          var dirName = rest.slice(0, slash);
          if (!seen[dirName]) {
            seen[dirName] = true;
            out.push({ name: dirName, type: 'dir', path: prefix + dirName });
          }
        }
      }
      getDirs().forEach(function(d) {
        if (d.indexOf(prefix) !== 0) return;
        var rest = d.slice(prefix.length);
        var slash = rest.indexOf('/');
        if (slash === -1 && !seen[rest]) {
          seen[rest] = true;
          out.push({ name: rest, type: 'dir', path: d });
        }
      });
      return out;
    },

    mkdir: function(path) { addDir(normalizePath(path)); },

    rmdir: function(path, recursive) {
      path = normalizePath(path);
      if (!recursive) {
        var has = this.listAll(path).length > 0;
        if (has) return false;
        var dirs = getDirs().filter(function(d) { return d !== path; });
        saveDirs(dirs);
        return true;
      }
      var files = this.listAll(path);
      for (var i = 0; i < files.length; i++) {
        StorageAdapter.removeItem(PREFIX + files[i]);
      }
      var dirs2 = getDirs().filter(function(d) {
        return d !== path && d.indexOf(path + '/') !== 0;
      });
      saveDirs(dirs2);
      return true;
    },

    gcDirs: function() {
      var dirs = getDirs();
      var used = {};
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          var p = k.slice(PREFIX.length);
          var idx = p.lastIndexOf('/');
          while (idx > 0) {
            used[p.slice(0, idx)] = true;
            idx = p.lastIndexOf('/', idx - 1);
          }
        }
      }
      var kept = dirs.filter(function(d) { return used[d]; });
      if (kept.length !== dirs.length) saveDirs(kept);
    },

    copyFile: function(from, to) {
      var s = this.readFile(from);
      if (s !== null) this.writeFile(to, s);
    },

    updateJSONs: function(dirPrefix, objMap) {
      var self = this;
      Object.keys(objMap || {}).forEach(function(id) {
        self.writeJSON(dirPrefix + '/' + id + '.json', objMap[id]);
      });
    },

    exportAll: function() {
      var out = { version: 1, files: {}, dirs: getDirs() };
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.files[k.slice(PREFIX.length)] = StorageAdapter.getItem(k);
      }
      return out;
    },
    importAll: function(data) {
      if (!data) return;
      var files = data.files || {};
      Object.keys(files).forEach(function(p) {
        StorageAdapter.setItem(PREFIX + p, files[p]);
      });
      if (Array.isArray(data.dirs)) saveDirs(data.dirs);
    },
    wipe: function() {
      var toRemove = [];
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
      }
      toRemove.forEach(function(k) { StorageAdapter.removeItem(k); });
      StorageAdapter.removeItem(DIRS_KEY);
    },

    _debug: function() {
      var files = [];
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (k && k.indexOf(PREFIX) === 0) files.push(k.slice(PREFIX.length));
      }
      return { dirs: getDirs(), files: files };
    },

    // ★ 当前 VFS 用量（字节）
    usage: function() {
      var total = 0;
      for (var i = 0; i < StorageAdapter.length; i++) {
        var k = StorageAdapter.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          total += (k.length + String(StorageAdapter.getItem(k) || '').length) * 2;
        }
      }
      return total;
    },

    // ★ 删掉某存档最旧的快照，返回是否删掉
    deleteOldestSnapshot: function(cardId, saveId) {
      if (!cardId || !saveId) return false;
      var dir = '/saves/' + cardId + '/' + saveId + '/snapshots';
      var files = this.listAll(dir).filter(function(p) { return p.indexOf('.json') > 0; });
      if (!files.length) return false;
      files.sort();
      this.deleteFile(files[0]);
      return true;
    }
  };

  if (typeof window !== 'undefined') window.VFS = VFS;
  if (typeof module !== 'undefined' && module.exports) module.exports = VFS;
})();
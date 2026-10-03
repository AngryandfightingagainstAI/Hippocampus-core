// ============================================================
// 存储适配层 · v2 · 两仓同源单一事实源（Electron ↔ RN）
// 把 localStorage 收口到一层薄抽象。运行时按环境二选一：
// - Electron / 浏览器（有 window.localStorage）：走 localStorage（行为不变）
// - React Native（无 window）：走 op-sqlite（SQLite 同步 KV 表 kv）
// - Node 冒烟（无 window、仓内无 op-sqlite 依赖）：require 失败 →
//   读静默（null/0）、写抛 StorageUnavailableError 的兜底实现
// 接口完整镜像 localStorage：length / key / getItem / setItem / removeItem / clear
// 前缀（如 'vfs:'）由调用方管理，adapter 不管命名空间。
//
// 同源铁律：本文件为唯一事实源，RN 仓
// D:\HippocampusRN\vfs\storage_adapter.js 必须与本文件逐字节一致，
// 只允许 Electron → RN 单向同步，禁止在 RN 仓分叉修改。
//
// 关键：op-sqlite 的 require 必须只出现在无 window 的分支内、且用
// try/catch 动态加载——Electron 仓与 Node 环境没有该依赖，顶层静态
// require 会让模块加载（含 rn_startup_smoke）当场炸。
// ============================================================

(function() {
  var hasLocalStorage = false;
  try {
    hasLocalStorage = typeof window !== 'undefined' &&
                      window.localStorage &&
                      typeof window.localStorage.getItem === 'function';
  } catch (e) {}

  var impl;

  if (hasLocalStorage) {
    // ============================================================
    // 实现 A · Electron / 浏览器 · localStorage
    // ============================================================
    impl = {
      getItem: function(key) {
        return window.localStorage.getItem(key);
      },
      setItem: function(key, value) {
        // 注意：配额满时会抛 QuotaExceededError。VFS.writeFile 靠 catch 触发兜底链，语义必须保留。
        window.localStorage.setItem(key, value);
      },
      removeItem: function(key) {
        window.localStorage.removeItem(key);
      },
      key: function(index) {
        return window.localStorage.key(index);
      },
      clear: function() {
        window.localStorage.clear();
      },
      estimateBytes: function() {
        var total = 0;
        for (var i = 0; i < this.length; i++) {
          var k = this.key(i);
          var v = this.getItem(k) || '';
          total += (k.length + v.length) * 2;
        }
        return total;
      }
    };
    Object.defineProperty(impl, 'length', {
      get: function() { return window.localStorage.length; }
    });
  } else {
    // ============================================================
    // 实现 B · 无 window（React Native 走 op-sqlite / Node 走兜底）
    // ============================================================
    var opSqlite = null;
    try {
      opSqlite = require('@op-engineering/op-sqlite');
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[StorageAdapter] op-sqlite 不可用：', e && e.message);
      }
    }

    // op-sqlite 不可用时的统一错误工厂
    // 抛 StorageUnavailableError（区别于 localStorage 的 QuotaExceededError）
    // 库不可用 = 重试也白搭，所有写操作都该抛
    // 读操作（getItem/key/length/estimateBytes）保持静默，返回 null/0
    function throwUnavailable() {
      var err = new Error('StorageAdapter: op-sqlite unavailable');
      err.name = 'StorageUnavailableError';
      throw err;
    }

    if (opSqlite && typeof opSqlite.open === 'function') {
      var db = opSqlite.open({ name: 'hippocampus_vfs.db' });
      db.executeSync('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');

      // 内存 key 索引（按 rowid 顺序 = 近似插入顺序）
      // 避免每次 length/key 都做全表 SELECT
      var keys = [];
      (function loadKeys() {
        var r = db.executeSync('SELECT k FROM kv ORDER BY rowid');
        for (var i = 0; i < r.rows.length; i++) {
          keys.push(r.rows[i].k);
        }
      })();

      impl = {
        getItem: function(key) {
          var r = db.executeSync('SELECT v FROM kv WHERE k = ?', [key]);
          if (!r.rows || !r.rows.length) return null;
          var v = r.rows[0].v;
          return (v === undefined || v === null) ? null : String(v);
        },
        setItem: function(key, value) {
          var v = String(value);
          var existed = keys.indexOf(key) >= 0;
          db.executeSync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [key, v]);
          if (!existed) keys.push(key);
        },
        removeItem: function(key) {
          db.executeSync('DELETE FROM kv WHERE k = ?', [key]);
          var idx = keys.indexOf(key);
          if (idx >= 0) keys.splice(idx, 1);
        },
        key: function(index) {
          if (index < 0 || index >= keys.length) return null;
          return keys[index];
        },
        clear: function() {
          db.executeSync('DELETE FROM kv');
          keys.length = 0;
        },
        estimateBytes: function() {
          // SQLite 版本用字符数近似（口径与 localStorage 版本保持一致）
          var total = 0;
          for (var i = 0; i < this.length; i++) {
            var k = this.key(i);
            var v = this.getItem(k) || '';
            total += (k.length + v.length) * 2;
          }
          return total;
        }
      };
      Object.defineProperty(impl, 'length', {
        get: function() { return keys.length; }
      });
    } else {
      // op-sqlite 不可用：写操作抛 StorageUnavailableError，读操作静默
      impl = {
        getItem: function() { return null; },
        setItem: function() { throwUnavailable(); },
        removeItem: function() { throwUnavailable(); },
        key: function() { return null; },
        clear: function() { throwUnavailable(); },
        estimateBytes: function() { return 0; }
      };
      Object.defineProperty(impl, 'length', {
        get: function() { return 0; }
      });
    }
  }

  // 双挂载
  if (typeof window !== 'undefined') window.StorageAdapter = impl;
  if (typeof module !== 'undefined' && module.exports) module.exports = impl;
})();

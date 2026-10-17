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
  // P57：存储不可用的成因（可用时为空串）。P56 只回答了「能不能用」，而读侧全程静默，
  // 空列表因此无法与「你没有存档」区分 —— 这里补上「为什么不能用」。
  var unavailableReason = '';

  // P57：把「打开 + 建表」抽成独立函数，两个用处：
  //   1) 调用点 try/catch —— 原来这步裸抛会让整个 storage_adapter.js 的 require 失败，
  //      rn_bootstrap 的 load() 只能记一笔失败，localStorage polyfill 还会建在 undefined 上，
  //      Storage 及所有存档模块成片倒下（用户侧 = 白屏/怪错，连 ErrorLog 都起不来，无处可查）；
  //   2) 单测可直接喂一个会抛的假 op-sqlite 驱动失败分支（test_vfs_write_contract_unit.js V17）。
  function _openSqliteDb(opSqliteApi) {
    var db = opSqliteApi.open({ name: 'hippocampus_vfs.db' });
    db.executeSync('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    return db;
  }

  if (hasLocalStorage) {
    // ============================================================
    // 实现 A · Electron / 浏览器 · localStorage
    // ============================================================
    impl = {
      getItem: function(key) {
        return window.localStorage.getItem(key);
      },
      // P56：只读探针 —— 供上层区分「读不到」与「存储压根不可用」（读语义未改）
      isAvailable: function() { return true; },
      // P57：可用时成因是空串
      unavailableReason: function() { return ''; },
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
    var loadErrMsg = '';   // P57：require 失败原因，兜底支据此给出成因
    try {
      opSqlite = require('@op-engineering/op-sqlite');
    } catch (e) {
      loadErrMsg = (e && e.message) ? String(e.message) : String(e);
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

    var db = null;
    if (opSqlite && typeof opSqlite.open === 'function') {
      try {
        db = _openSqliteDb(opSqlite);
      } catch (eOpen) {
        // P57：打开/建表失败（DB 损坏、迁移失败、权限/空间问题）不再致命 —— 降级到「不可用」支
        unavailableReason = 'op-sqlite 打开失败：' + ((eOpen && eOpen.message) ? eOpen.message : String(eOpen));
        if (typeof console !== 'undefined') console.warn('[StorageAdapter] ' + unavailableReason);
      }
    }

    if (db) {

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
        // P56：只读探针（op-sqlite 已打开 ⇒ 可用）
        isAvailable: function() { return true; },
        // P57：可用时成因是空串
        unavailableReason: function() { return ''; },
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
      if (!unavailableReason) {
        unavailableReason = loadErrMsg ? ('op-sqlite 模块加载失败：' + loadErrMsg) : 'op-sqlite 模块不可用';
      }
      impl = {
        getItem: function() { return null; },
        // P56：探针 —— 这一支就是「读静默返 null/0、写抛 StorageUnavailableError」的兜底实现，
        // 上层据此才能把「空存档列表」解释成「存储不可用」而不是「你没有存档」。
        isAvailable: function() { return false; },
        // P57：把「为什么不可用」也说清楚（读侧静默，空列表必须配一个能解释的成因）
        unavailableReason: function() { return unavailableReason; },
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
  // P57：把「打开 + 建表」暴露成测试缝 —— 单测用它驱动「op-sqlite 打开抛错」分支
  impl._openSqliteDb = _openSqliteDb;
  if (typeof window !== 'undefined') window.StorageAdapter = impl;
  if (typeof module !== 'undefined' && module.exports) module.exports = impl;
})();

// ============================================================
// VFS 存储配额防护
// 挂全局兜底：写入失败时清最旧快照 + 重试；彻底失败时明确告知玩家
// 加载位置：vfs/vfs.js 之后，vfs/saves.js 之前
// ============================================================

(function() {

  // 快照目录白名单（只清这些，不动存档/日志）
  function isSnapshotPath(p) {
    return p && p.indexOf('/snapshots/') >= 0 && p.indexOf('.json') > 0;
  }

  function clearOldestSnapshot() {
    try {
      if (typeof GameState === 'undefined') return false;
      if (!GameState.currentCardId || !GameState.currentSaveId) return false;
      return VFS.deleteOldestSnapshot(GameState.currentCardId, GameState.currentSaveId);
    } catch (e) { return false; }
  }

  // 写入失败的兜底：清旧快照 → 重试一次
  var _vfsOnWriteFail = function(path, str, err) {
    // 1. 正在写快照本身 → 直接放弃这次快照（不重试，避免死循环）
    //    返回 true 表示"已处理，不上报 fatal"——快照失败不该弹"存储已满"
    if (isSnapshotPath(path)) {
      console.warn('[VFS] 快照写入失败，已放弃：', path, err && err.message);
      return true;
    }

    // 2. 尝试清最旧快照 → 重试
    var deleted = clearOldestSnapshot();
    if (deleted) {
      try {
        StorageAdapter.setItem('vfs:' + path, str);
        // D-3：Platform.ui 由平台适配层在双端保证（同一契约冗余守卫删除）；appendHint 抛错由本 try 兜
        Platform.ui.appendHint('（存储空间不足，已自动清理最旧快照）');
        return true;
      } catch (e2) {
        console.warn('[VFS] 清快照后仍写入失败：', e2 && e2.message);
        return false;
      }
    }

    // 3. 清不动 → 交给 fatal
    return false;
  };

  // 彻底失败：记 error_log + 明确告知玩家（不伪装成 API 错误）
  var _vfsOnFatal = function(path, err) {
    console.error('[VFS] 存储写入彻底失败：', path, err);
    try {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.record) {
        ErrorLog.record({
          type: 'StorageFull',
          message: '存储写入失败：' + path + ' — ' + (err && err.message ? err.message : '未知')
        });
      }
    } catch (e) {}

    try {
      // D-3：Platform.ui 契约由平台适配层保证；保留 try/catch（UI 提示失败不应致命）
      Platform.ui.appendHint('⚠ 存储空间已满，本轮无法保存。请到"设置 → 数据"导出备份后清理。');
    } catch (e) {}
  };

  if (typeof window !== 'undefined') {
    window._vfsOnWriteFail = _vfsOnWriteFail;
    window._vfsOnFatal = _vfsOnFatal;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { _vfsOnWriteFail: _vfsOnWriteFail, _vfsOnFatal: _vfsOnFatal };
  }
})();
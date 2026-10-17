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

  // P56：失败归因 —— 不是所有写入失败都是「空间已满」。
  // 手机端 op-sqlite 未就绪时写操作抛 StorageUnavailableError（重试也白搭），
  // 磁盘/数据库/序列化错误两者都不是。把成因说错会让玩家去清空间（没用），
  // 也会污染 ErrorLog 的 type 统计（诊断时把 DB 错误当配额问题查）。
  function classifyFailure(err) {
    var name = (err && err.name) ? String(err.name) : '';
    var msg = (err && err.message) ? String(err.message) : '';
    var s = (name + ' ' + msg).toLowerCase();
    if (s.indexOf('quota') >= 0 || s.indexOf('storage full') >= 0 || s.indexOf('no space') >= 0) return 'quota';
    if (s.indexOf('unavailable') >= 0 || s.indexOf('not available') >= 0) return 'unavailable';
    return 'other';
  }

  // 彻底失败：记 error_log + 明确告知玩家（不伪装成 API 错误）
  var _vfsOnFatal = function(path, err) {
    console.error('[VFS] 存储写入彻底失败：', path, err);
    var kind = classifyFailure(err);
    var reason = (err && err.message) ? err.message : '未知';
    try {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.record) {
        ErrorLog.record({
          type: kind === 'quota' ? 'StorageFull'
              : (kind === 'unavailable' ? 'StorageUnavailable' : 'StorageWriteFailed'),
          message: '存储写入失败：' + path + ' — ' + (err && err.message ? err.message : '未知')
        });
      }
    } catch (e) {}

    try {
      // D-3：Platform.ui 契约由平台适配层保证；保留 try/catch（UI 提示失败不应致命）
      // P56：按归因给不同处置建议 —— 让玩家去清空间解决不了「数据库没就绪」。
      if (kind === 'quota') {
        Platform.ui.appendHint('⚠ 存储空间已满，本轮无法保存。请到"设置 → 数据"导出备份后清理。');
      } else if (kind === 'unavailable') {
        Platform.ui.appendHint('⚠ 本地存储不可用（数据库未就绪），本轮无法保存。请重启 App；仍不行请到"设置 → 数据"导出备份。');
      } else {
        Platform.ui.appendHint('⚠ 存档写入失败，本轮无法保存。原因：' + reason + '。请到"设置 → 数据"导出备份。');
      }
    } catch (e) {}
  };

  if (typeof window !== 'undefined') {
    window._vfsOnWriteFail = _vfsOnWriteFail;
    window._vfsOnFatal = _vfsOnFatal;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { _vfsOnWriteFail: _vfsOnWriteFail, _vfsOnFatal: _vfsOnFatal, classifyFailure: classifyFailure };
  }
})();
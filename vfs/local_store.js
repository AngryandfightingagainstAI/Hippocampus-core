// ============================================================
// 应用数据存储适配层
// 与 StorageAdapter 独立：StorageAdapter 管 VFS 文件存储，
// LocalStore 管应用数据（全局配置体检、错误日志、UI 状态等）。
// 两者现在都直连 localStorage，但将来 RN 迁移时后端会分化
// （VFS → AsyncStorage，应用数据 → SecureStore 等）。
// 接口只保留实际调用到的 3 个方法：getItem / setItem / removeItem。
// ============================================================

(function() {
  // 后端惰性解析（H3 修复 · 时序 bug）：
  // 原实现 `var ls = window.localStorage ...` 在模块求值瞬间捕获宿主对象。
  // RN 侧 rn_bootstrap 的 localStorage polyfill（挂 globalThis.localStorage）
  // 晚于本模块 require，且 polyfill 不挂 window.localStorage ⇒ 求值瞬间恒为 null，
  // LocalStore 全量静默 no-op（home_cardId 不落库、错误日志不落盘、audit 读不到配置）。
  // 改为每次调用时解析：Electron/浏览器 走宿主 localStorage，RN 走 polyfill，双端行为不变。
  function backing() {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  }

  var LocalStore = {
    getItem: function(key) {
      var ls = backing();
      return ls ? ls.getItem(key) : null;
    },
    setItem: function(key, value) {
      var ls = backing();
      if (ls) ls.setItem(key, value);
    },
    removeItem: function(key) {
      var ls = backing();
      if (ls) ls.removeItem(key);
    }
  };

  if (typeof window !== 'undefined') window.LocalStore = LocalStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = LocalStore;
})();

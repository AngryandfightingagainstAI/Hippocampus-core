// ============================================================
// 现实感知
// 给 AI 注入现实时间 / 距上次会话间隔，用于人机恋、长期陪伴场景
// 数据：ai_tg_global.realtime = { lastSeenAt: timestamp }
// 开关：全局 ai_tg_global.realtime.aware* / 卡带 card.realtime.*
// ============================================================

(function() {
  var DEFAULTS = {
    awareDate: true,       // 告诉 AI 年月日
    awareTime: true,       // 告诉 AI 具体时间
    awareWeekday: true,    // 告诉 AI 星期几
    awareGap: true         // 告诉 AI 距上次会话多久
  };

  function getGlobalConfig() {
    var g = Storage.getGlobal();
    return Object.assign({}, DEFAULTS, g.realtime || {});
  }

  function setGlobalConfig(patch) {
    var g = Storage.getGlobal();
    g.realtime = Object.assign({}, getGlobalConfig(), patch);
    Storage.setGlobal(g);
  }

  // 卡带层配置（覆盖全局）
  function getCardConfig() {
    var card = GameState.currentCard;
    if (!card) return null;
    return card.realtime || null;
  }

  // 最终生效配置：卡带 > 全局
  function getEffectiveConfig() {
    var g = getGlobalConfig();
    var c = getCardConfig();
    if (!c) return g;
    return {
      awareDate: c.awareDate != null ? c.awareDate : g.awareDate,
      awareTime: c.awareTime != null ? c.awareTime : g.awareTime,
      awareWeekday: c.awareWeekday != null ? c.awareWeekday : g.awareWeekday,
      awareGap: c.awareGap != null ? c.awareGap : g.awareGap
    };
  }

  // 是否整体启用：卡带 realtime 对象存在 = 启用；或全局 realtime.enabled = true
  function isEnabled() {
    var g = Storage.getGlobal();
    var c = getCardConfig();
    if (c && c.enabled === true) return true;
    if (g.realtime && g.realtime.enabled === true) return true;
    return false;
  }

  // ============ 时间格式化 ============
  function getPeriodName(hour) {
    if (hour < 5) return '凌晨';
    if (hour < 8) return '早晨';
    if (hour < 11) return '上午';
    if (hour < 13) return '中午';
    if (hour < 17) return '下午';
    if (hour < 19) return '傍晚';
    if (hour < 23) return '晚上';
    return '深夜';
  }

  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function formatNow() {
    var d = new Date();
    var p = function(n) { return String(n).padStart(2, '0'); };
    return {
      date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()),
      time: p(d.getHours()) + ':' + p(d.getMinutes()),
      weekday: WEEKDAYS[d.getDay()],
      period: getPeriodName(d.getHours()),
      hour: d.getHours(),
      ts: d.getTime()
    };
  }

  function formatGap(ms) {
    if (!ms || ms < 0) return '';
    var sec = Math.floor(ms / 1000);
    var min = Math.floor(sec / 60);
    var hr = Math.floor(min / 60);
    var day = Math.floor(hr / 24);
    if (day >= 1) {
      var remainHr = hr - day * 24;
      return remainHr > 0 ? (day + ' 天 ' + remainHr + ' 小时') : (day + ' 天');
    }
    if (hr >= 1) {
      var remainMin = min - hr * 60;
      return remainMin > 0 ? (hr + ' 小时 ' + remainMin + ' 分钟') : (hr + ' 小时');
    }
    if (min >= 1) return min + ' 分钟';
    return sec + ' 秒';
  }

  // ============ 上次会话记录 ============
  function getLastSeenAt() {
    var g = Storage.getGlobal();
    return (g.realtime && g.realtime.lastSeenAt) || null;
  }

  function touchLastSeen() {
    var g = Storage.getGlobal();
    g.realtime = g.realtime || {};
    g.realtime.lastSeenAt = Date.now();
    Storage.setGlobal(g);
  }

  // ============ 主对象 ============
  var Realtime = {
    DEFAULTS: DEFAULTS,
    getGlobalConfig: getGlobalConfig,
    setGlobalConfig: setGlobalConfig,
    getCardConfig: getCardConfig,
    getEffectiveConfig: getEffectiveConfig,
    isEnabled: isEnabled,
    formatNow: formatNow,
    formatGap: formatGap,
    touchLastSeen: touchLastSeen,
    getLastSeenAt: getLastSeenAt,

    // 给 prompt 用
    formatForPrompt: function() {
      if (!this.isEnabled()) return '';
      var cfg = this.getEffectiveConfig();
      var now = formatNow();
      var lines = [];

      // 现实时间
      var parts = [];
      if (cfg.awareDate) parts.push(now.date);
      if (cfg.awareWeekday) parts.push(now.weekday);
      if (cfg.awareTime) parts.push(now.time + '（' + now.period + '）');
      if (parts.length) {
        lines.push('>>> 现实时间：' + parts.join(' '));
      }

      // 距上次会话
      if (cfg.awareGap) {
        var last = getLastSeenAt();
        if (last && Date.now() - last > 60 * 1000) {
          lines.push('>>> 距上次会话：' + formatGap(Date.now() - last) + '（真实世界的间隔）');
        }
      }

      return lines.join('\n');
    }
  };

  // ============ 自动 touch ============
  // 每次会话开始 / 每轮 AI 调用后，更新 lastSeenAt
  function autoTouch() {
    try {
      if (typeof GameState === 'undefined') return;
      if (!GameState.currentCardId) return;
      touchLastSeen();
    } catch (e) {}
  }

  // 页面可见性变化时也 touch
  Platform.lifecycle.onForeground(autoTouch);

  // 暴露给 story.js 调用
  Realtime.autoTouch = autoTouch;
  if (typeof window !== 'undefined') window.Realtime = Realtime;
  if (typeof module !== 'undefined' && module.exports) module.exports = Realtime;
})();
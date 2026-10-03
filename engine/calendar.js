// ============================================================
// 日历系统 · 节假日池
// 引擎内置默认节日池；卡带可覆盖
// 分层：A 类 · 纯逻辑
// ============================================================

(function() {
  // 引擎内置默认节日池（公历固定日期）
  var DEFAULT_HOLIDAYS = [
    { month: 1,  day: 1,  name: '元旦',   icon: 'confetti' },
    { month: 2,  day: 14, name: '情人节', icon: 'gift' },
    { month: 3,  day: 8,  name: '妇女节', icon: 'flower' },
    { month: 4,  day: 1,  name: '愚人节', icon: 'mask-happy' },
    { month: 5,  day: 1,  name: '劳动节', icon: 'wrench' },
    { month: 6,  day: 1,  name: '儿童节', icon: 'balloon' },
    { month: 10, day: 31, name: '万圣节', icon: 'ghost' },
    { month: 12, day: 24, name: '平安夜', icon: 'tree-evergreen' },
    { month: 12, day: 25, name: '圣诞节', icon: 'tree-evergreen' },
    { month: 12, day: 31, name: '跨年夜', icon: 'confetti' }
  ];

  var Calendar = {
    DEFAULT_HOLIDAYS: DEFAULT_HOLIDAYS,

    // 取得当前生效的节日列表
    // 优先级：卡带定义（覆盖/追加）> 引擎默认
    getHolidays: function() {
      var card = GameState.currentCard;
      var cardHolidays = null;
      if (card && card.calendar && Array.isArray(card.calendar.holidays)) {
        cardHolidays = card.calendar.holidays;
      }

      // 卡带没定义 → 用默认
      if (cardHolidays === null) {
        return DEFAULT_HOLIDAYS.slice();
      }

      // 空数组 → 这个世界没有节日
      if (cardHolidays.length === 0) {
        return [];
      }

      // 有内容 → 默认 + 卡带（卡带覆盖默认）
      var map = {};
      DEFAULT_HOLIDAYS.forEach(function(h) {
        var k = h.month + '-' + h.day;
        map[k] = h;
      });
      cardHolidays.forEach(function(h) {
        var k = h.month + '-' + h.day;
        map[k] = h;
      });
      var out = [];
      Object.keys(map).forEach(function(k) { out.push(map[k]); });
      return out;
    },

    // 查某天有没有节日，返回匹配的节日对象数组（可能多个，可能空）
    getHolidayForDate: function(month, day) {
      var list = this.getHolidays();
      var out = [];
      list.forEach(function(h) {
        if (h.month === month && h.day === day) out.push(h);
      });
      return out;
    },

    // 便捷函数：查今天有没有节日（读 GameState._gameTime）
    getTodayHolidays: function() {
      if (!GameState._gameTime) return [];
      var t = GameState._gameTime;
      return this.getHolidayForDate(t.month, t.day);
    },

    // 是否启用显示（全局开关，默认开）
    isDisplayEnabled: function() {
      try {
        var g = Storage.getGlobal();
        if (g.settings && g.settings.calendar && g.settings.calendar.showHolidayIcons === false) {
          return false;
        }
      } catch (e) {}
      return true;
    }
  };

  if (typeof window !== 'undefined') window.Calendar = Calendar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Calendar;
})();

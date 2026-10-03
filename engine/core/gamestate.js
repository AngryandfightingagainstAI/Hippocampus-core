// ============================================================
// 核心层 · GameState
// 全局状态容器：卡带 / 存档 / 对话历史 / 游戏时间 / token 计数。
// 数据源是 Saves 层，被 ApiClient（写 token）和 PromptBuilder（读状态）依赖。
// ============================================================

var GameState = {
  currentCard: null, currentState: null, playerData: {}, chatHistory: [],
  currentCardId: null, currentSaveId: null,
  _sessionStart: 0, _sessionToken: 0,
  _gameTime: null, _totalTokens: 0, _lastUsage: null,
  // P17·A 缓存用量：_totalCachedTokens = 累计命中缓存的输入 token，
  // _totalCacheWriteTokens = 累计写入缓存的输入 token，_lastCacheUsage = 末次 { cached, creation }。
  _totalCachedTokens: 0, _totalCacheWriteTokens: 0, _lastCacheUsage: null,
  _pendingSystemNotices: [],
  _cachedStaticDynamic: null,
  _cacheVersion: 0,
  _lastReasoning: '',
  _lastContent: '',
  _lastCheck: null,
  _lastCompressMsgCount: 0,

  loadFromSave(cardId, saveId) {
    const data = Saves.load(cardId, saveId);
    if (!data) { Platform.dialog.alert('存档不存在或已损坏'); return false; }
    this.currentCardId = cardId;
    this.currentSaveId = saveId;
    this.currentCard = data.card;
    this.playerData = data.player.playerData || {};
    if (!this.playerData.inventory) this.playerData.inventory = { bar: [], common: [], story: [], rare: [] };
    if (typeof Alias !== 'undefined') Alias.normalize(this.playerData);
    this.chatHistory = data.chat.messages || [];
    this._sessionToken = Date.now();
    this._totalTokens = 0;
    this._lastUsage = null;
    this._totalCachedTokens = 0;
    this._totalCacheWriteTokens = 0;
    this._lastCacheUsage = null;
    this._lastReasoning = '';
    this._lastContent = '';
    this._lastCheck = null;
    this._lastCompressMsgCount = (this.chatHistory || []).filter(function(m) { return m.role !== 'system'; }).length;
    this._pendingSystemNotices = [];
    this._cachedStaticDynamic = null;

    if (typeof NpcRuntime !== 'undefined') NpcRuntime.load();
    if (typeof Portrait !== 'undefined' && !this.playerData.portrait) {
      const p = Portrait.load();
      if (p) this.playerData.portrait = p;
    }
    if (typeof StatusCard !== 'undefined') StatusCard.load();
    if (typeof Shop !== 'undefined') Shop.load();
    if (typeof Weather !== 'undefined' && typeof Weather.setRuntime === 'function') Weather.setRuntime(null);
    if (typeof Events !== 'undefined') Events.load();
    if (typeof Tasks !== 'undefined') Tasks.load();
    if (typeof Achievements !== 'undefined') Achievements.load();
    if (typeof Avatar !== 'undefined') Avatar.load();
    if (typeof DiceHistory !== 'undefined') DiceHistory.load();
    if (typeof Endings !== 'undefined') Endings.load();
    if (typeof StoryNodes !== 'undefined') StoryNodes.load();
    // 元层/异步子系统同样显式按新存档加载，否则 _data 会残留上一个存档的队列造成串档
    if (typeof Proposals !== 'undefined' && typeof Proposals.load === 'function') Proposals.load();
    if (typeof Outputs !== 'undefined' && typeof Outputs.load === 'function') Outputs.load();
    if (typeof NpcDeduction !== 'undefined' && typeof NpcDeduction.load === 'function') NpcDeduction.load();
    if (typeof InfoFeed !== 'undefined' && typeof InfoFeed.load === 'function') InfoFeed.load();

    if (data.player.gameTime) this._gameTime = data.player.gameTime;
    else this._gameTime = this._buildInitialGameTime(data.card, this.playerData);

    if (data.player.currentState) this.currentState = data.player.currentState;
    else {
      this.currentState = {
        hud: (data.card.hud || []).map(h => Object.assign({}, h, { current: (h.init != null ? h.init : 0) })),
        sidebar: (data.card.sidebar || []).map(s => Object.assign({}, s, { current: (s.init != null ? s.init : 0) })),
        panels: {}
      };
      (data.card.panels || []).forEach(p => {
        this.currentState.panels[p.id] = { id: p.id, num: p.num, name: p.name, entries: JSON.parse(JSON.stringify(p.entries || [])) };
      });
    }
    this._sessionStart = Date.now();
    return true;
  },

  persist() {
    if (!this.currentCardId || !this.currentSaveId) return;
    Saves.savePlayer(this.currentCardId, this.currentSaveId, this.playerData, this.currentState, this._gameTime);
    Saves.saveChat(this.currentCardId, this.currentSaveId, this._pruneOldMetaForSave(this.chatHistory));
    const d = Math.floor((Date.now() - (this._sessionStart || Date.now())) / 1000);
    Saves.touch(this.currentCardId, this.currentSaveId, d > 0 ? d : 0);
    this._sessionStart = Date.now();
  },

  // 落盘前构造“剥过旧 meta”的浅拷贝数组。
  // 保留最近 25 条有 meta 的 assistant；不改内存里的 chatHistory。
  _pruneOldMetaForSave(history) {
    if (!Array.isArray(history)) return history;
    var KEEP = 25;
    var total = history.length;
    // 倒序数“有 meta 的 assistant”，找第 26 条的位置
    var kept = 0;
    var cutIndex = -1;
    for (var i = total - 1; i >= 0; i--) {
      var m = history[i];
      if (m && m.role === 'assistant' && m.meta) {
        kept++;
        if (kept > KEEP) { cutIndex = i; break; }
      }
    }
    if (cutIndex < 0) return history; // 有 meta 的 assistant <= 25，不用剥
    // 正序剥 [0, cutIndex] 范围内带 meta 的 assistant（浅拷贝 + delete，不改原对象）
    var out = new Array(total);
    for (var j = 0; j < total; j++) {
      var msg = history[j];
      if (j <= cutIndex && msg && msg.role === 'assistant' && msg.meta) {
        var copy = Object.assign({}, msg);
        delete copy.meta;
        out[j] = copy;
      } else {
        out[j] = msg;
      }
    }
    return out;
  },

  invalidateCache() { this._cacheVersion++; this._cachedStaticDynamic = null; },

  advanceTime(mins) {
    if (!this._gameTime || !mins) return;
    const t = this._gameTime;
    const card = this.currentCard;
    const calendarMode = (card && card.calendar && card.calendar.mode === 'real') ? 'real' : 'fictional';
    t.minute += mins;
    while (t.minute >= 60) { t.minute -= 60; t.hour++; }
    while (t.hour >= 24) { t.hour -= 24; t.day++; }
    if (calendarMode === 'real') {
      let guard = 0;
      while (t.day > this._daysInMonth(t.year, t.month) && guard < 1000) {
        t.day -= this._daysInMonth(t.year, t.month);
        t.month++;
        if (t.month > 12) { t.month = 1; t.year++; }
        guard++;
      }
    } else {
      while (t.day > 30) { t.day -= 30; t.month++; }
      while (t.month > 12) { t.month -= 12; t.year++; }
    }
  },

  _daysInMonth(year, month) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1] || 30;
  },

  _buildInitialGameTime(card, playerData) {
    // 1. 年份：era.startYear > era.period[0] > birth_year+11 > eraRange[0] > 1990
    let startYear = null;
    const pdEra = playerData.era || playerData.era_id;
    if (pdEra) {
      for (const step of (card.steps || [])) {
        if ((step.key === 'era' || step.id === 'era') && step.options) {
          const opt = step.options.find(function(x) { return x.id === pdEra; });
          if (opt) {
            if (opt.startYear != null) {
              const sy = parseInt(opt.startYear, 10);
              if (!isNaN(sy)) startYear = sy;
            }
            if (!startYear && opt.period && opt.period[0]) {
              const py = parseInt(opt.period[0], 10);
              if (!isNaN(py)) startYear = py;
            }
          }
          break;
        }
      }
    }
    if (!startYear && playerData.birth_year) {
      const by = parseInt(playerData.birth_year, 10);
      if (!isNaN(by)) startYear = by + 11;
    }
    if (!startYear) {
      const era = (card.game && card.game.eraRange) || [1990, 2000];
      const ey = Array.isArray(era[0]) ? era[0][0] : era[0];
      const eyNum = parseInt(ey, 10);
      if (!isNaN(eyNum)) startYear = eyNum;
    }
    if (!startYear) startYear = 1990;

    // 2. 月日时分：读 card.game.startDate，缺字段随机
    const randInt = function(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); };
    const sd = (card.game && card.game.startDate) || null;
    let month = randInt(1, 12);
    let day = randInt(1, 28);
    let hour = randInt(6, 10);
    let minute = randInt(0, 59);
    if (sd) {
      if (sd.month != null) month = Number(sd.month);
      if (sd.day != null) day = Number(sd.day);
      if (sd.hour != null) hour = Number(sd.hour);
      if (sd.minute != null) minute = Number(sd.minute);
    }
    if (!(month >= 1 && month <= 12)) month = 1;
    if (!(day >= 1 && day <= 31)) day = 1;
    if (!(hour >= 0 && hour <= 23)) hour = 8;
    if (!(minute >= 0 && minute <= 59)) minute = 0;

    return { year: startYear, month: month, day: day, hour: hour, minute: minute };
  },

  formatGameTime() {
    const t = this._gameTime;
    if (!t) return '—';
    const p = n => String(n).padStart(2, '0');
    return t.year + '-' + p(t.month) + '-' + p(t.day) + ' ' + p(t.hour) + ':' + p(t.minute);
  },

  computeAge() {
    const pd = this.playerData;
    if (!this._gameTime) return pd.age || null;
    if (pd.birth_year) return this._gameTime.year - parseInt(pd.birth_year, 10);
    if (pd.birthday && typeof pd.birthday === 'string') { const m = pd.birthday.match(/^(\d{4})/); if (m) return this._gameTime.year - parseInt(m[1], 10); }
    return pd.age || null;
  },

  getSegmentText(item) {
    const v = item.current;
    if (!item.segments) return '';
    for (const s of item.segments) if (v >= s.min && v <= s.max) return s.text;
    return '';
  },
  getEntrySegmentText(entry) {
    const v = entry.current;
    if (!entry.segments) return '';
    for (const s of entry.segments) if (v >= s.min && v <= s.max) return s.text;
    return '';
  }
};

if (typeof window !== 'undefined') window.GameState = GameState;
if (typeof module !== 'undefined' && module.exports) module.exports = GameState;

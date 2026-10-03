// ============================================================
// 事件系统 v3
// - 事件语法（维度组合，不是写死事件）
// - 碰撞箱（每轮算玩家附近，每 6h 算全场，每 24h 换池）
// - 动态事件池（AI 生成 / 玩家审核 / 引擎执行）
// - 事件原型库（引擎内置）
// - 临时/永久封禁
// 数据：/saves/{cardId}/{saveId}/events_runtime.json
// ============================================================

(function() {
  var COLLISION_INTERVAL_MIN = 6 * 60;    // 每 6 小时重算事件位置
  var POOL_INTERVAL_MIN      = 24 * 60;   // 每 24 小时换池
  var MAX_ACTIVE_EVENTS      = 20;        // 同时活跃事件上限
  var MAX_EVENT_HISTORY      = 100;       // 历史记录保留上限

  // ============================================================
  // 事件语法（维度）
  // ============================================================
  var SYNTAX = {
    nature:      ['暴力', '诡计', '情感', '交易', '意外', '自然'],
    intensity:   ['低', '中', '高', '极端'],
    result:      ['生', '伤', '残', '死', '失踪'],
    publicity:   ['暗中', '半公开', '公开', '轰动'],
    groupSize:   ['单人', '双人', '小群体', '大群体'],
    gender:      ['全男', '全女', '混合'],
    relation:    ['陌生人', '熟人', '亲人', '恋人', '仇人', '上下级'],
    identity:    ['平民', '权贵', '黑帮', '官方', '边缘人', '不明'],
    state:       ['清醒', '醉酒', '受伤', '患病', '被胁迫'],
    motive:      ['贪欲', '复仇', '恐惧', '爱', '权力', '疯狂', '生存', '误会', '意外'],
    trigger:     ['长期积怨', '突发事件', '他人挑拨', '巧合', '命运'],
    target:      ['人', '财物', '信息', '地位', '秘密', '领地'],
    assetType:   ['金钱', '宝物', '文件', '药品', '武器', '情报'],
    lossLevel:   ['无', '轻微', '重大', '毁灭'],
    placeNature: ['公开', '隐蔽', '危险', '安全', '神圣', '禁忌'],
    timeOfDay:   ['清晨', '白天', '黄昏', '深夜', '凌晨'],
    weather:     ['晴', '雨', '雪', '雾', '风暴'],
    scope:       ['当事人', '家庭', '势力', '城市', '世界'],
    duration:    ['一次', '短期', '长期', '永久'],
    reversible:  ['可逆', '部分可逆', '不可逆'],
    aftereffect: ['无', '创伤', '仇恨', '疾病', '通缉', '残疾'],
    style:       ['日常', '悬疑', '黑暗', '成人', '政治', '猎奇', '温情', '悲剧']
  };

  // ============================================================
  // 事件原型库（引擎内置，不在 prompt 里）
  // 每个原型 = 一组维度预设 + 倾向标签
  // ============================================================
  var ARCHETYPES = [
    // ---- 暴力类 ----
    { id: 'arc_assault', name: '袭击', syntax: { nature:'暴力', intensity:'高', result:'伤', publicity:'暗中', groupSize:'双人', motive:'复仇', target:'人', placeNature:'隐蔽', style:['黑暗','悲剧'] } },
    { id: 'arc_murder', name: '谋杀', syntax: { nature:'暴力', intensity:'极端', result:'死', publicity:'暗中', groupSize:'双人', motive:'复仇', target:'人', placeNature:'隐蔽', reversible:'不可逆', aftereffect:'仇恨', style:['黑暗','悲剧'] } },
    { id: 'arc_brawl', name: '群架', syntax: { nature:'暴力', intensity:'中', result:'伤', publicity:'半公开', groupSize:'大群体', motive:'误会', target:'人', placeNature:'公开', style:['黑暗'] } },
    { id: 'arc_accident', name: '意外事故', syntax: { nature:'意外', intensity:'高', result:'伤', publicity:'半公开', groupSize:'小群体', motive:'意外', target:'人', placeNature:'公开', style:['悲剧'] } },

    // ---- 诡计类 ----
    { id: 'arc_theft', name: '偷窃', syntax: { nature:'诡计', intensity:'低', result:'生', publicity:'暗中', groupSize:'单人', motive:'贪欲', target:'财物', assetType:'金钱', lossLevel:'轻微', placeNature:'公开', style:['悬疑'] } },
    { id: 'arc_fraud', name: '诈骗', syntax: { nature:'诡计', intensity:'中', result:'生', publicity:'暗中', groupSize:'双人', motive:'贪欲', target:'财物', assetType:'金钱', lossLevel:'重大', placeNature:'公开', style:['悬疑'] } },
    { id: 'arc_blackmail', name: '敲诈', syntax: { nature:'诡计', intensity:'中', result:'生', publicity:'暗中', groupSize:'双人', motive:'权力', target:'秘密', placeNature:'隐蔽', style:['黑暗'] } },
    { id: 'arc_betrayal', name: '背叛', syntax: { nature:'诡计', intensity:'高', result:'生', publicity:'暗中', groupSize:'双人', relation:'熟人', motive:'权力', target:'地位', placeNature:'隐蔽', style:['黑暗','政治'] } },
    { id: 'arc_frame', name: '栽赃', syntax: { nature:'诡计', intensity:'高', result:'生', publicity:'半公开', groupSize:'双人', motive:'复仇', target:'地位', placeNature:'公开', style:['悬疑','黑暗'] } },

    // ---- 情感类 ----
    { id: 'arc_confession', name: '告白', syntax: { nature:'情感', intensity:'低', result:'生', publicity:'暗中', groupSize:'双人', relation:'熟人', motive:'爱', target:'人', placeNature:'安全', style:['温情'] } },
    { id: 'arc_breakup', name: '分手', syntax: { nature:'情感', intensity:'中', result:'生', publicity:'暗中', groupSize:'双人', relation:'恋人', motive:'爱', target:'人', placeNature:'隐蔽', style:['温情','悲剧'] } },
    { id: 'arc_reunion', name: '重逢', syntax: { nature:'情感', intensity:'低', result:'生', publicity:'半公开', groupSize:'双人', relation:'亲人', motive:'爱', target:'人', placeNature:'公开', style:['温情'] } },
    { id: 'arc_quarrel', name: '争吵', syntax: { nature:'情感', intensity:'低', result:'生', publicity:'暗中', groupSize:'双人', relation:'熟人', motive:'误会', target:'人', placeNature:'隐蔽', style:['日常'] } },

    // ---- 交易类 ----
    { id: 'arc_deal', name: '黑市交易', syntax: { nature:'交易', intensity:'中', result:'生', publicity:'暗中', groupSize:'双人', motive:'贪欲', target:'财物', assetType:'武器', placeNature:'隐蔽', style:['黑暗'] } },
    { id: 'arc_bribe', name: '贿赂', syntax: { nature:'交易', intensity:'中', result:'生', publicity:'暗中', groupSize:'双人', identity:'官方', motive:'权力', target:'信息', placeNature:'隐蔽', style:['政治'] } },
    { id: 'arc_auction', name: '拍卖', syntax: { nature:'交易', intensity:'低', result:'生', publicity:'公开', groupSize:'大群体', motive:'贪欲', target:'财物', assetType:'宝物', placeNature:'公开', style:['日常'] } },

    // ---- 意外类 ----
    { id: 'arc_discovery', name: '发现秘密', syntax: { nature:'意外', intensity:'中', result:'生', publicity:'暗中', groupSize:'单人', motive:'意外', target:'秘密', placeNature:'隐蔽', style:['悬疑'] } },
    { id: 'arc_lost', name: '走失', syntax: { nature:'意外', intensity:'低', result:'失踪', publicity:'半公开', groupSize:'单人', motive:'意外', target:'人', placeNature:'危险', style:['悬疑'] } },
    { id: 'arc_encounter', name: '偶遇', syntax: { nature:'意外', intensity:'低', result:'生', publicity:'公开', groupSize:'双人', relation:'陌生人', motive:'巧合', target:'人', placeNature:'公开', style:['日常'] } },

    // ---- 自然类 ----
    { id: 'arc_storm', name: '风暴', syntax: { nature:'自然', intensity:'高', result:'伤', publicity:'公开', groupSize:'大群体', motive:'命运', target:'人', placeNature:'公开', weather:'风暴', scope:'城市', style:['悲剧'] } },
    { id: 'arc_fire', name: '火灾', syntax: { nature:'自然', intensity:'高', result:'伤', publicity:'公开', groupSize:'大群体', motive:'意外', target:'财物', placeNature:'公开', scope:'城市', style:['悲剧'] } },
    { id: 'arc_illness', name: '疾病', syntax: { nature:'自然', intensity:'中', result:'伤', publicity:'暗中', groupSize:'单人', motive:'命运', target:'人', placeNature:'安全', aftereffect:'疾病', style:['温情'] } },

    // ---- 日常类 ----
    { id: 'arc_meeting', name: '闲聊', syntax: { nature:'情感', intensity:'低', result:'生', publicity:'公开', groupSize:'双人', motive:'误会', target:'人', placeNature:'公开', style:['日常'] } },
    { id: 'arc_errand', name: '日常奔波', syntax: { nature:'交易', intensity:'低', result:'生', publicity:'公开', groupSize:'单人', motive:'生存', target:'财物', placeNature:'公开', style:['日常'] } },
    { id: 'arc_gift', name: '送礼', syntax: { nature:'情感', intensity:'低', result:'生', publicity:'暗中', groupSize:'双人', relation:'熟人', motive:'爱', target:'人', placeNature:'安全', style:['温情'] } },

    // ---- 政治/势力类 ----
    { id: 'arc_meeting_secret', name: '密会', syntax: { nature:'诡计', intensity:'中', result:'生', publicity:'暗中', groupSize:'小群体', identity:'权贵', motive:'权力', target:'秘密', placeNature:'隐蔽', style:['政治','悬疑'] } },
    { id: 'arc_assassinate', name: '暗杀', syntax: { nature:'暴力', intensity:'极端', result:'死', publicity:'暗中', groupSize:'双人', identity:'黑帮', motive:'权力', target:'人', placeNature:'隐蔽', reversible:'不可逆', aftereffect:'通缉', style:['黑暗','政治'] } },
    { id: 'arc_raid', name: '突袭', syntax: { nature:'暴力', intensity:'高', result:'伤', publicity:'公开', groupSize:'大群体', identity:'官方', motive:'权力', target:'领地', placeNature:'危险', style:['政治','黑暗'] } },
    { id: 'arc_treaty', name: '结盟', syntax: { nature:'交易', intensity:'中', result:'生', publicity:'公开', groupSize:'小群体', identity:'权贵', motive:'权力', target:'地位', placeNature:'公开', style:['政治'] } },

    // ---- 成人向（仅标签，允许就是允许，不允许就过滤）----
    { id: 'arc_affair', name: '私会', syntax: { nature:'情感', intensity:'中', result:'生', publicity:'暗中', groupSize:'双人', relation:'熟人', motive:'爱', target:'人', placeNature:'隐蔽', style:['成人','黑暗'] } },
    { id: 'arc_manipulate', name: '情感操控', syntax: { nature:'诡计', intensity:'高', result:'生', publicity:'暗中', groupSize:'双人', motive:'疯狂', target:'人', placeNature:'隐蔽', aftereffect:'创伤', style:['成人','黑暗','悲剧'] } },

    // ---- 猎奇 / 极端（默认关闭，由卡带开关决定是否启用）----
    { id: 'arc_torture', name: '折磨', syntax: { nature:'暴力', intensity:'极端', result:'残', publicity:'暗中', groupSize:'双人', motive:'疯狂', target:'人', placeNature:'隐蔽', reversible:'不可逆', aftereffect:'创伤', style:['猎奇','黑暗','成人'] } },
    { id: 'arc_ritual', name: '仪式', syntax: { nature:'诡计', intensity:'高', result:'生', publicity:'暗中', groupSize:'小群体', motive:'疯狂', target:'秘密', placeNature:'禁忌', style:['猎奇','悬疑'] } }
  ];

  // ============================================================
  // 主对象
  // ============================================================
  var Events = {
    _data: null,
    SYNTAX: SYNTAX,
    ARCHETYPES: ARCHETYPES,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/events_runtime.json';
    },

    _emptyData: function() {
      return {
        events: {},        // 运行时事件（含语法生成的）
        triggered: {},     // 已触发过的（once 用）
        pending: [],       // 待注入 prompt 的
        proposals: [],     // AI 提议待审核的
        history: [],       // 已完成/封禁的事件归档
        lastCheck: '',
        lastCollisionAt: '',
        lastPoolAt: ''
      };
    },

    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = this._emptyData();
        return;
      }
      var d = this._data;
      if (!d.events || typeof d.events !== 'object') d.events = {};
      if (!d.triggered || typeof d.triggered !== 'object') d.triggered = {};
      if (!Array.isArray(d.pending)) d.pending = [];
      if (!Array.isArray(d.proposals)) d.proposals = [];
      if (!Array.isArray(d.history)) d.history = [];
      if (d.lastCheck == null) d.lastCheck = '';
      if (d.lastCollisionAt == null) d.lastCollisionAt = '';
      if (d.lastPoolAt == null) d.lastPoolAt = '';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = this._emptyData(); return; }
      var d = VFS.readJSON(p);
      this._data = d && typeof d === 'object' ? d : this._emptyData();
      this._ensureShape();
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      if (this._ensureShape) this._ensureShape();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },
    setRuntime: function(data) {
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      if (this._ensureShape) this._ensureShape();
      this.save();
    },

    // ============ 事件定义查询（合并卡带 + 运行时） ============
    _listCardDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.events || [];
    },

    _allDefs: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var out = this._listCardDefs().slice();
      var rt = this._data.events;
      Object.keys(rt).forEach(function(id) {
        var e = rt[id];
        if (e && !out.some(function(x) { return x.id === id; })) out.push(e);
      });
      return out;
    },

    listDefs: function() { return this._allDefs(); },

    findDef: function(id) {
      var found = null;
      this._allDefs().forEach(function(e) { if (!found && e.id === id) found = e; });
      return found;
    },

    // ============ 事件-地点匹配 ============
    _getMapNodeTags: function(locationId) {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      var node = (wb.mapNodes || {})[locationId];
      if (!node) return [];
      var tags = [];
      if (Array.isArray(node.tags)) tags = tags.concat(node.tags);
      if (node.danger != null && node.danger >= 7) tags.push('危险');
      if (node.danger != null && node.danger <= 3) tags.push('安全');
      if (node.public === true) tags.push('公开');
      if (node.hidden === true) tags.push('隐蔽');
      return tags;
    },

    _scoreLocationForEvent: function(event, locationId) {
      // 有明确 location 的事件直接命中
      if (event.location === locationId) return 100;
      // 有 location 但不是当前地点 → 权重极低
      if (event.location) return 1;

      var nodeTags = this._getMapNodeTags(locationId);
      var preferred = event.preferredTags || [];
      if (!preferred.length) return 5;

      var score = 1;
      preferred.forEach(function(t) {
        if (nodeTags.indexOf(t) >= 0) score += 10;
      });
      // 特殊：地点性质匹配
      if (event.syntax && event.syntax.placeNature) {
        if (nodeTags.indexOf(event.syntax.placeNature) >= 0) score += 5;
      }
      return score;
    },

    // ============ 玩家附近查询 ============
    getPlayerLocationId: function() {
      // 优先从 StatusCard 拿，其次从 playerData
      try {
        if (typeof StatusCard !== 'undefined' && StatusCard.isEnabled()) {
          var v = StatusCard.getField('location');
          if (v) return v;
        }
      } catch (e) {}
      var pd = GameState.playerData || {};
      return pd.locationId || '';
    },

    // 返回玩家当前地点所有活跃事件
    getActiveEventsAt: function(locationId) {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      return this._allDefs().filter(function(e) {
        if (e.status === 'temporarily_banned' || e.status === 'permanently_banned') return false;
        if (!e.location) return false;
        return e.location === locationId;
      });
    },

    // ============ 效果应用 ============
    _applyEffect: function(def) {
      var eff = def.effect;
      if (!eff) return { applied: [] };
      var applied = [];

      if (Array.isArray(eff.hudChanges)) {
        eff.hudChanges.forEach(function(c) {
          var r = ToolExecutor._modifyStat('hud', null, c.key, c.delta);
          if (r.ok) applied.push('HUD·' + c.key + ' ' + (c.delta >= 0 ? '+' : '') + c.delta);
        });
      }
      if (Array.isArray(eff.sidebarChanges)) {
        eff.sidebarChanges.forEach(function(c) {
          var r = ToolExecutor._modifyStat('sidebar', null, c.key, c.delta);
          if (r.ok) applied.push('Sidebar·' + c.key + ' ' + (c.delta >= 0 ? '+' : '') + c.delta);
        });
      }
      if (Array.isArray(eff.relations)) {
        eff.relations.forEach(function(c) {
          var r = ToolExecutor._modifyRelation(c.from, c.to, c.delta);
          if (r.ok) applied.push('关系 ' + c.from + '→' + c.to + ' ' + (c.delta >= 0 ? '+' : '') + c.delta);
        });
      }
      if (Array.isArray(eff.addItems)) {
        eff.addItems.forEach(function(c) {
          var r = ToolExecutor._addItem(c.category, c.name, c.desc);
          if (r.ok) applied.push('获得 ' + c.name);
        });
      }
      if (Array.isArray(eff.removeItems)) {
        eff.removeItems.forEach(function(name) {
          var r = ToolExecutor._removeItem(name);
          if (r.ok) applied.push('失去 ' + name);
        });
      }
      if (eff.statusUpdates && typeof StatusCard !== 'undefined' && StatusCard.isEnabled()) {
        var r = StatusCard.setFields(eff.statusUpdates);
        if (r.ok) r.changes.forEach(function(c) { applied.push('状态·' + c.key); });
      }
      return { applied: applied };
    },

    // ============ 单事件条件（保留旧接口） ============
    _checkTrigger: function(def) {
      var t = def.trigger;
      if (!t) return { ok: false };

      if (t.type === 'time') {
        if (!GameState._gameTime) return { ok: false };
        var gt = GameState._gameTime;
        if (t.year != null && gt.year !== t.year) return { ok: false };
        if (t.month != null && gt.month !== t.month) return { ok: false };
        if (t.day != null && gt.day !== t.day) return { ok: false };
        if (t.after) {
          var parts = String(t.after).split('-');
          var y = parseInt(parts[0], 10);
          var mo = parseInt(parts[1] || '1', 10);
          var d = parseInt(parts[2] || '1', 10);
          var cur = gt.year * 10000 + gt.month * 100 + gt.day;
          var target = y * 10000 + mo * 100 + d;
          if (cur < target) return { ok: false };
        }
        if (t.before) {
          var parts2 = String(t.before).split('-');
          var y2 = parseInt(parts2[0], 10);
          var mo2 = parseInt(parts2[1] || '12', 10);
          var d2 = parseInt(parts2[2] || '30', 10);
          var cur2 = gt.year * 10000 + gt.month * 100 + gt.day;
          var target2 = y2 * 10000 + mo2 * 100 + d2;
          if (cur2 > target2) return { ok: false };
        }
        return { ok: true };
      }

      if (t.type === 'location') {
        if (!t.mapNodeId) return { ok: false };
        var loc = this.getPlayerLocationId();
        return { ok: loc === t.mapNodeId };
      }

      if (t.type === 'value') {
        if (!t.key) return { ok: false };
        var cur = this._readStatValue(t.key);
        if (cur == null) return { ok: false };
        var v = Number(t.value);
        var op = t.op || '<';
        if (op === '<') return { ok: cur < v };
        if (op === '<=') return { ok: cur <= v };
        if (op === '>') return { ok: cur > v };
        if (op === '>=') return { ok: cur >= v };
        if (op === '==') return { ok: cur === v };
        if (op === '!=') return { ok: cur !== v };
        return { ok: false };
      }

      if (t.type === 'keyword') {
        if (!Array.isArray(t.words) || !t.words.length) return { ok: false };
        var text = this._recentText(6);
        var found = false;
        t.words.forEach(function(w) { if (w && text.indexOf(w) >= 0) found = true; });
        return { ok: found };
      }

      if (t.type === 'random') {
        var chance = Number(t.chance) || 0.05;
        return { ok: Math.random() < chance };
      }

      return { ok: false };
    },

    _readStatValue: function(key) {
      var st = GameState.currentState;
      if (!st) return null;
      var item = (st.hud || []).find(function(x) { return x.key === key; });
      if (item) return item.current;
      item = (st.sidebar || []).find(function(x) { return x.key === key; });
      if (item) return item.current;
      var found = null;
      Object.keys(st.panels || {}).forEach(function(pid) {
        (st.panels[pid].entries || []).forEach(function(e) {
          if (e.key === key && found == null) found = e.current;
        });
      });
      return found;
    },

    _recentText: function(rounds) {
      return (GameState.chatHistory || [])
        .slice(-(rounds * 3))
        .map(function(m) { return m.content || ''; })
        .join('\n');
    },

    // ============ 时间差（跟 weather.js 的简化一致） ============
    _minutesBetween: function(t1, t2) {
      function parse(s) {
        if (!s) return null;
        var m = String(s).match(/^(\d+)-(\d+)-(\d+)\s+(\d+):(\d+)$/);
        if (!m) return null;
        var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
        var h = parseInt(m[4], 10), mi = parseInt(m[5], 10);
        return ((y * 12 + mo) * 30 + d) * 24 * 60 + h * 60 + mi;
      }
      var a = parse(t1), b = parse(t2);
      if (a == null || b == null) return 0;
      return Math.max(0, b - a);
    },

    // ============ 事件池（生成/淘汰） ============
    // 玩家审核通过的事件会加入 events 池
    // 每次跨日会检查：淘汰已过期事件 + 补新事件
    _runPoolCheck: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var now = GameState.formatGameTime();

      // 1. 淘汰已结束的事件（进入 history）
      Object.keys(this._data.events).forEach(function(id) {
        var e = self._data.events[id];
        if (!e) return;
        if (e.status === 'permanently_banned') {
          self._data.history.push({ id: id, name: e.name, reason: 'permanently_banned', at: now });
          delete self._data.events[id];
          return;
        }
        if (e.status === 'temporarily_banned' && e.banUntil) {
          var dt = self._minutesBetween(e.banUntil, now);
          if (dt <= 0) {
            e.status = 'active';
            e.banUntil = '';
            e.banReason = '';
          }
        }
      });

      // 2. 历史记录太多 → 截断
      if (this._data.history.length > MAX_EVENT_HISTORY) {
        this._data.history = this._data.history.slice(-MAX_EVENT_HISTORY);
      }

      // 3. 活跃事件数量检查
      var activeCount = Object.keys(this._data.events).filter(function(id) {
        var e = self._data.events[id];
        return e && e.status !== 'temporarily_banned' && e.status !== 'permanently_banned';
      }).length;
      // 太少 → 提示 AI（不主动加，交给 AI propose）
      this._data._needMoreEvents = activeCount < 5;

      this._data.lastPoolAt = now;
      this.save();
    },

    // ============ 碰撞箱（事件-地点重新匹配） ============
    // 只重算"没有明确 location"的事件
    _runCollision: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;

      // 收集所有可能的地点
      var card = GameState.currentCard;
      if (!card) return;
      var wb = card.worldbook || {};
      var allLocations = Object.keys(wb.mapNodes || {});
      if (!allLocations.length) return;

      Object.keys(this._data.events).forEach(function(id) {
        var e = self._data.events[id];
        if (!e || e.status !== 'active') return;
        if (e.location && !e.allowDrift) return;   // 有明确 location 且不允许漂移 → 不动

        // 按 preferredTags 加权随机选一个地点
        var weights = [];
        var total = 0;
        allLocations.forEach(function(locId) {
          var w = self._scoreLocationForEvent(e, locId);
          if (w > 0) {
            weights.push({ locId: locId, weight: w });
            total += w;
          }
        });
        if (!weights.length || total <= 0) return;

        var r = Math.random() * total;
        var acc = 0;
        var picked = weights[weights.length - 1].locId;
        for (var i = 0; i < weights.length; i++) {
          acc += weights[i].weight;
          if (r <= acc) { picked = weights[i].locId; break; }
        }
        e.location = picked;
        e.locationAt = GameState.formatGameTime();
      });

      this._data.lastCollisionAt = GameState.formatGameTime();
      this.save();
    },

    // ============ 每轮 tick ============
    tick: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var defs = this._allDefs();
      if (!defs.length) return { triggered: [] };

      var now = GameState.formatGameTime();
      var triggered = [];
      var self = this;

      // 1. 检查是否需要跑碰撞箱
      if (!this._data.lastCollisionAt) {
        this._runCollision();
      } else {
        var dtCollision = this._minutesBetween(this._data.lastCollisionAt, now);
        if (dtCollision >= COLLISION_INTERVAL_MIN) this._runCollision();
      }

      // 2. 检查是否需要换池
      if (!this._data.lastPoolAt) {
        this._runPoolCheck();
      } else {
        var dtPool = this._minutesBetween(this._data.lastPoolAt, now);
        if (dtPool >= POOL_INTERVAL_MIN) this._runPoolCheck();
      }

      // 3. 玩家当前位置相关事件（注入 prompt 用，不自动触发）
      var playerLoc = this.getPlayerLocationId();
      var localEvents = playerLoc ? this.getActiveEventsAt(playerLoc) : [];
      this._data._localEvents = localEvents.map(function(e) { return e.id; });

      // 4. 检查触发条件（沿用旧逻辑）
      var justTriggered = {};
      defs.forEach(function(def) {
        if (!def.id) return;
        if (def.status === 'temporarily_banned' || def.status === 'permanently_banned') return;
        if (justTriggered[def.id]) return;
        var isOnce = def.once || (def.trigger && def.trigger.type === 'random');
        if (isOnce && self._data.triggered[def.id]) return;
        if (!def.trigger) return;
        var ck = self._checkTrigger(def);
        if (!ck.ok) return;

        justTriggered[def.id] = true;
        self._data.triggered[def.id] = {
          at: now,
          round: self._roundCount()
        };
        var r = self._applyEffect(def);
        triggered.push({ def: def, applied: r.applied });

        if (Array.isArray(def.triggerAfter)) {
          def.triggerAfter.forEach(function(id) {
            if (self._data.triggered[id]) delete self._data.triggered[id];
          });
        }
      });

      // 5. 按 priority 排序，取前 3 个作为下一轮 prompt 强制内容
      triggered.sort(function(a, b) {
        return (b.def.priority || 5) - (a.def.priority || 5);
      });
      this._data.pending = triggered.slice(0, 3).map(function(t) {
        return {
          id: t.def.id,
          name: t.def.name,
          hint: (t.def.effect && t.def.effect.promptHint) || t.def.promptHint || '',
          applied: t.applied
        };
      });
      this._data.lastCheck = now;
      this.save();

      return { triggered: triggered };
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // ============ 待触发队列 ============
    consumePending: function() {
      if (!this._data) this.load();
      var p = this._data.pending || [];
      this._data.pending = [];
      this.save();
      return p;
    },

    // ============ AI 工具支持 ============
    triggerById: function(id) {
      var def = this.findDef(id);
      if (!def) return { ok: false, reason: '事件不存在：' + id };
      if (def.once && this._data.triggered[id]) {
        return { ok: false, reason: '该事件已触发过（once）' };
      }
      if (def.status === 'temporarily_banned' || def.status === 'permanently_banned') {
        return { ok: false, reason: '该事件已被封禁' };
      }
      this._data.triggered[id] = {
        at: GameState.formatGameTime(),
        round: this._roundCount(),
        by: 'ai'
      };
      var r = this._applyEffect(def);
      this.save();
      return { ok: true, id: id, name: def.name, applied: r.applied };
    },

    cancelById: function(id) {
      if (!this._data) this.load();
      delete this._data.triggered[id];
      this.save();
      return { ok: true, id: id };
    },

    // ============ 封禁 / 解封 ============
    banEvent: function(id, duration, reason) {
      if (!this._data) this.load();
      var e = this._data.events[id];
      if (!e) {
        // 可能是卡带里的事件，先复制到运行时
        var def = this.findDef(id);
        if (!def) return { ok: false, reason: '事件不存在：' + id };
        e = JSON.parse(JSON.stringify(def));
        this._data.events[id] = e;
      }
      var now = GameState.formatGameTime();
      if (duration === 'permanent' || duration === 'forever') {
        e.status = 'permanently_banned';
        e.banUntil = '';
        e.banReason = reason || '';
        e.bannedAt = now;
      } else {
        // duration 为分钟数
        var mins = Number(duration) || 0;
        var until = this._addMinutesToTime(now, mins);
        e.status = 'temporarily_banned';
        e.banUntil = until;
        e.banReason = reason || '';
        e.bannedAt = now;
      }
      this.save();
      return { ok: true, id: id, status: e.status, banUntil: e.banUntil };
    },

    unbanEvent: function(id) {
      if (!this._data) this.load();
      var e = this._data.events[id];
      if (!e) return { ok: false, reason: '事件不在运行时（可能只在卡带）' };
      e.status = 'active';
      e.banUntil = '';
      e.banReason = '';
      this.save();
      return { ok: true, id: id };
    },

    _addMinutesToTime: function(timeStr, mins) {
      var m = String(timeStr || '').match(/^(\d+)-(\d+)-(\d+)\s+(\d+):(\d+)$/);
      if (!m) return timeStr;
      var t = {
        year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10),
        hour: parseInt(m[4], 10), minute: parseInt(m[5], 10)
      };
      t.minute += mins;
      while (t.minute >= 60) { t.minute -= 60; t.hour++; }
      while (t.hour >= 24) { t.hour -= 24; t.day++; }
      while (t.day > 30) { t.day -= 30; t.month++; }
      while (t.month > 12) { t.month -= 12; t.year++; }
      var p = function(n) { return String(n).padStart(2, '0'); };
      return t.year + '-' + p(t.month) + '-' + p(t.day) + ' ' + p(t.hour) + ':' + p(t.minute);
    },

    // ============ 提议（AI 生成，玩家审核） ============
    // AI 调用 propose_event，引擎校验 → 加入 proposals 队列
    proposeEvent: function(def) {
      if (!this._data) this.load();
      this._ensureShape();
      if (!def || typeof def !== 'object') return { ok: false, reason: '参数不是对象' };
      if (!def.name) return { ok: false, reason: '事件必须有 name' };

      // 校验 location：允许未定义地点，标记为临时地点
      if (def.location) {
        var card = GameState.currentCard || {};
        var nodes = (card.worldbook || {}).mapNodes || {};
        if (!nodes[def.location]) {
          def._tempLocation = true;
        }
      }

      // 校验 participants
      if (Array.isArray(def.participants)) {
        var npcs = ((GameState.currentCard || {}).worldbook || {}).npcs || [];
        var npcIds = {};
        npcs.forEach(function(n) { if (n.id) npcIds[n.id] = true; });
        var bad = def.participants.filter(function(id) { return id && !npcIds[id]; });
        if (bad.length) {
          return { ok: false, reason: 'NPC 不存在：' + bad.join(',') };
        }
      }

      // 生成 id
      if (!def.id) def.id = 'evt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      def.status = 'active';
      def.createdBy = 'ai';
      def.createdAt = GameState.formatGameTime();

      // 去重：同名 + 同地点
      var dup = Object.keys(this._data.events).some(function(id) {
        var e = this._data.events[id];
        return e && e.name === def.name && e.location === def.location;
      });
      if (dup) return { ok: false, reason: '已存在同名同地点的事件' };

      // 活跃数上限
      var activeCount = Object.keys(this._data.events).filter(function(id) {
        var e = this._data.events[id];
        return e && e.status === 'active';
      }).length;
      if (activeCount >= MAX_ACTIVE_EVENTS) {
        return { ok: false, reason: '活跃事件已达上限 ' + MAX_ACTIVE_EVENTS };
      }

      this._data.proposals.push(def);
      this.save();
      return { ok: true, id: def.id, name: def.name };
    },

    getPendingProposals: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return this._data.proposals.slice();
    },

    confirmProposal: function(id) {
      if (!this._data) this.load();
      var idx = this._data.proposals.findIndex(function(p) { return p.id === id; });
      if (idx < 0) return { ok: false, reason: '提议不存在' };
      var def = this._data.proposals[idx];
      this._data.proposals.splice(idx, 1);
      this._data.events[def.id] = def;
      this.save();
      return { ok: true, id: def.id, name: def.name };
    },

    rejectProposal: function(id) {
      if (!this._data) this.load();
      var idx = this._data.proposals.findIndex(function(p) { return p.id === id; });
      if (idx < 0) return { ok: false, reason: '提议不存在' };
      this._data.proposals.splice(idx, 1);
      this.save();
      return { ok: true, id: id };
    },

    // ============ 原型库查询（给 AI） ============
    listArchetypes: function(styleFilter) {
      var out = ARCHETYPES.slice();
      if (styleFilter) {
        var filter = String(styleFilter);
        out = out.filter(function(a) {
          return a.syntax && Array.isArray(a.syntax.style) && a.syntax.style.indexOf(filter) >= 0;
        });
      }
      return out;
    },

    // 从原型展开成一个事件骨架（AI 拿到后填 location/participants）
    instantiateArchetype: function(archetypeId) {
      var a = null;
      ARCHETYPES.forEach(function(x) { if (x.id === archetypeId) a = x; });
      if (!a) return { ok: false, reason: '原型不存在：' + archetypeId };
      return {
        ok: true,
        skeleton: {
          name: a.name,
          desc: '',
          syntax: JSON.parse(JSON.stringify(a.syntax)),
          preferredTags: [],
          participants: [],
          location: '',
          baseWeight: 5,
          effect: { promptHint: '' },
          archetypeId: a.id
        }
      };
    },

    // ============ 调试 ============
    listTriggered: function() {
      if (!this._data) this.load();
      return Object.keys(this._data.triggered).map(function(id) {
        return { id: id, info: this._data.triggered[id] };
      }, this);
    },

    clear: function() {
      this._data = this._emptyData();
      this.save();
    },

    // ============ 格式化 ============
    formatForHistory: function(triggered) {
      if (!triggered || !triggered.length) return '';
      var lines = ['【系统 · 已触发事件】'];
      triggered.forEach(function(t) {
        lines.push('· ' + (t.def.name || t.def.id));
        if (t.applied && t.applied.length) {
          lines.push('  ' + t.applied.join('；'));
        }
      });
      return lines.join('\n');
    },

    // 给 prompt：下一轮必须发生的事件
    formatPendingForPrompt: function() {
      if (!this._data) this.load();
      var p = this._data.pending || [];
      if (!p.length) return '';
      var lines = ['>>> 【本场景必须发生的事件】'];
      p.forEach(function(x) {
        var s = '· ' + (x.name || x.id);
        if (x.hint) s += '：' + x.hint;
        lines.push(s);
      });
      lines.push('>>> （你必须把上述事件写进本轮剧情，不能忽略）');
      return lines.join('\n');
    },

    // 给 prompt：玩家所在地点的活跃事件（提示 AI 可以考虑推进）
    formatLocalForPrompt: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var playerLoc = this.getPlayerLocationId();
      if (!playerLoc) return '';
      var events = this.getActiveEventsAt(playerLoc);
      if (!events.length) return '';
      var lines = ['>>> 【当前地点可能在发生的事】'];
      events.slice(0, 5).forEach(function(e) {
        var partNames = (e.participants || []).slice(0, 3).join('、');
        var s = '· ' + (e.name || e.id);
        if (partNames) s += '（涉及：' + partNames + '）';
        lines.push(s);
      });
      lines.push('>>> （可选推进；不强制）');
      return lines.join('\n');
    },

    // 给 prompt：待审核的提议（供 AI 知道有积压）
    formatProposalsForPrompt: function() {
      if (!this._data) this.load();
      var ps = this._data.proposals || [];
      if (!ps.length) return '';
      var lines = ['>>> 【待审核的事件提议（' + ps.length + '）】'];
      ps.slice(0, 5).forEach(function(p) {
        lines.push('· ' + (p.name || p.id));
      });
      return lines.join('\n');
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Events 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Events] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var E = Events;

    // ---- trigger_event（保留旧） ----
    ToolExecutor.WHITELIST.trigger_event = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = E.triggerById(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'event', action: 'trigger',
          eventId: r.id, eventName: r.name, applied: r.applied,
          label: '事件·' + r.name
        };
      }
    };

    // ---- cancel_event（保留旧） ----
    ToolExecutor.WHITELIST.cancel_event = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = E.cancelById(a.id);
        return { ok: true, type: 'event', action: 'cancel', eventId: a.id, label: '取消事件·' + a.id };
      }
    };

    // ---- query_events（保留旧 + 扩展） ----
    ToolExecutor.WHITELIST.query_events = {
      run: function() {
        var defs = E.listDefs();
        var triggered = E.listTriggered();
        var active = defs.filter(function(d) { return d.status !== 'temporarily_banned' && d.status !== 'permanently_banned'; });
        return {
          ok: true, type: 'query', queryType: 'events',
          data: {
            total: defs.length,
            active: active.length,
            triggeredCount: triggered.length,
            triggered: triggered.slice(0, 20),
            list: defs.slice(0, 30).map(function(d) {
              return {
                id: d.id, name: d.name,
                location: d.location || '',
                status: d.status || 'active',
                priority: d.priority || 5
              };
            })
          }
        };
      }
    };

    // ---- list_event_archetypes ----
    ToolExecutor.WHITELIST.list_event_archetypes = {
      run: function(a) {
        var list = E.listArchetypes(a && a.style);
        return {
          ok: true, type: 'query', queryType: 'archetypes',
          data: {
            count: list.length,
            list: list.slice(0, 40).map(function(x) {
              return { id: x.id, name: x.name, style: (x.syntax && x.syntax.style) || [] };
            })
          }
        };
      }
    };

    // ---- instantiate_archetype ----
    ToolExecutor.WHITELIST.instantiate_archetype = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少原型 id' };
        return E.instantiateArchetype(a.id);
      }
    };

    // ---- propose_event ----
    ToolExecutor.WHITELIST.propose_event = {
      run: function(a) {
        if (!a.event) return { ok: false, reason: '缺少 event 对象' };
        var r = E.proposeEvent(a.event);
        if (!r.ok) return r;
        return {
          ok: true, type: 'event', action: 'propose',
          eventId: r.id, eventName: r.name,
          label: '提议事件·' + r.name
        };
      }
    };

    // ---- ban_event ----
    ToolExecutor.WHITELIST.ban_event = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var duration = a.duration != null ? a.duration : 'permanent';
        var r = E.banEvent(a.id, duration, a.reason || '');
        if (!r.ok) return r;
        return {
          ok: true, type: 'event', action: 'ban',
          eventId: r.id, status: r.status, banUntil: r.banUntil,
          label: '封禁事件·' + r.id + '（' + r.status + '）'
        };
      }
    };

    // ---- unban_event ----
    ToolExecutor.WHITELIST.unban_event = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = E.unbanEvent(a.id);
        if (!r.ok) return r;
        return { ok: true, type: 'event', action: 'unban', eventId: r.id, label: '解封事件·' + r.id };
      }
    };
  }

  // P16·B1：同步注册（原为 setTimeout(registerTools, 900~1900ms) 错峰注册）。
  //   错峰注册让冷启动后约 2 秒内 ToolExecutor.WHITELIST 只有内置的 15 个工具，AI 此时
  //   调用本模块的工具会拿到「未知工具：xxx」；而未知工具要连续失败 3 次才会提示 AI，
  //   中间它会反复重试同一个不存在的工具、白烧 token。ToolExecutor 在两仓的装载顺序里
  //   都排在本模块之前（index.html 的 <script> 顺序 / rn_bootstrap.js 的 load 顺序），
  //   所以这里可以直接同步注册。
  if (typeof ToolExecutor !== 'undefined' && ToolExecutor.WHITELIST) {
    registerTools();
  } else {
    // 顺序异常时的兜底：只退到下一轮事件循环（原实现要等 900~1900ms）。
    // registerTools 自己的就绪检查会写一条 BOOT 错误，不会静默少工具。
    setTimeout(registerTools, 0);
  }

  if (typeof window !== 'undefined') window.Events = Events;
  if (typeof module !== 'undefined' && module.exports) module.exports = Events;
})();
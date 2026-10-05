// ============================================================
// 后台进程（世界自己在动）· P28
//
// 用户诉求（原话）：「游戏方面我们目前没有默认后台自动运行的一些进程，这些进程可以由于各类权重触发随机事件」。
//
// 做法：卡带用 worldbook.background.processes 声明若干「后台进程」（不写就用 3 条通用默认），
//   引擎每隔该进程的 everyRounds 轮评估一次，按
//       weight × 关键词命中数（与 NPC 关键词取交集）× 冷却惩罚(0.2)
//   算出候选并加权随机挑一条，写进 pending；pending 只交给 AI 看一轮，由 AI 决定怎么在正文里
//   自然带出（不硬插、不替玩家决策）。
// 数据：/saves/{cardId}/{saveId}/background_runtime.json
// 开关：全局 settings.background.enabled（默认开，显式设 false 才关）
// A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function () {
  var Background = {
    _data: null,
    // 可注入的随机源（测试用；默认 Math.random）
    _rnd: null,

    _path: function () {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/background_runtime.json';
    },

    _emptyData: function () {
      return {
        round: 0,        // 最近一次 tick 时的轮次
        cooldowns: {},   // { 进程id: 还剩几轮冷却 }
        pending: [],     // 待 AI 带出的条目（只留一轮）
        log: []          // 触发历史（最多 20 条）
      };
    },

    _ensureShape: function () {
      if (!this._data || typeof this._data !== 'object') { this._data = this._emptyData(); return; }
      if (typeof this._data.round !== 'number') this._data.round = 0;
      if (!this._data.cooldowns || typeof this._data.cooldowns !== 'object') this._data.cooldowns = {};
      if (!Array.isArray(this._data.pending)) this._data.pending = [];
      if (!Array.isArray(this._data.log)) this._data.log = [];
    },

    load: function () {
      var p = this._path();
      if (!p) { this._data = this._emptyData(); return; }
      var d = null;
      try { d = VFS.readJSON(p); } catch (e) { d = null; }
      this._data = d && typeof d === 'object' ? d : this._emptyData();
      this._ensureShape();
    },

    save: function () {
      var p = this._path();
      if (!p || !this._data) return;
      try { VFS.writeJSON(p, this._data); } catch (e) { /* 存不下不影响本轮 */ }
    },

    getRuntime: function () { if (!this._data) this.load(); this._ensureShape(); return JSON.parse(JSON.stringify(this._data)); },

    setRuntime: function (data) { this._data = data && typeof data === 'object' ? data : this._emptyData(); this._ensureShape(); this.save(); },

    clear: function () { this._data = this._emptyData(); this.save(); },

    // ============ 开关 ============
    isEnabled: function () {
      try {
        var g = Storage.getGlobal();
        var s = (g.settings && g.settings.background) || {};
        return s.enabled !== false;   // 默认开
      } catch (e) { return true; }
    },

    // ============ 轮次（口径与 engine/endings.js 一致：开场白算第 1 轮）============
    _roundCount: function () {
      var h = (GameState && GameState.chatHistory) || [];
      var n = 0;
      for (var i = 0; i < h.length; i++) {
        var m = h[i];
        if (!m || m.role !== 'user') continue;
        var t = String(m.content || '');
        if (t.indexOf('【系统 ·') === 0) continue;
        n++;
      }
      return n;
    },

    // ============ 进程定义 ============
    getCardConfig: function () {
      var c = GameState.currentCard;
      return (c && c.worldbook && c.worldbook.background) || null;
    },

    // 3 条通用进程：卡带没写 processes 时用它，保证「默认就有后台在动」
    defaultProcesses: function () {
      return [
        { id: 'world-life', name: '世界日常', weight: 3, everyRounds: 2, cooldownRounds: 4, keywords: [],
          hint: '市井/环境/无关紧要的小事推进一格：天气变了、摊贩换人、街上多了告示、远方传来消息。' },
        { id: 'npc-initiate', name: 'NPC 主动', weight: 5, everyRounds: 3, cooldownRounds: 6, keywords: ['目标', '冲突', '关系', '秘密'],
          hint: '某个 NPC 按自己的目标主动做一件事（派人传话、上门、动手、躲起来），不给玩家递台阶，只把动作摆出来。' },
        { id: 'world-pressure', name: '世界压力', weight: 4, everyRounds: 4, cooldownRounds: 6, keywords: ['势力', '局势', '危机'],
          hint: '大环境压过来一点：物价、盘查、禁令、传闻、势力动作。可以只体现在细节里。' }
      ];
    },

    listProcesses: function () {
      var cfg = this.getCardConfig() || {};
      var raw = Array.isArray(cfg.processes) ? cfg.processes : null;
      var base = (raw && raw.length) ? raw : this.defaultProcesses();
      var out = [];
      for (var i = 0; i < base.length; i++) {
        var p = base[i];
        if (!p || typeof p !== 'object' || !p.id || !p.name) continue;
        out.push({
          id: String(p.id),
          name: String(p.name),
          weight: typeof p.weight === 'number' ? p.weight : 1,
          everyRounds: Math.max(1, parseInt(p.everyRounds, 10) || 2),
          cooldownRounds: Math.max(1, parseInt(p.cooldownRounds, 10) || 4),
          keywords: Array.isArray(p.keywords) ? p.keywords.slice() : [],
          archetypeId: p.archetypeId || '',
          hint: typeof p.hint === 'string' ? p.hint : ''
        });
      }
      return out;
    },

    // NPC 的动态关键词优先（add_keyword 加的），退回静态 keywords
    _npcKeywords: function (npc) {
      var kw = [];
      try {
        if (typeof NpcRuntime !== 'undefined' && NpcRuntime && typeof NpcRuntime.get === 'function' && npc && npc.id) {
          var rt = NpcRuntime.get(npc.id);
          if (rt && Array.isArray(rt.keywords)) kw = kw.concat(rt.keywords);
        }
      } catch (e) { /* 尽力而为 */ }
      if (npc && Array.isArray(npc.keywords)) kw = kw.concat(npc.keywords);
      return kw;
    },

    // 候选：weight × 命中数 × 冷却惩罚；有关键词但零命中 ⇒ 跳过
    _buildCandidates: function (round) {
      if (!this._data) this.load();
      this._ensureShape();
      var card = GameState.currentCard;
      var wb = (card && card.worldbook) || {};
      var npcs = Array.isArray(wb.npcs) ? wb.npcs : [];
      var procs = this.listProcesses();
      var cds = this._data.cooldowns || {};
      var out = [];
      for (var i = 0; i < procs.length; i++) {
        var p = procs[i];
        var hits = 0, actors = [];
        for (var j = 0; j < npcs.length; j++) {
          var npc = npcs[j];
          if (!npc) continue;
          var kw = this._npcKeywords(npc);
          var h = 0;
          for (var k = 0; k < p.keywords.length; k++) {
            if (kw.indexOf(p.keywords[k]) >= 0) h++;
          }
          if (h > 0) { hits += h; actors.push(npc.name || npc.id); }
        }
        if (p.keywords.length && hits === 0) continue;
        var cool = cds[p.id] ? 0.2 : 1;
        var weight = (p.weight || 1) * (hits || 1) * cool;
        out.push({
          id: p.id, name: p.name, weight: weight, hits: hits, cool: cool,
          cooldownLeft: cds[p.id] || 0, actors: actors, hint: p.hint, archetypeId: p.archetypeId
        });
      }
      out.sort(function (a, b) { return b.weight - a.weight; });
      return out.slice(0, 3);
    },

    _pickWeighted: function (list) {
      if (!list.length) return null;
      var total = 0, i;
      for (i = 0; i < list.length; i++) total += Math.max(0, list[i].weight);
      if (total <= 0) return list[0];
      var r = (typeof this._rnd === 'function' ? this._rnd() : Math.random()) * total;
      var acc = 0;
      for (i = 0; i < list.length; i++) {
        acc += Math.max(0, list[i].weight);
        if (r < acc) return list[i];
      }
      return list[list.length - 1];
    },

    // 每轮（story.js 的 tick 链）调用一次
    tick: function () {
      if (!this.isEnabled()) return { ok: false, reason: '后台进程未启用', fired: null };
      if (!this._data) this.load();
      this._ensureShape();
      var round = this._roundCount();
      // ① 上一轮的 pending 只给 AI 看一轮
      this._data.pending = [];
      // ② 冷却递减
      var cds = this._data.cooldowns, k;
      for (k in cds) {
        if (!Object.prototype.hasOwnProperty.call(cds, k)) continue;
        cds[k] = Number(cds[k]) - 1;
        if (!(cds[k] > 0)) delete cds[k];
      }
      this._data.round = round;
      if (round < 1) { this.save(); return { ok: true, fired: null, reason: '还没开始' }; }

      // ③ 只看本轮到期的进程
      var procs = this.listProcesses();
      var byId = {}, due = [];
      for (var i = 0; i < procs.length; i++) {
        byId[procs[i].id] = procs[i];
        if (round % procs[i].everyRounds === 0) due.push(procs[i].id);
      }
      if (!due.length) { this.save(); return { ok: true, fired: null, reason: '本轮没有到期的进程' }; }

      var cands = this._buildCandidates(round).filter(function (c) { return due.indexOf(c.id) >= 0; });
      if (!cands.length) { this.save(); return { ok: true, fired: null, reason: '候选为空（关键词没命中或全在冷却）' }; }

      var pick = this._pickWeighted(cands);
      var def = byId[pick.id] || {};
      var entry = {
        id: pick.id,
        name: pick.name,
        hint: pick.hint,
        actors: pick.actors,
        round: round,
        at: (GameState && typeof GameState.formatGameTime === 'function') ? GameState.formatGameTime() : ''
      };
      this._data.pending = [entry];
      this._data.cooldowns[pick.id] = Math.max(1, parseInt(def.cooldownRounds, 10) || 4);
      this._data.log.push(entry);
      if (this._data.log.length > 20) this._data.log = this._data.log.slice(-20);

      // ④ 有事件原型就顺手实例化（失败不影响本轮）
      if (pick.archetypeId && typeof Events !== 'undefined' && Events && typeof Events.instantiateArchetype === 'function') {
        try { Events.instantiateArchetype(pick.archetypeId); } catch (e) { /* 尽力而为 */ }
      }
      this.save();
      return { ok: true, fired: entry, candidates: cands };
    },

    // 给 AI 看的一段（第四部分动态段）
    formatForPrompt: function () {
      if (!this.isEnabled()) return '';
      if (!this._data) this.load();
      this._ensureShape();
      var pend = this._data.pending || [];
      if (!pend.length) return '';
      var lines = ['>>> 【后台进程·世界自己在动】（待带出 ' + pend.length + ' 条）'];
      for (var i = 0; i < pend.length; i++) {
        var p = pend[i];
        var line = '· ' + p.name + '：' + (p.hint || '（按世界自己的逻辑推进一格）');
        if (p.actors && p.actors.length) line += '（相关人物：' + p.actors.join('、') + '）';
        lines.push(line);
      }
      lines.push('>>> （这是引擎按权重挑出的「世界自己发生的事」：请在本轮叙事里自然带出，不要硬插、不要替玩家决定，也不必解释来源。玩家完全没反应时就让它过去——世界照常运转。）');
      return lines.join('\n');
    },

    formatForHistory: function () {
      if (!this._data) this.load();
      this._ensureShape();
      var log = this._data.log || [];
      if (!log.length) return '';
      return '【后台进程】' + log.slice(-3).map(function (e) { return e.name + '@第' + e.round + '轮'; }).join('、');
    }
  };

  if (typeof window !== 'undefined') window.Background = Background;
  if (typeof module !== 'undefined' && module.exports) module.exports = Background;
})();

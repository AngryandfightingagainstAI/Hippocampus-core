// ============================================================
// 结局系统
// - 卡带定义结局，引擎判定触发
// - 硬结局（locked: true）→ 停止主循环
// - 软结局 → 标记达成，游戏可继续
// - 后日谈：作者预写 or AI 生成 or 玩家续写
// 数据：/saves/{cardId}/{saveId}/endings_runtime.json
// 开关：全局 settings.endings.enabled（默认 true）+ 卡带 endings 非空
// ============================================================

(function() {
  function uid() { return 'end_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

  // P24·④：结局门槛缺省值。第 1 轮 =「开局那一轮」（chatHistory 里只有开场白，玩家还没出手），
  //   所以缺省 2 表示「玩家至少出手过一次之后，结局才可能被引擎自动判定触发」。
  //   作者想保留「开局即结局」的卡，显式写 minRound: 1。
  var DEFAULT_MIN_ROUND = 2;

  var Endings = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/endings_runtime.json';
    },

    _emptyData: function() {
      return {
        triggered: {},       // { endingId: { at, round, by, epilogue, extensions: [] } }
        locked: false,       // 是否已锁死主循环
        lockedBy: ''         // 锁死者结局 id
      };
    },

    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = this._emptyData();
        return;
      }
      if (!this._data.triggered || typeof this._data.triggered !== 'object') this._data.triggered = {};
      if (this._data.locked == null) this._data.locked = false;
      if (this._data.lockedBy == null) this._data.lockedBy = '';
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

    // ============ 开关 ============
    isEnabled: function() {
      // 全局设置
      try {
        var g = Storage.getGlobal();
        var s = (g.settings && g.settings.endings) || {};
        if (s.enabled === false) return false;
      } catch (e) {}
      // 卡带必须定义了 endings
      var card = GameState.currentCard;
      if (!card) return false;
      var wb = card.worldbook || {};
      var list = wb.endings || [];
      return Array.isArray(list) && list.length > 0;
    },

    // ============ 定义查询 ============
    listDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.endings || [];
    },

    findDef: function(id) {
      var found = null;
      this.listDefs().forEach(function(e) { if (!found && e.id === id) found = e; });
      return found;
    },

    // ============ 状态查询 ============
    // 返回每个结局的完整状态（含 def + runtime）
    listAll: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var defs = this.listDefs();
      return defs.map(function(def) {
        var rt = self._data.triggered[def.id] || null;
        var g = self.gateOf(def);                    // P24·④：门槛状态（面板/查询能看到还差什么）
        return {
          id: def.id,
          name: def.name || def.id,
          type: def.type || 'neutral',
          desc: def.desc || '',
          priority: def.priority != null ? def.priority : 5,
          locked: !!def.locked,
          reached: !!rt,
          reachedAt: rt ? rt.at : '',
          reachedRound: rt ? rt.round : 0,
          reachedBy: rt ? rt.by : '',
          epilogue: rt ? (rt.epilogue || def.epilogue || '') : (def.epilogue || ''),
          extensions: rt ? (rt.extensions || []) : [],
          isDefEpilogue: !!(def.epilogue && (!rt || !rt.epilogue)),
          // P24·④：门槛（还差几轮 / 还差哪些前置事件）
          minRound: g.minRound,
          requireEvents: (def.requireEvents && def.requireEvents.slice) ? def.requireEvents.slice() : [],
          gateOk: g.ok,
          gateReason: g.ok ? '' : g.reasons.join('；')
        };
      });
    },

    isLocked: function() {
      if (!this._data) this.load();
      return !!(this._data && this._data.locked);
    },

    hasAnyReached: function() {
      if (!this._data) this.load();
      return Object.keys(this._data.triggered || {}).length > 0;
    },

    // ============ 触发门槛（P24·④） ============
    // 背景：结局条件原本「数值/标记一满足就触发」，而开局的数值就是卡带的 init。
    //   一张卡把坏结局条件写成「某数值 ≤ 最低值」时，第 1 轮就会直接秒结局。
    // 卡带 endings[i] 可选写两个字段（都不写时按 minRound 缺省值执行）：
    //   minRound: 2          —— 最少玩到第 2 轮才可能触发（第 1 轮 = 开局那一轮）
    //   requireEvents: ['e'] —— 这些事件必须先触发过（全部满足）
    // 门槛只拦「引擎自动判定」（tick）；AI 在叙事里主动调 trigger_ending 不受拦（那是剧情决定）。
    gateOf: function(def) {
      var reasons = [];
      var need = (def && def.minRound != null) ? Number(def.minRound) : DEFAULT_MIN_ROUND;
      if (!isFinite(need) || need < 1) need = 1;
      var cur = this._roundCount();
      if (cur < need) reasons.push('至少要玩到第 ' + need + ' 轮（现在第 ' + cur + ' 轮）');
      var needEvents = (def && Array.isArray(def.requireEvents)) ? def.requireEvents : [];
      var fired = this._firedEventIds();
      var missing = needEvents.filter(function(id) { return fired.indexOf(String(id)) < 0; });
      if (missing.length) reasons.push('需要先触发事件：' + missing.join('、'));
      return {
        ok: reasons.length === 0,
        reasons: reasons,
        round: cur,
        minRound: need,
        missingEvents: missing
      };
    },

    // 已触发过的事件 id（Events 未加载/无数据时返回空数组）
    _firedEventIds: function() {
      try {
        if (typeof Events === 'undefined' || !Events || !Events._data) return [];
        if (Events._ensureShape) Events._ensureShape();
        return Object.keys(Events._data.triggered || {});
      } catch (e) { return []; }
    },

    // ============ 触发判定 ============
    checkTrigger: function(def) {
      if (!def.trigger) return { ok: false };
      // 复用 Events._checkTrigger
      if (typeof Events !== 'undefined' && Events._checkTrigger) {
        return Events._checkTrigger({ trigger: def.trigger });
      }
      // 兜底：Events 未加载时返回 false
      return { ok: false };
    },

    // ============ 每轮检查 ============
    tick: function() {
      if (!this.isEnabled()) return { triggered: [] };
      if (!this._data) this.load();
      this._ensureShape();
      if (this._data.locked) return { triggered: [] };   // 已锁死，不再检查

      var self = this;
      var defs = this.listDefs();
      var triggered = [];

      // 按 priority 降序，多结局同时命中取最高的
      var candidates = [];
      defs.forEach(function(def) {
        if (!def.id) return;
        if (self._data.triggered[def.id]) return;   // 已达成
        // P24·④：门槛（回合数 / 前置事件）不过 → 条件命中也不触发
        var gate = self.gateOf(def);
        if (!gate.ok) return;
        var ck = self.checkTrigger(def);
        if (!ck.ok) return;
        candidates.push(def);
      });
      candidates.sort(function(a, b) {
        return (b.priority || 5) - (a.priority || 5);
      });

      if (candidates.length > 0) {
        var winner = candidates[0];
        var r = this._trigger(winner.id, 'engine');
        if (r.ok) triggered.push(r);
      }

      return { triggered: triggered };
    },

    // ============ 触发（引擎 or AI） ============
    _trigger: function(endingId, by) {
      if (!this._data) this.load();
      this._ensureShape();
      var def = this.findDef(endingId);
      if (!def) return { ok: false, reason: '结局不存在：' + endingId };
      if (this._data.triggered[endingId]) return { ok: false, reason: '该结局已达成' };
      if (this._data.locked && def.locked !== false) {
        // 已锁死，且新结局不是"软"的 → 拒绝
        return { ok: false, reason: '主循环已锁死' };
      }

      var now = GameState.formatGameTime();
      this._data.triggered[endingId] = {
        at: now,
        round: this._roundCount(),
        by: by || 'engine',
        epilogue: '',
        extensions: []
      };

      // 硬结局 → 锁死主循环
      if (def.locked) {
        this._data.locked = true;
        this._data.lockedBy = endingId;
      }

      this.save();

      return {
        ok: true,
        id: endingId,
        name: def.name || endingId,
        type: def.type || 'neutral',
        locked: !!def.locked,
        label: '结局达成·' + (def.name || endingId)
      };
    },

    // AI 工具调用入口
    triggerById: function(endingId, reason) {
      return this._trigger(endingId, 'ai' + (reason ? (':' + reason) : ''));
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // ============ 后日谈 ============
    // 卡带有预写 → 直接用
    // 没有 → AI 生成
    // 生成后缓存在 runtime.triggered[id].epilogue
    getEpilogue: function(endingId) {
      if (!this._data) this.load();
      var def = this.findDef(endingId);
      if (!def) return '';
      var rt = this._data.triggered[endingId];
      if (rt && rt.epilogue) return rt.epilogue;
      if (def.epilogue) return def.epilogue;
      return '';
    },

    // 异步：为某结局生成后日谈（如果没有）
    generateEpilogue: async function(endingId) {
      if (!this._data) this.load();
      var def = this.findDef(endingId);
      if (!def) return { ok: false, reason: '结局不存在' };
      var rt = this._data.triggered[endingId];
      if (rt && rt.epilogue) return { ok: true, epilogue: rt.epilogue, cached: true };
      if (def.epilogue) {
        if (!rt) this._data.triggered[endingId] = { at: GameState.formatGameTime(), round: this._roundCount(), by: 'engine', epilogue: def.epilogue, extensions: [] };
        else rt.epilogue = def.epilogue;
        this.save();
        return { ok: true, epilogue: def.epilogue, cached: true };
      }

      if (typeof ApiClient === 'undefined') return { ok: false, reason: 'API 未配置' };

      var prompt = this._buildEpiloguePrompt(def);
      try {
        var content = await ApiClient.chat([
          { role: 'user', content: prompt }
        ], { max_tokens: 1500, temperature: 0.8 });
        var text = (typeof content === 'string') ? content : (content && content.content) || '';
        text = String(text).trim();
        if (!text) return { ok: false, reason: 'AI 返回为空' };
        // 简单清理：去掉可能的 markdown
        text = text.replace(/^#+\s*/gm, '').replace(/^\*\*|\*\*$/g, '').trim();
        if (!rt) this._data.triggered[endingId] = { at: GameState.formatGameTime(), round: this._roundCount(), by: 'engine', epilogue: text, extensions: [] };
        else rt.epilogue = text;
        this.save();
        return { ok: true, epilogue: text };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    _buildEpiloguePrompt: function(def) {
      var card = GameState.currentCard || {};
      var wb = card.worldbook || {};
      var ws = wb.worldSetting || {};
      var pd = GameState.playerData || {};
      var name = '（主角）';
      try { if (typeof Alias !== 'undefined') name = Alias.get(pd, 'name') || name; } catch (e) {}

      // 最近日志摘要
      var summaries = '';
      try {
        if (typeof Logger !== 'undefined' && GameState.currentCardId && GameState.currentSaveId) {
          var sums = Logger.getRecentSummaries(GameState.currentCardId, GameState.currentSaveId, 5);
          summaries = sums.map(function(s) {
            return '[' + s.date + '] ' + (s.title || '') + '：' + (s.summary || '');
          }).join('\n');
        }
      } catch (e) {}

      var lines = [];
      lines.push('你是一个文字游戏的"结局后日谈"作者。请根据以下信息，写一段结局后日谈。');
      lines.push('');
      lines.push('【结局信息】');
      lines.push('结局名：' + (def.name || def.id));
      lines.push('结局类型：' + (def.type || 'neutral'));
      if (def.desc) lines.push('结局概述：' + def.desc);
      lines.push('');
      lines.push('【游戏世界】');
      if (ws.worldName) lines.push('世界：' + ws.worldName);
      if (card.game && card.game.title) lines.push('游戏：' + card.game.title);
      if (ws.description) lines.push('简介：' + ws.description);
      lines.push('');
      lines.push('【主角】' + name);
      lines.push('');
      if (summaries) {
        lines.push('【前情提要（最近）】');
        lines.push(summaries);
        lines.push('');
      }
      lines.push('【写作要求】');
      lines.push('1. 写 3-5 段，每段 2-4 句。');
      lines.push('2. 用第三人称，写"结局之后"发生的事：主角的后续、重要 NPC 的后续、世界的走向。');
      lines.push('3. 不用复盘过程，直接写后日谈。');
      lines.push('4. 只输出正文，不要标题、不要 markdown、不要解释。');
      return lines.join('\n');
    },

    // 玩家点"再来一段" → 追加一段
    extendEpilogue: async function(endingId, hint) {
      if (!this._data) this.load();
      var def = this.findDef(endingId);
      if (!def) return { ok: false, reason: '结局不存在' };
      var rt = this._data.triggered[endingId];
      if (!rt) return { ok: false, reason: '该结局未达成' };
      if (typeof ApiClient === 'undefined') return { ok: false, reason: 'API 未配置' };

      var prev = rt.epilogue || '';
      var prevExt = (rt.extensions || []).join('\n\n');

      var lines = [];
      lines.push('你正在为一段文字游戏的结局后日谈续写。');
      lines.push('');
      lines.push('【结局】' + (def.name || def.id));
      if (def.desc) lines.push('概述：' + def.desc);
      lines.push('');
      lines.push('【已经写过的后日谈】');
      if (prev) lines.push(prev);
      if (prevExt) lines.push('', prevExt);
      lines.push('');
      if (hint) {
        lines.push('【玩家希望接下来写】');
        lines.push(hint);
        lines.push('');
      }
      lines.push('【要求】');
      lines.push('1. 写 1-2 段，2-4 句。');
      lines.push('2. 承接上文，不重复已写内容。');
      lines.push('3. 只输出正文，不要标题、不要解释。');
      return this._doExtend(endingId, def, lines.join('\n'), hint);
    },

    async _doExtend(endingId, def, prompt, hint) {
      try {
        var content = await ApiClient.chat([
          { role: 'user', content: prompt }
        ], { max_tokens: 800, temperature: 0.85 });
        var text = (typeof content === 'string') ? content : (content && content.content) || '';
        text = String(text).trim().replace(/^#+\s*/gm, '');
        if (!text) return { ok: false, reason: 'AI 返回为空' };
        var rt = this._data.triggered[endingId];
        if (!rt.extensions) rt.extensions = [];
        rt.extensions.push(text);
        this.save();
        return { ok: true, text: text };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    // ============ Prompt 注入 ============
    // 已达成的结局（简短提示 AI 知道）
    formatForPrompt: function() {
      if (!this.isEnabled()) return '';
      if (!this._data) this.load();
      var self = this;
      var reached = Object.keys(this._data.triggered || {}).map(function(id) {
        var def = self.findDef(id);
        return def ? (def.name || id) : id;
      });
      if (!reached.length) return '';
      var lines = ['>>> 【已达成的结局】'];
      reached.forEach(function(n) { lines.push('· ' + n); });
      if (this._data.locked) {
        lines.push('>>> ⚠ 主循环已锁死，不再推进剧情。');
      }
      return lines.join('\n');
    },

    // ============ 清理 ============
    clear: function() {
      this._data = this._emptyData();
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Endings 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Endings] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var E = Endings;

    // ---- trigger_ending ----
    ToolExecutor.WHITELIST.trigger_ending = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = E.triggerById(a.id, a.reason || '');
        if (!r.ok) return r;
        return {
          ok: true, type: 'ending', action: 'trigger',
          endingId: r.id, endingName: r.name, endingType: r.type,
          locked: r.locked,
          label: '结局·' + r.name
        };
      }
    };

    // ---- query_endings ----
    ToolExecutor.WHITELIST.query_endings = {
      run: function() {
        var all = E.listAll();
        return {
          ok: true, type: 'query', queryType: 'endings',
          data: {
            enabled: E.isEnabled(),
            locked: E.isLocked(),
            total: all.length,
            reached: all.filter(function(e) { return e.reached; }).length,
            list: all.map(function(e) {
              return {
                id: e.id, name: e.name, type: e.type, locked: e.locked,
                reached: e.reached, reachedAt: e.reachedAt
              };
            })
          }
        };
      }
    };

    // ---- extend_epilogue（AI 主动续写后日谈，罕见）----
    ToolExecutor.WHITELIST.extend_epilogue = {
      run: function(a) {
        if (!a.endingId) return { ok: false, reason: '缺少 endingId' };
        // 异步 → 用 __async 包装
        return {
          __async: true,
          promise: (async function() {
            var r = await E.extendEpilogue(a.endingId, a.hint || '');
            if (!r.ok) return { ok: false, reason: r.reason };
            return {
              ok: true, type: 'ending', action: 'extend',
              endingId: a.endingId,
              label: '续写后日谈·' + a.endingId
            };
          })()
        };
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

  if (typeof window !== 'undefined') window.Endings = Endings;
  if (typeof module !== 'undefined' && module.exports) module.exports = Endings;
})();
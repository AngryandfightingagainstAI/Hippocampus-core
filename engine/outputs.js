// ============================================================
// 产出物系统
// 产出 → 曝露 → 发酵 → 定论
// 数据：
//   卡带定义  card.worldbook.outputs
//   运行时    /saves/{cardId}/{saveId}/outputs_runtime.json
// 分层：A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function() {
  var Outputs = {
    _data: null,
    _lastFermentDate: '',

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/outputs_runtime.json';
    },

    _emptyData: function() {
      return { outputs: {}, _lastIntervalKey: '' };
    },

    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = this._emptyData();
        return;
      }
      if (!this._data.outputs || typeof this._data.outputs !== 'object') {
        this._data.outputs = {};
      }
      if (typeof this._data._lastIntervalKey !== 'string') this._data._lastIntervalKey = '';
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = this._emptyData(); return; }
      var d = VFS.readJSON(p);
      this._data = (d && typeof d === 'object') ? d : this._emptyData();
      this._ensureShape();
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },

    setRuntime: function(data) {
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      if (!this._data) this._data = this._emptyData();
      this._ensureShape();
      this.save();
    },

    // ============ 卡带定义（默认池，可选） ============
    // 卡带填 {types, audiences, eventPool, settleRules, fermentInterval} 提供默认值
    // 填 {} = 用引擎默认池；不填 = 无默认池（AI 运行时动态发也可以）
    // 返回值可能是 null / {} / {...}，调用方自己判空
    getCardConfig: function() {
      var card = GameState.currentCard;
      if (!card) return null;
      var wb = card.worldbook || {};
      return wb.outputs || null;
    },

    // 启用与否由全局开关决定（settings.outputs.enabled）
    // 默认关。卡带填不填 worldbook.outputs 都不影响启用状态
    isEnabled: function() {
      try {
        var g = Storage.getGlobal();
        var s = (g.settings && g.settings.outputs) || {};
        return s.enabled === true;
      } catch (e) { return false; }
    },

    // ============ CRUD ============
    create: function(def) {
      if (!this._data) this.load();
      this._ensureShape();
      if (!def || typeof def !== 'object') return { ok: false, reason: '参数不是对象' };
      if (!def.name) return { ok: false, reason: '产出物必须有 name' };
      var id = def.id || ('out_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
      if (this._data.outputs[id]) return { ok: false, reason: 'id 已存在：' + id };

      var now = GameState.formatGameTime();
      this._data.outputs[id] = {
        id: id,
        name: String(def.name),
        type: def.type || '',
        createdAt: now,
        publishedAt: now,
        keywords: Array.isArray(def.keywords) ? def.keywords.slice() : [],
        audience: Array.isArray(def.audience) ? def.audience.slice() : [],
        fate: 'fermenting',
        progress: 0,
        events: [],
        stirCooldowns: {},
        finalVerdict: '',
        settledAt: ''
      };
      this.save();
      return { ok: true, id: id, name: this._data.outputs[id].name };
    },

    get: function(id) {
      if (!this._data) this.load();
      if (!this._data.outputs[id]) return null;
      return JSON.parse(JSON.stringify(this._data.outputs[id]));
    },

    listAll: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      return Object.keys(this._data.outputs).map(function(id) {
        return self.get(id);
      });
    },

    listFermenting: function() {
      return this.listAll().filter(function(o) { return o.fate === 'fermenting'; });
    },

    remove: function(id) {
      if (!this._data) this.load();
      if (!this._data.outputs[id]) return { ok: false, reason: '产出物不存在：' + id };
      var name = this._data.outputs[id].name;
      delete this._data.outputs[id];
      this.save();
      return { ok: true, id: id, name: name };
    },

    // ============ 发酵 tick ============
    // 每跨过 fermentInterval（month/season/year）触发一次
    tick: function() {
      if (!this.isEnabled()) return { fermented: false };
      if (!this._data) this.load();
      this._ensureShape();

      var now = this._dateKey(GameState.formatGameTime());
      if (!now) return { fermented: false };

      var cfg = this.getCardConfig() || {};
      var interval = cfg.fermentInterval || 'year';
      var curKey = this._intervalKey(now, interval);
      if (this._data._lastIntervalKey === curKey) return { fermented: false };
      this._data._lastIntervalKey = curKey;

      var all = this.listFermenting();
      if (!all.length) return { fermented: true, outputs: [], settled: [] };

      var self = this;
      var settled = [];

      all.forEach(function(snap) {
        var live = self._data.outputs[snap.id];
        if (!live) return;

        // 1. 冷却扣减（每 tick -1）
        Object.keys(live.stirCooldowns || {}).forEach(function(npcId) {
          live.stirCooldowns[npcId] -= 1;
          if (live.stirCooldowns[npcId] <= 0) delete live.stirCooldowns[npcId];
        });

        // 2. NPC 关键词匹配 → 候选池（每 tick 覆盖）
        live.pendingStirs = self._buildCandidates(live);

        // 3. progress 增长（audience 是群体标签数组）
        live.progress += 5 + (live.audience || []).length * 2;

        // 4. 检查定论
        var rule = self._checkSettleRule(live, cfg);
        if (rule.ok) {
          var v = self._settle(live, cfg, rule.reason);
          if (v.ok) settled.push(v);
        }

        // 5. 覆盖写回
        self._data.outputs[live.id] = live;
      });

      this.save();
      return { fermented: true, outputs: all, settled: settled };
    },

    _intervalKey: function(dateStr, interval) {
      var parts = String(dateStr).split('-');
      var y = parts[0] || '';
      var m = parseInt(parts[1] || '1', 10);
      if (interval === 'month') return y + '-' + (parts[1] || '');
      if (interval === 'season') return y + '-Q' + Math.floor((m - 1) / 3);
      return y;
    },

    _dateKey: function(timeStr) {
      if (!timeStr) return '';
      var m = String(timeStr).match(/^(\d+-\d+-\d+)/);
      return m ? m[1] : '';
    },

    _buildCandidates: function(o) {
      var card = GameState.currentCard;
      if (!card) return [];
      var npcs = ((card.worldbook || {}).npcs) || [];
      var out = [];
      var oKeywords = Array.isArray(o.keywords) ? o.keywords : [];

      npcs.forEach(function(npc) {
        if (!npc.id) return;

        // 关键词来源：优先运行时的（含 add_keyword 动态加的词），退回卡带定义
        var rt = (typeof NpcRuntime !== 'undefined' && typeof NpcRuntime.get === 'function')
          ? NpcRuntime.get(npc.id)
          : null;
        var kws = (rt && Array.isArray(rt.keywords)) ? rt.keywords : npc.keywords;
        if (!Array.isArray(kws)) return;

        var hits = 0;
        oKeywords.forEach(function(k) {
          if (k && kws.indexOf(k) >= 0) hits++;
        });
        if (hits === 0) return;

        var base = npc.weight != null ? npc.weight : 5;
        var penalty = o.stirCooldowns[npc.id] ? 0.3 : 1;
        var weight = base * hits * penalty;
        out.push({
          npcId: npc.id,
          name: npc.name || npc.id,
          weight: weight,
          hits: hits
        });
      });

      out.sort(function(a, b) { return b.weight - a.weight; });
      return out.slice(0, 3);
    },

    _checkSettleRule: function(o, cfg) {
      var rules = cfg.settleRules || {};
      var when = rules.when || {};
      if (when.type === 'progress-full' && o.progress >= 100) {
        return { ok: true, reason: 'progress-full' };
      }
      if (when.type === 'fixed-years') {
        var years = Number(when.years) || 1;
        var pubYear = parseInt(String(o.publishedAt || '').slice(0, 4), 10) || 0;
        var curYear = GameState._gameTime ? GameState._gameTime.year : pubYear;
        if (curYear - pubYear >= years) return { ok: true, reason: 'fixed-years' };
      }
      return { ok: false };
    },

    _settle: function(o, cfg, reason) {
      o.fate = 'settled';
      o.settledAt = GameState.formatGameTime();
      o.finalVerdict = o.finalVerdict || ('发酵完成（' + reason + '，progress=' + o.progress + '）');

      var rules = cfg.settleRules || {};
      var affects = Array.isArray(rules.affects) ? rules.affects : [];
      var applied = this._applyAffects(affects);

      try {
        GameState._pendingSystemNotices.push('产出物《' + o.name + '》定论：' + o.finalVerdict);
      } catch (e) {}

      return { ok: true, id: o.id, name: o.name, applied: applied };
    },

    _applyAffects: function(affects) {
      if (!Array.isArray(affects) || !affects.length) return [];
      var st = GameState.currentState;
      if (!st) return [];
      var applied = [];

      affects.forEach(function(a) {
        if (!a || !a.statKey || !a.delta) return;
        var delta = Number(a.delta);
        if (!delta) return;

        var key = a.statKey;
        var scope = null, panelId = null, item = null;

        item = (st.hud || []).find(function(x) { return x.key === key; });
        if (item) scope = 'hud';
        if (!item) {
          item = (st.sidebar || []).find(function(x) { return x.key === key; });
          if (item) scope = 'sidebar';
        }
        if (!item) {
          Object.keys(st.panels || {}).forEach(function(pid) {
            (st.panels[pid].entries || []).forEach(function(e) {
              if (e.key === key && !item) { item = e; scope = 'entry'; panelId = pid; }
            });
          });
        }
        if (!item || !scope) return;

        if (typeof ToolExecutor !== 'undefined' && ToolExecutor._modifyStat) {
          var r = ToolExecutor._modifyStat(scope, panelId, key, delta);
          if (r && r.ok) {
            applied.push({ statKey: key, oldVal: r.oldVal, newVal: r.newVal, delta: r.delta });
          }
        }
      });

      return applied;
    },

    // ============ 引动（AI 记录一次） ============
    // 软约束：不校验候选池，任何 npcId 都接受（批 2 会加候选池 + 冷却扣减）
    stir: function(outputId, npcId, action) {
      if (!this._data) this.load();
      var o = this._data.outputs[outputId];
      if (!o) return { ok: false, reason: '产出物不存在：' + outputId };
      if (o.fate !== 'fermenting') return { ok: false, reason: '该产出物已定论' };
      if (!npcId) return { ok: false, reason: '缺少 npcId' };

      var now = GameState.formatGameTime();
      o.events.push({
        at: now,
        eventType: 'stir',
        actorNpcId: npcId,
        description: String(action || '')
      });

      o.stirCooldowns[npcId] = 3;

      this.save();
      return { ok: true, outputId: outputId, npcId: npcId, name: o.name };
    },

    // ============ 主动定论（少见） ============
    // 批 1：只标记，不应用 affects（批 2 补）
    settle: function(id, verdict) {
      if (!this._data) this.load();
      var o = this._data.outputs[id];
      if (!o) return { ok: false, reason: '产出物不存在：' + id };
      if (o.fate === 'settled') return { ok: false, reason: '该产出物已定论' };
      o.fate = 'settled';
      o.finalVerdict = String(verdict || '');
      o.settledAt = GameState.formatGameTime();
      this.save();
      return { ok: true, id: id, name: o.name };
    },

    // ============ Prompt 注入 ============
    formatForPrompt: function() {
      if (!this.isEnabled()) return '';
      var all = this.listFermenting();
      if (!all.length) return '';

      var lines = [];
      lines.push('>>> 【产出物发酵中】（' + all.length + '）');
      all.forEach(function(o) {
        var line = '· 《' + o.name + '》';
        if (o.type) line += '（' + o.type + '）';
        line += ' progress=' + o.progress;
        if (o.audience && o.audience.length) line += ' · 受众：' + o.audience.join('、');
        lines.push(line);

        if (Array.isArray(o.pendingStirs) && o.pendingStirs.length) {
          var cands = o.pendingStirs.map(function(c) {
            return c.name + '(id=' + c.npcId + ',命中' + c.hits + ')';
          });
          lines.push('  候选：' + cands.join(' · '));
        }
        if (o.stirCooldowns && Object.keys(o.stirCooldowns).length) {
          var cd = Object.keys(o.stirCooldowns).map(function(id) {
            return id + '(' + o.stirCooldowns[id] + ')';
          });
          lines.push('  冷却中：' + cd.join(' · '));
        }
      });
      lines.push('>>> （AI 用 output_stir(outputId, npcId, action) 记录一次引动，action 自由）');
      return lines.join('\n');
    },

    // ============ 调试 ============
    clear: function() {
      this._data = this._emptyData();
      this._lastFermentDate = '';
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Outputs 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Outputs] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var O = Outputs;

    // ---- output_publish ----
    ToolExecutor.WHITELIST.output_publish = {
      run: function(a) {
        if (!O.isEnabled()) return { ok: false, reason: '产出物系统未启用（全局设置未开）' };
        if (!a.name) return { ok: false, reason: '缺少 name' };
        var r = O.create({
          name: a.name,
          type: a.type || '',
          keywords: a.keywords || [],
          audience: a.audience || []
        });
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'output',
          action: 'publish',
          outputId: r.id,
          outputName: r.name,
          label: '发布产出物·' + r.name
        };
      }
    };

    // ---- output_stir ----
    ToolExecutor.WHITELIST.output_stir = {
      run: function(a) {
        if (!O.isEnabled()) return { ok: false, reason: '产出物系统未启用' };
        if (!a.outputId) return { ok: false, reason: '缺少 outputId' };
        if (!a.npcId) return { ok: false, reason: '缺少 npcId' };
        var o = O.get(a.outputId);
        if (!o) return { ok: false, reason: '产出物不存在：' + a.outputId };
        var r = O.stir(a.outputId, a.npcId, a.action || '');
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'output',
          action: 'stir',
          outputId: r.outputId,
          outputName: r.name,
          npcId: r.npcId,
          label: '产出物·' + r.name + ' ← ' + r.npcId
        };
      }
    };

    // ---- output_settle ----
    ToolExecutor.WHITELIST.output_settle = {
      run: function(a) {
        if (!O.isEnabled()) return { ok: false, reason: '产出物系统未启用' };
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = O.settle(a.id, a.verdict || '');
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'output',
          action: 'settle',
          outputId: r.id,
          outputName: r.name,
          label: '产出物定论·' + r.name
        };
      }
    };

    // ---- query_outputs ----
    ToolExecutor.WHITELIST.query_outputs = {
      run: function() {
        if (!O.isEnabled()) return { ok: false, reason: '产出物系统未启用' };
        var all = O.listAll();
        return {
          ok: true,
          type: 'query',
          queryType: 'outputs',
          data: {
            total: all.length,
            fermenting: all.filter(function(o) { return o.fate === 'fermenting'; }).length,
            settled: all.filter(function(o) { return o.fate === 'settled'; }).length,
            list: all.map(function(o) {
              return {
                id: o.id,
                name: o.name,
                type: o.type,
                fate: o.fate,
                progress: o.progress,
                audience: o.audience.slice(),
                keywords: o.keywords.slice()
              };
            })
          }
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

  if (typeof window !== 'undefined') window.Outputs = Outputs;
  if (typeof module !== 'undefined' && module.exports) module.exports = Outputs;
})();

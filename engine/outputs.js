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
      // P27：老存档里的产出物没有 title / content / desc / review —— 读时补齐（不改语义）
      var outs = this._data.outputs;
      Object.keys(outs).forEach(function(k) {
        var o = outs[k];
        if (!o || typeof o !== 'object') return;
        if (typeof o.title !== 'string' || !o.title) o.title = String(o.name || '');
        if (typeof o.content !== 'string') o.content = '';
        if (typeof o.desc !== 'string') o.desc = '';
        if (!o.review || typeof o.review !== 'object') o.review = { state: 'none', reason: '', at: '', round: 0 };
        if (typeof o.review.state !== 'string') o.review.state = 'none';
      });
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
      // P27：面板提交（def.fromPanel / reviewState:'pending'）要先过一轮 AI 审核；
      //   AI 自己 output_publish 的默认 none = 已纳入（正文/描述直接进提示词）。
      var reviewState = (def.reviewState === 'pending' || def.fromPanel === true) ? 'pending' : 'none';
      this._data.outputs[id] = {
        id: id,
        name: String(def.name),
        title: String(def.title != null ? def.title : def.name),
        content: String(def.content || ''),
        desc: String(def.desc || ''),
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
        settledAt: '',
        review: { state: reviewState, reason: '', at: '', round: 0 }
      };
      this.save();
      return { ok: true, id: id, name: this._data.outputs[id].name };
    },

    get: function(id) {
      if (!this._data) this.load();
      if (!this._data.outputs[id]) return null;
      return JSON.parse(JSON.stringify(this._data.outputs[id]));
    },

    // P27：面板/AI 改写标题、正文、描述（字段白名单，不碰 fate / progress / events）
    update: function(id, patch) {
      if (!this._data) this.load();
      this._ensureShape();
      var o = this._data.outputs[id];
      if (!o) return { ok: false, reason: '产出物不存在：' + id };
      if (!patch || typeof patch !== 'object') return { ok: false, reason: '参数不是对象' };
      var applied = [];
      var strFields = ['name', 'title', 'content', 'desc', 'type'];
      for (var i = 0; i < strFields.length; i++) {
        var f = strFields[i];
        if (patch[f] != null) { o[f] = String(patch[f]); applied.push(f); }
      }
      if (Array.isArray(patch.keywords)) { o.keywords = patch.keywords.slice(); applied.push('keywords'); }
      if (Array.isArray(patch.audience)) { o.audience = patch.audience.slice(); applied.push('audience'); }
      if (!applied.length) return { ok: false, reason: '没有可改的字段（只认 name/title/content/desc/type/keywords/audience）' };
      this.save();
      return { ok: true, id: id, applied: applied, output: this.get(id) };
    },

    // ============ 一轮 AI 审核（P27） ============
    // 面板里提交的产出物 review.state = pending；送审后由 AI 裁决：
    //   include 直接纳入剧情 / revise 按 AI 给的标题正文描述改写后纳入 / reject 驳回并记原因。
    buildReviewPrompt: function(o) {
      var card = (typeof GameState !== 'undefined' && GameState) ? GameState.currentCard : null;
      var g = (card && card.game) || {};
      var bg = String(g.background || '');
      if (bg.length > 800) bg = bg.slice(0, 800) + '…';
      var lines = [];
      lines.push('你是这个文字冒险游戏的世界观审核员。有人提交了一件「产出物」，请判断它能否进入正文剧情。');
      lines.push('');
      lines.push('【游戏】' + (g.title || (card && card.cardName) || '（未命名）'));
      if (bg) lines.push('【世界背景（节选）】' + bg);
      lines.push('');
      lines.push('【待审产出物】');
      lines.push('标题：' + (o.title || o.name || ''));
      if (o.type) lines.push('类别：' + o.type);
      lines.push('描述：' + (o.desc || '（无）'));
      lines.push('正文：' + (o.content || '（无）'));
      lines.push('受众：' + ((o.audience && o.audience.length) ? o.audience.join('、') : '（未指）'));
      lines.push('');
      lines.push('裁决口径：');
      lines.push('· include —— 与世界一致、可直接写进剧情（哪怕粗糙，只要不矛盾）；');
      lines.push('· revise —— 方向可用但措辞与世界观冲突或太笼统，给出改写后的 title / content / desc；');
      lines.push('· reject —— 与世界明显矛盾（出现不存在的事物、破坏设定），说明原因。');
      lines.push('只输出一个 JSON，不要解释、不要代码块围栏：');
      lines.push('{"verdict":"include|revise|reject","reason":"一句话原因","title":"改写后的标题（revise 必填）","content":"改写后的正文（revise 必填）","desc":"改写后的描述（revise 可空）"}');
      return lines.join('\n');
    },

    // 从 AI 回复里取第一个 JSON 对象（容忍 ```json 围栏与前后闲聊）
    parseReviewVerdict: function(text) {
      var s = String(text == null ? '' : text).trim();
      s = s.replace(/```[a-zA-Z]*/g, '').replace(/```/g, '');
      var i = s.indexOf('{'), j = s.lastIndexOf('}');
      if (i < 0 || j <= i) return { ok: false, raw: s.slice(0, 120) };
      var obj = null;
      try { obj = JSON.parse(s.slice(i, j + 1)); } catch (e) { return { ok: false, raw: s.slice(i, j + 1).slice(0, 120) }; }
      var v = obj && obj.verdict ? String(obj.verdict).toLowerCase() : '';
      if (['include', 'revise', 'reject'].indexOf(v) < 0) return { ok: false, raw: 'verdict=' + JSON.stringify(obj && obj.verdict) };
      return { ok: true, verdict: v, reason: String(obj.reason || ''), title: obj.title != null ? String(obj.title) : '', content: obj.content != null ? String(obj.content) : '', desc: obj.desc != null ? String(obj.desc) : '' };
    },

    // 送一审：opts.chat 形如 ApiClient.chat(messages, options) → Promise<{content}>
    review: function(id, opts) {
      if (!this._data) this.load();
      this._ensureShape();
      var o = this._data.outputs[id];
      if (!o) return Promise.resolve({ ok: false, reason: '产出物不存在：' + id });
      opts = opts || {};
      if (typeof opts.chat !== 'function') return Promise.resolve({ ok: false, reason: '没有可用的 AI 通道（opts.chat 缺失）' });
      var self = this;
      var prompt = self.buildReviewPrompt(o);
      var pick = function(res) { return (res && (res.content || res.text)) || ''; };
      return Promise.resolve()
        .then(function() { return opts.chat([{ role: 'user', content: prompt }], { max_tokens: 500, temperature: 0.4 }); })
        .then(function(res) {
          var v = self.parseReviewVerdict(pick(res));
          var now = GameState.formatGameTime();
          if (!v.ok) {
            o.review = { state: 'pending', reason: 'AI 回复无法解析为裁决：' + v.raw, at: now, round: 0 };
            self.save();
            return { ok: false, reason: 'AI 回复无法解析为裁决', raw: v.raw };
          }
          if (v.verdict === 'include') {
            o.review = { state: 'included', reason: v.reason, at: now, round: 0 };
          } else if (v.verdict === 'revise') {
            if (v.title) o.title = v.title;
            if (v.content) o.content = v.content;
            if (v.desc) o.desc = v.desc;
            o.review = { state: 'revised', reason: v.reason, at: now, round: 0 };
          } else {
            o.review = { state: 'rejected', reason: v.reason, at: now, round: 0 };
          }
          self.save();
          return { ok: true, id: id, verdict: v.verdict, reason: v.reason, output: self.get(id) };
        }, function(err) {
          var msg = (err && err.message) ? err.message : String(err);
          o.review = { state: 'pending', reason: '审核调用失败：' + msg, at: GameState.formatGameTime(), round: 0 };
          self.save();
          return { ok: false, reason: o.review.reason };
        });
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

        // P27：审核通过（included / revised）或 AI 直接发布（none）⇒ 描述与正文当剧情素材带上；
        //   pending 只给一句提示（玩家从面板提交，等审核）；rejected 不注入内容。
        var st = (o.review && o.review.state) ? o.review.state : 'none';
        if (st === 'included' || st === 'revised' || st === 'none') {
          var dsc = String(o.desc || '').trim();
          if (dsc) lines.push('  描述：' + (dsc.length > 60 ? dsc.slice(0, 60) + '…' : dsc));
          var ctn = String(o.content || '').trim();
          if (ctn) lines.push('  正文：' + (ctn.length > 120 ? ctn.slice(0, 120) + '…' : ctn));
        } else if (st === 'pending') {
          lines.push('  待审：玩家从产出物面板提交，等一轮 AI 审核通过后才写进正文');
        }

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
          title: a.title,
          content: a.content,
          desc: a.desc,
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
              var ctn = String(o.content || '');
              return {
                id: o.id,
                name: o.name,
                title: o.title || o.name,
                desc: o.desc || '',
                content: ctn.length > 120 ? (ctn.slice(0, 120) + '…') : ctn,
                reviewState: (o.review && o.review.state) || 'none',
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

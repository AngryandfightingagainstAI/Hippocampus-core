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
        if (typeof o.review.raw !== 'string') o.review.raw = '';
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
        review: { state: reviewState, reason: '', raw: '', at: '', round: 0 }
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

    // ============ 一轮 AI 审核（P27 建 · P39 加固） ============
    // 面板里提交的产出物 review.state = pending；送审后由 AI 裁决：
    //   include 直接纳入剧情 / revise 按 AI 给的标题正文描述改写后纳入 / reject 驳回并记原因。
    //
    // P39 补「判据跟卡带走」：原来只喂 game.background 前 800 字，审核员看不到卡带自己的规矩。
    //   现在同时给出：卡带 worldbook.outputs 的 types / audiences / fermentInterval / settleRules、
    //   世界书里已有的事物名（npcs / locations / items / factions / entries）、当前游戏时间。
    buildReviewPrompt: function(o) {
      var card = (typeof GameState !== 'undefined' && GameState) ? GameState.currentCard : null;
      var g = (card && card.game) || {};
      var wb = (card && card.worldbook) || {};
      var cfg = wb.outputs || null;
      var bg = String(g.background || '');
      if (bg.length > 800) bg = bg.slice(0, 800) + '…';
      var lines = [];
      lines.push('你是这个文字冒险游戏的世界观审核员。有人提交了一件「产出物」，请判断它能否进入正文剧情。');
      lines.push('');
      lines.push('【游戏】' + (g.title || (card && card.cardName) || '（未命名）'));
      if (typeof GameState !== 'undefined' && GameState && typeof GameState.formatGameTime === 'function') {
        lines.push('【当前游戏时间】' + GameState.formatGameTime());
      }
      if (bg) lines.push('【世界背景（节选）】' + bg);
      // 卡带自己的标准：产出物类型白名单 / 预置受众 / 发酵与定论规则
      if (cfg && typeof cfg === 'object') {
        var std = [];
        if (Array.isArray(cfg.types) && cfg.types.length) std.push('可用类型：' + cfg.types.join('、'));
        if (Array.isArray(cfg.audiences) && cfg.audiences.length) std.push('预置受众：' + cfg.audiences.join('、'));
        if (cfg.fermentInterval) std.push('发酵粒度：' + cfg.fermentInterval);
        if (Array.isArray(cfg.eventPool) && cfg.eventPool.length) std.push('事件池条目数：' + cfg.eventPool.length);
        var sr = cfg.settleRules && cfg.settleRules.when;
        if (sr && sr.type === 'progress-full') std.push('定论条件：progress 涨到 100');
        else if (sr && sr.type === 'fixed-years') std.push('定论条件：出版后 ' + (Number(sr.years) || 1) + ' 年');
        if (std.length) lines.push('【卡带对产出物的规定】' + std.join('；'));
      }
      var names = [];
      ['npcs', 'locations', 'items', 'factions'].forEach(function(k) {
        var arr = wb[k];
        if (!Array.isArray(arr)) return;
        arr.forEach(function(x) { if (x && (x.name || x.id)) names.push(String(x.name || x.id)); });
      });
      if (Array.isArray(wb.entries)) {
        wb.entries.forEach(function(x) { if (x && (x.title || x.name)) names.push(String(x.title || x.name)); });
      }
      if (names.length) {
        var uniq = [];
        names.forEach(function(n) { if (uniq.indexOf(n) < 0) uniq.push(n); });
        var list = uniq.slice(0, 24).join('、');
        if (uniq.length > 24) list += '…';
        lines.push('【卡带里已有的事物】（新产出物不得与它们矛盾，也不要重复发明同一件事）' + list);
      }
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
      lines.push('');
      lines.push('硬性输出要求（违反就无法入库，会被要求重答）：');
      lines.push('1) 只回一个 JSON 对象：不要代码块围栏、不要解释、前后不要任何多余文字；');
      lines.push('2) verdict 只能是 include / revise / reject 三个英文词之一；');
      lines.push('3) 字符串里不要出现裸换行，需要换行请写 \\n，引号写 \\"；');
      lines.push('4) revise 的 content ≤ 300 字、desc ≤ 60 字；include/reject 不需要这三个字段；');
      lines.push('5) 字段：{"verdict":"...","reason":"一句话原因","title":"（revise 必填）","content":"（revise 必填）","desc":"（revise 可空）"}');
      return lines.join('\n');
    },

    // 裁决词归一化：模型经常回中文（纳入/修改后纳入/驳回），或大小写/带引号/带句号
    _normalizeVerdict: function(v) {
      var s = String(v == null ? '' : v).trim().toLowerCase().replace(/[\s"'`。，,、：:]/g, '');
      if (!s) return '';
      if (['include', 'included', 'ok', 'pass', 'accept', 'accepted', 'approve', 'approved', '通过', '纳入', '收录', '可用', '接受', '同意', '可以'].indexOf(s) >= 0) return 'include';
      if (['revise', 'revised', 'edit', 'modify', 'modified', 'rewrite', '修改', '修订', '改写', '修改后纳入', '润色', '调整'].indexOf(s) >= 0) return 'revise';
      if (['reject', 'rejected', 'deny', 'denied', 'refuse', 'refused', 'fail', '驳回', '拒绝', '不予', '不通过', '否决', '冲突'].indexOf(s) >= 0) return 'reject';
      if (s.indexOf('修改') >= 0 || s.indexOf('修订') >= 0 || s.indexOf('改写') >= 0 || s.indexOf('revise') >= 0 || s.indexOf('润色') >= 0) return 'revise';
      if (s.indexOf('驳回') >= 0 || s.indexOf('拒绝') >= 0 || s.indexOf('reject') >= 0 || s.indexOf('否决') >= 0) return 'reject';
      if (s.indexOf('纳入') >= 0 || s.indexOf('通过') >= 0 || s.indexOf('include') >= 0 || s.indexOf('接受') >= 0) return 'include';
      return '';
    },

    // 字符串感知的括号扫描：取第一个平衡的 {...}（跳过字符串内的花括号与转义）
    //   旧写法「第一个 { 到最后一个 }」在模型于 JSON 之后继续解释（还带 } 或代码块）时就废了。
    _firstJsonObject: function(s) {
      var start = s.indexOf('{');
      while (start >= 0) {
        var depth = 0, inStr = false, esc = false;
        for (var i = start; i < s.length; i++) {
          var ch = s.charAt(i);
          if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') inStr = false;
            continue;
          }
          if (ch === '"') { inStr = true; continue; }
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
        }
        start = s.indexOf('{', start + 1);
      }
      return '';
    },

    // 把字符串里的裸控制字符补成合法转义（模型写多行正文时最常见的坏 JSON）
    _escapeRawControls: function(s) {
      var out = '';
      var inStr = false, esc = false;
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (esc) { out += ch; esc = false; continue; }
        if (ch === '\\') { out += ch; esc = true; continue; }
        if (ch === '"') { inStr = !inStr; out += ch; continue; }
        if (inStr) {
          var c = s.charCodeAt(i);
          if (ch === '\n') { out += '\\n'; continue; }
          if (ch === '\r') { out += '\\r'; continue; }
          if (ch === '\t') { out += '\\t'; continue; }
          if (c < 0x20) { out += '\\u' + ('0000' + c.toString(16)).slice(-4); continue; }
        }
        out += ch;
      }
      return out;
    },

    // 从 AI 回复里取裁决：容忍围栏 / 前后闲聊 / 中文裁决词 / 裸换行 / 尾逗号 / 嵌套 / 被截断
    parseReviewVerdict: function(text) {
      var raw = String(text == null ? '' : text);
      var s = raw.trim().replace(/```[a-zA-Z]*/g, '').replace(/```/g, '');
      var candidates = [];
      var balanced = this._firstJsonObject(s);
      if (balanced) candidates.push(balanced);
      var i = s.indexOf('{'), j = s.lastIndexOf('}');
      if (i >= 0 && j > i) candidates.push(s.slice(i, j + 1));
      candidates.push(s);
      var obj = null;
      for (var k = 0; k < candidates.length && !obj; k++) {
        var tries = [candidates[k], this._escapeRawControls(candidates[k]), candidates[k].replace(/,\s*([}\]])/g, '$1')];
        for (var t = 0; t < tries.length && !obj; t++) {
          try {
            var parsed = JSON.parse(tries[t]);
            if (parsed && typeof parsed === 'object') obj = parsed;
          } catch (e) { /* 试下一个候选 */ }
        }
      }
      // 嵌套形态：{"review":{"verdict":...}} / {"result":{...}} / {"data":{...}}
      if (obj) {
        var inner = obj.review || obj.result || obj.decision || obj.data;
        if (inner && typeof inner === 'object' && (inner.verdict != null || inner.裁决 != null || inner.结论 != null)) {
          var merged = {};
          Object.keys(obj).forEach(function(key) { merged[key] = obj[key]; });
          Object.keys(inner).forEach(function(key) { merged[key] = inner[key]; });
          obj = merged;
        }
      }
      var vRaw = null;
      if (obj) {
        if (obj.verdict != null) vRaw = obj.verdict;
        else if (obj.裁决 != null) vRaw = obj.裁决;
        else if (obj.结论 != null) vRaw = obj.结论;
        else if (typeof obj.result === 'string') vRaw = obj.result;
      }
      var v = this._normalizeVerdict(vRaw);
      var reason = '', title = '', content = '', desc = '';
      if (obj) {
        if (obj.reason != null) reason = String(obj.reason);
        else if (obj.原因 != null) reason = String(obj.原因);
        else if (obj.理由 != null) reason = String(obj.理由);
        if (obj.title != null) title = String(obj.title);
        else if (obj.标题 != null) title = String(obj.标题);
        if (obj.content != null) content = String(obj.content);
        else if (obj.正文 != null) content = String(obj.正文);
        if (obj.desc != null) desc = String(obj.desc);
        else if (obj.描述 != null) desc = String(obj.描述);
      }
      // 截断抢救：JSON 被 max_tokens 切断时，正则把关键字段捞回来
      if (!v) {
        var mv = /["']?(?:verdict|裁决|结论)["']?\s*[:：]\s*["']?([A-Za-z\u4e00-\u9fa5]{1,12})/.exec(s);
        if (mv) v = this._normalizeVerdict(mv[1]);
      }
      if (!v && /(?:verdict|裁决|结论)/.test(s) === false && /include|revise|reject|纳入|驳回|修改/.test(s) === false) {
        return { ok: false, raw: s.slice(0, 200), text: raw.slice(0, 400) };
      }
      if (!reason) {
        var mr = /["']?(?:reason|原因|理由)["']?\s*[:：]\s*["']([^"'\n]{1,200})/.exec(s);
        if (mr) reason = mr[1];
      }
      if (!title) {
        var mt = /["']?(?:title|标题)["']?\s*[:：]\s*["']([^"'\n]{1,80})/.exec(s);
        if (mt) title = mt[1];
      }
      if (!content) {
        var mc = /["']?(?:content|正文)["']?\s*[:：]\s*["']([\s\S]{1,1200}?)(?:"|$)/.exec(s);
        if (mc) content = mc[1].replace(/\\n/g, '\n');
      }
      if (!v) return { ok: false, raw: s.slice(0, 200), text: raw.slice(0, 400) };
      var salvaged = !obj || (obj.verdict == null && obj.裁决 == null && obj.结论 == null);
      return { ok: true, verdict: v, reason: reason, title: title, content: content, desc: desc, salvaged: !!salvaged };
    },

    // P39：不依赖 AI 的手动裁决（AI 判得不合意 / 审核失败的出口）
    force: function(id, state, reason) {
      if (!this._data) this.load();
      this._ensureShape();
      var o = this._data.outputs[id];
      if (!o) return { ok: false, reason: '产出物不存在：' + id };
      var want = String(state == null ? '' : state).trim().toLowerCase();
      var st = '';
      if (want === 'pending') st = 'pending';
      else {
        var v = this._normalizeVerdict(want);
        st = v === 'include' ? 'included' : (v === 'revise' ? 'revised' : (v === 'reject' ? 'rejected' : ''));
      }
      if (!st) return { ok: false, reason: '不认的状态：' + state + '（只认 include / revise / reject / pending，也认中文 纳入/修改/驳回）' };
      var now = (typeof GameState !== 'undefined' && GameState && typeof GameState.formatGameTime === 'function') ? GameState.formatGameTime() : '';
      o.review = { state: st, reason: String(reason || '手动裁决'), raw: '', at: now, round: 0 };
      this.save();
      return { ok: true, id: id, state: st };
    },

    // 送一审：opts.chat 形如 ApiClient.chat(messages, options) → Promise<{content}>
    //   P39：max_tokens 500 会把 revise 的长正文截断（真机报「无法解析为裁决」的主因之一），抬到 1600；
    //   并要求 jsonMode（ApiClient 对不支持的模型会自动回退成普通模式，不会因此报错）；
    //   第一次解析不出裁决就自动重试一次：把上次回复回灌，只要一行 JSON。
    review: function(id, opts) {
      if (!this._data) this.load();
      this._ensureShape();
      var o = this._data.outputs[id];
      if (!o) return Promise.resolve({ ok: false, reason: '产出物不存在：' + id });
      opts = opts || {};
      if (typeof opts.chat !== 'function') return Promise.resolve({ ok: false, reason: '没有可用的 AI 通道（opts.chat 缺失）' });
      var self = this;
      var pick = function(res) { return (res && (res.content || res.text)) || ''; };
      var basePrompt = self.buildReviewPrompt(o);
      var callOpts = { max_tokens: 1600, temperature: 0.2, jsonMode: true };
      var maxAttempts = opts.maxAttempts != null ? Math.max(1, Math.min(3, Number(opts.maxAttempts) || 2)) : 2;
      var attempts = 0;
      var lastRaw = '';
      function attempt(messages) {
        attempts++;
        return Promise.resolve()
          .then(function() { return opts.chat(messages, callOpts); })
          .then(function(res) {
            var txt = pick(res);
            lastRaw = txt;
            var v = self.parseReviewVerdict(txt);
            if (v.ok || attempts >= maxAttempts) return v;
            var repair = '上一条回复无法解析为裁决。请只输出下面这一个 JSON（不要代码块围栏、不要解释、字符串里不要有裸换行）：\n'
              + '{"verdict":"include|revise|reject","reason":"一句话原因","title":"","content":"","desc":""}\n\n'
              + '你上一条回复是：\n' + String(txt).slice(0, 600);
            return attempt([
              { role: 'user', content: basePrompt },
              { role: 'assistant', content: String(txt).slice(0, 600) },
              { role: 'user', content: repair }
            ]);
          });
      }
      return attempt([{ role: 'user', content: basePrompt }]).then(function(v) {
        var now = (typeof GameState !== 'undefined' && GameState && typeof GameState.formatGameTime === 'function') ? GameState.formatGameTime() : '';
        if (!v.ok) {
          var shortRaw = String(lastRaw || '').slice(0, 600);
          o.review = {
            state: 'pending',
            reason: 'AI 回复无法解析为裁决（第 ' + attempts + ' 次尝试）：' + String(lastRaw || v.raw || '').slice(0, 200),
            raw: shortRaw,
            at: now,
            round: 0
          };
          self.save();
          return { ok: false, reason: 'AI 回复无法解析为裁决（已自动重试）', raw: v.raw, attempts: attempts, review: o.review };
        }
        if (v.verdict === 'include') {
          o.review = { state: 'included', reason: v.reason, raw: '', at: now, round: 0 };
        } else if (v.verdict === 'revise') {
          if (v.title) o.title = v.title;
          if (v.content) o.content = v.content;
          if (v.desc) o.desc = v.desc;
          o.review = { state: 'revised', reason: v.reason, raw: '', at: now, round: 0 };
        } else {
          o.review = { state: 'rejected', reason: v.reason, raw: '', at: now, round: 0 };
        }
        self.save();
        return { ok: true, id: id, verdict: v.verdict, reason: v.reason, salvaged: v.salvaged, attempts: attempts, output: self.get(id) };
      }, function(err) {
        var msg = (err && err.message) ? err.message : String(err);
        var now2 = (typeof GameState !== 'undefined' && GameState && typeof GameState.formatGameTime === 'function') ? GameState.formatGameTime() : '';
        o.review = { state: 'pending', reason: '审核调用失败：' + msg, raw: String(lastRaw || '').slice(0, 600), at: now2, round: 0 };
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

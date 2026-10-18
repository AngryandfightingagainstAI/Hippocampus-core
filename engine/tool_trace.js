// ============================================================
// 工具调用留痕（P65）
//
// 为什么要它（用户口径）：
//   「不要完全依赖 AI 自觉，5-10 轮左右让引擎发送给 AI 一道关键词自检，
//     工具调用在 10 轮内留痕给 AI，10 外清除，如果没有调用就是没有痕迹。」
//
// 三件事：
//   1) 留痕：每次真的执行了工具（或掷骰 / 联网搜索），把「第几轮、调了什么、成没成」记一条。
//      记录落在 /saves/{cardId}/{saveId}/tool_trace.json，跟存档走。
//   2) 10 轮 TTL：提示词里只带「round - r < TTL」的痕迹，超期的在 prune 时真删掉（不是只在显示层过滤）。
//   3) 定期自检：每 N 轮（默认 6，允许 5~10，可关）往提示词里塞一段机械自检清单，
//      要求模型输出一个【自检】块；引擎把它从正文里摘掉（玩家看不到），
//      并把结论留到下轮提示词里 —— 这样「上一轮自己承认缺了什么」不会被 10 轮窗口冲掉。
//
// 关键约束：
//   - 没有调用就**不产生任何一行**：formatForPrompt 在无痕迹时返回 ''，
//     提示词里不会出现「工具痕迹（空）」这种可以被模型当成暗示的空块。
//   - 引擎不替模型判断「该不该调工具」，只把「你实际调过什么、没调过什么」摊开。
// ============================================================

(function() {
  var TTL = 10;            // 10 轮内留痕（round - r < 10 ⇒ 第 r 轮调用在第 r..r+9 轮可见）
  var MAX_RECORDS = 40;    // 单档最多留 40 条，防膨胀（正常 10 轮也就十几条）
  var DEFAULT_EVERY = 6;   // 默认每 6 轮自检一次
  var MIN_EVERY = 5;
  var MAX_EVERY = 10;

  function _roundNo() {
    try {
      var h = (typeof GameState !== 'undefined' && GameState && GameState.chatHistory) || [];
      return h.filter(function(m) {
        return m && m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    } catch (e) { return 0; }
  }

  function _clip(s, n) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1) + '…';
  }

  // 参数摘要：只留「读者能判断调的是什么」的最短形式
  function _argsBrief(args) {
    if (!args || typeof args !== 'object') return '';
    var keys = Object.keys(args);
    if (!keys.length) return '';
    var bits = [];
    for (var i = 0; i < keys.length && i < 3; i++) {
      var k = keys[i];
      var v = args[k];
      if (v && typeof v === 'object') v = Array.isArray(v) ? ('[' + v.length + ' 项]') : '{…}';
      bits.push(k + '=' + _clip(v, 24));
    }
    if (keys.length > 3) bits.push('…');
    return bits.join(' ');
  }

  var ToolTrace = {
    TTL: TTL,
    DEFAULT_EVERY: DEFAULT_EVERY,

    _data: null,          // [{ round, ts, name, args, ok, note }]
    _selfChecks: null,    // [{ round, ts, text }]
    _version: 0,          // 变更计数：单测与「预算重渲染」用得上

    _path: function() {
      if (typeof GameState === 'undefined' || !GameState) return null;
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/tool_trace.json';
    },

    load: function() {
      this._data = [];
      this._selfChecks = [];
      this._version++;
      var p = this._path();
      if (!p || typeof VFS === 'undefined' || !VFS || typeof VFS.readJSON !== 'function') return;
      var d = null;
      try { d = VFS.readJSON(p); } catch (e) { d = null; }
      if (d && Array.isArray(d.calls)) this._data = d.calls;
      if (d && Array.isArray(d.selfChecks)) this._selfChecks = d.selfChecks;
    },

    save: function() {
      var p = this._path();
      if (!p || typeof VFS === 'undefined' || !VFS || typeof VFS.writeJSON !== 'function') return false;
      if (this._data && this._data.length > MAX_RECORDS) this._data = this._data.slice(-MAX_RECORDS);
      if (this._selfChecks && this._selfChecks.length > 4) this._selfChecks = this._selfChecks.slice(-4);
      try {
        VFS.writeJSON(p, { v: 1, calls: this._data || [], selfChecks: this._selfChecks || [] });
        return true;
      } catch (e) { return false; }
    },

    clear: function() {
      this._data = [];
      this._selfChecks = [];
      this._version++;
      var p = this._path();
      if (p && typeof VFS !== 'undefined' && VFS && typeof VFS.writeJSON === 'function') {
        try { VFS.writeJSON(p, { v: 1, calls: [], selfChecks: [] }); } catch (e) {}
      }
    },

    _ensure: function() {
      if (!this._data || !this._selfChecks) this.load();
    },

    // calls: [{name, args, ok, note}]
    record: function(round, calls) {
      if (!Array.isArray(calls) || !calls.length) return 0;
      this._ensure();
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      var now = Date.now();
      var added = 0;
      for (var i = 0; i < calls.length; i++) {
        var c = calls[i] || {};
        this._data.push({
          round: r,
          ts: now,
          name: _clip(c.name || 'unknown', 40),
          args: _clip(c.args == null ? '' : (typeof c.args === 'string' ? c.args : _argsBrief(c.args)), 80),
          ok: c.ok !== false,
          note: _clip(c.note || '', 60)
        });
        added++;
      }
      this._version++;
      this.prune(r);
      this.save();
      return added;
    },

    // 超期删除（真删，不只是显示过滤）
    prune: function(round) {
      this._ensure();
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      var before = this._data.length;
      this._data = this._data.filter(function(c) { return (r - c.round) < TTL; });
      var scBefore = this._selfChecks.length;
      this._selfChecks = this._selfChecks.filter(function(c) { return (r - c.round) < TTL; });
      if (before !== this._data.length || scBefore !== this._selfChecks.length) this._version++;
      return before - this._data.length;
    },

    recent: function(round) {
      this._ensure();
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      return this._data.filter(function(c) { return (r - c.round) < TTL; }).slice();
    },

    // 每轮自检间隔：5~10，可关（selfCheck:false）
    selfCheckEvery: function() {
      var cfg = null;
      try {
        var g = (typeof Storage !== 'undefined' && Storage && Storage.getGlobal) ? Storage.getGlobal() : null;
        cfg = (g && g.toolTrace) || null;
      } catch (e) { cfg = null; }
      if (cfg && cfg.selfCheck === false) return 0;
      var n = cfg && cfg.selfCheckEvery != null ? Number(cfg.selfCheckEvery) : DEFAULT_EVERY;
      if (!isFinite(n) || n <= 0) return DEFAULT_EVERY;
      n = Math.round(n);
      if (n < MIN_EVERY) n = MIN_EVERY;
      if (n > MAX_EVERY) n = MAX_EVERY;
      return n;
    },

    // 这一轮要不要自检
    needSelfCheck: function(round) {
      var every = this.selfCheckEvery();
      if (!every) return false;
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      return r > 0 && (r % every) === 0;
    },

    lastSelfCheck: function(round) {
      this._ensure();
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      for (var i = this._selfChecks.length - 1; i >= 0; i--) {
        if ((r - this._selfChecks[i].round) < TTL) return this._selfChecks[i];
      }
      return null;
    },

    recordSelfCheck: function(round, text) {
      this._ensure();
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      this._selfChecks.push({ round: r, ts: Date.now(), text: _clip(text, 240) });
      this._version++;
      this.prune(r);
      this.save();
    },

    // 提示词里的「工具痕迹」段：没有痕迹 ⇒ 空串（不许出现空块）
    formatForPrompt: function(round) {
      var list = this.recent(round);
      if (!list.length) return '';
      var lines = [];
      lines.push('>>> 最近 ' + TTL + ' 轮的工具调用痕迹（引擎记账，过期自动清除）：');
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var head = '>>> · 第 ' + c.round + ' 轮 ' + c.name + (c.args ? '(' + c.args + ')' : '');
        var tail = c.ok ? '→ 已执行' : ('→ 失败：' + (c.note || '未知原因'));
        lines.push(head + ' ' + tail);
      }
      lines.push('>>> （只有上面这些是真实调用过的。没列出的工具，这一局里你**没有**调用过，别声称调用过。）');
      return lines.join('\n');
    },

    // 自检段：不到点 ⇒ 空串
    selfCheckBlock: function(round) {
      if (!this.needSelfCheck(round)) return '';
      var r = (typeof round === 'number' && round > 0) ? round : _roundNo();
      var every = this.selfCheckEvery();
      var last = this.lastSelfCheck(r);
      var lines = [];
      lines.push('════════ 关键词自检 · 第 ' + r + ' 轮（每 ' + every + ' 轮一次，引擎发起）════════');
      lines.push('先别写正文，先按下面四条机械核对，再输出。');
      lines.push('1) 上一版是否给齐【正文】【时间】【选项】三个块？缺哪个这次补上。');
      lines.push('2) 该查的东西查了没有（人物 / 地点 / 日志 / 骰子 / 物品）？');
      lines.push('3) 「最近 ' + TTL + ' 轮工具痕迹」里没有的调用 = 你没有调过，不要写成"我查过"。');
      lines.push('4) 本轮结尾单独输出一个【自检】块，两行以内：缺什么 / 齐。例：【自检】齐');
      if (last) lines.push('（上次自检 · 第 ' + last.round + ' 轮：' + last.text + '）');
      lines.push('【自检】块由引擎摘掉，玩家看不到，不要写进【正文】里。');
      return lines.join('\n');
    },

    // 从模型输出里摘掉【自检】块，返回 { text, selfCheck }
    // ★ 只认「行首」的下一个块标记：自检正文里可以内嵌【时间】这类词（真机实测
    //   模型会写「缺【时间】一次」，按旧的任意位置 lookahead 就只剩「缺」了）。
    stripSelfCheck: function(content) {
      var s = String(content == null ? '' : content);
      var m = s.match(/【自检】\s*([\s\S]*?)(?=\n[ \t]*【(?:正文|故事|时间|选项|选项列表|自检)】|$)/);
      if (!m) return { text: s, selfCheck: null };
      var sc = _clip(m[1], 240);
      var text = s.replace(m[0], '').replace(/\n{3,}/g, '\n\n');
      return { text: text.trim(), selfCheck: sc || '（空）' };
    },

    // 把「工具结果 + 原始工具调用参数」合并成一条记账用的 calls 数组
    callsFromResults: function(toolsRaw, results) {
      var raws = Array.isArray(toolsRaw) ? toolsRaw : [];
      var res = Array.isArray(results) ? results : [];
      var out = [];
      for (var i = 0; i < res.length; i++) {
        var r = res[i] || {};
        var name = '', args = '';
        var raw = raws[i];
        if (raw) {
          try {
            var p = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (p && p.name) { name = p.name; args = p.args || ''; }
          } catch (e) {}
        }
        if (!name) name = r.type2 || r.type || 'tool';
        out.push({
          name: name,
          args: args,
          ok: r.ok !== false,
          note: r.ok === false ? (r.reason || '') : (r.label || '')
        });
      }
      return out;
    }
  };

  if (typeof window !== 'undefined') window.ToolTrace = ToolTrace;
  if (typeof module !== 'undefined' && module.exports) module.exports = ToolTrace;
})();

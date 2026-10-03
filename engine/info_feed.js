// ============================================================
// 剧情外信息层 · 手机（P1-H / H7 一期）
// 归一化：讯息线程（threads）与广播（broadcasts）同一个 per-save 文件的两个数组
// 数据：/saves/{cardId}/{saveId}/info_feed.json
// 分层：B 类 · 数据层 + 存储（VFS）+ AI 发起（tick）
// 两仓逐字节同源：桌面 engine/info_feed.js 与 RN engine/info_feed.js 必须一致
// ============================================================
// 设计依据：D:\AI文游\神秘小引擎测试版\设计稿_剧情外信息层.md（v2 定稿）
// 平台依赖：VFS, GameState, Storage, ToolExecutor, NpcRuntime, Logger,
//           ApiManager, ApiClient, CardDiagnose, Platform, ErrorLog

(function() {
  // ============ 上限与词表（全部集中于此，便于测试）============
  var MAX_THREADS = 12;
  var MAX_MESSAGES_PER_THREAD = 40;
  var MAX_BROADCASTS = 60;
  var MAX_TEXT = 500;
  var MAX_BODY = 800;
  var PROMPT_THREADS = 5;
  var PROMPT_BROADCASTS = 3;
  // P16·C 触达率：原 60 分钟冷却 + 12% 概率 —— 游戏时间 15 分钟/回合时每 4 回合才掷一次骰，
  //   首条讯息要几十回合才来（确定性序列实测第 21 回合才有第一条），20 回合内收不到的概率过半，
  //   玩家会以为「手机」这个功能根本没做。现改为 25 分钟 + 25%。
  var COOLDOWN_MIN = 25;
  var TICK_PROBABILITY = 0.25;
  var MAX_AI_PER_TURN = 1;
  // P16·C 首条触达保证：玩家还没收到过任何信息时，从这一回合起不再掷概率闸
  //   （每回合上限与冷却闸仍先生效，所以不会退化成每回合都发起）。
  var FIRST_CONTACT_ROUND = 3;
  var FLOW = ['info', 'story'];
  var IMPORTANCE = ['background', 'actionable'];
  // 复用 engine/events.js SYNTAX.publicity (:24) / SYNTAX.scope (:38) 的字面值，
  // 不新造枚举、不改 events.js。
  var PUBLICITY = ['暗中', '半公开', '公开', '轰动'];
  var SCOPE = ['当事人', '家庭', '势力', '城市', '世界'];
  var DEFAULT_PUBLICITY = '半公开';
  var DEFAULT_SCOPE = '城市';

  var InfoFeed = {
    _data: null,
    _generation: 0,

    // ============ 路径与结构 ============
    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/info_feed.json';
    },

    _empty: function() {
      return {
        version: 1,
        seq: 0,
        threads: {},
        threadOrder: [],
        broadcasts: [],
        seen: {},
        meta: { lastTickAt: null, lastTickRound: -1, aiSendCount: 0 }
      };
    },

    _emptyMessage: function() {
      return {
        id: '', from: '', fromName: '', to: '', at: '', text: '',
        origin: 'ai', sourceNote: '', read: false,
        flow: 'info', importance: 'background'
      };
    },

    _ensureMessage: function(m) {
      if (!m || typeof m !== 'object') return m;
      if (typeof m.id !== 'string') m.id = '';
      if (typeof m.from !== 'string') m.from = '';
      if (typeof m.fromName !== 'string') m.fromName = m.from;
      if (typeof m.to !== 'string') m.to = '';
      if (typeof m.at !== 'string') m.at = '';
      if (typeof m.text !== 'string') m.text = '';
      if (typeof m.origin !== 'string') m.origin = 'ai';
      if (typeof m.sourceNote !== 'string') m.sourceNote = '';
      if (typeof m.read !== 'boolean') m.read = false;
      if (FLOW.indexOf(m.flow) < 0) m.flow = 'info';
      if (IMPORTANCE.indexOf(m.importance) < 0) m.importance = 'background';
      return m;
    },

    _ensureBroadcast: function(bc) {
      if (!bc || typeof bc !== 'object') return bc;
      if (typeof bc.id !== 'string') bc.id = '';
      if (typeof bc.at !== 'string') bc.at = '';
      if (typeof bc.round !== 'number') bc.round = -1;
      if (typeof bc.title !== 'string') bc.title = '';
      if (typeof bc.body !== 'string') bc.body = '';
      // 旧值不在词表内 ⇒ 替换为默认，不抛错
      if (PUBLICITY.indexOf(bc.publicity) < 0) bc.publicity = DEFAULT_PUBLICITY;
      if (SCOPE.indexOf(bc.scope) < 0) bc.scope = DEFAULT_SCOPE;
      if (typeof bc.source !== 'string') bc.source = '';
      if (typeof bc.sourceName !== 'string') bc.sourceName = '';
      if (!Array.isArray(bc.tags)) bc.tags = [];
      if (typeof bc.eventId === 'undefined') bc.eventId = null;
      if (FLOW.indexOf(bc.flow) < 0) bc.flow = 'info';
      if (IMPORTANCE.indexOf(bc.importance) < 0) bc.importance = 'background';
      if (typeof bc.origin !== 'string') bc.origin = 'ai';
      if (!Array.isArray(bc.propagated)) bc.propagated = [];
      return bc;
    },

    // 迁移/补齐：缺 version/seq/threads/threadOrder/broadcasts/seen/meta 一律补齐。
    // 传参 d 时就地规范化 d，缺省规范化 this._data。
    _ensureShape: function(d) {
      var self = this;
      var target = (d && typeof d === 'object') ? d : this._data;
      if (!target || typeof target !== 'object') {
        if (!d) this._data = this._empty();
        return this._data;
      }
      if (typeof target.version !== 'number') target.version = 1;
      if (typeof target.seq !== 'number') target.seq = 0;
      if (!target.threads || typeof target.threads !== 'object') target.threads = {};
      if (!Array.isArray(target.threadOrder)) target.threadOrder = [];
      if (!Array.isArray(target.broadcasts)) target.broadcasts = [];
      if (!target.seen || typeof target.seen !== 'object') target.seen = {};
      if (!target.meta || typeof target.meta !== 'object') target.meta = {};
      if (typeof target.meta.lastTickAt === 'undefined') target.meta.lastTickAt = null;
      if (typeof target.meta.lastTickRound !== 'number') target.meta.lastTickRound = -1;
      if (typeof target.meta.aiSendCount !== 'number') target.meta.aiSendCount = 0;

      Object.keys(target.threads).forEach(function(k) {
        var th = target.threads[k];
        if (!th || typeof th !== 'object') { delete target.threads[k]; return; }
        if (typeof th.id !== 'string' || !th.id) th.id = k;
        if (typeof th.kind !== 'string') th.kind = 'direct';
        if (typeof th.title !== 'string') th.title = th.id;
        if (!Array.isArray(th.participants)) th.participants = [];
        if (typeof th.unread !== 'number') th.unread = 0;
        if (typeof th.lastAt !== 'string') th.lastAt = '';
        if (!Array.isArray(th.messages)) th.messages = [];
        th.messages.forEach(function(m) { self._ensureMessage(m); });
      });

      // threadOrder 与 threads 键对齐（缺的补、悬空的删）
      var ordered = [];
      target.threadOrder.forEach(function(k) {
        if (target.threads[k] && ordered.indexOf(k) < 0) ordered.push(k);
      });
      Object.keys(target.threads).forEach(function(k) {
        if (ordered.indexOf(k) < 0) ordered.push(k);
      });
      target.threadOrder = ordered;

      target.broadcasts.forEach(function(bc) { self._ensureBroadcast(bc); });
      return target;
    },

    // ============ 读写 ============
    load: function() {
      this._bumpGeneration();
      var p = this._path();
      if (!p) { this._data = this._empty(); return; }
      var d = VFS.readJSON(p);
      this._data = (d && typeof d === 'object') ? d : this._empty();
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
      this._ensureShape();
      this.save();
      this._bumpGeneration();
    },

    clear: function() {
      this._data = this._empty();
      this.save();
      this._bumpGeneration();
    },

    // 通知 AI 层数据已换主（切存档/回滚），在飞 tick 回写时按新代次自行作废
    _bumpGeneration: function() {
      this._generation++;
    },

    // ============ 内部工具 ============
    _uid: function(prefix) {
      if (!this._data) this.load();
      this._ensureShape();
      this._data.seq = (typeof this._data.seq === 'number' ? this._data.seq : 0) + 1;
      return prefix + this._data.seq;
    },

    _now: function() {
      return (typeof GameState !== 'undefined' && GameState.formatGameTime)
        ? GameState.formatGameTime() : '';
    },

    _nowMinutes: function() {
      try {
        var s = (typeof GameState !== 'undefined' && GameState.formatGameTime)
          ? GameState.formatGameTime() : '';
        var m = /^(\d+)-(\d+)-(\d+) (\d+):(\d+)$/.exec(String(s));
        if (!m) return null;
        return ((((+m[1]) * 12 + (+m[2])) * 32 + (+m[3])) * 24 + (+m[4])) * 60 + (+m[5]);
      } catch (e) { return null; }
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    _findNpcDef: function(id) {
      var hit = null;
      try {
        var wb = (GameState.currentCard && GameState.currentCard.worldbook) || {};
        (wb.npcs || []).forEach(function(n) {
          if (!hit && n && (n.id === id || n.name === id)) hit = n;
        });
      } catch (e) {}
      return hit;
    },

    _pruneThreads: function(need) {
      var d = this._data;
      while (Object.keys(d.threads).length + (need || 0) > MAX_THREADS) {
        var oldestKey = null, oldestAt = null;
        Object.keys(d.threads).forEach(function(k) {
          var th = d.threads[k];
          var at = (th && th.lastAt) ? th.lastAt : '';
          if (oldestKey === null || at < oldestAt) { oldestKey = k; oldestAt = at; }
        });
        if (oldestKey === null) break;
        delete d.threads[oldestKey];
      }
      var ordered = [];
      d.threadOrder.forEach(function(k) { if (d.threads[k]) ordered.push(k); });
      d.threadOrder = ordered;
    },

    // ============ 线程 ============
    ensureThread: function(key, opts) {
      if (!this._data) this.load();
      this._ensureShape();
      opts = opts || {};
      var k = String(key || '').trim();
      if (!k) return null;
      if (this._data.threads[k]) return JSON.parse(JSON.stringify(this._data.threads[k]));
      this._pruneThreads(1);
      var th = {
        id: k,
        kind: String(opts.kind || 'direct'),
        title: String(opts.title || k),
        participants: Array.isArray(opts.participants) ? opts.participants.slice() : [],
        unread: 0,
        lastAt: '',
        messages: []
      };
      this._data.threads[k] = th;
      if (this._data.threadOrder.indexOf(k) < 0) this._data.threadOrder.push(k);
      this.save();
      return JSON.parse(JSON.stringify(th));
    },

    // 唯一讯息写入口；超上限裁剪；更新 lastAt/unread
    pushMessage: function(opts) {
      if (!this._data) this.load();
      this._ensureShape();
      opts = opts || {};
      var text = (opts.text != null) ? String(opts.text) : '';
      if (!text) return null;
      if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);

      var from = String(opts.from || '');
      var to = String(opts.to || '');
      var key = opts.threadId ? String(opts.threadId) : this._threadKeyFor(from, to);
      if (!key) return null;

      var title = opts.title;
      if (!title) {
        if (to === 'player') title = String(opts.fromName || from || key.slice(3));
        else if (to.indexOf('group:') === 0) title = '群聊 ' + to.slice(6);
        else { var def = this._findNpcDef(to); title = (def && def.name) ? def.name : (to || key.slice(3)); }
      }
      var participants;
      if (to === 'player') participants = ['player', from];
      else if (to.indexOf('group:') === 0) participants = ['player'];
      else participants = ['player', to];

      this.ensureThread(key, { title: title, participants: participants, kind: (to.indexOf('group:') === 0 ? 'group' : 'direct') });

      var th = this._data.threads[key];
      var at = String(opts.at || this._now());
      var msg = {
        id: this._uid('msg_'),
        from: from,
        fromName: String(opts.fromName || from),
        to: to,
        at: at,
        text: text,
        origin: String(opts.origin || 'ai'),
        sourceNote: String(opts.sourceNote || ''),
        read: false,
        flow: 'info',
        importance: (IMPORTANCE.indexOf(opts.importance) >= 0) ? opts.importance : 'background'
      };
      th.messages.push(msg);
      if (th.messages.length > MAX_MESSAGES_PER_THREAD) {
        th.messages.splice(0, th.messages.length - MAX_MESSAGES_PER_THREAD);
      }
      th.lastAt = at;
      if (from !== 'player') th.unread = (typeof th.unread === 'number' ? th.unread : 0) + 1;
      else th.unread = 0;
      this.save();
      return JSON.parse(JSON.stringify(msg));
    },

    _threadKeyFor: function(from, to) {
      if (to === 'player') {
        if (!from) return null;
        if (from.indexOf('group:') === 0) return 'th_group_' + from.slice(6);
        return 'th_' + from;
      }
      if (to.indexOf('group:') === 0) return 'th_group_' + to.slice(6);
      if (to) return 'th_' + to;
      return null;
    },

    // 把工具 / 空闲发起的 `to` 归一成「线程对端」：对端 → 玩家的收件箱。
    // to='player' ⇒ 未知号码；'group:<id>' ⇒ 群聊线程；否则必须是卡带内 NPC。
    _counterpart: function(to) {
      var t = String(to || '').trim();
      if (!t) return null;
      if (t === 'player') return { from: 'unknown', fromName: '未知号码', key: 'th_unknown' };
      if (t.indexOf('group:') === 0) {
        var gid = t.slice(6);
        return { from: t, fromName: '群聊 ' + gid, key: 'th_group_' + gid };
      }
      var def = this._findNpcDef(t);
      if (!def) return null;
      return { from: t, fromName: (def.name || def.id), key: 'th_' + t };
    },

    // 玩家发送：origin:'player'、read:true、unread=0、flow:'info'
    playerSend: function(threadId, text) {
      if (!this._data) this.load();
      this._ensureShape();
      var key = String(threadId || '');
      if (!key || !this._data.threads[key]) return null;
      var t = String(text || '');
      if (!t) return null;
      if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT);
      var th = this._data.threads[key];
      // 收件人：线程里除玩家外的第一个 participant（对点线程即对方）
      var to = '';
      (th.participants || []).forEach(function(p) { if (!to && p !== 'player') to = p; });
      var at = this._now();
      var msg = {
        id: this._uid('msg_'),
        from: 'player',
        fromName: '你',
        to: to,
        at: at,
        text: t,
        origin: 'player',
        sourceNote: '',
        read: true,
        flow: 'info',
        importance: 'background'
      };
      th.messages.push(msg);
      if (th.messages.length > MAX_MESSAGES_PER_THREAD) {
        th.messages.splice(0, th.messages.length - MAX_MESSAGES_PER_THREAD);
      }
      th.lastAt = at;
      th.unread = 0;
      this.save();
      return JSON.parse(JSON.stringify(msg));
    },

    // 记录 AI/玩家的可执行性判定；不改 flow
    setImportance: function(id, level) {
      if (!this._data) this.load();
      this._ensureShape();
      if (IMPORTANCE.indexOf(level) < 0) return;
      var found = this._findItem(id);
      if (!found) return;
      found.item.importance = level;
      this.save();
    },

    markRead: function(threadId) {
      if (!this._data) this.load();
      this._ensureShape();
      var th = this._data.threads[String(threadId || '')];
      if (!th) return;
      th.unread = 0;
      th.messages.forEach(function(m) { m.read = true; });
      this.save();
    },

    _findItem: function(id) {
      var key = String(id || '');
      if (!key) return null;
      var self = this;
      var hit = null;
      Object.keys(this._data.threads).forEach(function(k) {
        if (hit) return;
        var th = self._data.threads[k];
        (th.messages || []).forEach(function(m) {
          if (!hit && m && m.id === key) hit = { item: m, thread: th, kind: 'message' };
        });
      });
      if (hit) return hit;
      this._data.broadcasts.forEach(function(bc) {
        if (!hit && bc && bc.id === key) hit = { item: bc, thread: null, kind: 'broadcast' };
      });
      return hit;
    },

    // ============ 分流 → 混流（§8）============
    promoteToStory: function(id, opts) {
      if (!this._data) this.load();
      this._ensureShape();
      var found = this._findItem(id);
      if (!found) return { ok: false, reason: '未知条目：' + id };
      if (found.item.flow === 'story') return { ok: false, reason: '已混流' };
      opts = opts || {};
      var by = (opts.by === 'player') ? 'player' : 'ai';
      found.item.flow = 'story';
      if (IMPORTANCE.indexOf(opts.importance) >= 0) found.item.importance = opts.importance;
      // 叙事流追加一条「【手机】…」（桌面 Platform.ui.appendStory / RN 桥接到 story_store）
      var line = this._promoteLine(found);
      this._appendStoryLine(line);
      // 玩家侧：写入 chatHistory 一条 role:'user'（调用方随后触发一次正常回合）
      if (by === 'player') {
        // P9·S13：加「【系统 · 手机混流】」前缀，避免被全仓 6 处「真实玩家输入」
        //   判定（role==='user' && !content.startsWith('【系统 ·')）误判为真实玩家输入，
        //   防止轮次 +1 / 10 轮窗口污染 / 按轮次回退日志错删。两仓同源，须同步改。
        var content = '【系统 · 手机混流】' + (opts.note ? String(opts.note) : ('（跟进手机信息）' + line));
        try { GameState.chatHistory.push({ role: 'user', content: content }); } catch (e) {}
      }
      this.save();
      return { ok: true, id: id, by: by, flow: 'story', line: line };
    },

    _promoteLine: function(found) {
      var it = found.item;
      if (found.kind === 'message') {
        return '【手机】' + (it.fromName || it.from || '') + '：' + String(it.text || '');
      }
      return '【手机·广播】' + String(it.title || '') + '：' + String(it.body || '');
    },

    _appendStoryLine: function(line) {
      try {
        if (typeof Platform !== 'undefined' && Platform.ui && typeof Platform.ui.appendStory === 'function') {
          Platform.ui.appendStory(line, null, 0, null, this._roundCount(), null);
        }
      } catch (e) {}
    },

    // ============ 广播 ============
    publish: function(opts) {
      if (!this._data) this.load();
      this._ensureShape();
      opts = opts || {};
      var title = String(opts.title || '').trim();
      var body = String(opts.body || '');
      if (!title) return null;
      if (!body) return null;
      if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
      var bc = {
        id: this._uid('bc_'),
        at: this._now(),
        round: this._roundCount(),
        title: title,
        body: body,
        publicity: (PUBLICITY.indexOf(opts.publicity) >= 0) ? opts.publicity : DEFAULT_PUBLICITY,
        scope: (SCOPE.indexOf(opts.scope) >= 0) ? opts.scope : DEFAULT_SCOPE,
        source: String(opts.source || ''),
        sourceName: String(opts.sourceName || ''),
        tags: Array.isArray(opts.tags) ? opts.tags.slice() : [],
        eventId: (typeof opts.eventId === 'undefined') ? null : opts.eventId,
        flow: 'info',
        importance: (IMPORTANCE.indexOf(opts.importance) >= 0) ? opts.importance : 'background',
        origin: String(opts.origin || 'ai'),
        propagated: []
      };
      this._data.broadcasts.push(bc);
      if (this._data.broadcasts.length > MAX_BROADCASTS) {
        this._data.broadcasts.splice(0, this._data.broadcasts.length - MAX_BROADCASTS);
      }
      bc.propagated = this._propagate(bc);
      this.save();
      return JSON.parse(JSON.stringify(bc));
    },

    // 公开度 → NPC 知识传播；source 复用 'public'，不新增枚举
    _propagate: function(bc) {
      var ids = [];
      try {
        if (!bc || bc.publicity === '暗中') return ids;
        if (typeof NpcRuntime === 'undefined') return ids;
        var targets = [];
        if (bc.publicity === '轰动') {
          if (typeof NpcRuntime.getFocus === 'function') targets = targets.concat(NpcRuntime.getFocus() || []);
          if (typeof NpcRuntime.getSceneOnly === 'function') targets = targets.concat(NpcRuntime.getSceneOnly() || []);
        } else {
          if (typeof NpcRuntime.getFocus === 'function') targets = NpcRuntime.getFocus() || [];
        }
        var prefix = ((bc.scope === '城市' || bc.scope === '世界') &&
                      (bc.publicity === '公开' || bc.publicity === '轰动')) ? '公开消息：' : '广播：';
        var seen = {};
        targets.forEach(function(def) {
          if (!def || !def.id || seen[def.id]) return;
          seen[def.id] = true;
          var r = NpcRuntime.addKnowledge(def.id, {
            text: prefix + bc.title,
            source: 'public',
            sourceNote: bc.sourceName || ''
          });
          if (r && (r.ok || r.reason === '该知识已存在')) ids.push(def.id);
        });
      } catch (e) {}
      return ids;
    },

    // ============ 视图数据 ============
    listThreads: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var out = this._data.threadOrder.map(function(k) { return self._data.threads[k]; })
        .filter(Boolean)
        .map(function(th) {
          var last = th.messages.length ? th.messages[th.messages.length - 1] : null;
          return {
            id: th.id,
            kind: th.kind,
            title: th.title,
            participants: (th.participants || []).slice(),
            unread: th.unread || 0,
            lastAt: th.lastAt || '',
            count: th.messages.length,
            preview: last ? String(last.text || '').slice(0, 40) : ''
          };
        });
      out.sort(function(a, b) {
        if ((b.unread > 0) !== (a.unread > 0)) return (b.unread > 0) ? 1 : -1;
        return String(b.lastAt).localeCompare(String(a.lastAt));
      });
      return out;
    },

    getThread: function(id) {
      if (!this._data) this.load();
      this._ensureShape();
      var th = this._data.threads[String(id || '')];
      return th ? JSON.parse(JSON.stringify(th)) : null;
    },

    listBroadcasts: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var out = this._data.broadcasts.map(function(bc) { return JSON.parse(JSON.stringify(bc)); });
      out.reverse();
      return out;
    },

    unreadTotal: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var n = 0;
      var self = this;
      Object.keys(this._data.threads).forEach(function(k) {
        var th = self._data.threads[k];
        if (th && typeof th.unread === 'number') n += th.unread;
      });
      return n;
    },

    // ============ 提示词 ============
    formatForPrompt: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var threads = this.listThreads().filter(function(t) { return t.count > 0; });
      var bcs = this.listBroadcasts();
      if (!threads.length && !bcs.length) return null;

      var lines = [];
      lines.push('>>> 【信息层·手机】玩家在剧情外收到的信息');
      threads.slice(0, PROMPT_THREADS).forEach(function(t) {
        var th = self._data.threads[t.id];
        var last = (th && th.messages.length) ? th.messages[th.messages.length - 1] : null;
        if (!last) return;
        var tag = (t.unread > 0) ? ('[讯息 未读' + t.unread + ']') : '[讯息]';
        lines.push('· ' + tag + ' ' + (last.fromName || last.from || '?') + ' → 你 · ' +
          (last.at || '') + ' 「' + String(last.text || '').slice(0, 60) + '」');
      });
      bcs.slice(0, PROMPT_BROADCASTS).forEach(function(bc) {
        lines.push('· [广播 ' + bc.publicity + '/' + bc.scope + '] ' +
          (bc.sourceName || bc.source || '?') + ' · ' + (bc.at || '') +
          ' 「' + String(bc.title || '').slice(0, 40) + '」');
      });
      if (!threads.length) lines.push('· （暂无讯息）');
      if (!bcs.length) lines.push('· （暂无广播）');
      lines.push('（你可用 info_send 发讯息、info_broadcast 发广播；已列出的内容不要重复发送。）');
      lines.push('（分流/混流：默认只写在手机里、不进正文。若某条会改变主角处境、需要他立刻回应、或牵动当前目标/场景，');
      lines.push('  发的时候带 importance:\'actionable\' 作建议；要直接把它写进正文，用 info_promote(id)。');
      lines.push('  玩家也能在手机上点「跟进正文」自己升级 —— 玩家优先。）');
      lines.push('>>> 【信息层结束】');
      return lines.join('\n');
    },

    // ============ 空闲期主动发起（§7）============
    // 玩家是否已经见过信息层的内容（收到过讯息或广播；玩家自己发过的也算见过）。
    _hasAnyInfo: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      if (this._data.broadcasts.length > 0) return true;
      var has = false;
      Object.keys(this._data.threads).forEach(function(k) {
        var th = self._data.threads[k];
        if (th && th.messages && th.messages.length > 0) has = true;
      });
      return has;
    },

    _enabled: function() {
      try {
        if (typeof Storage === 'undefined' || typeof Storage.getGlobal !== 'function') return true;
        var g = Storage.getGlobal() || {};
        var c = g.infoFeed || {};
        return c.enabled !== false;
      } catch (e) { return true; }
    },

    _tickPrompt: function() {
      var card = GameState.currentCard || {};
      var lines = [];
      lines.push('你是剧情外的信息发生器。玩家此刻不在场，请让世界主动对他说点什么。');
      lines.push('');
      lines.push('【规则】');
      lines.push('1. 只输出一个 JSON 对象，不要解释、不要 markdown 代码块。');
      lines.push('2. 格式：{"messages":[{"to":"npc_id 或 player","text":"…"}],"broadcast":{"title":"…","body":"…","publicity":"公开","scope":"城市","sourceName":"市广播"}}');
      lines.push('3. messages 最多 2 条，broadcast 最多 1 条；没有可说的就给空数组 / null。');
      lines.push('4. 讯息正文 ≤500 字；广播正文 ≤800 字。');
      lines.push('5. 只能基于下面给出的信息，不许编造玩家未见过的隐藏设定。');
      lines.push('6. 这些都是"剧情外"的内容：默认只写在玩家的手机里，不进正文。');
      lines.push('');
      lines.push('【卡带】' + (card.name || card.id || '（无）'));
      lines.push('【当前游戏时间】' + (GameState.formatGameTime ? GameState.formatGameTime() : '?'));
      lines.push('');
      lines.push('【在场 NPC】');
      var focus = [], scene = [];
      try {
        if (typeof NpcRuntime !== 'undefined') {
          if (typeof NpcRuntime.getFocus === 'function') focus = NpcRuntime.getFocus() || [];
          if (typeof NpcRuntime.getSceneOnly === 'function') scene = NpcRuntime.getSceneOnly() || [];
        }
      } catch (e) {}
      if (!focus.length && !scene.length) lines.push('（暂无）');
      focus.forEach(function(d) {
        var rt = d._rt || {};
        lines.push('· ' + (d.name || d.id) + '（id:' + d.id + '）' +
          (rt.mood ? ' 情绪:' + rt.mood : '') +
          (rt.playerRelation != null ? ' 关系:' + rt.playerRelation : ''));
      });
      scene.forEach(function(d) { lines.push('· ' + (d.name || d.id) + '（id:' + d.id + '，现场但不在镜头）'); });
      lines.push('');
      lines.push('【最近发生的事】');
      var logs = [];
      try {
        if (typeof Logger !== 'undefined' && Logger.getRecentSummaries &&
            GameState.currentCardId && GameState.currentSaveId) {
          logs = Logger.getRecentSummaries(GameState.currentCardId, GameState.currentSaveId, 3) || [];
        }
      } catch (e) {}
      if (!logs.length) lines.push('（暂无日志）');
      logs.forEach(function(s) {
        lines.push('[' + (s.date || '?') + '] ' + (s.title || '') + '：' + String(s.summary || '').slice(0, 160));
      });
      lines.push('');
      lines.push('【已发出的广播标题】');
      var titles = this.listBroadcasts().slice(0, 10).map(function(b) { return b.title; });
      lines.push(titles.length ? ('· ' + titles.join('、')) : '（暂无）');
      lines.push('');
      lines.push('现在输出 JSON。');
      return lines.join('\n');
    },

    _parseTick: function(content) {
      if (!content) return null;
      var s = String(content).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var start = s.indexOf('{');
      var end = s.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      s = s.slice(start, end + 1);
      var parsed = null;
      try { parsed = JSON.parse(s); } catch (e) {
        if (typeof CardDiagnose !== 'undefined' && CardDiagnose.fixJSONText) {
          try { parsed = JSON.parse(CardDiagnose.fixJSONText(s).result); } catch (e2) { return null; }
        } else return null;
      }
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    },

    _log: function(msg) {
      try {
        if (typeof ErrorLog !== 'undefined' && ErrorLog.action) ErrorLog.action('INFO', msg);
      } catch (e) {}
    },

    // 空闲期 AI 主动发起；失败静默（只记 ErrorLog），无 key / 网络错 / JSON 坏一律直接 return
    tick: async function(ctx) {
      ctx = ctx || {};
      var self = this;
      try {
        if (!this._data) this.load();
        this._ensureShape();
        if (!this._enabled()) return;

        var round = (typeof ctx.round === 'number') ? ctx.round : this._roundCount();
        // 每回合上限：本轮已发起过就不再发起
        if (this._data.meta.lastTickRound === round && MAX_AI_PER_TURN <= 1) return;

        var now = this._nowMinutes();
        if (now == null) return;
        var last = this._data.meta.lastTickAt;
        if (typeof last === 'number' && (now - last) < COOLDOWN_MIN) return;

        // P16·C 首条触达保证：还没收到过任何信息时，到 FIRST_CONTACT_ROUND 起不再掷概率闸。
        var firstContact = !this._hasAnyInfo() && round >= FIRST_CONTACT_ROUND;
        if (!firstContact && Math.random() >= TICK_PROBABILITY) return;
        if (typeof ApiManager === 'undefined' || typeof ApiClient === 'undefined') return;
        var profile = (typeof ApiManager.getActive === 'function') ? ApiManager.getActive() : null;
        if (!profile) return;

        var gen = this._generation;
        var prompt = this._tickPrompt();
        var opts = { max_tokens: 600, temperature: 0.8 };
        if (profile.id) opts.profileId = profile.id;
        var content = await ApiClient.chat([{ role: 'user', content: prompt }], opts);

        // 等待期间可能切档/回滚
        if (self._generation !== gen) return;

        var parsed = this._parseTick(content);
        if (!parsed) { this._log('空闲发起：AI 输出无法解析，整批丢弃'); return; }

        // 整批校验：任一不过 ⇒ 整批丢弃
        var batch = this._validateTickBatch(parsed);
        if (!batch) { this._log('空闲发起：批量校验未通过，整批丢弃'); return; }

        // 落库：产物一律 flow:'info'，importance 最多 actionable
        batch.messages.forEach(function(m) {
          var cp = self._counterpart(m.to);
          if (!cp) return;
          self.pushMessage({
            from: cp.from,
            fromName: cp.fromName,
            to: 'player',
            text: m.text,
            origin: 'ai',
            importance: m.importance || 'actionable',
            threadId: cp.key,
            title: cp.fromName
          });
        });
        if (batch.broadcast) {
          this.publish({
            title: batch.broadcast.title,
            body: batch.broadcast.body,
            publicity: batch.broadcast.publicity,
            scope: batch.broadcast.scope,
            sourceName: batch.broadcast.sourceName || '',
            origin: 'ai',
            importance: 'background'
          });
        }
        this._data.meta.lastTickAt = now;
        this._data.meta.lastTickRound = round;
        this._data.meta.aiSendCount = (this._data.meta.aiSendCount || 0) + batch.messages.length + (batch.broadcast ? 1 : 0);
        this.save();
      } catch (e) {
        this._log('空闲发起失败：' + (e && e.message ? e.message : String(e)));
      }
    },

    _validateTickBatch: function(parsed) {
      var out = { messages: [], broadcast: null };
      var msgs = Array.isArray(parsed.messages) ? parsed.messages : [];
      for (var i = 0; i < msgs.length && out.messages.length < 2; i++) {
        var m = msgs[i];
        if (!m || typeof m !== 'object') return null;
        var to = String(m.to || '').trim();
        var text = (m.text != null) ? String(m.text) : '';
        if (!to || !text) return null;
        if (to !== 'player') {
          if (to.indexOf('group:') !== 0 && !this._findNpcDef(to)) return null;
        }
        if (text.length > MAX_TEXT) return null;
        var imp = (IMPORTANCE.indexOf(m.importance) >= 0) ? m.importance : 'actionable';
        out.messages.push({ to: to, text: text, importance: imp });
      }
      var bc = parsed.broadcast;
      if (bc && typeof bc === 'object' && (bc.title || bc.body)) {
        var title = String(bc.title || '').trim();
        var body = String(bc.body || '');
        if (!title || !body) return null;
        if (body.length > MAX_BODY) return null;
        if (PUBLICITY.indexOf(bc.publicity) < 0) return null;
        if (SCOPE.indexOf(bc.scope) < 0) return null;
        out.broadcast = {
          title: title,
          body: body,
          publicity: bc.publicity,
          scope: bc.scope,
          sourceName: String(bc.sourceName || '')
        };
      }
      return out;
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'InfoFeed 工具注册失败：ToolExecutor 未就绪');
      }
      return;
    }
    var D = InfoFeed;

    // ---- info_send ----
    ToolExecutor.WHITELIST.info_send = {
      run: function(a) {
        a = a || {};
        var to = String(a.to || '').trim();
        var text = (a.text != null) ? String(a.text) : '';
        if (!to) return { ok: false, reason: '缺少 to' };
        if (!text) return { ok: false, reason: '缺少 text' };
        if (text.length > MAX_TEXT) return { ok: false, reason: '正文过长' };
        var cp = D._counterpart(to);
        if (!cp) return { ok: false, reason: '未知收件人：' + to };
        var thKey = a.threadId || cp.key;
        var msg = D.pushMessage({
          from: cp.from,
          fromName: cp.fromName,
          to: 'player',
          text: text,
          origin: 'ai',
          sourceNote: a.sourceNote || '',
          importance: a.importance,
          threadId: thKey,
          title: cp.fromName
        });
        if (!msg) return { ok: false, reason: '写入失败' };
        return {
          ok: true,
          type: 'info',
          action: 'send',
          threadId: thKey,
          messageId: msg.id,
          at: msg.at,
          unread: D.unreadTotal(),
          // 回显字段（tool_executor.formatForHistory 的「讯息」分支用；不加这些字段回显只剩空串）
          to: to,
          toName: cp.fromName,
          text: text.slice(0, 40)
        };
      }
    };

    // ---- info_broadcast ----
    ToolExecutor.WHITELIST.info_broadcast = {
      run: function(a) {
        a = a || {};
        var title = String(a.title || '').trim();
        var body = (a.body != null) ? String(a.body) : '';
        if (!title) return { ok: false, reason: '缺少 title' };
        if (!body) return { ok: false, reason: '缺少 body' };
        if (body.length > MAX_BODY) return { ok: false, reason: '正文过长' };
        if (typeof a.publicity !== 'undefined' && PUBLICITY.indexOf(a.publicity) < 0) {
          return { ok: false, reason: '非法 publicity：' + a.publicity };
        }
        if (typeof a.scope !== 'undefined' && SCOPE.indexOf(a.scope) < 0) {
          return { ok: false, reason: '非法 scope：' + a.scope };
        }
        var bc = D.publish({
          title: title,
          body: body,
          publicity: a.publicity,
          scope: a.scope,
          source: a.source,
          sourceName: a.sourceName,
          tags: a.tags,
          eventId: a.eventId,
          importance: a.importance,
          origin: 'ai'
        });
        if (!bc) return { ok: false, reason: '写入失败' };
        return {
          ok: true,
          type: 'info',
          action: 'broadcast',
          id: bc.id,
          at: bc.at,
          propagated: bc.propagated,
          // 回显字段（tool_executor.formatForHistory 的「广播」分支用）
          title: title
        };
      }
    };

    // ---- info_read ----
    // P10·B5：提示词声明的是 info_read(kind, limit)，旧实现只读 limit，kind 被忽略。
    //   现按声明实现 kind 过滤：'thread' 只回讯息线程 / 'broadcast' 只回广播 /
    //   其余（缺省）两者都回（向后兼容）。返回体带 kind 供 AI 确认口径。
    ToolExecutor.WHITELIST.info_read = {
      run: function(a) {
        a = a || {};
        var limit = (typeof a.limit === 'number' && a.limit > 0) ? a.limit : 20;
        var kind = String(a.kind || '').trim();
        var wantThread = (kind !== 'broadcast');
        var wantBroadcast = (kind !== 'thread');
        var threads = wantThread ? D.listThreads().slice(0, limit).map(function(t) {
          return { id: t.id, title: t.title, lastAt: t.lastAt, unread: t.unread, preview: t.preview };
        }) : [];
        var broadcasts = wantBroadcast ? D.listBroadcasts().slice(0, limit).map(function(b) {
          return { id: b.id, at: b.at, title: b.title, publicity: b.publicity, scope: b.scope };
        }) : [];
        return {
          ok: true,
          type: 'query',
          queryType: 'info',
          data: { kind: kind || 'all', unread: D.unreadTotal(), threads: threads, broadcasts: broadcasts }
        };
      }
    };

    // ---- info_promote ----
    ToolExecutor.WHITELIST.info_promote = {
      run: function(a) {
        a = a || {};
        var id = String(a.id || '').trim();
        if (!id) return { ok: false, reason: '缺少 id' };
        var r = D.promoteToStory(id, { by: 'ai', note: a.note });
        if (!r.ok) return r;
        return { ok: true, type: 'info', action: 'promote', id: r.id, line: r.line };
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
  if (typeof window !== 'undefined') window.InfoFeed = InfoFeed;
  if (typeof module !== 'undefined' && module.exports) module.exports = InfoFeed;
})();
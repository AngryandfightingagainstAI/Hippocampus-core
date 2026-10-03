// ============================================================
// NPC 运行时系统
// v3：三层舞台重写
//   - 镜头（focus）：≤3，AI 正在写的
//   - 现场舞台（scene）：无限，AI 知道在场的
//   - 背景（offstage）：不在场的
//   - 跟随（follow）：换场景时决定去留
//   - 伪装（disguise）：卡带预埋的隐藏身份，可揭示
// 数据：/saves/{cardId}/{saveId}/npc_runtime.json
// ============================================================

(function() {
  // ===== 常量 =====
  var MAX_FOCUS          = 3;    // 镜头上限
  var MAX_SCENE_WEIGHT   = 20;   // 场景权重上限
  var KEYWORD_LOOKBACK   = 4;    // 关键词扫描最近 N 轮
  var FOCUS_STALE_ROUNDS = 3;    // 镜头 NPC 连续 N 轮没被 AI 碰过 → 自动退回
  var ROLL_CHANCE        = 0.4;  // 每轮尝试自动补位镜头的概率
  var MAX_SCENE_SIZE     = 20;   // 现场舞台最多容纳多少 NPC（防爆）
  var MAX_KNOWLEDGE      = 20;   // NPC 知识条目上限（FIFO，超了丢最旧）
  // P11·S6：补 rumor（听说）/ misconception（误解）两类 —— 与原 witness/told/public/deduced
  //   区分开；两者同样走 source 白名单校验（npc_knows / 存档归一化 / 合并默认值）。
  var KNOWLEDGE_SOURCES  = ['witness', 'told', 'rumor', 'public', 'deduced', 'misconception', 'manual', 'legacy'];
  // P14·S3：来源 → 中文（与 engine/ui_npc.js / rn/npc_actions_rn.js 的映射同口径）。
  //   搬到内核是为了让 _knowledgeTag 自洽——UI 层没加载时也能出中文标签，
  //   否则提示词里会混进 told / deduced 这类英文枚举。
  var KNOWLEDGE_SRC_CN   = {
    witness: '目击', told: '转述', rumor: '传闻', public: '公开',
    deduced: '推演', misconception: '误信', manual: '手动', legacy: '旧记录'
  };
  var NPC_KNOWLEDGE_VERBS = ['得知', '听说', '了解到', '意识到', '发现', '明白了', '知晓', '获知'];
  var NPC_TELL_VERBS      = ['告诉', '告知', '透露', '通知', '提醒', '警告'];
  // P14·S3：「听别人说的」语气识别（applyUpdate 的保守降级 / 读档加固共用）
  var KNOWLEDGE_HEARSAY_RE = /玩家(自称|声称|说|告诉|讲)|自称|据说|听说|转述/;

  var NpcRuntime = {
    _data: null,

    // ============ 存储路径 ============
    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/npc_runtime.json';
    },

    _emptyData: function() {
      return {
        sceneLocationId: '',   // 玩家当前所在地点（用于换场景判定）
        focus: [],             // 镜头名单（数组，顺序 = 上镜顺序）
        scene: [],             // 现场舞台名单（数组）
        npcs: {},              // 每个 NPC 的运行时状态
        lastTickRound: -1
      };
    },

    // ============ 数据形状兼容 ============
    // 兼容三种历史结构：
    //   1) { npcs: { id: {...} } }               → v1
    //   2) { npcs: { id: { status: 'onstage' }}} → v2（三态）
    //   3) { sceneLocationId, focus, scene, ... }→ v3（本版）
    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = this._emptyData();
        return;
      }
      var d = this._data;
      var looksV3 = ('focus' in d) || ('scene' in d) || ('sceneLocationId' in d);
      if (looksV3) {
        // 补缺字段
        if (!Array.isArray(d.focus)) d.focus = [];
        if (!Array.isArray(d.scene)) d.scene = [];
        if (typeof d.sceneLocationId !== 'string') d.sceneLocationId = '';
        if (!d.npcs || typeof d.npcs !== 'object') d.npcs = {};
        if (d.lastTickRound == null) d.lastTickRound = -1;
        this._normalizeAllKnowledge(true);
        return;
      }
      // 从 v1 / v2 迁移
      var old = d.npcs && typeof d.npcs === 'object' ? d.npcs : d;
      var migrated = this._emptyData();
      Object.keys(old).forEach(function(k) {
        var v = old[k];
        if (!v || typeof v !== 'object') return;
        if (v.status === 'onstage') migrated.focus.push(k);
        else if (v.status === 'dormant') migrated.scene.push(k);
        // offstage 的不进任何名单，只保留在 npcs 里
        migrated.npcs[k] = v;
        delete migrated.npcs[k].status;   // status 是计算字段，不存储
      });
      // 镜头名单超限 → 按 lastSeenRound 取最新的 3 个
      if (migrated.focus.length > MAX_FOCUS) {
        migrated.focus.sort(function(a, b) {
          var ra = (migrated.npcs[a] && migrated.npcs[a].lastSeenRound) || 0;
          var rb = (migrated.npcs[b] && migrated.npcs[b].lastSeenRound) || 0;
          return rb - ra;
        });
        var keep = migrated.focus.slice(0, MAX_FOCUS);
        var drop = migrated.focus.slice(MAX_FOCUS);
        migrated.focus = keep;
        drop.forEach(function(id) {
          if (migrated.scene.indexOf(id) < 0) migrated.scene.push(id);
        });
      }
      migrated.lastTickRound = d.lastTickRound != null ? d.lastTickRound : -1;
      this._data = migrated;
      this._normalizeAllKnowledge(true);
    },

    // ============ NPC 知识（knownFacts）============
    // 条目结构：{ text, acquiredAt(游戏内时间字符串), source, sourceNote, origin, unverified }
    // sourceNote：来源备注（自由文本）；origin：来源主体（'player' 表示玩家本人所述，其余为空串）；
    // unverified：true 表示「只是有人这么说、引擎未确认」（P14 Claim/Fact 隔离）。旧档无此两字段时按空串/false 处理，语义不变。
    // source ∈ witness / told / rumor / public / deduced / misconception / manual / legacy
    // 把 string 或对象统一成知识条目；非法/空文本返回 null
    _normKnowledgeItem: function(item) {
      if (item == null) return null;
      if (typeof item === 'string' || typeof item === 'number') {
        var text0 = String(item).trim();
        if (!text0) return null;
        return { text: text0, acquiredAt: '', source: 'legacy', sourceNote: '', origin: '', unverified: false };
      }
      if (typeof item !== 'object') return null;
      var text = (item.text != null) ? String(item.text).trim() : '';
      if (!text) return null;
      var source = (KNOWLEDGE_SOURCES.indexOf(item.source) >= 0) ? item.source : 'legacy';
      return {
        text: text,
        acquiredAt: typeof item.acquiredAt === 'string' ? item.acquiredAt : '',
        source: source,
        sourceNote: typeof item.sourceNote === 'string' ? item.sourceNote : '',
        origin: typeof item.origin === 'string' ? item.origin : '',
        unverified: item.unverified === true
      };
    },

    // P14·S3：给一条知识生成人类可读的可信度标签
    //   已确认 → [时间·来源]；未确认（玩家自称/听说）→ [时间·来源·未确认]
    //   来源主体是玩家本人时额外标「玩家自称」，避免 UI 里和引擎确认过的知识混为一谈。
    _knowledgeTag: function(raw) {
      var f = this._normKnowledgeItem(raw);
      if (!f) return "";
      var srcCn = (typeof KNOWLEDGE_SRC_CN !== 'undefined' && KNOWLEDGE_SRC_CN[f.source])
        ? KNOWLEDGE_SRC_CN[f.source] : f.source;
      var parts = [];
      if (f.acquiredAt) parts.push(f.acquiredAt);
      parts.push(srcCn);
      if (f.unverified === true) parts.push('未确认');
      var head = "[" + parts.join("·") + "]";
      if (f.origin === 'player') head += '（玩家自称）';
      else if (/^npc:/.test(f.origin)) head += '（转述自' + f.origin.slice(4) + '）';
      if (f.sourceNote) head += f.sourceNote;
      return head;
    },

    // 遍历全部 NPC，把 knownFacts 归一为对象数组（旧字符串 → legacy 条目）
    _normalizeAllKnowledge: function(conservative) {
      if (!this._data || !this._data.npcs || typeof this._data.npcs !== 'object') return;
      var self = this;
      Object.keys(this._data.npcs).forEach(function(id) {
        var rt = self._data.npcs[id];
        if (!rt || typeof rt !== 'object') return;
        if (!Array.isArray(rt.knownFacts)) { rt.knownFacts = []; return; }
        var norm = [];
        rt.knownFacts.forEach(function(raw) {
          var it = self._normKnowledgeItem(raw);
          // P14·S3 加固：P11 之前 addKnowledge 对非法 source 会静默降级为 deduced，
          //   旧档里「玩家告诉他的事」可能已经被洗成高可信度。按文本语气保守标回未确认
          //   （只降不删——设计稿第五节：「NPC 曾经相信过玩家的谎话」也是世界史）。
          if (conservative && it && it.unverified !== true && it.source === 'deduced' &&
              typeof KNOWLEDGE_HEARSAY_RE !== 'undefined' && KNOWLEDGE_HEARSAY_RE.test(it.text)) {
            it.source = 'told';
            it.unverified = true;
            if (!it.origin) it.origin = 'player';
          }
          if (it) norm.push(it);
        });
        if (norm.length > MAX_KNOWLEDGE) norm = norm.slice(norm.length - MAX_KNOWLEDGE);
        rt.knownFacts = norm;
      });
    },

    // 按 text 去重合并：旧条目（含 acquiredAt/source）原样保留；
    // incoming 中的新条目写当前游戏时间 + defaultSource；超过上限丢最旧
    _mergeKnowledge: function(existing, incoming, defaultSource) {
      var self = this;
      var out = [];
      var seen = {};
      function pushItem(it) {
        if (!it || seen[it.text]) return;
        seen[it.text] = true;
        out.push(it);
      }
      (Array.isArray(existing) ? existing : []).forEach(function(raw) {
        pushItem(self._normKnowledgeItem(raw));
      });
      var src = (KNOWLEDGE_SOURCES.indexOf(defaultSource) >= 0) ? defaultSource : 'deduced';
      var now = (typeof GameState !== 'undefined' && GameState.formatGameTime)
        ? GameState.formatGameTime() : '';
      (Array.isArray(incoming) ? incoming : []).forEach(function(raw) {
        var it = self._normKnowledgeItem(raw);
        if (!it || seen[it.text]) return;   // 与旧条目或本批前面条目同 text → 保留旧的
        it.acquiredAt = now;
        it.source = src;
        // P14·S3：未确认的声称不因 defaultSource 被洗成高可信来源（conservative：只降不升）
        if (it.unverified === true) it.source = 'told';
        pushItem(it);
      });
      if (out.length > MAX_KNOWLEDGE) out = out.slice(out.length - MAX_KNOWLEDGE);
      return out;
    },

    // AI / 工具登记一条 NPC 知识（acquiredAt 只由引擎写，入参不接受该字段）
    addKnowledge: function(npcId, opts) {
      if (!this._data) this.load();
      this._ensureShape();
      opts = opts || {};
      // P14·S3：origin（来源主体）/ unverified（引擎未确认）——都是可选字段，缺省保持旧语义
      var origin = (typeof opts.origin === 'string') ? opts.origin : '';
      var unverifiedExplicit = (typeof opts.unverified === 'boolean');
      var unverified = opts.unverified === true;
      // 保守缺省：调用方没显式标时按 source 判——told / rumor / misconception 天生就是
      //   「有人这么说、引擎没确认」。显式传 false 仍尊重调用方（例如后来被证实）。
      var srcGuess = (KNOWLEDGE_SOURCES.indexOf(opts.source) >= 0) ? opts.source : '';
      if (!unverifiedExplicit && !unverified &&
          (srcGuess === 'told' || srcGuess === 'rumor' || srcGuess === 'misconception')) unverified = true;
      var text = (opts.text != null) ? String(opts.text).trim() : '';
      if (!text) return { ok: false, reason: '缺少 text' };
      var def = this._findDef(npcId);
      if (!def) return { ok: false, reason: 'NPC 不存在' };
      var rt = this._ensure(def.id);
      if (!rt) return { ok: false, reason: '初始化失败' };
      for (var i = 0; i < rt.knownFacts.length; i++) {
        if (rt.knownFacts[i] && rt.knownFacts[i].text === text) {
          return { ok: false, reason: '该知识已存在' };
        }
      }
      var source = (KNOWLEDGE_SOURCES.indexOf(opts.source) >= 0) ? opts.source : 'deduced';
      var item = {
        text: text,
        acquiredAt: GameState.formatGameTime(),
        source: source,
        sourceNote: typeof opts.sourceNote === 'string' ? opts.sourceNote : '',
        origin: origin,
        unverified: unverified
      };
      rt.knownFacts.push(item);
      if (rt.knownFacts.length > MAX_KNOWLEDGE) {
        rt.knownFacts = rt.knownFacts.slice(rt.knownFacts.length - MAX_KNOWLEDGE);
      }
      this.save();
      return {
        ok: true,
        id: def.id,
        text: item.text,
        acquiredAt: item.acquiredAt,
        source: item.source,
        origin: item.origin,
        unverified: item.unverified
      };
    },

    // 后置校验（批 2）：AI 正文提到 NPC 可能获得新知识，但本轮没调 npc_knows。
    // 宽匹配，宁漏勿错；返回 [{ npcId, npcName, signal }]。
    checkMissingKnowledge: function(text, toolResults) {
      var hits = [];
      var defs = this._listDefs();
      if (!defs.length) return hits;
      var t = String(text || '');
      if (!t) return hits;

      // 本轮已成功登记的 NPC 集合
      var registered = {};
      (Array.isArray(toolResults) ? toolResults : []).forEach(function(r) {
        if (r && r.ok && r.type === 'npc_knowledge' && r.npcId) {
          registered[r.npcId] = true;
        }
      });

      defs.forEach(function(npc) {
        if (!npc || !npc.id || !npc.name) return;
        if (registered[npc.id]) return;
        var name = String(npc.name);
        if (!name) return;
        var signal = null;
        // 模式 A：NPC 名 + 获得性动词（"张三得知…"）
        for (var i = 0; i < NPC_KNOWLEDGE_VERBS.length; i++) {
          if (t.indexOf(name + NPC_KNOWLEDGE_VERBS[i]) >= 0) {
            signal = name + NPC_KNOWLEDGE_VERBS[i];
            break;
          }
        }
        // 模式 B：转述动词 + NPC 名（"李四告诉张三…"）
        if (!signal) {
          for (var j = 0; j < NPC_TELL_VERBS.length; j++) {
            if (t.indexOf(NPC_TELL_VERBS[j] + name) >= 0) {
              signal = NPC_TELL_VERBS[j] + name;
              break;
            }
          }
        }
        if (signal) hits.push({ npcId: npc.id, npcName: name, signal: signal });
      });

      return hits;
    },

    // ============ 生命周期 ============
    load: function() {
      var p = this._path();
      if (!p) { this._data = this._emptyData(); return; }
      var raw = VFS.readJSON(p);
      this._data = (raw && typeof raw === 'object') ? raw : this._emptyData();
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

    // ============ 卡带定义 ============
    _listDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.npcs || [];
    },

    _findDef: function(npcId) {
      if (!npcId) return null;
      var defs = this._listDefs();
      var found = null;
      defs.forEach(function(n) {
        if (!found && (n.id === npcId || n.name === npcId)) found = n;
      });
      return found;
    },

    _resolveId: function(npcId) {
      if (!npcId) return null;
      if (this._data && this._data.npcs && this._data.npcs[npcId]) return npcId;
      var def = this._findDef(npcId);
      return def ? def.id : npcId;
    },

    // 计算 NPC 当前 status（供 UI 沿用旧逻辑读取 rt.status）
    _computeStatus: function(id) {
      if (!this._data) return 'offstage';
      if (this._data.focus.indexOf(id) >= 0) return 'onstage';
      if (this._data.scene.indexOf(id) >= 0) return 'dormant';
      return 'offstage';
    },

    // 给 rt 挂上 computed status
    _attachStatus: function(rt, id) {
      if (!rt) return rt;
      rt.status = this._computeStatus(id);
      return rt;
    },

    // ============ 运行时初始化 ============
    _ensure: function(npcId) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return null;

      if (!this._data.npcs[id]) {
        var def0 = this._findDef(id);
        this._data.npcs[id] = {
          // 舞台
          follow: false,
          sceneWeight: 1,
          lastSeenRound: 0,
          lastTouchedRound: 0,
          enteredAt: '',
          leftAt: '',
          // 状态
          alive: true,
          mood: '',
          locationId: '',
          playerRelation: '',
          knownFacts: [],
          recentEvents: [],
          keywords: (def0 && Array.isArray(def0.keywords)) ? def0.keywords.slice() : [],
          // 伪装
          revealed: true,          // 默认没伪装 = 已揭示
          disguised: !!(def0 && def0.disguise),
          revealHint: (def0 && def0.revealHint) || ''
        };
      }
      var rt = this._data.npcs[id];

      // 字段补全
      if (rt.follow == null) rt.follow = false;
      if (rt.sceneWeight == null) rt.sceneWeight = 1;
      if (rt.alive == null) rt.alive = true;
      if (!Array.isArray(rt.knownFacts)) rt.knownFacts = [];
      if (!Array.isArray(rt.recentEvents)) rt.recentEvents = [];
      if (!Array.isArray(rt.keywords)) rt.keywords = [];
      if (rt.lastSeenRound == null) rt.lastSeenRound = 0;
      if (rt.lastTouchedRound == null) rt.lastTouchedRound = 0;
      if (rt.revealed == null) rt.revealed = true;

      // 卡带新增关键词 → 运行时同步（只加不删）
      var def = this._findDef(id);
      if (def) {
        if (def.disguise && rt.revealed == null) {
          rt.disguised = true;
          rt.revealed = false;
        }
        if (Array.isArray(def.keywords)) {
          def.keywords.forEach(function(k) {
            if (k && rt.keywords.indexOf(k) < 0) rt.keywords.push(k);
          });
        }
      }
      this._attachStatus(rt, id);
      return rt;
    },

    // ============ 查询 ============
    get: function(npcId) {
      if (!npcId) return null;
      return this._ensure(npcId);
    },

    getAll: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },

    // 镜头名单（返回 defs + _rt）
    getFocus: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      return this._data.focus.map(function(id) {
        var def = self._findDef(id);
        if (!def) return null;
        var rt = self._ensure(id);
        var copy = JSON.parse(JSON.stringify(def));
        copy._rt = rt;
        return copy;
      }).filter(Boolean);
    },

    // 现场舞台名单（含镜头内）
    getScene: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      return this._data.scene.map(function(id) {
        var def = self._findDef(id);
        if (!def) return null;
        var rt = self._ensure(id);
        var copy = JSON.parse(JSON.stringify(def));
        copy._rt = rt;
        return copy;
      }).filter(Boolean);
    },

    // 现场舞台但不在镜头里的（旧的"休眠"概念）
    getSceneOnly: function() {
      var self = this;
      return this.getScene().filter(function(def) {
        return self._data.focus.indexOf(def.id) < 0;
      });
    },

    // 兼容旧 API：getOnstage 映射到 focus
    getOnstage: function() { return this.getFocus(); },

    // 兼容旧 API：getDormant 映射到"现场但不在镜头"的 NPC
    getDormant: function() { return this.getSceneOnly(); },

    // 兼容旧 API：getFollowed 返回跟随名单
    getFollowed: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var defs = this._listDefs();
      var out = [];
      defs.forEach(function(def) {
        if (!def.id) return;
        var rt = self._data.npcs[def.id];
        if (rt && rt.follow && rt.alive !== false) {
          var copy = JSON.parse(JSON.stringify(def));
          copy._rt = rt;
          out.push(copy);
        }
      });
      return out;
    },

    // ============ 舞台操作 ============
    // 进镜头（自动补进 scene）
    focusNpc: function(npcId) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return { ok: false, reason: 'NPC 不存在：' + npcId };
      var rt = this._ensure(id);
      if (!rt) return { ok: false, reason: '初始化失败' };
      if (rt.alive === false) return { ok: false, reason: '该 NPC 已死亡' };

      if (this._data.focus.indexOf(id) >= 0) {
        return { ok: false, reason: 'NPC 已在镜头内' };
      }
      if (this._data.focus.length >= MAX_FOCUS) {
        return { ok: false, reason: '镜头已满（上限 ' + MAX_FOCUS + '），请先 npc_unfocus 一位' };
      }
      // 从背景进镜头 → 先确保它在 scene 里
      if (this._data.scene.indexOf(id) < 0) {
        this._data.scene.push(id);
      }
      this._data.focus.push(id);
      rt.enteredAt = GameState.formatGameTime();
      rt.sceneWeight = 0;   // 上镜清零，让机会给别人
      rt.lastSeenRound = this._roundCount();
      rt.lastTouchedRound = this._roundCount();
      this._attachStatus(rt, id);
      this.save();
      return { ok: true, id: id, name: (this._findDef(id) || {}).name || id };
    },

    // 出镜头（回现场舞台，不踢出场景）
    unfocusNpc: function(npcId) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return { ok: false, reason: 'NPC 不存在：' + npcId };
      var rt = this._ensure(id);
      if (!rt) return { ok: false, reason: '初始化失败' };
      if (this._data.focus.indexOf(id) < 0) {
        return { ok: false, reason: 'NPC 不在镜头内' };
      }
      this._data.focus = this._data.focus.filter(function(x) { return x !== id; });
      if (this._data.scene.indexOf(id) < 0) this._data.scene.push(id);
      rt.leftAt = GameState.formatGameTime();
      if (rt.sceneWeight < 1) rt.sceneWeight = 1;
      rt.lastTouchedRound = this._roundCount();
      this._attachStatus(rt, id);
      this.save();
      return { ok: true, id: id };
    },

    // 加入现场舞台
    sceneEnter: function(npcId) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return { ok: false, reason: 'NPC 不存在：' + npcId };
      var rt = this._ensure(id);
      if (!rt) return { ok: false, reason: '初始化失败' };
      if (rt.alive === false) return { ok: false, reason: '该 NPC 已死亡' };
      if (this._data.scene.indexOf(id) >= 0) {
        return { ok: false, reason: 'NPC 已在现场舞台上' };
      }
      if (this._data.scene.length >= MAX_SCENE_SIZE) {
        return { ok: false, reason: '现场舞台已满（上限 ' + MAX_SCENE_SIZE + ' 人）' };
      }
      this._data.scene.push(id);
      rt.lastTouchedRound = this._roundCount();
      this._attachStatus(rt, id);
      this.save();
      return { ok: true, id: id };
    },

    // 离开现场舞台（回背景）
    sceneLeave: function(npcId) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return { ok: false, reason: 'NPC 不存在：' + npcId };
      var rt = this._ensure(id);
      if (!rt) return { ok: false, reason: '初始化失败' };

      // 从 scene 和 focus 都移除
      this._data.scene = this._data.scene.filter(function(x) { return x !== id; });
      this._data.focus = this._data.focus.filter(function(x) { return x !== id; });

      rt.leftAt = GameState.formatGameTime();
      if (rt.sceneWeight < 1) rt.sceneWeight = 1;
      rt.lastTouchedRound = this._roundCount();
      this._attachStatus(rt, id);
      this.save();
      return { ok: true, id: id };
    },

    // ============ 跟随操作 ============
    setFollow: function(npcId, follow) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return { ok: false, reason: 'NPC 不存在：' + npcId };
      var rt = this._ensure(id);
      if (!rt) return { ok: false, reason: '初始化失败' };
      rt.follow = !!follow;
      rt.lastTouchedRound = this._roundCount();
      this.save();
      return { ok: true, id: id, follow: rt.follow };
    },

    // ============ 换场景 ============
    // 玩家移动地点时由外部调用（story.js 里在检测到 locationId 变化后触发）
    onLocationChange: function(newLocationId) {
      if (!this._data) this.load();
      this._ensureShape();
      var oldLoc = this._data.sceneLocationId;
      if (oldLoc === newLocationId) return { ok: true, changed: false };

      var self = this;
      var defs = this._listDefs();

      // 1. 处理当前 focus
      var oldFocus = this._data.focus.slice();
      var newFocus = [];
      oldFocus.forEach(function(id) {
        var rt = self._data.npcs[id];
        if (rt && rt.follow && rt.alive !== false) {
          newFocus.push(id);
        }
      });

      // 2. 处理当前 scene
      var oldScene = this._data.scene.slice();
      var newScene = [];
      oldScene.forEach(function(id) {
        var rt = self._data.npcs[id];
        if (!rt || rt.alive === false) return;
        if (rt.follow) {
          // 跟随玩家 → 保留
          if (newScene.indexOf(id) < 0) newScene.push(id);
        }
        // 不跟随 → 留在原地，回背景（不加入 newScene）
      });

      // 3. 加入新地点的原住民（definitions 里 locationId === newLocationId 的 NPC）
      defs.forEach(function(def) {
        if (!def || !def.id) return;
        // 只处理卡带定义里显式指定了 locationId 的
        if (!def.locationId) return;
        if (def.locationId !== newLocationId) return;
        var rt = self._ensure(def.id);
        if (!rt || rt.alive === false) return;
        if (newScene.indexOf(def.id) < 0) newScene.push(def.id);
      });

      // 4. focus 里可能包含非 scene 的（比如跟随时两个都加了），去重
      newFocus = newFocus.filter(function(id, i) { return newFocus.indexOf(id) === i; });
      newScene = newScene.filter(function(id, i) { return newScene.indexOf(id) === i; });

      // 5. focus 里的必须在 scene 里
      newFocus.forEach(function(id) {
        if (newScene.indexOf(id) < 0) newScene.push(id);
      });

      // 6. focus 超限 → 按 lastSeenRound 取最近的
      if (newFocus.length > MAX_FOCUS) {
        newFocus.sort(function(a, b) {
          var ra = (self._data.npcs[a] && self._data.npcs[a].lastSeenRound) || 0;
          var rb = (self._data.npcs[b] && self._data.npcs[b].lastSeenRound) || 0;
          return rb - ra;
        });
        var keep = newFocus.slice(0, MAX_FOCUS);
        newFocus = keep;
      }

      // 7. scene 超限 → 裁掉最老的（非 focus 优先）
      if (newScene.length > MAX_SCENE_SIZE) {
        var removable = newScene.filter(function(id) { return newFocus.indexOf(id) < 0; });
        removable.sort(function(a, b) {
          var ra = (self._data.npcs[a] && self._data.npcs[a].lastSeenRound) || 0;
          var rb = (self._data.npcs[b] && self._data.npcs[b].lastSeenRound) || 0;
          return ra - rb;
        });
        var needRemove = newScene.length - MAX_SCENE_SIZE;
        var removeSet = {};
        removable.slice(0, needRemove).forEach(function(id) { removeSet[id] = true; });
        newScene = newScene.filter(function(id) { return !removeSet[id]; });
      }

      this._data.sceneLocationId = newLocationId || '';
      this._data.focus = newFocus;
      this._data.scene = newScene;

      // 更新 status 缓存
      Object.keys(this._data.npcs).forEach(function(id) {
        self._attachStatus(self._data.npcs[id], id);
      });

      this.save();

      // 8. 尝试补满镜头空位
      this.rollForScene();

      return {
        ok: true,
        changed: true,
        from: oldLoc,
        to: newLocationId,
        focus: newFocus.slice(),
        scene: newScene.slice()
      };
    },

    // ============ 每轮 tick ============
    tick: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var defs = this._listDefs();
      if (!defs.length) return;

      var round = this._roundCount();
      if (this._data.lastTickRound === round) return;

      var self = this;

      // 1. 非 focus 的 NPC 场景权重 +1
      Object.keys(this._data.npcs).forEach(function(id) {
        var rt = self._data.npcs[id];
        if (!rt) return;
        if (rt.alive === false) return;
        if (self._data.focus.indexOf(id) >= 0) return;
        rt.sceneWeight = Math.min(MAX_SCENE_WEIGHT, (rt.sceneWeight || 0) + 1);
      });

      // 2. 关键词命中 → 再 +1
      var recentText = this._recentText(KEYWORD_LOOKBACK);
      if (recentText) {
        Object.keys(this._data.npcs).forEach(function(id) {
          var rt = self._data.npcs[id];
          if (!rt || self._data.focus.indexOf(id) >= 0 || rt.alive === false) return;
          var kws = rt.keywords || [];
          for (var i = 0; i < kws.length; i++) {
            if (kws[i] && recentText.indexOf(kws[i]) >= 0) {
              rt.sceneWeight = Math.min(MAX_SCENE_WEIGHT, (rt.sceneWeight || 0) + 1);
              break;
            }
          }
        });
      }

      // 3. 镜头 NPC 超时未碰 → 自动退回现场舞台
      var stale = [];
      this._data.focus.forEach(function(id) {
        var rt = self._data.npcs[id];
        if (!rt) return;
        if (round - (rt.lastTouchedRound || 0) >= FOCUS_STALE_ROUNDS) stale.push(id);
      });
      stale.forEach(function(id) {
        self.unfocusNpc(id);
      });

      this._data.lastTickRound = round;
      this.save();
    },

    // 尝试从现场舞台抽一个 NPC 上镜头（补空位）
    // 由 tick 后或换场景后调用；也支持 AI 主动触发
    rollForScene: function(force) {
      if (!this._data) this.load();
      this._ensureShape();
      var defs = this._listDefs();
      if (!defs.length) return { picked: null };

      if (this._data.focus.length >= MAX_FOCUS) return { picked: null };
      // 概率门（force 时跳过）
      if (!force && Math.random() > ROLL_CHANCE) return { picked: null };

      var self = this;
      var candidates = [];

      this._data.scene.forEach(function(id) {
        if (self._data.focus.indexOf(id) >= 0) return;
        var rt = self._data.npcs[id];
        if (!rt || rt.alive === false) return;
        var def = self._findDef(id);
        if (!def) return;
        var backWeight  = (def.weight != null && def.weight > 0) ? def.weight : 5;
        var sceneWeight = (rt.sceneWeight != null && rt.sceneWeight > 0) ? rt.sceneWeight : 1;
        var followBoost = rt.follow ? 1.5 : 1;   // 跟随者略微提高出场概率
        var finalWeight = backWeight * sceneWeight * followBoost;
        if (finalWeight <= 0) return;
        candidates.push({ id: id, weight: finalWeight });
      });

      if (!candidates.length) return { picked: null };

      var total = 0;
      for (var i = 0; i < candidates.length; i++) total += candidates[i].weight;
      var r = Math.random() * total;
      var acc = 0;
      var pickedId = candidates[candidates.length - 1].id;
      for (var j = 0; j < candidates.length; j++) {
        acc += candidates[j].weight;
        if (r <= acc) { pickedId = candidates[j].id; break; }
      }

      var ok = this.focusNpc(pickedId);
      if (ok.ok) {
        return { picked: { id: pickedId, name: (this._findDef(pickedId) || {}).name || pickedId } };
      }
      return { picked: null };
    },

    // ============ 内部工具 ============
    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    _recentText: function(rounds) {
      var hist = GameState.chatHistory || [];
      var take = Math.max(2, rounds * 2);
      return hist.slice(-take).map(function(m) { return m.content || ''; }).join('\n');
    },

    // ============ Prompt 注入 ============
    // 镜头名单（给 AI 看，只列名字 + 情绪）
    formatFocusBrief: function() {
      var list = this.getFocus();
      if (!list.length) return '当前镜头内没有 NPC。';
      var lines = [];
      list.forEach(function(def) {
        var rt = def._rt || {};
        var mood = rt.mood ? ('（' + rt.mood + '）') : '';
        var tag = rt.follow ? ' · 跟随' : '';
        lines.push('· ' + (def.name || def.id) + mood + tag);
      });
      return lines.join('\n');
    },

    // 兼容旧 API
    formatStageBrief: function() { return this.formatFocusBrief(); },

    // 镜头内 NPC 的详细状态
    formatActiveForPrompt: function() {
      var list = this.getFocus();
      if (!list.length) return '';
      var self = this;
      var lines = [];
      list.forEach(function(def) {
        var rt = def._rt || {};
        var bits = [];
        if (rt.mood) bits.push('情绪=' + rt.mood);
        if (rt.locationId) bits.push('位置=' + rt.locationId);
        if (rt.playerRelation) bits.push('对玩家=' + rt.playerRelation);
        if (bits.length) lines.push('· ' + (def.name || def.id) + '：' + bits.join(' · '));
        // 知识边界：该 NPC 已经知道的事（最多 MAX_KNOWLEDGE 条，FIFO 顺序）
        var facts = Array.isArray(rt.knownFacts) ? rt.knownFacts.slice(-MAX_KNOWLEDGE) : [];
        if (facts.length) {
          lines.push('  知道：');
          facts.forEach(function(raw) {
            var f = self._normKnowledgeItem(raw);
            if (!f) return;
            lines.push('    ' + self._knowledgeTag(raw) + ' ' + f.text);
          });
        }
      });
      return lines.join('\n');
    },

    // 现场舞台名单（不聚焦但在场的，只列名字）
    formatSceneBrief: function() {
      var list = this.getScene();
      var self = this;
      var focusIds = this._data ? this._data.focus : [];
      var sceneOnly = list.filter(function(def) { return focusIds.indexOf(def.id) < 0; });
      if (!sceneOnly.length) return '';
      var names = sceneOnly.map(function(def) { return def.name || def.id; });
      return names.join('、');
    },

    // 跟随名单
    formatFollowBrief: function() {
      var list = this.getFollowed();
      if (!list.length) return '';
      var names = list.map(function(def) { return def.name || def.id; });
      return names.join('、');
    },

    // ============ AI 更新流程 ============
    buildUpdatePrompt: function(npcId, rounds) {
      var def = this._findDef(npcId);
      if (!def) return null;
      var rt = this._ensure(def.id);
      if (!rt) return null;
      rounds = rounds || 20;

      var recent = (GameState.chatHistory || []).slice(-rounds * 2).map(function(m) {
        var role = m.role === 'user' ? '玩家' : (m.role === 'assistant' ? 'GM' : '系统');
        return '[' + role + '] ' + String(m.content || '').slice(0, 1500);
      }).join('\n\n');

      var sys = [
        '你是 NPC 状态更新助手。根据最近剧情，更新这个 NPC 的运行时状态。',
        '只输出一个 JSON 对象，不要解释、不要 markdown 代码块。格式：',
        '{',
        '  "alive": true,',
        '  "mood": "情绪（例：愉悦 / 警惕 / 愤怒）",',
        '  "locationId": "所在位置的地图节点 id（不知道就留空字符串）",',
        '  "playerRelation": "对玩家的态度（例：好奇 / 戒备 / 敌意）",',
        '  "knownFacts": ["已经确认的、可以当作事实的信息1"],',
        '  "heardClaims": ["他听别人说的、还没法确认的说法1"],',
        '  "recentEvents": ["最近发生的事件1", "事件2"],',
        '  "explain": "一句话解释你为什么这么判断"',
        '}',
        '',
        '规则：',
        '1. knownFacts 最多 20 条，只保留最新最重要的。',
        '2. 玩家单方面说出的身份、经历、承诺、物品归属，一律只算「他这么说了」，全部写进 heardClaims，不要写进 knownFacts；只有剧情里被确认、被目击、被证实的才写 knownFacts。',
        '3. recentEvents 最多 5 条，按时间顺序。',
        '4. 如果 NPC 没有出场，mood / locationId 保持原值。',
        '5. alive 只在剧情明确写了死亡时才设为 false。',
        '6. 没有的信息用空字符串或空数组，不要编造。'
      ].join('\n');

      var knownFactsStr = (rt.knownFacts && rt.knownFacts.length)
        ? rt.knownFacts.slice(-MAX_KNOWLEDGE).map(function(raw) {
            var f = this._normKnowledgeItem(raw);
            if (!f) return null;
            return this._knowledgeTag(raw) + ' ' + f.text;
          }, this).filter(Boolean).join('；')
        : '—';
      var recentEventsStr = (rt.recentEvents && rt.recentEvents.length) ? rt.recentEvents.join('；') : '—';

      var user = [
        '【NPC 静态设定】',
        'id：' + def.id,
        '姓名：' + (def.name || ''),
        '性别：' + (def.gender || '—'),
        '年龄：' + (def.age != null ? def.age : '—'),
        '描述：' + (def.desc || '—'),
        '',
        '【当前运行时状态】',
        '舞台：' + this._computeStatus(def.id),
        '跟随：' + (rt.follow ? '是' : '否'),
        '存活：' + (rt.alive !== false ? '是' : '否'),
        '情绪：' + (rt.mood || '—'),
        '位置：' + (rt.locationId || '—'),
        '对玩家：' + (rt.playerRelation || '—'),
        '已知事实：' + knownFactsStr,
        '最近事件：' + recentEventsStr,
        '',
        '【最近剧情】',
        recent || '（无）',
        '',
        '现在输出更新后的 JSON：'
      ].join('\n');

      return { sys: sys, user: user };
    },

    parseUpdateResponse: function(content) {
      if (!content) return null;
      var s = String(content).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var start = s.indexOf('{');
      var end = s.lastIndexOf('}');
      if (start >= 0 && end > start) s = s.slice(start, end + 1);

      var parsed = null;
      try { parsed = JSON.parse(s); }
      catch (e) {
        if (typeof CardDiagnose !== 'undefined' && CardDiagnose.fixJSONText) {
          try {
            var fixed = CardDiagnose.fixJSONText(s);
            if (fixed && fixed.result) parsed = JSON.parse(fixed.result);
          } catch (e2) { return null; }
        } else return null;
      }
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        alive: parsed.alive !== false,
        mood: typeof parsed.mood === 'string' ? parsed.mood : '',
        locationId: typeof parsed.locationId === 'string' ? parsed.locationId : '',
        playerRelation: typeof parsed.playerRelation === 'string' ? parsed.playerRelation : '',
        knownFacts: Array.isArray(parsed.knownFacts) ? parsed.knownFacts.map(String) : [],
        heardClaims: Array.isArray(parsed.heardClaims) ? parsed.heardClaims.map(String) : [],
        recentEvents: Array.isArray(parsed.recentEvents) ? parsed.recentEvents.map(String) : [],
        explain: typeof parsed.explain === 'string' ? parsed.explain : ''
      };
    },

    applyUpdate: function(npcId, data) {
      if (!npcId || !data) return { ok: false, reason: '参数缺失' };
      var id = this._resolveId(npcId);
      var rt = this._ensure(npcId);
      if (!rt) return { ok: false, reason: 'NPC 不存在' };
      if (data.alive != null) rt.alive = !!data.alive;
      if (data.mood != null) rt.mood = String(data.mood);
      if (data.locationId != null) rt.locationId = String(data.locationId);
      if (data.playerRelation != null) rt.playerRelation = String(data.playerRelation);
      // P14·S3：AI 明确分出「听别人说的、未确认的」⇒ 落 told + origin:player + unverified。
      if (Array.isArray(data.heardClaims) && data.heardClaims.length) {
        var claimsIn = data.heardClaims.map(function(t) {
          return { text: String(t == null ? '' : t), source: 'told', origin: 'player', unverified: true };
        });
        rt.knownFacts = this._mergeKnowledge(rt.knownFacts, claimsIn, 'told');
      }
      if (Array.isArray(data.knownFacts) && data.knownFacts.length) {
        // P14·S3 兜底：AI 若仍把玩家的话塞进 knownFacts，按「保守降级」处理——
        //   只降级、不删除（设计稿第五节：不要把原始 Claim 抹掉，
        //   「NPC 曾经相信过玩家的谎话」本身就是世界史的一部分）。
        var HEARSAY = /玩家(自称|声称|说|告诉|讲)|自称|据说|听说|转述/;
        var plainKnown = [], heardIn = [];
        data.knownFacts.forEach(function(t) {
          var s = String(t == null ? '' : t);
          if (HEARSAY.test(s)) heardIn.push({ text: s, source: 'told', origin: 'player', unverified: true });
          else plainKnown.push(s);
        });
        if (plainKnown.length) rt.knownFacts = this._mergeKnowledge(rt.knownFacts, plainKnown, 'deduced');
        if (heardIn.length) rt.knownFacts = this._mergeKnowledge(rt.knownFacts, heardIn, 'told');
      }
      if (Array.isArray(data.recentEvents)) rt.recentEvents = data.recentEvents.slice(-5);
      this.save();
      return { ok: true, npcId: id };
    },

    // ============ 伪装 NPC ============
    // 揭示身份（AI 或引擎调用）
    reveal: function(npcId, reason) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._resolveId(npcId);
      if (!id) return { ok: false, reason: 'NPC 不存在：' + npcId };
      var rt = this._ensure(id);
      if (!rt) return { ok: false, reason: '初始化失败' };
      if (rt.revealed) return { ok: false, reason: '该 NPC 已揭示' };
      rt.revealed = true;
      rt.disguised = false;
      rt.revealReason = reason || '';
      rt.revealAt = GameState.formatGameTime();
      this.save();
      var def = this._findDef(id) || {};
      return { ok: true, id: id, name: def.realName || def.name || id };
    },

    // 是否处于伪装状态
    isDisguised: function(npcId) {
      var rt = this._ensure(npcId);
      return !!(rt && rt.disguised && !rt.revealed);
    },

    // ============ 调试 ============
    clear: function() {
      this._data = this._emptyData();
      this.save();
    },

    // 返回当前舞台摘要（供 audit / UI 用）
    getSummary: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return {
        location: this._data.sceneLocationId || '',
        focusCount: this._data.focus.length,
        focusMax: MAX_FOCUS,
        sceneCount: this._data.scene.length,
        sceneMax: MAX_SCENE_SIZE,
        focus: this._data.focus.slice(),
        scene: this._data.scene.slice()
      };
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'NpcRuntime 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[NpcRuntime] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var N = NpcRuntime;

    // ---- add_keyword ----
    ToolExecutor.WHITELIST.add_keyword = {
      run: function(a) {
        if (!a.id || !a.keyword) return { ok: false, reason: '缺少 id 或 keyword' };
        var def = N._findDef(a.id);
        if (!def) return { ok: false, reason: 'NPC 不存在：' + a.id };
        var rt = N._ensure(def.id);
        if (!rt) return { ok: false, reason: '初始化失败' };
        var kw = String(a.keyword).trim();
        if (!kw) return { ok: false, reason: 'keyword 为空' };
        if (rt.keywords.indexOf(kw) >= 0) return { ok: false, reason: '关键词已存在' };
        rt.keywords.push(kw);
        N.save();
        return {
          ok: true, type: 'keyword', action: 'add',
          npcId: def.id, keyword: kw,
          label: 'NPC ' + def.id + ' 添加关键词「' + kw + '」'
        };
      }
    };

    // ---- npc_knows（登记 NPC 知识：带时间戳与来源）----
    ToolExecutor.WHITELIST.npc_knows = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        if (!a.text) return { ok: false, reason: '缺少 text' };
        var source = KNOWLEDGE_SOURCES.indexOf(a.source) >= 0 ? a.source : 'deduced';
        // P14·S3：工具协议声明了 origin? / unverified?，handler 必须接住——
        //   否则玩家本人告诉 NPC 的事会被当成「已确认的事实」（声明与实现不一致）。
        var origin = (typeof a.origin === 'string') ? a.origin : '';
        // unverified 的缺省规则在 addKnowledge 里按 source 统一判定，这里只透传。
        var unverified = (a.unverified === true || a.unverified === 'true');
        var r = N.addKnowledge(a.id, {
          text: a.text,
          source: source,
          sourceNote: a.sourceNote || '',
          origin: origin,
          unverified: unverified
        });
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'npc_knowledge',
          action: 'add',
          npcId: r.id,
          text: r.text,
          acquiredAt: r.acquiredAt,
          source: r.source,
          origin: r.origin,
          unverified: r.unverified,
          label: 'NPC ' + r.id + (r.unverified ? ' 听说了「' : ' 知道「') + r.text + '」'
        };
      }
    };

    // ---- npc_focus ----
    ToolExecutor.WHITELIST.npc_focus = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.focusNpc(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'focus',
          npcId: r.id, label: 'NPC ' + r.id + ' 进入镜头'
        };
      }
    };

    // ---- npc_unfocus ----
    ToolExecutor.WHITELIST.npc_unfocus = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.unfocusNpc(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'unfocus',
          npcId: r.id, label: 'NPC ' + r.id + ' 移出镜头（回现场舞台）'
        };
      }
    };

    // ---- npc_scene_enter ----
    ToolExecutor.WHITELIST.npc_scene_enter = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.sceneEnter(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'scene_enter',
          npcId: r.id, label: 'NPC ' + r.id + ' 进入现场舞台'
        };
      }
    };

    // ---- npc_scene_leave ----
    ToolExecutor.WHITELIST.npc_scene_leave = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.sceneLeave(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'scene_leave',
          npcId: r.id, label: 'NPC ' + r.id + ' 离开现场舞台（回背景）'
        };
      }
    };

    // ---- npc_follow ----
    ToolExecutor.WHITELIST.npc_follow = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.setFollow(a.id, true);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'follow',
          npcId: r.id, label: 'NPC ' + r.id + ' 开始跟随玩家'
        };
      }
    };

    // ---- npc_unfollow ----
    ToolExecutor.WHITELIST.npc_unfollow = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.setFollow(a.id, false);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'unfollow',
          npcId: r.id, label: 'NPC ' + r.id + ' 取消跟随'
        };
      }
    };

    // ---- npc_reveal（伪装 NPC 揭示）----
    ToolExecutor.WHITELIST.npc_reveal = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.reveal(a.id, a.reason || '');
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'reveal',
          npcId: r.id, name: r.name,
          label: 'NPC ' + r.id + ' 揭示真实身份：' + r.name
        };
      }
    };

    // ---- npc_enter（旧 API，兼容 = focus）----
    ToolExecutor.WHITELIST.npc_enter = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.focusNpc(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state', action: 'enter',
          npcId: r.id, label: 'NPC ' + r.id + ' 登场'
        };
      }
    };

    // ---- npc_leave（旧 API，兼容）----
    // to = 'offstage' → sceneLeave（回背景）
    // to = 'dormant'（默认）→ unfocusNpc（回现场舞台）
    ToolExecutor.WHITELIST.npc_leave = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var to = a.to;
        var r;
        if (to === 'offstage') r = N.sceneLeave(a.id);
        else r = N.unfocusNpc(a.id);
        if (!r.ok) return r;
        return {
          ok: true, type: 'npc_state',
          action: to === 'offstage' ? 'offstage' : 'leave',
          npcId: r.id,
          label: 'NPC ' + r.id + (to === 'offstage' ? ' 退场（后台）' : ' 离场（回现场舞台）')
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

  if (typeof window !== 'undefined') window.NpcRuntime = NpcRuntime;
  if (typeof module !== 'undefined' && module.exports) module.exports = NpcRuntime;
})();
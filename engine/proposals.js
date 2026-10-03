// ============================================================
// 变更提议系统 · 元层通道
// 玩家在行动框说"应该加/应该改/不该再"时，AI 通过 propose_change
// 提议一次数据变更。提议不立即执行，玩家在面板确认后才落盘。
// 数据：/saves/{cardId}/{saveId}/proposals.json
// 分层：A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function() {
  // 提议白名单：写操作才走提议，查询和实时工具不走
  var ALLOWED_TYPES = {
    // 数值
    modify_hud: 1, modify_sidebar: 1, modify_entry: 1, modify_relation: 1,
    // 物品
    add_item: 1, remove_item: 1,
    // 事件
    trigger_event: 1, ban_event: 1, unban_event: 1,
    // 任务
    add_task: 1, complete_task: 1, fail_task: 1, abandon_task: 1,
    // 成就
    add_achievement: 1, unlock_achievement: 1,
    // 结局
    trigger_ending: 1,
    // 节点 / 伏笔
    enter_node: 1, complete_node: 1, bury_foreshadow: 1, reveal_foreshadow: 1,
    // NPC
    add_keyword: 1, npc_focus: 1, npc_unfocus: 1, npc_follow: 1, npc_unfollow: 1, npc_reveal: 1, npc_knows: 1,
    // 状态卡
    update_status: 1, update_status_bulk: 1, set_inner_voice: 1,
    // 商店
    open_shop: 1, buy_item: 1, sell_item: 1,
    // 天气
    set_weather: 1
  };

  // 类型的中文短标签
  var TYPE_LABELS = {
    modify_hud: '修改 HUD', modify_sidebar: '修改侧栏', modify_entry: '修改面板条目', modify_relation: '修改关系',
    add_item: '添加物品', remove_item: '移除物品',
    trigger_event: '触发事件', ban_event: '封禁事件', unban_event: '解封事件',
    add_task: '添加任务', complete_task: '完成任务', fail_task: '任务失败', abandon_task: '放弃任务',
    add_achievement: '添加成就', unlock_achievement: '解锁成就',
    trigger_ending: '触发结局',
    enter_node: '进入节点', complete_node: '完成节点', bury_foreshadow: '埋下伏笔', reveal_foreshadow: '回收伏笔',
    add_keyword: 'NPC 添加关键词', npc_focus: 'NPC 进入镜头', npc_unfocus: 'NPC 移出镜头',
    npc_follow: 'NPC 开始跟随', npc_unfollow: 'NPC 取消跟随', npc_reveal: 'NPC 揭示身份', npc_knows: 'NPC 登记知识',
    update_status: '更新状态', update_status_bulk: '批量更新状态', set_inner_voice: '设置 NPC 心声',
    open_shop: '打开商店', buy_item: '购买物品', sell_item: '出售物品',
    set_weather: '设置天气'
  };

  // 元层意图关键词表：只收"指向引擎数据变更"的明确短语，
  // 通用动词（添加/改成/删掉/别再…）会命中剧情叙事，不得入表。
  var META_KEYWORDS = {
    add: ['应该加', '记一下', '记下来', '记录下来'],
    remove: ['不该再', '以后别', '不要再'],
    modify: ['纠正一下', '应该改成', '应该改为']
  };

  var Proposals = {
    _data: null,
    _generation: 0,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/proposals.json';
    },

    _empty: function() {
      return { proposals: [] };
    },

    load: function() {
      this._generation++;
      var p = this._path();
      if (!p) { this._data = this._empty(); return; }
      var d = VFS.readJSON(p);
      this._data = (d && Array.isArray(d.proposals)) ? d : this._empty();
    },

    save: function() {
      var p = this._path();
      if (!p || !this._data) return;
      VFS.writeJSON(p, this._data);
    },

    getRuntime: function() {
      if (!this._data) this.load();
      return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
    },
    setRuntime: function(data) {
      this._generation++;
      this._data = data ? JSON.parse(JSON.stringify(data)) : null;
      if (!this._data || !Array.isArray(this._data.proposals)) this._data = this._empty();
      this.save();
    },

    // ============ 意图检测 ============
    detectIntent: function(text) {
      if (!text) return { isMeta: false, keywords: [], category: null };
      var t = String(text);
      var hits = [];
      var cat = null;
      Object.keys(META_KEYWORDS).forEach(function(k) {
        META_KEYWORDS[k].forEach(function(w) {
          if (t.indexOf(w) >= 0 && hits.indexOf(w) < 0) {
            hits.push(w);
            if (!cat) cat = k;
          }
        });
      });
      return {
        isMeta: hits.length > 0,
        keywords: hits,
        category: cat
      };
    },

    // ============ 提议入队 ============
    create: function(args) {
      if (!this._data) this.load();
      if (!args || !args.type) return { ok: false, reason: '缺少 type' };
      if (!ALLOWED_TYPES[args.type]) return { ok: false, reason: '不支持的类型：' + args.type };
      if (!args.payload || typeof args.payload !== 'object' || Array.isArray(args.payload)) {
        return { ok: false, reason: '缺少 payload' };
      }

      var id = 'prop_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
      var item = {
        id: id,
        type: args.type,
        payload: args.payload,
        reason: String(args.reason || ''),
        createdAt: GameState.formatGameTime(),
        round: this._roundCount()
      };
      this._data.proposals.push(item);
      this.save();
      return { ok: true, id: id, type: args.type };
    },

    // ============ 查询 ============
    list: function() {
      if (!this._data) this.load();
      return this._data.proposals.slice();
    },

    getPendingCount: function() {
      if (!this._data) this.load();
      return this._data.proposals.length;
    },

    _find: function(id) {
      if (!this._data) this.load();
      var found = null;
      this._data.proposals.forEach(function(p) { if (p.id === id) found = p; });
      return found;
    },

    // ============ 确认 / 拒绝 ============
    confirm: async function(id, opts) {
      opts = opts || {};
      if (!this._data) this.load();
      var prop = this._find(id);
      if (!prop) return { ok: false, reason: '提议不存在' };

      // A 层纯代码校验
      if (typeof ProposalValidator !== 'undefined' && ProposalValidator.validate) {
        var v = ProposalValidator.validate(prop);
        if (!v.ok) {
          return { ok: false, reason: v.reason || '提议已失效' };
        }
      }

      var gen = this._generation;

      // B 层 AI 语义校验（默认关，开启且满足触发条件才跑）
      if (!opts.skipSemanticCheck && typeof ProposalSemanticCheck !== 'undefined') {
        if (ProposalSemanticCheck.shouldRun && ProposalSemanticCheck.shouldRun(prop)) {
          var b = await ProposalSemanticCheck.run(prop);
          // await 期间玩家可能已拒绝，或存档切换/快照回滚：复查后再决定
          if (this._generation !== gen || !this._find(id)) {
            return { ok: false, reason: '提议已被移除或世界已回滚' };
          }
          if (b && b.ok === false) {
            return { ok: false, reason: b.reason || '提议可能已失效', needsConfirm: true };
          }
        }
      }

      // 执行工具前再次复查（覆盖 B 层关闭、A 层后同步窗口）
      if (this._generation !== gen || !this._find(id)) {
        return { ok: false, reason: '提议已被移除或世界已回滚' };
      }

      if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
        return { ok: false, reason: '工具执行器未加载' };
      }
      var tool = ToolExecutor.WHITELIST[prop.type];
      if (!tool || typeof tool.run !== 'function') {
        return { ok: false, reason: '工具不存在：' + prop.type };
      }
      var result = tool.run(prop.payload);
      if (result && result.__async && result.promise) {
        return { ok: false, reason: '不支持异步工具：' + prop.type };
      }
      if (!result || !result.ok) {
        return { ok: false, reason: (result && result.reason) || '执行失败' };
      }
      this._data.proposals = this._data.proposals.filter(function(p) { return p.id !== id; });
      this.save();
      return { ok: true, toolResult: result, label: result.label || '' };
    },

    reject: function(id) {
      if (!this._data) this.load();
      var before = this._data.proposals.length;
      this._data.proposals = this._data.proposals.filter(function(p) { return p.id !== id; });
      if (this._data.proposals.length === before) {
        return { ok: false, reason: '提议不存在' };
      }
      this.save();
      return { ok: true, id: id };
    },

    // ============ 描述（给 UI 用） ============
    describe: function(p) {
      if (!p) return '';
      var label = TYPE_LABELS[p.type] || p.type;
      var name = '';
      var pl = p.payload || {};
      if (pl.name) name = pl.name;
      else if (pl.achievement && pl.achievement.name) name = pl.achievement.name;
      else if (pl.task && pl.task.name) name = pl.task.name;
      else if (pl.event && pl.event.name) name = pl.event.name;
      else if (pl.key) name = pl.key;
      else if (pl.id) name = pl.id;
      return label + (name ? '「' + name + '」' : '');
    },

    // ============ 给 prompt 用 ============
    formatForPrompt: function() {
      if (!this._data) this.load();
      var n = this._data.proposals.length;
      if (n === 0) return '';
      return '>>> 【待确认的变更提议】' + n + ' 条（玩家可在"变更提议"面板查看）';
    },

    // ============ 调试 ============
    clear: function() {
      this._data = this._empty();
      this.save();
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'Proposals 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[Proposals] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var P = Proposals;

    ToolExecutor.WHITELIST.propose_change = {
      run: function(a) {
        if (!a.type) return { ok: false, reason: '缺少 type' };
        if (!a.payload) return { ok: false, reason: '缺少 payload' };
        var r = P.create({ type: a.type, payload: a.payload, reason: a.reason || '' });
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'proposal',
          action: 'create',
          proposalId: r.id,
          proposalType: r.type,
          label: '提议变更·' + (TYPE_LABELS[r.type] || r.type)
        };
      }
    };

    ToolExecutor.WHITELIST.query_proposals = {
      run: function() {
        var list = P.list();
        return {
          ok: true,
          type: 'query',
          queryType: 'proposals',
          data: {
            count: list.length,
            list: list.map(function(p) {
              return { id: p.id, type: p.type, reason: p.reason, createdAt: p.createdAt };
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

  if (typeof window !== 'undefined') window.Proposals = Proposals;
  if (typeof module !== 'undefined' && module.exports) module.exports = Proposals;
})();

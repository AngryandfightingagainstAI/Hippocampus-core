// ============================================================
// 节点/伏笔系统（模组大纲）
// - 节点 = 有向图上的点，每个有 entry/exit 条件
// - 线/网/混合 = 作者怎么写 lockedUntil，引擎一种实现吃三种
// - 伏笔：埋在节点 A、收在节点 B，到结局未回收 → 遗憾
// - 出口判定：引擎判主条件 + AI 判次要条件
// - 伏笔没埋：提前一轮预警（不硬拦）
// - 玩家卡住：侧栏提示（不硬推）
// 数据：/saves/{cardId}/{saveId}/story_nodes.json
// 开关：全局 settings.storyNodes.enabled（默认 false）+ 卡带定义非空
// ============================================================

(function() {
  var STUCK_ROUNDS = 5;         // 同一节点待 N 轮没推进 → 提示卡住
  var FORESHADOW_WARN_AT = 2;   // 节点内待 N 轮还没埋完伏笔 → 预警

  var StoryNodes = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/story_nodes.json';
    },

    _emptyData: function() {
      return {
        currentNodeId: '',
        visited: [],
        completed: [],
        // 当前节点已埋/已收的伏笔
        buriedForeshadows: [],
        revealedForeshadows: [],
        // 节点进过的轮次（用于卡住判定）
        enteredAtRound: {},
        // 全局：所有节点上已埋但未回收的伏笔
        pendingForeshadows: [],
        // 预警记录（避免重复弹同一个提示）
        warnings: {}
      };
    },

    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = this._emptyData();
        return;
      }
      var d = this._data;
      if (typeof d.currentNodeId !== 'string') d.currentNodeId = '';
      if (!Array.isArray(d.visited)) d.visited = [];
      if (!Array.isArray(d.completed)) d.completed = [];
      if (!Array.isArray(d.buriedForeshadows)) d.buriedForeshadows = [];
      if (!Array.isArray(d.revealedForeshadows)) d.revealedForeshadows = [];
      if (!d.enteredAtRound || typeof d.enteredAtRound !== 'object') d.enteredAtRound = {};
      if (!Array.isArray(d.pendingForeshadows)) d.pendingForeshadows = [];
      if (!d.warnings || typeof d.warnings !== 'object') d.warnings = {};
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
      try {
        var g = Storage.getGlobal();
        var s = (g.settings && g.settings.storyNodes) || {};
        if (s.enabled === false) return false;
        // 默认关（用户开了才生效）
        if (s.enabled !== true) return false;
      } catch (e) { return false; }
      // 卡带必须有 storyNodes
      var card = GameState.currentCard;
      if (!card) return false;
      var wb = card.worldbook || {};
      return Array.isArray(wb.storyNodes) && wb.storyNodes.length > 0;
    },

    // ============ 定义 ============
    listNodeDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.storyNodes || [];
    },

    listForeshadowDefs: function() {
      var card = GameState.currentCard;
      if (!card) return [];
      var wb = card.worldbook || {};
      return wb.foreshadows || [];
    },

    findNode: function(id) {
      var found = null;
      this.listNodeDefs().forEach(function(n) { if (!found && n.id === id) found = n; });
      return found;
    },

    findForeshadow: function(id) {
      var found = null;
      this.listForeshadowDefs().forEach(function(f) { if (!found && f.id === id) found = f; });
      return found;
    },

    // ============ 当前节点 ============
    getCurrentNode: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return this._data.currentNodeId ? this.findNode(this._data.currentNodeId) : null;
    },

    getCurrentNodeId: function() {
      if (!this._data) this.load();
      return this._data.currentNodeId || '';
    },

    // ============ 可用节点（进入候选） ============
    // 返回当前可以进入的节点列表（排除已完成的、lockedUntil 未满足的）
    getAvailableNodes: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var defs = this.listNodeDefs();
      var completed = this._data.completed || [];
      var visited = this._data.visited || [];
      var out = [];
      defs.forEach(function(def) {
        if (!def.id) return;
        if (completed.indexOf(def.id) >= 0) return;   // 已完成
        // lockedUntil 检查
        var locked = def.lockedUntil || [];
        var allDone = true;
        locked.forEach(function(reqId) {
          if (completed.indexOf(reqId) < 0) allDone = false;
        });
        if (!allDone) return;
        // 已在当前节点
        if (self._data.currentNodeId === def.id) return;
        out.push(def);
      });
      return out;
    },

    // ============ 进入/离开节点 ============
    enterNode: function(nodeId, reason) {
      if (!this._data) this.load();
      this._ensureShape();
      var def = this.findNode(nodeId);
      if (!def) return { ok: false, reason: '节点不存在：' + nodeId };
      if (this._data.completed.indexOf(nodeId) >= 0) {
        return { ok: false, reason: '该节点已完成' };
      }
      // lockedUntil 检查
      var locked = def.lockedUntil || [];
      for (var i = 0; i < locked.length; i++) {
        if (this._data.completed.indexOf(locked[i]) < 0) {
          return { ok: false, reason: '前置节点未完成：' + locked[i] };
        }
      }
      // 记录进入
      var prev = this._data.currentNodeId;
      this._data.currentNodeId = nodeId;
      if (this._data.visited.indexOf(nodeId) < 0) this._data.visited.push(nodeId);
      this._data.enteredAtRound[nodeId] = this._roundCount();
      // 清空当前节点的伏笔进度
      this._data.buriedForeshadows = [];
      this._data.revealedForeshadows = [];
      this.save();
      return {
        ok: true,
        from: prev,
        to: nodeId,
        name: def.name || nodeId,
        label: '进入节点·' + (def.name || nodeId)
      };
    },

    // 完成当前节点
    completeNode: function(by) {
      if (!this._data) this.load();
      this._ensureShape();
      var id = this._data.currentNodeId;
      if (!id) return { ok: false, reason: '没有当前节点' };
      if (this._data.completed.indexOf(id) >= 0) return { ok: false, reason: '该节点已完成' };
      this._data.completed.push(id);
      this.save();
      var def = this.findNode(id) || {};
      return {
        ok: true,
        id: id,
        name: def.name || id,
        by: by || 'ai',
        label: '完成节点·' + (def.name || id)
      };
    },

    // ============ 伏笔 ============
    buryForeshadow: function(foreshadowId, note) {
      if (!this._data) this.load();
      this._ensureShape();
      var def = this.findForeshadow(foreshadowId);
      if (!def) return { ok: false, reason: '伏笔不存在：' + foreshadowId };
      if (this._data.buriedForeshadows.indexOf(foreshadowId) >= 0) {
        return { ok: false, reason: '该伏笔已埋' };
      }
      if (this._data.pendingForeshadows.some(function(x) { return x.id === foreshadowId; })) {
        return { ok: false, reason: '该伏笔已在待回收列表' };
      }
      this._data.buriedForeshadows.push(foreshadowId);
      this._data.pendingForeshadows.push({
        id: foreshadowId,
        name: def.name || foreshadowId,
        buriedAt: GameState.formatGameTime(),
        buriedInNode: this._data.currentNodeId,
        note: note || ''
      });
      this.save();
      return {
        ok: true,
        id: foreshadowId,
        name: def.name || foreshadowId,
        label: '埋下伏笔·' + (def.name || foreshadowId)
      };
    },

    revealForeshadow: function(foreshadowId, note) {
      if (!this._data) this.load();
      this._ensureShape();
      var def = this.findForeshadow(foreshadowId);
      if (!def) return { ok: false, reason: '伏笔不存在：' + foreshadowId };
      var idx = -1;
      this._data.pendingForeshadows.forEach(function(x, i) {
        if (x.id === foreshadowId && idx < 0) idx = i;
      });
      if (idx < 0) return { ok: false, reason: '该伏笔不在待回收列表（可能还没埋）' };
      this._data.pendingForeshadows.splice(idx, 1);
      if (this._data.revealedForeshadows.indexOf(foreshadowId) < 0) {
        this._data.revealedForeshadows.push(foreshadowId);
      }
      this.save();
      return {
        ok: true,
        id: foreshadowId,
        name: def.name || foreshadowId,
        label: '回收伏笔·' + (def.name || foreshadowId)
      };
    },

    // ============ 判定 ============
    // 用 Events._checkTrigger 复用条件
    _check: function(cond) {
      if (!cond) return { ok: false };
      if (typeof Events === 'undefined' || !Events._checkTrigger) return { ok: false };
      return Events._checkTrigger({ trigger: cond });
    },

    // 检查当前节点的 exit 主条件
    checkExitEngine: function() {
      var cur = this.getCurrentNode();
      if (!cur || !cur.exit) return { ok: false };
      var cond = cur.exit.engine;
      if (!cond) return { ok: false };
      return this._check(cond);
    },

    // ============ 每轮 tick ============
    tick: function() {
      if (!this.isEnabled()) return { events: [] };
      if (!this._data) this.load();
      this._ensureShape();

      var out = { events: [] };

      // 1. 首次进入 → 自动进"无 lockedUntil 的起点节点"
      if (!this._data.currentNodeId) {
        var avail = this.getAvailableNodes();
        var starters = avail.filter(function(n) {
          return !n.lockedUntil || !n.lockedUntil.length;
        });
        if (starters.length > 0) {
          var r = this.enterNode(starters[0].id, 'engine');
          if (r.ok) out.events.push(r);
        }
      }

      // 2. 检查当前节点的 exit 主条件
      var cur = this.getCurrentNode();
      if (cur && cur.exit) {
        // 引擎主条件
        if (cur.exit.engine) {
          var ck = this.checkExitEngine();
          if (ck.ok) {
            var c = this.completeNode('engine');
            if (c.ok) out.events.push(c);
          }
        }
      }

      // 3. 预警：节点内待太久 + 伏笔没埋完
      var cur2 = this.getCurrentNode();
      if (cur2 && cur2.requiredForeshadows && cur2.requiredForeshadows.length) {
        var enteredRound = this._data.enteredAtRound[cur2.id] || 0;
        var stayed = this._roundCount() - enteredRound;
        var missing = [];
        var self = this;
        cur2.requiredForeshadows.forEach(function(fsId) {
          if (self._data.buriedForeshadows.indexOf(fsId) < 0) missing.push(fsId);
        });
        if (missing.length > 0 && stayed >= FORESHADOW_WARN_AT) {
          var wKey = 'fs_' + cur2.id + '_' + missing.join('_');
          if (!this._data.warnings[wKey]) {
            this._data.warnings[wKey] = GameState.formatGameTime();
            out.events.push({
              ok: true,
              type: 'warning',
              kind: 'foreshadow',
              nodeId: cur2.id,
              missing: missing,
              label: '⚠ 伏笔预警·' + cur2.id
            });
          }
        }
      }

      // 4. 玩家卡住提示
      var cur3 = this.getCurrentNode();
      if (cur3) {
        var er = this._data.enteredAtRound[cur3.id] || 0;
        var stayed2 = this._roundCount() - er;
        if (stayed2 >= STUCK_ROUNDS) {
          out.stuck = {
            nodeId: cur3.id,
            name: cur3.name || cur3.id,
            stayed: stayed2,
            hint: cur3.stuckHint || ('当前主线卡在：' + (cur3.name || cur3.id))
          };
        } else {
          out.stuck = null;
        }
      } else {
        out.stuck = null;
      }

      this.save();
      return out;
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // ============ Prompt 注入 ============
    formatForPrompt: function() {
      if (!this.isEnabled()) return '';
      if (!this._data) this.load();
      this._ensureShape();
      var cur = this.getCurrentNode();
      if (!cur) return '';

      var lines = [];
      lines.push('>>> 【当前剧情节点】');
      lines.push('节点：' + (cur.name || cur.id) + '（' + (cur.type || 'stage') + '）');
      if (cur.promptHint) lines.push('场景提示：' + cur.promptHint);

      // 出口条件
      if (cur.exit && cur.exit.hint) {
        lines.push('离开条件：' + cur.exit.hint);
      }

      // 伏笔
      var self = this;
      var needBury = (cur.requiredForeshadows || []).filter(function(fs) {
        return self._data.buriedForeshadows.indexOf(fs) < 0;
      });
      if (needBury.length) {
        var names = needBury.map(function(id) {
          var d = self.findForeshadow(id);
          return d ? (d.name || id) : id;
        });
        lines.push('⚠ 本节点还需埋下伏笔：' + names.join('、'));
      }
      var needReveal = (cur.requiredReveals || []).filter(function(fs) {
        return self._data.revealedForeshadows.indexOf(fs) < 0;
      });
      if (needReveal.length) {
        var names2 = needReveal.map(function(id) {
          var d = self.findForeshadow(id);
          return d ? (d.name || id) : id;
        });
        lines.push('⚠ 本节点还需回收伏笔：' + names2.join('、'));
      }

      // 待回收伏笔
      if (this._data.pendingForeshadows.length) {
        var pend = this._data.pendingForeshadows.map(function(x) { return x.name; });
        lines.push('未回收伏笔：' + pend.join('、'));
      }

      // 可进节点（不剧透，只给 id + 名字）
      var avail = this.getAvailableNodes();
      if (avail.length) {
        lines.push('可以进入的节点：');
        avail.slice(0, 5).forEach(function(n) {
          lines.push('  · ' + (n.name || n.id) + '(id=' + n.id + ')');
        });
        lines.push('（想进入时调 enter_node(id)；当前节点完成后调 complete_node()）');
      }

      return lines.join('\n');
    },

    // 给玩家面板用：结构化返回
    getSummary: function() {
      if (!this._data) this.load();
      this._ensureShape();
      var self = this;
      var cur = this.getCurrentNode();
      return {
        enabled: this.isEnabled(),
        currentNode: cur ? {
          id: cur.id,
          name: cur.name || cur.id,
          type: cur.type || 'stage',
          hint: cur.promptHint || '',
          exitHint: (cur.exit && cur.exit.hint) || '',
          requiredForeshadows: (cur.requiredForeshadows || []).map(function(id) {
            var d = self.findForeshadow(id);
            return { id: id, name: d ? (d.name || id) : id, done: self._data.buriedForeshadows.indexOf(id) >= 0 };
          }),
          requiredReveals: (cur.requiredReveals || []).map(function(id) {
            var d = self.findForeshadow(id);
            return { id: id, name: d ? (d.name || id) : id, done: self._data.revealedForeshadows.indexOf(id) >= 0 };
          })
        } : null,
        completed: (this._data.completed || []).map(function(id) {
          var d = self.findNode(id);
          return { id: id, name: d ? (d.name || id) : id };
        }),
        available: this.getAvailableNodes().map(function(n) {
          return { id: n.id, name: n.name || n.id, type: n.type || 'stage' };
        }),
        pendingForeshadows: (this._data.pendingForeshadows || []).slice(),
        stuck: null
      };
    },

    clear: function() {
      this._data = this._emptyData();
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'StoryNodes 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[StoryNodes] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var N = StoryNodes;

    ToolExecutor.WHITELIST.enter_node = {
      run: function(a) {
        if (!N.isEnabled()) return { ok: false, reason: '节点系统未启用' };
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.enterNode(a.id, 'ai');
        if (!r.ok) return r;
        return {
          ok: true, type: 'node', action: 'enter',
          nodeId: r.to, nodeName: r.name,
          label: r.label
        };
      }
    };

    ToolExecutor.WHITELIST.complete_node = {
      run: function() {
        if (!N.isEnabled()) return { ok: false, reason: '节点系统未启用' };
        var r = N.completeNode('ai');
        if (!r.ok) return r;
        return {
          ok: true, type: 'node', action: 'complete',
          nodeId: r.id, nodeName: r.name,
          label: r.label
        };
      }
    };

    ToolExecutor.WHITELIST.bury_foreshadow = {
      run: function(a) {
        if (!N.isEnabled()) return { ok: false, reason: '节点系统未启用' };
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.buryForeshadow(a.id, a.note || '');
        if (!r.ok) return r;
        return {
          ok: true, type: 'foreshadow', action: 'bury',
          foreshadowId: r.id, foreshadowName: r.name,
          label: r.label
        };
      }
    };

    ToolExecutor.WHITELIST.reveal_foreshadow = {
      run: function(a) {
        if (!N.isEnabled()) return { ok: false, reason: '节点系统未启用' };
        if (!a.id) return { ok: false, reason: '缺少 id' };
        var r = N.revealForeshadow(a.id, a.note || '');
        if (!r.ok) return r;
        return {
          ok: true, type: 'foreshadow', action: 'reveal',
          foreshadowId: r.id, foreshadowName: r.name,
          label: r.label
        };
      }
    };

    ToolExecutor.WHITELIST.query_nodes = {
      run: function() {
        if (!N.isEnabled()) return { ok: false, reason: '节点系统未启用' };
        var s = N.getSummary();
        return {
          ok: true, type: 'query', queryType: 'nodes',
          data: s
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

  if (typeof window !== 'undefined') window.StoryNodes = StoryNodes;
  if (typeof module !== 'undefined' && module.exports) module.exports = StoryNodes;
})();
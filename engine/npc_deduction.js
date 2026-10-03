// ============================================================
// NPC 合理推演 · 数据层（批 3-1）
// 管理"推演请求"队列：pending（待确认）→ history（已确认/已拒绝）
// - 3-1 只做数据层：请求创建 / 确认 / 拒绝 / 查询 / 快照接口
// - 3-2 接推演 AI：异步跑推理链，回填 deductionNote
// - 3-3 接 UI：面板显示 + "他/她好像知道了什么"提示
// 数据：/saves/{cardId}/{saveId}/npc_deductions.json
// 分层：B 类 · 数据层 + 存储（VFS），3-2 加 AI 调用
// ============================================================

(function() {
  var MAX_PENDING = 10;
  var MAX_HISTORY = 50;

  var NpcDeduction = {
    _data: null,

    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/npc_deductions.json';
    },

    _empty: function() {
      return { pending: [], history: [] };
    },

    _ensureShape: function() {
      if (!this._data || typeof this._data !== 'object') {
        this._data = this._empty();
        return;
      }
      if (!Array.isArray(this._data.pending)) this._data.pending = [];
      if (!Array.isArray(this._data.history)) this._data.history = [];
      for (var i = 0; i < this._data.pending.length; i++) {
        var it = this._data.pending[i];
        if (!it) continue;
        if (typeof it.failReason !== 'string') it.failReason = '';
        // 兼容旧版本：失败曾写进 deductionNote（'[推演失败：…' / '（无推理链）'），
        // 迁移到独立 failReason，避免旧失败文本被当推理链确认
        if (!it.failReason && typeof it.deductionNote === 'string' &&
            (it.deductionNote.indexOf('[推演失败：') === 0 || it.deductionNote === '（无推理链）')) {
          it.failReason = '旧版本推演失败记录，请重试或拒绝';
          it.deductionNote = '';
        }
      }
    },

    load: function() {
      var p = this._path();
      if (!p) { this._data = this._empty(); this._bumpAI(); return; }
      var d = VFS.readJSON(p);
      this._data = (d && typeof d === 'object') ? d : this._empty();
      this._ensureShape();
      this._bumpAI();
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
      this._bumpAI();
    },

    // 通知 AI 层数据已换主（切存档/回滚），在飞推演回写时按新代次自行作废
    _bumpAI: function() {
      try {
        if (typeof NpcDeductionAI !== 'undefined' && typeof NpcDeductionAI.bumpGeneration === 'function') {
          NpcDeductionAI.bumpGeneration();
        }
      } catch (e) {}
    },

    _uid: function() {
      return 'ded_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    },

    _now: function() {
      return (typeof GameState !== 'undefined' && GameState.formatGameTime)
        ? GameState.formatGameTime() : '';
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    // 创建一条推演请求（pending）
    // opts: { npcId, npcName, factText, requestedBy?: 'ai'|'check'|'player' }
    // 不校验 NPC 是否存在——那是调用方（3-2 AI 流程 / 3-3 UI）的责任
    requestDeduction: function(opts) {
      if (!this._data) this.load();
      this._ensureShape();
      opts = opts || {};
      var npcId = String(opts.npcId || '').trim();
      var factText = String(opts.factText || '').trim();
      if (!npcId) return { ok: false, reason: '缺少 npcId' };
      if (!factText) return { ok: false, reason: '缺少 factText' };
      for (var i = 0; i < this._data.pending.length; i++) {
        var it = this._data.pending[i];
        if (it && it.npcId === npcId && it.factText === factText) {
          return { ok: false, reason: '该推演请求已存在', id: it.id };
        }
      }
      if (this._data.pending.length >= MAX_PENDING) {
        return { ok: false, reason: '待确认推演请求已达上限 ' + MAX_PENDING };
      }
      var item = {
        id: this._uid(),
        npcId: npcId,
        npcName: String(opts.npcName || npcId),
        factText: factText,
        sourceNote: String(opts.sourceNote || ''),
        requestedBy: String(opts.requestedBy || 'ai'),
        requestedAt: this._now(),
        requestedRound: this._roundCount(),
        deductionNote: '',
        failReason: ''
      };
      this._data.pending.push(item);
      this.save();
      return { ok: true, id: item.id, item: JSON.parse(JSON.stringify(item)) };
    },

    _takePending: function(id) {
      for (var i = 0; i < this._data.pending.length; i++) {
        if (this._data.pending[i] && this._data.pending[i].id === id) {
          return this._data.pending.splice(i, 1)[0];
        }
      }
      return null;
    },

    _pushHistory: function(record) {
      this._data.history.push(record);
      if (this._data.history.length > MAX_HISTORY) {
        this._data.history.splice(0, this._data.history.length - MAX_HISTORY);
      }
    },

    // 确认推演：pending → history（resolution: 'confirmed'）
    // opts: { source?: 'deduced'|'manual', sourceNote?, deductionNote? }
    // 返回成功后调用方负责调 NpcRuntime.addKnowledge 登记知识
    confirmDeduction: function(id, opts) {
      if (!this._data) this.load();
      this._ensureShape();
      if (!id) return { ok: false, reason: '缺少 id' };
      var item = this._takePending(id);
      if (!item) return { ok: false, reason: '推演请求不存在或已处理' };
      if (item.failReason) return { ok: false, reason: '该条目推演失败，不能确认，请重试或拒绝' };
      if (!item.deductionNote) return { ok: false, reason: '推理链尚未生成，不能确认' };
      opts = opts || {};
      var source = (opts.source === 'manual') ? 'manual' : 'deduced';
      var record = {
        id: item.id,
        npcId: item.npcId,
        npcName: item.npcName,
        factText: item.factText,
        requestedBy: item.requestedBy,
        requestedAt: item.requestedAt,
        requestedRound: item.requestedRound,
        resolvedAt: this._now(),
        resolution: 'confirmed',
        source: source,
        sourceNote: String(opts.sourceNote || ''),
        deductionNote: String(opts.deductionNote || item.deductionNote || '')
      };
      this._pushHistory(record);
      this.save();
      return {
        ok: true,
        id: record.id,
        npcId: record.npcId,
        npcName: record.npcName,
        factText: record.factText,
        source: record.source,
        sourceNote: record.sourceNote
      };
    },

    // 拒绝推演：pending → history（resolution: 'rejected' | 'auto_rejected'）
    rejectDeduction: function(id, reason, resolution) {
      if (!this._data) this.load();
      this._ensureShape();
      if (!id) return { ok: false, reason: '缺少 id' };
      var item = this._takePending(id);
      if (!item) return { ok: false, reason: '推演请求不存在或已处理' };
      var record = {
        id: item.id,
        npcId: item.npcId,
        npcName: item.npcName,
        factText: item.factText,
        requestedBy: item.requestedBy,
        requestedAt: item.requestedAt,
        requestedRound: item.requestedRound,
        resolvedAt: this._now(),
        resolution: (resolution === 'auto_rejected') ? 'auto_rejected' : 'rejected',
        rejectReason: String(reason || ''),
        deductionNote: item.deductionNote || ''
      };
      this._pushHistory(record);
      this.save();
      return { ok: true, id: record.id, resolution: record.resolution };
    },

    // 供 3-2 的推演 AI 回填推理链
    setDeductionNote: function(id, note) {
      if (!this._data) this.load();
      this._ensureShape();
      for (var i = 0; i < this._data.pending.length; i++) {
        if (this._data.pending[i] && this._data.pending[i].id === id) {
          this._data.pending[i].deductionNote = String(note || '');
          this._data.pending[i].failReason = '';
          this.save();
          return { ok: true, id: id };
        }
      }
      return { ok: false, reason: '推演请求不存在' };
    },

    // 标记一次失败的推演（不占用 deductionNote，失败条目不出"确认"按钮，可重试）
    setFailReason: function(id, reason) {
      if (!this._data) this.load();
      this._ensureShape();
      for (var i = 0; i < this._data.pending.length; i++) {
        if (this._data.pending[i] && this._data.pending[i].id === id) {
          this._data.pending[i].failReason = String(reason || '');
          this.save();
          return { ok: true, id: id };
        }
      }
      return { ok: false, reason: '推演请求不存在' };
    },

    listPending: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return JSON.parse(JSON.stringify(this._data.pending));
    },

    listHistory: function() {
      if (!this._data) this.load();
      this._ensureShape();
      return JSON.parse(JSON.stringify(this._data.history));
    },

    findPending: function(id) {
      if (!this._data) this.load();
      this._ensureShape();
      for (var i = 0; i < this._data.pending.length; i++) {
        if (this._data.pending[i] && this._data.pending[i].id === id) {
          return JSON.parse(JSON.stringify(this._data.pending[i]));
        }
      }
      return null;
    },

    clear: function() {
      this._data = this._empty();
      this.save();
    }
  };

  // ============ 工具注册 ============
  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'NpcDeduction 工具注册失败：ToolExecutor 未就绪');
      }
      return;
    }
    var D = NpcDeduction;

    // ---- request_deduction ----
    ToolExecutor.WHITELIST.request_deduction = {
      run: function(a) {
        if (!a.id) return { ok: false, reason: '缺少 id' };
        if (!a.text) return { ok: false, reason: '缺少 text' };
        var npcName = a.id;
        var defExists = false;
        try {
          var wb = (GameState.currentCard && GameState.currentCard.worldbook) || {};
          (wb.npcs || []).forEach(function(n) {
            if (n && (n.id === a.id || n.name === a.id)) {
              defExists = true;
              npcName = n.name || a.id;
            }
          });
        } catch (e) {}
        if (!defExists) return { ok: false, reason: 'NPC 不存在：' + a.id };
        var r = D.requestDeduction({
          npcId: a.id,
          npcName: npcName,
          factText: a.text,
          sourceNote: a.sourceNote || '',
          requestedBy: 'ai'
        });
        if (!r.ok) return r;
        return {
          ok: true,
          type: 'npc_deduction',
          action: 'request',
          pendingId: r.id,
          npcId: a.id,
          npcName: npcName,
          factText: a.text,
          label: '请求推演：' + npcName + ' → ' + a.text
        };
      }
    };

    // ---- query_deductions ----
    ToolExecutor.WHITELIST.query_deductions = {
      run: function() {
        return {
          ok: true,
          type: 'query',
          queryType: 'deductions',
          data: {
            pending: D.listPending(),
            history: (typeof D.listHistory === 'function') ? D.listHistory() : []
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
  if (typeof window !== 'undefined') window.NpcDeduction = NpcDeduction;
  if (typeof module !== 'undefined' && module.exports) module.exports = NpcDeduction;
})();

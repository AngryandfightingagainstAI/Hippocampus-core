// ============================================================
// 快照栈 · 多轮撤销
// v2：快照包含所有系统的运行时状态，回退时一并恢复
//     覆盖：NPC 运行时 / 事件 / 任务 / 成就 / 天气 / 状态卡 / 商店 / 骰子历史
// 每轮 AI 调用前压快照，回退时恢复数据 + 截断历史 + 删后续快照
// 保留最近 MAX 轮
// ★ P54·§四 F1：chatLength 是「当时的数组下标」，而日志压缩会把历史重建成
//   [system] + 保留窗口（story.js maybeCompress）⇒ 下标整体前移，老的
//   chatLength 不再指向同一位置。现在压快照时另外记下最后一条消息（及其
//   前驱）的指纹当锚点，回退时按内容找切点；锚点本身也已被压缩归档时
//   **拒绝回退**，不再做「状态回退、对话不动」的分裂回退（旧实现还会把
//   之后的快照删掉，玩家连再退一次的机会都没有）。
// ============================================================

(function() {
  var MAX = 30;

  var Snapshots = {
    MAX: MAX,
    _dirEnsured: null,

    _dir: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/snapshots';
    },

    _path: function(round) {
      var d = this._dir();
      if (!d) return null;
      return d + '/r' + String(round).padStart(4, '0') + '.json';
    },

    // P72·W0-a：快照轮号改读全局单调轴 _roundSeq（玩家真行动入队时 +1，见 story.js
    //   sendAction 三处；切分支/截断都不回跳）。旧口径（数主线真玩家）继续当显示轴
    //   用——在 ui_core._currentRoundNum，与本函数解耦。
    _currentRound: function() {
      return (typeof GameState._roundSeq === 'number') ? GameState._roundSeq : 0;
    },

    // ---------- ★ P54·§四 F1：跨压缩回退的切点 ----------
    // 压缩只从头部丢消息、保留尾部连续段 ⇒ 只要快照点上那条消息还在，
    // 就能按内容把它找回来，切在它后面。
    _fp: function(m) {
      var c = String((m && m.content) || '');
      var h = 0;
      for (var i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) | 0;
      return { role: (m && m.role) || '', len: c.length, hash: h };
    },

    _fpMatch: function(m, fp) {
      if (!m || !fp) return false;
      return m.role === fp.role && String(m.content || '').length === fp.len &&
             this._fp(m).hash === fp.hash;
    },

    // 返回 { cut, how, drift }：cut = 要保留的历史条数；cut < 0 表示原文已被
    // 压缩归档、无法可靠回退（reason 给玩家看）。前驱指纹用来消歧：玩家重复
    // 同一句输入时，只认「前一条也对得上」的那个位置。
    // ★ P72：快照改记 messageId（压栈时的主线末节点 id），有树档优先按 id
    //   在主线上定位切点（跨压缩/重复输入都稳）；id 不在主线（无树档、节点
    //   已被压缩删掉、或切到别的分支）时退回锚点指纹法，行为与旧版一致。
    _cutIndex: function(snap) {
      var hist = GameState.chatHistory || [];
      var want = snap.chatLength || 0;
      if (snap.messageId && GameState.messageTree && typeof MessageTree !== 'undefined') {
        var mi = MessageTree.mainlineIndexOf(snap.messageId);
        if (mi >= 0) return { cut: mi + 1, how: 'msg-id', drift: want - (mi + 1) };
      }
      if (!snap.anchor) {
        // 升级前压的旧快照：没有锚点，沿用老口径（长度没缩就还能对上）；缩过就拒绝
        if (want <= hist.length) return { cut: want, how: 'legacy-length', drift: 0 };
        return { cut: -1, reason: '这份快照的对话原文已被压缩归档，无法可靠回退' };
      }
      var bound = Math.min(hist.length, want || hist.length);
      for (var i = bound - 1; i >= 0; i--) {
        if (!this._fpMatch(hist[i], snap.anchor)) continue;
        if (snap.anchorLead && !this._fpMatch(hist[i - 1], snap.anchorLead)) continue;
        return { cut: i + 1, how: 'anchor', drift: want - (i + 1) };
      }
      return { cut: -1, reason: '这份快照的对话原文已被压缩归档，无法可靠回退' };
    },

    // ============ 系统运行时抓取 ============
    _grabSystemData: function() {
      var out = {};
      // 全部走各系统的公开 getRuntime()（内部会 load + 深拷贝）
      // 不再触碰任何模块的私有字段 _data
      function grab(key, mod) {
        try {
          if (typeof mod !== 'undefined' && mod && typeof mod.getRuntime === 'function') {
            var v = mod.getRuntime();
            if (v !== undefined && v !== null) out[key] = v;
          }
        } catch (e) {
          console.warn('[Snapshots] 抓取 ' + key + ' 失败：', e);
        }
      }
      grab('npcRuntime', typeof NpcRuntime !== 'undefined' ? NpcRuntime : null);
      grab('events', typeof Events !== 'undefined' ? Events : null);
      grab('tasks', typeof Tasks !== 'undefined' ? Tasks : null);
      grab('achievements', typeof Achievements !== 'undefined' ? Achievements : null);
      grab('weather', typeof Weather !== 'undefined' ? Weather : null);
      grab('statusCard', typeof StatusCard !== 'undefined' ? StatusCard : null);
      grab('shop', typeof Shop !== 'undefined' ? Shop : null);
      grab('diceHistory', typeof DiceHistory !== 'undefined' ? DiceHistory : null);
      grab('proposals', typeof Proposals !== 'undefined' ? Proposals : null);
      grab('outputs', typeof Outputs !== 'undefined' ? Outputs : null);
      grab('npcDeduction', typeof NpcDeduction !== 'undefined' ? NpcDeduction : null);
      return out;
    },

    // ============ 系统运行时恢复 ============
    _putSystemData: function(sys) {
      if (!sys || typeof sys !== 'object') return;
      // 全部走各系统的公开 setRuntime()（内部会 _ensureShape + save）
      function put(key, mod) {
        try {
          if (typeof mod === 'undefined' || !mod || typeof mod.setRuntime !== 'function') return;
          if (sys[key] !== undefined) {
            mod.setRuntime(sys[key]);
            return;
          }
          // 旧快照没有这些键时按空状态恢复，否则回滚后会残留回滚前的新数据（与其余系统不一致）
          if ((key === 'proposals' || key === 'outputs' || key === 'npcDeduction') &&
              typeof mod.clear === 'function') {
            mod.clear();
          }
        } catch (e) {
          console.warn('[Snapshots] 恢复 ' + key + ' 失败：', e);
        }
      }
      put('npcRuntime', typeof NpcRuntime !== 'undefined' ? NpcRuntime : null);
      put('events', typeof Events !== 'undefined' ? Events : null);
      put('tasks', typeof Tasks !== 'undefined' ? Tasks : null);
      put('achievements', typeof Achievements !== 'undefined' ? Achievements : null);
      put('weather', typeof Weather !== 'undefined' ? Weather : null);
      put('statusCard', typeof StatusCard !== 'undefined' ? StatusCard : null);
      put('shop', typeof Shop !== 'undefined' ? Shop : null);
      put('diceHistory', typeof DiceHistory !== 'undefined' ? DiceHistory : null);
      put('proposals', typeof Proposals !== 'undefined' ? Proposals : null);
      put('outputs', typeof Outputs !== 'undefined' ? Outputs : null);
      put('npcDeduction', typeof NpcDeduction !== 'undefined' ? NpcDeduction : null);
    },

    // ============ 压快照（每轮 AI 调用前调用） ============
    push: function(reason) {
      var d = this._dir();
      if (!d) return false;
      var round = this._currentRound();
      if (round === 0) return false;
      if (this._dirEnsured !== d) {
        VFS.mkdir(d);
        this._dirEnsured = d;
      }

      var hist = GameState.chatHistory || [];
      var snap = {
        round: round,
        // P72·W0-a：快照轴轮号（与 round 同值；单独存字段是为了老快照缺失时能识别回落）
        roundSeq: round,
        timestamp: Date.now(),
        reason: reason || '',
        chatLength: hist.length,
        // ★ P72：主线末节点 id——回退时优先按它在树上定位切点
        messageId: (GameState.messageTree && GameState.messageTree.activeLeafId) || null,
        // ★ P54·§四 F1：切点锚点（见 _cutIndex 注释）
        anchor: this._fp(hist[hist.length - 1]),
        anchorLead: hist.length > 1 ? this._fp(hist[hist.length - 2]) : null,
        playerData: JSON.parse(JSON.stringify(GameState.playerData || {})),
        currentState: JSON.parse(JSON.stringify(GameState.currentState || {})),
        gameTime: GameState._gameTime ? JSON.parse(JSON.stringify(GameState._gameTime)) : null,
        pendingNotices: JSON.parse(JSON.stringify(GameState._pendingSystemNotices || [])),
        systems: this._grabSystemData()
      };
      VFS.writeJSON(this._path(round), snap);
      this._cleanup();
      return true;
    },

    // ============ 列出所有快照（按轮次升序） ============
    list: function() {
      var d = this._dir();
      if (!d) return [];
      var files = VFS.listAll(d).filter(function(p) { return p.endsWith('.json'); });
      var snaps = [];
      files.forEach(function(p) {
        var s = VFS.readJSON(p);
        if (s) snaps.push({ round: s.round, timestamp: s.timestamp, reason: s.reason });
      });
      snaps.sort(function(a, b) { return a.round - b.round; });
      return snaps;
    },

    // ============ 回退到某轮开始前 ============
    rollbackTo: function(round) {
      var snap = VFS.readJSON(this._path(round));
      if (!snap) return { ok: false, reason: '快照不存在' };

      // 0. ★ P54·§四 F1：先算切点 —— 算不出来就整条拒绝，绝不进入
      //    「状态已回退、对话没截断」的分裂状态（下面第 4 步还会把之后的
      //    快照删掉，那玩家连再退一次都不行）。
      var cut = this._cutIndex(snap);
      if (cut.cut < 0) return { ok: false, reason: cut.reason, split: true };

      // 1. 恢复基础数据
      GameState.playerData = snap.playerData || {};
      GameState.currentState = snap.currentState || null;
      GameState._gameTime = snap.gameTime || null;
      GameState._pendingSystemNotices = snap.pendingNotices || [];
      // P72·W0-a：快照轴恢复到目标值（老快照缺 roundSeq 时回落 round，两值同源同数）
      GameState._roundSeq = (snap.roundSeq != null ? snap.roundSeq : snap.round) || 0;

      // 2. 截断历史（按锚点算出的切点，不再是「当时的下标」）
      GameState.chatHistory = (GameState.chatHistory || []).slice(0, cut.cut);
      // ★ P72：有树档时同步截树（删切点之后的节点、activeLeafId 回退到切点末节点），
      //   并用主线导出覆盖 chatHistory——与上面 slice 的内容一致（元素同引用）
      if (GameState.messageTree && typeof MessageTree !== 'undefined') {
        MessageTree.truncateToCount(cut.cut);
      }

      // 3. 恢复各系统运行时状态
      if (snap.systems) {
        this._putSystemData(snap.systems);
      } else if (snap.npcRuntime && typeof NpcRuntime !== 'undefined' && NpcRuntime.setRuntime) {
        // 兼容旧快照：只有 npcRuntime 字段、没有 systems 字段
        NpcRuntime.setRuntime(snap.npcRuntime);
      }

      // 4. 删除之后的所有快照
      var self = this;
      this.list().forEach(function(s) {
        if (s.round > round) VFS.deleteFile(self._path(s.round));
      });

      // 5. 换 session token 阻断挂起请求
      GameState._sessionToken = Date.now();

      // 6. 静态缓存失效（玩家数据变了）
      try { GameState.invalidateCache(); } catch (e) {}

      return { ok: true, round: round, snap: snap, cut: cut.cut, cutBy: cut.how };
    },

    rollbackLast: function() {
      var snaps = this.list();
      if (!snaps.length) return { ok: false, reason: '没有快照' };
      return this.rollbackTo(snaps[snaps.length - 1].round);
    },

    peek: function(round) {
      return VFS.readJSON(this._path(round));
    },

    clear: function() {
      var d = this._dir();
      if (!d) return;
      VFS.rmdir(d, true);
    },

    _cleanup: function() {
      var snaps = this.list();
      if (snaps.length <= MAX) return;
      var self = this;
      snaps.slice(0, snaps.length - MAX).forEach(function(s) {
        VFS.deleteFile(self._path(s.round));
      });
    }
  };

  if (typeof window !== 'undefined') window.Snapshots = Snapshots;
  if (typeof module !== 'undefined' && module.exports) module.exports = Snapshots;
})();
// ============================================================
// NPC 推演 AI · 批 3-2
// 输入边界：给 NPC knownFacts + 日志摘要（date≤当前日）+ 世界公共设定
//          不给 fanFuture / 未到达 storyNodes / endings / foreshadows
//          / 当前场景 / 当前对话
// 输出：{ canDeduce: bool, chain?, reason? }
// 分层：B 类 · 经 ApiClient 发起 AI 调用，逻辑本身干净
// ============================================================

(function() {
  var MAX_LOGS = 5;

  var NpcDeductionAI = {
    _running: {},
    _generation: 0,

    // 切存档 / 快照回滚 / 显式 load 时由数据层调用，作废全部在飞推演
    bumpGeneration: function() {
      this._generation++;
    },

    run: async function(pendingId) {
      if (!pendingId) return { ok: false, reason: '缺少 pendingId' };
      if (this._running[pendingId]) return { ok: false, reason: '已在推演中' };
      if (typeof NpcDeduction === 'undefined') return { ok: false, reason: '数据层未加载' };
      if (typeof ApiClient === 'undefined') return { ok: false, reason: 'ApiClient 未加载' };

      var pending = NpcDeduction.findPending(pendingId);
      if (!pending) return { ok: false, reason: 'pending 不存在' };
      if (pending.deductionNote) return { ok: false, reason: '已有推理链' };

      var cfg = this._getConfig();
      if (!cfg.enabled) return { ok: false, reason: '推演系统未启用' };

      this._running[pendingId] = true;
      var gen = this._generation;
      var self = this;
      try {
        // 重试入口：清掉上一次的失败标记
        this._safeSetFail(pendingId, '');
        var prompt = this._buildPrompt(pending);
        var opts = { max_tokens: 500, temperature: 0.3 };
        if (cfg.profileId) opts.profileId = cfg.profileId;
        var content = await ApiClient.chat([{ role: 'user', content: prompt }], opts);

        // 等待期间玩家可能已确认/拒绝，或存档切换/快照回滚：全部静默放弃
        if (self._generation !== gen) return { ok: false, reason: '数据已切换，结果作废' };
        var fresh = NpcDeduction.findPending(pendingId);
        if (!fresh) return { ok: false, reason: '推演请求已被处理' };
        if (fresh.deductionNote) return { ok: false, reason: '已有推理链' };

        var parsed = this._parseResponse(content);
        if (!parsed) {
          self._safeSetFail(pendingId, 'AI 输出无法解析');
          return { ok: false, reason: 'AI 输出无法解析' };
        }
        if (parsed.canDeduce) {
          // chain 为空的肯定判定不成立，按失败处理，不能让玩家确认无依据的知识
          if (!parsed.chain) {
            self._safeSetFail(pendingId, 'AI 判定可推演但未给出推理链');
            return { ok: false, reason: '推理链为空' };
          }
          var nr = NpcDeduction.setDeductionNote(pendingId, parsed.chain);
          if (!nr || !nr.ok) return { ok: false, reason: (nr && nr.reason) || '推理链回填失败' };
          return { ok: true, pendingId: pendingId, chain: parsed.chain };
        } else {
          var reasonText = parsed.reason || 'NPC 没有足够信息推出这件事';
          var rr = NpcDeduction.rejectDeduction(pendingId, reasonText, 'auto_rejected');
          if (!rr || !rr.ok) return { ok: false, reason: (rr && rr.reason) || '自动拒绝失败' };
          // 只有数据层确实入账了，才向 AI 推改口通知
          try {
            GameState._pendingSystemNotices.push(
              'NPC「' + (fresh.npcName || fresh.npcId) + '」不该知道「' + fresh.factText +
              '」（引擎推演判定：' + reasonText + '）。请下轮改口。'
            );
          } catch (e) {}
          return { ok: true, pendingId: pendingId, rejected: true, reason: reasonText };
        }
      } catch (e) {
        // 失败回写本身必须容错：save() 再抛也不能让 run 的 Promise reject
        self._safeSetFail(pendingId, '请求失败：' + (e && e.message ? e.message : String(e)));
        return { ok: false, reason: e && e.message ? e.message : String(e) };
      } finally {
        delete self._running[pendingId];
      }
    },

    // 容错的失败标记：任何异常都吞掉（catch 路径里绝不能再抛）
    _safeSetFail: function(pendingId, reason) {
      try { NpcDeduction.setFailReason(pendingId, reason); } catch (e) {}
    },

    runAllPending: function() {
      if (typeof NpcDeduction === 'undefined') return { count: 0 };
      var list = NpcDeduction.listPending();
      var count = 0;
      var self = this;
      list.forEach(function(p) {
        if (!p || !p.id) return;
        if (p.deductionNote || p.failReason) return;
        if (self._running[p.id]) return;
        self.run(p.id).catch(function(e) {
          if (typeof console !== 'undefined') console.warn('[NpcDeductionAI] run 异常：', e);
        });
        count++;
      });
      return { count: count };
    },

    _getConfig: function() {
      try {
        var g = Storage.getGlobal();
        var c = g.npcDeduction || {};
        return {
          enabled: !!c.enabled,
          profileId: c.profileId || null,
          autoTrigger: !!c.autoTrigger
        };
      } catch (e) {
        return { enabled: false, profileId: null, autoTrigger: false };
      }
    },

    _buildPrompt: function(pending) {
      var card = GameState.currentCard || {};
      var wb = card.worldbook || {};
      var ws = wb.worldSetting || {};
      var npcs = wb.npcs || [];
      var npcDef = null;
      npcs.forEach(function(n) { if (!npcDef && n.id === pending.npcId) npcDef = n; });

      var knownFacts = [];
      try {
        if (typeof NpcRuntime !== 'undefined') {
          var rt = NpcRuntime.get(pending.npcId);
          if (rt && Array.isArray(rt.knownFacts)) knownFacts = rt.knownFacts.slice();
        }
      } catch (e) {}

      var logs = [];
      try {
        if (typeof Logger !== 'undefined' && GameState.currentCardId && GameState.currentSaveId) {
          logs = Logger.getRecentSummaries(GameState.currentCardId, GameState.currentSaveId, MAX_LOGS) || [];
        }
      } catch (e) {}

      var lines = [];
      lines.push('你是 NPC 知识推演器。判断某个 NPC 是否能从它已知的事实中推出某件事。');
      lines.push('');
      lines.push('【规则】');
      lines.push('1. 只输出一个 JSON 对象，不要解释、不要 markdown 代码块。');
      lines.push('2. 格式：{"canDeduce": true/false, "chain": "因为 A、B，所以 C", "reason": "一句话"}');
      lines.push('3. canDeduce=true 时，chain 必须写清推理链（因为 A、B，所以 C）；reason 留空字符串。');
      lines.push('4. canDeduce=false 时，reason 用一句话说清为什么推不出来；chain 留空字符串。');
      lines.push('5. 推理链必须基于该 NPC 的已知事实和公开信息，不许编造。');
      lines.push('6. 不许引用该 NPC 尚未目击/被告知的场景。');
      lines.push('');
      lines.push('【NPC 静态设定】');
      lines.push('id：' + pending.npcId);
      lines.push('姓名：' + (pending.npcName || '（无）'));
      if (npcDef) {
        if (npcDef.desc) lines.push('描述：' + npcDef.desc);
        if (npcDef.keywords && npcDef.keywords.length) lines.push('关键词：' + npcDef.keywords.join('、'));
      }
      lines.push('');
      lines.push('【NPC 已知事实】');
      if (!knownFacts.length) {
        lines.push('（该 NPC 目前没有任何已知事实）');
      } else {
        knownFacts.forEach(function(f) {
          if (typeof f === 'string') {
            lines.push('· ' + f);
          } else if (f && f.text) {
            var head = f.acquiredAt ? ('[' + f.acquiredAt + '·' + (f.source || '?') + ']') : '[' + (f.source || '?') + ']';
            lines.push('· ' + head + ' ' + f.text);
          }
        });
      }
      lines.push('');
      lines.push('【世界公共设定】');
      if (ws.worldName) lines.push('世界名：' + ws.worldName);
      if (ws.mainStage) lines.push('主要舞台：' + ws.mainStage);
      if (ws.description) lines.push('简介：' + ws.description);
      lines.push('');
      lines.push('【最近发生的事】');
      if (!logs.length) {
        lines.push('（暂无日志）');
      } else {
        logs.forEach(function(s) {
          lines.push('[' + (s.date || '?') + '] ' + (s.title || '') + '：' + String(s.summary || '').slice(0, 200));
        });
      }
      lines.push('');
      lines.push('【当前游戏日期】' + (GameState.formatGameTime ? GameState.formatGameTime() : '?'));
      lines.push('');
      lines.push('【需要判断的事实】');
      lines.push('该 NPC 是否可能知道：' + pending.factText);
      if (pending.sourceNote) lines.push('（请求推演的来源说明：' + pending.sourceNote + '）');
      lines.push('');
      lines.push('现在输出 JSON。');
      return lines.join('\n');
    },

    _parseResponse: function(content) {
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
          try {
            var fixed = CardDiagnose.fixJSONText(s);
            parsed = JSON.parse(fixed.result);
          } catch (e2) { return null; }
        } else return null;
      }
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        canDeduce: parsed.canDeduce === true,
        chain: typeof parsed.chain === 'string' ? parsed.chain.slice(0, 1000) : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : ''
      };
    }
  };
  if (typeof window !== 'undefined') window.NpcDeductionAI = NpcDeductionAI;
  if (typeof module !== 'undefined' && module.exports) module.exports = NpcDeductionAI;
})();

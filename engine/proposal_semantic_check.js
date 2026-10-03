// ============================================================
// 提议校验器 · B 层（AI 语义，烧 token，默认关）
// A 层通过后，用 AI 判断这条提议在"世界变了之后"还成不成立
// 触发条件：提议创建超过 N 轮 / 跨日
// 分层：B 类 · AI 语义校验，默认关；代码本身不直碰平台，经 ApiClient 发起 AI 调用
// ============================================================

(function() {
  var ProposalSemanticCheck = {

    // 主入口：判断一条提议是否该跑 B 层
    // 返回 true / false
    shouldRun: function(prop) {
      if (!prop) return false;
      var cfg = this._getConfig();
      if (!cfg.enabled) return false;

      // 条件 1：提议创建超过 N 轮
      var currentRound = this._roundCount();
      var propRound = prop.round || 0;
      if (currentRound - propRound >= (cfg.triggerAfterRounds || 3)) return true;

      // 条件 2：跨日（提议创建时的日期 ≠ 当前日期）
      var createdDate = this._dateOnly(prop.createdAt);
      var currentDate = this._dateOnly(GameState.formatGameTime());
      if (createdDate && currentDate && createdDate !== currentDate) return true;

      return false;
    },

    // 跑 B 层校验。返回 Promise<{ ok: bool, reason?: string }>
    // ok=true 表示"提议仍然成立，可以执行"
    // ok=false 表示"AI 觉得失效了"，reason 是 AI 生成的自然语言
    run: async function(prop) {
      if (!prop) return { ok: true };
      if (typeof ApiClient === 'undefined') return { ok: true };
      var cfg = this._getConfig();

      try {
        var prompt = this._buildPrompt(prop);
        var opts = { max_tokens: 300, temperature: 0.3 };
        if (cfg.profileId) opts.profileId = cfg.profileId;
        var content = await ApiClient.chat([
          { role: 'user', content: prompt }
        ], opts);
        return this._parseResponse(content);
      } catch (e) {
        // B 层失败时放行（不阻塞玩家）
        if (typeof console !== 'undefined') console.warn('[ProposalSemanticCheck] 校验失败：', e);
        return { ok: true };
      }
    },

    // ============ 内部 ============

    _getConfig: function() {
      try {
        var g = Storage.getGlobal();
        var c = g.proposalCheck || {};
        return {
          enabled: !!c.enabled,
          profileId: c.profileId || null,
          triggerAfterRounds: c.triggerAfterRounds || 3
        };
      } catch (e) {
        return { enabled: false, profileId: null, triggerAfterRounds: 3 };
      }
    },

    _roundCount: function() {
      return (GameState.chatHistory || []).filter(function(m) {
        return m.role === 'user' && !String(m.content || '').startsWith('【系统 ·');
      }).length;
    },

    _dateOnly: function(timeStr) {
      if (!timeStr) return '';
      var m = String(timeStr).match(/^(\d+-\d+-\d+)/);
      return m ? m[1] : '';
    },

    _buildPrompt: function(prop) {
      var lines = [];
      lines.push('你是游戏世界的一致性检查器。');
      lines.push('有一条玩家之前发起的变更申请，现在世界可能已经变了。');
      lines.push('请判断：这条申请在当前世界里还成立吗？');
      lines.push('');
      lines.push('【规则】');
      lines.push('1. 只输出一个 JSON 对象，不要解释、不要 markdown 代码块。');
      lines.push('2. 格式：{"valid": true 或 false, "reason": "一句话说明"}');
      lines.push('3. reason 会直接展示给玩家看。所以要说人话——不要出现"引擎/AI/提议/校验/申请"这类技术词。');
      lines.push('4. 用剧情内的语言。比如不要写"目标 NPC 已不存在"，要写"林霜已经不在了"。');
      lines.push('5. 如果判断成立，valid 填 true，reason 留空字符串。');
      lines.push('6. 如果判断失效，valid 填 false，reason 用一句话说清为什么。');
      lines.push('');
      lines.push('【变更申请】');
      lines.push('类型：' + prop.type);
      lines.push('内容：' + JSON.stringify(prop.payload || {}).slice(0, 800));
      if (prop.reason) lines.push('玩家当时的意思：' + prop.reason);
      lines.push('提出时间：' + (prop.createdAt || '?'));
      lines.push('');
      lines.push('【当前世界】');
      lines.push('游戏时间：' + GameState.formatGameTime());
      lines.push('');
      // 状态快照
      try {
        var st = GameState.currentState;
        if (st) {
          var hudLine = (st.hud || []).map(function(h) { return h.key + '=' + h.current; }).join(' | ');
          if (hudLine) lines.push('HUD：' + hudLine);
          var sbLine = (st.sidebar || []).map(function(s) { return s.key + '=' + s.current; }).join(' | ');
          if (sbLine) lines.push('状态：' + sbLine);
        }
      } catch (e) {}
      // 最近日志摘要
      try {
        if (typeof Logger !== 'undefined' && GameState.currentCardId && GameState.currentSaveId) {
          var sums = Logger.getRecentSummaries(GameState.currentCardId, GameState.currentSaveId, 3);
          if (sums.length) {
            lines.push('');
            lines.push('【最近发生的事】');
            sums.forEach(function(s) {
              lines.push('[' + s.date + '] ' + (s.title || '') + '：' + (s.summary || '').slice(0, 200));
            });
          }
        }
      } catch (e) {}
      lines.push('');
      lines.push('现在输出 JSON。');
      return lines.join('\n');
    },

    _parseResponse: function(content) {
      if (!content) return { ok: true };
      var s = String(content).trim();
      // 去掉可能的 markdown 包裹
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      // 提取 JSON 对象
      var start = s.indexOf('{');
      var end = s.lastIndexOf('}');
      if (start < 0 || end <= start) return { ok: true };
      s = s.slice(start, end + 1);
      var parsed = null;
      try { parsed = JSON.parse(s); } catch (e) {
        // 尝试修复
        if (typeof CardDiagnose !== 'undefined' && CardDiagnose.fixJSONText) {
          try {
            var fixed = CardDiagnose.fixJSONText(s);
            parsed = JSON.parse(fixed.result);
          } catch (e2) { return { ok: true }; }
        } else {
          return { ok: true };
        }
      }
      if (!parsed || typeof parsed !== 'object') return { ok: true };
      if (parsed.valid === false && parsed.reason) {
        return { ok: false, reason: String(parsed.reason).slice(0, 300) };
      }
      return { ok: true };
    }

  };
  if (typeof window !== 'undefined') window.ProposalSemanticCheck = ProposalSemanticCheck;
  if (typeof module !== 'undefined' && module.exports) module.exports = ProposalSemanticCheck;
})();

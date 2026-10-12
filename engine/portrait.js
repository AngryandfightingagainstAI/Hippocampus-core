// ============================================================
// 人设审核 / 生成（两阶段流程）
// 阶段 1：AI 审核人设在世界观中的合理性 → 输出 verdict + issues
// 阶段 2：审核通过后，AI 生成 summary + traits
// 数据存：/saves/{cardId}/{saveId}/portrait.json
// 也同步一份到 playerData.portrait 供 prompt 注入
// ============================================================

(function() {
  var Portrait = {
    _path: function() {
      if (!GameState.currentCardId || !GameState.currentSaveId) return null;
      return '/saves/' + GameState.currentCardId + '/' + GameState.currentSaveId + '/portrait.json';
    },

    // 从存档读取
    load: function() {
      var p = this._path();
      if (!p) return null;
      return VFS.readJSON(p) || null;
    },

    // 写入存档
    save: function(portrait) {
      var p = this._path();
      if (!p) return false;
      VFS.writeJSON(p, portrait);
      if (GameState.playerData) {
        GameState.playerData.portrait = portrait;
      }
      return true;
    },

    // ★ 阶段 1：审核 prompt —— 只审核合理性，不生成 summary
    buildAuditPrompt: function(playerData, discussionHistory) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是人设合理性审核员。审核玩家填写的人设在当前世界观中是否合理。');
      lines.push('');
      lines.push('审核标准：字段是否与世界观/背景矛盾、是否自洽、是否有明显不合理之处。');
      lines.push('轻微瑕疵标 concern，严重矛盾标 conflict，都没问题标 ok。');
      lines.push('');
      lines.push('输出格式（只输出 JSON，不要解释、不要 markdown 代码块）：');
      lines.push('{');
      lines.push('  "verdict": "ok 或 concern 或 conflict",');
      lines.push('  "issues": [{"field":"字段名","severity":"concern或conflict","reason":"原因","suggestion":"修改建议"}],');
      lines.push('  "comment": "一句简短的审核总结（自然语言，给玩家看的）"');
      lines.push('}');
      lines.push('');
      lines.push('如果没有问题，issues 为空数组，verdict 为 "ok"，comment 为一句正面评价。');
      lines.push('');
      lines.push('【游戏背景】');
      lines.push('标题：' + ((card.game && card.game.title) || ''));
      if (card.game && card.game.background) lines.push('背景：' + card.game.background);
      if (card.worldbook && card.worldbook.worldSetting) {
        var ws = card.worldbook.worldSetting;
        if (ws.description) lines.push('世界设定：' + ws.description);
      }
      lines.push('');
      lines.push('【玩家原始填写】');
      Object.keys(playerData || {}).forEach(function(k) {
        if (k === 'inventory' || k === 'portrait') return;
        var v = playerData[k];
        if (v == null || v === '') return;
        var line = '  ' + k + '：' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
        lines.push(line);
      });
      if (discussionHistory && discussionHistory.length) {
        lines.push('');
        lines.push('【之前的讨论】');
        discussionHistory.forEach(function(h) {
          lines.push((h.role === 'user' ? '玩家：' : 'AI：') + h.content);
        });
        lines.push('');
        lines.push('请结合玩家在讨论里提出的所有反馈，重新审核。');
      }
      return lines.join('\n');
    },

    // ★ 阶段 2：生成 prompt —— 审核通过后调用，生成 summary + traits
    buildGeneratePrompt: function(playerData, auditResult) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是角色人设助手。根据玩家的原始填写资料和审核意见，生成一段能让 GM 快速理解这个角色的人设总述。');
      lines.push('');
      lines.push('输出格式（只输出 JSON，不要解释、不要 markdown 代码块）：');
      lines.push('{');
      lines.push('  "summary": "150-250 字的人设总述。第三人称。包含：性格、气质、说话方式、行为倾向、价值观、容易触发反应的点。不要复述属性数字。",');
      lines.push('  "traits": ["4-6 条关键特质，每条一句话，用于 GM 快速判断 NPC 互动时这个角色会怎么反应"]');
      lines.push('}');
      lines.push('');
      lines.push('【游戏背景】');
      lines.push('标题：' + ((card.game && card.game.title) || ''));
      if (card.game && card.game.background) lines.push('背景：' + card.game.background);
      lines.push('');
      lines.push('【玩家原始填写】');
      Object.keys(playerData || {}).forEach(function(k) {
        if (k === 'inventory' || k === 'portrait') return;
        var v = playerData[k];
        if (v == null || v === '') return;
        var line = '  ' + k + '：' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
        lines.push(line);
      });
      if (auditResult && auditResult.comment) {
        lines.push('');
        lines.push('【审核意见】');
        lines.push(auditResult.comment);
      }
      return lines.join('\n');
    },

    // 兼容旧版单 prompt 接口（外部可能还在调）
    buildPrompt: function(playerData, discussionHistory) {
      return this.buildAuditPrompt(playerData, discussionHistory);
    },

    // ★ 解析审核结果（阶段 1）
    parseAuditResponse: function(text) {
      if (!text) return null;
      var s = String(text).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var start = s.indexOf('{');
      var end = s.lastIndexOf('}');
      if (start >= 0 && end > start) s = s.slice(start, end + 1);
      try {
        var p = JSON.parse(s);
        if (!p.verdict) p.verdict = 'ok';
        var verdict = (p.verdict === 'ok' || p.verdict === 'concern' || p.verdict === 'conflict') ? p.verdict : 'ok';
        var issues = Array.isArray(p.issues) ? p.issues.map(function(iss) {
          return {
            field: String(iss.field || ''),
            severity: (iss.severity === 'concern' || iss.severity === 'conflict') ? iss.severity : 'concern',
            reason: String(iss.reason || ''),
            suggestion: String(iss.suggestion || '')
          };
        }) : [];
        return {
          verdict: verdict,
          issues: issues,
          comment: String(p.comment || '')
        };
      } catch (e) {
        return null;
      }
    },

    // ★ 解析生成结果（阶段 2）—— 兼容新旧格式
    parseGenerateResponse: function(text) {
      if (!text) return null;
      var s = String(text).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) s = m[1].trim();
      var start = s.indexOf('{');
      var end = s.lastIndexOf('}');
      if (start >= 0 && end > start) s = s.slice(start, end + 1);
      try {
        var p = JSON.parse(s);
        if (!p.summary) return null;
        return {
          summary: String(p.summary),
          traits: Array.isArray(p.traits) ? p.traits.map(String) : [],
          lockedAt: new Date().toISOString(),
          aiVersion: 1
        };
      } catch (e) {
        return null;
      }
    },

    // 兼容旧版单接口（外部可能还在调）
    parseResponse: function(text) {
      // 尝试当生成结果解析
      return this.parseGenerateResponse(text);
    },

    // 兜底：玩家没走审核流程
    fallback: function(playerData) {
      var traits = [];
      ['house', 'identity', 'race', 'bloodline', 'occupation', 'major'].forEach(function(k) {
        if (playerData[k]) traits.push(k + '：' + playerData[k]);
      });
      return {
        summary: '（未生成人设总述，使用原始字段）',
        traits: traits,
        lockedAt: new Date().toISOString(),
        aiVersion: 0
      };
    },

    // 给 prompt 用：格式化成一段文本
    formatForPrompt: function(portrait) {
      if (!portrait || !portrait.summary) return '';
      var lines = [];
      if (portrait.aiVersion === 0) return '';
      lines.push('【角色人设】');
      lines.push(portrait.summary);
      if (portrait.traits && portrait.traits.length) {
        lines.push('关键特质：');
        portrait.traits.forEach(function(t) { lines.push('· ' + t); });
      }
      return lines.join('\n');
    }
  };

  if (typeof window !== 'undefined') window.Portrait = Portrait;
  if (typeof module !== 'undefined' && module.exports) module.exports = Portrait;
})();

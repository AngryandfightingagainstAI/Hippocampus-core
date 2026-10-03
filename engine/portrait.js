// ============================================================
// 人设审核 / 生成
// 玩家填完创建流程后，AI 生成一段人设总述，写入存档
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

    // 组装"生成人设"的 prompt
    buildPrompt: function(playerData, discussionHistory) {
      var card = GameState.currentCard;
      var lines = [];
      lines.push('你是角色人设助手。根据玩家的原始填写资料，生成一段能让 GM 快速理解这个角色的人设总述。');
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
      if (discussionHistory && discussionHistory.length) {
        lines.push('');
        lines.push('【之前的讨论】');
        discussionHistory.forEach(function(h) {
          lines.push((h.role === 'user' ? '玩家：' : 'AI：') + h.content);
        });
        lines.push('');
        lines.push('请结合玩家在讨论里提出的所有反馈，重新生成人设总述。');
      }
      return lines.join('\n');
    },

    // 解析 AI 返回
    parseResponse: function(text) {
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
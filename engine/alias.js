// ============================================================
// 字段别名表 · 兼容卡带 AI 随意起 key
// v2：暴露 ALIASES / REVERSE，加 hasAliasFor / resolveKey 接口
// 数据存：/saves/{cardId}/{saveId}/player.json 里的 playerData
// 用法：Alias.get(playerData, 'gender') → 从各种可能的 key 里取值
// ============================================================

(function() {

  // 标准 key ← 可能的别名（顺序即优先级）
  var ALIASES = {
    name:       ['name', 'player_name', 'charName', 'char_name', 'character_name', '名字', '姓名', 'player'],
    gender:     ['gender', 'sex', 'player_gender', 'player_sex', '性别'],
    age:        ['age', 'player_age', '年龄'],
    birth_year: ['birth_year', 'birthYear', 'birthday_year', 'yob', '出生年', '生年'],
    birthday:   ['birthday', 'birth_date', '生日'],
    height:     ['height', 'player_height', '身高'],
    appearance: ['appearance', 'looks', '外貌', '长相'],
    background: ['background', 'backstory', 'bio', 'player_background', '背景', '身世'],
    house:      ['house', 'house_id', 'school_house', 'faction_initial', '阵营', '学院'],
    identity:   ['identity', 'player_identity', 'role', '身份'],
    race:       ['race', 'player_race', 'species', '种族'],
    occupation: ['occupation', 'player_occupation', 'job', 'profession', '职业'],
    major:      ['major', 'player_major', '专业'],
    era:        ['era', 'era_id', 'player_era', '时代']
  };

  // 反向索引：任何别名 → 标准 key
  var REVERSE = {};
  Object.keys(ALIASES).forEach(function(std) {
    ALIASES[std].forEach(function(a) {
      REVERSE[a.toLowerCase()] = std;
      REVERSE[a] = std;
    });
  });

  var Alias = {
    // ★ 暴露原始表，供其它模块（runtime_repair / card_diagnose 等）复用
    ALIASES: ALIASES,
    REVERSE: REVERSE,

    // ★ 判断某个字段名是不是某个标准 key 的别名
    hasAliasFor: function(stdKey, fieldKey) {
      if (!stdKey || !fieldKey) return false;
      var list = ALIASES[stdKey];
      if (!list) return false;
      if (list.indexOf(fieldKey) >= 0) return true;
      var lower = String(fieldKey).toLowerCase();
      for (var i = 0; i < list.length; i++) {
        if (String(list[i]).toLowerCase() === lower) return true;
      }
      return false;
    },

    // ★ 把任意字段名解析回标准 key（解析不了返回 null）
    resolveKey: function(fieldKey) {
      if (!fieldKey) return null;
      if (REVERSE[fieldKey]) return REVERSE[fieldKey];
      var lower = String(fieldKey).toLowerCase();
      if (REVERSE[lower]) return REVERSE[lower];
      // 兜底：直接就是标准 key
      if (ALIASES[fieldKey]) return fieldKey;
      return null;
    },

    // 从 playerData 取标准字段值
    get: function(playerData, standardKey) {
      if (!playerData) return null;
      var list = ALIASES[standardKey];
      if (!list) return playerData[standardKey] != null ? playerData[standardKey] : null;

      // 1. 按别名表直接查
      for (var i = 0; i < list.length; i++) {
        var k = list[i];
        if (playerData[k] != null && playerData[k] !== '') return playerData[k];
        // 大小写不敏感
        var lower = k.toLowerCase();
        for (var pk in playerData) {
          if (pk.toLowerCase() === lower && playerData[pk] != null && playerData[pk] !== '') {
            return playerData[pk];
          }
        }
      }

      // 2. 按当前卡带的 steps 字段 label 反查
      try {
        if (typeof GameState !== 'undefined' && GameState.currentCard) {
          var labelMap = {
            name: ['姓名', '名字', '角色名'],
            gender: ['性别'],
            age: ['年龄'],
            birth_year: ['出生年份', '出生年', '生日'],
            height: ['身高'],
            appearance: ['外貌', '长相', '容貌'],
            background: ['背景', '身世', '来由'],
            era: ['时代'],
            house: ['学院', '阵营'],
            identity: ['身份'],
            race: ['种族'],
            occupation: ['职业'],
            major: ['专业']
          };
          var labels = labelMap[standardKey] || [];
          var steps = GameState.currentCard.steps || [];
          for (var si = 0; si < steps.length; si++) {
            var fields = steps[si].fields || [];
            for (var fi = 0; fi < fields.length; fi++) {
              var f = fields[fi];
              if (labels.indexOf(f.label) >= 0 && playerData[f.key] != null && playerData[f.key] !== '') {
                return playerData[f.key];
              }
            }
          }
        }
      } catch (e) {}

      return null;
    },

    // 批量取
    getAll: function(playerData) {
      var out = {};
      Object.keys(ALIASES).forEach(function(std) {
        var v = Alias.get(playerData, std);
        if (v != null) out[std] = v;
      });
      return out;
    },

    // 把 playerData 归一化：直接把别名 key 转成标准 key，覆盖到 playerData 顶层
    // 返回新增/修改的字段数
    normalize: function(playerData) {
      if (!playerData) return 0;
      var changed = 0;
      Object.keys(ALIASES).forEach(function(std) {
        var v = Alias.get(playerData, std);
        if (v != null && playerData[std] == null) {
          playerData[std] = v;
          changed++;
        }
      });
      return changed;
    },

    // 获取当前卡带里定义的字段信息（调试用）
    listCardFields: function() {
      try {
        if (typeof GameState === 'undefined' || !GameState.currentCard) return [];
        var out = [];
        (GameState.currentCard.steps || []).forEach(function(s) {
          (s.fields || []).forEach(function(f) {
            out.push({ stepId: s.id, key: f.key, label: f.label, type: f.type });
          });
        });
        return out;
      } catch (e) { return []; }
    }
  };

  if (typeof window !== 'undefined') window.Alias = Alias;
  if (typeof module !== 'undefined' && module.exports) module.exports = Alias;
})();
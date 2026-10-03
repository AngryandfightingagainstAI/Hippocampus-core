// ============================================================
// 词族表 · 用于输出后置校验
// 检测 AI 正文里是否提到了某种状态变化，但没调对应工具
// 分层：core（核心词）/ extended（扩展词）/ literary（文学化表达）
// 分层：A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function() {
  var WordFamilies = {

    // ============ 受伤 / 流血 ============
    injury: {
      tool: 'modify_hud',
      label: '受伤',
      core: [
        '受伤', '伤口', '流血', '出血', '血流', '渗血', '溢血',
        '酸痛', '刺痛', '疼得', '痛得', '疼痛',
        '划伤', '擦伤', '撞伤', '摔伤', '割伤', '刺伤', '打伤', '砸伤',
        '划了一刀', '割了一刀', '捅了一刀', '砍了一刀',
        '淤青', '淤血', '肿胀', '肿了', '红肿', '骨折', '骨裂',
        '流血不止', '鲜血', '血迹', '血痕', '血渍', '血珠', '血滴',
        '破了', '破皮', '裂开', '皮开肉绽',
        '血', '渗', '滴', '流', '涌', '血迹斑斑'
      ],
      extended: [
        '伤痕', '伤痕累累', '遍体鳞伤', '体无完肤',
        '血肉模糊', '血肉淋漓', '皮破血流', '皮伤肉绽',
        '血淋淋', '鲜血淋漓', '血流如注', '血如泉涌',
        '创伤', '外伤', '内伤', '重伤', '轻伤',
        '负伤', '挂彩', '见红', '皮肉伤'
      ],
      literary: [
        '殷红', '猩红', '血珠', '血滴', '血线'
      ],
      weak: [
        '痕迹', '残迹', '印子', '印痕'
      ]
    },

    // ============ 疲劳 / 困倦 ============
    fatigue: {
      tool: 'modify_sidebar',
      label: '疲劳',
      core: [
        '疲惫', '疲劳', '困了', '困倦', '想睡', '打哈欠',
        '没力气', '乏力', '无力', '酸软', '精疲力尽',
        '撑不住', '扛不住', '顶不住', '站不稳',
        '喘气', '喘息', '大口喘气', '上气不接下气'
      ],
      extended: [
        '力竭', '力尽', '倦怠', '倦乏', '疲乏', '疲倦',
        '昏昏欲睡', '睡眼惺忪', '哈欠连天',
        '精疲力竭', '疲惫不堪', '身心俱疲', '心力交瘁',
        '萎靡不振', '无精打采', '有气无力', '软绵绵'
      ],
      literary: [
        '倦意', '困意', '睡意',
        '眼皮发沉', '眼皮打架', '四肢灌铅', '眼皮像灌了铅'
      ]
    },

    // ============ 饥饿 / 口渴 ============
    hunger: {
      tool: 'modify_sidebar',
      label: '饥饿',
      core: [
        '饥饿', '饿肚子', '空腹', '没吃东西', '没吃饭',
        '口渴', '口干', '嗓子干', '想喝水',
        '饿得', '饿到', '饿极了',
        '肚子叫', '肚子咕咕叫', '胃里空空'
      ],
      extended: [
        '饥馑', '饥荒', '饥寒交迫',
        '饥肠辘辘', '饥火中烧', '饥不择食',
        '食不果腹',
        '口干舌燥', '唇焦口燥', '嗓子冒烟'
      ],
      literary: [
        '腹中空空', '肚皮贴脊梁', '胃像被掏空'
      ]
    },

    // ============ 物品获取 ============
    acquire: {
      tool: 'add_item',
      label: '获得物品',
      core: [
        '拿到', '捡到', '捡起', '拾起', '捡了', '拿了',
        '收下', '取了', '获得', '得到', '入手',
        '搞到', '弄到', '拿到手', '揣进兜里',
        '装进口袋', '塞进包里', '放进口袋'
      ],
      extended: [
        '得手', '到手', '取得', '获取', '夺得', '摘得', '收获',
        '唾手可得', '手到擒来'
      ],
      literary: [
        '落入掌中', '纳入怀中', '收入袖中'
      ]
    },

    // ============ 物品丢失 ============
    loss: {
      tool: 'remove_item',
      label: '丢失物品',
      core: [
        '丢了', '掉了', '不见了', '弄丢',
        '丢失', '遗失', '失掉', '失去',
        '被偷', '被抢', '被夺', '被拿走', '被顺走',
        '用完了', '花光了', '耗尽', '消耗殆尽'
      ],
      extended: [
        '丧失', '失却', '失落', '损失', '遗落',
        '不翼而飞', '下落不明', '不知所踪',
        '荡然无存', '化为乌有', '付之东流'
      ],
      literary: [
        '烟消云散', '销声匿迹', '杳无踪迹'
      ]
    },

    // ============ 金钱变化 ============
    money: {
      tool: 'modify_hud',
      label: '金钱变化',
      core: [
        '花了', '付了', '掏钱', '付钱',
        '买了', '买下', '花费',
        '花光', '花完', '掏空', '倾家荡产', '破产',
        '破费',
        '赚了', '挣了', '进账', '到账',
        '收钱', '收账', '入账',
        '获利', '盈利',
        '剩下', '还剩', '余额', '不够花',
        '钱不够', '缺钱', '没钱', '身无分文', '囊中羞涩'
      ]
    },

    // ============ 关系变化 ============
    relation: {
      tool: 'modify_relation',
      label: '关系变化',
      core: [
        '好感', '亲近', '信任', '依赖', '接受',
        '认可', '赞许', '欣赏', '热络', '熟络',
        '关系变好', '和好了', '重归于好', '回心转意',
        '反感', '厌恶', '讨厌', '疏远', '冷淡', '冷漠', '戒备',
        '警惕', '怀疑', '不信任', '敌意', '敌视', '仇恨',
        '关系变差', '闹翻', '翻脸', '决裂', '绝交'
      ]
    },

    // ============ 天气变化 ============
    weather: {
      tool: 'set_weather',
      label: '天气变化',
      core: [
        '放晴', '阳光明媚', '晴朗',
        '阴天', '多云', '乌云', '阴云',
        '阴沉', '阴郁', '灰蒙蒙',
        '下雨', '落雨', '阵雨', '小雨', '大雨', '暴雨',
        '雷雨', '雨点', '雨滴', '雨丝', '飘雨', '淋雨',
        '倾盆大雨', '瓢泼大雨', '暴风骤雨', '细雨绵绵',
        '下雪', '小雪', '大雪', '暴雪', '飞雪', '雪花',
        '雪片', '积雪', '飘雪', '鹅毛大雪', '大雪纷飞',
        '白雪皑皑', '冰天雪地',
        '起雾', '雾气', '大雾', '浓雾', '薄雾', '雾蒙蒙',
        '云雾', '雾霭',
        '起风', '刮风', '大风', '狂风', '暴风', '台风',
        '微风', '冷风', '热风',
        '狂风暴雨', '朔风'
      ]
    },

    // ============ NPC 登场 / 离场 ============
    npc: {
      tool: 'npc_focus',
      label: 'NPC 登场或离场',
      core: [
        '走来', '进来', '走进', '走来了',
        '出现', '现身', '登场', '冒出来',
        '迎面走来', '从暗处走出',
        '映入眼帘', '出现在门口', '走进门', '踏进',
        '离开', '转身走', '退场',
        '转身离去', '离去', '走远', '远去',
        '退了出去', '退开', '抽身', '告辞'
      ]
    },

    // ============ 成就 / 元层意图 ============
    achievement: {
      tool: 'add_achievement',
      label: '成就',
      core: [
        '应该加', '记一下', '记下来', '记录下来', '添加', '加到',
        '加个', '加一条', '应该改成', '应该是', '不该再',
        '以后别', '不要再', '移除', '删掉'
      ]
    }

  };

  // ============ 检测函数 ============
  // 输入：AI 正文文本
  // 输出：命中的词族列表（去重）
  WordFamilies.detect = function(text) {
    if (!text) return [];
    var t = String(text);
    var hits = [];
    var self = this;

    Object.keys(this).forEach(function(key) {
      if (key === 'detect' || key === 'checkMissing') return;
      var family = self[key];
      if (!family || !family.core) return;

      var strongWords = [];
      if (family.core) strongWords = strongWords.concat(family.core);
      if (family.extended) strongWords = strongWords.concat(family.extended);
      if (family.literary) strongWords = strongWords.concat(family.literary);
      var weakWords = Array.isArray(family.weak) ? family.weak : [];

      var matchedStrong = [];
      strongWords.forEach(function(w) {
        if (w && t.indexOf(w) >= 0 && matchedStrong.indexOf(w) < 0) {
          matchedStrong.push(w);
        }
      });

      // 强词触发规则：单字词不单独触发
      // 必须至少有一个双字词命中，或至少两个单字词同时命中
      var multiChar = matchedStrong.filter(function(w) { return w.length > 1; });
      var singleChar = matchedStrong.filter(function(w) { return w.length === 1; });
      var shouldTrigger = multiChar.length > 0 || singleChar.length >= 2;

      if (shouldTrigger) {
        // 弱词不参与触发判断，只在已触发时辅助补充
        var matchedWeak = [];
        weakWords.forEach(function(w) {
          if (w && t.indexOf(w) >= 0 && matchedWeak.indexOf(w) < 0) {
            matchedWeak.push(w);
          }
        });
        var allMatched = matchedStrong.concat(matchedWeak);
        hits.push({
          family: key,
          label: family.label,
          tool: family.tool,
          matched: allMatched
        });
      }
    });

    return hits;
  };

  // ============ 检查 AI 是否漏调工具 ============
  // 输入：AI 正文文本 + toolResults（已执行的工具结果数组）
  // 输出：疑似漏账的提示列表
  WordFamilies.checkMissing = function(text, toolResults) {
    var hits = this.detect(text);
    if (!hits.length) return [];

    var missing = [];
    hits.forEach(function(h) {
      // 该词族对应的工具输出类型
      var typeKey = h.family === 'injury' || h.family === 'money' ? 'hud' :
                    h.family === 'fatigue' || h.family === 'hunger' ? 'sidebar' :
                    h.family === 'acquire' || h.family === 'loss' ? 'item' :
                    h.family === 'relation' ? 'relation' :
                    h.family === 'weather' ? 'weather' :
                    h.family === 'npc' ? 'npc_state' :
                    h.family === 'achievement' ? 'achievement' : h.family;

      var toolCalled = false;
      if (toolResults && toolResults.length) {
        toolResults.forEach(function(r) {
          if (!r || !r.ok) return;
          if (r.type === typeKey) toolCalled = true;
        });
      }

      if (!toolCalled) {
        missing.push({
          family: h.family,
          label: h.label,
          tool: h.tool,
          words: h.matched.slice(0, 3)
        });
      }
    });

    return missing;
  };

  if (typeof window !== 'undefined') window.WordFamilies = WordFamilies;
  if (typeof module !== 'undefined' && module.exports) module.exports = WordFamilies;
})();

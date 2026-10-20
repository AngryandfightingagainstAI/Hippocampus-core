// ============================================================
// 词族表 · 用于输出后置校验
// 检测 AI 正文里是否提到了某种状态变化，但没调对应工具
// 分层：core（核心词）/ extended（扩展词）/ literary（文学化表达）
// 分层：A 类 · 纯逻辑，不碰 UI / DOM / localStorage / alert
// ============================================================

(function() {

  // ============ 误报豁免：转述 / 回忆 / 假设 ============
  // 命中以下模式的正文，词族触发一律视为转述或回忆，不登记为"漏调工具"。
  function _isReportedOrMemory(text) {
    if (!text) return false;
    var t = String(text);
    // 转述：某人说/道/告诉/问…
    if (/(他|她|它|他们|她们|它们|谁|某人|有人|对方|那人|此人).{0,6}(说|道|告诉|问|回答|喊|叫|嚷|嘀咕|嘟囔|念叨|叹|笑骂)/.test(t)) return true;
    // 回忆 / 回溯
    if (/(我|你|他|她|我们|你们).{0,3}(记得|想起|回忆|回想|怀念|记起|依稀|隐约|仿佛|好像|似乎|恍如|恍然)/.test(t)) return true;
    // 假设 / 条件
    if (/(如果|要是|假如|假若|倘若|万一|若|假使|设若|譬如|比如)/.test(t)) return true;
    // 疑问句（不确定语气）
    if (/吗[？?]|呢[？?]|么[？?]|难道|莫非|是不是/.test(t)) return true;
    return false;
  }

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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
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
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
    },

    // ============ 成就 / 元层意图 ============
    achievement: {
      tool: 'add_achievement',
      expectedTool: 'add_achievement',
      label: '成就',
      core: [
        '应该加', '记一下', '记下来', '记录下来', '添加', '加到',
        '加个', '加一条', '应该改成', '应该是', '不该再',
        '以后别', '不要再', '移除', '删掉'
      ],
      exempt: function(text, words) {
        return _isReportedOrMemory(text);
      }
    },

    // ============ 事件触发 ============
    event: {
      tool: 'trigger_event',
      expectedTool: 'trigger_event',
      label: '事件',
      core: [
        '触发了', '发生了', '事件', '剧情事件',
        '意外发生', '突发事件', '变故', '事端',
        '出事了', '闹出', '惹出'
      ],
      extended: [
        '引爆', '掀起', '引发', '激起', '酿成',
        '事态升级', '局面失控'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "事件"作为普通词（如"公共事件"）不触发
        if (words.length === 1 && words[0] === '事件' && !/触发|发生|引发|引爆|掀起/.test(text)) return true;
        return false;
      }
    },

    // ============ 任务完成 / 接取 ============
    task: {
      tool: 'complete_task',
      expectedTool: 'complete_task',
      label: '任务',
      core: [
        '任务完成', '完成了任务', '任务做完', '交差',
        '接到任务', '接了个任务', '领到任务', '接受委托',
        '委托', '差事', '活儿'
      ],
      extended: [
        '任务失败', '任务放弃', '放弃任务',
        '交付', '复命', '销差'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "任务"作为普通词（如"历史任务"）不触发
        if (words.length === 1 && words[0] === '任务' && !/完成|接到|领到|接受|放弃|失败|做完|交差|销差|委托|复命/.test(text)) return true;
        return false;
      }
    },

    // ============ 结局达成 ============
    ending: {
      tool: 'trigger_ending',
      expectedTool: 'trigger_ending',
      label: '结局',
      core: [
        '结局', '落幕', '终局', '收官',
        '故事结束', '一切都结束了', '尘埃落定',
        '大结局', '圆满结局', '悲惨结局'
      ],
      extended: [
        '尾声', '终章', '曲终人散', '盖棺定论'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "结局"作为讨论/假设不触发
        if (/(如果|要是|假如|假设).{0,6}结局/.test(text)) return true;
        if (/什么结局|怎样的结局|什么样的结局/.test(text)) return true;
        return false;
      }
    },

    // ============ 剧情节点进入 / 完成 ============
    node: {
      tool: 'enter_node',
      expectedTool: 'enter_node',
      label: '剧情节点',
      core: [
        '进入节点', '到达节点', '剧情节点',
        '节点完成', '完成节点', '节点开启',
        '里程碑', '转折点', '关键节点'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "节点"作为网络/技术术语不触发
        if (/网络节点|关节点|淋巴节点|节点电压/.test(text)) return true;
        return false;
      }
    },

    // ============ 伏笔埋设 / 揭示 ============
    foreshadow: {
      tool: 'bury_foreshadow',
      expectedTool: 'bury_foreshadow',
      label: '伏笔',
      core: [
        '埋下伏笔', '埋伏笔', '伏笔',
        '呼应前文', '前后呼应', '回收伏笔',
        '揭示', '揭晓', '真相大白'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "伏笔"作为写作讨论不触发
        if (/伏笔.{0,4}(手法|技巧|写法|大师)/.test(text)) return true;
        // 单纯"揭示/揭晓"需配合真相类词
        if ((words.indexOf('揭示') >= 0 || words.indexOf('揭晓') >= 0) && !/真相|秘密|谜底|谜团/.test(text)) return true;
        return false;
      }
    },

    // ============ 商店 / 交易 ============
    shop: {
      tool: 'open_shop',
      expectedTool: 'open_shop',
      label: '商店交易',
      core: [
        '开商店', '打开商店', '进入商店', '逛商店',
        '买了', '买下', '购入', '入手',
        '卖了', '卖出', '出售', '转手',
        '交易', '买卖', '生意'
      ],
      extended: [
        '讨价还价', '砍价', '讲价', '结账', '买单'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "商店"作为地点名不触发
        if (words.length === 1 && words[0] === '商店' && !/开|打|进|逛/.test(text)) return true;
        // "生意"作为普通词不触发
        if (words.length === 1 && words[0] === '生意' && !/做|谈|成|黄/.test(text)) return true;
        return false;
      }
    },

    // ============ 状态卡变更 ============
    status: {
      tool: 'update_status',
      expectedTool: 'update_status',
      label: '状态卡',
      core: [
        '状态更新', '更新状态', '状态变更', '状态改变',
        '内心独白', '心声', '心理活动'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "状态"泛称不触发
        if (words.length === 1 && words[0] === '状态' && !/更新|变更|改变|设置/.test(text)) return true;
        return false;
      }
    },

    // ============ 信息层发送 / 广播 ============
    info: {
      tool: 'info_send',
      expectedTool: 'info_send',
      label: '信息',
      core: [
        '收到消息', '发来消息', '收到信息', '发来信息',
        '通知', '通报', '告知', '传达',
        '广播', '播报', '散布消息', '放出风声'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "信息"作为泛称不触发
        if (words.length === 1 && words[0] === '信息' && !/收到|发来|通知|通报|告知|传达|广播|播报/.test(text)) return true;
        // "通知"作为动词泛称需配合消息类
        if (words.length === 1 && words[0] === '通知' && !/消息|信息|大家|众人/.test(text)) return true;
        return false;
      }
    },

    // ============ 时间推进 ============
    // 注：时间推进不走工具，而是 AI 输出【时间】块。expectedTool 用伪标记 '__time_block__'，
    //   story.js 判定时检查正文是否含【时间】块，不含且命中时间词则引擎自动推进 gameTime。
    time: {
      tool: '__time_block__',
      expectedTool: '__time_block__',
      label: '时间推进',
      core: [
        '第二天', '第三天', '三天后', '两天后', '一天后',
        '次日', '翌日', '隔日', '次日清晨',
        '入夜', '清晨', '黎明', '拂晓', '黄昏', '傍晚',
        '午夜', '深夜', '半夜', '三更',
        '过了一会', '过了一会儿', '不久', '片刻后',
        '几个时辰后', '一个时辰后',
        '一周后', '一个月后', '一年后',
        '时间流逝', '时光飞逝'
      ],
      extended: [
        '斗转星移', '物换星移', '春去秋来', '寒来暑往'
      ],
      exempt: function(text, words) {
        // 回忆/转述中的时间词不触发推进
        if (_isReportedOrMemory(text)) return true;
        // "我记得那天"不是时间推进
        if (/我记得.{0,4}(那天|那天晚上|那天清晨|那天傍晚)/.test(text)) return true;
        // "第二天"在假设句中不触发
        if (/(如果|要是|假如|假若|倘若|万一).{0,8}第二天/.test(text)) return true;
        // "入夜/清晨"作为场景描写但已有【时间】块的由 story.js 处理，这里只做纯文本豁免
        return false;
      }
    },

    // ============ 技能习得 ============
    skill: {
      tool: 'modify_entry',
      expectedTool: 'modify_entry',
      label: '技能',
      core: [
        '学会了', '掌握了', '习得', '练成了',
        '技能提升', '技能升级', '熟练度提升',
        '领悟了', '参悟', '悟出'
      ],
      exempt: function(text, words) {
        if (_isReportedOrMemory(text)) return true;
        // "学会"泛称不触发（需配合具体技能名）
        if (words.length === 1 && words[0] === '学会了' && !/刀法|剑法|拳法|内功|法术|术|技|艺/.test(text)) return true;
        return false;
      }
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
      if (key === 'detect' || key === 'checkMissing' || key === 'analyze') return;
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

  // ============ 新判定函数（P70 · T1） ============
  // 输入：AI 正文文本 + toolResults（已执行的工具结果数组）+ opts（可选，含 hasTimeBlock）
  // 输出：[{ kind, expectedTool, hit, snippet, exempt, toolCalled, typeKey }]
  //   kind: 词族名
  //   expectedTool: 期望工具名（time 族为 '__time_block__'，表示应输出【时间】块而非调工具）
  //   hit: 命中的词列表
  //   snippet: 命中词周围的正文片段（前 10 后 10 字）
  //   exempt: 是否误报豁免（true = 不登记）
  //   toolCalled: 期望工具是否已被调用（time 族由调用方据 hasTimeBlock 判定）
  //   typeKey: 工具结果的 type 字段值（用于 toolResults 匹配）
  // 纯逻辑、可单测，不调 AI、不碰 DOM。
  WordFamilies.analyze = function(text, toolResults, opts) {
    opts = opts || {};
    var hits = this.detect(text);
    if (!hits.length) return [];

    var out = [];
    var self = this;

    // typeKey 映射：词族 → 工具结果 r.type 的值
    function typeKeyFor(kind) {
      switch (kind) {
        case 'injury': case 'money': return 'hud';
        case 'fatigue': case 'hunger': return 'sidebar';
        case 'acquire': case 'loss': return 'item';
        case 'relation': return 'relation';
        case 'weather': return 'weather';
        case 'npc': return 'npc_state';
        case 'achievement': return 'achievement';
        case 'event': return 'event';
        case 'task': return 'task';
        case 'ending': return 'ending';
        case 'node': return 'node';
        case 'foreshadow': return 'node';   // 伏笔走 story_nodes
        case 'shop': return 'shop';
        case 'status': return 'status';
        case 'info': return 'info';
        case 'skill': return 'entry';
        case 'time': return '__time_block__';
        default: return kind;
      }
    }

    hits.forEach(function(h) {
      var family = self[h.family];
      var expectedTool = (family && family.expectedTool) || h.tool || '';
      var typeKey = typeKeyFor(h.family);

      // 误报豁免
      var exempt = false;
      if (family && typeof family.exempt === 'function') {
        try { exempt = !!family.exempt(text, h.matched); } catch (e) { exempt = false; }
      }

      // 工具是否已调用
      var toolCalled = false;
      if (h.family === 'time') {
        // 时间族：调用方传 hasTimeBlock 表示正文是否含【时间】块
        toolCalled = !!opts.hasTimeBlock;
      } else if (toolResults && toolResults.length) {
        for (var i = 0; i < toolResults.length; i++) {
          var r = toolResults[i];
          if (!r || !r.ok) continue;
          if (r.type === typeKey) { toolCalled = true; break; }
        }
      }

      // 截取命中词周围的片段
      var snippet = '';
      var firstWord = h.matched[0] || '';
      if (firstWord) {
        var idx = String(text).indexOf(firstWord);
        if (idx >= 0) {
          var start = Math.max(0, idx - 10);
          var end = Math.min(String(text).length, idx + firstWord.length + 10);
          snippet = String(text).slice(start, end);
        }
      }

      out.push({
        kind: h.family,
        label: (family && family.label) || h.family,
        expectedTool: expectedTool,
        hit: h.matched.slice(),
        snippet: snippet,
        exempt: exempt,
        toolCalled: toolCalled,
        typeKey: typeKey
      });
    });

    return out;
  };

  if (typeof window !== 'undefined') window.WordFamilies = WordFamilies;
  if (typeof module !== 'undefined' && module.exports) module.exports = WordFamilies;
})();

/* ============================================================
   TurnIntent —— 回合意图确定性分类器（P74·A+ 第 1 层）
   ------------------------------------------------------------
   要解决的问题：HC 里「这一轮是什么性质的互动」从来没有机器表示，
   升降级剧情的裁量权全在模型手里 ⇒ 玩家一句玩笑被写成心理创伤、
   一次搭话被写成关系跃迁、每次互动都按「这一轮该有个高潮」处理。

   设计取舍（重要，别随手改）：
   1. **纯函数、0 次模型调用**：输入玩家这一句（+ 可选的本轮系统提示），
      输出 {class, escalation, confidence, evidence}。词表复用 engine/words.js
      的思路（同一套中文词族，不新造一套 NLP）。
   2. **拿不准 ⇒ chat**：confidence 低的时候上层什么都不加。宁可少约束，
      也不要因为分类器猜错而把一整轮的方向改掉。
   3. **只有非 chat 才产生一句条件指令**（directiveFor）。chat 轮逐字不加，
      保护 P70-T2 的「prompt 逐字不变」门禁与前缀缓存。
   4. 分类只影响「怎么写」，不影响「写什么」：数值/关系/事件仍必须走工具。
   ============================================================ */
var TurnIntent = (function () {
  'use strict';

  var CLASSES = ['chat', 'trade', 'conflict', 'care', 'probe', 'event'];
  var ESCALATIONS = ['none', 'relationship', 'major'];

  // 词表：cls=归类、esc=升级级别（可缺省）、w=权重、re=正则、why=给人看的理由。
  // 权重都是 2，重大/关系跃迁给 3：单次命中就够上非 chat 档，避免漏判。
  var RULES = [
    // ---- 重大后果（死亡/战争/毁坏）⇒ escalation=major
    { cls: 'conflict', esc: 'major', w: 3, re: /(杀|弑|屠城|屠杀|灭门|宣战|叛变|夺权|称王|放火|纵火|炸毁|夷平|毁掉|烧掉整座)/, why: '涉及死亡/战争/毁坏级后果' },
    // ---- 关系跃迁（表白/结为伴侣）⇒ escalation=relationship
    { cls: 'care', esc: 'relationship', w: 3, re: /(表白|告白|求婚|结婚|订婚|在一起|恋爱|约会|示爱|爱上|接吻|亲吻|吻了|做我的人)/, why: '涉及关系跃迁' },
    // ---- 交易 / 讨价
    { cls: 'trade', w: 2, re: /(买|卖|交易|多少钱|价钱|价格|砍价|讨价还价|付钱|付款|退货|进货|赊账|银两|金币|铜板|盘缠|费用)/, why: '在谈买卖/价钱' },
    // ---- 冲突 / 对峙（「打听 / 打探 / 打算 / 打量」不是攻击，用负向先行排除）
    { cls: 'conflict', w: 2, re: /(打(?!听|探|算|量|扮|开|扫|磨|哈|字|包)|揍|攻击|拔剑|拔刀|挥拳|踹|推倒|拦住|威胁|骂|吼|挑衅|质问|吵架|动手|砸|抢)/, why: '在冲突/对峙' },
    // ---- 关心 / 安抚（注意：不包含「表白」这类跃迁词，那条在上面单独算）
    { cls: 'care', w: 2, re: /(安慰|抱住|抱紧|抱了抱|搀|扶着|照顾|担心|心疼|哄|道歉|对不起|谢谢|摸摸头|递水|守着|陪你|陪着|别难过)/, why: '在关心/安抚对方' },
    // ---- 打听 / 试探信息
    { cls: 'probe', w: 2, re: /(打听|问|试探|追问|盘问|观察|留意|搜查|查看|巡视|调查|询问|有没有听说|听说)/, why: '在打听/试探信息' },
    // ---- 推进时间 / 换场景
    { cls: 'event', w: 2, re: /(前往|出发|动身|离开|回家|回房|睡|休息|等到|守夜|上路|赶路|进城|出城|去趟|换个地方|等着看)/, why: '在推进时间/换场景' }
  ];

  // 平票时的优先级：冲突 > 关心 > 交易 > 场景 > 打听 > 闲聊。
  // 冲突排最前是因为「打起来了」被当成闲聊写，比「关心被写成剧情」更伤。
  var PRIORITY = ['conflict', 'care', 'trade', 'event', 'probe'];

  var CLASS_LINES = {
    conflict: '【本轮提示】这是冲突或对峙：NPC 可以拒绝、退让、沉默、走开；不要把它升级成正面冲突，也不要顺手推进关系。',
    care: '【本轮提示】玩家在关心某个角色：允许平淡、笨拙、回避或转移话题；不要当创伤治疗，不要强行安慰或救赎，也不要安排心理顿悟。',
    trade: '【本轮提示】这是交易或讨价：价格、库存、能不能买到以引擎与工具返回为准；谈不成就谈不成，不要为了剧情硬给。',
    probe: '【本轮提示】玩家在打听或试探：NPC 可以不知道、记错、隐瞒、反问或扯开话题；不要把所有信息一次交代完。',
    event: '【本轮提示】玩家在推进时间或换场景：时间与地点按引擎给的走；不要跳时间，也不要替玩家决定去哪。'
  };

  var ESC_LINES = {
    relationship: '【本轮提示】若本轮真的发生关系变化，必须调用 proposal 工具让玩家确认；正文里不许口头宣布关系跃迁。',
    major: '【本轮提示】若本轮真的发生重大事件（死亡/战争/毁坏），必须调用事件或 proposal 工具；正文里不许口头宣布世界级后果。'
  };

  function clamp01(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function isClass(v) { return CLASSES.indexOf(v) >= 0; }
  function isEscalation(v) { return ESCALATIONS.indexOf(v) >= 0; }

  // 从 chatHistory 里取最后一条「真玩家输入」（合成 user 以「【系统 ·」开头，跳过）
  function lastUserText(history) {
    var list = history || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (!m || m.role !== 'user') continue;
      var c = String(m.content || '');
      if (c.indexOf('【系统 ·') === 0) continue;
      if (c.indexOf('【系统状态快照') === 0) continue;
      if (c.indexOf('【系统提示 · 仅本次生效】') === 0) continue;
      return c;
    }
    return '';
  }

  // 主入口：classify({text, notices})
  //   只读、无副作用；同样输入必得同样输出（便于单测与 A/B）。
  function classify(input) {
    var opts = input || {};
    var text = String(opts.text || '');
    var notices = Array.isArray(opts.notices) ? opts.notices : [];
    var evidence = [];
    var score = {};
    CLASSES.forEach(function (c) { score[c] = 0; });
    var escRank = 0;

    RULES.forEach(function (r) {
      var m = text.match(r.re);
      if (!m) return;
      score[r.cls] += r.w;
      evidence.push({ cls: r.cls, word: String(m[0]), why: r.why });
      if (r.esc === 'major') escRank = Math.max(escRank, 2);
      else if (r.esc === 'relationship') escRank = Math.max(escRank, 1);
    });

    // 问句给 probe 加 1 分：像在问事就按「打听」处理（不影响冲突/关心的更高权重）
    if (/(吗|呢|么|嘛|？|\?)\s*$/.test(text)) {
      score.probe += 1;
      evidence.push({ cls: 'probe', word: '问句', why: '以问句结尾' });
    }

    // 本轮系统提示里已经点了事件/时间 ⇒ 也给 event 一分（不覆盖更强的信号）
    var noticeText = notices.map(function (n) { return String(n || ''); }).join(' ');
    if (noticeText && /(事件|时间|日期)/.test(noticeText)) {
      score.event += 1;
      evidence.push({ cls: 'event', word: '系统提示', why: '本轮系统提示涉及事件/时间' });
    }

    var best = 'chat';
    var bestScore = 0;
    PRIORITY.forEach(function (c) {
      if (score[c] > bestScore) { bestScore = score[c]; best = c; }
    });

    if (bestScore <= 0) {
      return { 'class': 'chat', escalation: 'none', confidence: 0.2, evidence: [], textLen: text.length };
    }

    var escalation = escRank === 2 ? 'major' : (escRank === 1 ? 'relationship' : 'none');
    var confidence = clamp01(0.4 + 0.2 * bestScore);
    return {
      'class': best,
      escalation: escalation,
      confidence: Math.round(confidence * 100) / 100,
      evidence: evidence,
      textLen: text.length
    };
  }

  // 给 prompt 用的条件指令：chat + none ⇒ ''（一个字都不加）
  function directiveFor(intent) {
    if (!intent) return '';
    var out = [];
    var cls = intent['class'];
    if (cls && CLASS_LINES[cls]) out.push(CLASS_LINES[cls]);
    var esc = intent.escalation;
    if (esc && ESC_LINES[esc]) out.push(ESC_LINES[esc]);
    return out.join('\n');
  }

  function current() {
    try {
      if (typeof GameState !== 'undefined' && GameState) return GameState._turnIntent || null;
    } catch (e) {}
    return null;
  }

  function set(intent) {
    var val = (intent && isClass(intent['class'])) ? intent : null;
    try {
      if (typeof GameState !== 'undefined' && GameState) GameState._turnIntent = val;
    } catch (e) {}
    return val;
  }

  return {
    CLASSES: CLASSES,
    ESCALATIONS: ESCALATIONS,
    RULES: RULES,
    isClass: isClass,
    isEscalation: isEscalation,
    lastUserText: lastUserText,
    classify: classify,
    directiveFor: directiveFor,
    current: current,
    set: set
  };
})();

if (typeof window !== 'undefined') window.TurnIntent = TurnIntent;
if (typeof module !== 'undefined' && module.exports) module.exports = TurnIntent;

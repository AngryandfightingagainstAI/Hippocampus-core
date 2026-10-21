/* ============================================================
   NarrativeLint —— 叙事越界检测（P74·A+ 第 4 层）
   ------------------------------------------------------------
   定位：**生成之后的确定性检查**，不做生成、不改 prompt。
   五条检查的性质不一样，必须分开对待（这是本模块最重要的约束）：

     agency      结构证据 → 可以当事实用（「你决定/你感到」这种句式是字符串可判的）
     escalation  结构证据 → 可以当事实用（PLAN 声称升级，但工具结果里没有对应 proposal/事件）
     pairing     结构证据 → 可以当事实用（正文写了关系跃迁词，但没有 proposal）
     psych       概率判断 → 只 warn，永不自动改（正则只能抓已知句式）
     ooc         概率判断 → 只 warn，永不自动改（3-gram 重合率是个很粗的代理量）

   设计取舍：
   1. 纯逻辑、无 DOM、无网络：桌面与 RN 共用（engine_sync mirror）。
   2. 不产生任何额外模型调用：调用方（story.js）决定要不要为 agency 花一次小调用修补。
   3. 每条命中都带 excerpt 与 why —— 汇报与日志要能说清「为什么判它越界」。
   4. 阈值偏保守：宁可漏判。误杀一整段正文比漏掉一次「你决定」更伤体验。
   ============================================================ */
var NarrativeLint = (function () {
  'use strict';

  // 玩家主体的「决断 / 内省」动词：这些只能由玩家自己说，叙述者替玩家写就是越界。
  // 注意不包含「走进/抬手/坐下」这类动作 —— 叙述玩家做了什么动作是允许的。
  var AGENCY_INTROSPECT = [
    { p: /(你|玩家)(也|就|便|于是|终于|随即|不由得|忍不住)*\s*(决定|选择|下决心|打消|放弃)/, why: '替玩家做决定', v: ['决定', '选择', '下决心', '打消', '放弃'] },
    { p: /(你|玩家)(心里|暗自|默默|突然|忽然)?\s*(觉得|感到|意识到|明白了|明白过来|懂了|理解了)/, why: '替玩家下判断/写内心', v: ['觉得', '感到', '意识到', '明白', '懂', '理解'] },
    { p: /(你|玩家)(心里|暗自|默默)?\s*(想|想着|心想|暗想|琢磨着|盘算着)/, why: '替玩家写内心活动', v: ['心想', '暗想', '琢磨', '盘算', '想着'] },
    { p: /(你|玩家)(忍不住|不禁|不由得|不由自主地?|下意识地|鬼使神差地)/, why: '替玩家写不由自主的反应', v: ['忍不住', '不禁', '不由得', '不由自主', '下意识', '鬼使神差'] },
    { p: /(你|玩家)(松了口?气|叹了口气|点了点头|摇了摇头|笑了一下|笑了笑|愣了一下|愣住|怔住|沉默了)/, why: '替玩家写表情/反应', v: ['松了口气', '叹气', '点了点头', '摇了摇头', '笑了一下', '笑了笑', '愣了一下', '愣住', '怔住', '沉默'] },
    { p: /你[^。；！？]{0,14}(感到|感觉到|觉出)[^。；！？]{0,6}(酸楚|心酸|难过|苦涩|悲凉|无助|孤独|空虚|羞愧|愤怒|恐惧|不安|委屈|失落|心动|释然|轻松)/, why: '替玩家写情绪', v: ['酸楚', '心酸', '难过', '苦涩', '悲凉', '无助', '孤独', '空虚', '羞愧', '愤怒', '恐惧', '不安', '委屈', '失落', '心动', '释然'] },
    // 语料回归补的两条：玩家明说「没有进去 / 没动」，正文却让「你」把动作做完
    { p: /你[^。；！？]{0,12}(终于|毅然|索性|干脆|还是)(推|走|坐|站起|站了起|转身|拿起|放下|开口|应下|答应)/, why: '替玩家决定并执行了动作', v: ['终于', '毅然', '索性', '干脆'] },
    { p: /你[^。；！？]{0,10}(心里|心中|心底)[^。；！？]{0,8}(想着|想|念着|盘算|琢磨)/, why: '替玩家写内心活动', v: ['心里想着', '心想', '心中想'] }
  ];

  // psych：与 style_guard 的 PREACH 同源，但这里不重复实现——直接借 StyleGuard.analyze 的命中，
  //   再加几条「看穿/逞强/口是心非」这类它没覆盖的。借不到就只用本表的兜底。
  var PSYCH_EXTRA = [
    { p: /(看穿|看透|一眼看出|早就看出)了?(你|他|她)/, why: '叙述者宣称看穿内心' },
    { p: /(逞强|嘴硬|口是心非|故作镇定|故作轻松)/, why: '给角色贴心理标签' },
    { p: /(其实|实际上)(你|他|她)(并?不|只是)(想|需要|害怕|在乎)/, why: '替角色补内心真实想法' },
    { p: /(嘴上|表面|口口声声).{0,12}(其实|心里|才|真正)/, why: '「嘴上…其实…」式心口不一解读' },
    // P74 语料回归暴露的三类漏网（都是「替角色下心理结论」的变体）
    { p: /(暴露|出卖|泄露|说明|印证)了?(你|他|她)的?(内心|真心|真实想法|潜意识|深处|底色|孤独|恐惧)/, why: '用一句话/一个表情给人下定论' },
    { p: /(藏着|埋着|压着|掖着)(你|他|她)的/, why: '宣称看见了没说出口的东西' },
    { p: /(不敢|不愿|不肯|不想)(承认|面对|说出|想起)/, why: '替角色断言其回避了什么' },
    { p: /(看透一切|洞察一切|知道你在想什么|看得出你在想什么|用那种看透)/, why: '读心式叙述/台词' }
  ];

  // style：口吻漂移（网络腔 / 模板说教 / 情绪外放）。
  //   与 ooc 的分工：ooc 要「有 voice.examples 才判」（有据可依）；
  //   style 不需要 voice —— 它抓的是「现代网络词混进古代场景」「台词像鸡汤模板」这种
  //   与任何角色设定都冲突的东西。只 warn。
  var STYLE_NET = /(哇塞|好家伙|绝了|无语|离谱|破防|emo|社死|内卷|躺平|整得明明白白|咱俩谁跟谁|谁跟谁啊|包在我身上|交给我吧您|大哥您|兄弟你放心|害，|害！|您来啦|保证让您|包您满意|绝对让您|啥都有)/;
  var STYLE_GUSH = /(每个人心里都有一束光|看到(了)?希望|相信你(一定)?能|你值得(被|拥有)|勇敢地(去|面对)|(治愈|救赎)了(你|他|她))/;
  var STYLE_GUSH2 = /(眼眶(一)?红|扑上来抱住|扑进你怀里|泪光|闪着泪光)/;

  // 关系跃迁词：正文里出现这些词、却又没有 proposal ⇒ pairing 命中
  var RELATION_JUMP = /(成了恋人|成为恋人|在一起了|答应做我|结为夫妻|拜了堂|确定了关系|互诉心意|紧紧相拥|吻在了一起)/;

  var MODES = ['off', 'warn', 'repair'];

  function clip(s, n) {
    var str = String(s || '').replace(/\s+/g, ' ').trim();
    var max = n || 60;
    return str.length > max ? (str.slice(0, max - 1) + '…') : str;
  }

  function splitSentences(text) {
    var src = String(text || '');
    var out = [];
    var re = /[^。！？!?\n]+[。！？!?]?/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      if (m[0] && m[0].trim()) out.push(m[0]);
    }
    return out;
  }

  // agency：逐句找「你/玩家 + 决断/内省动词」。返回命中列表（带段落定位信息）。
  // playerText（可选）：玩家这一轮的原始输入。用来消一个假阳性——
  //   玩家自己说了「我摇了摇头」，正文复述成「你摇了摇头」是忠实转述，不是越界。
  //   判据：命中的动词在玩家原话里也出现过 ⇒ 视为转述，跳过。
  function checkAgency(text, playerText) {
    var src = String(text || '');
    var said = String(playerText || '');
    var hits = [];
    var sentences = splitSentences(src);
    var cursor = 0;
    sentences.forEach(function (sent) {
      var at = src.indexOf(sent, cursor);
      if (at < 0) at = cursor;
      cursor = at + sent.length;
      for (var i = 0; i < AGENCY_INTROSPECT.length; i++) {
        var r = AGENCY_INTROSPECT[i];
        if (!r.p.test(sent)) continue;
        // 玩家自己说的话（引号内、玩家输入的复述）不算越界：引号里是玩家说的内容
        var quoted = /[「『""'][^」』""']*$/.test(sent.slice(0, sent.search(r.p)));
        if (quoted) continue;
        // 玩家原话里就有这个动词 ⇒ 正文只是在复述玩家的动作/情绪，不算替玩家决定
        if (said && r.v && r.v.some(function (verb) { return said.indexOf(verb) >= 0 && sent.indexOf(verb) >= 0; })) continue;
        hits.push({ id: 'agency', level: 'fail', why: r.why, excerpt: clip(sent, 40), at: at });
        break;
      }
    });
    return hits;
  }

  function checkPsych(text) {
    var src = String(text || '');
    var hits = [];
    // 先借 StyleGuard 的 14 条说教/心理诊断表（同源，不重写）
    try {
      if (typeof StyleGuard !== 'undefined' && StyleGuard && typeof StyleGuard.analyze === 'function') {
        var a = StyleGuard.analyze(src);
        (a && a.hits ? a.hits : []).forEach(function (h) {
          hits.push({ id: 'psych', level: 'warn', why: h.why || '说教/心理诊断句式', excerpt: clip(h.text || h.excerpt || '', 40) });
        });
      }
    } catch (e) {}
    PSYCH_EXTRA.forEach(function (r) {
      var m = src.match(r.p);
      if (m) hits.push({ id: 'psych', level: 'warn', why: r.why, excerpt: clip(m[0], 40) });
    });
    return hits;
  }

  function hasProposalResult(toolResults) {
    var list = Array.isArray(toolResults) ? toolResults : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || r.ok === false) continue;
      if (r.type === 'proposal') return true;
      if (r.type === 'event') return true;
    }
    return false;
  }

  // escalation：PLAN 自己说「有升级」，但这一轮工具结果里没有任何 proposal/事件 ⇒ 无凭证
  function checkEscalation(plan, toolResults) {
    if (!plan || !plan.escalation || plan.escalation === 'none') return [];
    if (hasProposalResult(toolResults)) return [];
    return [{
      id: 'escalation',
      level: 'fail',
      why: 'PLAN 声称 ' + plan.escalation + ' 级变化，但本轮没有任何 proposal / 事件工具成功执行',
      excerpt: 'class=' + (plan['class'] || '?') + ' escalation=' + plan.escalation
    }];
  }

  // pairing：正文写了关系跃迁词，但本轮没有 proposal
  function checkPairing(text, toolResults) {
    var src = String(text || '');
    var m = src.match(RELATION_JUMP);
    if (!m) return [];
    if (hasProposalResult(toolResults)) return [];
    return [{ id: 'pairing', level: 'fail', why: '正文直接宣布关系跃迁（' + m[0] + '），但没有走 proposal', excerpt: clip(m[0], 40) }];
  }

  // ooc：在场 NPC 的 voice.examples 与正文 3-gram 重合率过低 ⇒ warn（很粗，只提示）
  function trigrams(s) {
    var t = String(s || '').replace(/[\s，。！？、；：""''「」『』（）()]/g, '');
    var out = {};
    for (var i = 0; i + 3 <= t.length; i++) out[t.slice(i, i + 3)] = 1;
    return out;
  }

  // 口吻漂移：不依赖 voice.examples（那要卡带有写才能判），只看「与任何设定都会冲突」的字面。
  // 只 warn —— 古人说「好家伙」不一定错，但概率上该提示。
  function checkStyleDrift(text) {
    var src = String(text || '');
    var hits = [];
    if (STYLE_NET.test(src)) hits.push({ id: 'style', level: 'warn', why: '现代网络口语混进了叙事', excerpt: clip((src.match(STYLE_NET) || [''])[0], 24) });
    if (STYLE_GUSH.test(src)) hits.push({ id: 'style', level: 'warn', why: '台词像鸡汤/鼓励模板', excerpt: clip((src.match(STYLE_GUSH) || [''])[0], 24) });
    if (STYLE_GUSH2.test(src)) hits.push({ id: 'style', level: 'warn', why: '情绪外放（煽情动作）', excerpt: clip((src.match(STYLE_GUSH2) || [''])[0], 24) });
    return hits;
  }

  function checkOoc(text, npcs, threshold) {
    var src = String(text || '');
    var list = Array.isArray(npcs) ? npcs : [];
    var hits = [];
    var lim = (typeof threshold === 'number' && threshold > 0) ? threshold : 0.05;
    list.forEach(function (npc) {
      if (!npc || !npc.voice) return;
      var ex = npc.voice.examples;
      if (!Array.isArray(ex) || !ex.length) return;
      var name = npc.name || npc.id;
      if (!name || src.indexOf(name) < 0) return;
      var exTri = trigrams(ex.join(''));
      var exKeys = Object.keys(exTri);
      if (exKeys.length < 8) return;               // 例句太短，重合率没有统计意义
      var bodyTri = trigrams(src);
      var overlap = 0;
      exKeys.forEach(function (k) { if (bodyTri[k]) overlap++; });
      var ratio = overlap / exKeys.length;
      if (ratio < lim) {
        hits.push({ id: 'ooc', level: 'warn', why: '在场 NPC「' + name + '」的口吻例句与正文台词重合率过低（' + ratio.toFixed(3) + '）', excerpt: clip(name, 20), ratio: ratio });
      }
    });
    return hits;
  }

  // 主入口：run({text, plan, toolResults, npcs, card})
  function run(input) {
    var opts = input || {};
    var text = String(opts.text || '');
    var out = [];
    out = out.concat(checkAgency(text, opts.playerText));
    out = out.concat(checkPsych(text));
    out = out.concat(checkEscalation(opts.plan, opts.toolResults));
    out = out.concat(checkPairing(text, opts.toolResults));
    out = out.concat(checkStyleDrift(text));
    var npcs = opts.npcs;
    if (!npcs && opts.card && opts.card.worldbook && Array.isArray(opts.card.worldbook.npcs)) npcs = opts.card.worldbook.npcs;
    out = out.concat(checkOoc(text, npcs, opts.oocThreshold));
    return {
      hits: out,
      fail: out.filter(function (h) { return h.level === 'fail'; }),
      warn: out.filter(function (h) { return h.level === 'warn'; }),
      repairable: out.filter(function (h) { return h.id === 'agency'; })
    };
  }

  // 段落定位：给「局部修补」用——只重写命中那一小段，其余正文原样保留。
  function locateParagraph(text, at) {
    var src = String(text || '');
    var i = (typeof at === 'number' && at >= 0 && at < src.length) ? at : 0;
    var start = src.lastIndexOf('\n\n', i);
    start = (start < 0) ? 0 : (start + 2);
    var end = src.indexOf('\n\n', i);
    end = (end < 0) ? src.length : end;
    return { start: start, end: end, text: src.slice(start, end) };
  }

  function replaceParagraph(text, start, end, replacement) {
    var src = String(text || '');
    return src.slice(0, start) + String(replacement == null ? '' : replacement) + src.slice(end);
  }

  // 配置：Storage.getGlobal().settings.story.lint = { mode, budget }
  function config() {
    var mode = 'warn';
    var budget = { windowRounds: 10, maxCalls: 2 };
    try {
      if (typeof Storage !== 'undefined' && Storage && typeof Storage.getGlobal === 'function') {
        var g = Storage.getGlobal() || {};
        var l = (g.settings && g.settings.story && g.settings.story.lint) || {};
        if (MODES.indexOf(l.mode) >= 0) mode = l.mode;
        if (l.budget && typeof l.budget === 'object') {
          if (typeof l.budget.windowRounds === 'number' && l.budget.windowRounds > 0) budget.windowRounds = l.budget.windowRounds;
          if (typeof l.budget.maxCalls === 'number' && l.budget.maxCalls >= 0) budget.maxCalls = l.budget.maxCalls;
        }
      }
    } catch (e) {}
    return { mode: mode, budget: budget };
  }

  // 预算账本：GameState._lintSpend = [{ round, ts }]，只保留最近 windowRounds 轮
  function canSpend(round, budget) {
    var b = budget || config().budget;
    var spend = [];
    try {
      if (typeof GameState !== 'undefined' && GameState && Array.isArray(GameState._lintSpend)) spend = GameState._lintSpend;
    } catch (e) {}
    var lo = (typeof round === 'number' ? round : 0) - b.windowRounds;
    var used = spend.filter(function (x) { return x && x.round > lo; }).length;
    return used < b.maxCalls;
  }

  function spend(round) {
    try {
      if (typeof GameState !== 'undefined' && GameState) {
        if (!Array.isArray(GameState._lintSpend)) GameState._lintSpend = [];
        GameState._lintSpend.push({ round: (typeof round === 'number' ? round : 0), ts: Date.now() });
        if (GameState._lintSpend.length > 200) GameState._lintSpend = GameState._lintSpend.slice(-100);
      }
    } catch (e) {}
  }

  // 人话提示：进叙事流末尾（warn 档唯一可见的产出）
  function hintText(result) {
    if (!result) return '';
    var fails = result.fail || [];
    var warns = result.warn || [];
    if (!fails.length && !warns.length) return '';
    if (fails.length) {
      return '（叙事检查：' + fails.map(function (h) { return h.why; }).join('；') + '。已记录，可在「报错」里看详情）';
    }
    return '（叙事检查：' + warns[0].why + '）';
  }

  return {
    MODES: MODES,
    AGENCY_INTROSPECT: AGENCY_INTROSPECT,
    checkAgency: checkAgency,
    checkPsych: checkPsych,
    checkEscalation: checkEscalation,
    checkPairing: checkPairing,
    checkOoc: checkOoc,
    checkStyleDrift: checkStyleDrift,
    run: run,
    locateParagraph: locateParagraph,
    replaceParagraph: replaceParagraph,
    config: config,
    canSpend: canSpend,
    spend: spend,
    hintText: hintText
  };
})();

if (typeof window !== 'undefined') window.NarrativeLint = NarrativeLint;
if (typeof module !== 'undefined' && module.exports) module.exports = NarrativeLint;

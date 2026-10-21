/* ============================================================
   StyleGuard —— 反说教闸门（P72·W3）
   ------------------------------------------------------------
   背景：玩家反馈「AI 说教味太重、容易 OOC」。表现是正文段落里冒出
   「记住，……」/「这就是成长的意义」/「（旁白）」这类跳出故事的话。

   设计取舍（重要，别随手改）：
   1. 纯逻辑、无 DOM、无网络：桌面与 RN 共用同一份（engine_sync mirror）。
   2. **不往 prompt 里注入任何文字**：P70-T2 的验收门之一是「同一份状态
      下整条 prompt 逐字不变」（probe t2_before_after 的 MD5 门禁），往
      system / dynamic 里塞文风指令会让那道门直接红，也破坏前缀缓存。
      所以这里走「先生成、后检测、命中就重写一次」的路子。
   3. 判分是启发式：宁可漏判（warn）也不要误杀。verdict 只有三档
      ok / warn / fail，只有 fail 才触发自动重写。
   4. 阈值、开关都走 Storage.getGlobal().style.guard：
        'auto'（默认）命中 fail 自动重写一次
        'warn'        只在叙事流末尾留一条提示
        'off'         完全不检查
   ============================================================ */
var StyleGuard = (function () {
  'use strict';

  // 说教句式表：p=正则、w=权重、why=人话理由（会拼进重写要求）
  var PREACH = [
    { p: /(记住|切记|别忘了)[，,：:]/, w: 2, why: '直接给出忠告（「记住……」）' },
    { p: /(终于|总算)(明白|懂得|领悟|明白过来)/, w: 2, why: '角色"顿悟"式总结' },
    { p: /这就是(人生|成长|爱情|命运|活着|友情)/, w: 3, why: '点题式人生总结' },
    { p: /(人生|成长|命运|孤独|自由|希望|救赎|羁绊|灵魂)的(意义|真谛|力量|答案|代价)/, w: 3, why: '抽象名词点题' },
    { p: /原来.{0,12}(才|方)是最?(重要|珍贵|值得|难得)/, w: 2, why: '「原来……才是最重要的」' },
    { p: /(仿佛|好像|似乎).{0,10}(在(说|诉说|提醒)|告诉你|提醒着)/, w: 2, why: '万物拟人式说教' },
    { p: /[（(]?\s*(旁白|作者|提示|警示|画外音)\s*[）)]?\s*[：:]/, w: 3, why: '跳出故事的旁白/作者口吻' },
    { p: /(不要|别)忘记[，,]?/, w: 2, why: '直接叮嘱读者' },
    { p: /(总之|总而言之|说到底)[，,]/, w: 1, why: '收尾式总结' },
    // P73：玩家反馈里「过度解读玩家发言 / 强行推进戏剧」也该在这道闸门里拦，
    //   它们和说教是同一个病根（AI 跳出玩家能看到的东西，替玩家下结论）。
    //   权重都给 2：单次出现只算 warn，累计到 fail 才自动重写，避免误杀正常的角色互动。
    { p: /(你|他|她)(嘴上|表面|口口声声|明明)(说|说着)?.{0,12}(其实|心里|才|真正)/, w: 2, why: '替玩家/角色做心理诊断（「你嘴上说…其实…」）' },
    { p: /(眼神|表情|语气|笑容|沉默)(出卖|暴露|泄露|说明)了/, w: 2, why: '从表情推断内心' },
    { p: /(显然|分明|明明)(是在|是|在)(害怕|逃避|掩饰|求救|寻求安慰|想要被)/, w: 2, why: '替角色定性心理状态' },
    { p: /(这|那)(正|就)是(你|他|她)(需要|最需要|想要的)(的)?/, w: 2, why: '救赎式断言' },
    { p: /(命中注定|注定要|逃不掉的(命运|结局|宿命))/, w: 2, why: '宿命式强行推进' }
  ];

  // 抽象名词：只用来算「密度」，单次出现不算罪名
  var ABSTRACT = ['命运', '宿命', '意义', '真谛', '灵魂', '羁绊', '救赎',
    '希望', '自由', '孤独', '成长', '温暖'];

  var MODES = ['auto', 'warn', 'off'];

  function _g() {
    try { return (typeof Storage !== 'undefined' && Storage.getGlobal) ? Storage.getGlobal() : {}; }
    catch (e) { return {}; }
  }

  function mode() {
    var g = _g();
    var m = (g && g.style && g.style.guard) || 'auto';
    return MODES.indexOf(m) >= 0 ? m : 'auto';
  }

  function enabled() { return mode() !== 'off'; }

  function _countAbstract(text) {
    var n = 0;
    for (var i = 0; i < ABSTRACT.length; i++) {
      var w = ABSTRACT[i];
      var at = text.indexOf(w);
      while (at >= 0) { n++; at = text.indexOf(w, at + w.length); }
    }
    return n;
  }

  /**
   * 判定一段正文（或任意 AI 输出）的说教程度。
   * @returns {{score:number, verdict:'ok'|'warn'|'fail', hits:Array, density:number, length:number}}
   */
  function analyze(text) {
    var s = String(text == null ? '' : text);
    var out = { score: 0, verdict: 'ok', hits: [], density: 0, length: s.length };
    if (!s.trim()) return out;
    for (var i = 0; i < PREACH.length; i++) {
      var rule = PREACH[i];
      var m = rule.p.exec(s);
      if (m) {
        out.hits.push({ why: rule.why, sample: String(m[0]).slice(0, 24), w: rule.w, index: m.index });
        out.score += rule.w;
      }
    }
    // 抽象名词密度：每 100 字出现次数（中文 1 字 ≈ 1 个 token 的粗略近似）
    var per100 = s.length > 0 ? (_countAbstract(s) * 100 / s.length) : 0;
    out.density = Math.round(per100 * 100) / 100;
    if (out.density >= 1.2) out.score += 2;
    else if (out.density >= 0.8) out.score += 1;
    out.verdict = out.score >= 3 ? 'fail' : (out.score >= 1.5 ? 'warn' : 'ok');
    return out;
  }

  /** 把命中的理由拼成一句给 AI 的重写要求（进 _regenContext.comment） */
  function buildRetryComment(hits) {
    var whys = [];
    (hits || []).forEach(function (h) { if (h && h.why && whys.indexOf(h.why) < 0) whys.push(h.why); });
    var s = '这一段说教味太重了。';
    if (whys.length) s += '具体问题：' + whys.join('；') + '。';
    s += '请重写这一轮：把道理全部删掉，只用具体的动作、对话、环境细节表达；'
       + '不要旁白、不要总结人生、不要「原来……才是最重要的」这类收束句。';
    // P73：同一条闸门也管「替玩家做心理诊断」「强行推进剧情」——它和说教是同一个病根，
    //   都是 AI 跳出玩家能看见的东西、替玩家/角色下结论。只在命中里真出现那类句式时才补，
    //   免得纯说教的重写要求变长。
    var psych = false, drama = false;
    (hits || []).forEach(function (h) {
      var why = String((h && h.why) || '');
      if (/心理诊断|推断内心|定性心理|救赎|表情/.test(why)) psych = true;
      if (/宿命|强行推进/.test(why)) drama = true;
    });
    if (psych || drama) {
      s += '另外：';
      if (psych) s += '不要替玩家或角色下心理结论（「你嘴上说…其实…」这类），玩家没明说的想法、情绪、动机都不是事实；';
      if (drama) s += '不要为了戏剧性强行安排关系跃迁、配对、救赎或升级冲突；';
    }
    return s;
  }

  /** 是否该自动重写（mode==='auto' 且 fail） */
  function shouldAutoRewrite(text) {
    return mode() === 'auto' && analyze(text).verdict === 'fail';
  }

  /** 给 UI 用的一句话提示 */
  function hintText(verdict) {
    if (verdict === 'fail') return '（这段说教味偏重，可点「重新生成」让它重写）';
    if (verdict === 'warn') return '（这段略有说教味）';
    return '';
  }

  return {
    PREACH: PREACH,
    ABSTRACT: ABSTRACT,
    MODES: MODES,
    mode: mode,
    enabled: enabled,
    analyze: analyze,
    buildRetryComment: buildRetryComment,
    shouldAutoRewrite: shouldAutoRewrite,
    hintText: hintText
  };
})();

if (typeof window !== 'undefined') window.StyleGuard = StyleGuard;
if (typeof module !== 'undefined' && module.exports) module.exports = StyleGuard;

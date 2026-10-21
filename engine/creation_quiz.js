/**
 * creation_quiz.js —— P67 开局问卷（分院 / 魔杖 / 守护神 这一类）
 *
 * 卡带在创角流程里声明一步 `{ type: 'quiz', quizzes: [...] }`，每套问卷若干题，
 * 每题若干选项，每个选项**明确指向一个结论**（不用权重、不做性格打分）。
 * 判卷完全在引擎侧确定性完成：同一组答案永远得到同一结论，不看 AI。
 *
 * 结论三处可用：
 *   1) 创角摘要与角色卡（`quiz_<id>` 与 `__quiz`）；
 *   2) 开局属性（结论里的 grants 在属性点分配之后叠加，受 attributes[].max 限制）；
 *   3) AI 提示词（promptBlock()，让 GM 知道这角色是哪个院、哪根魔杖）。
 *
 * 为什么不做「权重打分」：权重打分要调参，同一答案在不同卡带里给出的结论无法预期；
 * 选项直指结论，作者写什么就是什么，玩家也看得懂自己为什么被分到那个院。
 */
(function () {
  'use strict';

  var MAX_QUIZZES = 8;
  var MAX_QUESTIONS = 12;
  var MAX_OPTS = 6;

  function _s(v) { return v == null ? '' : String(v); }

  function _cleanOutcome(o, idx) {
    if (!o || typeof o !== 'object') return null;
    var id = _s(o.id || o.key || ('outcome_' + idx)).trim();
    if (!id) return null;
    var grants = null;
    if (o.grants && typeof o.grants === 'object') {
      grants = {};
      Object.keys(o.grants).forEach(function (k) {
        var n = Number(o.grants[k]);
        if (k && isFinite(n) && n !== 0) grants[k] = n;
      });
      if (!Object.keys(grants).length) grants = null;
    }
    var tags = [];
    if (Array.isArray(o.tags)) tags = o.tags.map(_s).filter(Boolean).slice(0, 6);
    return {
      id: id,
      name: _s(o.name || o.label || id).trim(),
      desc: _s(o.desc || o.description || '').trim(),
      tags: tags,
      grants: grants
    };
  }

  function _cleanQuestion(q, outcomes, qi) {
    if (!q || typeof q !== 'object') return null;
    var text = _s(q.q || q.question || q.title || '').trim();
    if (!text) return null;
    var opts = [];
    (Array.isArray(q.opts) ? q.opts : (Array.isArray(q.options) ? q.options : [])).forEach(function (o) {
      var oc = typeof o === 'string' ? { text: o, outcome: o } : o;
      if (!oc || typeof oc !== 'object') return;
      var t = _s(oc.text || oc.label || oc.name || '').trim();
      var oid = _s(oc.outcome || oc.to || oc.id || '').trim();
      if (!t || !oid) return;
      var hit = outcomes.filter(function (x) { return x.id === oid; })[0];
      if (!hit) return; // 指向不存在的结论 ⇒ 丢弃，宁可少一题也不误导玩家
      opts.push({ text: t, outcome: oid });
    });
    if (opts.length < 2) return null;
    return { q: text, opts: opts.slice(0, MAX_OPTS), idx: qi };
  }

  function normalizeOne(raw, pos) {
    if (!raw || typeof raw !== 'object') return null;
    var outcomes = [];
    // 结论清单：主字段 outcomes；也接受 results（P67 实测：卡带作者两种写法都有，
    //   写成 results 时若只认 outcomes，整套卷会被静默丢掉，玩家看到「没有可用题目」）
    var outcomeList = Array.isArray(raw.outcomes) ? raw.outcomes
      : (Array.isArray(raw.results) ? raw.results : []);
    outcomeList.forEach(function (o, i) {
      var c = _cleanOutcome(o, i);
      if (c) outcomes.push(c);
    });
    if (outcomes.length < 2) return null;
    var questions = [];
    (Array.isArray(raw.questions) ? raw.questions : []).forEach(function (q, i) {
      var c = _cleanQuestion(q, outcomes, i);
      if (c) questions.push(c);
    });
    if (!questions.length) return null;
    var id = _s(raw.id || ('quiz' + pos)).trim();
    return {
      id: id,
      title: _s(raw.title || raw.name || ('问卷 ' + (pos + 1))).trim(),
      prompt: _s(raw.prompt || raw.intro || raw.desc || '').trim(),
      resultName: _s(raw.resultName || raw.resultLabel || raw.title || '结论').trim(),
      questions: questions.slice(0, MAX_QUESTIONS),
      outcomes: outcomes
    };
  }

  function normalize(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (raw, i) {
      if (out.length >= MAX_QUIZZES) return;
      var c = normalizeOne(raw, i);
      if (!c) return;
      if (out.filter(function (x) { return x.id === c.id; })[0]) return; // 同 id 只留第一套
      out.push(c);
    });
    return out;
  }

  function totalQuestions(quizzes) {
    var n = 0;
    (quizzes || []).forEach(function (q) { n += (q.questions || []).length; });
    return n;
  }

  // picks: { quizId: [ 'outcomeId', ... ] }（按题目顺序）
  function score(quiz, picks) {
    if (!quiz) return null;
    var votes = {};
    (quiz.outcomes || []).forEach(function (o) { votes[o.id] = 0; });
    var answered = 0;
    (quiz.questions || []).forEach(function (q, i) {
      var pick = picks && picks[i];
      if (!pick) return;
      if (Object.prototype.hasOwnProperty.call(votes, pick)) { votes[pick]++; answered++; }
    });
    if (!answered) return null;
    var best = null;
    (quiz.outcomes || []).forEach(function (o) {
      // 平票取**先声明**的结论：作者按重要性排序，结果对玩家可预期
      if (!best || votes[o.id] > votes[best.id]) best = o;
    });
    return {
      quizId: quiz.id,
      title: quiz.title,
      resultName: quiz.resultName,
      outcomeId: best.id,
      name: best.name,
      desc: best.desc,
      tags: best.tags || [],
      grants: best.grants || null,
      votes: votes,
      answered: answered,
      total: (quiz.questions || []).length
    };
  }

  function scoreAll(quizzes, picks) {
    var out = [];
    (quizzes || []).forEach(function (q) {
      var r = score(q, picks ? picks[q.id] : null);
      if (r) out.push(r);
    });
    return out;
  }

  // 结果落进创角数据：quiz_<id> 与 __quiz（存档与角色卡都读得到）
  function apply(data, results) {
    if (!data) return {};
    var bonus = {};
    var bag = {};
    (results || []).forEach(function (r) {
      data['quiz_' + r.quizId] = r.name;
      bag[r.quizId] = {
        id: r.outcomeId, name: r.name, desc: r.desc,
        tags: r.tags, resultName: r.resultName
      };
      if (r.grants) {
        Object.keys(r.grants).forEach(function (k) {
          bonus[k] = (bonus[k] || 0) + r.grants[k];
        });
      }
    });
    if (Object.keys(bag).length) data.__quiz = bag;
    return bonus;
  }

  // 属性叠加：在属性点分配之后调用，逐项受 max 限制
  function applyGrants(data, bonus, attributes) {
    if (!data || !bonus) return [];
    var caps = {};
    (attributes || []).forEach(function (a) {
      if (a && a.key) caps[a.key] = (a.max != null ? a.max : null);
    });
    var changed = [];
    Object.keys(bonus).forEach(function (k) {
      var cur = Number(data[k]);
      if (!isFinite(cur)) return;
      var next = cur + bonus[k];
      var cap = caps[k];
      if (cap != null && next > cap) next = cap;
      if (next < 0) next = 0;
      if (next !== cur) { data[k] = next; changed.push(k); }
    });
    return changed;
  }

  // ============================================================
  // P72·W5：玩家自写答案（「都不像我 → 自己写」）
  // ============================================================
  // 设计口径：
  //   1) 先走**本地确定性**映射（CUSTOM_LEXICON 近义扩展 + 与结论名/标签的字面重合），
  //      命中就把这条答案当成选了这个结论 —— 与手点选项完全等价，算分口径一致。
  //   2) 本地没命中才允许**一次** AI 归类（story.js 侧调用，8 秒超时）；
  //      没配 Key / 超时 / 模型乱答 ⇒ 回落 null：这条不算作答、不投票、不影响结论。
  //   3) AI 永远不参与算分 —— 只负责把「人话」翻成「结论 id」，投不投票由本地决定。
  // 为什么用字面重合而不是向量：离线可用、可解释、玩家能预期（同一条答案永远同一个结论）。
  var CUSTOM_LEXICON = [
    ['勇敢', '勇', '胆大', '冒险', '冲在前', '不怕'],
    ['怯', '胆小', '退缩', '怕事', '谨慎过头'],
    ['冷静', '理智', '沉着', '不动声色', '克制'],
    ['热情', '热络', '自来熟', '爱说话', '话多'],
    ['冷淡', '冷', '疏离', '不爱说话', '沉默'],
    ['善良', '心软', '照顾别人', '温柔'],
    ['精明', '算计', '务实', '利益', '不吃亏'],
    ['野', '狠', '不择手段', '有野心', '强势'],
    ['忠诚', '讲义气', '守规矩', '本分'],
    ['叛逆', '不守规矩', '讨厌约束', '我行我素'],
    ['书', '学习', '知识', '聪明', '脑子好'],
    ['动手', '实干', '能打', '身体 ', '力气']
  ];

  function _norm(s) { return _s(s).toLowerCase().replace(/\s+/g, ''); }

  // 把自写文本扩成「可比对的词云」：原文 + 命中近义族的整族词
  function _expand(text) {
    var t = _s(text);
    var bags = [t];
    CUSTOM_LEXICON.forEach(function (group) {
      var hit = group.some(function (w) { return t.indexOf(w) >= 0; });
      if (hit) bags = bags.concat(group);
    });
    return _norm(bags.join(' '));
  }

  // 本地映射：返回结论 id 或 null。
  //   打分 = 结论名/描述/标签与「词云」的字面重合（2 字以上片段才计），最高分 > 0 且唯一才认。
  function mapCustom(text, outcomes) {
    var bag = _expand(text);
    if (!bag) return null;
    var best = null, bestScore = 0, tie = false;
    (outcomes || []).forEach(function (o) {
      if (!o || !o.id) return;
      var fields = [o.name, o.desc].concat(Array.isArray(o.tags) ? o.tags : []);
      var score = 0;
      fields.forEach(function (f) {
        var s = _norm(f);
        if (!s) return;
        // 整段命中（作者写的结论名被玩家直接说出来）权重更高
        if (s.length >= 2 && bag.indexOf(s) >= 0) score += Math.min(4, s.length);
        else {
          // 否则按 2 字滑窗找重合
          for (var i = 0; i + 2 <= s.length; i++) {
            var bi = s.substr(i, 2);
            if (bag.indexOf(bi) >= 0) score += 1;
          }
        }
      });
      if (score > bestScore) { bestScore = score; best = o.id; tie = false; }
      else if (score === bestScore && score > 0) tie = true;
    });
    if (!best || bestScore <= 0 || tie) return null;
    return best;
  }

  // 给结果页用的人类标签：命中返回结论名，未命中返回空串
  function suggestLabel(text, outcomes) {
    var id = mapCustom(text, outcomes);
    if (!id) return '';
    var hit = (outcomes || []).filter(function (o) { return o && o.id === id; })[0];
    return hit ? _s(hit.name || hit.id) : '';
  }

  function facts(results) {
    return (results || []).map(function (r) {
      return r.resultName + '：' + r.name + (r.desc ? '（' + r.desc + '）' : '');
    }).join('；');
  }

  // 给提示词：没有结果就返回空串（无痕迹）
  function promptBlock(results) {
    var list = (results || []).filter(function (r) { return r && r.name; });
    if (!list.length) return '';
    var lines = ['【开局问卷 · 已定（引擎判定，不是你的推测）】'];
    list.forEach(function (r) {
      lines.push('- ' + r.resultName + '：' + r.name + (r.desc ? ' —— ' + r.desc : ''));
    });
    lines.push('写正文时把这些当作既成事实引用，不要重新分配或改写。');
    return lines.join('\n');
  }

  var CreationQuiz = {
    normalize: normalize,
    score: score,
    scoreAll: scoreAll,
    apply: apply,
    applyGrants: applyGrants,
    facts: facts,
    promptBlock: promptBlock,
    totalQuestions: totalQuestions,
    mapCustom: mapCustom,
    suggestLabel: suggestLabel,
    CUSTOM_LEXICON: CUSTOM_LEXICON,
    MAX_QUIZZES: MAX_QUIZZES,
    MAX_QUESTIONS: MAX_QUESTIONS,
    MAX_OPTS: MAX_OPTS
  };

  if (typeof window !== 'undefined') window.CreationQuiz = CreationQuiz;
  if (typeof module !== 'undefined' && module.exports) module.exports = CreationQuiz;
})();

// ============================================================
// 核心层 · PromptInspect（P70-T2 上下文查看器 · 数据层）
// A 类纯逻辑：不碰 DOM、不碰 Storage、不写盘。所有输入由调用方传入，
// estimateTokens 也由调用方传入（PromptBuilder.estimateTokens），本文件不自建折算口径。
//
// 消费方：
//   · 桌面 index.html（script 标签）+ engine/story.js（callAI 组装 toSend 后采集）
//   · RN rn_bootstrap.js load('PromptInspect', ...)
// 两仓逐字节同源（engine_sync mirror），改前先看登记册。
//
// 口径备忘（阶段 0 已核实，改动前先读）：
//   · callAI 实际发送不用 buildSystem() 的三段拼法——system 消息只含
//     static+semiStatic（story.js），dynamic 拼进最后一条 user 消息。
//     因此 blocks/messages 一律取 story.js 采集的 toSend 引用，
//     不许在采集点重调 buildDynamic()/buildSystem()（有副作用）。
//   · _lastPromptEstimate 是第四部分口径、_lastPromptFullEstimate 是整条口径
//     （P9·S14 拆分），本快照的 total 是「blocks 之和」口径，与请求体全文
//     的差额 = 消息间 '\n' + 快照消息的包装前缀（约 ±2% 内，探针容差覆盖）。
// ============================================================

var PromptInspect = {
  // 历史消息 kind 判定（任务书 2.3：用现有文本前缀，不自创标记）。
  // 顺序：文本前缀优先于 role；两个前缀互斥（「【系统 ·」带空格点号，
  // 「【系统状态快照 ·」不含该前缀）。
  kindOf: function (role, content) {
    var c = String(content == null ? '' : content);
    if (c.indexOf('【系统状态快照 ·') === 0) return 'snapshot';
    if (c.indexOf('【系统 ·') === 0) return 'systemNotice';
    if (role === 'system') return 'system';
    if (role === 'assistant') return 'ai';
    if (role === 'user') return 'player';
    return 'other';
  },

  // input 形状见任务书 2.1（字段名固定）：
  //   { round, blocks:[{id,label,text}], messages:[{role,content}],
  //     entityHits:[{group,key,name,chars,clipped}], entityClipped:{group:n},
  //     trimLog:[{section,before,after,reason}], level,
  //     budget:{enabled,maxTokens}, estimateTokens:fn }
  // snapshot 形状（字段名固定）：
  //   { at, round, blocks:[{id,label,chars,tokens,pct}],
  //     total:{chars,tokens,pctSum}, messages:[{i,role,kind,chars,tokens}],
  //     worldbook:{hits,clipped,hitCount,clippedCount},
  //     budget:{enabled,maxTokens,level,steps,overBudget}, notes:[...] }
  build: function (input) {
    input = input || {};
    var est = (typeof input.estimateTokens === 'function')
      ? input.estimateTokens
      : function () { return 0; };

    // ---- blocks（互斥分桶；pct 保留 1 位小数；total = Σ blocks）----
    var blocks = [];
    var totalTokens = 0, totalChars = 0;
    (input.blocks || []).forEach(function (b) {
      var text = String((b && b.text) != null ? b.text : '');
      var tk = est(text);
      blocks.push({ id: b && b.id, label: b && b.label, chars: text.length, tokens: tk, pct: 0 });
      totalTokens += tk;
      totalChars += text.length;
    });
    var pctSum = 0;
    blocks.forEach(function (b) {
      b.pct = totalTokens > 0 ? Math.round(b.tokens / totalTokens * 1000) / 10 : 0;
      pctSum += b.pct;
    });

    // ---- messages（kind 判定 + 每条估算）----
    var self = this;
    var messages = (input.messages || []).map(function (m, i) {
      var c = String((m && m.content) != null ? m.content : '');
      return { i: i, role: m && m.role, kind: self.kindOf(m && m.role, c), chars: c.length, tokens: est(c) };
    });

    // ---- worldbook（hits 只含已注入条目；clipped 只记被截条数，不重复计入 hits）----
    var hits = (input.entityHits || []).map(function (h) {
      return {
        group: h && h.group, key: h && h.key, name: h && h.name,
        chars: Number(h && h.chars) || 0, clipped: !!(h && h.clipped)
      };
    });
    var clipped = {};
    var clippedCount = 0;
    var ec = input.entityClipped || {};
    Object.keys(ec).forEach(function (k) {
      var n = Number(ec[k]) || 0;
      if (n > 0) { clipped[k] = n; clippedCount += n; }
    });
    var worldbook = { hits: hits, clipped: clipped, hitCount: hits.length, clippedCount: clippedCount };

    // ---- budget / 降级账本（before/after 均为第四部分估算口径，面板须写明）----
    var bIn = input.budget || {};
    var steps = (input.trimLog || []).map(function (t) {
      var before = Number(t && t.before) || 0;
      var after = Number(t && t.after) || 0;
      return { section: t && t.section, before: before, after: after, reason: t && t.reason, saved: before - after };
    });
    var maxTokens = Number(bIn.maxTokens) || 0;
    // overBudget = 降级阶梯走完后第四部分估算仍超上限（未触发降级时恒 false）
    var overBudget = false;
    if (bIn.enabled !== false && steps.length > 0 && steps[steps.length - 1].after > maxTokens) overBudget = true;
    var budget = {
      enabled: bIn.enabled !== false,
      maxTokens: maxTokens,
      level: Number(input.level) || 0,
      steps: steps,
      overBudget: overBudget
    };

    // ---- notes（任务书 2.4：面板口径说明，文案逐字）----
    var notes = [
      'token 是估算：中文按 1.5 字/token、英文按 4 字/token 折算，与实际计费可能有 ±15% 偏差。',
      '预算刹车只约束第四部分（状态快照），历史对话不受它管。'
    ];
    if (clippedCount > 0) notes.push('另有 ' + clippedCount + ' 条同组条目未注入（受 LIMIT 限制）');

    return {
      at: Date.now(),
      round: (input.round != null) ? input.round : null,
      blocks: blocks,
      total: { chars: totalChars, tokens: totalTokens, pctSum: Math.round(pctSum * 10) / 10 },
      messages: messages,
      worldbook: worldbook,
      budget: budget,
      notes: notes
    };
  }
};

if (typeof window !== 'undefined') {
  window.PromptInspect = PromptInspect;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptInspect;
}

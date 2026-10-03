// ============================================================
// 导入层 · 对外入口
// 一条链：文件 → 识别 → 解析 → 中间格式 → 草稿 → Validator → (AI 修复) → 再 Validator
//
// 用法（RN / 桌面通用，纯 JS）：
//   Import.run({ name: '设定.docx', bytes: uint8 })   → 同步部分：解析 + 出草稿 + 校验
//   await Import.enrich(result, { chat: ApiClient.chat })  → 让 AI 补缺口并自动修复到过校验
//   Import.commit(result, { save: Storage.setImportedCards })  → 过校验之后才允许落库
//
// 设计原则（照 GPT 方案的三条提醒）：
//   · 不静默丢内容：任何失败都降级成「原文保留」+ 报告里写清楚
//   · 原文件单独保管：ImportVault
//   · AI 不决定合法性：CardValidator 说了算，AI 只能提补丁
// ============================================================

var Import = {
  version: '1.0.0',

  init: function () {
    if (typeof ImportPipeline !== 'undefined' && ImportPipeline && ImportPipeline.init) ImportPipeline.init();
    return Import;
  },

  // ---- 单个文件：同步走完「识别→解析→草稿→校验」----
  run: function (input, opts) {
    opts = opts || {};
    Import.init();
    var importId = opts.importId || (opts.vault === false ? null : ImportVault.newImportId());
    var r = ImportPipeline.ingest(input, {
      vault: opts.vault !== false,
      importId: importId
    });
    if (importId) r.imd.importId = importId;

    // 中间格式存一份，之后「不重新解析也能再转一次」
    if (opts.vault !== false && importId) {
      r.imd.source.retained = r.imd.source.retained || false;
      r.imd.source.imdSaved = ImportVault.saveImd(importId, r.imd);
    }

    var draft = ImportDraft.build(r.imd, opts.draft || {});
    var validation = ImportDraft.validate(draft.card);

    r.draft = draft;
    r.validation = validation;
    r.importId = importId;
    var report = ImportReport.create();
    ImportReport.addFile(report, r.entry);
    r.report = report;
    report.imds = r.imd ? [ImportMiddle.summarize(r.imd)] : [];
    report.draftSummary = {
      cardId: draft.card.cardId,
      cardName: draft.card.cardName,
      valid: !!validation.ok,
      gaps: draft.gaps.length,
      npcs: draft.card.worldbook.npcs.length,
      items: draft.card.worldbook.items.length,
      factions: draft.card.worldbook.factions.length
    };
    r.report.draftGaps = draft.gaps.slice();
    r.report.notes = draft.notes.slice();
    return r;
  },

  // ---- 多文件 ----
  runMany: function (list, opts) {
    opts = opts || {};
    Import.init();
    var results = [];
    for (var i = 0; i < (list || []).length; i++) {
      var one = opts.perFile || {};
      try { results.push(Import.run(list[i], one)); }
      catch (e) {
        results.push({
          entry: ImportReport.addFile(ImportReport.create(), {
            name: (list[i] && list[i].name) || '(未命名)', ok: false, error: e.message,
            warnings: ['这个文件处理失败，其他文件不受影响']
          }),
          imd: null, draft: null, validation: { ok: false, msg: '未生成草稿' }
        });
      }
    }
    var report = ImportReport.create();
    for (var j = 0; j < results.length; j++) ImportReport.addFile(report, results[j].entry);
    return { results: results, report: report };
  },

  // ---- 让 AI 补缺口 + 自动修复到过校验（最多 maxRounds 轮）----
  // opts: { chat, maxRounds=3, maxChars=12000, onRound }
  enrich: function (result, opts) {
    opts = opts || {};
    var chat = opts.chat;
    if (typeof chat !== 'function') {
      return Promise.resolve({ ok: false, reason: '没有提供 chat 函数（AI 未配置），草稿保持现状', result: result });
    }
    var maxRounds = opts.maxRounds || 3;
    var draft = result.draft;
    var card = draft.card;
    var trace = [];

    function oneRound(prompt, round) {
      return Promise.resolve(chat(
        [{ role: 'system', content: '你是一个严谨的资料整理助手。只输出 JSON，不要输出任何解释文字或 Markdown 代码围栏。' },
         { role: 'user', content: prompt }],
        { temperature: 0.2, jsonMode: true }
      )).then(function (resp) {
        var text = (resp && resp.content) || (typeof resp === 'string' ? resp : '');
        var parsed = parseJsonLoose(text);
        if (!parsed) {
          trace.push({ round: round, ok: false, reason: 'AI 没有返回可解析的 JSON' });
          return { changed: false };
        }
        var res = ImportDraft.applyPatch(card, parsed, opts);
        trace.push({ round: round, applied: res.applied, rejected: res.rejected });
        return { changed: res.applied.length > 0, applied: res.applied };
      });
    }

    var chain = Promise.resolve();
    var v = ImportDraft.validate(card);
    var roundNo = 0;

    // 第 1 轮：补缺口
    if (draft.gaps.length) {
      chain = chain.then(function () {
        roundNo++;
        var p = ImportDraft.buildPrompt(result.imd, draft, { maxChars: opts.maxChars });
        if (opts.onRound) opts.onRound({ round: roundNo, phase: '补缺口' });
        return oneRound(p, roundNo).then(function () { v = ImportDraft.validate(card); });
      });
    }

    // 后续轮：修复校验错误，直到过或到上限
    chain = chain.then(function step() {
      if (v.ok) return null;
      if (roundNo >= maxRounds) return null;
      roundNo++;
      var p = ImportDraft.buildRepairPrompt(card, v, opts);
      if (opts.onRound) opts.onRound({ round: roundNo, phase: '修复校验错误：' + v.msg });
      return oneRound(p, roundNo).then(function () {
        v = ImportDraft.validate(card);
        return step();
      });
    });

    return chain.then(function () {
      result.validation = v;
      result.aiTrace = trace;
      result.report.draftSummary.valid = !!v.ok;
      result.report.draftSummary.gaps = Math.max(0, draft.gaps.length - trace.filter(function (t) { return t.applied; }).length);
      return { ok: !!v.ok, validation: v, trace: trace, result: result };
    }).catch(function (e) {
      result.aiTrace = trace.concat([{ ok: false, reason: 'AI 环节异常：' + e.message }]);
      return { ok: false, reason: e.message, trace: trace, result: result };
    });
  },

  // ---- 落库：只有过校验才允许 ----
  // opts: { save: fn(card), getImportedCards, setImportedCards }
  commit: function (result, opts) {
    opts = opts || {};
    var v = result.validation || ImportDraft.validate(result.draft.card);
    if (!v.ok) return { ok: false, reason: '卡带草稿没过校验，未落库：' + (v.msg || '未知原因') };
    var card = result.draft.card;
    var store = opts.store || (typeof Storage !== 'undefined' ? Storage : null);
    try {
      if (typeof opts.save === 'function') opts.save(card);
      else if (store && store.setImportedCards) {
        // Storage 的两仓口径都是「{ cardId: card } 映射」，不是数组。
        // 优先走 getRawImportedCards：getImportedCards() 会过 normalizeCardOut，
        // 把它写回去等于顺手改写别的卡（导入不该有这种副作用）。
        var getter = store.getRawImportedCards || store.getImportedCards;
        var cur = (typeof getter === 'function' ? getter.call(store) : null) || {};
        if (Object.prototype.toString.call(cur) === '[object Array]') {
          var replaced = false;
          for (var i = 0; i < cur.length; i++) {
            if (cur[i] && cur[i].cardId === card.cardId) { cur[i] = card; replaced = true; break; }
          }
          if (!replaced) cur.push(card);
        } else {
          cur[card.cardId] = card;
        }
        store.setImportedCards(cur);
      } else if (store && typeof store.saveCard === 'function') {
        store.saveCard(card);
      } else return { ok: false, reason: '没有可用的存储接口，未落库' };
    } catch (e) {
      return { ok: false, reason: '落库失败：' + e.message };
    }
    if (result.importId) ImportVault.linkCard(result.importId, card.cardId, { note: '由导入生成' });
    return { ok: true, cardId: card.cardId };
  },

  // ---- 报告 ----
  reportText: function (resultOrReport) {
    var rep = resultOrReport && resultOrReport.report ? resultOrReport.report : resultOrReport;
    return ImportReport.toText(rep);
  },

  // 各子模块透出，方便单独测试
  formats: function () { return ImportFormats; },
  middle: function () { return ImportMiddle; },
  vault: function () { return ImportVault; },
  draft: function () { return ImportDraft; },
  pipeline: function () { return ImportPipeline; }
};

// 宽容 JSON 解析：AI 常带代码围栏 / 前后废话
function parseJsonLoose(text) {
  if (!text) return null;
  var s = String(text).trim();
  var fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (e) {}
  var first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (e2) {}
  }
  return null;
}

if (typeof window !== 'undefined') window.Import = Import;
if (typeof module !== 'undefined' && module.exports) module.exports = Import;

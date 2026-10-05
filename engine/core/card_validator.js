// ============================================================
// 核心层 · 卡带校验
// 校验导入卡带的必填字段、类型、panels num 完整性。纯函数，无外部依赖。
// ============================================================

// ============================================================
// 卡带校验
// ============================================================
var CardValidator = {
  validate(card) {
    if (typeof card !== 'object' || card === null) return { ok: false, msg: '不是有效对象' };
    const req = ['schemaVersion', 'cardId', 'cardName', 'game', 'hud', 'sidebar', 'panels', 'attributes'];
    for (const k of req) if (!(k in card)) return { ok: false, msg: '缺少必填字段：' + k };
    if (!card.game.title) return { ok: false, msg: 'game.title 不能为空' };
    if (!Array.isArray(card.hud)) return { ok: false, msg: 'hud 必须是数组' };
    if (!Array.isArray(card.sidebar)) return { ok: false, msg: 'sidebar 必须是数组' };
    if (!Array.isArray(card.panels)) return { ok: false, msg: 'panels 必须是数组' };
    if (!Array.isArray(card.attributes)) return { ok: false, msg: 'attributes 必须是数组' };
    const nums = card.panels.map(p => p.num).sort();
    for (const n of [2,3,4,5]) if (!nums.includes(n)) return { ok: false, msg: 'panels 缺少 num=' + n };
    // P24·④：结局「开局即满足」静态自查（只报 warnings，不拦导入）
    const warnings = this.auditEndingsAtStart(card);
    return warnings.length ? { ok: true, warnings: warnings } : { ok: true };
  },

  // ============ P24·④ 结局「开局即满足」自查 ============
  // 背景：结局条件由 engine/endings.js 每轮 tick 判定，而开局时数值就是卡带的 init。
  //   作者把坏结局条件写成「某数值 ≤ 它的最低值」（很常见），又没写回合/事件门槛时，
  //   第一轮（AI 回完开场白）就会直接秒结局 —— 玩家什么都没做。
  //   endings.js 侧已加门槛（缺省 minRound: 2）；这里把「没写门槛而又开局即成立」的结局查出来。
  // 语义与 engine/events.js 的 _readStatValue 对齐：只认 hud / sidebar / panels[].entries。
  auditEndingsAtStart(card) {
    const out = [];
    const endings = (card && card.worldbook && card.worldbook.endings) || [];
    if (!Array.isArray(endings) || !endings.length) return out;
    const init = this._initialValues(card);
    for (const def of endings) {
      if (!def || !def.id) continue;
      // 作者写过门槛（含 minRound: 1 这种「我就是要开局即结局」）→ 视为显式意图，不报警；
      // 只有「一个门槛字段都没写、而开局条件就成立」才是需要提示的疏漏。
      const declared = (def.minRound != null)
        || (Array.isArray(def.requireEvents) && def.requireEvents.length > 0);
      if (declared) continue;
      const t = def.trigger;
      if (!t || t.type !== 'value' || !t.key) continue;
      const it = init[t.key];
      if (!it) continue;
      if (!this._cmpOp(it.value, t.op || '<', Number(t.value))) continue;
      out.push('结局「' + (def.name || def.id) + '」开局即满足触发条件（' + t.key + ' ' + (t.op || '<') + ' ' + t.value
        + '，开局值 ' + it.value + '）：第一轮就会直接结局。建议加 minRound（至少玩到第 N 轮）或 requireEvents（先触发某事件），或改阈值。');
    }
    return out;
  },

  // 卡带声明的开局数值（只含引擎能读到的三处容器）
  _initialValues(card) {
    const out = {};
    const put = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        if (!it || !it.key) continue;
        const raw = (it.init != null) ? it.init : (it.current != null ? it.current : null);
        if (raw == null) continue;
        if (out[it.key]) continue;
        const n = Number(raw);
        out[it.key] = { value: isFinite(n) ? n : raw, min: it.min, name: it.name || it.label || '' };
      }
    };
    put(card && card.hud);
    put(card && card.sidebar);
    const panels = (card && card.panels) || [];
    if (Array.isArray(panels)) for (const p of panels) put(p && p.entries);
    return out;
  },

  _cmpOp(cur, op, v) {
    if (op === '<') return cur < v;
    if (op === '<=') return cur <= v;
    if (op === '>') return cur > v;
    if (op === '>=') return cur >= v;
    if (op === '==') return cur === v;
    if (op === '!=') return cur !== v;
    return false;
  },

  // 身份层 display 是【可选段】：这里的结果永不参与 validate 的导入拦截。
  // 非法一律由 CardDisplay 在渲染时回退默认，本函数只负责"诊断口报一条"。
  // 返回 { present, valid, diag }：
  //   present=false 无段（老卡，正常）；valid=false 段有问题但不拦导入，diag 为人话一条。
  validateDisplaySeg(raw) {
    if (raw === undefined || raw === null) return { present: false, valid: true, diag: null };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { present: true, valid: false, diag: 'display 必须是对象，已忽略整段并回退默认身份' };
    }
    // 优先委托 CardDisplay 的逐字段诊断（浏览器与 rn_smoke 均已挂载）
    if (typeof CardDisplay !== 'undefined' && CardDisplay && typeof CardDisplay.inspectDisplay === 'function') {
      var r = CardDisplay.inspectDisplay(raw);
      if (!r.diagnostics.length) return { present: true, valid: true, diag: null };
      return { present: true, valid: false, diag: r.diagnostics.join('；') };
    }
    // Node 独立 require 本文件（无 CardDisplay 上下文）时的粗兜底
    if (raw.theme !== undefined && raw.theme !== null
        && ['paper', 'glass', 'scroll'].indexOf(String(raw.theme).trim()) < 0) {
      return { present: true, valid: false, diag: 'display.theme 只允许 paper/glass/scroll，已回退 paper' };
    }
    if (raw.accent !== undefined && raw.accent !== null && raw.accent !== ''
        && !/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(raw.accent).trim())) {
      return { present: true, valid: false, diag: 'display.accent 必须是 #hex 色值，已回退主题身份色' };
    }
    return { present: true, valid: true, diag: null };
  },

  normalizeDefs(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      // G 批 · wrapper 盲区修复（card_validator.js）：
      // 识别 wrapper 配置对象——{enabled:true, list:[...]} / {enabled, types:[...]} 等，
      // wrapper 键名约定：list/types/items/entries/data，取该数组作为映射源。
      // 旧版直接走对象映射路径会把 'list' / 'types' 当作条目 key 注入 id:'list'，
      // 产出幽灵条目 [{id:'list'}] —— 真实"修仙模拟器"卡即此形态。
      // 判定优先级：wrapper 键命中优先于对象映射路径，避免误把 wrapper 当映射。
      var wrapperKeys = ['list', 'types', 'items', 'entries', 'data'];
      for (var wi = 0; wi < wrapperKeys.length; wi++) {
        var wk = wrapperKeys[wi];
        if (Object.prototype.hasOwnProperty.call(v, wk) && Array.isArray(v[wk])) {
          // 取该数组作为映射源；内层条目仍要求 object，
          // 字符串条目如 '宗门任务' 过滤掉，输出空数组可接受。
          // 不注入 id：wrapper 数组里条目已有 id 时保留，无 id 时由消费侧 if(n.id) 守卫跳过。
          return v[wk].filter(function(item) {
            return item && typeof item === 'object' && !Array.isArray(item);
          });
        }
      }
      // 非 wrapper：维持现行为（对象映射 → 注入 id 数组）
      return Object.keys(v).map(function(k) {
        var item = v[k];
        return (typeof item === 'object' && item) ? Object.assign({ id: k }, item) : null;
      }).filter(Boolean);
    }
    return [];
  }
};

if (typeof window !== 'undefined') window.CardValidator = CardValidator;
if (typeof module !== 'undefined' && module.exports) module.exports = CardValidator;

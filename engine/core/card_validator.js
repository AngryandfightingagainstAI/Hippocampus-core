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
    return { ok: true };
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

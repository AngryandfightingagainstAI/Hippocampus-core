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
    // P43：兼容字段归一（顶层 npcs → worldbook.npcs），只报 warnings，不拦导入
    const moved = this.normalizeCard(card);
    // P24·④：结局「开局即满足」静态自查（只报 warnings，不拦导入）
    const warnings = this.auditEndingsAtStart(card);
    for (const m of moved) warnings.push(m);
    // P73·S3：时间线（同人未来是不是被写成铁轨）只报 warnings，不拦导入
    for (const m of this.auditTimeline(card)) warnings.push(m);
    // P72·W4：NPC 口吻（voice）自查 —— 全可选段，只报 warnings，绝不拦导入
    for (const m of this.auditNpcVoices(card)) warnings.push(m);
    // P72·W9：worldbook.lore（世界书关键词触发）——可选字段，同样只警告不拦导入
    for (const m of this.auditLore(card)) warnings.push(m);
    // P76·Fix4：天命段（worldbook.destiny）自查 —— 写卡 AI 很容易把 sets 写成 300、
    //   公式写成 "3d6+"、属性名带空格；运行期这些只是「天命面板不出现 / 掷出怪值」，
    //   玩家只会觉得坏了。导入时把问题报成 warning（绝不拦导入）。
    for (const m of this.auditDestiny(card)) warnings.push(m);
    return warnings.length ? { ok: true, warnings: warnings } : { ok: true };
  },

  // ============ P76·Fix4 · 天命段（worldbook.destiny）============
  // 卡带可选段：worldbook.destiny = { enabled, sets, attributes[{key,name,formula,min,max}] }
  //   属性项数不设上限（3/6/8/20 都行）；sets 运行期上限 1000（防掷点卡死），
  //   公式支持 3d6 / 4d6kh3 / 4d6dl1 / 3d6! / (2d6+6)*5 一类开源骰子记号。
  auditDestiny(card) {
    const out = [];
    try {
      const d = card && card.worldbook && card.worldbook.destiny;
      if (d == null) return out;
      if (typeof d !== 'object' || Array.isArray(d)) return ['worldbook.destiny 必须是对象，已忽略整段'];
      if (d.enabled != null && typeof d.enabled !== 'boolean') {
        out.push('worldbook.destiny.enabled 应写 true/false，现在是 ' + JSON.stringify(d.enabled) + '，会被当成「未开启」');
      }
      const rawSets = d.sets;
      const sets = parseInt(rawSets, 10);
      if (rawSets != null && (!isFinite(sets) || sets < 1)) {
        out.push('worldbook.destiny.sets 应为正整数，现在是 ' + JSON.stringify(rawSets) + '，运行期按 1 组处理');
      } else if (isFinite(sets) && sets > 1000) {
        out.push('worldbook.destiny.sets=' + sets + ' 过大，运行期会被压到 1000 组（防止掷点卡死）');
      }
      if (!Array.isArray(d.attributes)) {
        out.push('worldbook.destiny.attributes 必须是数组，否则天命面板不会出现');
        return out;
      }
      if (!d.attributes.length) {
        out.push('worldbook.destiny.attributes 是空数组，天命面板不会出现');
        return out;
      }
      const D = (typeof Destiny !== 'undefined' && Destiny) ? Destiny : null;
      const seen = {};
      let okCount = 0;
      d.attributes.forEach(function (a, i) {
        const at = 'worldbook.destiny.attributes[' + i + ']';
        if (!a || typeof a !== 'object') { out.push(at + ' 不是对象，已跳过'); return; }
        const key = String(a.key == null ? '' : a.key);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          out.push(at + '.key「' + key + '」不合法（只能是字母/数字/下划线、不能以数字开头、不能带空格），已跳过');
          return;
        }
        if (seen[key]) { out.push(at + '.key「' + key + '」重复，只保留第一项'); return; }
        seen[key] = true;
        if (a.min != null && a.max != null && Number(a.min) > Number(a.max)) {
          out.push(at + ' 的 min(' + a.min + ') 大于 max(' + a.max + ')，掷出的值会被夹到反方向');
        }
        const f = String(a.formula == null ? '' : a.formula).trim();
        if (!f) { out.push(at + '.formula 为空，这项掷不出数，已跳过'); return; }
        if (D && typeof D.parseFormula === 'function' && !D.parseFormula(f)) {
          out.push(at + '.formula「' + f + '」不是合法骰子表达式（支持 3d6 / 4d6kh3 / 4d6dl1 / 3d6! / (2d6+6)*5），这项会被丢弃');
          return;
        }
        okCount++;
      });
      if (!okCount) out.push('worldbook.destiny 里没有一项可用属性，天命面板不会出现');
    } catch (e) {}
    return out;
  },

  // ============ P72·W4 · NPC 口吻（voice）============
  // 卡带可选段：worldbook.npcs[].voice = { style, examples[], taboo[], catchphrase[] }
  //   style       一句话风格描述（≤120 字）
  //   examples    参考台词，≤3 条（每条 ≤60 字）
  //   taboo       禁忌/绝不说的话，≤6 条
  //   catchphrase 口头禅，≤4 条
  // 设计：voice 是「锦上添花」，缺了、写歪了都不该拦导入 —— 只把问题报成 warning，
  //   运行期由 normalizeVoice() 再兜一次（截断超长、丢掉非字符串项）。
  // P72·W9：世界书关键词触发的卡带侧校验。纯可选字段——没有 lore 的卡带
  //   一条警告都不会多（行为与改动前完全一致）。
  auditLore(card) {
    try {
      const lore = card && card.worldbook && card.worldbook.lore;
      if (lore == null) return [];
      if (typeof LoreTrigger !== 'undefined' && LoreTrigger && typeof LoreTrigger.auditList === 'function') {
        return LoreTrigger.auditList(lore);
      }
      if (!Array.isArray(lore)) return ['worldbook.lore 必须是数组，已忽略整段'];
      return [];
    } catch (e) {
      return [];
    }
  },

  // P73·S3：时间线自查（worldbook.timeline）。
  //   运行时 fanFuture 只是「默认走向」（prompt 里明确写了非强制），但卡带作者很容易
  //   把它写成铁轨（"必须""一定""不可改变"），或者反过来把同人推断当原作事实塞进 official。
  //   这两种都会让 AI 在玩家改变剧情后强行纠正。只报 warning，不拦导入。
  auditTimeline(card) {
    const out = [];
    try {
      const tl = (card && card.worldbook && card.worldbook.timeline) || null;
      if (!tl || typeof tl !== 'object') return out;
      const ff = Array.isArray(tl.fanFuture) ? tl.fanFuture : [];
      const off = Array.isArray(tl.official) ? tl.official : [];
      if (ff.length && !off.length) {
        out.push('worldbook.timeline.fanFuture 有内容但 official 为空：同人卡带通常要先写"玩家进入之前发生过什么"，否则 AI 分不清原作事实与后续推断');
      }
      const HARD = /(必须|一定要|必然|不可改变|不能改变|注定|铁律|务必)/;
      let hardHit = 0;
      ff.forEach(function (ev) {
        if (!ev || typeof ev !== 'object') return;
        const blob = String(ev.event || '') + ' ' + String(ev.narrative || '') + ' ' + String(ev.outcome || '');
        if (HARD.test(blob)) hardHit++;
      });
      if (hardHit) {
        out.push('worldbook.timeline.fanFuture 有 ' + hardHit + ' 条写成"必然/必须"：它是默认走向而不是铁轨，玩家改了就顺着玩家的行动发展（建议改成中性叙述）');
      }
    } catch (e) {}
    return out;
  },

  auditNpcVoices(card) {    const out = [];
    const npcs = (card && card.worldbook && Array.isArray(card.worldbook.npcs)) ? card.worldbook.npcs : [];
    for (const def of npcs) {
      if (!def || typeof def !== 'object') continue;
      const v = def.voice;
      if (v === undefined || v === null) continue;
      const who = def.name || def.id || '(未命名)';
      if (typeof v !== 'object' || Array.isArray(v)) {
        out.push('NPC「' + who + '」的 voice 必须是对象，已忽略整段');
        continue;
      }
      if (v.style != null && typeof v.style !== 'string') {
        out.push('NPC「' + who + '」的 voice.style 必须是字符串，已忽略');
      } else if (typeof v.style === 'string' && v.style.length > 120) {
        out.push('NPC「' + who + '」的 voice.style 超过 120 字，注入时会被截断');
      }
      for (const key of ['examples', 'taboo', 'catchphrase']) {
        const arr = v[key];
        if (arr == null) continue;
        if (!Array.isArray(arr)) {
          out.push('NPC「' + who + '」的 voice.' + key + ' 必须是数组，已忽略');
          continue;
        }
        if (key === 'examples' && arr.length > 3) {
          out.push('NPC「' + who + '」的 voice.examples 有 ' + arr.length + ' 条，只取前 3 条');
        }
        if (key === 'taboo' && arr.length > 6) {
          out.push('NPC「' + who + '」的 voice.taboo 有 ' + arr.length + ' 条，只取前 6 条');
        }
        if (key === 'catchphrase' && arr.length > 4) {
          out.push('NPC「' + who + '」的 voice.catchphrase 有 ' + arr.length + ' 条，只取前 4 条');
        }
      }
    }
    return out;
  },

  // 运行期兜底：把 voice 归一成「可直接拼进提示词」的形状；没有 voice 返回 null。
  normalizeVoice(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const str = (s, max) => {
      if (typeof s !== 'string') return '';
      const t = s.replace(/\s+/g, ' ').trim();
      return t.length > max ? t.slice(0, max) + '…' : t;
    };
    const list = (arr, maxN, maxLen) => {
      if (!Array.isArray(arr)) return [];
      const out = [];
      for (const it of arr) {
        if (typeof it !== 'string') continue;
        const t = str(it, maxLen);
        if (t) out.push(t);
        if (out.length >= maxN) break;
      }
      return out;
    };
    const style = str(raw.style, 120);
    const examples = list(raw.examples, 3, 60);
    const taboo = list(raw.taboo, 6, 40);
    const catchphrase = list(raw.catchphrase, 4, 40);
    if (!style && !examples.length && !taboo.length && !catchphrase.length) return null;
    return { style: style, examples: examples, taboo: taboo, catchphrase: catchphrase };
  },

  // ============ P43 · 兼容字段归一（让文档承诺成真） ============
  // 模板承诺（ui_cards.js / rn/instruction_templates.js「兼容 / 保留字段」段）：
  //   「只有 worldbook.npcs 缺失时，引擎才读顶层 npcs。」
  // 实际：运行期读取口全是 wb.npcs（npc_runtime.js:337 等 14 处），只有卡片编辑器 editor.js:36 读 card.npcs
  //   ⇒ 只写顶层 npcs 的卡带「编辑器里看得到人物，游戏里一个都没有」，且不报错。
  // 修法：在 validate() 里统一并入（validate 是两仓所有导入路径的必经点）+ gamestate.loadFromSave 对老存档同样处理。
  normalizeCard(card) {
    const moved = [];
    if (!card || typeof card !== 'object') return moved;
    const wb = (card.worldbook && typeof card.worldbook === 'object' && !Array.isArray(card.worldbook)) ? card.worldbook : null;
    const top = Array.isArray(card.npcs) ? card.npcs : null;
    const note = '兼容字段：顶层 npcs（' + (top ? top.length : 0) + ' 个）已并入 worldbook.npcs —— 运行期只读 worldbook.npcs，顶层写法在游戏里不生效';
    if (top && top.length) {
      if (!wb) { card.worldbook = { npcs: top.slice() }; moved.push(note); }
      else if (!Array.isArray(wb.npcs) || wb.npcs.length === 0) { wb.npcs = top.slice(); moved.push(note); }
    }
    if (wb) {
      if (!Array.isArray(wb.npcs)) wb.npcs = [];
      if (!Array.isArray(wb.events)) wb.events = [];
      if (!Array.isArray(wb.storyNodes)) wb.storyNodes = [];
    }
    return moved;
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

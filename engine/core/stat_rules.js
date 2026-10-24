// ============================================================
// 核心层 · 数值规则（属性标识 / 点数池）唯一实现
//
// 为什么需要这个文件（阶段 A 审计结论）：
//   · 卡带配置里属性 key 有两种写法：`str` 与 `attr_str`；
//   · playerData 里既可能存 `attr_str`（新逻辑），也可能只有 `str`（旧存档 / 旧天命写入）；
//   · 过去 portrait.js 的「天命锁集合」按裸键建、池统计按 'attr_' 拼，两套口径一撞，
//     带前缀的卡带就会出现「天命已锁的属性仍占创角池」「超池不报警」两个实测 bug。
//   · 本文件把「规范键 / 取值 / 池统计 / 锁集合 / patch 归一」收成一份纯函数实现，
//     桌面（index.html 先加载）与 RN（require）共用；锁定、池统计、patch、存档读取
//     都必须走这里，不许在调用点手拼 'attr_' + key。
//
// 规范（阶段 A 定稿）：
//   · 卡带配置 `card.attributes[].key` 允许 `str` 或 `attr_str`，二者等价；
//   · 内部标识一律用规范键 `attr_<bare>`（playerData 存储、锁集合、patch、池统计）；
//   · 读取时先读规范键，缺失再读裸键（旧存档兼容）；
//   · 归一化只发生在「读取边界」（defs / valueOf / normalizePatch），
//     不改写卡带文件、不迁移玩家存档；
//   · 重复前缀（历史上 pickDestiny 对带前缀 key 又拼了一次 attr_）按同义处理，
//     即 `attr_attr_str` 与 `attr_str` 都归一为 `attr_str`。
//
// 纯函数：零 DOM、零 GameState 依赖，可在 Node / vm / Hermes 里直接跑。
// ============================================================
(function() {
  'use strict';

  function str(v) { return v == null ? '' : String(v); }

  // 去掉所有前导 attr_，得到裸键；'attr_str' / 'attr_attr_str' / 'str' → 'str'
  function bare(key) {
    var k = str(key);
    while (k.indexOf('attr_') === 0) k = k.slice(5);
    return k;
  }

  // 规范键：'str' / 'attr_str' / 'attr_attr_str' → 'attr_str'
  function canon(key) {
    var b = bare(key);
    return b ? ('attr_' + b) : '';
  }

  function isCanon(key) { return str(key).indexOf('attr_') === 0; }

  // 数值读取：只接受「有限 number」与「十进制数字字符串」（旧存档兼容）。
  // 不做隐式 JS 转换：true / false / [] / '0x10' / '1e3' / '   ' 一律视为非数值。
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  // 读一个属性值：规范键优先，裸键兜底（兼容旧存档）
  function valueOf(data, key) {
    if (!data) return null;
    var c = canon(key), b = bare(key);
    var v = num(data[c]);
    if (v != null) return v;
    v = num(data[b]);
    if (v != null) return v;
    // 历史双前缀（attr_attr_str）：只读兜底，不写回
    return num(data['attr_' + c]);
  }

  // 属性步骤判定：所有字段都是 number，或所有 key 都以 attr_ 开头
  function isAttrStep(step) {
    if (!step || !step.fields || !step.fields.length) return false;
    var allNumber = true, allAttrKey = true;
    for (var i = 0; i < step.fields.length; i++) {
      var f = step.fields[i] || {};
      if (f.type !== 'number') allNumber = false;
      if (!f.key || str(f.key).indexOf('attr_') !== 0) allAttrKey = false;
    }
    return allNumber || allAttrKey;
  }

  // 属性定义表（权威源 = card.attributes）
  //   · 顺序与 card.attributes 一致；
  //   · 创角属性步里出现、但 attributes 没声明的键，按 legacy 补进来（旧卡兼容）；
  //   · min/max/init 以 attributes 为准，属性缺省时才用字段值兜底。
  function defs(card, step) {
    var out = [], byKey = {};
    function add(d) {
      var key = canon(d && d.key);
      if (!key) return null;
      if (byKey[key]) return byKey[key];
      var def = {
        key: key,
        bare: bare(d.key),
        name: d.name || d.label || bare(d.key),
        min: num(d.min),
        max: num(d.max),
        init: num(d.init),
        legacy: !!d.legacy
      };
      byKey[key] = def;
      out.push(def);
      return def;
    }
    var attrs = (card && card.attributes) || [];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (!a || !a.key) continue;
      add({ key: a.key, name: a.name, min: a.min, max: a.max, init: a.init });
    }
    if (isAttrStep(step)) {
      for (var j = 0; j < step.fields.length; j++) {
        var f = step.fields[j] || {};
        if (!f.key) continue;
        var hit = byKey[canon(f.key)];
        if (hit) {
          if (hit.min == null) hit.min = num(f.min);
          if (hit.max == null) hit.max = num(f.max);
          if (hit.init == null) hit.init = num(f.default);
          if (!hit.name) hit.name = f.label || f.name || hit.name;
          continue;
        }
        add({ key: f.key, name: f.label || f.name, min: f.min, max: f.max, init: f.default, legacy: true });
      }
    }
    return out;
  }

  // 属性定义查表：canon 键与裸键都能命中（调用方不必再手拼 'attr_<key>'）
  function defMap(card, step) {
    var out = {};
    var list = defs(card, step);
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      out[d.key] = d;
      if (d.bare) out[d.bare] = d;
    }
    return out;
  }

  // ============ A2 · 属性定义冲突诊断 ============
  // 背景：card.attributes 是唯一权威源；属性步 step.fields 里也常带一份 min/max/default/label。
  // 两者对同一属性给出不同值时，**实际生效的仍然是 card.attributes**（defs 的既有约定），
  // 过去这种冲突完全静默，写卡作者看不出自己那份 step.fields 没被采用。
  // 这里只产出诊断，不改写、不合并、不覆盖任何一边（A2 任务书 3.2）。
  function defConflicts(card, step) {
    if (!isAttrStep(step)) return [];
    var attrs = {};
    var list = (card && card.attributes) || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || !a.key) continue;
      var key = canon(a.key);
      if (!key || attrs[key]) continue;
      attrs[key] = {
        key: key,
        bare: bare(a.key),
        name: str(a.name),
        min: num(a.min),
        max: num(a.max),
        init: num(a.init)
      };
    }
    var out = [];
    (step.fields || []).forEach(function(f, fi) {
      if (!f || !f.key) return;
      var k = canon(f.key);
      var a = attrs[k];
      if (!a) return;
      var diffs = [];
      function cmp(field, fromAttrs, fromFields) {
        if (fromAttrs == null || fromFields == null) return;
        if (typeof fromAttrs === 'number' || typeof fromFields === 'number') {
          if (String(fromAttrs) !== String(fromFields)) {
            diffs.push({ field: field, attributes: fromAttrs, fields: fromFields });
          }
          return;
        }
        var sa = str(fromAttrs), sf = str(fromFields);
        if (sa && sf && sa !== sf) diffs.push({ field: field, attributes: sa, fields: sf });
      }
      cmp('min', a.min, num(f.min));
      cmp('max', a.max, num(f.max));
      cmp('init', a.init, num(f.default));
      cmp('name', a.name, str(f.label || f.name));
      if (!diffs.length) return;
      out.push({
        key: k,
        bare: a.bare,
        fieldIndex: fi,
        fieldKey: f.key,
        diffs: diffs,
        effective: { min: a.min, max: a.max, init: a.init, name: a.name }
      });
    });
    return out;
  }

  // 冲突 → 人类可读诊断（给 card_validator 的 warning 列表 / 创建流程的控制台提示复用）
  //   每条都明确写出「实际生效以 card.attributes 为准」，避免作者误以为 step.fields 生效。
  function defWarnings(card, step) {
    return defConflicts(card, step).map(function(c) {
      var parts = c.diffs.map(function(d) {
        return d.field + ' card.attributes=' + d.attributes + ' / 创角字段=' + d.fields;
      });
      var eff = [];
      if (c.effective.min != null) eff.push('min=' + c.effective.min);
      if (c.effective.max != null) eff.push('max=' + c.effective.max);
      if (c.effective.init != null) eff.push('init=' + c.effective.init);
      if (c.effective.name) eff.push('name=' + c.effective.name);
      return '属性「' + c.key + '」定义冲突（创角字段「' + c.fieldKey + '」）：' + parts.join('；') +
        '；实际生效 ' + (eff.length ? eff.join(', ') : '仅 card.attributes') + '（以 card.attributes 为准）';
    });
  }

  // 点数池：步骤级 pool 优先，其次卡带级 attributePool
  function poolOf(card, step) {
    var p = step && step.pool;
    if (p && p.total != null) {
      return { total: num(p.total), base: num(p.base) != null ? num(p.base) : 0 };
    }
    var cp = card && card.attributePool;
    if (cp && cp.total != null) {
      return { total: num(cp.total), base: num(cp.base) != null ? num(cp.base) : 0 };
    }
    return null;
  }

  // 天命锁：只认 playerData._destiny.locked，值集合归一到规范键
  function lockOf(playerData) {
    var d = playerData && playerData._destiny;
    return (d && d.locked) ? d : null;
  }

  function lockedValues(playerData) {
    var lock = lockOf(playerData), out = {};
    if (!lock) return out;
    var vals = lock.values || {};
    Object.keys(vals).forEach(function(k) {
      var c = canon(k), v = num(vals[k]);
      if (c && v != null) out[c] = v;
    });
    return out;
  }

  // 已分配点数：Σ max(0, 值 - 下限)，下限 = def.min ?? base
  //   opts.excludeLocked：天命锁定项不计入创角池（P76·B 口径）
  //   opts.override：用 patch 里的新值代替 data 里的旧值（算「改完会变多少」）
  function allocated(list, data, base, opts) {
    opts = opts || {};
    var locked = opts.locked || null;
    var override = opts.override || null;
    var floorBase = (base == null ? 0 : base);
    var total = 0;
    (list || []).forEach(function(d) {
      if (!d || !d.key) return;
      if (opts.excludeLocked && locked && locked[d.key] != null) return;
      var v = (override && override[d.key] != null) ? override[d.key] : valueOf(data, d.key);
      if (v == null) return;
      var floorv = d.min != null ? d.min : floorBase;
      total += Math.max(0, v - floorv);
    });
    return total;
  }

  // 创角池剩余（锁定项不计入）；没有池返回 null
  function remaining(card, playerData, step) {
    var pool = poolOf(card, step);
    if (!pool || pool.total == null) return null;
    var list = defs(card, step);
    var used = allocated(list, playerData, pool.base, {
      excludeLocked: true,
      locked: lockedValues(playerData)
    });
    return Math.max(0, pool.total - used);
  }

  // 天命锁定项占用的点数（只用于展示「天命已占 N 点」，不进池）
  function destinyAllocated(card, playerData, step) {
    var pool = poolOf(card, step);
    var list = defs(card, step);
    var locked = lockedValues(playerData);
    var onlyLocked = list.filter(function(d) { return locked[d.key] != null; });
    return allocated(onlyLocked, playerData, pool ? pool.base : 0, {});
  }

  // patch 归一：键 → 规范键，值 clamp 到 min/max，未声明键 / 非数值给 warning
  function normalizePatch(patch, list, data) {
    var byKey = {};
    (list || []).forEach(function(d) {
      byKey[d.key] = d;
      byKey[d.bare] = d;
    });
    var values = {}, warnings = [];
    Object.keys(patch || {}).forEach(function(k) {
      var d = byKey[k] || byKey[canon(k)];
      if (!d) { warnings.push(k + ' 不是卡带声明的属性，已忽略'); return; }
      var v = num(patch[k]);
      if (v == null) { warnings.push(k + ' 不是有效数值，已忽略'); return; }
      if (d.min != null && v < d.min) {
        warnings.push(k + ' ' + v + ' 低于下限 ' + d.min + '，已收到 ' + d.min);
        v = d.min;
      }
      if (d.max != null && v > d.max) {
        warnings.push(k + ' ' + v + ' 超出上限 ' + d.max + '，已收到 ' + d.max);
        v = d.max;
      }
      values[d.key] = v;
    });
    return { values: values, warnings: warnings };
  }

  // 写属性值：规范键必写；syncBare=true 或旧裸键已存在时同步裸键（兼容旧读取方）
  function writeValue(data, key, value, syncBare) {
    if (!data) return;
    var c = canon(key), b = bare(key);
    if (!c) return;
    data[c] = value;
    if (b && b !== c && (syncBare === true || Object.prototype.hasOwnProperty.call(data, b))) {
      data[b] = value;
    }
  }

  // 天命锁冲突：patch 里改了锁定键（同值重写不算）
  function lockViolations(values, playerData) {
    var locked = lockedValues(playerData);
    var out = [];
    Object.keys(values || {}).forEach(function(k) {
      var c = canon(k);
      if (locked[c] == null) return;
      if (values[k] === locked[c]) return;
      out.push({ key: c, before: locked[c], after: values[k] });
    });
    return out;
  }

  var StatRules = {
    bare: bare,
    canon: canon,
    isCanon: isCanon,
    valueOf: valueOf,
    isAttrStep: isAttrStep,
    defs: defs,
    defMap: defMap,
    defConflicts: defConflicts,
    defWarnings: defWarnings,
    poolOf: poolOf,
    lockOf: lockOf,
    lockedValues: lockedValues,
    allocated: allocated,
    remaining: remaining,
    destinyAllocated: destinyAllocated,
    normalizePatch: normalizePatch,
    writeValue: writeValue,
    lockViolations: lockViolations
  };

  if (typeof window !== 'undefined') window.StatRules = StatRules;
  if (typeof globalThis !== 'undefined') globalThis.StatRules = StatRules;
  if (typeof module !== 'undefined' && module.exports) module.exports = StatRules;
})();

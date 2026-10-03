// ============================================================
// 骰子引擎 · CoC 跑团风格
// v2：加 SC 理智检定 / 幸运消耗 / 孤注一掷 + 自动注册工具
// ============================================================

(function() {
  function rand(n) { return Math.floor(Math.random() * n); }

  function rollDice(count, sides) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(rand(sides) + 1);
    return out;
  }

  // CoC 7版检定等级
  function checkLevel(rollValue, target) {
    if (rollValue === 1) return { level: '大成功', class: 'critical' };
    if (rollValue === 100) return { level: '大失败', class: 'fumble' };
    if (target < 50 && rollValue >= 96) return { level: '大失败', class: 'fumble' };
    if (rollValue <= Math.floor(target / 5)) return { level: '极难成功', class: 'extreme' };
    if (rollValue <= Math.floor(target / 2)) return { level: '困难成功', class: 'hard' };
    if (rollValue <= target) return { level: '成功', class: 'success' };
    return { level: '失败', class: 'fail' };
  }

  function rollBonus(bonusCount, mode) {
    var tens = [];
    for (var i = 0; i <= bonusCount; i++) tens.push(rand(10) * 10);
    var unit = rand(10);
    var chosenTens = mode === 'bonus' ? Math.min.apply(null, tens) : Math.max.apply(null, tens);
    var total = chosenTens + unit;
    if (total === 0) total = 100;
    return { dice: [total], tens: tens, unit: unit, total: total, mode: mode, bonusCount: bonusCount };
  }

  function parse(expr) {
    expr = String(expr || '').trim().replace(/\s+/g, '');
    if (!expr) return null;

    var m = expr.match(/^ra\s*([^\d]*)\s*(\d+)$/i);
    if (m) return { type: 'check', label: m[1] || '', target: parseInt(m[2], 10) };

    m = expr.match(/^(\d+)d(\d+)([bp])(\d+)$/i);
    if (m) {
      var cnt = parseInt(m[1], 10);
      var sides = parseInt(m[2], 10);
      var mode = m[3].toLowerCase() === 'b' ? 'bonus' : 'penalty';
      var bonusCount = parseInt(m[4], 10);
      if (cnt !== 1 || sides !== 100) return null;
      return { type: 'bonus', bonusCount: bonusCount, mode: mode };
    }

    m = expr.match(/^(\d+)d(\d+)([+\-]\d+)?$/i);
    if (m) {
      return {
        type: 'normal',
        count: parseInt(m[1], 10),
        sides: parseInt(m[2], 10),
        mod: m[3] ? parseInt(m[3], 10) : 0
      };
    }
    return null;
  }

  // 判断是否成功
  function isSuccessLevel(level) {
    return ['大成功', '极难成功', '困难成功', '成功'].indexOf(level) >= 0;
  }

  // ============ 规则说明（供 UI 展示） ============
  var RULES = {
    checkLevels: [
      { name: '大成功', desc: '掷出 1。额外奖励。' },
      { name: '极难成功', desc: '掷出 ≤ 目标值 / 5。' },
      { name: '困难成功', desc: '掷出 ≤ 目标值 / 2。' },
      { name: '成功', desc: '掷出 ≤ 目标值。' },
      { name: '失败', desc: '掷出 > 目标值。' },
      { name: '大失败', desc: '掷出 100，或目标值 <50 时掷出 ≥96。' }
    ],
    bonusPenalty: '奖励骰 1d100b1：掷 2 次十位，取最小；惩罚骰 1d100p1：取最大。',
    opposed: '双方各掷 1d100 检定，比较成功等级。同级看骰值小者胜。',
    sc: 'SC 理智检定：对 SAN 值掷 1d100。成功扣较少理智，失败扣较多。',
    push: '孤注一掷：失败后可重掷一次，但大失败范围扩大到 ≥95。',
    luck: '幸运消耗：花 1 点幸运，可将骰值调整 1 点。'
  };

  var DiceEngine = {
    RULES: RULES,
    parse: parse,
    checkLevel: checkLevel,
    isSuccessLevel: isSuccessLevel,

    roll: function(expr, label) {
      var parsed = parse(expr);
      if (!parsed) return { ok: false, reason: '无法解析：' + expr };

      if (parsed.type === 'check') {
        var d = rollDice(1, 100);
        var v = d[0];
        var ck = checkLevel(v, parsed.target);
        return {
          ok: true, type: 'check', type2: 'dice',
          expression: expr,
          dice: d, total: v,
          target: parsed.target,
          label: label || parsed.label || '',
          check: ck
        };
      }

      if (parsed.type === 'bonus') {
        var r = rollBonus(parsed.bonusCount, parsed.mode);
        return {
          ok: true, type: 'bonus', type2: 'dice',
          expression: expr,
          dice: r.dice, total: r.total,
          tens: r.tens, unit: r.unit,
          mode: r.mode, bonusCount: r.bonusCount,
          label: label || ''
        };
      }

      if (parsed.type === 'normal') {
        var dice = rollDice(parsed.count, parsed.sides);
        var sum = dice.reduce(function(a, b) { return a + b; }, 0);
        var total = sum + parsed.mod;
        return {
          ok: true, type: 'normal', type2: 'dice',
          expression: expr,
          dice: dice, total: total,
          mod: parsed.mod,
          label: label || ''
        };
      }

      return { ok: false, reason: '未知类型' };
    },

    // ============ SC 理智检定 ============
    // 参数：
    //   san      当前理智值（数字）
    //   successLoss  成功时损失（数字或 "1d4" 表达式）
    //   failLoss     失败时损失
    //   label
    // 返回：检定结果 + 应扣多少 SAN
    rollSc: function(san, successLoss, failLoss, label) {
      var d = rollDice(1, 100);
      var v = d[0];
      var ck = checkLevel(v, san);
      var success = isSuccessLevel(ck.level);
      var lossExpr = success ? successLoss : failLoss;
      var lossVal = 0;

      if (typeof lossExpr === 'number') {
        lossVal = lossExpr;
      } else if (typeof lossExpr === 'string') {
        var lr = this.roll(lossExpr);
        if (lr.ok) lossVal = lr.total;
      }

      return {
        ok: true,
        type: 'sc', type2: 'dice',
        label: label || '理智检定',
        total: v,
        target: san,
        check: ck,
        success: success,
        loss: lossVal,
        successLoss: successLoss,
        failLoss: failLoss
      };
    },

    // ============ 孤注一掷 ============
    // 输入：上次检定的 { target, label }
    // 返回：重掷结果，大失败范围扩大（≥95）
    pushCheck: function(target, label) {
      var d = rollDice(1, 100);
      var v = d[0];
      var ck = checkLevel(v, target);
      // 孤注一掷：大失败范围扩大
      if (v >= 95) ck = { level: '大失败', class: 'fumble' };
      return {
        ok: true,
        type: 'check', type2: 'dice',
        label: (label || '') + '（孤注一掷）',
        total: v,
        target: target,
        check: ck,
        pushed: true
      };
    },

    formatResult: function(r) {
      if (!r || !r.ok) return '（骰子失败）';
      var label = r.label ? ('【' + r.label + '】') : '';
      if (r.type === 'check') return label + ' 掷出 ' + r.total + ' / 目标 ' + r.target + ' → ' + r.check.level;
      if (r.type === 'sc') return label + ' 掷出 ' + r.total + ' / 理智 ' + r.target + ' → ' + r.check.level + '（扣 ' + r.loss + '）';
      if (r.type === 'bonus') {
        var modeStr = r.mode === 'bonus' ? '奖励骰×' + r.bonusCount : '惩罚骰×' + r.bonusCount;
        return label + ' ' + modeStr + ' 十位[' + r.tens.join(',') + '] 个位' + r.unit + ' → ' + r.total;
      }
      if (r.type === 'normal') {
        var modStr = r.mod ? (r.mod > 0 ? '+' + r.mod : String(r.mod)) : '';
        return label + ' ' + r.dice.join('+') + modStr + ' → ' + r.total;
      }
      return '（未知骰型）';
    }
  };

  // ============ 工具注册（延迟） ============
  function findStatLocation(key) {
    var st = GameState.currentState;
    if (!st) return null;
    var item = (st.hud || []).find(function(x) { return x.key === key; });
    if (item) return { scope: 'hud', panelId: null, item: item };
    item = (st.sidebar || []).find(function(x) { return x.key === key; });
    if (item) return { scope: 'sidebar', panelId: null, item: item };
    var found = null;
    Object.keys(st.panels || {}).forEach(function(pid) {
      (st.panels[pid].entries || []).forEach(function(e) {
        if (e.key === key && !found) found = { scope: 'entry', panelId: pid, item: e };
      });
    });
    return found;
  }

  function registerTools() {
    if (typeof ToolExecutor === 'undefined' || !ToolExecutor.WHITELIST) {
      if (typeof ErrorLog !== 'undefined' && ErrorLog.action) {
        ErrorLog.action('BOOT', 'DiceEngine 工具注册失败：ToolExecutor 未就绪');
      }
      if (typeof console !== 'undefined') console.error('[DiceEngine] 工具注册失败：ToolExecutor 未就绪');
      return;
    }
    var DE = DiceEngine;

    // ---- roll_sc ----
    ToolExecutor.WHITELIST.roll_sc = {
      run: function(a) {
        var cfg = getDiceConfig();
        if (!cfg.enabled) return { ok: false, reason: '骰子系统未开启' };
        if (!cfg.sc) return { ok: false, reason: 'SC 理智检定未开启' };
        var sanKey = a.sanKey || 'san';
        var loc = findStatLocation(sanKey);
        if (!loc) return { ok: false, reason: '找不到理智值：' + sanKey };

        var san = loc.item.current != null ? loc.item.current : 0;
        var r = DE.rollSc(san, a.successLoss, a.failLoss, a.label || '理智检定');
        if (!r.ok) return r;

        // 自动扣 SAN
        var modRes = ToolExecutor._modifyStat(loc.scope, loc.panelId, sanKey, -r.loss);
        if (modRes.ok) {
          r.oldSan = modRes.oldVal;
          r.newSan = modRes.newVal;
        }

        // 缓存以供孤注一掷（SC 不允许 push，所以不缓存）
        r.label = a.label || '理智检定';
        return r;
      }
    };

    // ---- spend_luck ----
    ToolExecutor.WHITELIST.spend_luck = {
      run: function(a) {
        var cfg = getDiceConfig();
        if (!cfg.enabled) return { ok: false, reason: '骰子系统未开启' };
        if (!cfg.luckSpend) return { ok: false, reason: '幸运消耗未开启' };

        var luckKey = a.luckKey || 'luck';
        var amount = Number(a.amount) || 0;
        if (amount <= 0) return { ok: false, reason: 'amount 必须正数' };

        var loc = findStatLocation(luckKey);
        if (!loc) return { ok: false, reason: '找不到幸运值：' + luckKey };

        var cur = loc.item.current != null ? loc.item.current : 0;
        if (cur < amount) return { ok: false, reason: '幸运值不够（你有 ' + cur + '）' };

        var modRes = ToolExecutor._modifyStat(loc.scope, loc.panelId, luckKey, -amount);
        if (!modRes.ok) return modRes;

        return {
          ok: true,
          type: 'luck', type2: 'dice',
          label: a.label || '消耗幸运',
          spent: amount,
          oldLuck: modRes.oldVal,
          newLuck: modRes.newVal,
          reason: a.reason || ''
        };
      }
    };

    // ---- push_roll ----
    ToolExecutor.WHITELIST.push_roll = {
      run: function(a) {
        var cfg = getDiceConfig();
        if (!cfg.enabled) return { ok: false, reason: '骰子系统未开启' };
        if (!cfg.pushRoll) return { ok: false, reason: '孤注一掷未开启' };

        var last = GameState._lastCheck;
        if (!last) return { ok: false, reason: '没有可孤注一掷的检定' };
        if (last.pushed) return { ok: false, reason: '已经孤注一掷过了' };

        var r = DE.pushCheck(last.target, last.label);
        GameState._lastCheck = r;
        return r;
      }
    };
  }

  // P16·B1：同步注册（原为 setTimeout(registerTools, 900~1900ms) 错峰注册）。
  //   错峰注册让冷启动后约 2 秒内 ToolExecutor.WHITELIST 只有内置的 15 个工具，AI 此时
  //   调用本模块的工具会拿到「未知工具：xxx」；而未知工具要连续失败 3 次才会提示 AI，
  //   中间它会反复重试同一个不存在的工具、白烧 token。ToolExecutor 在两仓的装载顺序里
  //   都排在本模块之前（index.html 的 <script> 顺序 / rn_bootstrap.js 的 load 顺序），
  //   所以这里可以直接同步注册。
  if (typeof ToolExecutor !== 'undefined' && ToolExecutor.WHITELIST) {
    registerTools();
  } else {
    // 顺序异常时的兜底：只退到下一轮事件循环（原实现要等 900~1900ms）。
    // registerTools 自己的就绪检查会写一条 BOOT 错误，不会静默少工具。
    setTimeout(registerTools, 0);
  }

  if (typeof window !== 'undefined') window.DiceEngine = DiceEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = DiceEngine;
})();
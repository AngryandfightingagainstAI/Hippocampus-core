// P72·W9：世界书关键词触发（按需注入）
//
// 为什么：世界书现在整份塞 prompt（prompt_builder.buildSemiStatic / buildEntityIndex），
//   卡带一厚就吃满预算。关键词触发的本质是「只在被提到时才注入那一条」。
//
// 关键约束：**没有 worldbook.lore 的卡带，行为完全不变**（一个字符都不多）。
//   这一点由 test_lore_trigger.js 的 L1 硬门把着。
//
// 纯逻辑、无 DOM、无网络、无 Storage 依赖（两仓同源，RN 也能直接用）。
var LoreTrigger = (function () {
  'use strict';

  var MAX_HITS = 3;      // 最多注入 3 条（再多就是整份塞了，失去按需的意义）
  var MAX_CHARS = 600;   // 命中条目正文总预算
  var HIT_TEXT_MAX = 240; // 单条正文上限（超出截断，避免一条就吃满）

  function _norm(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim();
  }

  // 全角/半角、大小写、去标点后做包含判断：中文没有词边界，只按「子串命中」算，
  //   但要求关键词长度 >= 2 且不是纯标点，避免单字误触发。
  function _fold(s) {
    if (typeof s !== 'string') return '';
    var t = s.toLowerCase();
    // 全角 ASCII → 半角
    t = t.replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    t = t.replace(/\u3000/g, ' ');
    return t;
  }

  function _keysOf(item) {
    var ks = (item && item.keys) || [];
    if (!Array.isArray(ks)) return [];
    var out = [];
    for (var i = 0; i < ks.length; i++) {
      var k = _norm(ks[i]);
      if (!k) continue;
      if (k.length < 2) continue;
      out.push(_fold(k));
    }
    return out;
  }

  function _hitIndex(text, keys) {
    var hay = _fold(text);
    if (!hay) return -1;
    var best = -1;
    for (var i = 0; i < keys.length; i++) {
      var at = hay.indexOf(keys[i]);
      if (at >= 0 && (best < 0 || at < best)) best = at;
    }
    return best;
  }

  /**
   * match(loreList, ctx) → [{ id, name, text, chars, via, at }]
   *   ctx = { playerText, recentText }
   *   规则：trigger==='always' 或 keys 为空 ⇒ 常驻（排在前面）；
   *        其余按关键词命中位置从早到晚；最多 MAX_HITS 条、正文合计 MAX_CHARS。
   */
  function match(loreList, ctx) {
    if (!Array.isArray(loreList) || !loreList.length) return [];
    var playerText = _norm((ctx && ctx.playerText) || '');
    var recentText = _norm((ctx && ctx.recentText) || '');
    var always = [];
    var hits = [];
    for (var i = 0; i < loreList.length; i++) {
      var it = loreList[i];
      if (!it || typeof it !== 'object') continue;
      var text = _norm(it.text);
      if (!text) continue;
      // 「有没有写 keys」看原数组（写了但全是单字/空白，说明作者本想做关键词触发，
      //   只是词太短——这种条目**不该**降级成常驻，否则一条单字关键词就把整本塞进去）。
      var rawKeys = Array.isArray(it.keys) ? it.keys.filter(function (k) { return _norm(k); }) : [];
      var keys = _keysOf(it);
      var isAlways = (it.trigger === 'always') || rawKeys.length === 0;
      if (isAlways) {
        always.push({ item: it, text: text, via: 'always', at: 0, order: i });
        continue;
      }
      if (!keys.length) continue; // 写了 keys 但没有一个是有效词（长度 < 2）⇒ 永不触发
      // 玩家这一轮说的话优先（位置更靠前视作更相关）
      var atP = playerText ? _hitIndex(playerText, keys) : -1;
      var atR = recentText ? _hitIndex(recentText, keys) : -1;
      if (atP < 0 && atR < 0) continue;
      var at = (atP >= 0) ? atP : (atR + 10000); // 玩家句中命中排在前
      hits.push({ item: it, text: text, via: (atP >= 0 ? 'player' : 'recent'), at: at, order: i });
    }
    hits.sort(function (a, b) { return (a.at - b.at) || (a.order - b.order); });
    var picked = always.concat(hits).slice(0, MAX_HITS);
    var budget = MAX_CHARS;
    var out = [];
    for (var j = 0; j < picked.length; j++) {
      var p = picked[j];
      var t = p.text;
      if (t.length > HIT_TEXT_MAX) t = t.slice(0, HIT_TEXT_MAX - 1) + '…';
      if (t.length > budget) {
        if (budget <= 8) break;
        t = t.slice(0, budget - 1) + '…';
      }
      budget -= t.length;
      out.push({
        id: (p.item.id || p.item.name || ('lore' + j)),
        name: _norm(p.item.name || p.item.id || ('条目 ' + (j + 1))),
        text: t,
        chars: t.length,
        via: p.via,
        at: p.at
      });
      if (budget <= 8) break;
    }
    return out;
  }

  // 给 prompt_builder 用：把命中条目拼成一块（没有命中 ⇒ 返回 ''）
  function formatBlock(hits) {
    if (!Array.isArray(hits) || !hits.length) return '';
    var lines = ['【世界书命中】'];
    for (var i = 0; i < hits.length; i++) {
      lines.push('· ' + hits[i].name + '：' + hits[i].text);
    }
    return lines.join('\n');
  }

  // 给卡带校验用：非法 lore 一律只警告、不拦导入
  function auditList(loreList) {
    var warns = [];
    if (loreList == null) return warns;
    if (!Array.isArray(loreList)) { warns.push('worldbook.lore 必须是数组，已忽略整段'); return warns; }
    var seen = Object.create(null);
    loreList.forEach(function (it, idx) {
      var tag = 'lore[' + idx + ']';
      if (!it || typeof it !== 'object') { warns.push(tag + ' 不是对象，已忽略'); return; }
      var name = _norm(it.name || it.id);
      if (!name) warns.push(tag + ' 缺 name/id，已忽略');
      var id = _norm(it.id || it.name);
      if (id) { if (seen[id]) warns.push(tag + ' 的 id「' + id + '」重复，后者会被覆盖'); seen[id] = 1; }
      if (it.keys != null && !Array.isArray(it.keys)) warns.push(tag + ' 的 keys 必须是数组');
      if (Array.isArray(it.keys) && it.keys.length > 8) warns.push(tag + ' 的 keys 超过 8 个，只取前 8 个');
      if (typeof it.text !== 'string') warns.push(tag + ' 缺 text，已忽略');
      else if (it.text.length > 2000) warns.push(tag + ' 的 text 超过 2000 字，只取前 2000 字');
      if (it.budget != null) {
        var b = Number(it.budget);
        if (!(b >= 100 && b <= 600)) warns.push(tag + ' 的 budget 建议 100-600');
      }
      if (it.trigger != null && it.trigger !== 'keyword' && it.trigger !== 'always') {
        warns.push(tag + ' 的 trigger 只能是 keyword / always');
      }
    });
    return warns;
  }

  // 归一（校验/注入共用）：只留合法字段并把长度压到上限
  function normalizeList(loreList) {
    if (!Array.isArray(loreList)) return [];
    var out = [];
    loreList.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var text = _norm(it.text);
      if (!text) return;
      if (text.length > 2000) text = text.slice(0, 2000);
      var keys = Array.isArray(it.keys) ? it.keys.map(_norm).filter(function (k) { return k.length >= 2; }).slice(0, 8) : [];
      if (Array.isArray(it.keys) && it.keys.length && !keys.length) {
        // 只写了单字/空词：保留原样（注入侧会当成「永不触发」），并在校验里已经警告过
        keys = [];
      }
      out.push({
        id: _norm(it.id || it.name),
        name: _norm(it.name || it.id),
        keys: keys,
        trigger: (it.trigger === 'always') ? 'always' : 'keyword',
        text: text,
        budget: (Number(it.budget) >= 100 && Number(it.budget) <= 600) ? Number(it.budget) : null
      });
    });
    return out;
  }

  return {
    MAX_HITS: MAX_HITS,
    MAX_CHARS: MAX_CHARS,
    HIT_TEXT_MAX: HIT_TEXT_MAX,
    match: match,
    formatBlock: formatBlock,
    auditList: auditList,
    normalizeList: normalizeList
  };
})();

if (typeof window !== 'undefined') window.LoreTrigger = LoreTrigger;
if (typeof module !== 'undefined' && module.exports) module.exports = LoreTrigger;

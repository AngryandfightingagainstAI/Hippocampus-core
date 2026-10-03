// ============================================================
// 编辑器层 · NumEditor（RN 侧纯逻辑，A 类：零 React / 零 RN API / 零 DOM）
// 主体逐字搬自桌面 engine/editor.js:6-214（window.NumEditor 段），
// 仅做三处必要适配：
//   1. window.NumEditor → var NumEditor + 文件尾双态导出（同 theme.js:885 范式）；
//   2. 删 render(:98) / renderItem(:117) 两个 DOM 渲染函数——RN 侧由
//      NumEditorTab.js 组件用 <Text>/<TextInput>/Controls 渲染；
//   3. 其余函数里的 UI.toast / UI.confirmAsync / document.getElementById /
//      escapeAttr / escapeHtml 调用改为「返回值 + 不渲染」：
//        pickCard / reload / addItem / delItem / saveAndSync 返回 { ok, reason? }
//        （UI 弹窗与 toast 文案由组件层照桌面文案发出）；
//        addSeg / delSeg / toggleTrigger 只改内存状态，重渲染由组件 setState 触发。
// 数据层：Storage.getAllCards / getImportedCards / setImportedCards
//   （rn_bootstrap.js 已挂载；引擎侧 storage.js 双仓同源）。
// 模板：require('../templates/number.js' / '../templates/relation.js')
//   ——逐字节搬自桌面 templates/（538 B / 637 B）。
// ============================================================

'use strict';

// ------------------------------------------------------------
// 模板装载：桌面两文件用 window.TEMPLATE_* 挂载（templates/number.js:6、
// templates/relation.js:5）。RN 运行时 window === globalThis（setUpGlobals.js
// 定义，只读），模板裸写 window.* 即落 globalThis；Node smoke 无 window ——
// 仅在缺失时临时兜一次，用完删掉（已存在的 window 一律不动）。
// 纪律：模板文件本身逐字节不改，兜底逻辑只在本文件。
// ------------------------------------------------------------
(function loadTemplates() {
  var g = globalThis;
  // RN（Hermes）在 Libraries/Core/setUpGlobals.js 把 window 定义为
  // { value: globalThis, writable: false, configurable: false } ——只读且不可删。
  // 故只做「缺失才兜底」，绝不对已存在的 window 赋值/回写（否则只读赋值直接抛）。
  var hadWindow = typeof g.window !== 'undefined';
  var shimmed = false;
  if (!hadWindow) {
    try { g.window = g; shimmed = true; } catch (eShim) { /* 兜底失败：模板已能裸引用 window */ }
  }
  try {
    require('../templates/number.js');
    require('../templates/relation.js');
  } finally {
    if (shimmed) { try { delete g.window; } catch (eDel) { /* 忽略 */ } }
  }
})();

var NumEditor = {
  cardId: null, items: [], dirty: false,

  // 检查当前 cardId 是否还有效；无效则清空
  _ensureValidCard() {
    if (!this.cardId) return false;
    var card = Storage.getAllCards()[this.cardId];
    if (!card) {
      this.cardId = null;
      this.items = [];
      return false;
    }
    return true;
  },

  whereOptions() {
    const out = [ { value: 'hud', label: '顶栏（HUD）' }, { value: 'sidebar', label: '左侧状态栏' } ];
    if (this.cardId) {
      const card = Storage.getAllCards()[this.cardId];
      if (card) {
        (card.panels || []).slice().sort((a, b) => a.num - b.num).forEach(p => out.push({ value: 'panel.' + p.id, label: '面板 ' + p.num + ' · ' + p.name }));
      }
    }
    return out;
  },
  getNpcOptions() {
    if (!this.cardId) return [{ id: 'player', name: '玩家' }];
    const card = Storage.getAllCards()[this.cardId];
    const opts = [{ id: 'player', name: '玩家 (player)' }];
    if (card) {
      const npcs = (card.worldbook && card.worldbook.npcs) || card.npcs || [];
      npcs.forEach(n => opts.push({ id: n.id, name: (n.name || n.id) + ' (' + n.id + ')' }));
    }
    return opts;
  },
  loadFromCard(card) {
    const items = [];
    const push = (arr, where) => {
      (arr || []).forEach(x => {
        items.push({
          type: x.type || 'gauge', key: x.key, label: x.name || x.label, icon: x.icon || '●',
          min: x.min != null ? x.min : 0, max: x.max != null ? x.max : (x.type === 'relation' ? 100 : null),
          init: x.init != null ? x.init : (x.current != null ? x.current : 0),
          showBar: x.showBar !== false, color: x.color || 'blue', desc: x.desc || '',
          segments: (x.segments || []).map(s => Object.assign({}, s)), where: where, from: x.from, to: x.to,
          lockDown: !!x.lockDown, lockUp: !!x.lockUp
        });
      });
    };
    push(card.hud, 'hud'); push(card.sidebar, 'sidebar');
    (card.panels || []).forEach(p => {
      (p.entries || []).forEach(e => {
        if (e.type === 'number') items.push({ type: 'gauge', key: e.key, label: e.name || e.label, icon: e.icon || '●',
          min: e.min != null ? e.min : 0, max: e.max != null ? e.max : 100, init: e.current != null ? e.current : 0,
          showBar: e.showBar !== false, color: e.color || 'blue', desc: e.desc || '',
          segments: (e.segments || []).map(x => Object.assign({}, x)), where: 'panel.' + p.id });
        else if (e.type === 'relation') items.push({ type: 'relation', key: e.key, label: e.name || e.label, icon: e.icon || '●',
          min: e.min != null ? e.min : -100, max: e.max != null ? e.max : 100, init: e.current != null ? e.current : 0,
          showBar: e.showBar !== false, color: e.color || 'blue', desc: e.desc || '',
          segments: (e.segments || []).map(x => Object.assign({}, x)), where: 'panel.' + p.id,
          from: e.from || 'player', to: e.to || '', lockDown: !!e.lockDown, lockUp: !!e.lockUp });
      });
    });
    return items;
  },
  saveToCard(card) {
    card.hud = [];
    card.sidebar = [];
    (card.panels || []).forEach(p => { p.entries = (p.entries || []).filter(e => e.type !== 'number' && e.type !== 'relation'); });
    this.items.forEach(it => {
      if (!it.key || !it.label) return;
      const base = { type: it.type, key: it.key, name: it.label, icon: it.icon, min: it.min, max: it.max, init: it.init,
        showBar: it.showBar, color: it.color, desc: it.desc || '', segments: it.segments || [] };
      // relation 型才附加这四字段，避免污染 gauge 型条目
      if (it.type === 'relation') {
        base.from = it.from; base.to = it.to;
        base.lockDown = !!it.lockDown; base.lockUp = !!it.lockUp;
      }
      if (it.where === 'hud') card.hud.push(base);
      else if (it.where === 'sidebar') card.sidebar.push(base);
      else if (it.where && it.where.startsWith('panel.')) {
        const pid = it.where.replace('panel.', '');
        const p = (card.panels || []).find(x => x.id === pid);
        if (!p) return;
        if (it.type === 'relation') p.entries.push({ type: 'relation', key: it.key, name: it.label, icon: it.icon,
          from: it.from, to: it.to, min: it.min, max: it.max, current: it.init, showBar: it.showBar, color: it.color,
          desc: it.desc || '', segments: it.segments || [], lockDown: !!it.lockDown, lockUp: !!it.lockUp });
        else p.entries.push({ type: 'number', key: it.key, name: it.label, icon: it.icon, min: it.min, max: it.max,
          current: it.init, showBar: it.showBar, color: it.color, desc: it.desc || '', segments: it.segments || [] });
      }
    });
  },
  pickCard(cardId) {
    if (!cardId) { this.cardId = null; this.items = []; this.dirty = false; return { ok: true, picked: null }; }
    const card = Storage.getAllCards()[cardId];
    if (!card) {
      // ★ 不再弹 alert，静默重置（桌面 :320-326 同语义）
      this.cardId = null;
      this.items = [];
      this.dirty = false;
      return { ok: false, reason: '卡带不存在' };
    }
    this.cardId = cardId;
    this.items = this.loadFromCard(card);
    this.dirty = false;
    return { ok: true, picked: cardId };
  },
  // 桌面 :332-340 reload 的 UI.confirmAsync('放弃修改？') 由组件层先问，再调本函数。
  reload() {
    if (!this.cardId) return { ok: false, reason: '未选择卡带' };
    const card = Storage.getAllCards()[this.cardId];
    if (!card) { this.cardId = null; this.items = []; this.dirty = false; return { ok: false, reason: '卡带不存在' }; }
    this.items = this.loadFromCard(card);
    this.dirty = false;
    return { ok: true };
  },
  addItem(type) {
    if (!this.cardId) return { ok: false, reason: '请先选择一个卡带' };
    const tpl = type === 'relation' ? JSON.parse(JSON.stringify(globalThis.TEMPLATE_RELATION || {})) : JSON.parse(JSON.stringify(globalThis.TEMPLATE_NUMBER || {}));
    if (!tpl.type) {
      if (type === 'relation') { tpl.type='relation'; tpl.from='player'; tpl.to=''; tpl.min=-100; tpl.max=100; tpl.init=0; tpl.where='panel.social'; }
      else { tpl.type='gauge'; tpl.min=0; tpl.max=100; tpl.init=0; tpl.where='sidebar'; }
      tpl.icon='●'; tpl.label=''; tpl.key=''; tpl.showBar=true; tpl.color='blue'; tpl.desc=''; tpl.segments=[];
    }
    this.items.push(tpl); this.dirty = true;
    return { ok: true, index: this.items.length - 1 };
  },
  // 桌面 :352 delItem 的 UI.confirmAsync('删除？') 由组件层先问，再调本函数。
  delItem(idx) { this.items.splice(idx, 1); this.dirty = true; return { ok: true }; },
  set(idx, key, value) { this.items[idx][key] = value; this.dirty = true; },
  addSeg(idx) { if (!this.items[idx].segments) this.items[idx].segments = []; this.items[idx].segments.push({ min:0, max:100, text:'', trigger:false }); this.dirty=true; },
  delSeg(idx, si) { this.items[idx].segments.splice(si, 1); this.dirty=true; },
  setSeg(idx, si, key, value) { const s = this.items[idx].segments[si]; if (key==='min'||key==='max') s[key] = value===''?0:Number(value); else s[key]=value; this.dirty=true; },
  toggleTrigger(idx, si) { const s = this.items[idx].segments[si]; s.trigger = !s.trigger; this.dirty=true; },
  saveAndSync() {
    if (!this.cardId) return { ok: false, reason: '未选择卡带' };
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.key) return { ok: false, reason: '第 ' + (i+1) + ' 条缺内部名' };
      if (!it.label) return { ok: false, reason: '第 ' + (i+1) + ' 条缺名称' };
    }
    const card = Storage.getAllCards()[this.cardId];
    if (!card) return { ok: false, reason: '卡带不存在' };
    const cardCopy = JSON.parse(JSON.stringify(card));
    this.saveToCard(cardCopy);
    if (!cardCopy.meta) cardCopy.meta = {};
    cardCopy.meta.lastModifiedAt = new Date().toISOString();
    cardCopy.meta.lastModifiedBy = 'editor';
    const imported = Storage.getImportedCards();
    imported[this.cardId] = cardCopy;
    Storage.setImportedCards(imported);
    this.dirty = false;
    // RN 侧新增：存盘后跑一次 CardValidator.validate，把报告一并返回给组件层
    // （桌面无此步；不拦保存，只做诊断回执）。CardValidator 未装载时返回 null。
    var validation = null;
    try {
      if (typeof CardValidator !== 'undefined') validation = CardValidator.validate(cardCopy);
    } catch (e) { validation = null; }
    return { ok: true, cardId: this.cardId, validation: validation };
  }
};

// RN 侧导出（同 theme.js 双态范式）：桌面靠 window 挂载（ui.js:138），
// RN/Hermes 下由 rn_bootstrap.js load('NumEditor', ...) 取 module.exports 挂 globalThis。
if (typeof window !== 'undefined') window.NumEditor = NumEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = NumEditor;

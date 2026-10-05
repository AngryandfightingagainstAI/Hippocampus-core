// ============================================================
// P5 · 新建存档（创角）A 类模型 smoke（纯 Node 断言）
// 范围：
//   A. rn/create_flow_model.js 行为：number clamp / 五条校验码 /
//      池已分配口径 / isSkipped+跳步 / 多选夹取 / 草稿往返（含 7 天过期）/
//      finish 数据段（深拷贝 + inventory 默认 + Alias.normalize）
//   B. 文案逐字（CreateScreen.js 源码）：桌面 story.js:987-1022 五条 + 池条 + quiz
//   C. S6 输出上限：storage / api_manager 默认与抬升 / audit 阈值 /
//      ApiTab 上限 / story 主调用显式传参
//   D. S7 死链：全仓 navigate(...) 目标必须在 SCREENS 内；DataTab 改走面板
// 纪律：纯 Node，零 RN/DOM；VFS / Alias 用真件或内存假件注入 globalThis。
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function readSrc(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; }
}

// ---------- 内存 VFS（对齐 vfs/vfs.js 的 readJSON/writeJSON/deleteFile）----------
var mem = {};
globalThis.VFS = {
  readJSON: function (p) { return mem[p] ? JSON.parse(JSON.stringify(mem[p])) : null; },
  writeJSON: function (p, o) { mem[p] = JSON.parse(JSON.stringify(o)); },
  deleteFile: function (p) { delete mem[p]; },
  mkdir: function () {},
  listAll: function (dir) { return Object.keys(mem).filter(function (p) { return p.indexOf(dir) === 0; }); }
};

// Alias 用真件（A 类，Node 可直接 require）
globalThis.Alias = require(path.join(root, 'engine', 'alias.js'));

var CF = require(path.join(root, 'rn', 'create_flow_model.js'));

// ================= A. 模型行为 =================

// A1 number clamp（validateStep 先 clamp 回 [min,max]）
(function () {
  var fd = { key: 'age', type: 'number', min: 18, max: 60 };
  var step = { type: 'form', fields: [fd] };
  var d1 = { age: 5 };
  var r1 = CF.validateStep({}, step, d1);
  eq('A1a number 低于下界 clamp 到 min', d1.age, 18);
  check('A1a2 clamp 后校验通过', r1.ok === true);
  var d2 = { age: 99 };
  CF.validateStep({}, step, d2);
  eq('A1b number 高于上界 clamp 到 max', d2.age, 60);
  eq('A1c clampNumber 保小数', CF.clampNumber(11.5, 0, 100), 11.5);
})();

// A2 required 缺值 → REQUIRED + label
(function () {
  var step = { type: 'form', fields: [{ key: 'name', type: 'text', label: '姓名', required: true }] };
  var r = CF.validateStep({}, step, {});
  eq('A2a required 缺值返回 REQUIRED', r.code, 'REQUIRED');
  eq('A2b REQUIRED 带 label', r.label, '姓名');
  var r2 = CF.validateStep({}, step, { name: '张三' });
  check('A2c required 有值放行', r2.ok === true);
})();

// A3 属性池：已分配口径 + 超限/不足两条
(function () {
  var card = { attributePool: { total: 5, base: 0 } };
  var step = {
    type: 'form',
    fields: [{ key: 'attr_a', type: 'number', min: 0 }, { key: 'attr_b', type: 'number', min: 0 }]
  };
  check('A3a isAttrStep 识别全 number 步', CF.isAttrStep(step) === true);
  var dOver = { attr_a: 4, attr_b: 3 };
  eq('A3b calcAllocated 口径（v-fb 累加）', CF.calcAllocated(step, dOver, card.attributePool), 7);
  var rOver = CF.validateStep(card, step, dOver);
  eq('A3c 池超限返回 POOL_OVER', rOver.code, 'POOL_OVER');
  eq('A3d POOL_OVER 带 a', rOver.a, 7);
  eq('A3e POOL_OVER 带 total', rOver.total, 5);
  var dUnder = { attr_a: 2, attr_b: 1 };
  var rUnder = CF.validateStep(card, step, dUnder);
  eq('A3f 池未用完返回 POOL_UNDER', rUnder.code, 'POOL_UNDER');
  eq('A3g POOL_UNDER 带 a', rUnder.a, 3);
  var dExact = { attr_a: 3, attr_b: 2 };
  check('A3h 池恰好用完放行', CF.validateStep(card, step, dExact).ok === true);

  // min 作为 fallback（fb = f.min != null ? f.min : base）
  var step2 = { type: 'form', fields: [{ key: 'attr_x', type: 'number', min: 1 }] };
  eq('A3i fb 取 f.min（1 点不计入已分配）', CF.calcAllocated(step2, { attr_x: 1 }, card.attributePool), 0);
  eq('A3j 超出 f.min 的部分计入', CF.calcAllocated(step2, { attr_x: 4 }, card.attributePool), 3);

  // 池在 step 上优先于卡带
  var stepP = { type: 'form', pool: { total: 9, base: 0 }, fields: [{ key: 'attr_y', type: 'number', min: 0 }] };
  eq('A3k step.pool 优先', CF.getPool(card, stepP).total, 9);
  eq('A3l 全 attr_ 前缀也识别为属性步', CF.isAttrStep({ fields: [{ key: 'attr_z', type: 'text' }] }), true);
})();

// A4 select 必选
(function () {
  var step = { type: 'select', id: 'race', options: [{ id: 'a' }, { id: 'b' }] };
  eq('A4a select 未选返回 SELECT_REQUIRED', CF.validateStep({}, step, {}).code, 'SELECT_REQUIRED');
  check('A4b select 已选放行', CF.validateStep({}, step, { race: 'a' }).ok === true);
})();

// A5 multi-select 最少项 + 多选夹取
(function () {
  var step = { type: 'multi-select', id: 'tags', min: 2, max: 2, options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  eq('A5a multi 少于 min 返回 MULTI_MIN', CF.validateStep({}, step, { tags: ['a'] }).code, 'MULTI_MIN');
  eq('A5b MULTI_MIN 带 min', CF.validateStep({}, step, { tags: ['a'] }).min, 2);
  check('A5c multi 达到 min 放行', CF.validateStep({}, step, { tags: ['a', 'b'] }).ok === true);

  var d = {};
  check('A5d toggleMulti 加入', CF.toggleMulti(d, 'tags', 'a', 0, 2).ok === true);
  check('A5e toggleMulti 再加入', CF.toggleMulti(d, 'tags', 'b', 0, 2).ok === true);
  var rMax = CF.toggleMulti(d, 'tags', 'c', 0, 2);
  eq('A5f 满员返回 MULTI_MAX', rMax.code, 'MULTI_MAX');
  eq('A5g MULTI_MAX 带 max', rMax.max, 2);
  eq('A5h 满员时不写入', d.tags.length, 2);
  CF.toggleMulti(d, 'tags', 'a', 0, 2);
  eq('A5i 再点已选项 = 取消', d.tags.length, 1);
})();

// A6 isSkipped + filterSteps + nextIndex 跳步
(function () {
  var mk = function (id, skipWhen) { return { id: id, type: 'summary', skipWhen: skipWhen }; };
  check('A6a skipWhen 未满足不跳过', CF.isSkipped(mk('s', 'gender != null'), {}) === false);
  check('A6b skipWhen 满足即跳过', CF.isSkipped(mk('s', 'gender != null'), { gender: '男' }) === true);
  check('A6c 非 != null 语法不跳过', CF.isSkipped(mk('s', 'gender == 1'), { gender: 1 }) === false);

  var steps = [mk('a'), mk('b', 'x != null'), mk('c')];
  eq('A6d filterSteps 过滤跳过步', CF.filterSteps({ steps: steps }, { x: 1 }).length, 2);
  eq('A6e nextIndex 末步返回 finish', CF.nextIndex(steps, 2, {}), 'finish');
  eq('A6f nextIndex 跳到下一个有效步', CF.nextIndex(steps, 0, { x: 1 }), 2);
  eq('A6g nextIndex 无可跳步则顺序前进', CF.nextIndex(steps, 0, {}), 1);
  eq('A6h nextIndex 尾部全跳完返回 finish', CF.nextIndex([steps[0], mk('z', 'x != null')], 0, { x: 1 }), 'finish');
})();

// A7 表单默认值同步（renderForm:756-763）
(function () {
  var step = { type: 'form', fields: [
    { key: 'k1', type: 'text', label: 'a', default: '默认值' },
    { key: 'k2', type: 'number', label: 'b', min: 3 },
    { key: 'k3', type: 'text', label: 'c' }
  ] };
  var d = { k1: '用户填的' };
  CF.syncDefaults(step, d, true);
  eq('A7a 已有值不被 default 覆盖', d.k1, '用户填的');
  eq('A7b 属性步空值同步 f.min', d.k2, 3);
  var d2 = {};
  CF.syncDefaults(step, d2, true);
  eq('A7c f.default 同步进 data', d2.k1, '默认值');
  eq('A7d 属性步 f.min 作 fallback', d2.k2, 3);
  check('A7e 无 default 无 min 保持空', d2.k3 === undefined || d2.k3 === '');
})();

// A8 草稿往返 + 7 天过期（键格式同桌面 _draftKey:592）
(function () {
  eq('A8a draftKey 格式同桌面', CF.draftKey('cid', 'sid'), '/saves/cid/sid/draft.json');
  eq('A8b 缺 cardId 返回 null', CF.draftKey('', 'sid'), null);
  var T0 = 1700000000000;
  CF.saveDraft('cid', 'sid', 3, { name: '张三' }, 12, T0);
  var d = CF.peekDraft('cid', 'sid', T0 + 1000);
  eq('A8c 草稿 index 往返', d.index, 3);
  eq('A8d 草稿 data 往返', d.data.name, '张三');
  eq('A8e 草稿 totalSteps 往返', d.totalSteps, 12);
  var fresh = CF.peekDraft('cid', 'sid', T0 + 7 * 24 * 3600 * 1000 - 1000);
  check('A8f 未过期可取', !!fresh);
  var expired = CF.peekDraft('cid', 'sid', T0 + 7 * 24 * 3600 * 1000 + 1);
  eq('A8g 超过 7 天返回 null', expired, null);
  eq('A8h 过期草稿已清盘', mem['/saves/cid/sid/draft.json'], undefined);
  CF.saveDraft('cid', 'sid', 0, { name: '李四' }, 12, T0);
  CF.clearDraft('cid', 'sid');
  eq('A8i clearDraft 清盘', mem['/saves/cid/sid/draft.json'], undefined);
})();

// A9 findResumable：未完成 + 有草稿
(function () {
  var T0 = 1700000000000;
  CF.clearDraft('c2', 's1'); CF.clearDraft('c2', 's2');
  CF.saveDraft('c2', 's1', 1, { name: 'a' }, 5, T0);
  var list = [{ saveId: 's1' }, { saveId: 's2' }];
  var r = CF.findResumable('c2', list, function (cid, sid) {
    return { player: { playerData: sid === 's1' ? {} : { name: 'done' } } };
  }, T0 + 1000);
  eq('A9a 命中未完成且有草稿的档', r && r.saveId, 's1');
  var r2 = CF.findResumable('c2', [{ saveId: 's9' }], function () { return { player: { playerData: {} } }; }, T0);
  eq('A9b 无草稿则无命中', r2, null);
})();

// A10 finish 数据段：深拷贝 + inventory 默认 + Alias.normalize
(function () {
  var src = { 姓名: '张三' };
  var pd = CF.buildPlayerData(src);
  eq('A10a Alias.normalize 把「姓名」归一到 name', pd.name, '张三');
  eq('A10b inventory 默认补齐', JSON.stringify(pd.inventory), JSON.stringify({ bar: [], common: [], story: [], rare: [] }));
  src.姓名 = '改了';
  eq('A10c 深拷贝与源隔离', pd.name, '张三');
  var pd2 = CF.buildPlayerData({ name: 'x', inventory: { bar: [1], common: [], story: [], rare: [] } });
  eq('A10d 已有 inventory 不覆盖', pd2.inventory.bar.length, 1);
})();

// A11 汇总（renderSummary:956-978）
(function () {
  var card = {
    attributes: [{ key: 'str', name: '力量' }],
    steps: [
      { id: 's1', fields: [{ key: 'name', type: 'text', label: '姓名' }] },
      { id: 'race', type: 'select', title: '种族', key: 'race', options: [{ id: 'zerg', name: '虫族' }] },
      { id: 'tags', type: 'multi-select', title: '标签', key: 'tags', options: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }] },
      { id: 'k', type: 'form', fields: [{ key: 'g', type: 'choice', label: '性别', options: [{ id: 'm', label: '男' }] }] }
    ]
  };
  var data = { name: '张三', race: 'zerg', tags: ['a', 'b'], g: 'm' };
  var es = CF.summaryEntries(card, data);
  var map = {};
  es.forEach(function (e) { map[e.k] = e.v; });
  eq('A11a label 反查（name→姓名）', map['姓名'], '张三');
  eq('A11b select 选项名反查', map['种族'], '虫族');
  eq('A11c 多选用「、」连接', map['标签'], '甲、乙');
  eq('A11d choice 选项名反查', map['性别'], '男');
  eq('A11e 空 data 无条目', CF.summaryEntries(card, {}).length, 0);
})();

// A12 P23·①：数值输入框「清空不回填默认值」（RG-1「默认值5，删掉5后准备重新输入，5会强制回归」）
(function () {
  check('A12a shownValue 已导出（P23 新增）', typeof CF.shownValue === 'function');
  if (typeof CF.shownValue !== 'function') {
    check('A12b 显式清空显示空串（不是默认值 5）', false);
    check('A12c 没填过时仍显示默认值（min=5）', false);
    check('A12d 没填过时显示 default', false);
  } else {
    eq('A12b 显式清空显示空串（不是默认值 5）', CF.shownValue({ key: 'a', min: 5 }, '', true), '');
    eq('A12c 没填过时仍显示默认值（min=5）', CF.shownValue({ key: 'a', min: 5 }, undefined, true), 5);
    eq('A12d 没填过时显示 default', CF.shownValue({ key: 'a', default: 7 }, null, false), 7);
  }
  var step = { type: 'form', fields: [{ key: 'attr_a', type: 'number', min: 5, max: 20 }] };
  var cleared = { attr_a: '' };
  CF.syncDefaults(step, cleared, true);
  eq('A12e syncDefaults 不回填玩家清空的字段', cleared.attr_a, '');
  var fresh = {};
  CF.syncDefaults(step, fresh, true);
  eq('A12f syncDefaults 仍补没填过的字段', fresh.attr_a, 5);
  var zero = { attr_a: 0 };
  CF.syncDefaults(step, zero, true);
  eq('A12g syncDefaults 不覆盖 0', zero.attr_a, 0);
})();

// ================= B. 文案逐字（CreateScreen.js 源码）=================
(function () {
  var src = readSrc('rn/screens/CreateScreen.js') || '';
  check('B1 请填写：<label>', src.indexOf("'请填写：' + res.label") >= 0);
  check('B2 属性点超出上限文案', src.indexOf("'属性点超出上限：已分配 ' + res.a + ' / ' + res.total + '\\n请减少一些属性'") >= 0);
  check('B3 属性点还没用完文案', src.indexOf("'属性点还没用完（已分配 ' + res.a + ' / ' + res.total + '），确定继续？'") >= 0);
  check('B4 请选择一个选项', src.indexOf("'请选择一个选项'") >= 0);
  check('B5 至少选 N 项', src.indexOf("'至少选 ' + res.min + ' 项'") >= 0);
  check('B6 最多选 N 项', src.indexOf("'最多选 ' + res.max + ' 项'") >= 0);
  check('B7 池条已分配', src.indexOf("'已分配：'") >= 0);
  check('B8 池条剩余', src.indexOf("'（剩余 ' + remain + '）'") >= 0);
  check('B9 池条每项基础', src.indexOf("'每项基础 ' + (pool.base != null ? pool.base : 0) + ' 点'") >= 0);
  check('B10 quiz 直觉提示', src.indexOf("'— 请凭直觉选择 —'") >= 0);
  check('B11 多选已选计数', src.indexOf("'已选 ' + cur.length + ' / 最多 ' + max + (min ? ' · 至少 ' + min : '')") >= 0);
  check('B12 汇总空态', src.indexOf("'（没有填写任何内容）'") >= 0);
  check('B13 未知步骤类型', src.indexOf("'（未知步骤类型：' + String(step.type) + '）'") >= 0);
  check('B14 不含「本批未支持」', src.indexOf('本批未支持：') < 0);
  check('B15 数值输入显示值走 CF.shownValue（清空不回填）',
    src.indexOf('var shown = CF.shownValue(fd, val, isAttr);') >= 0 &&
    src.indexOf("var shown = (val != null && val !== '') ? val : CF.fieldFallback(fd, isAttr);") < 0);
})();

// ================= C. S6 输出上限 =================

(function () {
  var storageSrc = readSrc('engine/core/storage.js') || '';
  check('C1 storage 迁移默认 max_tokens 16384', storageSrc.indexOf('max_tokens: 16384') >= 0);
  check('C1b storage 迁移分支已无 2048', storageSrc.indexOf('max_tokens: 2048') < 0);

  var apiSrc = readSrc('engine/api_manager.js') || '';
  check('C2 api_manager 默认 mt=16384', apiSrc.indexOf('var mt = 16384;') >= 0);
  check('C2b api_manager 思考模型抬升 < 16384 → 16384', apiSrc.indexOf('p.max_tokens < 16384') >= 0 && apiSrc.indexOf('p.max_tokens = 16384;') >= 0);
  try {
    var ApiManager = require(path.join(root, 'engine', 'api_manager.js'));
    var p = ApiManager.defaultProfile('测', '', 'deepseek-reasoner');
    eq('C2c 思考模型默认 max_tokens 16384', p.max_tokens, 16384);
    var p2 = ApiManager.defaultProfile('测', '', 'deepseek-flash');
    eq('C2d 普通模型默认 max_tokens 16384', p2.max_tokens, 16384);
  } catch (e) {
    check('C2c/C2d api_manager 可 require 且默认 16384 :: ' + e.message, false);
  }

  var auditSrc = readSrc('engine/audit.js') || '';
  check('C3 audit 阈值 16384', auditSrc.indexOf('cur.max_tokens < 16384') >= 0);
  check('C3b audit 文案建议 16384 以上', auditSrc.indexOf('建议 16384 以上') >= 0);

  var apiTabSrc = readSrc('rn/screens/settings/ApiTab.js') || '';
  check('C4 ApiTab 上限 131072', apiTabSrc.indexOf('max: 131072') >= 0);
  check('C4b ApiTab 步长 1024', apiTabSrc.indexOf('step: 1024') >= 0);

  var storySrc = readSrc('engine/story.js') || '';
  check('C5 story 主调用显式传 max_tokens', storySrc.indexOf('ApiClient.chat(toSend, __chatOpts)') >= 0);
  check('C5b story 取 ApiManager.getActive().max_tokens', storySrc.indexOf('__activeProfile.max_tokens') >= 0);
})();

// ================= D. S7 死链 =================

(function () {
  var NavStore = require(path.join(root, 'rn', 'nav_store.js'));
  var screens = NavStore.SCREENS;

  // 全仓 rn/ 扫 navigate('<id>')
  function walk(dir, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (de) {
      var p = path.join(dir, de.name);
      if (de.isDirectory()) walk(p, out);
      else if (/\.(js|tsx|ts)$/.test(de.name)) out.push(p);
    });
    return out;
  }
  var files = walk(path.join(root, 'rn'), []).concat([path.join(root, 'App.tsx')]);
  var bad = [];
  var seen = [];
  files.forEach(function (p) {
    var s;
    try { s = fs.readFileSync(p, 'utf8'); } catch (e) { return; }
    var re = /navigate\(\s*'([^']+)'\s*\)/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      seen.push(m[1]);
      if (screens.indexOf(m[1]) < 0) bad.push(path.basename(p) + ' → ' + m[1]);
    }
  });
  check('D1 全仓 navigate(...) 目标都在 SCREENS 内（bad=' + JSON.stringify(bad) + '）', bad.length === 0);
  check('D1b 扫到了 navigate 调用（seen=' + seen.length + '）', seen.length > 0);

  var dataSrc = readSrc('rn/screens/settings/DataTab.js') || '';
  check('D2 DataTab 报错日志改走面板', dataSrc.indexOf("StoryStore.openPanel('errorLog')") >= 0);
  check('D2b DataTab 不再 navigate(errorLog)', dataSrc.indexOf("navigate('errorLog')") < 0);

  var panelSrc = readSrc('rn/components/PanelHost.js') || '';
  check('D3 PanelHost 有 errorLog 分支', panelSrc.indexOf('errorLog') >= 0);
})();

// ================= E. 必答三问② 的调用链证据 =================
(function () {
  var platSrc = readSrc('rn/rn_platform.js') || '';
  check('E1 rn_platform 包装 confirmAsync', platSrc.indexOf("wrapRet('confirmAsync'") >= 0);
  var storeSrc = readSrc('rn/story_store.js') || '';
  check('E2 story_store confirmOpen 返回 Promise', storeSrc.indexOf('function confirmOpen') >= 0 && storeSrc.indexOf('new Promise') >= 0);
  check('E3 story_store resolveConfirm 结算', storeSrc.indexOf('function resolveConfirm') >= 0);
  var overlaySrc = readSrc('rn/components/OverlayHost.js') || '';
  check('E4 OverlayHost 渲染 ConfirmModal', overlaySrc.indexOf('ConfirmModal') >= 0 && overlaySrc.indexOf('confirmPending') >= 0);
  var createSrc = readSrc('rn/screens/CreateScreen.js') || '';
  check('E5 CreateScreen 走 Platform.ui.confirmAsync', createSrc.indexOf('Platform.ui.confirmAsync') >= 0);
  check('E6 CreateScreen 走 Platform.ui.toast', createSrc.indexOf('Platform.ui.toast') >= 0);
})();

// ================= F. S5 showCalendar 时间线参考 =================
(function () {
  var src = readSrc('rn/screens/CreateScreen.js') || '';
  check('F1 form 步接 showCalendar 分支', src.indexOf('step.showCalendar ? renderCalendar(step)') >= 0);
  check('F2 时间线标题逐字', src.indexOf("'📅 时间线参考'") >= 0);
  check('F3 空态文案逐字', src.indexOf("'填写出生年份后，这里会显示你和哪些人物同届。'") >= 0);
  check('F4 出生年判定 calBirthYear（key/label 命中）',
    src.indexOf('function calBirthYear') >= 0 &&
    src.indexOf("fd.key === 'birth_year'") >= 0 && src.indexOf("fd.label === '出生年份'") >= 0);
  check('F5 四段标签齐备',
    src.indexOf("'你的情况'") >= 0 && src.indexOf("'时代范围'") >= 0 &&
    src.indexOf("'关键事件'") >= 0 && src.indexOf("'人物出生年'") >= 0);
  check('F6 同届/同期文案', src.indexOf("'同届：'") >= 0 && src.indexOf("'同期：'") >= 0);
  check('F7 读 worldbook.timeline.official 与 npcs.born',
    src.indexOf('wb.timeline && wb.timeline.official') >= 0 && src.indexOf('n && n.born') >= 0);
})();

console.log('CREATE_FLOW_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);

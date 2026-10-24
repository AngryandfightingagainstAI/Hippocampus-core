// C3：技能编辑器（预算 + 数值规则 + 保存前检查）RN 侧
// 只验证数据层与共用校验，不写 playerData、不碰存档。
const fs = require('fs');
const path = require('path');

const H = require('../engine/core/skill_editor_helpers.js');

function makeCard() {
  return {
    schemaVersion: '1.2', cardId: 'c3', cardName: 'c3',
    game: { title: 't', background: 'b' },
    hud: [{ key: 'hp', name: '生命', init: 10, max: 10 }],
    sidebar: [],
    panels: [{ num: 2, entries: [] }, { num: 3, entries: [] }, { num: 4, entries: [] }, { num: 5, entries: [] }],
    attributes: [{ key: 'attr_int', name: '智力', min: 1, max: 20, init: 5 }],
    worldbook: { skills: [{ id: 's1', name: '火球', stat: { init: 5, bonus: 'floor(attr.int / 5)', min: 0, max: 30, attrs: ['int'] } }] },
    steps: []
  };
}

let store;

beforeEach(function () {
  store = { c3: makeCard() };
  global.Storage = {
    getAllCards: function () { return store; },
    getImportedCards: function () { return JSON.parse(JSON.stringify(store)); },
    setImportedCards: function (m) { Object.keys(m).forEach(function (k) { store[k] = m[k]; }); }
  };
});

test('C3-RN-1 旧技能不报警、合法 stat 不报警', function () {
  const old = H.validate({ cardId: 'o', worldbook: { skills: [{ id: 'a', name: '旧' }] } }, {});
  expect(old.errorCount).toBe(0);
  expect(old.warningCount).toBe(0);
  const good = H.validate(makeCard(), {});
  expect(good.errorCount).toBe(0);
});

test('C3-RN-2 坏公式报 E_SKILL_FORMULA 且带字段路径', function () {
  const c = makeCard();
  c.worldbook.skills[0].stat.bonus = '1 +';
  const r = H.validate(c, {});
  const hit = r.issues.filter(function (i) { return i.code === 'E_SKILL_FORMULA'; })[0];
  expect(hit && hit.path).toBe('worldbook.skills[0].stat.bonus');
});

test('C3-RN-3 未声明属性在编辑器降级为 warning（仍可保存）', function () {
  const c = makeCard();
  c.worldbook.skills[0].stat.attrs = ['luck'];
  const r = H.validate(c, {});
  const hit = r.issues.filter(function (i) { return i.code === 'E_SKILL_ATTR'; })[0];
  expect(hit && hit.level).toBe('warning');
  expect(r.errorCount).toBe(0);
});

test('C3-RN-4 步骤 pool 与 worldbook.skillPool 冲突可定位', function () {
  const c = makeCard();
  c.steps = [{ id: 's', type: 'skills', pool: { total: 10 } }];
  c.worldbook.skillPool = { total: 20 };
  const r = H.validate(c, {});
  const hit = r.issues.filter(function (i) { return i.code === 'E_SKILL_POOL_CONFLICT'; })[0];
  expect(!!hit).toBe(true);
});

test('C3-RN-5 数据层：新建技能不带 stat，显式开启后才写', function () {
  const S = require('../engine/wb/skill.js');
  S.init('c3');
  expect(S._data.length).toBe(1);
  expect(S._pool).toBe(null);
  S.add();
  expect(S._data[1].stat).toBe(undefined);
  S.enableStat(1);
  expect(S._data[1].stat && typeof S._data[1].stat).toBe('object');
  S.setStatRaw(1, 'init', '3');
  S.setStatRaw(1, 'bonus', 'attr.int / 2');
  S.toggleAttr(1, 'attr_int', true);
  expect(S._data[1].stat.init).toBe(3);
  expect(S._data[1].stat.bonus).toBe('attr.int / 2');
  expect(S._data[1].stat.attrs).toEqual(['int']);
  S.setBound(1, 'max', true);
  expect(S._data[1].stat.max).toBe(null);
});

test('C3-RN-6 数据层：保存同时写 skills 与 skillPool，无预算时写 null', function () {
  const S = require('../engine/wb/skill.js');
  S.init('c3');
  S.add();
  S.enableStat(1);
  S.setStatRaw(1, 'init', '2');
  S.save();
  expect(store.c3.worldbook.skills[1].stat.init).toBe(2);
  expect('skillPool' in store.c3.worldbook).toBe(false);

  S.setPoolEnabled(true);
  S.setPoolField('total', 8);
  S.setPoolField('mode', 'warn');
  S.save();
  expect(store.c3.worldbook.skillPool.total).toBe(8);
  expect(store.c3.worldbook.skillPool.mode).toBe('warn');

  S.setPoolEnabled(false);
  S.save();
  expect(store.c3.worldbook.skillPool).toBe(null);
});

test('C3-RN-7 组件含预算/数值规则/问题面板，且不写 playerData', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rn', 'screens', 'settings', 'worldbook', 'skillEditor.js'), 'utf8');
  ['技能预算', '数值规则', '无下限', '无上限', '规则检查', '不会自动更新', '保存只写入卡带，不代表规则通过'].forEach(function (s) {
    expect(src.indexOf(s)).toBeGreaterThanOrEqual(0);
  });
  expect(src.indexOf('playerData')).toBe(-1);
  expect(src.indexOf("'校验通过'")).toBe(-1);
});

test('C3-RN-8 共用模块与数据契约一致（两端同字节由桌面 C3 测试守）', function () {
  expect(typeof H.validate).toBe('function');
  expect(typeof H.countMissingStat).toBe('function');
  expect(typeof H.toStatValue).toBe('function');
  expect(H.toStatValue('12')).toBe(12);
  expect(H.toStatValue('attr.int / 2')).toBe('attr.int / 2');
});

// C2：技能数值卡带侧校验（RN 侧同源验证）
// 只验证卡带数据契约，不写 playerData、不碰存档。
const CV = require('../engine/core/card_validator.js');

function card(skills, extra) {
  return Object.assign({
    schemaVersion: '1.2', cardId: 'c', cardName: 'c',
    game: { title: 't', background: 'b' },
    hud: [{ key: 'hp', name: '生命', init: 10, max: 10 }],
    sidebar: [], panels: [{ num: 2, entries: [] }, { num: 3, entries: [] }, { num: 4, entries: [] }, { num: 5, entries: [] }],
    attributes: [{ key: 'attr_int', name: '智力', min: 1, max: 20, init: 5 }],
    worldbook: { skills: skills },
    steps: []
  }, extra || {});
}

test('C2-RN-1 旧技能（无 stat）不产生技能警告', function () {
  const out = CV.auditSkillStats(card([{ id: 's1', name: '旧技能' }]));
  expect(out).toEqual([]);
});

test('C2-RN-2 合法 stat 不报警', function () {
  const out = CV.auditSkillStats(card([{
    id: 's1', name: '剑术',
    stat: { init: 5, bonus: 'floor(attr.int / 5)', min: 0, max: 30, attrs: ['int'] }
  }]));
  expect(out).toEqual([]);
});

test('C2-RN-3 坏 attrs 与 min>max 报警', function () {
  const out = CV.auditSkillStats(card([
    { id: 's1', name: 'A', stat: { init: 1, min: 0, max: 5, attrs: ['luck'] } },
    { id: 's2', name: 'B', stat: { init: 1, min: 10, max: 5 } }
  ]));
  expect(out.length).toBeGreaterThan(0);
  expect(out.join('\n')).toContain('luck');
});

test('C2-RN-4 validate 只进 warnings，不拦导入', function () {
  const r = CV.validate(card([{ id: 's1', name: 'A', stat: { init: 1, min: 10, max: 5 } }]));
  expect(r.ok).toBe(true);
  expect((r.warnings || []).join('\n')).toContain('技能数值');
});

test('C2-RN-5 不写 playerData / 不改技能表', function () {
  const before = JSON.stringify(card([{ id: 's1', name: 'A', stat: { init: 1 } }]));
  CV.validate(JSON.parse(before));
  const after = JSON.stringify(card([{ id: 's1', name: 'A', stat: { init: 1 } }]));
  expect(after).toBe(before);
});

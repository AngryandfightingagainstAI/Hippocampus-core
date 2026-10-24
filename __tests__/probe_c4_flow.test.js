// C4：技能分配步骤（RN 侧）——步骤插入 / 提交 / 临时键不落库 / 提交校验码
// 不写存档：只验证纯逻辑与静态接线。
const fs = require('fs');
const path = require('path');
const CF = require('../rn/create_flow_model.js');
const SF = require('../engine/core/skill_flow.js');

function card(extra) {
  const c = {
    cardId: 'c4rn', cardName: 'C4 RN',
    attributes: [{ key: 'attr_str', name: '力量', min: 1, max: 20 }],
    worldbook: {
      skills: [
        { id: 'blade', name: '剑术', stat: { init: 5, bonus: 'floor(attr.str / 5)', min: 0, max: 30, attrs: ['str'] } },
        { id: 'spell', name: '法术', stat: { init: 2, bonus: 0, min: 0, max: 10 } }
      ],
      skillPool: { total: 10, mode: 'block', requireSpend: true }
    },
    steps: [{ id: 'attrs', type: 'form', fields: [{ key: 'attr_str', type: 'number' }] }]
  };
  if (extra) Object.keys(extra).forEach(k => { c[k] = extra[k]; });
  return c;
}

test('C4-RN-1 有 stat 且无显式技能步 → 自动插在属性步之后', function () {
  const c = card();
  const r = CF.prepareSteps(c);
  expect(r.steps.length).toBe(2);
  expect(r.steps[1].type).toBe('skills');
  expect(r.inserted).toBe(true);
  expect(c.steps.length).toBe(1); // 不改入参
});

test('C4-RN-2 显式 skills 步不重复插', function () {
  const c = card();
  c.steps.push({ id: 'mine', type: 'skills' });
  const r = CF.prepareSteps(c);
  expect(r.steps.filter(function (s) { return s.type === 'skills'; }).length).toBe(1);
  expect(r.inserted).toBe(false);
  expect(r.steps[1].id).toBe('mine');
});

test('C4-RN-3 旧卡（无 stat / 无 skillPool）不插步骤', function () {
  const c = card();
  c.worldbook = { skills: [{ id: 'old', name: '旧技能' }] };
  const r = CF.prepareSteps(c);
  expect(r.steps.length).toBe(1);
  expect(r.inserted).toBe(false);
});

test('C4-RN-4 没有属性步 → 插在末尾', function () {
  const c = card();
  c.steps = [{ id: 'name', type: 'form', fields: [{ key: 'name', type: 'text' }] }];
  const r = CF.prepareSteps(c);
  expect(r.steps[r.steps.length - 1].type).toBe('skills');
});

test('C4-RN-5 buildPlayerData 剥离 __skillAlloc（临时分配不落库）', function () {
  const c = card();
  const pd = CF.buildPlayerData({ name: '甲', attr_str: 12, __skillAlloc: { blade: 5 } }, c);
  expect('__skillAlloc' in pd).toBe(false);
  expect(pd.name).toBe('甲');
  expect(pd.attr_str).toBe(12);
});

test('C4-RN-6 提交：合法分配得到 skillStats；未花完被拦', function () {
  const c = card();
  const step = { id: '__skills', type: 'skills' };
  const ok = SF.commit(c, { str: 12 }, { blade: 5, spell: 5 }, step);
  expect(ok.ok).toBe(true);
  expect(ok.skillStats.blade.alloc).toBe(5);
  expect(ok.skillStats.blade.value).toBe(12); // 5 + floor(12/5)=2 + 5

  const bad = CF.validateStep(c, step, { attr_str: 12, __skillAlloc: {} });
  expect(bad.ok).toBe(false);
  expect(bad.code).toBe('SKILL_UNDER');
});

test('C4-RN-7 validateStep：合法 → ok；失效 id → SKILL_ORPHAN', function () {
  const c = card();
  const step = { id: '__skills', type: 'skills' };
  const good = CF.validateStep(c, step, { attr_str: 12, __skillAlloc: { blade: 5, spell: 5 } });
  expect(good.ok).toBe(true);

  const orphan = CF.validateStep(c, step, { attr_str: 12, __skillAlloc: { ghost: 1 } });
  expect(orphan.ok).toBe(false);
  expect(orphan.code).toBe('SKILL_ORPHAN');
});

test('C4-RN-8 静态接线：人设第三参 / 回技能步骤 / 渲染分支', function () {
  const portrait = fs.readFileSync(path.join(__dirname, '..', 'rn', 'ui_portrait_rn.js'), 'utf8');
  ['function start(playerData, cb, validate)', 'setSkillReturn', 'gateBlocked', '_skillReturn'].forEach(function (k) {
    expect(portrait.indexOf(k)).toBeGreaterThanOrEqual(0);
  });
  const screen = fs.readFileSync(path.join(__dirname, '..', 'rn', 'screens', 'CreateScreen.js'), 'utf8');
  ["case 'skills'", 'SF.commit(', 'validateSkills', 'CF.prepareSteps('].forEach(function (k) {
    expect(screen.indexOf(k)).toBeGreaterThanOrEqual(0);
  });
  expect(screen.indexOf('playerData.skillStats = scommit.skillStats')).toBeGreaterThanOrEqual(0);
});

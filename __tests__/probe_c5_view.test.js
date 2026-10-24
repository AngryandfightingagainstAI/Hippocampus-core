// C5：技能数值视图（RN 侧）——只读视图模型 / 面板集成 / 接线静态断言
// 不写存档：只验证纯逻辑与静态接线。
const fs = require('fs');
const path = require('path');
const SV = require('../engine/core/skill_view.js');

function card(extra) {
  const c = {
    cardId: 'c5rn', cardName: 'C5 RN',
    attributes: [{ key: 'attr_str', name: '力量', min: 1, max: 20 }],
    worldbook: {
      skills: [
        { id: 'blade', name: '剑术', stat: { init: 5, bonus: 2, min: 0, max: 30, attrs: ['str'] } },
        { id: 'spell', name: '法术', stat: { init: 3, bonus: 0, min: 0, max: null, attrs: ['int'] } },
        { id: 'cook', name: '烹饪' }
      ]
    },
    steps: []
  };
  if (extra) Object.keys(extra).forEach(k => { c[k] = extra[k]; });
  return c;
}

function stats() {
  return {
    blade: { init: 5, bonus: 2, alloc: 5, value: 12 },
    spell: { init: 3, bonus: 0, alloc: 0, value: 3 }
  };
}

test('C5-RN-1 有规则无 skillStats → no-stats 且不补算', function () {
  const r = SV.rows(card(), { name: 'x' });
  expect(r.state).toBe('no-stats');
  expect(r.rows.length).toBe(0);
  expect(SV.noStatsText()).toContain('不会补算');
});

test('C5-RN-2 正常：按卡带顺序、无 stat 技能不出现', function () {
  const r = SV.rows(card(), { skillStats: stats() });
  expect(r.state).toBe('ok');
  expect(r.rows.map(x => x.id)).toEqual(['blade', 'spell']);
  expect(r.rows[0].name).toBe('剑术');
  expect(SV.valueText(r.rows[0])).toBe('12/30');
  expect(SV.valueText(r.rows[1])).toBe('3（无上限）');
  expect(SV.detailText(r.rows[0])).toBe('初始 5 · 加成 2 · 分配 5');
});

test('C5-RN-3 孤立技能保留并标失效（id 兜底名称）', function () {
  const s = stats();
  s.ghost = { init: 9, bonus: 0, alloc: 0, value: 9 };
  const r = SV.rows(card(), { skillStats: s });
  const g = r.rows.filter(x => x.orphan)[0];
  expect(g).toBeTruthy();
  expect(g.name).toBe('ghost');
  expect(SV.detailText(g)).toContain('失效');
  expect(r.orphanCount).toBe(1);
});

test('C5-RN-4 提示词摘要：最多 8 项 + 部分摘要说明', function () {
  const skills = [];
  const s = {};
  for (let i = 1; i <= 10; i++) {
    skills.push({ id: 's' + i, name: '技能' + i, stat: { init: 0, max: 99 } });
    s['s' + i] = { init: 0, bonus: 0, alloc: 0, value: i };
  }
  const c = card({ worldbook: { skills: skills } });
  const line = SV.promptLine(c, { skillStats: s });
  expect(line).toContain('共 10 项');
  expect(line).toContain('另有 2 项未列出');
  expect(line.length).toBeLessThanOrEqual(240);
});

test('C5-RN-5 旧档不加摘要行', function () {
  expect(SV.promptLine(card(), { name: 'old' })).toBe('');
});

test('C5-RN-6 panel_data.computeCharacter 集成 skillView', function () {
  global.StatRules = require('../engine/core/stat_rules.js');
  global.SkillView = SV;
  global.GameState = {
    currentCard: card(),
    playerData: { name: 'x', skillStats: stats() },
    currentState: { hud: {}, sidebar: {}, panels: {} }
  };
  const PD = require('../rn/panels/panel_data.js');
  const v = PD.computeCharacter();
  expect(v.skillView).toBeTruthy();
  expect(v.skillView.state).toBe('ok');
  expect(v.skillView.rows.length).toBe(2);
  expect(v.skillView.rows[0].valueText).toBe('12/30');
  delete global.GameState; delete global.StatRules; delete global.SkillView;
});

test('C5-RN-7 面板组件渲染「技能数值」段', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rn', 'panels', 'CharacterPanel.js'), 'utf8');
  expect(src).toContain('技能数值');
  expect(src).toContain('skillView');
  expect(src).toContain('不会被自动删除');
});

test('C5-RN-8 人设确认清空残留校验闭包', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rn', 'ui_portrait_rn.js'), 'utf8');
  expect(src).toContain('_validate = null');
  expect(src).toContain('_skillReturn = null');
  expect(src).toContain('inGameSkillCheck');
  expect(src).toContain('放弃本次人设修改并返回游戏');
});

test('C5-RN-9 prompt_builder 与桌面同源且含技能摘要行', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'core', 'prompt_builder.js'), 'utf8');
  expect(src).toContain('_SV.promptLine(card, pd)');
  expect(src).toContain('SR.valueOf(pd, k)');
});

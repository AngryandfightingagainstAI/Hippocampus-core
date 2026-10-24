// 阶段 A 补充 · Android 天命落库 / 双前缀显示 / 面板天命标注
//
// 背景（2026-10-24 核验发现）：Android 选天命只写属性值、不写 playerData._destiny，
// 导致锁、提示词「（天命）」、角色面板标注、池排除全部失效；角色面板读
// pd['attr_'+a.key] 在卡带 key 已带前缀时读不到真值（显示 init 兜底）。
//
// 本文件锁死：
//   D-1  applyDestinyPick 写规范键 + 裸键，_destiny{locked,values,label,lockedAt} 齐全
//   D-2  重掷覆盖不残留旧值
//   D-3  池统计排除锁定项（与人设阶段 / 桌面同口径）
//   D-4  panel_data 双前缀读到真值并标 locked
//   D-5  CharacterPanel 渲染出「（天命）」

'use strict';

const React = require('react');
const renderer = require('react-test-renderer');
const { act } = require('react-test-renderer');

global.Storage = {
  getGlobal: () => ({ settings: { theme: { activeId: 'paper-white' } } }),
  setGlobal: () => ({ ok: true }),
  getAllCards: () => ({}), getCard: () => null, saveCard: () => ({ ok: true }), deleteCard: () => ({ ok: true }),
  getSaves: () => ({}), readFile: () => '', writeFile: () => ({ ok: true }),
  exists: () => false, listFiles: () => [], deleteFile: () => ({ ok: true })
};
global.Platform = { ui: { toast: () => {}, confirmAsync: async () => false } };
global.GameState = {
  currentCard: null, currentState: { panels: [] }, currentCardId: null,
  playerData: {}, computeAge: () => null
};

const CF = require('../rn/create_flow_model.js');
const SR = require('../engine/core/stat_rules.js');
const PanelData = require('../rn/panels/panel_data.js');
const CharacterPanel = require('../rn/panels/CharacterPanel.js');

function card() {
  return {
    cardId: 'c1', cardName: '测试卡',
    attributes: [
      { key: 'attr_str', name: '力量', min: 5, max: 20, init: 5 },
      { key: 'attr_agi', name: '敏捷', min: 5, max: 20, init: 5 }
    ],
    attributePool: { total: 30, base: 5 }
  };
}
function attrStep() {
  return {
    id: 'attributes', type: 'form',
    pool: { total: 30, base: 5 },
    fields: [
      { key: 'attr_str', type: 'number', label: '力量', min: 5, max: 20, default: 5 },
      { key: 'attr_agi', type: 'number', label: '敏捷', min: 5, max: 20, default: 5 }
    ]
  };
}
function texts(json, acc) {
  if (!json || typeof json !== 'object') return acc;
  (json.children || []).forEach((c) => {
    if (typeof c === 'string') acc.push(c);
    else texts(c, acc);
  });
  return acc;
}

test('D-1 选天命写入属性 + _destiny 锁（规范键 / 裸键 / 标签 / 时间）', () => {
  const data = { attr_str: 5, attr_agi: 5, hp: 10 };
  const next = CF.applyDestinyPick(data, card().attributes, { values: { attr_str: 12, attr_agi: 8 } }, 0, 1700000000000);
  expect(next.attr_str).toBe(12);
  expect(next.attr_agi).toBe(8);
  expect(next.str).toBe(12);   // 裸键兼容旧读取方
  expect(next.agi).toBe(8);
  expect(next.hp).toBe(10);    // 其它字段不动
  expect(next._destiny.locked).toBe(true);
  expect(next._destiny.values).toEqual({ attr_str: 12, attr_agi: 8 });
  expect(next._destiny.label).toBe('天命 1 组');
  expect(next._destiny.lockedAt).toBe(new Date(1700000000000).toISOString());
  expect(data._destiny).toBeUndefined(); // 不就地改入参
});

test('D-2 重掷覆盖不残留', () => {
  const stale = { attr_str: 99, str: 99, attr_agi: 5 };
  const first = CF.applyDestinyPick(stale, card().attributes, { values: { attr_str: 12, attr_agi: 8 } }, 0);
  const second = CF.applyDestinyPick(first, card().attributes, { values: { attr_str: 15, attr_agi: 6 } }, 1);
  expect(second.attr_str).toBe(15);
  expect(second.str).toBe(15);
  expect(second.attr_agi).toBe(6);
  expect(second._destiny.label).toBe('天命 2 组');
  expect(second._destiny.values).toEqual({ attr_str: 15, attr_agi: 6 });
});

test('D-3 池统计排除锁定项，与 stat_rules.remaining 同结果', () => {
  const c = card();
  const data = CF.applyDestinyPick({}, c.attributes, { values: { attr_str: 12, attr_agi: 8 } }, 0);
  const step = attrStep();
  const pool = CF.poolOf(c, step);
  expect(pool.total).toBe(30);
  expect(CF.calcAllocated(step, data, pool)).toBe(0); // 两项都是天命锁 → 不占创角池
  expect(SR.remaining(c, data, step)).toBe(30);
});

test('D-4 角色面板数据：双前缀读到真值并标 locked', () => {
  GameState.currentCard = card();
  GameState.playerData = {
    attr_attr_str: 7, attr_agi: 5,
    _destiny: { locked: true, values: { attr_str: 7 } }
  };
  const view = PanelData.computeCharacter();
  const str = view.attrs.filter((a) => a.name === '力量')[0];
  const agi = view.attrs.filter((a) => a.name === '敏捷')[0];
  expect(str.value).toBe(7);      // 修复前读到 init 5
  expect(str.locked).toBe(true);
  expect(agi.value).toBe(5);
  expect(agi.locked).toBe(false);
});

test('D-5 CharacterPanel 渲染「（天命）」', () => {
  GameState.currentCard = card();
  GameState.playerData = { attr_str: 7, attr_agi: 5, _destiny: { locked: true, values: { attr_str: 7 } } };
  const tokens = {
    colors: {
      text: '#111', text2: '#222', muted: '#666', faint: '#999', hair: '#ddd',
      accent: '#c60', danger: '#b00', bg: '#fff', card: '#fff', paper: '#fff', ink: '#111', ink2: '#333'
    },
    fontSizes: { xs: 11, sm: 13, md: 15, lg: 18, xl: 20 },
    radius: { sm: 4, md: 6, lg: 8, xl: 12 }
  };
  let t;
  act(() => { t = renderer.create(React.createElement(CharacterPanel, { tokens: tokens })); });
  const all = texts(t.toJSON(), []).join(' ');
  expect(all).toContain('力量');
  expect(all).toContain('（天命）');
  act(() => { t.unmount(); });
});

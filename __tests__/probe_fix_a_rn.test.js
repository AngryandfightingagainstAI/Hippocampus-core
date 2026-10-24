// 修复 A（RN）：重审人设的事务性——整理只改内存，确认时一次落盘，取消/放弃回退。
// 全程内存夹具，不读写真实存档。
'use strict';

const PORTRAIT_FILE = require.resolve('../rn/ui_portrait_rn.js');

function freshPortrait() {
  jest.resetModules();
  return require('../rn/ui_portrait_rn.js');
}

function makeGlobals(over) {
  const g = {
    persist: 0, invalidate: 0,
    confirm: true,
    playerData: {
      portrait: { summary: 'old' },
      attr_str: 10,
      skillStats: { blade: { init: 5, bonus: 2, alloc: 3, value: 10 } }
    }
  };
  global.GameState = {
    playerData: g.playerData,
    currentCard: { attributes: [{ key: 'attr_str', name: '力量', min: 1, max: 30 }] },
    persist() { g.persist++; },
    invalidateCache() { g.invalidate++; }
  };
  global.PortraitChat = { restore() {}, list() { return []; }, persist() {} };
  global.Portrait = {
    buildExtractPrompt() { return 'p'; },
    parseExtractResponse(t) { return JSON.parse(t); },
    mergePatch(patch, pd) {
      const before = { attr_str: pd.attr_str };
      if (patch.attributes) Object.keys(patch.attributes).forEach(k => { pd[k] = patch.attributes[k]; });
      return { ok: true, label: '整理', before: before, after: { attr_str: pd.attr_str } };
    },
    recordUndo() {}, save() {}, fallback() { return { summary: 'fb' }; }, loadChat() { return {}; }
  };
  global.ApiClient = { chat() { return Promise.resolve({ content: JSON.stringify({ patch: { attributes: { attr_str: 18 } } }) }); } };
  global.Platform = { ui: { toast() {}, confirmAsync() { return Promise.resolve(g.confirm); } } };
  global.SkillFlow = {
    attrsOf() { return { str: global.GameState.playerData.attr_str }; },
    recalc() { return { ok: true, changed: true, skillStats: { blade: { init: 5, bonus: 4, alloc: 3, value: 12 } } }; }
  };
  if (over) over(g);
  return g;
}

function reset(UI_Portrait) {
  // cancel 会清模块状态并（若有快照）回退；每例开头先归零
  UI_Portrait.cancel();
}

test('A-RN-1 重审整理只改内存，不落盘；取消回退', async function () {
  const g = makeGlobals();
  const P = freshPortrait();
  reset(P);
  await P.extract();
  expect(global.GameState.playerData.attr_str).toBe(18);
  expect(g.persist).toBe(0);                  // 只改内存
  P.cancel();
  expect(global.GameState.playerData.attr_str).toBe(10); // 回退
  expect(g.persist).toBeGreaterThanOrEqual(1);
});

test('A-RN-2 确认成功：技能重算与人设一起提交', async function () {
  const g = makeGlobals();
  const P = freshPortrait();
  reset(P);
  await P.extract();
  await P.confirm({ summary: '新' }, '');
  expect(global.GameState.playerData.skillStats.blade.value).toBe(12);
  expect(global.GameState.playerData.attr_str).toBe(18);
  expect(g.persist).toBeGreaterThanOrEqual(1);
});

test('A-RN-3 校验失败 + 放弃：属性与技能回到修改前', async function () {
  const g = makeGlobals();
  const P = freshPortrait();
  reset(P);
  global.SkillFlow.recalc = () => ({ ok: false, errors: [{ path: 'skill.blade', message: '超上限' }] });
  await P.extract();
  g.confirm = true;                            // 放弃并返回游戏
  await P.confirm({ summary: '新' }, '');
  expect(global.GameState.playerData.attr_str).toBe(10);
  expect(global.GameState.playerData.skillStats.blade.value).toBe(10);
});

test('A-RN-4 校验失败 + 留在本页：不回退、不提交人设', async function () {
  const g = makeGlobals();
  const P = freshPortrait();
  reset(P);
  global.SkillFlow.recalc = () => ({ ok: false, errors: [{ path: 'skill.blade', message: '超上限' }] });
  await P.extract();
  g.confirm = false;
  await P.confirm({ summary: '新' }, '');
  expect(global.GameState.playerData.attr_str).toBe(18); // 编辑中保留
  expect(global.GameState.playerData.skillStats.blade.value).toBe(10); // 技能未写
});

test('A-RN-5 创角路径（start 进入）：整理仍立即落盘', async function () {
  const g = makeGlobals();
  const P = freshPortrait();
  reset(P);
  global.GameState.playerData = { attr_str: 10 };
  global.GameState.playerData.portrait = undefined;
  let done = null;
  P.start(global.GameState.playerData, function (r) { done = r; }, function () { return { ok: true }; });
  global.Portrait.mergePatch = function (patch, pd) {
    pd.attr_str = patch.attributes.attr_str;
    return { ok: true, label: 'x', before: {}, after: {} };
  };
  await P.extract();
  expect(g.persist).toBeGreaterThanOrEqual(1);
  P.cancel();
});

test('A-RN-6 提交成功后快照清空（再次取消不回退）', async function () {
  const g = makeGlobals();
  const P = freshPortrait();
  reset(P);
  await P.extract();
  await P.confirm({ summary: '新' }, '');
  const before = global.GameState.playerData.attr_str;
  P.cancel();
  expect(global.GameState.playerData.attr_str).toBe(before);
});

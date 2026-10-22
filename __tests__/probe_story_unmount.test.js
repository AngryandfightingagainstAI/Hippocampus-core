// 探针：叙事页卸载（离开叙事页去设置/主页）不得抛错。
// 背景（2026-10-22 真机复现）：RN 0.87 的 BackHandler 只有 addEventListener 返回的
// {remove()}，没有 removeEventListener。StoryScreen 曾在 useEffect 清理里调
// RN.BackHandler.removeEventListener(...)，于是「叙事页 → 设置」在卸载阶段抛
// TypeError: undefined is not a function，整页闪退（emulator crash buffer:
// JavascriptException at StoryScreen → commitHookEffectListUnmount）。
// 本测试固定该回归：挂载 StoryScreen 后卸载，清理函数不得抛错。
const React = require('react');
const { act } = require('react-test-renderer');
const renderer = require('react-test-renderer');

const store = { settings: { theme: { activeId: 'paper-white' } } };
global.Storage = {
  getGlobal: () => store, setGlobal: () => ({ ok: true }),
  getAllCards: () => ({}), getCard: () => null, saveCard: () => ({ ok: true }), deleteCard: () => ({ ok: true }),
  getSaves: () => ({}), getGlobalSaves: () => ({}), readFile: () => '', writeFile: () => ({ ok: true }),
  exists: () => false, listFiles: () => [], deleteFile: () => ({ ok: true }), listCards: () => []
};
global.Platform = {
  ui: { toast: () => {}, confirmAsync: async () => false, alert: () => {}, promptOpen: () => {}, showScreen: () => {} },
  dialog: { alert: () => {} }, clipboard: { setString: () => {} }
};
global.GameState = { currentCard: null, currentState: null, currentCardId: null, currentSaveId: null, playerData: {} };

const nav = require('../rn/navigation.js');
const SA = require('react-native-safe-area-context');
const RN = require('react-native');
const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, bottom: 0, left: 0, right: 0 } };

// 隔离叙事运行时：本测试只关心「组件卸载清理」，不跑真实续玩/请求（否则会留下
// 定时器在 jest teardown 之后触发，产生 ReferenceError 噪声并让退出码非 0）。
jest.mock('../rn/story_runtime.js', () => ({
  continueLast: () => Promise.resolve({ ok: true }),
  replayHistory: () => {},
  exitGame: () => {},
  CONTINUE_REASONS: {}
}));

function mount(el) {
  let t = null;
  act(() => { t = renderer.create(el); });
  return t;
}

// 假定时器：组件里的节流/延迟回调不应在 jest teardown 之后才触发（否则会报
// "Jest environment after it has been torn down" 并让退出码非 0）。
beforeAll(() => { jest.useFakeTimers(); });
afterAll(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('RN 0.87 BackHandler 没有 removeEventListener（回归前提）', () => {
  expect(typeof RN.BackHandler.addEventListener).toBe('function');
  const sub = RN.BackHandler.addEventListener('hardwareBackPress', () => false);
  expect(sub && typeof sub.remove).toBe('function');
  if (typeof sub.remove === 'function') sub.remove();
});

test('StoryScreen 卸载清理不抛错（叙事页 → 设置 的闪退路径）', () => {
  const { StoryScreen } = require('../rn/screens/StoryScreen.js');
  const t = mount(
    React.createElement(SA.SafeAreaProvider, { initialMetrics: metrics },
      React.createElement(nav.NavigationProvider, null, React.createElement(StoryScreen)))
  );
  expect(t).toBeTruthy();
  let unmountErr = null;
  try {
    act(() => { t.unmount(); });
  } catch (e) {
    unmountErr = e;
  }
  expect(unmountErr && String(unmountErr.message)).toBeFalsy();
});

test('StoryScreen 反复挂载/卸载 3 次仍不抛错（设置往返）', () => {
  const { StoryScreen } = require('../rn/screens/StoryScreen.js');
  for (let i = 0; i < 3; i++) {
    const t = mount(
      React.createElement(SA.SafeAreaProvider, { initialMetrics: metrics },
        React.createElement(nav.NavigationProvider, null, React.createElement(StoryScreen)))
    );
    act(() => { t.unmount(); });
  }
  expect(true).toBe(true);
});

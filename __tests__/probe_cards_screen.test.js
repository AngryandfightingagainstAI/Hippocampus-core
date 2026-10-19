// 复现探针 2：整屏 CardsScreen 里点「生成卡带指令」是否能打开浮层
const React = require('react');
const { act } = require('react-test-renderer');
const renderer = require('react-test-renderer');

const store = { settings: { theme: { activeId: 'paper-white' } }, cards: {} };
function mkStorage() {
  const g = () => store;
  return {
    getGlobal: g,
    setGlobal: () => ({ ok: true }),
    getAllCards: () => ({}),
    getCard: () => null,
    saveCard: () => ({ ok: true }),
    deleteCard: () => ({ ok: true }),
    getSaves: () => ({}),
    readFile: () => '',
    writeFile: () => ({ ok: true }),
    exists: () => false,
    listFiles: () => [],
    deleteFile: () => ({ ok: true })
  };
}
global.Storage = mkStorage();
global.Platform = { ui: { toast: () => {}, confirmAsync: async () => false, promptOpen: () => {} }, OS: 'android' };

// 逐个 require，缺模块就打日志，继续
const mods = [
  '../rn/nav_store.js', '../rn/home_model.js', '../rn/ui_classify_rn.js', '../rn/export_util.js',
  '../rn/story_store.js', '../rn/file_picker.js', '../rn/empty_texts.js',
  '../rn/components/AutoInput.js', '../rn/components/BackgroundLayer.js'
];
for (const m of mods) {
  try { require(m); } catch (e) { console.log('REQUIRE FAIL', m, '::', e.message.split('\n')[0]); }
}

let CardsScreen = null;
try { CardsScreen = require('../rn/screens/CardsScreen.js').CardsScreen; }
catch (e) { console.log('CardsScreen REQUIRE FAIL ::', e.message.split('\n')[0]); }

test('CardsScreen 能渲染且能点开生成卡带指令', () => {
  expect(typeof CardsScreen).toBe('function');
  let t;
  const nav = require('../rn/navigation.js');
  const SA = require('react-native-safe-area-context');
  const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, bottom: 0, left: 0, right: 0 } };
  act(() => { t = renderer.create(React.createElement(SA.SafeAreaProvider, { initialMetrics: metrics }, React.createElement(nav.NavigationProvider, null, React.createElement(CardsScreen)))); });
  const root = t.root;
  const btn = root.findAll((n) => n.props && n.props.onPress).find((n) =>
    n.findAll((c) => c.props && c.props.children === '生成卡带指令').length > 0);
  expect(btn).toBeTruthy();
  act(() => { btn.props.onPress(); });
  const RN = require('react-native');
  const modals = t.root.findAllByType(RN.Modal);
  console.log('MODALS:', modals.length, modals.map((m) => m.props.visible));
  const hasCopy = t.root.findAll((n) => n.props && n.props.children === '复制当前段').length;
  console.log('复制当前段 出现次数:', hasCopy);
  expect(hasCopy).toBeGreaterThan(0);
});



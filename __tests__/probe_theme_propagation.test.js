// 探针：切主题后 RN 界面样式是否真的全量重算（"主题更换渲染不同步"复现）
const React = require('react');
const { act } = require('react-test-renderer');
const renderer = require('react-test-renderer');

const store = { settings: { theme: { activeId: 'paper-white' } } };
global.Storage = {
  getGlobal: () => store, setGlobal: () => ({ ok: true }),
  getAllCards: () => ({}), getCard: () => null, saveCard: () => ({ ok: true }), deleteCard: () => ({ ok: true }),
  getSaves: () => ({}), readFile: () => '', writeFile: () => ({ ok: true }), exists: () => false, listFiles: () => [], deleteFile: () => ({ ok: true })
};
global.Platform = { ui: { toast: () => {}, confirmAsync: async () => false, promptOpen: () => {} } };

const nav = require('../rn/navigation.js');
const SA = require('react-native-safe-area-context');
const RN = require('react-native');
const themeMod = require('../rn/use_theme.js');
const CardsScreen = require('../rn/screens/CardsScreen.js').CardsScreen;

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, bottom: 0, left: 0, right: 0 } };

function colorSet(tree) {
  const out = new Set();
  (function walk(node) {
    if (!node || !node.props) return;
    const flat = node.props.style ? RN.StyleSheet.flatten(node.props.style) : null;
    if (flat) {
      for (const k of Object.keys(flat)) {
        if (/color/i.test(k) && typeof flat[k] === 'string') out.add(k + '=' + flat[k]);
      }
    }
    (node.children || []).forEach(walk);
  })(tree.toJSON ? { props: {}, children: [tree.toJSON()] } : null);
  return out;
}

function styleMultiset(t) {
  const out = [];
  (function walk(json) {
    if (!json || typeof json !== 'object') return;
    const flat = json.props && json.props.style ? RN.StyleSheet.flatten(json.props.style) : null;
    if (flat) {
      for (const k of Object.keys(flat)) {
        if (/color/i.test(k) && typeof flat[k] === 'string') out.push(k + '=' + flat[k]);
      }
    }
    (json.children || []).forEach(walk);
  })(t.toJSON());
  return out;
}

test('切到 dark 后 CardsScreen 的颜色样式应变成深色', () => {
  let t;
  act(() => { t = renderer.create(React.createElement(SA.SafeAreaProvider, { initialMetrics: metrics }, React.createElement(nav.NavigationProvider, null, React.createElement(CardsScreen)))); });
  const before = styleMultiset(t);
  const beforeLight = before.filter((s) => /#(f|e)[0-9a-f]{5}|#fff/i.test(s)).length;

  act(() => { require('../engine/theme.js').setBuiltin('dark'); });
  act(() => { themeMod.bumpThemeRev(); });
  const after = styleMultiset(t);
  const darkBg = after.filter((s) => /backgroundColor=#0d0d0f|color=#e8e8ea/i.test(s)).length;
  const stillPaper = after.filter((s) => /#f5f3ee|#f0ede6|#faf8f4|#2a2a2a/i.test(s)).length;

  console.log('beforeColorProps=', before.length, 'lightish=', beforeLight);
  console.log('afterColorProps=', after.length, 'darkTokens=', darkBg, 'stillPaper=', stillPaper);
  console.log('sample after:', after.slice(0, 12).join(' | '));
  expect(after.length).toBeGreaterThan(10);
  expect(darkBg).toBeGreaterThan(0);
});

// 探针：RN 各屏在"空档案"下是否都能渲染出内容（点开没内容类问题普查）
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
global.Platform = { ui: { toast: () => {}, confirmAsync: async () => false, alert: () => {}, promptOpen: () => {}, showScreen: () => {} }, dialog: { alert: () => {} }, clipboard: { setString: () => {} } };
global.GameState = { currentCard: null, currentState: null, currentCardId: null, currentSaveId: null, playerData: {} };

const nav = require('../rn/navigation.js');
const SA = require('react-native-safe-area-context');
const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, bottom: 0, left: 0, right: 0 } };

const SCREENS = [
  ['HomeScreen', '../rn/screens/HomeScreen.js'],
  ['StoryScreen', '../rn/screens/StoryScreen.js'],
  ['SettingsScreen', '../rn/screens/SettingsScreen.js'],
  ['CardsScreen', '../rn/screens/CardsScreen.js'],
  ['SavesScreen', '../rn/screens/SavesScreen.js'],
  ['CreateScreen', '../rn/screens/CreateScreen.js'],
  ['ClassifyScreen', '../rn/screens/ClassifyScreen.js'],
  ['PortraitScreen', '../rn/screens/PortraitScreen.js'],
  ['__boot', '../rn/screens/BootScreen.js']
];

function texts(json, acc) {
  if (!json || typeof json !== 'object') return acc;
  if (typeof json === 'string') { acc.push(json); return acc; }
  (json.children || []).forEach((c) => (typeof c === 'string' ? acc.push(c) : texts(c, acc)));
  return acc;
}

test('各屏空档案渲染普查', () => {
  const report = [];
  for (const [name, mod] of SCREENS) {
    let Comp = null;
    try {
      const m = require(mod);
      Comp = m[name] || m.default || Object.values(m)[0];
    } catch (e) {
      report.push(name + ': REQUIRE_FAIL ' + String(e.message).slice(0, 90));
      continue;
    }
    if (typeof Comp !== 'function') { report.push(name + ': NO_EXPORT'); continue; }
    let t = null, err = null;
    try {
      act(() => {
        t = renderer.create(
          React.createElement(SA.SafeAreaProvider, { initialMetrics: metrics },
            React.createElement(nav.NavigationProvider, null, React.createElement(Comp)))
        );
      });
    } catch (e) { err = String(e.message).slice(0, 110); }
    let txt = '';
    try { txt = t ? texts(t.toJSON(), []).join(' ').replace(/\s+/g, ' ').trim() : ''; } catch (e) {}
    report.push(name + ': err=' + (err || '-') + ' len=' + txt.length + ' text=' + txt.slice(0, 70));
    try { if (t) act(() => t.unmount()); } catch (e) {}
  }
  console.log('SCREENS:\n' + report.join('\n'));
  expect(report.length).toBe(SCREENS.length);
});

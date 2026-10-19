// 探针：面板宿主在"无进行中游戏"空态下不应崩（错误边界 + 提击分派）
const React = require('react');
const { act } = require('react-test-renderer');
const renderer = require('react-test-renderer');

const store = { settings: { theme: { activeId: 'paper-white' } } };
global.Storage = {
  getGlobal: () => store, setGlobal: () => ({ ok: true }),
  getAllCards: () => ({}), getCard: () => null, saveCard: () => ({ ok: true }), deleteCard: () => ({ ok: true }),
  getSaves: () => ({}), readFile: () => '', writeFile: () => ({ ok: true }), exists: () => false, listFiles: () => [], deleteFile: () => ({ ok: true })
};
global.Platform = { ui: { toast: () => {}, confirmAsync: async () => false } };
global.GameState = { currentCard: null, currentState: null, currentCardId: null, playerData: {} };

const StoryStore = require('../rn/story_store.js');
const PanelHost = require('../rn/components/PanelHost.js').PanelHost;

function texts(json, acc) {
  if (!json || typeof json !== 'object') return acc;
  (json.children || []).forEach((c) => {
    if (typeof c === 'string') acc.push(c);
    else texts(c, acc);
  });
  return acc;
}

test('空态下逐个面板都不该抛错', () => {
  for (const id of ['character', 'statusCard', 'log', 'npc', 'tasks', 'achievements', 'diceHistory', 'shop', 'infoPhone', 'errorLog', 'debug', 'eventProposals', 'changeProposals', 'outputs', 'endings', 'storyNodes']) {
    let t;
    act(() => { StoryStore.openPanel(id); });
    expect(() => {
      act(() => { t = renderer.create(React.createElement(PanelHost)); });
    }).not.toThrow();
    const all = texts(t.toJSON(), []).join(' ');
    expect(all.length).toBeGreaterThan(0);
    if (id === 'character') console.log('character 面板文本:', all.slice(0, 120));
    expect(all).not.toMatch(/面板渲染失败/);
    act(() => { t.unmount(); StoryStore.closePanel(); });
  }
});

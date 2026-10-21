// 探针（P70·T2）：RN 侧栏「上下文查看器」面板必须能渲染、能展开、不抛错。
// 桌面探针（_audit/tools/probe_t2_context.js）跑的是 DOM，覆盖不到 RN 的 JSX 分支，
// 所以这里用 react-test-renderer 直接渲染 SidebarDrawer，并用真实的
// engine/prompt_inspect.js 生成一份 inspect 载荷（顺带验证该模块在 RN 侧可加载）。
//
// PromptInspect.build 的输入形状（见 engine/prompt_inspect.js:40-44 的注释）：
//   { round, blocks:[{id,label,text}], messages:[{role,content}],
//     entityHits:[{group,key,name,chars,clipped}], entityClipped:{group:n},
//     trimLog:[{section,before,after,reason}], budget:{enabled,maxTokens}, level }
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
global.GameState = {
  currentCard: null, currentCardId: null, playerData: {},
  currentState: { hud: [], sidebar: [{ key: 'hp', name: '体力', current: 8, max: 10 }], panels: {} },
  _lastPromptEstimate: 1200, _lastPromptFullEstimate: 4300, _lastPromptLevel: 2, _lastPromptTrimmed: true
};

const PromptInspect = require('../engine/prompt_inspect.js');
const StoryStore = require('../rn/story_store.js');
const SidebarDrawer = require('../rn/components/SidebarDrawer.js').SidebarDrawer;

const inspect = PromptInspect.build({
  round: 7,
  level: 2,
  blocks: [
    { id: 'static', label: '静态规则', text: '规则'.repeat(300) },
    { id: 'semiStatic', label: '半静态（世界书/人物）', text: '实体'.repeat(120) },
    { id: 'dynamic', label: '状态快照', text: '体力8/10'.repeat(40) }
  ],
  messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: '我推门进去。' }],
  entityHits: [{ group: 'npcs', key: 'npc_1', name: '店小二', chars: 120, clipped: false }],
  entityClipped: { npcs: 2 },
  trimLog: [{ section: 'recent', before: 500, after: 300, reason: 'demo' }],
  budget: { enabled: true, maxTokens: 3000 },
  estimateTokens: function (t) { return Math.max(1, Math.ceil(String(t || '').length / 1.5)); }
});

function texts(json, acc) {
  if (!json || typeof json !== 'object') return acc;
  (json.children || []).forEach((c) => {
    if (typeof c === 'string') acc.push(c);
    else texts(c, acc);
  });
  return acc;
}

function renderDrawer() {
  let t;
  act(() => { StoryStore.openSidebar(); });
  act(() => { t = renderer.create(React.createElement(SidebarDrawer)); });
  return t;
}

test('P70-T2：侧栏上下文面板可展开并渲染全部契约节点', () => {
  global.GameState._lastPromptInspect = inspect;
  const t = renderDrawer();

  // 折叠态：只应有 toggle，没有 body
  expect(t.root.findAllByProps({ testID: 'pi-toggle' }).length).toBeGreaterThan(0);
  expect(t.root.findAllByProps({ testID: 'pi-body' }).length).toBe(0);

  act(() => { t.root.findAllByProps({ testID: 'pi-toggle' })[0].props.onPress(); });

  ['pi-body', 'pi-total', 'pi-budget', 'pi-note', 'pi-wb-toggle', 'pi-step-recent',
    'pi-row-static', 'pi-row-semiStatic', 'pi-row-dynamic'].forEach((id) => {
    expect(t.root.findAllByProps({ testID: id }).length).toBeGreaterThan(0);
  });

  const all = texts(t.toJSON(), []).join(' ');
  expect(all).toContain('合计');
  expect(all).toContain('第 7 轮发送内容');
  expect(all).toContain('上限 3000 tok');
  expect(all).toContain('本轮档位 2');
  expect(all).toContain('省 200');
  expect(all).toContain('状态快照');

  // 世界书明细：默认收起，点开后应有条目与「未注入」汇总
  expect(t.root.findAllByProps({ testID: 'pi-wb-list' }).length).toBe(0);
  act(() => { t.root.findAllByProps({ testID: 'pi-wb-toggle' })[0].props.onPress(); });
  expect(t.root.findAllByProps({ testID: 'pi-wb-list' }).length).toBeGreaterThan(0);
  const wbText = texts(t.toJSON(), []).join(' ');
  expect(wbText).toContain('店小二');
  expect(wbText).toContain('另有 2 条未注入');

  act(() => { t.unmount(); StoryStore.closeSidebar(); });
});

test('P70-T2：没有 inspect 载荷时展开也不崩（显示空态）', () => {
  // piOpen 与桌面共用 Storage.ui.piOpen（上一轮测试会把它置为 true），先复位
  store.ui = {};
  global.GameState._lastPromptInspect = null;
  const t = renderDrawer();
  act(() => { t.root.findAllByProps({ testID: 'pi-toggle' })[0].props.onPress(); });
  expect(t.root.findAllByProps({ testID: 'pi-body' }).length).toBeGreaterThan(0);
  expect(t.root.findAllByProps({ testID: 'pi-empty' }).length).toBeGreaterThan(0);
  const all = texts(t.toJSON(), []).join(' ');
  expect(all).toContain('还没有发过请求');
  act(() => { t.unmount(); StoryStore.closeSidebar(); });
});

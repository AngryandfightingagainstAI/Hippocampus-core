// 复现探针 v2：用 act() 同步渲染，避开 React19 并发调度在 jest 里的 teardown 假崩溃
const React = require('react');
const renderer = require('react-test-renderer');

const store = { settings: { theme: { activeId: 'paper-white' } }, cards: {}, saves: {} };
global.Storage = {
  getGlobal: () => store,
  setGlobal: (patch) => { Object.assign(store, patch); return { ok: true }; },
  saveGlobal: () => ({ ok: true }),
};
const toasts = [];
global.Platform = { ui: { toast: (msg, opts) => { toasts.push({ msg, opts }); } } };

const RN = require('react-native');
const InstructionModal = require('../rn/components/InstructionModal.js').InstructionModal;

const { act } = renderer;

test('act 同步渲染打开态', () => {
  let t;
  act(() => { t = renderer.create(React.createElement(InstructionModal, { visible: true, onClose: () => {} })); });
  const root = t.root;
  const texts = root.findAll((n) => n.props && typeof n.props.children === 'string').map((n) => n.props.children);
  console.log('TEXTS:', JSON.stringify(texts));
  const modals = root.findAllByType(RN.Modal);
  console.log('MODAL_COUNT:', modals.length, 'VISIBLE:', modals.map((m) => m.props.visible));
  expect(modals[0].props.visible).toBe(true);
});

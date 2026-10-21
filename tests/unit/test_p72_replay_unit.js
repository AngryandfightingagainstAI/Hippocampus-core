// P72·D6 RN 侧回归（纯 node，与 tools/*_smoke.js 同风格）
// 断言 rn/story_runtime.js 的 replayHistory：assistant 决定章数、合成 user 不占轮。
// 老实现固定步长 i += 2，一轮里插 1 条反馈就只渲染一半章节（= 整轮剧情被吞）。
//
// 跑法：node tests/unit/test_p72_replay_unit.js
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('PASS: ' + name); pass++; }
  catch (e) { console.log('FAIL: ' + name + ' / ' + e.message); fail++; }
}
function eq(a, b, label) { if (a !== b) throw new Error(label + ' 期望=' + b + ' 实际=' + a); }

// 每次新建一套全局桩（story_runtime 顶层会 require 同目录模块，故用 require 缓存清理）
function freshEnv() {
  const calls = { chapters: [], hints: [], stories: [] };
  const store = {};
  global.GameState = {
    chatHistory: [], currentState: {}, currentCard: null, playerData: {},
    currentCardId: null, currentSaveId: null, _gameTime: null
  };
  global.Platform = {
    ui: {
      clearStory() { calls.chapters.length = 0; calls.hints.length = 0; calls.stories.length = 0; },
      appendHint(t) { calls.hints.push(t); },
      renderChapterHead(n) { calls.chapters.push(n); },
      appendStory(story) { calls.stories.push(story); },
      toast() {}, confirmAsync() { return Promise.resolve(true); }
    }
  };
  global.ToolExecutor = { strip(s) { return String(s == null ? '' : s); } };
  global.StoryLoop = { currentOptions: [] };
  global.Storage = { getGlobal() { return {}; } };
  global.Saves = {};
  global.VFS = {};
  global.HomeModel = { buildLastSave() { return null; } };
  global.ApiManager = { getActive() { return null; } };
  global.InfoFeed = { promote() {} };
  global.NavStore = { navigate() {} };
  global.Logger = null;

  global.MessageTree = require(path.join(ROOT, 'engine', 'message_tree.js'));
  delete require.cache[path.join(ROOT, 'rn', 'story_runtime.js')];
  const sr = require(path.join(ROOT, 'rn', 'story_runtime.js'));
  return { sr, calls, store };
}

function buildHistory(rounds, fbPerRound) {
  const h = [{ role: 'system', content: 'SYS' }];
  for (let i = 1; i <= rounds; i++) {
    h.push({ role: 'user', content: i === 1 ? '开场白' : ('玩家行动' + i) });
    for (let f = 0; f < fbPerRound; f++) {
      h.push({ role: 'user', content: '【系统 · 工具执行结果】fb' + i + '_' + f });
    }
    h.push({ role: 'assistant', content: '【正文】第' + i + '章\n【选项】\n1. 继续\n2. 停下' });
  }
  return h;
}

check('replayHistory 已导出', () => {
  const { sr } = freshEnv();
  if (typeof sr.replayHistory !== 'function') throw new Error('replayHistory 未导出');
});

check('无反馈：4 轮 → 4 章', () => {
  const { sr, calls } = freshEnv();
  global.GameState.chatHistory = buildHistory(4, 0);
  sr.replayHistory();
  eq(calls.chapters.length, 4, '章节头数');
  eq(calls.chapters.join(','), '1,2,3,4', '轮号序列');
});

check('★每轮 1 条合成反馈 → 仍 4 章（老实现 2 章）', () => {
  const { sr, calls } = freshEnv();
  global.GameState.chatHistory = buildHistory(4, 1);
  sr.replayHistory();
  eq(calls.chapters.length, 4, '章节头数');
  eq(calls.hints[1], '（玩家行动2）', '第 2 章提示');
});

check('每轮 2 条合成反馈 → 4 章且提示不错位', () => {
  const { sr, calls } = freshEnv();
  global.GameState.chatHistory = buildHistory(4, 2);
  sr.replayHistory();
  eq(calls.chapters.length, 4, '章节头数');
  eq(calls.hints[2], '（玩家行动3）', '第 3 章提示');
});

check('选项被拆出来（不是整段正文）', () => {
  const { sr } = freshEnv();
  global.GameState.chatHistory = buildHistory(2, 1);
  sr.replayHistory();
  eq(global.StoryLoop.currentOptions.join('|'), '继续|停下', 'currentOptions');
});

console.log('----------------------------------------');
console.log('SUMMARY: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

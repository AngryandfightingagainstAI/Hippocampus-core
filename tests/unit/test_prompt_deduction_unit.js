// ============================================================
// P54·P1 单测：①工具协议条件注入（prompt_builder）②story.js 推演并发闸
//   D1 推演关闭（默认配置）⇒ 静态段里没有 request_deduction / query_deductions()
//   D2 推演打开 ⇒ 两者都回来
//   D3 老档 / 夹具没有 npcDeduction 键 ⇒ 按「开」处理（fail-open，不悄悄改协议）
//   D4 源码哨兵：两仓 3 处注入点都过 _deductionOn()
//   D5 源码哨兵：两仓 story.js 都改成波次闸（并发 2），且两仓仍逐字同源
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '_harness.js'));

const RN_ROOT = H.ROOT;
// 另一仓（桌面）可能不在本机（CI 上就没有）：按 tools/card_compat_smoke.js 的惯例，
// 允许用环境变量覆盖，读不到就**明确跳过**跨仓那半，而不是让 fs 抛异常把整套打红。
const PC_ROOT = process.env.HIPPOCAMPUS_PC || 'D:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';
const HAVE_PC = fs.existsSync(path.join(PC_ROOT, 'engine', 'story.js'));
if (!HAVE_PC) {
  console.log('       （另一仓不可见：' + PC_ROOT + ' ⇒ D4/D5 的跨仓断言跳过，只查本仓）');
}
function readNorm(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function otherRepos() { return HAVE_PC ? [RN_ROOT, PC_ROOT] : [RN_ROOT]; }

// 用给定全局配置建一个能跑 buildStatic 的沙箱
function mk(globalCfg) {
  const s = H.makeSandbox({
    Storage: {
      getGlobal: function() { return globalCfg; },
      getDiceConfig: function() { return { mode: 'normal', difficulty: 'normal' }; },
      defaultGlobal: function() { return {}; }
    },
    getDiceConfig: function() { return { mode: 'normal', difficulty: 'normal' }; },
    GameState: {
      currentCard: { id: 'card_probe', name: '探针卡带', title: '探针卡带', game: { title: '探针游戏' }, worldbook: {}, cardStyle: '' },
      playerData: {},
      chatHistory: [],
      currentCardId: 'card_probe',
      currentSaveId: 'save_probe',
      _pendingSystemNotices: [],
      formatGameTime: function() { return '1-1-3 08:00'; }
    }
  });
  H.load(s, 'engine/core/prompt_builder.js');
  return s;
}

// ---------- D1 关闭 ----------
H.run('D1 推演关闭 ⇒ 不下发推演协议（默认配置口径）', function() {
  const s = mk({ gm: {}, npcDeduction: { enabled: false, profileId: null, autoTrigger: false } });
  H.ok(s.PromptBuilder && typeof s.PromptBuilder.buildStatic === 'function', 'D1 模块可加载');
  const txt = String(s.PromptBuilder.buildStatic());
  H.ok(txt.length > 1000, 'D1 静态段有内容（' + txt.length + ' 字符）');
  H.notOk(txt.indexOf('request_deduction') >= 0, 'D1 关闭时不应出现 request_deduction');
  H.notOk(txt.indexOf('query_deductions()') >= 0, 'D1 关闭时不应出现 query_deductions()');
  H.contains(txt, 'npc_knows(id, text, source)', 'D1 npc_knows 那半句必须留着');
  H.contains(txt, 'query_dice_history', 'D1 查询扩展其余 3 个工具照旧');
  H.notOk(/\n· .*；从已知事实推演/.test(txt), 'D1 引擎规则里推演半句应被去掉');
});

// ---------- D2 打开 ----------
H.run('D2 推演打开 ⇒ 协议全回来', function() {
  const offLen = String(mk({ gm: {}, npcDeduction: { enabled: false } }).PromptBuilder.buildStatic()).length;
  const s = mk({ gm: {}, npcDeduction: { enabled: true, profileId: 'p1', autoTrigger: true } });
  const txt = String(s.PromptBuilder.buildStatic());
  H.contains(txt, 'request_deduction', 'D2 打开应有 request_deduction');
  H.contains(txt, 'query_deductions()', 'D2 打开应有 query_deductions()');
  H.contains(txt, '；从已知事实推演 → 调 request_deduction(id, text)，引擎会验证它能否推出', 'D2 引擎规则推演半句应在');
  const delta = txt.length - offLen;
  console.log('       （P1 实测：推演关/开，静态段字符差 = ' + delta + '）');
  // 深审 §五 方案 7 的估算是「约 290 字符」，实测 161（只删规则里那半句 + 一行协议 + 一个查询后缀）
  H.ok(delta >= 130, 'D2 关闭时每轮至少省 130 字符，实测 ' + delta);
});

// ---------- D3 fail-open ----------
H.run('D3 缺 npcDeduction 键 ⇒ 按开处理（不比现状更少）', function() {
  const s = mk({ gm: {} });
  const txt = String(s.PromptBuilder.buildStatic());
  H.contains(txt, 'request_deduction', 'D3 读不到配置时保留协议');
  H.contains(txt, 'query_deductions()', 'D3 读不到配置时保留查询扩展');
});

// ---------- D4 源码哨兵：prompt_builder 两仓 ----------
H.run('D4 源码哨兵：两仓 prompt_builder 三处注入点都过 _deductionOn()', function() {
  for (const root of otherRepos()) {
    const p = path.join(root, 'engine', 'core', 'prompt_builder.js');
    const src = readNorm(p);
    H.contains(src, 'function _deductionOn()', 'D4 助手应在（' + root + '）');
    H.contains(src, 'if (!_c || typeof _c !== \'object\' || !(\'enabled\' in _c)) return true;', 'D4 缺键回落「开」（' + root + '）');
    H.eq(src.split('_deductionOn()').length - 1, 4, 'D4 _deductionOn() 出现次数=1 声明 + 3 处注入（' + root + '）');
    H.contains(src, 'if (_deductionOn()) lines.push(\'NPC 推演：request_deduction', 'D4 NPC 推演行条件注入（' + root + '）');
    H.contains(src, 'if (_deductionOn()) _qExtLine += \' / query_deductions()\';', 'D4 查询扩展条件拼接（' + root + '）');
    H.contains(src, 'if (r && r.indexOf(\'request_deduction\') >= 0 && !_deductionOn())', 'D4 引擎规则条件删半句（' + root + '）');
  }
});

// ---------- D5 源码哨兵 + 同源：story.js 两仓 ----------
H.run('D5 源码哨兵：两仓 story.js 改为波次闸 2 且仍同源', function() {
  const rn = readNorm(path.join(RN_ROOT, 'engine', 'story.js'));
  if (HAVE_PC) {
    const pc = readNorm(path.join(PC_ROOT, 'engine', 'story.js'));
    H.eq(rn, pc, 'D5 两仓 story.js 归一后应逐字相同');
  } else {
    console.log('       （D5 跨仓同源断言跳过：另一仓不可见）');
  }
  H.contains(rn, 'var _dQueue = _pendings.slice();', 'D5 队列');
  H.contains(rn, 'var _wave = _dQueue.splice(0, 2);', 'D5 每波 2 个');
  H.contains(rn, '_dStep();', 'D5 递归推进');
  H.notOk(rn.indexOf('Promise.all(_promises)') >= 0, 'D5 旧的无上限 Promise.all 应消失');
  H.notOk(rn.indexOf('var _promises') >= 0, 'D5 旧变量应消失');
  H.contains(rn, '位 NPC 好像知道了什么，去人物面板看看原因', 'D5 汇总提示保留');
});

H.finish();

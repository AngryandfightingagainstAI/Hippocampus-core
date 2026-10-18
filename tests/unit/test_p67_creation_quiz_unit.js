// ============================================================
// 单元测试 · P67 手机侧开局问卷（rn/create_flow_model.js + engine/creation_quiz.js）
//
// 为什么有这一批：桌面侧有 tests/unit/test_p67_creation_quiz.js（21 条）钉子，
//   但手机侧的接线（quizDefs/quizPicks/setQuizPick/quizMissing/quizResults/
//   buildPlayerData）此前只在真机手点里走过一次，没有自动守卫。
//   这批用最小卡片把「答案怎么落、缺题怎么拦、结论怎么进 playerData」夹住。
//
// 跑法：node tests/unit/test_p67_creation_quiz_unit.js
// ============================================================
const path = require('path');
const fs = require('fs');
const H = require('./_harness.js');
const ROOT = H.ROOT;

function readSrc(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; }
}

// 一份「三套卷」的小卡带（学院 / 灯杖 / 守灯兽），与真机手玩用的 p67_card.json 同形
function makeCard() {
  return {
    cardId: 'quizprobe',
    cardName: '问卷探针',
    attributes: [
      { key: 'attr_sense', name: '观察', min: 5, max: 20, init: 5 },
      { key: 'attr_calm', name: '镇定', min: 5, max: 20, init: 5 },
      { key: 'attr_body', name: '体力', min: 5, max: 20, init: 5 }
    ],
    attributePool: { total: 30, base: 5 },
    steps: [
      {
        id: 'quiz1', type: 'quiz', title: '入院登记', guide: '凭第一直觉选。',
        quizzes: [
          {
            id: 'house', title: '分院卷', prompt: '雾港的守夜人分三个院。', resultName: '学院',
            results: [
              { id: 'flame', name: '焰羽院', desc: '信直觉、敢先动手', grants: { attr_sense: 1 } },
              { id: 'stone', name: '石垣院', desc: '守规矩、扛得住' },
              { id: 'tide', name: '潮汐院', desc: '先看再动' }
            ],
            questions: [
              { q: '有人敲门，你先？', opts: [{ text: '开门', outcome: 'flame' }, { text: '先熄灯', outcome: 'stone' }, { text: '不应声', outcome: 'tide' }] },
              { q: '灯油只够半夜，你？', opts: [{ text: '挑到最亮', outcome: 'flame' }, { text: '按规程减半', outcome: 'stone' }, { text: '问同伴', outcome: 'tide' }] },
              { q: '档案里多出一条记录，你？', opts: [{ text: '记下这件事', outcome: 'flame' }, { text: '上报', outcome: 'stone' }, { text: '再核对一遍', outcome: 'tide' }] }
            ]
          },
          {
            id: 'wand', title: '灯杖卷', resultName: '灯杖',
            results: [
              { id: 'salt', name: '盐雾木·长杖', desc: '守夜手稳' },
              { id: 'iron', name: '铁桦·短杖', desc: '磕碰不心疼' }
            ],
            questions: [
              { q: '杖头往哪偏？', opts: [{ text: '朝海', outcome: 'salt' }, { text: '朝岸', outcome: 'iron' }] },
              { q: '杖身要多长？', opts: [{ text: '长', outcome: 'salt' }, { text: '短', outcome: 'iron' }] }
            ]
          },
          {
            id: 'patronus', title: '守灯兽卷', resultName: '守灯兽',
            results: [
              { id: 'gull', name: '海鸥', desc: '飞得远，爱绕圈' },
              { id: 'seal', name: '灰海豹', desc: '沉得住' }
            ],
            questions: [
              { q: '雾里先出现？', opts: [{ text: '翅膀', outcome: 'gull' }, { text: '眼睛', outcome: 'seal' }] }
            ]
          }
        ]
      }
    ]
  };
}

function sandbox(card) {
  const sb = H.makeSandbox({
    CreationQuiz: require(path.join(ROOT, 'engine', 'creation_quiz.js')),
    Storage: { getGlobal: function () { return {}; }, setGlobal: function () {} },
    Saves: { listByCard: function () { return []; } }
  });
  sb.module = { exports: {} };
  delete require.cache[require.resolve(path.join(ROOT, 'rn', 'create_flow_model.js'))];
  // create_flow_model 是 CommonJS 模块但内部引用裸全局 VFS/CreationQuiz ⇒ 用 vm 加载到沙箱
  const code = fs.readFileSync(path.join(ROOT, 'rn', 'create_flow_model.js'), 'utf8');
  const vm = require('vm');
  vm.runInContext(code, sb, { filename: 'rn/create_flow_model.js' });
  sb.card = card;
  return sb;
}

// ============ Q1–Q9 · 判卷接口本体 ============
H.run('Q1 quizDefs 归一三套卷（题数/选项数）', function () {
  const sb = sandbox(makeCard());
  const defs = sb.module.exports.quizDefs(sb.card.steps[0]);
  H.eq(defs.length, 3, '套数');
  H.eq(defs[0].id, 'house', '第一套 id');
  H.eq(defs[0].questions.length, 3, '分院卷题数');
  H.eq(defs[2].questions.length, 1, '守灯兽题数');
});

H.run('Q2 setQuizPick 按题序落 __picks_<id>，不污染别的题', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const data = {};
  CF.setQuizPick(data, 'house', 0, 'flame');
  CF.setQuizPick(data, 'house', 2, 'tide');
  H.deepEq(CF.quizPicks(data, 'house'), ['flame', '', 'tide'], '答案数组（空位是空串）');
  H.deepEq(CF.quizPicks(data, 'wand'), [], '别的卷不受影响');
});

H.run('Q3 quizMissing 数缺题（选满为 0）', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const step = sb.card.steps[0];
  const data = {};
  H.eq(CF.quizMissing(step, data), 6, '全空时应缺 6 题（3+2+1）');
  CF.setQuizPick(data, 'house', 0, 'flame');
  CF.setQuizPick(data, 'house', 1, 'stone');
  CF.setQuizPick(data, 'house', 2, 'tide');
  CF.setQuizPick(data, 'wand', 0, 'salt');
  CF.setQuizPick(data, 'wand', 1, 'salt');
  CF.setQuizPick(data, 'patronus', 0, 'gull');
  H.eq(CF.quizMissing(step, data), 0, '选满应 0');
});

H.run('Q4 平票取卡带里先声明的那一项（不随机）', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const data = {};
  // 焰羽 / 石垣 / 潮汐 各一 ⇒ 1-1-1 平票
  CF.setQuizPick(data, 'house', 0, 'flame');
  CF.setQuizPick(data, 'house', 1, 'stone');
  CF.setQuizPick(data, 'house', 2, 'tide');
  const res = CF.quizResults(sb.card.steps[0], data);
  const house = res.filter(function (r) { return r.quizId === 'house'; })[0];
  H.eq(house.outcomeId, 'flame', '平票取先声明项');
  H.eq(house.name, '焰羽院', '结果名');
});

H.run('Q5 同一份答案判两次结论一致（确定性）', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const data = {};
  CF.setQuizPick(data, 'house', 0, 'stone');
  CF.setQuizPick(data, 'house', 1, 'stone');
  CF.setQuizPick(data, 'house', 2, 'tide');
  const a = CF.quizResults(sb.card.steps[0], data)[0].outcomeId;
  const b = CF.quizResults(sb.card.steps[0], data)[0].outcomeId;
  H.eq(a, 'stone', '2-1 判石垣');
  H.eq(a, b, '两次一致');
});

H.run('Q6 validateStep 缺题回 QUIZ_MISS 且带 miss 数', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const r = CF.validateStep(sb.card, sb.card.steps[0], {});
  H.eq(r.ok, false, 'ok');
  H.eq(r.code, 'QUIZ_MISS', 'code');
  H.eq(r.miss, 6, 'miss');
});

H.run('Q7 选满后 validateStep 放行', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const step = sb.card.steps[0];
  const data = {};
  ['flame', 'stone', 'tide'].forEach(function (o, i) { CF.setQuizPick(data, 'house', i, o); });
  ['salt', 'iron'].forEach(function (o, i) { CF.setQuizPick(data, 'wand', i, o); });
  CF.setQuizPick(data, 'patronus', 0, 'gull');
  H.eq(CF.validateStep(sb.card, step, data).ok, true, '放行');
});

H.run('Q8 summaryEntries 跳过 __ 键、问卷行用 resultName 与结果名', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const data = { name: '沈砚' };
  CF.setQuizPick(data, 'house', 0, 'flame');
  CF.setQuizPick(data, 'house', 1, 'flame');
  CF.setQuizPick(data, 'house', 2, 'flame');
  const rows = CF.summaryEntries(sb.card, data);
  const hasInternal = rows.filter(function (r) { return String(r.k).indexOf('__') === 0; });
  H.eq(hasInternal.length, 0, '没有 __ 前缀行');
  const houseRow = rows.filter(function (r) { return r.k === '学院'; })[0];
  H.ok(!!houseRow, '有「学院」行');
  H.eq(houseRow.v, '焰羽院', '学院值');
});

H.run('Q9 buildPlayerData 结算：quiz_<id> / __quiz / __quizFacts 落库且剥 __picks_', function () {
  const sb = sandbox(makeCard());
  const CF = sb.module.exports;
  const data = { name: '沈砚' };
  ['flame', 'flame', 'flame'].forEach(function (o, i) { CF.setQuizPick(data, 'house', i, o); });
  ['salt', 'salt'].forEach(function (o, i) { CF.setQuizPick(data, 'wand', i, o); });
  CF.setQuizPick(data, 'patronus', 0, 'gull');
  const pd = CF.buildPlayerData(data, sb.card);
  H.eq(pd.quiz_house, '焰羽院', 'quiz_house');
  H.eq(pd.quiz_wand, '盐雾木·长杖', 'quiz_wand');
  H.eq(pd.quiz_patronus, '海鸥', 'quiz_patronus');
  H.ok(!!pd.__quiz && pd.__quiz.house.id === 'flame', '__quiz 结论');
  H.ok(typeof pd.__quizFacts === 'string' && pd.__quizFacts.indexOf('焰羽院') >= 0, '__quizFacts 文案');
  Object.keys(pd).forEach(function (k) { H.ok(k.indexOf('__picks_') !== 0, '残留 ' + k); });
});

// ============ Q10–Q12 · 接线静态哨兵 ============
H.run('Q10 CreateScreen 有 case \'quiz\' + onPickQuiz + QUIZ_MISS 文案', function () {
  const src = readSrc('rn/screens/CreateScreen.js');
  H.ok(src.indexOf("case 'quiz':") >= 0, '缺 case quiz');
  H.ok(src.indexOf('onPickQuiz') >= 0, '缺 onPickQuiz');
  H.ok(src.indexOf("case 'QUIZ_MISS':") >= 0, '缺 QUIZ_MISS 文案');
  H.ok(src.indexOf('buildPlayerData(data, card)') >= 0, 'finish 没传 card');
});

H.run('Q11 rn_bootstrap 注册 CreationQuiz（且早于 story/prompt 使用方）', function () {
  const src = readSrc('rn/rn_bootstrap.js');
  const i = src.indexOf("load('CreationQuiz'");
  H.ok(i >= 0, '缺 load(CreationQuiz)');
  H.ok(src.indexOf("require('../engine/creation_quiz.js')") >= 0, 'require 路径不对');
  const j = src.indexOf("load('StoryLoop'");
  H.ok(j < 0 || i < j, 'CreationQuiz 应在 StoryLoop 之前');
});

H.run('Q12 creation_quiz.js 与桌面逐字节相同（engine_sync 登记为 mirror）', function () {
  const manifest = JSON.parse(readSrc('tools/engine_sync_manifest.json'));
  const hit = (manifest.mirror || []).filter(function (m) { return (m.path || m) === 'engine/creation_quiz.js'; });
  H.eq(hit.length, 1, 'creation_quiz.js 未登记为 mirror');
});

H.finish();

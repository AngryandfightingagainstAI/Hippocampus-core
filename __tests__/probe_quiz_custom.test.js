// 探针：开局问卷「都不像我 → 自己写」在 RN 侧的口径
// 守住三件事：
//   1) 自定义作答算「答过」（不会卡在「还有 N 道题没选」）；
//   2) 自定义作答**不投票**，一票都没有时不出结论（不拿先声明者凑数）；
//   3) 归不到任何结论时，之前点过的旧选项必须被清掉（不能替玩家认下）。
const CF = require('../rn/create_flow_model.js');
global.CreationQuiz = require('../engine/creation_quiz.js');

const QUIZ = {
  id: 'q1',
  title: '阵营抉择',
  resultName: '生存底色',
  outcomes: [
    { id: 'cold', name: '顺应黑夜', tags: ['冷酷'] },
    { id: 'chaos', name: '制造混乱', tags: ['冒险'] }
  ],
  questions: [
    { q: '你的选择是？', opts: [{ text: '冷眼旁观', outcome: 'cold' }, { text: '制造混乱', outcome: 'chaos' }] }
  ]
};

function data(picks, customs) {
  return { __picks_q1: picks || [], __custom_q1: customs || {} };
}

describe('开局问卷自写答案的口径', () => {
  test('自定义作答算答过', () => {
    expect(CF.quizMissing({ quizzes: [QUIZ] }, data([''], { 0: '感叹一下横滨好乱然后走了' }))).toBe(0);
    expect(CF.quizMissing({ quizzes: [QUIZ] }, data([''], {}))).toBe(1);
  });

  test('自定义作答不投票；一票都没有时不出结论', () => {
    const step = { quizzes: [QUIZ] };
    expect(CF.quizResults(step, data([''], { 0: '感叹一下横滨好乱然后走了' }))).toEqual([]);
  });

  test('有真实投票时结论只来自票数，不被自定义答案影响', () => {
    const step = { quizzes: [QUIZ] };
    const rs = CF.quizResults(step, data(['chaos'], { 0: '感叹一下横滨好乱然后走了' }));
    expect(rs.length).toBe(1);
    expect(rs[0].outcomeId).toBe('chaos');
    expect(rs[0].answered).toBe(1);
  });

  test('归不到结论时清掉旧选项：旧选项不能替玩家投票', () => {
    const d = data(['cold'], {});
    CF.setQuizPick(d, 'q1', 0, '');
    d.__custom_q1 = { 0: '感叹一下横滨好乱然后走了' };
    expect(CF.quizPicks(d, 'q1')[0]).toBe('');
    expect(CF.quizResults({ quizzes: [QUIZ] }, d)).toEqual([]);
  });

  test('自定义输入框把 options 传在第三位（否则会把占位对象当默认值显示成 [object Object]）', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'rn', 'screens', 'CreateScreen.js'), 'utf8');
    const i = src.indexOf('都不像我？用你自己的话说一句');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 120)).toMatch(/用你自己的话说一句',\s*'',\s*\{/);
  });
});

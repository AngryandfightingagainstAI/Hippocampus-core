// 2026-10-23 P0 回归：人设确认后必须真的进档，并且完整经历在角色卡里看得见。
// 用户报的「人设建立后人设卡没有录入系统」，在 RN 侧有两层：
//   ① 落盘时机（engine/story.js _enterPortrait 现在先 persist 再进游戏，两仓同源）
//   ② 角色卡只渲染 portrait.summary/traits，完整经历 fullBio 根本没有出口
// 这个用例守 ②：panel_data 必须把 fullBio 交出来给面板渲染。
const path = require('path');

const dataPath = path.join(__dirname, '..', 'rn', 'panels', 'panel_data.js');

describe('人设卡：完整经历必须能进角色面板', () => {
  let PanelData;

  beforeAll(() => {
    jest.resetModules();
    PanelData = require(dataPath);
  });

  function withPlayer(pd) {
    global.GameState = {
      playerData: pd,
      currentCard: { attributes: [], talents: [], panels: [] },
    };
    return PanelData.computeCharacter();
  }

  afterEach(() => {
    delete global.GameState;
  });

  test('portrait.fullBio 映射到 view.portraitFullBio', () => {
    const view = withPlayer({
      name: '沈青',
      portrait: { summary: '铁匠学徒', fullBio: '十二岁进铺子，十八岁打出第一把刀。', traits: ['手稳'] },
    });
    expect(view.portraitSummary).toBe('铁匠学徒');
    expect(view.portraitFullBio).toBe('十二岁进铺子，十八岁打出第一把刀。');
  });

  test('没有 fullBio 时是空串，面板不渲染空块', () => {
    const view = withPlayer({ name: '沈青', portrait: { summary: '铁匠学徒', traits: [] } });
    expect(view.portraitFullBio).toBe('');
  });

  test('只有 fullBio、没有 summary 也要保留经历（信息不丢）', () => {
    const view = withPlayer({ name: '沈青', portrait: { summary: '', fullBio: '很长的经历'.repeat(50) } });
    expect(view.portraitFullBio.length).toBe(250);
  });
});

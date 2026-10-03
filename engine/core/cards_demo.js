// ============================================================
// 核心层 · 内置示例卡带
// 引擎自带 demo_v1 卡带，供新用户开箱即用。
// 导入的卡带存 VFS /cards/ 下，由 Storage.getAllCards 合并。
// ============================================================

var CARDS = (typeof window !== 'undefined' && window.CARDS) || {};
CARDS["demo_v1"] = {
  schemaVersion: "1.2", cardId: "demo_v1", cardName: "示例卡带", author: "引擎内置",
  description: "占位示例，可删。",
  game: { title: "示例游戏", background: "占位。", sourceUniverse: "Demo", eraRange: [2000, 2100], openingPrompt: "" },
  hud: [ { key: "hp", name: "体力", icon: "heart", max: 100, init: 100 } ],
  sidebar: [
    { key: "fatigue", name: "疲劳", icon: "moon", max: 100, init: 0,
      segments: [
        { min: 0, max: 30, text: "精力充沛。" },
        { min: 31, max: 70, text: "略感疲惫。" },
        { min: 71, max: 100, text: "精疲力竭。" }
      ]
    }
  ],
  panels: [
    { id: "attrs", num: 2, name: "个人素质", entries: [] },
    { id: "fame", num: 3, name: "声望与名誉", entries: [] },
    { id: "social", num: 4, name: "社交关系", entries: [] },
    { id: "world", num: 5, name: "世界百科", entries: [] }
  ],
  attributes: [{ key: "knowledge", name: "学识", icon: "book-open", min: 5, max: 20, init: 5 }],
  attributePool: { total: 30, base: 5 },
  steps: [
    { id: "name", type: "form", title: "姓名", guide: "输入你的角色名。",
      fields: [{ key: "name", type: "text", label: "姓名", required: true }] },
    { id: "confirm", type: "summary", title: "确认" }
  ],
  statusCard: { enabled: false, sections: [] },
  npcs: [], tools: [], timeline: { startYear: 0, events: [] }, outputSchema: {},
  worldbook: {
    worldSetting: { existence: { has: [], hasNot: [] }, eraProducts: [] },
    maps: [], mapNodes: {},
    timeline: { official: [], fanFuture: [], playerLine: [] },
    npcs: [], factions: [], items: [], skills: [], shops: [],
    events: [], tasks: [], achievements: [],
    weather: { mode: 'off', changeEvery: 'daily', pool: [] },
    currency: { currencies: [], allowBarter: false, allowSell: false },
    hasRaces: false, races: [], occupations: []
  }
};

if (typeof window !== 'undefined') window.CARDS = CARDS;
if (typeof module !== 'undefined' && module.exports) module.exports = CARDS;

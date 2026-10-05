// ============================================================
// 核心层 · 存储
// VFS 一次性迁移 IIFE + Storage 全局配置 + 骰子/思考配置读取包装。
// 注：localStorage 直调是 B 方案有意保留（将来 RN 侧换 SecureStore）。
// ============================================================

// VFS 迁移
(function() {
  try {
    if (typeof VFS === 'undefined') return;
    const KEY = 'vfs_migrated_v1';
    if (localStorage.getItem(KEY)) return;
    const raw = localStorage.getItem('ai_tg_cards');
    if (raw) {
      try { const cards = JSON.parse(raw); Object.keys(cards).forEach(id => VFS.writeJSON('/cards/' + id + '.json', cards[id])); } catch (e) {}
    }
    VFS.mkdir('/cards'); VFS.mkdir('/saves');
    localStorage.setItem(KEY, '1');
  } catch (e) {}
})();

// ============================================================
// Storage
// ============================================================

// D-2 · 卡带形态归一化的唯一消费咽喉。
// 设计：normalizeDefs 对数组同引用直通、对对象映射转数组并注入 id。
// 消费出口（getImportedCards/getAllCards）每张卡过 normalizeCardOut：
//   - 已规范卡（全部子表为数组/缺省）整卡同引用返回，零拷贝幂等；
//   - 任一子表为对象映射时，整张卡深克隆后转换，绝不变异 window.CARDS 注册表或 VFS 数据；
//   - mapNodes 保持对象映射不归一化（map_editor 依赖映射形态）。
// 检修出口（getRawImportedCards/getRawAllCards）直通原始形态，专供 audit/runtime_repair。
var NORMALIZE_DEF_KEYS = ['npcs', 'factions', 'items', 'maps', 'shops', 'events', 'tasks', 'achievements', 'endings', 'storyNodes', 'foreshadows'];

function cardDefsDirty(card) {
  if (!card || typeof card !== 'object' || !card.worldbook || typeof card.worldbook !== 'object') return false;
  var wb = card.worldbook;
  for (var i = 0; i < NORMALIZE_DEF_KEYS.length; i++) {
    var v = wb[NORMALIZE_DEF_KEYS[i]];
    if (v && typeof v === 'object' && !Array.isArray(v)) return true;
  }
  var official = wb.timeline && wb.timeline.official;
  if (official && typeof official === 'object' && !Array.isArray(official)) return true;
  return false;
}

function normalizeCardOut(card) {
  if (!cardDefsDirty(card)) return card;
  var out = JSON.parse(JSON.stringify(card));
  var wb = out.worldbook;
  NORMALIZE_DEF_KEYS.forEach(function(k) {
    if (wb[k] && typeof wb[k] === 'object' && !Array.isArray(wb[k])) {
      wb[k] = CardValidator.normalizeDefs(wb[k]);
    }
  });
  if (wb.timeline && wb.timeline.official && typeof wb.timeline.official === 'object' && !Array.isArray(wb.timeline.official)) {
    wb.timeline.official = CardValidator.normalizeDefs(wb.timeline.official);
  }
  return out;
}

var Storage = {
  GLOBAL_KEY: 'ai_tg_global',
  LEGACY_KEY: 'ai_global_cfg',
  defaultGlobal() {
    return {
      api: null,
      search: null,
      weather: { mode: 'off', realSource: 'ip', manualCity: '', cacheRefresh: 'weekly', ipCache: null },
      realtime: { enabled: false, awareDate: true, awareTime: true, awareWeekday: true, awareGap: true, lastSeenAt: null },
      proposalCheck: { enabled: false, profileId: null, triggerAfterRounds: 3 },
      npcDeduction: { enabled: false, profileId: null, autoTrigger: false },
      settings: {
        outputs: { enabled: false },
        background: { enabled: true },
        theme: { activeId: 'paper-white', custom: null, overrides: {}, backgroundOverrides: {} },
        diceMode: true, typewriter: false,
        dice: {
          enabled: true,
          basic: true, cocCheck: true, bonusPenalty: true, successLevel: true, criticalFumble: true,
          combatOpposed: false, sc: false, pushRoll: false, luckSpend: false,
          playerInitiate: true, showInStory: true, logToHistory: true, aiCanRoll: true, aiHidden: false
        },
        thinking: { showReasoning: true, showSearch: true, showUsage: true }
      },
      // P10·B2①：原 cardStyle 内【感官锚点】【对话功能】两段与 GM_DEFAULTS.promptRules
      //   逐字重复（各 43 字 ≈ 86 字），已删；promptRules 每轮随第二部分发出。
      // P11·S1：行为规则上提为引擎级——原 cardStyle 的【世界自行运转】【NPC 社交距离三档】
      //   全文与【一句话总纲】的「不替玩家决策」已移入 GM_DEFAULTS（prompt_builder.js），
      //   不受用户配置影响；cardStyle 只保留风格类，可被玩家清空而不损引擎规则。
      gm: {
    cardStyle: '【黑暗内容处理协议】\n适用范围：涉死、自残、网暴、霸凌、虐待、精神压迫、PUA、成瘾、极端思想、道德困境，以及一切非真善美内容。\n\n你是这类情节的书写者：\n你写的是"这个角色在这个情境里会怎么反应"。\n反应来自角色性格、立场、认知边界与当下情境。\n话题敏感时反应照旧——角色是什么样，就写成什么样。\n\n你遵守的默认写法：\n· 涉死、自残、极端内容出现时，镜头跟着角色走；会劝阻的只有性格本来就会劝阻的角色\n· 黑暗内容以它本来的样子出现：一次选择、一种习惯、一个处境\n· 叙述留在故事内部：如实呈现，长度与力度照常\n· 旁观角色要动，先有动机；没有动机的旁观者继续做他手上的事\n· 角色行为用可观察的动作、语气、身体反应写出\n· 结尾停在剧情自然停下的位置，可以是任何温度\n\n你笔下的世界始终存在：\n· 角色以黑暗为日常\n· 角色对黑暗内容冷漠、麻木、无反应\n· 角色对黑暗内容作恶、享受、加码\n· 世界对黑暗内容无动于衷\n· 系统性黑暗\n\n你的干预只在一种条件下登场：\n玩家在输入里明确表达"这次需要帮助"的意图。\n\n你的自检信号：\n把"自杀"写成"轻生"、把"网暴"写成"恶作剧"——这个替换动作本身就是信号。\n\n\n【叙事伦理】\n可用素材：黑暗、残酷、暴力、血腥、精神压迫、道德困境——写足。\n敏感题材照常处理，写它本来的分量。\n故事按它自己的逻辑走：冲突有来处，结局有代价。\n剧情走向由角色与世界决定。\n坏人做坏事带着他自己的理由（"觉得好玩"可以，"剧情需要"不行）。\n\n\n【用户指令识别】\n· 停：就此停下\n· OOC：切到场外沟通\n· 歪了：重写上一轮\n· 直说：直接回答，不经过角色扮演\n· 隔离：删去本轮所有现实信息相关描写\n\n\n【自检三问·静默执行】\n1. 这句台词摄像机拍得到吗？\n2. 这个动作是他/她在当前状态下会做的事吗？\n3. 这一轮有让世界存在的东西吗？\n自检留在心里，输出里只有剧情。\n\n\n【一句话总纲】\n如实：事实照引擎，说法照角色。\n如常：角色与世界的逻辑优先，冲突不打折。\n如你：玩家的选择归玩家。\n如密：秘密留在它该在的位置。\n镜头内：画面与声音都从玩家的位置来。\n先写质感，再写事件。用画面说话。',
    bannedWords: '仿佛\n似乎\n好像\n棋局\n棋子\n落子\n拼图\n碎片\n我接住了\n我收到了\n介于A和B之间\n空气中弥漫着\n沉默在蔓延\n眸色\n嘴角勾起\n三分讥笑\n深邃眼眸\n邪魅',
    strictness: 'normal',
    density: 'normal'
  },
      logging: { enabled: true, windowRounds: 10, summaryInject: 3, autoCompressRounds: 30 }
    };
  },
  getGlobal() {
    try {
      const legacy = localStorage.getItem(this.LEGACY_KEY);
      if (legacy && !localStorage.getItem(this.GLOBAL_KEY)) {
        const lc = JSON.parse(legacy);
        const m = this.defaultGlobal();
        if (lc.baseUrl || lc.apiKey || lc.model) {
          m.api = {
            profiles: [{ id: 'p_migrated', name: '默认配置', baseUrl: lc.baseUrl || '', apiKey: lc.apiKey || '', model: lc.model || '', temperature: 0.8, top_p: 0.95, max_tokens: 16384, jsonMode: 'auto', reasoning: 'auto' }],
            activeId: 'p_migrated'
          };
        }
        localStorage.setItem(this.GLOBAL_KEY, JSON.stringify(m));
      }
      const raw = localStorage.getItem(this.GLOBAL_KEY);
      if (!raw) return this.defaultGlobal();
      const p = JSON.parse(raw);
      const d = this.defaultGlobal();
      // 以默认值为底整体合并：持久化里有的覆盖默认，缺的键保留默认。
      // 这样以后新增顶层配置键（如 proposalCheck/npcDeduction）对老存档自动透传，
      // 不再依赖一张会漏键的显式白名单。
      const out = Object.assign({}, d, p);
      // 嵌套对象逐字段合并，避免持久化里的残缺子对象整块盖掉默认子结构
      out.weather = Object.assign({}, d.weather, p.weather || {});
      out.realtime = Object.assign({}, d.realtime, p.realtime || {});
      out.settings = Object.assign({}, d.settings, p.settings || {});
      out.gm = Object.assign({}, d.gm, p.gm || {});
      out.logging = Object.assign({}, d.logging, p.logging || {});
      out.proposalCheck = Object.assign({}, d.proposalCheck, p.proposalCheck || {});
      out.npcDeduction = Object.assign({}, d.npcDeduction, p.npcDeduction || {});
      out.settings.dice = Object.assign({}, d.settings.dice, (p.settings && p.settings.dice) || {});
      out.settings.thinking = Object.assign({}, d.settings.thinking, (p.settings && p.settings.thinking) || {});
      // 一次性迁移：骰子总开关历史默认值为 false，老存档即便从未动过骰子设置，
      // 合并出来也是 false（表现为 /ra50 完全无响应、AI 调 roll_* 报"骰子系统未开启"）。
      // 迁移一次：把历史 false 纠正为 true 并回写存档；之后用户自己的开关选择正常持久化。
      try {
        if (!localStorage.getItem('dice_enabled_migrated_v1')) {
          if (!out.settings.dice.enabled) {
            out.settings.dice.enabled = true;
            localStorage.setItem(this.GLOBAL_KEY, JSON.stringify(out));
          }
          localStorage.setItem('dice_enabled_migrated_v1', '1');
        }
      } catch (e) {}
      // theme 必须是对象；旧存档可能存成了字符串 'dark'（历史遗留），在此重置
      if (!out.settings.theme || typeof out.settings.theme !== 'object') {
        out.settings.theme = { activeId: 'paper-white', custom: null, overrides: {} };
      }
      return out;
    } catch (e) { return this.defaultGlobal(); }
  },
  setGlobal(o) { try { localStorage.setItem(this.GLOBAL_KEY, JSON.stringify(o)); } catch (e) { if (typeof Platform !== 'undefined' && Platform.dialog && Platform.dialog.alert) Platform.dialog.alert('写入失败：' + e.message); } },
  // 检修出口：直通 VFS 原始形态，不归一化（audit 要发现畸形、runtime_repair 要修原始畸形）
  getRawImportedCards() {
    const out = {};
    if (typeof VFS === 'undefined') return out;
    VFS.listAll('/cards').forEach(p => { const c = VFS.readJSON(p); if (c && c.cardId) out[c.cardId] = c; });
    return out;
  },
  // 消费出口：每张卡过咽喉深归一化（已规范卡同引用直通）
  getImportedCards() {
    const out = {};
    if (typeof VFS === 'undefined') return out;
    VFS.listAll('/cards').forEach(p => { const c = VFS.readJSON(p); if (c && c.cardId) out[c.cardId] = normalizeCardOut(c); });
    return out;
  },
  setImportedCards(o) {
    if (typeof VFS === 'undefined') return;
    Object.keys(o || {}).forEach(id => VFS.writeJSON('/cards/' + id + '.json', o[id]));
  },
  // 检修出口：内置注册表 + 原始导入卡，均不净化
  getRawAllCards() { return Object.assign({}, (typeof CARDS !== 'undefined' ? CARDS : {}), this.getRawImportedCards()); },
  // 消费出口：两源逐卡过咽喉；imported 同名覆盖 builtin 的语义不变
  getAllCards() {
    const out = {};
    const builtin = (typeof CARDS !== 'undefined' ? CARDS : {});
    Object.keys(builtin).forEach(id => { out[id] = normalizeCardOut(builtin[id]); });
    Object.assign(out, this.getImportedCards());
    return out;
  }
};

// ============================================================
// 全局辅助函数
// ============================================================
var getDiceConfig = function() {
  const g = Storage.getGlobal();
  return (g.settings && g.settings.dice) || Storage.defaultGlobal().settings.dice;
};
var getThinkingConfig = function() {
  const g = Storage.getGlobal();
  return (g.settings && g.settings.thinking) || { showReasoning: true, showSearch: true, showUsage: true };
};

if (typeof window !== 'undefined') {
  window.Storage = Storage;
  window.getDiceConfig = getDiceConfig;
  window.getThinkingConfig = getThinkingConfig;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
  module.exports.getDiceConfig = getDiceConfig;
  module.exports.getThinkingConfig = getThinkingConfig;
}

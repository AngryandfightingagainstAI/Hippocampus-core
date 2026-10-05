// ============================================================
// 战役 4 · 批次 4-5a：设置页数据模型（A 类，零 React/RN/DOM）
// RN 独有。数据链与 Electron 同源：Storage.getGlobal()/setGlobal
// （engine/core/storage.js 双仓共享，4-4 polyfill 下 RN 直可用）。
// 本文件只做「读 → 本地态 → 一次写」的纯逻辑封装，供 B 类 tab
// 组件消费；Node（tools/settings_smoke.js）可直测。
//
// grounding：
//   - tab 清单 10 项 = index.html L864-875 左菜单（01-10）逐字
//   - dice 15 键默认 = ui_dice_settings.js defaults()（L8-25）
//   - general 读侧缺省语义 = renderGeneralInto L240-242
//     （endings 缺省启用 `!==false`；storyNodes/outputs 缺省关闭 `===true`）
//   - general 保存语义 = saveGeneral L418-459（一次 setGlobal 全写）
//   - gm 保存语义 = saveGm L509-522
//   - density 五档 / strictness 三档 = renderGmInto L495-499 / L283-287
// Weather/Realtime 不在此封装：数据层是 engine/weather.js、
// engine/realtime.js 模块 API（RN 仓已有，bootstrap 已挂载），tab 组件直调。
// ============================================================

'use strict';

var Storage = require('../engine/core/storage.js');

// ------------------------------------------------------------
// tab 清单（对齐 Electron 左菜单 01-10；desc 逐字取自 index.html）
// ------------------------------------------------------------
var SETTINGS_TABS = [
  { id: 'api', num: '01', title: 'AI 配置', desc: 'profiles · 温度 · JSON Mode' },
  { id: 'search', num: '02', title: '联网搜索', desc: '博查 / Tavily / Serper' },
  { id: 'general', num: '03', title: '通用', desc: '书票 · 字号 · 输出' },
  { id: 'dice', num: '04', title: '骰子规则', desc: 'CoC 检定 · 奖惩骰 · 对抗' },
  { id: 'weather', num: '05', title: '天气', desc: '真实源 / 手动城市' },
  { id: 'realtime', num: '06', title: '现实感知', desc: '日期 · 时段 · 星期同步' },
  { id: 'editor', num: '07', title: '数值编辑器', desc: '面板 / HUD / 侧栏' },
  { id: 'worldbook', num: '08', title: '世界书', desc: '12 个编辑器' },
  { id: 'data', num: '09', title: '数据与备份', desc: '导入导出 · VFS 体检' },
  { id: 'gm', num: '10', title: 'GM 面板', desc: 'GM 默认提示词' }
];

// P10·C1：原 PLACEHOLDER_TABS 占位清单已删除（死导出：产品零引用，仅 3 处 smoke
//   断言读它）。历史沿革：search 于 P2·S1 实装（engine/web_search.js + SearchTab.js）；
//   editor 于 P2·S2 实装（engine/num_editor.js + templates/ + NumEditorTab.js）；
//   worldbook 于 P2+P3 轮实装（engine/wb_common.js + engine/wb/*.js 12 个 +
//     WorldBookTab.js + worldbook/*Editor.js 12 个）；data 于 P1-A 实装（原判
//     「依赖 Electron 独有能力」系误判：桌面该链是 Blob+URL.createObjectURL+<a download>
//     +FileReader+三个 window.* 全局，Electron 对话框命中 0；RN 重写的只是
//     「文件落盘/取回」）。全部实装后清单恒为空，空清单无守护价值 ⇒ 连同导出删除。

// ------------------------------------------------------------
// 骰子规则（ui_dice_settings.js 逐键对齐）
// ------------------------------------------------------------
var DICE_DEFAULTS = {
  enabled: true,
  basic: true,
  cocCheck: true,
  bonusPenalty: true,
  successLevel: true,
  criticalFumble: true,
  combatOpposed: false,
  sc: false,
  pushRoll: false,
  luckSpend: false,
  playerInitiate: true,
  showInStory: true,
  logToHistory: true,
  aiCanRoll: true,
  aiHidden: false
};

// 功能细项 9 + 行为 5（key/label/desc = render() checkbox 参数逐字）
var DICE_FEATURE_FIELDS = [
  { key: 'basic', label: '基础骰', desc: '支持 1d100 / 3d6+2 这种通用表达式' },
  { key: 'cocCheck', label: 'CoC 检定', desc: '支持 ra50 / ra侦查70，AI 可发起对目标值检定' },
  { key: 'bonusPenalty', label: '奖励骰 / 惩罚骰', desc: '1d100b1 / 1d100p1，跑团常用' },
  { key: 'successLevel', label: '成功等级', desc: '区分普通成功 / 困难成功 / 极难成功' },
  { key: 'criticalFumble', label: '大成功 / 大失败', desc: '掷出 1 为大成功，100（或 96+）为大失败' },
  { key: 'combatOpposed', label: '战斗对抗骰', desc: '双方各掷一次，比较成功等级。默认关，工具始终可用，只是 AI 不主动推荐' },
  { key: 'sc', label: 'SC 理智检定', desc: '对 SAN 值检定，成功/失败扣不同理智' },
  { key: 'pushRoll', label: '孤注一掷', desc: '检定失败后重掷一次，但大失败范围扩大' },
  { key: 'luckSpend', label: '幸运消耗', desc: '花 1 点幸运将骰值调整 1 点' }
];
var DICE_BEHAVIOR_FIELDS = [
  { key: 'playerInitiate', label: '玩家可主动掷骰', desc: '输入框打 /ra50 或 /1d100 直接掷' },
  { key: 'showInStory', label: '骰子结果显示在剧情里', desc: '显示成灰色小字，不打断叙事' },
  { key: 'logToHistory', label: '骰子结果进日志', desc: '后续 AI 能参考' },
  { key: 'aiCanRoll', label: 'AI 可以主动掷骰', desc: '战斗 / 随机事件 / 检定场景' },
  { key: 'aiHidden', label: 'AI 隐藏掷骰', desc: 'GM 内心掷，玩家看不到结果' }
];

// ------------------------------------------------------------
// GM 面板常量
// ------------------------------------------------------------
var DENSITY_STEPS = [
  { value: 'minimal', label: '极简' },
  { value: 'compact', label: '精简' },
  { value: 'normal', label: '标准' },
  { value: 'rich', label: '丰富' },
  { value: 'verbose', label: '极繁' }
];
var STRICTNESS_OPTIONS = [
  { value: 'soft', label: '温和', desc: 'AI 自己判断什么时候掷骰' },
  { value: 'normal', label: '标准', desc: '关键行动必须掷骰，推荐' },
  { value: 'hard', label: '硬核', desc: '所有不确定行动都必须掷骰，失败后果如实写' }
];

// ------------------------------------------------------------
// 通用读写
// ------------------------------------------------------------
function readGlobal() {
  return Storage.getGlobal();
}

// 读 → mutate → 一次写（同 Electron 各 save* 的整对象写回语义）
function updateGlobal(mutator) {
  var g = Storage.getGlobal();
  mutator(g);
  Storage.setGlobal(g);
  return g;
}

// ------------------------------------------------------------
// 骰子规则读写（对齐 UI_DiceSettings.getConfig/save）
// ------------------------------------------------------------
function getDiceConfig() {
  var g = Storage.getGlobal();
  var cur = (g.settings && g.settings.dice) || {};
  var out = {};
  Object.keys(DICE_DEFAULTS).forEach(function (k) {
    out[k] = cur[k] !== undefined ? cur[k] : DICE_DEFAULTS[k];
  });
  return out;
}

function saveDiceConfig(cfg) {
  updateGlobal(function (g) {
    g.settings = g.settings || {};
    g.settings.dice = cfg;
  });
}

// ------------------------------------------------------------
// 通用 tab 读写（对齐 renderGeneralInto 读侧 + saveGeneral 写侧）
// 本地态形态：
// {
//   logging: { enabled, windowRounds, summaryInject },
//   thinking: { showReasoning, showSearch, showUsage },
//   endingsEnabled, nodesEnabled, outputsEnabled, backgroundEnabled: bool,
//   strictness: 'soft'|'normal'|'hard',
//   proposalCheck: { enabled, profileId, triggerAfterRounds },
//   npcDeduction: { enabled, profileId, autoTrigger }
// }
// ------------------------------------------------------------
function loadGeneralState() {
  var g = Storage.getGlobal();
  var lg = g.logging || {};
  var s = g.settings || {};
  var pc = g.proposalCheck || {};
  var nd = g.npcDeduction || {};
  var th = (s && s.thinking) || { showReasoning: true, showSearch: true, showUsage: true };
  return {
    logging: {
      enabled: lg.enabled !== false,
      windowRounds: lg.windowRounds || 10,
      summaryInject: lg.summaryInject || 3
    },
    thinking: {
      showReasoning: !!th.showReasoning,
      showSearch: !!th.showSearch,
      showUsage: !!th.showUsage
    },
    // 读侧缺省语义（renderGeneralInto L240-242 逐字）
    endingsEnabled: !(s.endings && s.endings.enabled === false),
    nodesEnabled: !!(s.storyNodes && s.storyNodes.enabled === true),
    outputsEnabled: !!(s.outputs && s.outputs.enabled === true),
    backgroundEnabled: !(s.background && s.background.enabled === false),
    strictness: (g.gm && g.gm.strictness) || 'normal',
    proposalCheck: {
      enabled: !!pc.enabled,
      profileId: pc.profileId || null,
      triggerAfterRounds: pc.triggerAfterRounds || 3
    },
    npcDeduction: {
      enabled: !!nd.enabled,
      profileId: nd.profileId || null,
      autoTrigger: !!nd.autoTrigger
    }
  };
}

// 一次写全（saveGeneral L418-459 逐字段对齐）
function saveGeneralState(st) {
  updateGlobal(function (g) {
    g.logging = g.logging || {};
    g.logging.enabled = !!st.logging.enabled;
    g.logging.windowRounds = parseInt(st.logging.windowRounds, 10) || 10;
    g.logging.summaryInject = parseInt(st.logging.summaryInject, 10) || 3;
    g.settings = g.settings || {};
    g.settings.thinking = {
      showReasoning: !!st.thinking.showReasoning,
      showSearch: !!st.thinking.showSearch,
      showUsage: !!st.thinking.showUsage
    };
    g.settings.endings = { enabled: !!st.endingsEnabled };
    g.settings.storyNodes = { enabled: !!st.nodesEnabled };
    g.settings.outputs = { enabled: !!st.outputsEnabled };
    g.settings.background = { enabled: !!(st.backgroundEnabled !== false) };
    g.gm = g.gm || {};
    g.gm.strictness = st.strictness;
    g.proposalCheck = g.proposalCheck || {};
    g.proposalCheck.enabled = !!st.proposalCheck.enabled;
    g.proposalCheck.profileId = st.proposalCheck.profileId || null;
    g.proposalCheck.triggerAfterRounds = parseInt(st.proposalCheck.triggerAfterRounds, 10) || 3;
    g.npcDeduction = g.npcDeduction || {};
    g.npcDeduction.enabled = !!st.npcDeduction.enabled;
    g.npcDeduction.profileId = st.npcDeduction.profileId || null;
    g.npcDeduction.autoTrigger = !!st.npcDeduction.autoTrigger;
  });
}

// ------------------------------------------------------------
// GM 面板读写（对齐 renderGmInto / saveGm）
// ------------------------------------------------------------
function loadGmState() {
  var g = Storage.getGlobal();
  var gm = g.gm || {};
  return {
    cardStyle: gm.cardStyle || '',
    bannedWords: gm.bannedWords || '',
    density: gm.density || 'normal'
  };
}

function saveGmState(st) {
  updateGlobal(function (g) {
    g.gm.cardStyle = st.cardStyle;
    g.gm.bannedWords = st.bannedWords;
    var idx = DENSITY_STEPS.map(function (d) { return d.value; }).indexOf(st.density);
    if (idx >= 0) g.gm.density = DENSITY_STEPS[idx].value;
  });
}

// ------------------------------------------------------------
// ApiTab 支撑（grounding：ui_settings.js _getModelsForBaseUrl L75-91
// 逻辑同构下沉到 A 类，ApiTab 组件调用，Node 可测）
// baseUrl 去尾斜杠匹配 PRESETS 中同地址预设的 models；无匹配则全部
// PRESETS 的 models 去重合并。
// ------------------------------------------------------------
function getModelsForBaseUrl(baseUrl) {
  var ApiManager = require('../engine/api_manager.js');
  var u = String(baseUrl || '').trim().replace(/\/+$/, '');
  var matched = null;
  ApiManager.PRESETS.forEach(function (p) {
    if (!p.models || !p.models.length) return;
    var pu = String(p.baseUrl || '').trim().replace(/\/+$/, '');
    if (pu && u && pu === u) matched = p;
  });
  if (matched) return matched.models.slice();
  var seen = {}, out = [];
  ApiManager.PRESETS.forEach(function (p) {
    (p.models || []).forEach(function (m) {
      if (m && !seen[m]) { seen[m] = 1; out.push(m); }
    });
  });
  return out;
}

// ------------------------------------------------------------
// P1-A：导入单存档（纯逻辑，Node 可测）
// 逻辑逐字对齐桌面 ui_cards.js:254-331 pickAndImportSave：
//   校验 format/cardId/files/saveId → 卡带须已存在 → 新 saveId
//   重写 /saves/{cardId}/{saveId}/ 前缀 → 逐文件 VFS.writeFile →
//   meta.json 改 saveId/importedAt（缺则补建）→ 成功 toast 在外层。
// 返回 { ok, saveId, written, reason? }，不弹 toast、不碰 UI。
// ------------------------------------------------------------
function importSaveFromJson(data) {
  var VFS = require('../vfs/vfs.js');
  if (!data || data.format !== 'ai_tg_save' || !data.cardId || !data.files) {
    return { ok: false, reason: '这不是本引擎导出的存档文件（缺少 format / cardId / files）' };
  }
  if (!data.saveId) return { ok: false, reason: '存档缺少 saveId 字段' };

  var cards = Storage.getAllCards();
  if (!cards[data.cardId]) {
    return { ok: false, reason: '这个存档对应的卡带不存在：' + data.cardId + '\n\n请先导入卡带（卡带 JSON），再来导入这份存档。' };
  }

  var newSaveId = 'save_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  var oldPrefix = '/saves/' + data.cardId + '/' + data.saveId + '/';
  var newPrefix = '/saves/' + data.cardId + '/' + newSaveId + '/';

  var written = 0;
  Object.keys(data.files).forEach(function (oldPath) {
    var newPath;
    if (oldPath.indexOf(oldPrefix) === 0) {
      newPath = newPrefix + oldPath.slice(oldPrefix.length);
    } else {
      var parts = oldPath.split('/');
      if (parts.length >= 4 && parts[1] === 'saves' && parts[2] === data.cardId && parts[3] === data.saveId) {
        parts[3] = newSaveId;
        newPath = parts.join('/');
      } else {
        return;
      }
    }
    VFS.writeFile(newPath, data.files[oldPath]);
    written++;
  });

  if (written === 0) return { ok: false, reason: '没有写入任何文件，可能路径格式不对' };

  var metaPath = newPrefix + 'meta.json';
  var meta = VFS.readJSON(metaPath);
  if (meta) {
    meta.saveId = newSaveId;
    meta.importedAt = new Date().toISOString();
    VFS.writeJSON(metaPath, meta);
  } else {
    VFS.writeJSON(metaPath, {
      saveId: newSaveId,
      cardId: data.cardId,
      cardName: (cards[data.cardId].cardName || data.cardId),
      displayName: '导入的存档 ' + new Date().toLocaleString(),
      createdAt: new Date().toISOString(),
      lastPlayedAt: new Date().toISOString(),
      playTime: 0,
      playerName: ''
    });
  }

  return { ok: true, saveId: newSaveId, written: written };
}

module.exports = {
  SETTINGS_TABS: SETTINGS_TABS,
  DICE_DEFAULTS: DICE_DEFAULTS,
  DICE_FEATURE_FIELDS: DICE_FEATURE_FIELDS,
  DICE_BEHAVIOR_FIELDS: DICE_BEHAVIOR_FIELDS,
  DENSITY_STEPS: DENSITY_STEPS,
  STRICTNESS_OPTIONS: STRICTNESS_OPTIONS,
  readGlobal: readGlobal,
  updateGlobal: updateGlobal,
  getDiceConfig: getDiceConfig,
  saveDiceConfig: saveDiceConfig,
  loadGeneralState: loadGeneralState,
  saveGeneralState: saveGeneralState,
  loadGmState: loadGmState,
  saveGmState: saveGmState,
  getModelsForBaseUrl: getModelsForBaseUrl,
  importSaveFromJson: importSaveFromJson
};

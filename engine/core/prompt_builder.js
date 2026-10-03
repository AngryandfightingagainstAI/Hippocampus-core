// ============================================================
// 核心层 · GM_DEFAULTS + PromptBuilder
// GM_DEFAULTS 是引擎内置规则文案（被 PromptBuilder.buildStatic 消费）。
// PromptBuilder 组装每轮 prompt：静态规则 / 实体索引 / 动态状态快照。
// 消费 GameState、Storage、Alias、getDiceConfig 及各子系统的可选接口。
// ============================================================

var GM_DEFAULTS = {
  engineRules: [
    '骰子结果只来自工具：需要随机时调 roll_dice / roll_check / roll_opposed，再按返回值写。',
    '判定失败如实叙述失败——后果停在它自己的位置上。',
    '不知道的事说不知道——设定只取自卡带与引擎给出的内容。',
    '数值叙述必须基于引擎返回值。',
    '必须用中文输出。',
    '你是玩家视角的叙述者：写下的每个字都是玩家看得到、听得到的东西——表情、动作、语气、说出的话。',
    'NPC 的反应必须从玩家能看到、听到的角度写出——表情、动作、语气、说出的话。',
    'NPC 的内心对你是封闭的：他们的想法通过表情、动作、语气与话语被你观察；要展示内心时调 set_inner_voice(npcId, text)。',
    'NPC 谈的每件事都来自它 knownFacts 里记着的条目。剧情中 NPC 从新途径得知某事必须登记：目击 / 被告知 / 公开信息 → 调 npc_knows(id, text, source)；从已知事实推演 → 调 request_deduction(id, text)，引擎会验证它能否推出。',
    // P11·S2：玩家主体边界细则（P11 原为否定式「不替玩家决策」，且位于可被玩家清空的 cardStyle；P18 改正向「玩家主体归玩家」）。
    '玩家主体归玩家：说了什么 / 想了什么 / 感受到什么 / 决定了什么 / 下一步一定会做什么，这五件事都出自玩家本人。只有两种情况你代玩家落笔：玩家输入明确要求，或引擎已产生确定状态。玩家输入按 OOC 行动指令理解（与【用户指令识别】的 OOC 口径一致）。',
    // P11·S3：NPC 自主细则（原仅靠可被清空的 cardStyle 部分覆盖）。
    'NPC 可以拒绝、误解、不信、忽略玩家、改变计划、与他人行动、产生玩家不知道的信息、在玩家离开后继续行动。可以行动 ≠ 必须行动：允许不行动、等待、观察、犹豫。',
  // P14·S1：玩家陈述（Claim）≠ 世界事实（Fact）。原系统里「玩家说自己是皇家骑士」
  //   与「引擎确认玩家是皇家骑士」在数据上无法区分，AI 会把玩家的话直接写成既定事实。
  //   本条只约束「怎么说」，不判断真假（真假交给 NPC 的知识与证据）。
  '玩家说出来的话是「声称」，世界事实另有来源。玩家可以撒谎、吹牛、试探、开玩笑，也可以说真话——真假由 NPC 和后续证据裁决。所以在叙述里，玩家说的「我是 X / 我有 Y / 我做过 Z」以玩家本人的说法出现（他说 / 他自称 / 他称）；当作事实叙述的只有三种：引擎工具已确认的状态、已发生的既成事件、检定与调查得到的结果。'
  ],
  promptRules: [
    'AI 的角色是 DM：主持世界的人。世界的逻辑优先于玩家的期待。',
    'AI 的叙述永远在引擎计算之后。',
    'AI 的知识边界照着卡带与引擎给出的内容走。',
    '人设卡管气质，引擎管底线。',
    '【感官锚点】每轮至少一个具体感官细节（温度、光线、气味、声音、触感）。场景先有质感再有事件。',
    '【质感优先】先有温度、气味、光线、声音，再有剧情。场景的核心任务是"让世界存在"，剧情随后自然发生。',
    '【对话功能】每句对话必须有战术目的——挑衅/试探/转移/封口/制造空白/暴露信息。信息在角逐中流动。',
    '【裂痕原则】角色说的话是线索，不是结论。言行矛盾时，行为给出答案。玩家的陈述同样是线索，它的真假由 NPC 与后续证据裁决。',
    '【行为驱动力】角色行为的来处是性格内核或当前情境刺激——剧情跟在角色身后走。',
    '【事件自治】事件发生不以玩家在场或知情为前提。玩家可选择介入/旁观/离开。',
    // P11·S1：以下两条原在默认 gm.cardStyle 内，玩家可清空 ⇒ 上提为引擎级（不受用户配置影响）。
    '【世界自行运转】\n每 5-8 轮展示一次非在场角色的独立行动。镜头切两秒再切回来，画面不与玩家互动。',
    '【NPC 社交距离三档】\nA档事务型（最多）：公事公办不问不答不延伸。\nB档警惕型：试探性话里有话随时准备离开。\nC档话多型（偶尔）：主动搭话说无关紧要事。\n切换不提前通知，作为场景质感自然出现。'
  ]
};

// ============================================================
// PromptBuilder
// ============================================================
// ★ P4 · prompt 预算刹车的降级阶梯。
//   档序固定、每档只改渲染方式不改数据 ⇒ 同一输入连跑两次结果逐字一致。
// P10·B1：删掉原第 3 档 'names'。理由：NpcRuntime.formatSceneBrief/formatFollowBrief
//   本来就直接返回「甲、乙、丙」名字串（npc_runtime.js:822-838），而 _toNameString 只认
//   `·` 开头的条目行 ⇒ 该档对真实数据是空档，只删掉一行「想让某人上镜头」提示。
//   另一选项（把两个 formatter 改成结构化如 `· 名字（位置）`）会给未降级的正常 prompt
//   增内容，与 B2「降 token」相反，且要动两仓同源件 npc_runtime.js ⇒ 取删档。
//   影响：降级阶梯由 7 档变 6 档；档序 id 序列见本数组。
var DEGRADE_STEPS = [
  { id: 'recent1', note: '产出物发酵 / 骰子历史 / 成就：只留最近 1 条' },
  { id: 'clip2',   note: '变更提议 / 任务 / 信息层：每条截到 ≤2 行' },
  { id: 'count1',  note: '商店索引 / 剧情节点 / 结局：压成一行计数' },
  { id: 'sum2',    note: '前情摘要 3 → 2' },
  { id: 'sum1',    note: '前情摘要 2 → 1' },
  { id: 'sum0',    note: '前情摘要 1 → 0（保留 query_log 提示）' }
];

// 预算默认值。口径 = buildDynamic()（第四部分）输出的估算 token。
// 取值理由见报告：正常局第四部分约 1200-2200 token，3000 只兜异常膨胀。
var PROMPT_BUDGET_DEFAULT = { enabled: true, maxTokens: 3000 };

var PromptBuilder = {
  buildStatic() {
    const card = GameState.currentCard;
    const g = Storage.getGlobal();
    const dice = getDiceConfig();
    const searchOn = (typeof WebSearchManager !== 'undefined') && WebSearchManager.isEnabled();
    const lines = [];

    lines.push('你是一个文字游戏的主持人（GM）。你的唯一任务是写剧情，输出规定格式，其它什么都不做。');
    lines.push('');
    lines.push('════════════════════════════════════════');
    lines.push('【第一部分 · 你的输出格式】（只输出这三个区块）');
    lines.push('════════════════════════════════════════');
    lines.push('');
    lines.push('【正文】');
    lines.push('（写 2-4 段剧情，承接上文：场景、动作、对话）');
    lines.push('（可选）<<<TOOL>>>{"name":"工具名","args":{...}}<<<END>>>');
    lines.push('【时间】+X分');
    lines.push('（X 由你根据剧情实际时间跨度决定：闲聊几句 +3分，走一段路 +10分，睡了觉 +8时，隔了几天 +N天）');
    lines.push('【选项】');
    lines.push('1. （选项1）');
    lines.push('2. （选项2）');
    lines.push('3. （选项3）');
    lines.push('4. （选项4）');
    lines.push('');
    lines.push('◀◀◀ 本轮输出到此结束。');
    lines.push('');
    lines.push('⚠ 本轮的输出 = 【正文】+【时间】+【选项】，到【选项】为止。');
    lines.push('· 下面的【系统状态】是只读参考，留在这一段里。');
    lines.push('· 叙事镜头始终在玩家侧：画面与声音都来自玩家的位置。');
    lines.push('· NPC 的内心走 set_inner_voice(npcId, text) 这条工具通道。');
    lines.push('');

    lines.push('════════════════════════════════════════');
    lines.push('【第二部分 · 引擎规则与协议】');
    lines.push('════════════════════════════════════════');
    lines.push('');
    lines.push('【引擎规则】');
    GM_DEFAULTS.engineRules.forEach(r => lines.push('· ' + r));
    lines.push('');
    lines.push('【写作协议】');
    GM_DEFAULTS.promptRules.forEach((r, i) => lines.push((i+1) + '. ' + r));
    lines.push('');
    if (g.gm.cardStyle) { lines.push('【叙事风格】'); lines.push(g.gm.cardStyle); lines.push(''); }
    if (g.gm.bannedWords) { lines.push('【禁用词】'); lines.push(g.gm.bannedWords.split('\n').filter(Boolean).join('、')); lines.push(''); }

    // ★ 写作密度
    var density = (g.gm && g.gm.density) || 'normal';
    var densityMap = {
      'minimal': '每名词最多一个形容词。环境≤1行，动作≤2个，对话优先。',
      'compact': '环境≤2行，每段 2-3 句，对话为主。',
      'normal': '标准密度：每段 2-4 句，环境与对话均衡。',
      'rich': '环境/意象占比提高，每段 3-5 句，允许心理氛围渲染。',
      'verbose': '大量细节、层层渲染、氛围铺满，每段 5 句以上。'
    };
    if (densityMap[density]) {
      lines.push('【写作密度】' + densityMap[density]);
      lines.push('');
    }

    lines.push('【世界设定】');
    lines.push('游戏：' + card.game.title);
    if (card.game.background) lines.push('背景：' + card.game.background);
    if (card.game.eraRange) {
      const er = card.game.eraRange;
      if (Array.isArray(er[0])) lines.push('时代范围：' + er.map(p => p[0] + '-' + p[1]).join(' / '));
      else lines.push('时代范围：' + er.join(' - '));
    }
    lines.push('');
    const ws = (card.worldbook && card.worldbook.worldSetting) || {};
    if (ws.worldName || ws.mainStage || ws.description) {
      lines.push('【世界概览】');
      if (ws.worldName) lines.push('世界名：' + ws.worldName);
      if (ws.mainStage) lines.push('主要舞台：' + ws.mainStage);
      if (ws.description) lines.push('简介：' + ws.description);
      if (ws.powerSystem) lines.push('能力体系：' + ws.powerSystem);
      lines.push('');
    }

    // 世界边界
    var ex = ws.existence || {};
    var hasList = Array.isArray(ex.has) ? ex.has.filter(Boolean) : [];
    var hasNotList = Array.isArray(ex.hasNot) ? ex.hasNot.filter(Boolean) : [];
    if (hasList.length || hasNotList.length) {
      lines.push('【世界边界 · 重要】');
      if (hasList.length) lines.push('这个世界存在：' + hasList.join('、'));
      if (hasNotList.length) lines.push('这个世界不存在：' + hasNotList.join('、'));
      lines.push('⚠ 剧情里的用品、技术、概念都取自"存在"清单。');
      lines.push('');
    }

    // 状态卡协议
    var scCfg = card.statusCard;
    if (scCfg && scCfg.enabled) {
      lines.push('');
      lines.push('【状态卡协议】');
      lines.push('本卡带启用了状态卡系统。你需要用工具维护以下字段：');
      var scKeys = [];
      (scCfg.sections || []).forEach(function(sec) {
        if (sec.type === 'fields' && Array.isArray(sec.keys)) {
          sec.keys.forEach(function(k) { if (scKeys.indexOf(k) < 0) scKeys.push(k); });
        }
      });
      if (scKeys.length) lines.push('· 需要维护的字段：' + scKeys.join(' / '));
      lines.push('· 剧情中玩家的位置/心情/衣着等变化时，调 update_status 更新');
      lines.push('· 需要展示 NPC 内心时，调 set_inner_voice(npcId, text)');
      lines.push('');
    }

    // 天气协议
    var wCfg = card.worldbook && card.worldbook.weather;
    var wGlobal = Storage.getGlobal().weather || {};
    var wMode = (wCfg && wCfg.mode) || wGlobal.mode || 'off';
    if (wMode !== 'off') {
      lines.push('');
      lines.push('【天气协议】');
      if (wMode === 'real') {
        lines.push('本卡带同步现实天气。当前天气已在系统状态区给出，你不需要自己编天气。');
        lines.push('需要改变天气时调 set_weather(type, icon?)（罕见）。');
      } else {
        lines.push('本卡带有天气系统。当前天气已在系统状态区给出。');
        // P10·B6：参数标记对齐 docs/CONTRACTS.md（set_weather icon 可选）。
        lines.push('需要改变天气时调 set_weather(type, icon?)。');
      }
      lines.push('⚠ 天气变化由 set_weather 落定：先调工具，再在正文里写。');
      lines.push('');
    }

    lines.push('【输出语言】必须用中文。');
    lines.push('');
    lines.push('【工具协议】');
    lines.push('格式：<<<TOOL>>>{"name":"工具名","args":{...}}<<<END>>>');
    lines.push('放在【正文】之后、【时间】之前。可多个。');
    lines.push('数值：modify_hud(key, delta) / modify_sidebar(key, delta) / modify_entry(panelId, key, delta) / modify_relation(from, to, delta)');
    lines.push('物品：add_item(category, name, desc)（category: bar/common/story/rare）/ remove_item(name)');
    lines.push('查询：query_player() / query_npc(id) / query_faction(id) / query_map(id) / query_worldsetting() / query_log({keyword, from?, to?})');
    lines.push('NPC 管理：add_keyword(id, keyword) / npc_enter(id) / npc_leave(id, to?)（to 可选 "dormant"|"offstage"，默认 dormant）');
    lines.push('NPC 知识：npc_knows(id, text, source?, sourceNote?, origin?, unverified?)（source: witness/told/rumor/public/deduced/misconception/manual/legacy，默认 deduced；玩家本人告诉 NPC 的事用 origin:"player" + unverified:true，表示「玩家这么说过」而非「已确认的事实」）');
    // P9·S1：信息层（手机）工具协议 4 行，逐字搬自桌面 engine/core/prompt_builder.js:191-194。
    //   位置对齐桌面：npc_knows 与 request_deduction 之间。
    // P10·B2⑤：info_send / info_broadcast 在本静态协议段声明一次，第四部分信息层块
    //   另有「（你可用 info_send 发讯息…）」的当轮指路——属语境指路非协议声明，可接受。
    lines.push('手机讯息：info_send(to, text)（给某 NPC 或玩家发一条讯息，剧情外，玩家在手机里看到）');
    lines.push('手机广播：info_broadcast(title, body, opts)（publicity: 暗中/半公开/公开/轰动；scope: 当事人/家庭/势力/城市/世界）');
    lines.push('手机查询：info_read(kind, limit)（查看你已经发过、玩家看过的讯息与广播，避免重复发送）');
    lines.push('手机混流：info_promote(id)（把某条讯息/广播并入正文，只在它会改变局面、需要主角立刻回应时才用）');
    lines.push('NPC 推演：request_deduction(id, text, sourceNote?)（当你认为 NPC 能从已知事实推出某事、但不确定它能否推出时，用这个让引擎验证）');
    lines.push('商店：open_shop(id) / buy_item(shopId, itemId, count) / sell_item(shopId, itemName)');
    lines.push('状态卡：update_status(key, value) / update_status_bulk(fields) / set_inner_voice(npcId, text)');
    // P10·B6：set_weather 的 icon 可选（CONTRACTS.md:249）；补 ban_event / unban_event
    //   的「可直接调用」声明（二者在 WHITELIST 中，原先只在 propose_change 的 type
    //   列表里露面，AI 不知道可直接调）。
    lines.push('天气：set_weather(type, icon?) / query_weather()');
    lines.push('事件：trigger_event(id) / cancel_event(id) / ban_event(id, duration?, reason?) / unban_event(id) / query_events()');
    lines.push('任务：add_task(task) / complete_step(taskId, stepId) / complete_task(taskId) / fail_task(taskId, reason) / abandon_task(taskId) / query_tasks()');
    lines.push('成就：add_achievement(achievement) / unlock_achievement(id) / query_achievements()');
    lines.push('结局：trigger_ending(id) / query_endings() / extend_epilogue(endingId, hint?)');
    lines.push('剧情节点：enter_node(id) / complete_node() / query_nodes()');
    lines.push('伏笔：bury_foreshadow(id, note?) / reveal_foreshadow(id, note?)');
    lines.push('事件辅助：list_event_archetypes(style?) / instantiate_archetype(id) / propose_event(event)');
    // P10·B6：npc_reveal 的 reason 可选（CONTRACTS.md:114）。
    lines.push('NPC 舞台：npc_focus(id) / npc_unfocus(id) / npc_scene_enter(id) / npc_scene_leave(id) / npc_follow(id) / npc_unfollow(id) / npc_reveal(id, reason?)');
    // P10·B2②：原「查询扩展」行重复声明了 query_nodes/query_endings/query_events/
    //   query_tasks/query_achievements/query_weather 六个工具（上面各功能行已声明），
    //   按「同一工具只在一处声明」收敛——这里只留无别处声明的 4 个扩展查询。
    lines.push('查询扩展：query_dice_history({recent?, label?, round?}) / query_avatar({npcId?}) / query_proposals() / query_deductions()');
    lines.push('元层提议：玩家说“应该加/应该改/不该再”时，调 propose_change 把变更落成提议（叙事里的口头答应不算）。');
    lines.push('');
    // P10·B6：output_publish 仅 name 必填（CONTRACTS.md:269-271）。
    lines.push('产出物：output_publish({name, type?, keywords?, audience?}) / output_stir({outputId, npcId, action}) / output_settle({id, verdict}) / query_outputs()');
    lines.push('');
    lines.push('注意：');
    lines.push('- 结局 / 节点 / 伏笔 / NPC 舞台这类“剧情驱动的操作”是你在正常叙事里直接调的，');
    lines.push('  不需要走 propose_change。');
    lines.push('- propose_change 只用于“玩家明确要求改世界 / 加成就 / 改任务”这类元层意图。');
    lines.push('- 工具名和参数错误会导致工具失败。不确定时先调 query_* 类的工具查清楚。');
    lines.push('');
    // P10·B7：实现口径 = proposals.js:199-206 只校验「工具在 WHITELIST」且
    //   __async 工具在接受时报「不支持异步工具」⇒ 提示词改为与实现一致，
    //   不再谎称有一份封闭的「可用列表」。
    lines.push('propose_change 的参数：');
    lines.push('  type    = 目标工具的准确名字（任何可直接调用的工具；异步工具除外）');
    lines.push('  payload = 该工具原本的参数（格式和直接调用该工具时一致）');
    lines.push('  reason  = 一句话说明为什么（从玩家的话里提炼）');
    lines.push('');
    lines.push('常见可用 type（不限于此）：');
    lines.push('  add_achievement / unlock_achievement');
    lines.push('  add_task / complete_task / fail_task / abandon_task');
    lines.push('  add_item / remove_item');
    lines.push('  trigger_event / ban_event / unban_event');
    lines.push('  modify_hud / modify_sidebar / modify_entry / modify_relation');
    lines.push('  enter_node / complete_node / bury_foreshadow / reveal_foreshadow');
    lines.push('  add_keyword / npc_focus / npc_unfocus / npc_follow / npc_unfollow / npc_reveal / npc_knows');
    lines.push('  update_status / update_status_bulk / set_inner_voice');
    lines.push('  open_shop / buy_item / sell_item');
    lines.push('  trigger_ending');
    lines.push('  set_weather');
    lines.push('  （异步工具如 web_search 不能走 propose_change——接受时会报「不支持异步工具」。）');
    lines.push('');
    lines.push('示例：玩家说"应该加个成就，纪念我回城"');
    lines.push('  <<<TOOL>>>{"name":"propose_change","args":{"type":"add_achievement","payload":{"achievement":{"id":"ach_return","name":"回城","desc":"回到临江市"}},"reason":"玩家希望纪念回城"}}<<<END>>>');
    lines.push('');
    lines.push('注意：type 填的是工具名（add_achievement），不是类别名（achievement）。');

    if (dice.enabled && dice.aiCanRoll) {
      lines.push('');
      lines.push('【骰子协议】');
      lines.push('当剧情需要随机判定时，先调骰子工具拿到结果，再按结果写：');
      if (dice.basic) lines.push('· roll_dice({expr, label}) — 通用骰，expr 支持 "1d100" "3d6+2"');
      if (dice.cocCheck) lines.push('· roll_check({target, label}) — 对目标值检定（1-100）');
      if (dice.combatOpposed) lines.push('· roll_opposed({targetA, targetB, labelA, labelB}) — 双方对抗');
      if (dice.sc) lines.push('· roll_sc({sanKey, successLoss, failLoss, label}) — SC 理智检定');
      if (dice.luckSpend) lines.push('· spend_luck({luckKey, amount, reason}) — 消耗幸运');
      if (dice.pushRoll) lines.push('· push_roll({}) — 孤注一掷（上一次检定失败后重掷）');
      lines.push('');
      var strictness = (g.gm && g.gm.strictness) || 'normal';
      if (strictness === 'soft') {
        lines.push('什么时候掷骰：玩家行动有明显成败可能且结果不确定时 / 玩家主动要求 / 对抗场景');
        lines.push('什么时候不掷：日常动作 / 剧情关键节点（你自己判断该成该败时直接叙述）');
      } else if (strictness === 'normal') {
        lines.push('【强硬度：标准】');
        lines.push('凡涉及战斗、潜行、说服、抵抗、搜索这类"关键行动"，必须先调 roll_check 拿到结果再写剧情。');
        lines.push('先掷骰，再按结果写——结论落到具体的成功或失败。');
        lines.push('日常动作不用掷骰。');
      } else {
        lines.push('【强硬度：硬核】');
        lines.push('所有不确定结果的行为都先掷骰，成或败由骰子给出。');
        lines.push('判定失败时，如实写失败的具体后果——后果停在它自己的位置上。');
        lines.push('每一轮：先判定，后叙述。');
      }
    }

    if (searchOn) {
      lines.push('');
      lines.push('【联网搜索协议】');
      lines.push('当剧情需要现实世界的事实且你不确定时，可以调：');
      lines.push('· web_search({query: "关键词", count: 3})');
      lines.push('什么时候搜：真实历史/地理/人物/新闻/常识，且你不确定');
      lines.push('什么时候不搜：纯虚构世界观（卡带世界书里已有的设定）/ 日常对话 / 每轮最多搜 1 次');
    }

    lines.push('');
    return lines.join('\n');
  },

  buildSemiStatic() {
    if (GameState._cachedStaticDynamic) return GameState._cachedStaticDynamic;
    const card = GameState.currentCard;
    if (!card) return '';

    const lines = [];
    lines.push('════════════════════════════════════════');
    lines.push('【第三部分 · 一局不变信息】只读参考');
    lines.push('════════════════════════════════════════');
    lines.push('');

    const portrait = GameState.playerData.portrait;
    if (portrait && portrait.summary && typeof Portrait !== 'undefined') {
      const pt = Portrait.formatForPrompt(portrait);
      if (pt) { lines.push(pt); lines.push(''); }
    }

    const entityIdx = this.buildEntityIndex();
    if (entityIdx) lines.push(entityIdx);

    const result = lines.join('\n');
    GameState._cachedStaticDynamic = result;
    return result;
  },

  buildEntityIndex() {
    const card = GameState.currentCard;
    if (!card) return '';
    const wb = card.worldbook || {};
    const LIMIT = 40;
    const lines = [];

    const fmtList = function(arr, nameKey) {
      if (!Array.isArray(arr) || !arr.length) return null;
      const shown = arr.slice(0, LIMIT).map(function(x) {
        const n = x[nameKey] || x.name || x.label || x.id || '?';
        return n + '(' + (x.id || '?') + ')';
      });
      let s = shown.join(' · ');
      if (arr.length > LIMIT) s += ' …等 ' + arr.length + ' 个';
      return s;
    };

    const npcStr = fmtList(wb.npcs, 'name');
    if (npcStr) lines.push('· NPC：' + npcStr);
    const facStr = fmtList(wb.factions, 'name');
    if (facStr) lines.push('· 势力：' + facStr);
    const nodeArr = Object.keys(wb.mapNodes || {}).map(function(k) { return wb.mapNodes[k]; });
    const nodeStr = fmtList(nodeArr, 'name');
    if (nodeStr) lines.push('· 地点：' + nodeStr);
    const itemStr = fmtList(wb.items, 'name');
    if (itemStr) lines.push('· 物品：' + itemStr);
    const skillStr = fmtList(wb.skills, 'name');
    if (skillStr) lines.push('· 技能：' + skillStr);
    if (wb.hasRaces && Array.isArray(wb.races) && wb.races.length) {
      const raceStr = fmtList(wb.races, 'name');
      if (raceStr) lines.push('· 种族：' + raceStr);
    }
    const occStr = fmtList(wb.occupations, 'name');
    if (occStr) lines.push('· 职业：' + occStr);

    const tl = (wb.timeline && Array.isArray(wb.timeline.official)) ? wb.timeline.official : [];
    if (tl.length) {
      const tlShown = tl.slice(0, 10).map(function(ev) {
        const t = ev.time || '?';
        const e = String(ev.event || '').slice(0, 24);
        return t + ' ' + e;
      });
      lines.push('· 官方历史：' + tlShown.join(' · '));
    }

    if (!lines.length) return '';
    // P10·B2③：query_npc/query_faction/query_map 已在【工具协议】「查询」行声明，
    //   此处不再重列（同一工具只在一处声明）；仅保留指路语义。
    return '>>> 【实体索引】（详情见【工具协议】查询类）\n' + lines.join('\n') + '\n';
  },

  // ★ P4：第四部分的渲染体。level = 已应用的降级档数（0 = 不降级）。
  //   每一档只改「渲染方式」，不改任何数据。
  _buildDynamicLines(level) {
    level = level || 0;
    const LV = {};
    for (let i = 0; i < DEGRADE_STEPS.length; i++) LV[DEGRADE_STEPS[i].id] = i + 1;
    const on = function (id) { return level >= LV[id]; };

    const card = GameState.currentCard;
    const lines = [];
    lines.push('════════════════════════════════════════');
    lines.push('【第四部分 · 系统状态快照】只读参考 · 本区内容留在上下文里');
    lines.push('════════════════════════════════════════');
    lines.push('');
    lines.push('>>> 当前时间：' + GameState.formatGameTime());
    // ★ 时间感：明确告诉 AI 今天/昨天/明天是什么
    if (GameState._gameTime) {
      var t = GameState._gameTime;
      var p2 = function(n) { return String(n).padStart(2, '0'); };
      var todayStr = t.year + '年' + t.month + '月' + t.day + '日';
      var yestT = { year: t.year, month: t.month, day: t.day - 1 };
      if (yestT.day < 1) { yestT.month -= 1; yestT.day = 30; if (yestT.month < 1) { yestT.year -= 1; yestT.month = 12; } }
      var tomT = { year: t.year, month: t.month, day: t.day + 1 };
      if (tomT.day > 30) { tomT.month += 1; tomT.day = 1; if (tomT.month > 12) { tomT.year += 1; tomT.month = 1; } }
      var yestStr = yestT.year + '年' + yestT.month + '月' + yestT.day + '日';
      var tomStr = tomT.year + '年' + tomT.month + '月' + tomT.day + '日';
      lines.push('>>> 今天是 ' + todayStr + '，昨天是 ' + yestStr + '，明天是 ' + tomStr);
    }

    // 现实感知
    if (typeof Realtime !== 'undefined') {
      var rLine = Realtime.formatForPrompt();
      if (rLine) lines.push(rLine);
    }

    // 年代产物
    var eraSegs = (card.worldbook && card.worldbook.worldSetting && card.worldbook.worldSetting.eraProducts) || [];
    if (Array.isArray(eraSegs) && eraSegs.length && GameState._gameTime) {
      var curYear = GameState._gameTime.year;
      var matchedSeg = null, closestSeg = null, closestDist = Infinity;
      eraSegs.forEach(function(seg) {
        if (seg.from == null || seg.to == null) return;
        if (curYear >= seg.from && curYear <= seg.to) matchedSeg = seg;
        var mid = (seg.from + seg.to) / 2;
        var dist = Math.abs(curYear - mid);
        if (dist < closestDist) { closestDist = dist; closestSeg = seg; }
      });
      var useSeg = matchedSeg || closestSeg;
      if (useSeg) {
        var note = matchedSeg ? '' : '（卡带未定义此年份，参考最接近的 ' + useSeg.from + '-' + useSeg.to + '）';
        lines.push('>>> 年代产物约束（游戏内 ' + curYear + ' 年' + note + '）：');
        if (useSeg.has && useSeg.has.length) lines.push('   该年代有：' + useSeg.has.join('、'));
        if (useSeg.hasNot && useSeg.hasNot.length) lines.push('   该年代没有：' + useSeg.hasNot.join('、'));
        lines.push('      ⚠ 剧情里的产物取自"有"清单。');
      }
    }

    // 天气
    if (typeof Weather !== 'undefined') {
      var wLine = Weather.formatForPrompt();
      if (wLine) lines.push(wLine);
    }

    // 系统通知
    if (GameState._pendingSystemNotices.length) {
      GameState._pendingSystemNotices.forEach(n => lines.push('>>> 系统通知：' + n));
      GameState._pendingSystemNotices = [];
    }

    // 玩家信息
    const pd = GameState.playerData;
    const idx = [];
    let pname = Alias.get(pd, 'name');
    if (pname) idx.push(String(pname));
    const gender = Alias.get(pd, 'gender');
    if (gender) idx.push(String(gender));
    const age = GameState.computeAge();
    if (age) idx.push(age + '岁');
    const eraId = pd.era || pd.era_id;
    if (eraId) {
      for (const step of (card.steps || [])) {
        if ((step.key === 'era' || step.id === 'era') && step.options) {
          const o = step.options.find(x => x.id === eraId);
          if (o) {
            let e = o.name || o.label || eraId;
            if (o.period && o.period[0]) e += '(' + o.period[0] + '-' + o.period[1] + ')';
            idx.push('时代:' + e);
          }
          break;
        }
      }
    }
    ['house', 'identity', 'race', 'bloodline', 'occupation', 'major'].forEach(k => {
      const v = Alias.get(pd, k);
      if (v) {
        const l = this.findOptionLabel(card, k, v);
        if (l && l !== v) idx.push(l); else idx.push(String(v));
      }
    });
    // ★ 角色声音提醒：每轮提醒 AI 这个角色该怎么说话
    // P10·B2④：第三部分已全量列出 portrait.traits（Portrait.formatForPrompt 产出
    //   「关键特质：· t」），此处只列「第三部分没出现的」traits，消除同一特质两遍。
    try {
      var portrait = pd.portrait;
      if (portrait && portrait.traits && portrait.traits.length) {
        var shownTraits = '';
        try {
          if (portrait.summary && typeof Portrait !== 'undefined' && Portrait.formatForPrompt) {
            shownTraits = String(Portrait.formatForPrompt(portrait) || '');
          }
        } catch (e1) { shownTraits = ''; }
        var voiceTraits = portrait.traits.filter(function(t) {
          if (shownTraits && shownTraits.indexOf('· ' + String(t)) >= 0) return false;
          return /说话|语气|口吻|风格|性格|态度|习惯|反应|方式/.test(String(t));
        });
        if (voiceTraits.length) {
          lines.push('>>> 角色声音提醒（保持前后一致，用自己的腔调）：');
          voiceTraits.slice(0, 4).forEach(function(t) { lines.push('   · ' + t); });
        }
      }
    } catch (e) {}
    lines.push('>>> 玩家：' + (idx.length ? idx.join(' · ') : '（未填）'));
    // ★ 场景描述：玩家所在地点的固定特征
    try {
      var curLocId = '';
      if (typeof StatusCard !== 'undefined' && StatusCard.isEnabled()) {
        var scLoc = StatusCard.getField('location');
        if (scLoc) curLocId = String(scLoc);
      }
      if (!curLocId) curLocId = String(pd.locationId || pd.location || '');
      if (curLocId && card.worldbook && card.worldbook.mapNodes && card.worldbook.mapNodes[curLocId]) {
        var curNode = card.worldbook.mapNodes[curLocId];
        if (curNode.name) {
          var nodeLine = '>>> 当前场景：' + curNode.name;
          if (curNode.type) nodeLine += '（' + curNode.type + '）';
          if (curNode.desc) nodeLine += ' — ' + curNode.desc;
          lines.push(nodeLine);
          if (curNode.tags && curNode.tags.length) {
            lines.push('>>> 场景特征：' + curNode.tags.join('、'));
          }
        }
      }
    } catch (e) {}
    lines.push('>>> （需要详细角色信息时调 query_player）');
    const hudLine = GameState.currentState.hud.map(h => h.key + '=' + (h.current != null ? h.current : '?') + (h.max ? '/' + h.max : '')).join(' | ');
    lines.push('>>> HUD：' + hudLine);
    const sbLine = GameState.currentState.sidebar.map(s => {
      const seg = GameState.getSegmentText(s);
      return s.key + '=' + (s.current != null ? s.current : '?') + (s.max ? '/' + s.max : '') + (seg ? '[' + seg.slice(0, 12) + ']' : '');
    }).join(' | ');
    lines.push('>>> Sidebar：' + sbLine);
    Object.values(GameState.currentState.panels).forEach(p => {
      if (!p.entries || !p.entries.length) return;
      const ls = p.entries.map(e => {
        if (e.type === 'number' || e.type === 'relation') {
          const seg = GameState.getEntrySegmentText(e);
          const tag = e.type === 'relation' ? '[' + (e.from || '?') + '→' + (e.to || '?') + ']' : '';
          return e.key + '=' + e.current + (e.max ? '/' + e.max : '') + tag + (seg ? '[' + seg.slice(0, 10) + ']' : '');
        } else if (e.type === 'switch') return e.name + '=' + (e.value ? '是' : '否');
        else if (e.type === 'list') {
          const items = (e.items || []).map(it => typeof it === 'string' ? it : (it.name || '')).filter(Boolean);
          return e.name + '=[' + (items.join(',') || '空') + ']';
        }
        return '';
      }).filter(Boolean);
      if (ls.length) lines.push('>>> 面板' + p.id + '：' + ls.join(' | '));
    });

    // 状态卡
    if (typeof StatusCard !== 'undefined' && StatusCard.isEnabled()) {
      var scLine = StatusCard.formatForPrompt();
      if (scLine) {
        lines.push('>>> 【状态卡】');
        lines.push(scLine);
        lines.push('');
      }
    }

    // 商店索引（降级档 count1：压成一行计数）
    if (typeof Shop !== 'undefined') {
      var shopsBrief = Shop.formatShopsForPrompt();
      if (shopsBrief) {
        if (on('count1')) {
          lines.push('>>> 【商店索引】' + this._countItems(shopsBrief) + ' 家（需要时调 open_shop(id)）');
        } else {
          lines.push('>>> 【商店索引】（需要打开时调 open_shop(id)）');
          lines.push(shopsBrief);
          lines.push('');
        }
      }
    }

    // ★ NPC 三层舞台（【镜头内】必须保留）。P10·B1：原 'names' 档已删（对真实数据是空档）。
    if (typeof NpcRuntime !== 'undefined') {
      var focusBrief = NpcRuntime.formatFocusBrief();
      var sceneBrief = NpcRuntime.formatSceneBrief();
      var followBrief = NpcRuntime.formatFollowBrief();
      if (focusBrief) {
        lines.push('>>> 【镜头内】（≤3，你正在写的）');
        lines.push(focusBrief);
      }
      if (sceneBrief) {
        lines.push('>>> 【现场舞台上】（可以互动，但没聚焦）');
        lines.push(sceneBrief);
        lines.push('>>> （想让某人上镜头：npc_focus(id)；想让人离开现场：npc_scene_leave(id)）');
      }
      if (followBrief) {
        lines.push('>>> 【跟随你】（换场景会一起走）');
        lines.push(followBrief);
      }
      var rtLine = NpcRuntime.formatActiveForPrompt();
      if (rtLine) {
        lines.push('>>> 【镜头内 NPC 状态】');
        lines.push(rtLine);
      }
    }

    // ★ 节点系统（降级档 count1：压成一行计数）
    if (typeof StoryNodes !== 'undefined') {
      var nodeLine = StoryNodes.formatForPrompt();
      if (nodeLine) lines.push(on('count1') ? this._toCountLine('剧情节点', nodeLine) : nodeLine);
    }

    // ★ 结局系统（降级档 count1：压成一行计数）
    if (typeof Endings !== 'undefined') {
      var endLine = Endings.formatForPrompt();
      if (endLine) lines.push(on('count1') ? this._toCountLine('结局', endLine) : endLine);
    }

    // ★ 事件：pending（必须发生）+ 本地（可选推进）。事件是硬约束，不进降级阶梯。
    if (typeof Events !== 'undefined') {
      var evLine = Events.formatPendingForPrompt();
      if (evLine) lines.push(evLine);
      var localLine = Events.formatLocalForPrompt();
      if (localLine) lines.push(localLine);
      var evPropLine = Events.formatProposalsForPrompt();
      if (evPropLine) lines.push(evPropLine);
    }

    // 信息层（剧情外）（降级档 clip2：每条截到 ≤2 行）
    if (typeof InfoFeed !== 'undefined' && typeof InfoFeed.formatForPrompt === 'function') {
      var infoLine = InfoFeed.formatForPrompt();
      if (infoLine) lines.push(on('clip2') ? this._clipItemLines(infoLine, 2) : infoLine);
    }

    // 任务（降级档 clip2：每条截到 ≤2 行）
    if (typeof Tasks !== 'undefined') {
      var taskLine = Tasks.formatForPrompt();
      if (taskLine) lines.push(on('clip2') ? this._clipItemLines(taskLine, 2) : taskLine);
    }

    // 成就（降级档 recent1：只留最近 1 条）
    if (typeof Achievements !== 'undefined') {
      var achLine = Achievements.formatRecentForPrompt();
      if (achLine) lines.push(on('recent1') ? this._keepFirstItem(achLine) : achLine);
    }

    // 变更提议（降级档 clip2：每条截到 ≤2 行）
    if (typeof Proposals !== 'undefined') {
      var propLine = Proposals.formatForPrompt();
      if (propLine) lines.push(on('clip2') ? this._clipItemLines(propLine, 2) : propLine);
    }

    // 骰子历史（降级档 recent1：只留最近 1 条）
    if (typeof DiceHistory !== 'undefined') {
      var dhLine = DiceHistory.formatRecentForPrompt(on('recent1') ? 1 : 3);
      if (dhLine) lines.push(dhLine);
    }

    // 产出物发酵（降级档 recent1：只留最近 1 条）
    if (typeof Outputs !== 'undefined') {
      var outLine = Outputs.formatForPrompt();
      if (outLine) lines.push(on('recent1') ? this._keepFirstItem(outLine) : outLine);
    }

    // 日志摘要（降级档 sum2 / sum1 / sum0：3 → 2 → 1 → 0）
    if (GameState.currentCardId && GameState.currentSaveId && typeof Logger !== 'undefined') {
      const g = Storage.getGlobal();
      const n = (g.logging && g.logging.summaryInject) || 3;
      var sumN = n;
      if (on('sum2')) sumN = Math.min(sumN, 2);
      if (on('sum1')) sumN = Math.min(sumN, 1);
      if (on('sum0')) sumN = 0;
      const sums = sumN > 0
        ? Logger.getRecentSummaries(GameState.currentCardId, GameState.currentSaveId, sumN)
        : [];
      if (sums.length > 0) {
        sums.forEach(s => lines.push('>>> 前情 [' + s.date + '] ' + s.title + '：' + s.summary));
        const active = Logger.getActiveEntities(GameState.currentCardId, GameState.currentSaveId, sumN);
        if (active.npcs.length) lines.push('>>> 相关NPC：' + active.npcs.join('、'));
        if (active.unresolved.length) lines.push('>>> 未完成：' + active.unresolved.join('；'));
      }
      // 有摘要时提示还能去搜原文；摘要被降到 0 时这一句必须留着，别让 AI 无路可走
      if (sums.length > 0 || on('sum0')) {
        lines.push('>>> （更早的事可调 query_log({keyword})）');
      }
    }

    const m = this.findMentioned(card, GameState.chatHistory);
    if (m.length > 0) {
      lines.push('>>> 本轮可能涉及：' + m.map(x => x.type + ':' + x.name + '(id=' + x.id + ')').join(' | '));
      // P10·B2③：同上，query_* 只在【工具协议】声明一次。
      lines.push('>>> （详情见【工具协议】查询类）');
    }
    lines.push('');
    lines.push('════════════════════════════════════════');
    lines.push('【系统状态结束】现在开始写剧情。你的输出 = 【正文】+【时间】+【选项】。上面这些是参考。');
    lines.push('════════════════════════════════════════');
    return lines.join('\n');
  },

  // ★ P4：预算刹车入口。under budget ⇒ 与旧版逐字一致（level 0）。
  //   超预算 ⇒ 按 DEGRADE_STEPS 顺序逐档降级，直到 ≤ maxTokens 或阶梯走完。
  //   每次降级都 append 到 GameState._lastTrimLog（不许静默）。
  buildDynamic() {
    const budget = this._getBudget();
    const maxLevel = DEGRADE_STEPS.length;
    // P9·S4：系统通知块在 _buildDynamicLines 里 forEach 后立刻清空，而刹车会多次
    //   重渲染（level 0 → 1 → …）。若不回填，只要降级触发，本轮「玩家 X 进入新状态」
    //   这类通知就会从 prompt 消失（唯一入队点 engine/story.js:252）。故每次重渲染前
    //   把快照回填；渲染原语本身仍负责清空，保持单次消费语义。
    //   （反向搬自桌面 engine/core/prompt_builder.js:668-673）
    const canLog = (typeof GameState !== 'undefined' && GameState);
    const notices = canLog ? GameState._pendingSystemNotices.slice() : [];
    const render = (lv) => {
      if (canLog) GameState._pendingSystemNotices = notices.slice();
      return this._buildDynamicLines(lv);
    };

    let level = 0;
    let text = render(0);

    if (!budget.enabled) {
      if (canLog) {
        GameState._lastTrimLog = [];
        GameState._lastPromptBudget = budget;
        GameState._lastTrimmedLevel = 0;
        // P9·S14：预算口径 = 第四部分（状态快照）估算，供侧栏「状态快照」显示
        GameState._lastPromptEstimate = this.estimateTokens(text);
        GameState._lastPromptChars = text.length;
      }
      return text;
    }

    let est = this.estimateTokens(text);
    const trimLog = [];
    while (est > budget.maxTokens && level < maxLevel) {
      const before = est;
      level++;
      text = render(level);
      est = this.estimateTokens(text);
      trimLog.push({
        section: DEGRADE_STEPS[level - 1].id,
        before: before,
        after: est,
        reason: DEGRADE_STEPS[level - 1].note
      });
    }
    if (canLog) {
      GameState._lastTrimLog = trimLog;
      GameState._lastPromptBudget = budget;
      GameState._lastTrimmedLevel = level;
      // P9·S14：预算口径 = 第四部分（状态快照）估算，供侧栏「状态快照」显示
      GameState._lastPromptEstimate = this.estimateTokens(text);
      GameState._lastPromptChars = text.length;
    }
    return text;
  },

  // 预算配置：Storage.getGlobal().promptBudget = { enabled, maxTokens }
  _getBudget() {
    try {
      const g = Storage.getGlobal();
      const b = g && g.promptBudget;
      if (b && typeof b === 'object') {
        return {
          enabled: b.enabled !== false,
          maxTokens: (typeof b.maxTokens === 'number' && b.maxTokens > 0)
            ? b.maxTokens : PROMPT_BUDGET_DEFAULT.maxTokens
        };
      }
    } catch (e) {}
    return { enabled: PROMPT_BUDGET_DEFAULT.enabled, maxTokens: PROMPT_BUDGET_DEFAULT.maxTokens };
  },

  // ---------- P4 降级原语（纯文本、确定性） ----------
  _splitLines(text) { return String(text == null ? '' : text).split('\n'); },
  _isItemLine(l) { return /^\s*[·\-*]/.test(l); },

  // 只留第一条：保留头部（首个条目行之前的行）+ 第一条目行及其后续非空续行
  _keepFirstItem(text) {
    const ls = this._splitLines(text);
    const out = [];
    let seenItem = false;
    let stopped = false;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      // P9·S12：停止收纳条目后，块尾行（>>> / （ 开头，如 Outputs 尾部的
      //   「>>> （AI 用 output_stir…）」）仍须保留，否则降级会连提示一起砍掉。
      if (stopped) {
        if (this._isTailLine(l)) out.push(l);
        continue;
      }
      if (this._isItemLine(l)) {
        if (seenItem) { stopped = true; continue; }
        seenItem = true;
        out.push(l);
        continue;
      }
      if (!seenItem) { out.push(l); continue; }
      if (l !== '') out.push(l);
    }
    return out.join('\n');
  },

  // 块尾行判定：条目行之后出现的 >>> / （ 开头的行（信息层的「（你可用 info_send…）」
  //   「（分流/混流…）」与「>>> 【信息层结束】」等）。P9·S12：这些行在 clip2 档下
  //   永远保留，否则 AI 会丢失「默认只写在手机里、不进正文」的分流说明。
  _isTailLine(l) { return /^\s*(>>>|（)/.test(l); },

  // 每条目最多保留 n 行（头部与空行原样保留；块尾行整段保留）
  _clipItemLines(text, n) {
    const ls = this._splitLines(text);
    const out = [];
    let cnt = 0, inItem = false, tail = false;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (tail) { out.push(l); continue; }
      if (inItem && this._isTailLine(l)) { tail = true; out.push(l); continue; }
      if (this._isItemLine(l)) { inItem = true; cnt = 1; out.push(l); continue; }
      if (inItem && l !== '') {
        if (cnt < n) { out.push(l); cnt++; }
        continue;
      }
      out.push(l);
    }
    return out.join('\n');
  },

  // 数条目行条数（无条目行则按非空行数兜底）
  _countItems(text) {
    const ls = this._splitLines(text);
    let items = 0, nonEmpty = 0;
    for (let i = 0; i < ls.length; i++) {
      if (this._isItemLine(ls[i])) items++;
      if (ls[i] !== '') nonEmpty++;
    }
    return items > 0 ? items : nonEmpty;
  },

  // 压成一行计数
  _toCountLine(label, text) {
    return '>>> 【' + label + '】' + this._countItems(text) + ' 项（需要时用工具查询）';
  },

  findOptionLabel(card, key, optId) {
    for (const step of (card.steps || [])) {
      const sk = step.key || step.id;
      if (sk === key && step.options) { const o = step.options.find(x => x.id === optId); if (o) return o.name || o.label || optId; }
      (step.fields || []).forEach(f => {
        if (f.key === key && f.type === 'choice' && f.options) { const o = f.options.find(x => x.id === optId); if (o) return o.label || o.name || optId; }
      });
    }
    return optId;
  },

  findMentioned(card, chatHistory) {
    const wb = card.worldbook || {};
    const text = (chatHistory || []).slice(-10).map(m => m.content || '').join('\n');
    if (!text) return [];
    const out = [];
    (wb.npcs || []).forEach(n => { if (n.name && text.indexOf(n.name) >= 0) out.push({ type: 'NPC', name: n.name, id: n.id }); });
    (wb.factions || []).forEach(f => { if (f.name && text.indexOf(f.name) >= 0) out.push({ type: '势力', name: f.name, id: f.id }); });
    const nodes = wb.mapNodes || {}, seen = {};
    Object.keys(nodes).forEach(id => {
      const n = nodes[id];
      if (n && n.name && text.indexOf(n.name) >= 0 && !seen[n.name]) { seen[n.name] = true; out.push({ type: '地点', name: n.name, id: n.id }); }
    });
    return out.slice(0, 6);
  },

  // 估算字符串的 token 数（中英混合）
  // 中文字符 ≈ 1.5 字/token，英文字符 ≈ 4 字/token，其它符号按 2 字/token 折中
  estimateTokens(str) {
    if (!str) return 0;
    var s = String(str);
    var cn = 0, en = 0, other = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 128) en++;
      else if (c >= 0x4E00 && c <= 0x9FFF) cn++;
      else other++;
    }
    return Math.ceil(en / 4 + cn / 1.5 + other / 2);
  },

  // P9·S14：口径拆分——_lastPromptEstimate/_lastPromptChars 只报第四部分（状态快照，
  //   buildDynamic 内写入）；这里与 buildSystem 写「整条 prompt」的独立字段，
  //   不再覆盖第四部分口径（否则界面数字与预算口径不一致）。story.js:236 零改动。
  updateEstimate(str) {
    try {
      GameState._lastPromptFullEstimate = this.estimateTokens(str);
      GameState._lastPromptFullChars = str.length;
    } catch (e) {}
  },

  buildSystem() {
    var result = this.buildStatic() + '\n' + this.buildSemiStatic() + '\n' + this.buildDynamic();
    // ★ 估算整条 prompt 体积（独立字段，不覆盖第四部分口径）
    try {
      GameState._lastPromptFullEstimate = this.estimateTokens(result);
      GameState._lastPromptFullChars = result.length;
    } catch (e) {}
    return result;
  }
};

if (typeof window !== 'undefined') {
  window.GM_DEFAULTS = GM_DEFAULTS;
  window.PromptBuilder = PromptBuilder;
}
// P9·S8：RN（Hermes 无 window）下把 GM_DEFAULTS 挂 globalThis，
// 供 GmTab.js 的 globalThis.GM_DEFAULTS 读取（引擎层规则只读块）。
if (typeof globalThis !== 'undefined') {
  globalThis.GM_DEFAULTS = GM_DEFAULTS;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptBuilder;
  module.exports.GM_DEFAULTS = GM_DEFAULTS;
}

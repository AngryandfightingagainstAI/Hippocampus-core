# TRAE_REPORT（信箱 · 永远只存最新一轮）

【轮次】G7 修复批：checkPanels 失败不得经「带病导入」绕过校验（2026-10-17）

【结论】
G7 已修复并两仓同步：diagnose 的 ok 计算纳入 panelCheck（card_diagnose.js:500），「必须修复」级问题（panels 非数组/缺 num=2-5）不再产生 ok=true；「带病导入」按钮门为 `if (result.ok)` 单条件（:625），ok=false 时按钮不可达 ⇒ fromDiagnose 快捷路径仅在诊断允许（fails 为空）时可达。普通质量警告（空面板/引用断裂/display 非法）仍按原设计带警告导入，未升级为致命。修复前两仓 card_diagnose.js 内容逐字一致（仅行尾差异：桌面 CRLF/RN LF，符合两仓行尾纪律），改动以同内容 Edit 分别落两仓。

【改动】
| 文件 | 改动 |
|---|---|
| engine/card_diagnose.js（两仓，:494-506） | return.ok 从 `json✓ && req✓` 扩为 `json✓ && req✓ && panelCheck✓`，附 G7 修复注释块。桌面改后 CRLF 修复 BARE_LF=0、node --check 0；RN node --check 0（保持 LF） |
| tests/unit/test_g7_diagnose.js（桌面新增） | 8 断言；夹具显式挂 global.CardValidator（checkReferences/checkPanels 依赖全局，浏览器与 RN 均全局装载，Node 单测需显式挂载） |

【验证】
1. `node tests\unit\test_g7_diagnose.js` → **SUMMARY: 8 passed, 0 failed**（G7-1 缺 num=3 拦截 / G7-2 非数组拦截 / G7-3 空面板 warn 级放行 / G7-4 引用断裂口径未升级 / G7-5 正常卡零误伤 / G7-6 缺必填拦截回归 / G7-7 display 仅警告回归 / G7-8 fails 非空⇒ok=false 语义一致）
2. `node tests\unit\test_p52_schema_compat.js` → **SUMMARY: 65 passed, 0 failed**
3. `node tests\unit\test_p15_import.js` → **SUMMARY: 17 passed, 0 failed**
4. `node tests\unit\test_p43_card_normalize.js` → **SUMMARY: 31 passed, 0 failed**
5. RN `node tools\card_compat_smoke.js` → **CARD_COMPAT_SMOKE: 24 ok, 0 failed**
6. RN 行为一致性（node -e 真实调用）：缺 num=3 卡 → `RN_G7_MISSING_NUM3_OK=false FAILS=1`，EXIT=0
7. 首跑一红为测试夹具缺 global.CardValidator（环境装载差异，非产品缺陷），修夹具后全绿；产品代码零回改。

【修复前后差异】
- 修复前：缺 num=3 → reqCheck pass（checkRequiredFields :166-180 不查 num）→ panelCheck fail 仅进 fails → ok=true → 「带病导入」按钮 → fromDiagnose 跳过 CardValidator → 入库坏卡。
- 修复后：同输入 → ok=false → 按钮不出现 → 无入库路径；用户仍可「复制报告给 AI」修复后重导。
- 普通警告路径：ok 不受 warnings 影响（G7-3/4/7 实证），原带警告导入设计保留。

【残余绕过路径复查】
- fromDiagnose：仅 ok=true（fails 空）时按钮可达 ✓
- legacy 路径 / 不带 fromDiagnose 的 _doImportWithText：仍走 CardValidator.validate（:618/:639，num 缺失被 :20 拦）✓
- 资料导入 enrich→commit：commit 内 ImportDraft.validate 门禁独立，不受影响 ✓
⇒ 未发现其他可绕过诊断进入正式列表的路径。

【未覆盖】
renderTerminal 按钮 DOM 渲染（Node 无浏览器环境）——由 ok 断言 + 按钮门单条件（:625）共同保证；Electron/真机端到端（锁屏）。G1-G6 未实施（按指令保留待批）。

【遗留/下一步】
G1-G6 最小补丁方案仍在审计报告内待批。EXT 6 条基线红账仍挂。本轮批次到此停止。

---

# 第二阶段审计：G1–G6 终版判定（只读轮，零代码改动）（2026-10-17 追加）

【审计结论总表】

| 项 | 终判 | 严重度 | 核心依据 |
|---|---|---|---|
| G1 口径分裂 | 已确认未解决 | 中 | 两套规则并行：CardValidator（fatal：8 必填+类型+panels num）vs CardDiagnose.checkRequiredFields（同域复刻但**不查 num**，:166-180）+ checkPanels（查 num，:182-201）。**本轮修正**：ImportDraft.validate 是 CardValidator 薄壳委托（draft.js:199-206），非第三套规则 |
| G2 修复追踪 | 部分成立 | 低-中 | enrich AI 补丁已有字段级 trace（applied/rejected，index.js:113-115）；diagnose 有 check 级 ⊕fixed（:510）；缺：fixJSONText 字段级清单、normalizeCard moved 未进用户报告、两套记录未合流 |
| G3 修复可信度 | 部分成立 | 低 | enrich 每轮 applyPatch 后重 validate（step() 循环 `if (v.ok) return` 首查即闭环）；applied=写入成功，语义有效性由后续 validate 判定——区分正确。诊断人工循环单次全链重跑无旧沿用。「格式正确≠可玩」缺口归 G5 域 |
| G4 引用断裂分级 | 已确认未解决 | 中 | checkReferences（:239-284）查 7 类引用（maps.rootId / mapNodes.parentId / mapNodes.linkedNPCs / npcs.factions[].factionId / npcs.relations[].targetId / factions.linkedNPCs / factions.relations）全部 fail→warnings（:458-460）不拦不分级。**不查**：npcs.locationId→mapNodes、shops.currencyId→hud key、steps[].field.key→attributes。消费端后果各异（locationId 运行时 _loc 兜底 / relations 断裂致查询内容不可访问 / shop.js:149 按 name 找兜底）——应按后果分级而非一律 warning |
| G5 最小运行时兼容 | 已确认未解决 | 中 | steps[].field.key 与 attributes key 对齐不查（P-12 消费链仍未核完）、初始场景引用不查、attributes key 重复不查。结构合法卡可入库但运行缺块 |
| G6 提前返回 | **不成立（实测推翻）** | — | 实测（本轮 node -e 复现）：删 attributes 的卡 → checks 全十项含 refs 照跑（`G6_HAS_REFS=true G6_OK=false`）。:442-447 早退**仅当 reqCheck fail 且 detail 含 panels/hud**（结构底层坏到深检查无法安全执行时的防御分支）——设计合理。尾审轮「必填缺失时深检查不跑」为误读（看漏 detail.indexOf 限定），撤回 |
| G7 复验 | 两仓生效 | — | `panelCheck.status !== 'fail'` 两仓均在 :500（Select-String 直读） |

【逐项最小修复建议（待批，未实施）】
- **G1**：checkRequiredFields 委托或对齐 CardValidator 必填口径（单一事实源）；增量检查（existence/eraProducts/npc_weights/completeness）保留在 diagnose。风险低，回归面 test_g7 + p52 + p15。
- **G2**：fixJSONText 返回 {text, fixedList[]} 进 renderTerminal「引擎已自动修复」区；moved 并入。展示层改动，零运行时风险。
- **G4**：建「引用类型→消费位置→实际后果→严重级别」表后逐类定级：有运行时兜底的维持 warn；致内容不可访问的（relations.targetId）可升 fails（**需逐个消费端证据，maps.rootId 消费链本轮未核——证据不足**）。
- **G5**：三查入 validator（attributes key 重复=fatal；steps field key 对齐=warn；初始场景=warn），全部有真实消费点依据。
- **G6**：无需修复。

【建议实施顺序】G2（独立、纯展示层）→ G5（独立、增查不改旧）→ G1（依赖 G5 落定后的口径基线）→ G4（依赖消费端证据补核，最后做）。G2/G5 可并批但建议分轮（改码与跑测分轮纪律）。

【桌面/RN 差异】card_diagnose.js 两仓内容逐字一致（仅行尾：桌面 CRLF/RN LF）；import/ 管线（enrich/commit/ImportDraft）桌面独有，RN 无此路径；RN 导入走 CardsScreen→CardDiagnose，G7 两端 :500 生效。

【最终自检】本轮零产品/测试/基线改动；唯一文件操作为本报告追加；G7 两仓在位；G6 结论由实测复现证据推翻（`G6_EARLY_RET_CHECKS` 十项全跑）；未能验证：maps.rootId 运行时消费链、P-12 steps-attributes 消费终点（均标证据不足）。两仓报告同步（见下）。

---

# G2 实施报告：修复追踪与诊断展示（2026-10-17 追加）

【结论】G2 已实施并两仓同步。**实施前核对修正审计认知**：fixJSONText 的修复类型级记录**原本已存在且用户可见**（:81 changes 数组，markdown 包裹/BOM/注释/尾随逗号/括号补全五类；经 checkJSONSyntax 进 check.detail + status='fixed' + renderTerminal ⊕FIXED 通用渲染）——G2-A 实质已成立，本轮零改动。**真正的缺口与修复**：diagnose 链不跑 normalizeCard，fromDiagnose 导入未归一对象（「顶层 npcs」卡入库后 worldbook.npcs 为空——数据层不同源）。本轮在 diagnose 的 :438 后补跑归一（:440-455，两仓同内容各自 Edit）：moved 作独立「结构整理」check（status=fixed、detail 明示「结构迁移，非错误修复」）+ 计入 warnings（不动 ok，G7 口径不变）；返回的 card 即归一后对象，renderTerminal 传入 _doImportWithText 与展示为同一份。

【改动】
| 文件 | 改动 |
|---|---|
| engine/card_diagnose.js（两仓，桌面 :440-455） | diagnose 补 `CardValidator.normalizeCard(card)` + normalize check + warnings；桌面 CRLF 修复后 BARE_LF=0、两仓 node --check 0 |
| tests/unit/test_g2_trace.js（桌面新增） | 8 断言（G2-1/2/3 JSON 修复记录真伪 / G2-4/6/7 归一追踪与口径 / G2-5 对象同源 / G2-8 G7 回归） |

【验证】
1. `node tests\unit\test_g2_trace.js` → **SUMMARY: 8 passed, 0 failed**（首跑 1 红为夹具构造错误——replace 产生双逗号而非合法尾随逗号场景，改用 markdown 包裹真实修复类型后全绿；产品代码零回改）
2. `node tests\unit\test_g7_diagnose.js` → **8 passed, 0 failed**（G7 口径未动）
3. test_p52_schema_compat → **65 passed, 0 failed**；test_p15_import → **17 passed, 0 failed**；test_p43_card_normalize → **31 passed, 0 failed**
4. RN `node tools\card_compat_smoke.js` → **CARD_COMPAT_SMOKE: 24 ok, 0 failed**
5. RN 行为验证（node -e 真实调用）：顶层 npcs 卡 → `RN_NORM=fixed RN_WBNPCS=1 RN_OK=true`，EXIT=0

【必答四问】
- **新增追踪**：①「结构整理」check（moved 迁移描述，桌面+RN）；② 归一后 card 同源返回（修复数据层不同源）。fixJSONText changes 为既有能力（如实说明，非本轮新增）。
- **用户可见**：normalize check 经 renderTerminal 通用渲染（⊕ FIXED + 明细行）；json_syntax 修复类型清单原本可见。
- **「补丁已应用 vs 已修复」**：桌面 import 侧由 enrich trace（applied=写入成功）与 draftSummary.valid（最终校验）分离承载，UI 显示「仍未过校验+原因」——本轮未改（现状已满足区分，G3 判定维持「部分成立」的展示层不扩）；诊断侧「结构整理（非错误修复）」文案已明确区分。
- **两端覆盖**：桌面全链（JSON 修复/归一/AI 补全 trace）；RN 无 import 管线（enrich/commit 桌面独有），覆盖 JSON 修复 + 归一 + 诊断展示，未虚构 AI 补全记录。
- **仍无法精确追踪**：fixJSONText 括号补全只有计数（bracketFixed）无位置级；normalizeCard 对 events/storyNodes 补齐（:46-48）无单独记录（仅顶层 npcs 迁移有 note）。如实保留类型级粒度，未伪造字段级记录。

【未覆盖】renderTerminal DOM 渲染（Node 环境）；enrich trace 的 UI 逐条展示细节（桌面 import 弹窗，本轮只核对了结果口径）；Electron/真机端到端。G1/G4/G5/G6 未动（G6 判不成立，G1/G4/G5 待批）。EXT 6 条基线红账仍挂。本批停止。

---

# G5 实施前审计：最小运行时兼容性（只读轮，零改动）（2026-10-17 追加）

【总判定】**三项均无 fatal 级问题**——修正审计报告原方案（原提「attributes 重复=fatal」系高估：attributes 不是数值权威，hud/panels 才是）。三项分类：G5-A 无需处理、G5-B 兜底降级（warning 可选）、G5-C 格式不规范（warning 可选）。

## G5-A：steps[].field.key 与 attributes —— 平行体系，非引用关系〔已确认〕

**真实调用链（story.js 直读）**：renderForm（:923/:936）→ setField（:1159）写 `CreateFlow.data[k]`（KV 平铺）→ finish（:1215-1227）：`playerData = clone(this.data)`（:1216）→ inventory 兜底（:1217）→ Alias.normalize（:1218）。**全链无任何代码要求 field.key 对应 attributes.key，也无回写**。`attr_` 前缀（:818 isAttrStep）仅用于天命 pool 上限校验（:1184-1191），分配值存 `playerData['attr_x']`。attributes 消费面仅两处：summary 显示映射（:1138，`attr_` 前缀桥接）+ 卡带定义。
- **触发条件**：无（不存在「引用不存在」的失败模式——两类字段平行存储）。
- **实际后果**：天命分配值不进 attributes[].value 也不进 HUD/panels 数值（它们读各自 init）——只进 playerData 供 AI/查询。是否构成「面板不同步」取决于卡带是否把天命 key 与面板 key 设计成同域（作者自由）。
- **处理建议**：**无需导入拦截**。P-12 原判「静默失效」修正为「设计如此」。
- **RN**：story.js 两仓同源纪律逐字节一致 → 数据路径同源；RN 创角 UI 层（rn 屏）走 story_store 壳未逐行核（标：RN UI 层未核，数据契约一致）。
- **尚未证实**：HUD/panels 数值与天命分配的同步预期是否存在于任何官方卡带（无证据不立规则）。

## G5-B：初始场景引用 —— 兜底降级，不崩〔已确认〕

**真实调用链**：`_loc`（story.js :80-89）：StatusCard 优先 → `pd.locationId` → `pd.location`（双字段容错）→ `''`。**无 mapNodes[0] 回退**（story.js/gamestate.js 均无此逻辑；gamestate 不初始化 locationId）。断裂时 `_loc` 返回原 id 字符串或空串，下游（场景标题渲染、InfoFeed.tick :688 传参）拿到空值=**功能降级**（无场景锚定、AI 缺位置上下文），不报错不崩。maps.rootId 在 story.js 无消费（地图树渲染在地图面板层，与初始位置无代码关联——本轮未核地图面板消费细节，标证据不足）。
- **处理建议**：warning 级可选（「初始 locationId 未指向 mapNodes 节点」提示作者）；不 fatal（有降级路径）。
- **RN**：_loc 在同源 story.js → 一致。

## G5-C：attributes 重复 key —— 格式不规范，无数值冲突〔已确认〕

**证据**：attributes 消费面仅 story.js :1138 显示映射（后写覆盖，仅影响 label 显示）+ 无 KV 数值装载层（engine/core 无 attributes.forEach；prompt_builder 玩家索引行不含 attributes——Grep 无匹配；数值权威是 hud/panels entries）。
- **实际后果**：重复 key 仅致 summary 显示名取后者，无数值/类型/面板绑定冲突。**无合法重复场景**，但也无实际危害路径。
- **处理建议**：warning 可选（提示作者笔误），不 fatal。**原审计方案「attributes 重复=fatal」降级为 warning**（数值地位高估修正）。

## 最小修改方案（待批）

在 CardDiagnose 新增一条 check（或并入 checkReferences 扩展）：G5-B + G5-C 各产 warning（不动 ok）；G5-A 不查。复用现有 check 结构（如 G2 normalize check 模式）。**若按最保守口径：本轮全部不实施亦成立**（三项均无运行错误证据）。

## 建议测试（随实施批）

locationId 断裂 → warning 且 ok 不变 / 重复 attr key → warning / 正常卡零新增 warning / G7+G2 回归。

## 最终自检

本轮零产品代码改动、零测试文件改动；核查文件：story.js（:80-89/:818/:923-1205/:1130-1227）、gamestate.js（Grep 无 locationId 初始化）、prompt_builder.js（Grep 无 attr 消费）；P-12 正式结案（修正原判）。两端报告同步（见下）。尚未证实：地图面板对 rootId 的消费细节、RN 创角 UI 层逐行行为、天命-面板同域设计预期。

---

# 全量导入链统一审计：G1–G7 复核与实施方案（只读轮，零改动）（2026-10-17 追加）

【统一结论】导入链**无必须修复项（0 项）**。G2/G7 已修复且回归绿；G1/G3/G4/G5/G6 复核后判定为已闭环/不修复/设计如此；唯一遗留为 U-1（RN 导入入口门禁未定位，证据不足）。本轮新增关键证据：**runtime_repair.js 存在运行时自修复层**（rootId 断裂自动重绑孤儿节点并记录 fixed，:105-109；relations 检查 :214/:223）——G4 全部引用断裂均有「诊断 warning + 运行时修复」双层兜底。

## A. 导入完整调用链（前轮直读证据汇总，本轮复核）

粘贴主路径：ui_cards.js:585 取文本 → :589 P54 解密 → :597 `CardDiagnose.diagnose`（fixJSONText changes 记录 → checkJSONSyntax → normalizeCard 归一+结构整理 check（G2）→ checkRequiredFields/checkPanels/checkReferences/… 全链 → ok 含 panelCheck（G7））→ renderTerminal（⊕FIXED/fails/warnings 通用渲染，「带病导入」按钮门 `if (result.ok)`）→ `_doImportWithText(fixedText||rawText, card, {fromDiagnose:true})` → fromDiagnose 跳 validate（诊断已跑，性能合理）→ 入库归一后对象（G2 同源）。直连/文件路径：JSON.parse → CardValidator.validate（含 normalizeCard）→ 入库。资料路径：Import.run（parseFile→IMD→draft→validate（薄壳委托 CardValidator，draft.js:199-206）→ gaps → enrich（AI 补丁 trace applied/rejected + 每轮重 validate + maxRounds 3 耗尽 ok=!!v.ok）→ doCommitMaterial → Import.commit（validate 门禁，失败「未落库」）→ 入库。legacy 路径：CardDiagnose 未定义才可达（正常不可达）。

## B. G1–G7 终态表

| 项 | 终态 | 核心证据 | 决定 |
|---|---|---|---|
| G1 规则一致性 | 结构重复、行为闭环 | CardValidator（:10-27，fatal：8 必填+类型+num）vs checkRequiredFields（:166-180，不查 num）+checkPanels（:182-201，查 num）；G7 后 num 缺失双处拦；ImportDraft=薄壳。同一卡「诊断可导/提交失败」窗口已关闭（ok 与 validate 口径对齐） | **不修复**：分层可接受（诊断细粒度展示 vs 入库硬门），重构风险>收益 |
| G2 修复追踪 | **已修复**（本日前批） | changes 用户可见（既有）+ normalize check + 对象同源；测试 8/0 | 关闭，仅回归 |
| G3 AI 修复闭环 | 闭环正确 | enrich 每轮重 validate（index.js step()）；applied=写入，语义由 validate 判定；耗尽 ok=false；commit 门禁拒落库；草稿仅会话内存 | **不修复** |
| G4 引用分级 | 双层兜底 | checkReferences 7 类全 warning（:280-283）；**runtime_repair.js 运行时自修复**（rootId 重绑 :105-109 + relations :214/:223）；locationId→_loc 降级（story.js:80-89）；currencyId→name 兜底（shop.js:149）；steps.field.key→attributes 非引用（G5-A） | **不升级 fatal**：全部有 warning+运行时层 |
| G5 运行时兼容 | 三项均无 fatal | attr_ 无回写（finish :1215-1227 复验：data 平铺 playerData，无 attributes 同步）；_loc 无 mapNodes[0] 回退（空串降级）；attributes 无 KV 装载层（消费仅 :1138 显示映射） | **最保守不实施**；两条可选 warning（U-2）收益低 |
| G6 提前返回 | 不成立（实测推翻） | 删 attributes → 十项全跑（node -e 复现）；早退仅 panels/hud 底层损坏防御分支 | **不修复**（维持前判，不重开） |
| G7 导入门禁 | **已修复** | `panelCheck.status !== 'fail'` 两仓 :500；测试 8/0 两轮回归 | 关闭，仅回归 |

## C. 横向风险

- **入口门禁**：四路径全核（主/直连/legacy 不可达/import commit）✓；**RN 导入入口未定位**（Grep rn/** 无 CardDiagnose/CardValidator/setImportedCards 匹配——RN 装载结构或路径不同）→ **U-1，证据不足**。
- **对象一致性**：诊断/入库同源（G2）；enrich/commit 单对象流 ✓。
- **状态一致性**：ok=阻断条件（G7 对齐）/fixed=确定性修复/moved=结构迁移/applied=补丁写入/valid=最终校验——语义互斥清晰 ✓。
- **重复校验**：fromDiagnose 跳 validate（诊断已跑）为合理性能选择；commit 再 validate 为必要门禁 ✓。
- **两端差异**：card_diagnose 逐字一致（行尾异）；import/ 桌面独有；story.js 同源纪律。

## D. 统一去重问题清单

| ID | 问题 | 状态 | 级别 | 最小方案 |
|---|---|---|---|---|
| U-1 | RN 导入入口的校验门禁未定位核实 | 证据不足 | 待核实 | 一次 RN 侧路径定位（Grep rn_bootstrap/App 根的导入调用链），确认走 CardDiagnose 或裸 parse |
| U-2 | G5-B（locationId 断裂）/G5-C（attr 重复 key）两条提示 | 可选 | 仅提示 | CardDiagnose 增 2 条 warning（不动 ok）；收益低，默认不做 |

**计数：必须修复 0 / 建议修复 0 / 仅提示 1（可选）/ 待核实 1 / 不修复 5（G1/G3/G4/G5-A/G6）/ 已完成 2（G2/G7）。**

## E. 推荐顺序与测试计划

1. **U-1 核实**（唯一优先项——证据缺口，一次定位即关闭；若 RN 入口无门禁则升为必须修复项另批）。
2. U-2 由用户裁决（默认不做）。
回归基线：test_g2_trace / test_g7_diagnose / p52 / p15 / p43 / RN card_compat_smoke（现行全绿状态即验收线）。

## F. 声明与证据边界

本轮零产品代码、零测试文件、零基线改动；唯一文件操作为本报告追加。证据等级：A 节调用链与 B 节 G2/G5/G6/G7 结论均有直读行号或实测复现；G4 消费端（runtime_repair）为本轮 Grep 直读（重绑逻辑 :105-109）。尚未证实：RN 导入入口（U-1）、runtime_repair 的触发时机与调用方（存在性与逻辑已见，挂载点未核）、RN 创角 UI 层逐行行为。旧结论修正记录：P-12（设计如此）、G6 原判（误读撤回）、G5 原 fatal 方案（降级）。





---

# HC 全量导入链 · 实施与双端验收轮（2026-10-17）

## 【轮次】
U-1 关闭 + G1-G7 终态复核 + 十套回归 + 双端同步验收。承接上一章《全量导入链审计 G1-G7 统一复核》。

## 【结论】
**验收通过。** U-1 关闭（RN 导入门禁完整，无需修复）；G1-G7 复核全部维持"无需修改"终态；本轮**零产品代码、零测试文件改动**，唯一文件操作为本报告追加（两仓）。十套回归 453 断言全绿。

**U-1 最终结论（RN 导入入口真实调用链，全部直读行号）：**
- 入口 A「诊断并导入」按钮（rn/screens/CardsScreen.js:552-554）→ doImport（:199-238）：加密信封检测 ExportUtil.isEnvelopeText（:206-214，P54 口令解封）→ JsonLocate.parseCardJson（:215，弯引号还原 fallback）→ **CardValidator.validate（:223）硬门禁**（必填 8 字段 + game.title + 4 数组 + panels num 2-5）→ !v.ok 报"校验失败"不入库（:224-227）→ 过则 getImportedCards+赋值+setImportedCards（:229-231）。
- 入口 B「从文件导入…」（:549-551）→ doPickCardFile（:333-369）：SAF 选文件 base64 → ImportDecode.text 判编码 → **只 setImportText 填粘贴框（:363），不自动导入**，仍需走入口 A 过 validate。
- 入口 C「导入文游资料」（:562-608）→ P15 管线：doParseMaterial→Import.run（:284）；doAiEnrichMaterial→Import.enrich（:381-383，maxRounds 3，内部过 CardValidator）；doCommitMaterial→Import.commit（:404）→ commit 门禁不过即"未落库"（:405-407）。
- 横向核查：RN 全仓 setImportedCards 写点 7 处（CardsScreen:231 新导入 / import/index.js:168,183 commit 落库 / classify.js:440、num_editor.js:196、runtime_repair.js:327、wb_common.js:59、world_setting.js:176,195、map.js:330、ui_classify_rn.js:64），除两个门禁入口外全部是**已入库卡带的编辑保存**，无绕过门禁的新导入路径。
- CardDiagnose 在 RN（rn_bootstrap.js:160 装载）仅作 JSON 提取工具（firstJsonObject/fixJSONText），RN 导入主路径不调 CardDiagnose.diagnose。

**旧结论修正两处（上章 :65 行，记录性修正）：**
1. 「import/ 管线桌面独有，RN 无此路径」→ 错误。RN CardsScreen:76/:284/:381/:404 完整接入 engine/import（两仓同源纯 JS 层）。
2. 「RN 导入走 CardsScreen→CardDiagnose」→ 错误。RN 导入走 CardsScreen→CardValidator.validate 硬门禁。

**两端门禁差异（功能深度差异，非门禁缺失）：** 桌面主路径走 CardDiagnose.diagnose 十项检查+修复（G7 后 ok 含 panelCheck）→ fromDiagnose 跳 validate（信任诊断已归一对象）；RN 主路径直接 validate 硬门禁 + JsonLocate 弯引号还原。fatal 域（必填+类型+panels num）两端一致；桌面多出的引用断裂等为 warning 级（不拦导入），RN 无该警告层属 UI 深度差异。

## 【改动】
| 文件 | 改动 | 原因 |
|---|---|---|
| docs/TRAE_REPORT.md（两仓） | 追加本章 | 信箱规则 |
无产品代码、测试、基线任何改动。G1-G7 复核结论：G1 规则一致（P52-62/63/64 证两套必填列表同元素同顺序、无版本比较）；G2 修复追踪（维持已修复）；G3 AI 闭环（维持已修复）；G4 引用断裂（runtime_repair 零改动零回归面，warning 与运行时修复分工无冲突）；G5 运行时兼容（保守口径不实施，无运行错误证据）；G6 提前返回（实测推翻，未重开）；G7 导入门禁（维持已修复）。

## 【验证】
十套回归（命令 → SUMMARY 原文）：
1. 桌面 `node tests\unit\test_g2_trace.js` → `SUMMARY: 8 passed, 0 failed`
2. 桌面 `node tests\unit\test_g7_diagnose.js` → `SUMMARY: 8 passed, 0 failed`
3. 桌面 `node tests\unit\test_p52_schema_compat.js` → `SUMMARY: 65 passed, 0 failed`
4. 桌面 `node tests\unit\test_p15_import.js` → `SUMMARY: 17 passed, 0 failed`
5. 桌面 `node tests\unit\test_p43_card_normalize.js` → `SUMMARY: 31 passed, 0 failed`
6. RN `node tools\card_compat_smoke.js` → `CARD_COMPAT_SMOKE: 24 ok, 0 failed`
7. RN `node tools\cards_smoke.js` → `CARDS_SMOKE: 35 ok, 0 failed`（C7-C12 即 RN 门禁源码断言）
8. RN `node tools\import_smoke.js` → `IMPORT_SMOKE: 130 ok, 0 failed`（IM-9o/p 落库门禁、IM-11e-j enrich 闭环）
9. RN `node tools\tool_ready_smoke.js` → `TOOL_READY_SMOKE: 60 ok, 0 failed`（白名单 81）
10. RN `node tools\p10_smoke.js` → `P10_SMOKE: 75 ok, 0 failed`
合计 453 断言 0 失败。G4 无专属单测文件（全仓无 *repair* 测试），该文件本轮零改动故无回归面。

双端同步实证：card_diagnose.js / core/card_validator.js / import/index.js / import/draft.js 四件行尾归一后 MD5 两两一致（2C067F7F…/E1FD412A…/B20D0912…/67D70B77…，均 SYNC_OK）；P15-10 断言 13 同源件逐字节相同；P43-9/W-4 同源哨兵绿。行尾规范：桌面 CRLF / RN LF，测试断言内嵌归一逻辑。

## 【遗留/下一步】
1. EXT 6 条基线红账（RN log_query/num_editor/worldbook 三套 smoke 因 EX5 授权改动基线漂移，待批复按惯例重记——与本轮导入链无关，未纳入本轮，未跑）。
2. 真机端到端（锁屏环境未覆盖；RN 门禁结论基于源码直读+源码断言+Node 行为测试三层证据）。
3. U-2（G5-B/G5-C 两条可选 warning）：默认不做，待用户裁决。
4. P52-51/52/58/61 四条【已知缺口】（旧档边缘场景，P52 测试以已知缺口形态断言在案，非本轮范围）。

---

# 轮次报告 · EXT 基线清偿 → C3 显示名 → Token/E2E 优化（2026-10-17）

## 【轮次】
三专项顺序执行（无真机测试）：① EXT 基线清偿 ② C3 显示名核查 ③ Token 与 E2E 效率优化；外加最终交付阶段发现的双端文档/断言基线附加清偿。

## 【结论】
- **阶段一 EXT 基线清偿：已修复并验收。** log_query / num_editor / worldbook 三套共 3 条失败断言，全部判定为「测试预期过时（query_portrait 授权改动后基线漂移）」，非产品缺陷；按基线漂移惯例重记（不删断言、不缩覆盖、条数不变），三套全绿。
- **阶段二 C3 显示名：部分完成。** C3 原始定义不可追溯——v3.1 审计报告随信箱覆盖式写入丢失（当时信箱规则为覆盖式），git 不可用、无备份、记忆无详情；按任务书要求如实记录阻塞原因，未编造定义。按「显示名」最强相关语义做现状核查：创角 → Alias 归一 → 存档列表显示名链路两端（桌面 story.js finish / RN create_flow_model + CreateScreen）完整无缺陷；双端补契约测试锁行为（桌面 7 断言 + RN G 组 5 断言）。
- **阶段三 Token/E2E：部分完成。** A 缓存命中：核查结论「设计已在位，无需改动」——buildStatic 一局字节稳定、_cachedStaticDynamic 缓存 + 三处失效点（loadFromSave / invalidateCache / 换卡）、applyWindow 保 system 头部、api_client._cacheUsage 解析 OpenAI/Anthropic/DeepSeek 三家缓存字段 → GameState._totalCachedTokens → ui_thinking 展示；无证据支持改动，代码零改动。命中率 / Token 消耗 **未测量**（需真实 API 采样，见遗留）。B E2E：已实施 run_batch --group 分组入口（unit / e2e / e2e-main / e2e-live，与 --only 互斥）+ tests/e2e/README「最小验证集」映射表（12 行改动域 → 套件 + 锁屏禁跑警示），四场景验证过；未删除任何断言、未合并套件。
- **附加清偿：已修复并验收。** query_portrait 批（本会话前一批）授权改动引发的双端基线未跟：claims T01、P31-8/9/19/21、P53-38/49/50/57/58、RN 文档七处数字（§4.1 表 / 基线行 / README），全部按漂移惯例重记 + 文档对齐，回归全绿。

## 【改动】
桌面仓（8 文件）：

| 文件 | 改动 | 专项/原因 |
|---|---|---|
| tests/unit/test_c3_player_name.js | 新增（4762 B，CRLF，7 断言） | 二：C3 契约测试补位 |
| tools/run_batch.js | 新增 GROUPS 表 + --group 解析（与 --only 互斥） | 三B：E2E 分组入口 |
| tests/e2e/README.md | 新增「最小验证集」映射表 + 锁屏禁跑警示 | 三B |
| docs/CONTRACTS.md :365-366 | 工具总数 80→81（18→19 核心）+ 重记注释 | 附加：基线未跟 |
| tools/claims.js（T01） | 期望 80→81、18→19 + 改动批注释（断言逻辑未动） | 附加 |
| tests/unit/test_p31_desktop_defaults.js | P31-8/9/19/21 四条期望重记 + 注释 | 附加 |
| tests/unit/test_p53_license_docs.js | P53-50 期望 80/18→81/19 + 注释 | 附加 |
| tools/README.md | T01 行 81/19 +「全量 53→58 套」+「51→58 套」+ --group 用法行 | 附加：文档对齐实测 |

RN 仓（6 文件）：

| 文件 | 改动 | 专项/原因 |
|---|---|---|
| tools/log_query_smoke.js :610-613 | prompt_builder MD5 基线重记 3BF47F14…（+19 B） | 一：EXT 漂移 |
| tools/num_editor_smoke.js :501-504 | I7 基线重记同上 | 一 |
| tools/worldbook_smoke.js :599-602 | Q 基线重记同上 | 一 |
| tools/create_flow_smoke.js :380-397 | 新增 G 组 5 条源码断言 | 二：C3 契约补位（RN 侧） |
| docs/CONVENTIONS.md | §4.1 create_flow 115→120、基线 2604→2609、:347 行文 2604→2609、§4.2 桌面 53→58 两处（删失实时长） | 附加：文档对齐实测 |
| README.md | :10 断言总数 2604→2609 + 回归 53→58 套；:300 create_flow 115→120 条 | 附加 |

两仓共用 engine 文件本轮零改动（阶段三仅核查未动码）；两仓同源状态由 test_p53 三桶断言全绿验证（strict=39 / eol=23 / diff=17，与盘上一致）。

## 【验证】
逐套（全部真实执行，SUMMARY 原行）：
1. RN `node tools\log_query_smoke.js` → `LOG_QUERY_SMOKE: 92 ok, 0 failed`
2. RN `node tools\num_editor_smoke.js` → `NUM_EDITOR_SMOKE: 72 ok, 0 failed`
3. RN `node tools\worldbook_smoke.js` → `WORLDBOOK_SMOKE: 180 ok, 0 failed`
4. 桌面 `node tests\unit\test_c3_player_name.js` → `SUMMARY: 7 passed, 0 failed`
5. 桌面 `node tools\run_batch.js --only tests/unit/test_p31_desktop_defaults.js` → `SUMMARY: 29 passed, 0 failed`
6. 桌面 `node tests\unit\test_p53_license_docs.js`（终跑） → `SUMMARY: 31 passed, 0 failed`
7. 桌面 `node tools\claims.js` → `CLAIMS: 14 ok, 0 failed, 0 known-open (共 14 项)`
8. 桌面 `node tools\run_batch.js --group unit` → `BATCH_END BATCH_FAIL=0 BATCH_SKIP=0 DURATION=9s`（40 套，前置门 PASS）
9. RN `node tools\run_all_smokes.js` → `RN_ALL_END SUITES=39 TOTAL_OK=2609 TOTAL_FAIL=0 TOTAL_SKIP=0 BAD_SUITES=0 DURATION=18s`

未运行：桌面 e2e 组 18 套（远程锁屏环境禁跑 tests/e2e/**，既定约束）；真机测试（任务书明示本轮不做）。

EXT 三条失败项处置结论（问题 → 判定 → 证据）：
- 三套 smoke 各 1 条 MD5 期望红 → 判定「测试预期过时」：prompt_builder.js:258 `_qExtLine` 含 query_portrait（+19 B，现盘 MD5 3BF47F14AC100C2A51FFBD8C9791146F），系 query_portrait 阶段二授权改动、产品行为符合设计 → 按惯例重记，断言条数不变。
- 桌面 claims T01 红 → 同判定：80 硬编码在 claims.js（实测 19 内联 + 62 动态 = 81，内联名册含 query_portrait）→ 重记。
- P31 四条 / P53 五条 → 同判定：锁旧基线的源码锚点断言与文档对齐断言（含 RN README:10 的「53 套回归」、§4.2 的「53 套」、§4.1 表 create_flow=115 与基线 2604——后者为本轮 RN 全量实测 120/2609 后发现的同批漂移）→ 重记 + 文档同步。

C3 现状核查证据链：桌面 engine/story.js finish（:1215-1227）——playerData 深拷贝 → Alias.normalize → Alias.get('name')（10 别名 + label 反查）→ 双门禁（pname 非空 && currentSaveId）→ Saves.setPlayerName；RN rn/create_flow_model.js buildPlayerData 内含 Alias.normalize(pd)，CreateScreen.js :299-302 同契约。7 断言覆盖：标准 key 回写 / playerData 落 GameState / 别名 char_name / label 反查 / 空名不写 / 无存档不写 / 源码三件套锚点。

阶段三缓存核查证据：api_client.js :221-227 _cacheUsage 解析 prompt_tokens_details.cached_tokens（OpenAI/DeepSeek）与 cache_read_input_tokens（Anthropic）；body 无 cache_control（Anthropic 显式缓存为可选建议，未实施）；prompt_builder.js buildStatic（:85-338）全部来自 card / 全局设置，一局内字节稳定。

## 【遗留/下一步】
1. **C3 原始定义不可追溯（阻塞）**：v3.1 审计报告被信箱覆盖式写入丢失，git 不可用、无备份。已按「显示名」最强相关语义核查并补双端契约测试；若 C3 另有所指，需用户重述后再核。
2. **缓存命中率 / Token 消耗未测量**：观测闭环已在位（api_client._cacheUsage → GameState._totalCachedTokens → ui_thinking「缓存命中」）。验证方法：开一局真实对局 ≥10 轮，读 UI 缓存命中字段或 GameState._totalCachedTokens；无该数据前不声称命中率提升。
3. **Anthropic 显式 cache_control**：仅建议未实施（三家自动缓存字段解析已覆盖；加 cache_control 需按消息前缀稳定性实测后再定）。
4. 真机端到端、流式模式工具块提取、长对话裁剪留存（query_portrait 批遗留，锁屏环境未覆盖）。
5. 桌面 e2e 组 18 套未跑（锁屏环境禁跑）。
6. **行尾事故自报**：本轮 tools/run_batch.js 与 tests/e2e/README.md 曾被误转 CRLF（Edit 前未检测原文件行尾，原文件本是全 LF），当轮发现并已还原为 LF，最终两文件保持原行尾；此后每处 Edit 前先行尾检测（本轮后续 9 处 Edit 均先检测，无复发）。

---

# 2026-10-17 晚 · HC 专项：历史记录 Prompt Cache 命中修复（实施完成）

【轮次】
HC-PC1（历史记录 Prompt Cache 命中修复）：历史上下文恢复 → 请求链追踪 → 根因定位 → 修复 → 双仓测试 → 回归 → 交付。本报告为此轮完整关账。

【结论】
四层级交付状态（严格区分，不混称）：
1. 代码层修复完成 ✓ —— 根因已定位并修复，engine/story.js 两仓二进制同步。
2. 自动化测试验证通过 ✓ —— 桌面 27 断言 + RN 27 断言全绿；RN 全量 40 套 2636 断言零失败；桌面 claims 14 ok + unit 组 41 套全绿。
3. 真实 API 缓存命中：未验证，待采样 —— 本环境无真实 API 凭据，采样方案见【遗留/下一步】。任何人不得把本轮结果表述为「缓存命中率已提升」。
4. Provider 适配口径：18 个 Provider 预设全部走 OpenAI 兼容 /chat/completions（api_manager.js buildUrl :213-217，无 Anthropic 原生分支）⇒ 全部依赖自动前缀缓存（按请求首 token 公共前缀匹配），Anthropic 式 cache_control 显式打点不适用、也未强行套用。

根因（代码证据，非理论猜测）：
- 旧 applyWindow 是滑动窗口：「每轮保持最近 N 轮」⇒ 窗口起点 cutIndex 随轮次每轮后移 ⇒ 相邻两次请求的历史消息段没有公共前缀 ⇒ 自动前缀缓存只能命中 system 头（system 头每轮幂等重写、字节稳定），历史段每轮全额重付。
- 该问题与「HC 内部历史读取/复用」（无缺陷）、「Provider 缓存机制」（无缺陷）均无关，纯请求组装层前缀失稳。
- 修前每请求结构：[system 稳定] + [历史段 每轮整体左移失配] + [尾部快照 固有变化]。

修复方式（最小范围，仅 story.js applyWindow 整函数 + 1 个实例字段）：
- 滑动窗口 → 锚定滞回窗口（_windowAnchor 锚定窗口起点）：
  - 锚点在位：从锚点计数，真实轮数 > 2N 才把锚点跳到「最近 N 轮」（裁法与旧版逐字一致）⇒ 两次跳锚之间窗口只增不改，历史段字节稳定；
  - 锚点为 null（进程首请 / 换档 / 被压缩清出）：按旧语义冷启动（> N 即裁回 N 轮），与 K1 契约逐字兼容；
  - maybeCompress 保留窗与裁剪窗同口径 ⇒ 裁剪后锚点落在保留区内，跨压缩请求前缀不变；生长段压缩清出锚点 ⇒ 冷启动重置（每次压缩 1 次失配，固有）；
  - 重试（retryLast）不挪锚。
- 效果：前缀失配频率从「每轮一次」降为「每 N+1 轮一次」（N = windowRounds，默认 10）。
- 代价：窗口峰值 N~2N 轮（上限由 windowRounds 控制，裁法语义不变）。
- 快照注入设计（尾部 user 副本拼 __dynamic）保留不动：每轮固有重付 = 上轮玩家输入 + 上轮回复 + 本轮快照 + 本轮输入，这是语义边界，不为缓存牺牲世界状态准确性。
- 实施中间态（已废弃，留档防复发）：曾落无状态滞回版（60279 B），自测发现两处真实缺陷——超 2N 后每轮重裁（长游戏日下退化）+ 打破 RN K1 契约（3 真实轮 + N=2 → 不裁 9 条 ≠ 期望 5 条）——随即升级为有状态锚定版。教训：窗口边界必须按「含待发输入」计数，且任何改动先过冷启动契约。

修复前后前缀稳定性对比（自动化测试实测，非推算）：

| 维度 | 修前（滑动窗口） | 修后（锚定滞回） |
|---|---|---|
| 相邻请求历史段公共前缀 | 0 条消息（cutIndex 每轮后移） | 全部携带历史（CP2：十对生长轮逐字节稳定） |
| 失配频率 | 每轮 | 每 N+1 轮一次（CP2b：14 轮里仅第 7/11 轮跳锚） |
| 锚点序列（N=3 实测） | 无锚概念 | t1×5 → t5×4 → t9×4（CP3） |
| 冷启动语义 | > N 即裁 | 逐字相同（CP8 / K1） |
| 跨压缩 | — | 保留窗内前缀不变（CP10a） |
| 窗口峰值 | 恰好 N 轮 | N~2N 轮 |

【改动】
1. engine/story.js（同源件，桌面改后 Copy-Item 二进制同步 RN）——applyWindow 整函数替换为锚定滞回版（含根因注释，现 :536-578）+ StoryLoop 声明区新增 `_windowAnchor: null` 字段。
   MD5 四格表：

   | | 桌面仓 | RN 仓 |
   |---|---|---|
   | 改前 | 59341 B / F9842BB458400F50919CB607ABF8450B | 同左（镜像） |
   | 改后 | 61200 B / 636ACD4DDD7C0B2315745DFCCAF0194E | 同左（镜像；crlf=1263 / bareLF=0 / SYNTAX_OK） |

2. tests/unit/test_cache_prefix.js（桌面新增，14929 B，CRLF）——真跑 StoryLoop.sendAction → callAI 全链（真件 story.js），mock ApiClient.chat 捕获实发 messages 深拷贝（非脱离调用链的辅助函数测试）。6 组 27 断言：连续 14 轮前缀逐字节稳定 / 跳锚仅在第 7/11 轮 / 锚点序列 / 跳锚轮裁法与旧版等价 / system 头 14 次相同 / 快照只占最后一条 user / 裸玩家输入正常入史 / 重试不挪锚 / 冷启动裁法 / 系统消息不计轮 / 跨压缩保留与冷启动重置 / K1 镜像 / 源码锚点在位。
3. D:\HippocampusRN\tools\cache_prefix_smoke.js（RN 新增，同夹具同断言 RN 版，27 断言，LF；run_all_smokes 按文件名自动发现）。
4. 文档基线重记（p53 守卫联动，按基线漂移惯例仅重记数字、不删断言不减覆盖）：RN docs/CONVENTIONS.md §4.1（39→40 套、表插 cache_prefix_smoke.js|27、基线 40 套/2636 ok）、§4.2（58→59 套）；RN README.md:10（40 套 2636 断言 + 桌面 59 套回归）；桌面 tools/README.md:37/:56（58→59 套）。

【验证】（全部原始 SUMMARY / 关键证据行，逐套列出）
- 语法与行尾：node --check → SYNTAX_OK；crlf=1263 / bareLF=0。
- 桌面新测试：node tests\unit\test_cache_prefix.js → `SUMMARY: 27 passed, 0 failed`
- RN 新测试（cwd D:\HippocampusRN）：node tools\cache_prefix_smoke.js → `CACHE_PREFIX_SMOKE: 27 ok, 0 failed`
- RN 全量：node tools\run_all_smokes.js → `RN_ALL_END SUITES=40 TOTAL_OK=2636 TOTAL_FAIL=0 TOTAL_SKIP=0 BAD_SUITES=0 DURATION=18s`
- K1 契约（RN 仓，锚定版冷启动兼容性，零断言修改）：node tests\unit\test_story_compress_unit.js → `8 passed, 0 failed`
- 桌面前置门：node tools\claims.js → `CLAIMS: 14 ok, 0 failed, 0 known-open (共 14 项)`
- 桌面文档基线：node tests\unit\test_p53_license_docs.js → `SUMMARY: 31 passed, 0 failed`（重记前 7 红：P53-37/38/40/41/42/49/57，全为新增套数/表行/基线漂移，重记后清零）
- 桌面 unit 组：node tools\run_batch.js --group unit → `BATCH_END BATCH_FAIL=0 BATCH_SKIP=0 DURATION=9s`（41 套全绿，含 test_cache_prefix 27p / test_p53_license_docs 31p / test_logger_v4 38p / test_p54_story_channel 21p）
- 桌面 e2e：未跑（任务书第六节明确避免无关全量 E2E 重复消耗；本轮改动仅请求组装层，e2e 不覆盖请求前缀字节）。
- 真机测试：未做（任务书第六节明确不做）。

【遗留/下一步】
1. 真实 API 缓存命中采样（待用户执行；本轮标「待真实 API 验证」，不声称已提升）：
   - 目的：实测修复后历史段缓存命中，验证自动化结论在真实 Provider 上成立。
   - 前置：桌面端 + 任一 OpenAI 兼容 Provider。推荐 DeepSeek（usage 直接给 prompt_cache_hit_tokens / prompt_cache_miss_tokens，最直观）；OpenAI 系给 prompt_tokens_details.cached_tokens 亦可。
   - 步骤：
     a. 设置页配置 API key 并激活该 Profile（建议关闭流式，便于逐轮确认 usage）；
     b. 打开任一卡带开局；
     c. 连续输入 ≥12 轮普通剧情输入（不换档、不换存档；windowRounds 默认 10 时建议 ≥25 轮，可观察到一次跳锚）；
     d. 每轮回复后展开该轮「思考」折叠面板（think-panel），抄录：输入 / 输出 / 总计 / 缓存命中 / 写缓存 五个数 + 本轮耗时；
     e. 预期形态：第 1 轮 miss（写缓存或全 0）；第 2 轮起「缓存命中」≈ 上一轮输入量（system + 历史段全部命中）；跳锚轮（默认 N=10 时约第 21 轮起每 11 轮一次）命中回落一次、随后恢复增长；「写缓存」DeepSeek 通常不报（归 0 正常）；
     f. 记录表字段：轮次 / Provider / 模型 / 输入 / 缓存读 / 缓存写 / 输出 / 耗时。只记 Provider 实际返回值，不推算、不编造命中率。
   - 判读口径：若第 2 轮起「缓存命中」持续只等于 system 头量级（远小于 prompt_tokens − 本轮新增），说明仍有前缀失稳，回报即可。
2. 中间态无状态滞回版已废弃留档（见【结论】），不回退。
3. 后续可选（未排期，纯 UI 本轮不碰）：在 ui_thinking 上把「跳锚轮」标注为预期行为，减少观感困惑。
4. RN 真机回归：本轮无真机测试；story.js 同源件已二进制同步、RN 全量 smoke 已覆盖，装机验证随下次真机批次顺带。

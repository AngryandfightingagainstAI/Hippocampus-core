# Hippocampus RN · 分层公约与跑测口径 v1

本文档是**手机版仓（`D:\HippocampusRN`）**的公约，对应桌面仓的
`docs/CONVENTIONS.md`（分层公约 v1）。桌面仓那份解决的是「迁移到 RN 之前别加迁移成本」，
这一份解决的是**迁移之后、两仓并行维护**的三件事：

1. `rn/` 与 `engine/` 的分工边界（谁可以依赖 React Native，谁绝对不行）
2. **同源件**清单与同步办法（哪些文件两仓必须逐字节相同，怎么证）
3. 跑测口径（怎么跑、cwd 口径、断言数怎么数、本轮红线）

使用方式：
- 改 `engine/**` 前先看【二】：如果目标文件在同源件清单里，**必须同时改另一仓**
- 加新引擎模块后先看【三】：不在 `rn/rn_bootstrap.js` 里 `load()` 就永远不会执行
- 交报告前先看【四】【五】：跑测路径与断言计数口径写死在这里，踩过的坑不再踩第二次

================================================================
【一、两仓关系与三层归属】
================================================================

| | 桌面仓 | 手机版仓 |
|---|---|---|
| 路径 | `D:\AI文游\神秘小引擎测试版\神秘小引擎测试版` | `D:\HippocampusRN` |
| 运行时 | Electron 44.3.0 + 普通 JS | React Native 0.87.1 / Hermes |
| 模块系统 | 无。`index.html` 里 `<script src>` 顺序加载，靠 `window` 全局交接 | Metro。`require()` 静态收集，`rn/rn_bootstrap.js` 统一装载到 `globalThis` |
| UI | `index.html` + `engine/ui_*.js`（手写 DOM） | `rn/**`（React 组件） |
| 存档 | VFS → localStorage（leveldb） | VFS → op-sqlite（`hippocampus_vfs.db`） |

`engine/**` 与 `vfs/**` 是**跨平台纯逻辑**：它们只通过 `Platform.*` 与宿主通信。
分层沿用桌面仓的三分类（A 类纯逻辑 / B 类平台依赖 / C 类混合），判定标准不变。

### 1.1 `rn/` 的目录职责

| 目录 | 职责 |
|---|---|
| `rn/rn_bootstrap.js` | **唯一模块装载入口**。`load(name, thunk, extra)`：`globalThis[name] = exp`，第三参数把 `exp[extra]` 也挂到全局（例：`load('ImportParseTextlike', …, 'ImportHtml')`）。缺 `extra` 时 `ImportParseArchive` 的 epub 分支就找不到 `ImportHtml` |
| `rn/rn_platform.js` | **原生能力注册表**。`Platform.ui.*` / `Platform.http` / `Platform.storage`。`engine/**` 只认这里的名字 |
| `rn/screens/` | 页面：`HomeScreen` / `StoryScreen` / `SettingsScreen` / `CardsScreen` / `SavesScreen` / `CreateScreen` / `PortraitScreen` / `ClassifyScreen` |
| `rn/screens/settings/` | 设置页十页（`ApiTab` … `WeatherTab`）+ `WorldBookTab` + `worldbook/` 十二个编辑器 |
| `rn/panels/` | 16 个面板 + `panel_data.js`（数据层）+ `NpcUpdateModal.js` |
| `rn/components/` | `SidebarDrawer` / `PanelHost` / `OverlayHost` / `ThinkingBlock` / `InfoPhonePanel` / `ShopModal` / `InstructionModal` / `BackgroundLayer` / `settings/controls.js` |
| `rn/*.js`（顶层） | 各页的 store / model：`story_store` / `story_changes` / `story_runtime` / `story_proposals` / `home_model` / `create_flow_model` / `settings_model` / `nav_store` / `navigation` / `shop_store` / `snapshot_actions` / `theme_tokens` / `use_theme` / `export_util` / `empty_texts` / `instruction_templates` / `storage_warn` / `ui_portrait_rn` / `ui_classify_rn` / `npc_actions_rn` |
| `engine/**` | 引擎逻辑（大多数与桌面仓同源，见【二】） |
| `vfs/**` | VFS、`logger.js`、`saves.js`、`storage_adapter.js` |
| `platform/platform_adapter.js` | 宿主适配（两仓同源） |
| `tools/*_smoke.js` | 37 套冒烟（见【四】） |

### 1.2 硬规则

1. **`engine/**` 里禁止 `import`/`require` React Native**。要访问原生能力，只在 `rn/rn_platform.js`
   注册 `Platform.xxx`，`engine/**` 侧按需调用。有探针可查：`%TEMP%\p13_bridge.js`
   （列出 `engine/**` 用到的全部 `Platform.ui.*` 方法并比对注册表，MISSING 必须为 0；最近一次实测
   engine 侧用到 20 个方法、全部已注册）。
2. **新增引擎模块必须同时在 `rn/rn_bootstrap.js` 里 `load()`**，否则 `engine/**` 里
   `typeof SomeModule !== 'undefined'` 的判断会静默走 false 分支，功能「加了但没生效」。
   必须按**依赖顺序**插入。
3. **样式只用 theme tokens**（`rn/theme_tokens.js` 的 `tk` / `c` / `f`），
   不许出现字面量色值（`#rrggbb` / `rgba(...)`）与字面量字号。守护断言在
   `tools/theme_tokens_smoke.js`。
4. **`engine/**` 不碰 DOM**。`window` / `localStorage` 只允许出现在两仓同源的 polyfill 型文件里
   （`vfs/local_store.js`、`vfs/storage_adapter.js`），且必须能在 RN 下被宿主实现替换。
5. **中文标点不要用 `edit` 类工具改**：全角标点会被 ASCII 化。改含中文的文件请用 Node 脚本
   （读 → `split`/`join` 精确替换 → 写回），并让脚本对每个锚点断言「命中恰好 1 次」+ 写回后自证。

================================================================
【二、同源件（两仓必须逐字节相同）】
================================================================

**判定口径**：同一相对路径在两仓都存在，且字节内容**完全一致**（Node 逐文件 md5 相等）。
判定脚本不能靠记忆，必须现算（`%TEMP%\p13b_shared.js`；P53 口径：遍历两仓 `.js`，排除
`node_modules` / `android` / `build` / `dist` / `docs` / `ios` / `vendor` / `.git`，
对两边都存在的相对路径按字节分三桶）。

最近一次实算（P53）：**逐字节相同 38 个**、**仅行尾不同 22 个**、**真差异 18 个**，
合计 78 个同名 `.js`。三桶的计数与下面三张清单都由桌面仓守卫
`tests/unit/test_p53_license_docs.js` 现算比对 —— 盘上文件变了而这里没同步，那套测试会红。

**逐字节相同**（38 个；改任何一个都必须两仓同步、连行尾一起）：

```text
# 逐字节相同
engine/background.js
engine/card_display.js
engine/core/api_client.js
engine/core/tool_executor.js
engine/destiny.js
engine/error_log_core.js
engine/import/decode.js
engine/import/draft.js
engine/import/formats.js
engine/import/index.js
engine/import/middle.js
engine/import/parsers/archive.js
engine/import/parsers/pdf.js
engine/import/parsers/textlike.js
engine/import/pipeline.js
engine/import/report.js
engine/import/unzip.js
engine/import/vault.js
engine/info_feed.js
engine/log_query.js
engine/npc_runtime.js
engine/outputs.js
engine/portrait.js
engine/proposals.js
engine/story.js
engine/words.js
tools/background_smoke.js
tools/claim_fact_smoke.js
tools/endings_gate_smoke.js
tools/import_smoke.js
tools/info_tick_smoke.js
tools/outputs_review_smoke.js
tools/proposal_audit_smoke.js
tools/source_readable_smoke.js
tools/tool_ready_smoke.js
tools/version_sync_smoke.js
vfs/local_store.js
vfs/storage_adapter.js
```

**仅行尾不同**（22 个；PC 全 CRLF、RN 全 LF，把 `\r\n` 归一成 `\n` 后逐字符相同。
这类**不是内容不同**：P13 时曾把其中一部分误列进「内容不同」）：

```text
# 仅行尾不同
engine/achievements.js
engine/alias.js
engine/calendar.js
engine/card_diagnose.js
engine/core/card_validator.js
engine/core/cards_demo.js
engine/dice.js
engine/dice_history.js
engine/endings.js
engine/events.js
engine/proposal_semantic_check.js
engine/proposal_validator.js
engine/runtime_repair.js
engine/shop.js
engine/snapshots.js
engine/status_card.js
engine/story_nodes.js
engine/tasks.js
engine/theme.js
templates/number.js
templates/relation.js
vfs/logger.js
```

**真差异**（18 个；按各自仓的语义改，逻辑对齐靠测试而不是靠字节）：

```text
# 真差异
engine/api_manager.js
engine/audit.js
engine/avatar.js
engine/classify.js
engine/core/gamestate.js
engine/core/prompt_builder.js
engine/core/storage.js
engine/npc_deduction.js
engine/npc_deduction_ai.js
engine/realtime.js
engine/weather.js
engine/web_search.js
platform/platform_adapter.js
tools/longline_token_smoke.js
tools/npc_boundary_smoke.js
vfs/saves.js
vfs/vfs.js
vfs/vfs_guard.js
```

### 2.1 同步办法

1. 改之前：先算两仓该文件的 md5。**改前必须相等**（不相等说明它本来就不是同源件，别硬同步）。
2. 改之后：两仓都要改成同一份字节（通常是一边写好、另一边**直接复制文件**，不要手改两遍）。
3. 交报告时给**四格表**：`改前/改后 × 桌面/RN`，每格写 **字节数 + MD5 + 行尾**（CRLF 数、lone LF 数、逻辑行数三个数一起给）。
4. 行尾也必须一致。历史上出现过「只改行尾导致 MD5 变化、但打包产物 MD5 不变」的假象
   （P12 那次 APK 与前一版同 MD5，就是因为 Metro 规范化了行尾）。所以同源件要连行尾一起对齐。

### 2.2 同源哨兵（改单边就会红的既有断言）

| 守卫在哪 | 守什么 |
|---|---|
| 桌面 `tests/unit/test_p15_import.js:93,98` | `engine/import/**` 12 个模块 + `tools/import_smoke.js` 逐字节相同 |
| 桌面 `tests/unit/test_p16_tool_ready.js:29,134` | `tools/tool_ready_smoke.js` 两仓逐字节相同 |
| 桌面 `tests/unit/test_p16_instruction.js:26`、`test_p43_card_normalize.js:38` | `rn/instruction_templates.js` 卡带指令模板两仓一致 |
| 桌面 `tests/unit/test_p16c_info_tick.js:114-115` | `tools/info_tick_smoke.js`、`engine/info_feed.js` 逐字节相同 |
| 桌面 `tests/unit/test_p24_endings_gate.js:22,86` | `tools/endings_gate_smoke.js` 及 SAME 清单（行尾归一比对） |
| 桌面 `tests/unit/test_p26_source_readable.js:91,103` | `tools/source_readable_smoke.js` 及 SAME 清单 |
| 桌面 `tests/unit/test_p27_outputs_review.js:84` | `tools/outputs_review_smoke.js` 及 SAME 清单 |
| 桌面 `tests/unit/test_p28_background.js:73,78` | `tools/background_smoke.js`、`engine/background.js` 及 SAME 清单 |
| 桌面 `tests/unit/test_p49_version_sync.js:29` | `tools/version_sync_smoke.js` + 版本三处同值 |
| 桌面 `tests/unit/test_p53_proposal_audit.js:78,94` | `engine/error_log_core.js`（逐字节）、`engine/proposal_validator.js`（行尾归一）、`tools/proposal_audit_smoke.js`（逐字节） |
| 桌面 `tests/unit/test_p53_license_docs.js` | 本文三桶计数/清单与盘上现算一致、README 与 `tools/README.md` 的套数断言数 |
| RN `tools/log_query_smoke.js:578-579` / `:597-598` | `vfs/logger.js` / `engine/info_feed.js` 逐字节相同 |
| RN `tools/num_editor_smoke.js:317-318,322-329` | `templates/number.js`、`templates/relation.js` 逐字节相同 |
| RN `tools/num_editor_smoke.js:331-339` | 桌面 `engine/editor.js` → RN `engine/num_editor.js` 的移植保真 |
| 桌面 `tests/unit/test_p14_claim_fact.js:26` | `tools/claim_fact_smoke.js` **只管存在**（两仓同源没有专门断言，靠本节现算清单） |

### 2.3 ⚠ 同名但**不同源**（最容易误判）

- 唯一准确的清单是上面那张【真差异】表（18 个），它是**现算**出来的，别凭记忆。
- `tools/longline_token_smoke.js`、`tools/npc_boundary_smoke.js`：两仓**同名、内容不同**，
  各自写各自的夹具，**不要互相同步**。
- `tools/p10_smoke.js`、`tools/story_smoke.js`、`tools/home_smoke.js` 等：**RN 仓独有**；
  桌面仓的对应覆盖在 `tests/unit/`、`tests/e2e/` 下，**文件名不同**，不存在同源关系。
- `engine/core/prompt_builder.js`、`engine/core/storage.js`、`engine/api_manager.js`、`engine/web_search.js`、
  `platform/platform_adapter.js`、`vfs/vfs.js`、`vfs/saves.js` 等 18 个：两仓**都有但内容不同**（平台差异，
  例如桌面 `storage.js` 多一行「平台依赖：localStorage，RN 侧换 SecureStore」声明）。
- 反过来，这些曾被误判成「内容不同」，P53 现算确认是**逐字节相同**：`engine/story.js`、`engine/core/api_client.js`、`engine/core/tool_executor.js`。
- 这些曾被误判成「内容不同」，P53 现算确认属于**仅行尾不同**：`engine/theme.js`、`engine/endings.js`、`engine/events.js`、`engine/proposal_validator.js`。

================================================================
【三、`rn/rn_bootstrap.js` 装载约定】
================================================================

- 当前 **65 个 `load()` 调用**（`grep -c '^\s*load(' rn/rn_bootstrap.js`）。
- 每个 `load(name, () => require('../engine/xxx.js'), extra?)`，`require` 参数必须是**字面量字符串**
  （Metro 只静态收集字面量；拼出来的路径不进 bundle）。
- `load` 失败只打 `BOOTSTRAP_FAIL: …` 然后继续，**不抛** ⇒ 少一个模块不会立刻崩，
  而是功能静默失效。所以 `tools/polyfill_smoke.js` 与 `tools/theme_tokens_smoke.js` 里都有一条
  「BOOTSTRAP n ok, 0 failed」断言，**模块数变化时必须同步更新那个数字**
  （先例：P15 加导入层 12 个模块，BOOTSTRAP 51 → 63，两个 smoke 的硬编码 51 必须跟着改）。
- P15 导入层 12 个模块的装载顺序（依赖顺序，不能乱）：
  `ImportDecode → ImportFormats → ImportMiddle → ImportReport → ImportUnzip →
   ImportParseTextlike(+extra ImportHtml) → ImportParseArchive → ImportParsePdf →
   ImportPipeline → ImportVault → ImportDraft → Import`。

================================================================
【四、跑测口径】
================================================================

### 4.1 RN 侧（37 套）

**cwd 随意（P54 实测订正）**：所有 smoke 都用 `__dirname` 锚定仓根（`tools\*.js` 里
`process.cwd()` 真实调用 **0 处**），babel 也显式传了 `configFile`，所以从任何目录跑结果都一样。
实测：从 `%TEMP%` 直跑 16 套（含 5 套头部注释仍写「cwd 必须是仓根」的 `claim_fact` / `import` /
`p10` / `log_query` / `npc_boundary`）断言数与仓根**逐字相同**；从 `%TEMP%` 直跑整个跑批器同样是
`RN_ALL_END SUITES=37 TOTAL_OK=2502 TOTAL_FAIL=0 TOTAL_SKIP=0 BAD_SUITES=0`。
在仓库根下跑仍是最省事的习惯，但不再是硬约束。
（注：约 19 个 `tools\*.js` 的头部注释还留着「cwd = RN 仓根」的旧口径，属过时注释，本次未逐条订正。）

```powershell
cd D:\HippocampusRN
node tools\import_smoke.js
# 一键全跑（P53 起用这个，跑批器在仓库内、自己定位仓根；旧的 %TEMP%\p13_run_rn.ps1 已废）
node tools\run_all_smokes.js
node tools\run_all_smokes.js --list       # 只列套件
node tools\run_all_smokes.js --only a,b   # 只跑指定套件
```

| 套件 | 断言 |
|---|---|
| `background_smoke.js` | 37 |
| `cache_usage_smoke.js` | 12 |
| `card_compat_smoke.js` | 24 |
| `card_import_smoke.js` | 25 |
| `cards_smoke.js` | 35 |
| `claim_fact_smoke.js` | 44 |
| `create_flow_smoke.js` | 115 |
| `create_smoke.js` | 23 |
| `endings_gate_smoke.js` | 27 |
| `file_picker_smoke.js` | 51 |
| `h6_panels_smoke.js` | 137 |
| `home_smoke.js` | 89 |
| `image_smoke.js` | 39 |
| `import_smoke.js` | 130 |
| `info_phone_smoke.js` | 45 |
| `info_tick_smoke.js` | 14 |
| `log_query_smoke.js` | 92 |
| `longline_token_smoke.js` | 22 |
| `mobile_ux_smoke.js` | 83 |
| `npc_boundary_smoke.js` | 36 |
| `num_editor_smoke.js` | 72 |
| `outputs_review_smoke.js` | 77 |
| `p10_smoke.js` | 75 |
| `p1_settings_smoke.js` | 202 |
| `panels_smoke.js` | 102 |
| `polyfill_smoke.js` | 22 |
| `proposal_audit_smoke.js` | 19 |
| `saves_smoke.js` | 17 |
| `settings_smoke.js` | 144 |
| `source_readable_smoke.js` | 23 |
| `story_smoke.js` | 195 |
| `theme_switch_smoke.js` | 22 |
| `theme_tokens_smoke.js` | 146 |
| `tool_ready_smoke.js` | 60 |
| `version_sync_smoke.js` | 15 |
| `web_search_smoke.js` | 51 |
| `worldbook_smoke.js` | 180 |

**当前基线：37 套 / 2502 ok / 0 failed。**

### 4.2 桌面侧

```powershell
cd 'D:\AI文游\神秘小引擎测试版\神秘小引擎测试版'
node tools\claims.js                      # 前置门：14 项（期望 14 ok / 0 known-open）
node tools\run_batch.js                   # 前置门 + 全量（51 套）
node tools\longline_token_smoke.js        # 36 回合长线预算
node tools\prompt_budget_smoke.js         # 预算降级阶梯
node tools\import_smoke.js                # 导入层（与 RN 同源，130 条）
```

**当前基线：51 套全绿（约 340 s；`claims.js` 是前置门 —— 门红则一个测试都不跑）。**

### 4.3 环境坑（都真踩过）

- **受限沙箱会造出假红**：`run_batch` 里用 Electron 的 18 套会报 `electron.launch: spawn EPERM`；
  `tools/prompt_budget_smoke.js` 与 `tools/import_smoke.js` 里 `child_process` 的
  **piped stdio**（`{stdio:'pipe'}`）也会 EPERM。这不是产品缺陷 —— 跑批要提权，或改用
  **文件 fd 捕获**（`{stdio:['ignore', fd, fd]}`，桌面 `tests/unit/test_p15_import.js` 就是范例）。
- **`node xxx.js 2>&1 | Select-String …` 会让 PowerShell 报假的 `[exit code: 1]`**。
  判退出码必须：`node xxx.js > $env:TEMP\o.txt 2>&1; "EXIT=$LASTEXITCODE"`。
- **不要用 PowerShell 聚合算指纹**（`Set-Content` + `Get-FileHash` 曾对同一组文件算出两个值）。
  一律用 Node 逐文件 `crypto.createHash('md5')`。
- **`adb devices` 为空但设备管理器能看到设备**时，`adb kill-server` + `start-server` 即可识别，
  不是线/驱动问题。
- **`adb exec-out screencap -p` 必须走 `cmd /c "… > file"`**，PowerShell 的 `>` 会写坏 PNG。
- **`adb shell input text` 的参数以 `#` 开头会被远端 shell 当注释**，要加引号。

### 4.4 单元测试（P54·第15条）

`tools/*_smoke.js` 是集成测试（走真实模块 + 真实存储），断言多但定位 bug 慢；
`tests/unit/*_unit.js` 用纯 node + `vm` 沙箱把**单个模块的边界行为**夹到台面上
（缺失字段补齐、未知枚举回落、坏档降级、工具块上限……），零新依赖、秒级。

```powershell
cd D:\HippocampusRN
node tools\run_unit_tests.js              # 跑批（扫描 tests/unit/*_unit.js）
node tests\unit\test_info_feed_unit.js    # 单跑其中一套
```

- **当前基线：4 套 / 59 条断言全绿**（`test_proposal_validator_unit.js` 17 条、
  `test_info_feed_unit.js` 17 条、`test_tool_executor_unit.js` 18 条、
  `test_outputs_unit.js` 7 条）。
- **不计入 smoke 基线**：`tools/run_all_smokes.js:39` 只扫 `/_smoke\.js$/`，本目录只匹配
  `/_unit\.js$/`，两条线互不包含 —— 所以补单测不会改动「37 套 / 2502 条」这组数字。
- 公共脚手架 `tests/unit/_harness.js`（下划线开头，不被当套件）：`makeVFS` 内存文件表
  （坏 JSON 返回 null，与 `vfs/vfs.js:66` 同行为）、`makeSandbox` 注入最小假件（含
  `setTimeout` 等定时器桩 —— 引擎件在模块级会排布定时器，缺了它整组会报
  `setTimeout is not defined`）、`load(sb, 'engine/...')` 按仓根加载、`run/eq/deepEq/ok/contains/noThrow/finish`。
- 被测的四个模块（`engine/proposal_validator.js`、`engine/info_feed.js`、
  `engine/core/tool_executor.js`、`engine/outputs.js`）都是**两仓同源件**；本轮单测只落在手机仓 ——
  桌面侧若要复用，须连带更新「51 套」这组口径及其守卫（`test_p53_license_docs.js` P53-49…57）。
- 单测也是「语义收口」的落地护栏：`test_outputs_unit.js` 锁住 P54·第12条的 O-3（手动/AI 定论
  与 tick 共用 `_settle` ⇒ 一定应用 `settleRules.affects`、一定推系统通知）与 O-5（送审失败不把
  已定论打回 `pending`，正文不掉出提示词）。

================================================================
【五、断言计数与报告口径】
================================================================

1. **以每套输出最后一行汇总为准，不许逐套累加所有 `N ok` 行。**
   `theme_tokens_smoke` 内嵌一行 BOOTSTRAP 汇总、`polyfill_smoke` 会印两行 ——
   累加会得出虚高值（P12 时累加得 1897，真值 1795）。
2. **基线只增不减**。新增断言计入总数；要删断言必须逐条说明理由并给出替代断言。
3. **每个改动先红后绿**。红证要能指出「哪一条断言红了、红在什么数字上」；
   不许用「跑一遍没事」代替红证。
4. **禁止掩盖式修法**：去重、截断、加计数上限、把断言放宽到恒真，都不允许。
5. 报告里每个改动过的文件都要给 **字节 / MD5（改前→改后）/ 行尾**。
6. **改了 RN 产品文件（`rn/**`、`engine/**`、`vfs/**`）就必须重打包 + 装机 + 记录
   `lastUpdateTime` + 冷启动截图**：

   ```powershell
   cd D:\HippocampusRN\android
   $env:ANDROID_HOME='D:\AndroidSdk'; $env:JAVA_HOME='D:\java'
   .\gradlew.bat assembleRelease --console=plain     # 看 "N executed" 而不是全 up-to-date
   adb install -r -i com.android.vending app\build\outputs\apk\release\app-release.apk
   adb shell dumpsys package com.hippocampusrn | Select-String lastUpdateTime
   ```

   装机后应 `adb pull` 设备上的 `base.apk` 与本地构建产物比对，**逐字节相等**才算证真。

   **ABI 口径（P54·第 9 条）**：`android/gradle.properties` 的 `reactNativeArchitectures` 决定包里带哪几套原生库。
   当前只留 `arm64-v8a`——同一份源码实测：四 ABI 全打 **62,967,094 B**，只留 `arm64-v8a` 后 **22,005,657 B**
   （原生库 14,578,360 B）。改 ABI 属于「打包口径变更」，必须在报告里写清新旧体积与包含的 ABI 清单；
   历史归档件名里的 `-universal-` 是旧口径，不要据此推断当前包的 ABI 覆盖。

================================================================
【六、本轮批次红线（P13·B / P15）】
================================================================

- 不加新依赖（`@react-native-documents/picker` 之类**未获批**前不许装）。
- 不动证据目录（`docs/shots_*/`、`docs/_archive/`）。
- 跑批**不带** `KEEP_S_SHOTS`；跑完核截图基线（Node 逐张 SHA256）。
- `docs/TRAE_REPORT.md` 覆盖前先归档到 `docs/_archive/TRAE_REPORT_P12.md`。
- 全中文注释与文档；`docs/_archive/**` 里的历史报告**不要改**（那是历史快照，
  里面写「桌面 7 档」是对的，因为当时就是 7 档）。

================================================================
【七、发布口径（P53 起）】
================================================================

- **版本号三处同值**：`package.json.version`、`android/app/build.gradle` 的 `versionName`（`versionCode` 同步抬）、
  `package-lock.json` 根字段。守卫 `tools/version_sync_smoke.js`（VS-*）。当前 **1.3.0 / versionCode 10300**。
- **许可**：MIT，全文在仓内 `LICENSE`；`package.json` 的 `license` 字段也必须是 `MIT`。
  两仓 `LICENSE` 逐字节相同（守卫：桌面 `tests/unit/test_p53_license_docs.js`）。
- **CI**：`.github/workflows/smoke.yml` —— `main` push / PR / 手动触发，Node 22，
  `npm ci --ignore-scripts --no-audit --no-fund` 之后跑 `node tools/run_all_smokes.js`（37 套）。
  桌面仓**暂不接 CI**（19 套 e2e 需要 Electron + 显示），发布前在本机跑 `node tools/run_batch.js` 全量。
  失败时把脚本自带的 `rn_all_*.log`（每套 stdout+stderr 原样，含失败套件名）作为 artifact `rn-smoke-log` 上传：
  P54 实测同一个提交 `791c7fd` 在 CI 上出现过红（run #5）/ 绿（run #6）两次结果，而失败时 API annotations
  只有退出码、job 日志下载需鉴权 —— 有 artifact 才能事后定位是哪套件红的。
  跨仓断言在**单仓环境**（CI 只有手机仓）下自动降级为 SKIP，汇总行输出 `TOTAL_SKIP=`：
  CI 实测 **10 条 SKIP / 2485 ok / 0 failed**（实测于提交 `66fe662`、CI run `38275495453`；当时记 10 条是因为
  `tools/num_editor_smoke.js` 的 H 组用 1 条组级 skip 吞掉 8 条断言 —— P54·④ 已改为逐条记 skip，
  同一单仓环境现为 **17 条 SKIP / 2485 ok / 0 failed**，这样 SKIP 数才等于真正没跑的断言数；
  此后本机新增 7 条断言，故当前单仓环境的执行数是 `2485 + 7 = 2492`，总断言数 `2495 + 7 = 2502` 与下一行的本机数同源）；本机两仓同在时 `TOTAL_SKIP=0` / 2502 ok。
- **文档数字**：README / 本文件 / **桌面仓**的 `tools/README.md` 里的套数、断言数、同源三桶计数都由
  桌面 `tests/unit/test_p53_license_docs.js` 现算比对；改数字必须连同文档一起改，否则批跑红。
- **跨仓路径与降级开关（P54 起）**：跨仓断言用三个环境变量定位「另一个仓」，不设时回落到本机默认路径 ——
  `HIPPOCAMPUS_PC`（桌面仓根）、`HIPPOCAMPUS_RN`（手机仓根）、`HIPPOCAMPUS_RN_RUNNER`（交付根的全量入口
  `p24_rn_all.js`，只被桌面 `tests/unit/test_p49_version_sync.js` 用）。另一仓不可见时相应断言自动降级为
  SKIP（不设变量、机器上只有一个仓也能跑绿）。单仓模拟跑法：把 `_p53_ci_sim.js` 复制到 `%TEMP%` 并用正斜杠路径
  `NODE_OPTIONS="--require <路径>" node tools/run_all_smokes.js`；桌面侧对应
  `HIPPOCAMPUS_RN='D:\__none__' node tools/run_batch.js`（注意 `NODE_OPTIONS` 会吞反斜杠）。

---

**版本**：v2（P53 文档口径统一）
**对应桌面仓**：`docs/CONVENTIONS.md`（分层公约 v1）

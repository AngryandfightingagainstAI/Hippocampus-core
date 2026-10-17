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

最近一次实算（净化批 EX7 后重记，2026-10-17）：**逐字节相同 39 个**、**仅行尾不同 23 个**、**真差异 17 个**，
合计 79 个同名 `.js`。三桶的计数与下面三张清单都由桌面仓守卫
`tests/unit/test_p53_license_docs.js` 现算比对 —— 盘上文件变了而这里没同步，那套测试会红。

**逐字节相同**（39 个；改任何一个都必须两仓同步、连行尾一起）：

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
platform/platform_adapter.js
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

**仅行尾不同**（23 个；PC 全 CRLF、RN 全 LF，把 `\r\n` 归一成 `\n` 后逐字符相同。
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
vfs/secure_envelope.js
```

**真差异**（17 个；按各自仓的语义改，逻辑对齐靠测试而不是靠字节）：

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

- 唯一准确的清单是上面那张【真差异】表（17 个），它是**现算**出来的，别凭记忆。
- `tools/longline_token_smoke.js`、`tools/npc_boundary_smoke.js`：两仓**同名、内容不同**，
  各自写各自的夹具，**不要互相同步**。
- `tools/p10_smoke.js`、`tools/story_smoke.js`、`tools/home_smoke.js` 等：**RN 仓独有**；
  桌面仓的对应覆盖在 `tests/unit/`、`tests/e2e/` 下，**文件名不同**，不存在同源关系。
- `engine/core/prompt_builder.js`、`engine/core/storage.js`、`engine/api_manager.js`、`engine/web_search.js`、
  `vfs/vfs.js`、`vfs/saves.js` 等 17 个：两仓**都有但内容不同**（平台差异，
  例如桌面 `storage.js` 多一行「平台依赖：localStorage，RN 侧换 SecureStore」声明）。
- 反过来，这些曾被误判成「内容不同」，现算确认是**逐字节相同**：`engine/story.js`、`engine/core/api_client.js`、`engine/core/tool_executor.js`、`platform/platform_adapter.js`（末者原在真差异桶，2026-10-17 净化批 EX2/EX5 两侧改同一刀后 Copy-Item 二进制同步，转同源）。
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

### 4.1 RN 侧（40 套）

**cwd 随意（P54 实测订正）**：所有 smoke 都用 `__dirname` 锚定仓根（`tools\*.js` 里
`process.cwd()` 真实调用 **0 处**），babel 也显式传了 `configFile`，所以从任何目录跑结果都一样。
实测：从 `%TEMP%` 直跑 16 套（含 5 套头部注释仍写「cwd 必须是仓根」的 `claim_fact` / `import` /
`p10` / `log_query` / `npc_boundary`）断言数与仓根**逐字相同**；从 `%TEMP%` 直跑整个跑批器同样是
`RN_ALL_END SUITES=38 TOTAL_OK=2585 TOTAL_FAIL=0 TOTAL_SKIP=0 BAD_SUITES=0`（38 套时期的实测；
P54·第17条 stage 2 复测时 cwd =
工作目录 `D:\AI文游\神秘小引擎测试版`，同样逐字相同）。
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
| `cache_prefix_smoke.js` | 27 |
| `cache_usage_smoke.js` | 12 |
| `card_compat_smoke.js` | 24 |
| `card_import_smoke.js` | 25 |
| `cards_smoke.js` | 35 |
| `claim_fact_smoke.js` | 44 |
| `create_flow_smoke.js` | 120 |
| `create_smoke.js` | 23 |
| `dice_history_smoke.js` | 19 |
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
| `secure_envelope_smoke.js` | 83 |
| `settings_smoke.js` | 144 |
| `source_readable_smoke.js` | 23 |
| `story_smoke.js` | 195 |
| `theme_switch_smoke.js` | 22 |
| `theme_tokens_smoke.js` | 146 |
| `tool_ready_smoke.js` | 60 |
| `version_sync_smoke.js` | 15 |
| `web_search_smoke.js` | 51 |
| `worldbook_smoke.js` | 180 |

**当前基线：40 套 / 2636 ok / 0 failed。**

### 4.2 桌面侧

```powershell
cd 'D:\AI文游\神秘小引擎测试版\神秘小引擎测试版'
node tools\claims.js                      # 前置门：14 项（期望 14 ok / 0 known-open）
node tools\run_batch.js                   # 前置门 + 全量（60 套）
node tools\longline_token_smoke.js        # 36 回合长线预算
node tools\prompt_budget_smoke.js         # 预算降级阶梯
node tools\import_smoke.js                # 导入层（与 RN 同源，130 条）
```

**当前基线：59 套全绿（`claims.js` 是前置门 —— 门红则一个测试都不跑）。**

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

- **当前基线：11 套 / 175 条断言全绿**（`test_proposal_validator_unit.js` 17 条、
  `test_info_feed_unit.js` 33 条、`test_tool_executor_unit.js` 18 条、
  `test_outputs_unit.js` 30 条、`test_json_extract_unit.js` 14 条、
  `test_story_compress_unit.js` 8 条、`test_story_channel_unit.js` 8 条、
  `test_prompt_deduction_unit.js` 5 条、`test_snapshot_cut_unit.js` 9 条、
  `test_vfs_write_contract_unit.js` 20 条、`test_json_locate_unit.js` 13 条）。
- **不计入 smoke 基线**：`tools/run_all_smokes.js:39` 只扫 `/_smoke\.js$/`，本目录只匹配
  `/_unit\.js$/`，两条线互不包含 —— 所以补单测不会改动「40 套 / 2636 条」这组数字。
- 公共脚手架 `tests/unit/_harness.js`（下划线开头，不被当套件）：`makeVFS` 内存文件表
  （坏 JSON 返回 null，与 `vfs/vfs.js:66` 同行为）、`makeSandbox` 注入最小假件（含
  `setTimeout` 等定时器桩 —— 引擎件在模块级会排布定时器，缺了它整组会报
  `setTimeout is not defined`）、`load(sb, 'engine/...')` 按仓根加载、`run/eq/deepEq/ok/contains/noThrow/finish`。
- 被测的模块（`engine/proposal_validator.js`、`engine/info_feed.js`、
  `engine/core/tool_executor.js`、`engine/outputs.js`、`engine/card_diagnose.js`、
  `engine/story.js`、`engine/snapshots.js`、`vfs/logger.js`）都是**两仓同源件**
  （`card_diagnose.js`、`vfs/logger.js` 属「仅行尾不同」桶，`engine/story.js`、
  `engine/snapshots.js` 属「逐字节相同」桶；
  `test_story_compress_unit.js` 的 K7 只把 `engine/core/storage.js` 当**源码文本**读，
  该文件两仓本就不同源）；`test_prompt_deduction_unit.js` 另外要读
  **两仓不同源**的 `engine/core/prompt_builder.js`，所以它走「源码哨兵（两仓都查）+ 假件行为
  （只加载手机仓那一份）」两路，不去比两仓字节；`test_snapshot_cut_unit.js` 的 F1-9 同样只走
  「源码哨兵」一路（读两仓 `engine/snapshots.js` 归一后比逐字）。**跨仓读取必须先
  `fs.existsSync`**：CI（ubuntu-latest）不 checkout 桌面仓，直接 `readFileSync` 会把「本机绿」
  变成「CI 红」（P54·P1 已踩过一次），可见性用 `HIPOCAMPUS_PC` 环境变量换仓，不可见时打印跳过
  原因、只查本仓；本轮单测只落在手机仓 ——
  桌面侧若要复用，须连带更新「51 套」这组口径及其守卫（`test_p53_license_docs.js` P53-49…57）。
- P54·第17条 的 `vfs/secure_envelope.js`（导出信封加密；stage 1 只做引擎层原语，不碰 UI）也是**两仓
  同源件**（「仅行尾不同」桶：手机 LF / 桌面 CRLF）。它**不另立桌面单测** —— 手机
官方向量现算对拍（stage 1 64 条；P54·第17条 stage 2 又加了 W 组 10 条 `wrap`/`unwrap` 薄封装与 S 组 9 条「导出/导入接线」哨兵，共 83 条）
  两仓归一后逐字相同 ⇒ 桌面那份被同源哨兵连坐覆盖。stage 2 接线桌面 UI（`index.html` 加 `<script>`、
  导出/导入口令弹窗）时再补桌面侧断言。
- 单测也是「语义收口」的落地护栏：`test_outputs_unit.js` 锁住 P54·第12条的 O-3（手动/AI 定论
  与 tick 共用 `_settle` ⇒ 一定应用 `settleRules.affects`、一定推系统通知）、O-5/O-5d（送审失败
  或**送审调用抛错**都不把已定论打回 `pending`，正文不掉出提示词）与 O-6（`update()` 改写标题/正文/描述后作废已纳入的
  审核结论、退回 `pending` 并回报 `reviewReset`；只改 keywords/audience 或 pending/none 项不触发）、
  O-7（`buildReviewPrompt` 改走 `getCardConfig()`：卡带写 `"outputs": {}` 时审核员也能看到 P43
  默认定论条件）、O-9/O-10/O-11（删掉零调用方的 `remove()`、零读取的 `_lastFermentDate`、
  tick 里那句自赋值空操作）、O-12（tick 把 `settled` 消费成 `tick_settled` 汇总审计；系统通知
  通道抛错时留 `settle_notice_failed` 审计，而不是空 `catch {}` 静默）、O-2（tick 真事务化：
  落盘失败（`writeFile` 抛错或返回 false）与起手抛错都整批回滚并留 `tick_rolled_back` 审计；
  对 GameState 的数值影响与系统通知推迟到落盘成功之后才施加，回滚不会漏掉它们；空批也落盘消费周期）。
  同一条事务口径也覆盖**手动 / AI 定论**（`settle()` 现在是「快照 → 落盘 → 成功才施加 effects」：
  写盘被拒或抛错时整条回滚、留 `settle_rolled_back` / `settle_save_threw` 审计并返回
  `{ok:false, rolledBack:true}` —— 原先「先加数值 / 推通知、再 `save()` 且不看返回值」在读档后会
  把同一份 delta 重复结算一遍）；`save()` 自身在写失败时统一留 `save_failed` 审计，其余 12 个
  只改 `_data` 的调用方（create/update/remove/stir/review…）不再静默丢改动；
  `test_info_feed_unit.js` 的 I18–I21 锁住 P54·第12条
  的 I-4（混流追加失败 ⇒ `ok:false` 且条目回到原状、`chatHistory` 写失败留 `warning`+审计）与
  I-6（tick 批逐条容错：坏条目跳过并审计、超长按 `MAX_TEXT`/`MAX_BODY` 截断，全批无可用条目才丢）；
  I22–I27 锁住 I-9（`origin` 只有 `'ai'`/`'player'` 两个合法值，写入口非法值记 `unknown_origin` 审计，
  旧档缺 `origin` 的玩家发言按 `from` 认回 `'player'`，不再一律算到 AI 头上）、I-10（`importance` 非法值
  不再静默回落：写入口记 `unknown_importance` 审计并统一按 `'background'`，tick 批非法值随
  `tick_batch_partial` 留痕；顺带删掉零调用的 `_emptyMessage`）与 I-11（schema 里的 `seen` 有字段、
  有迁移、零读写 —— 去重从未实现 ⇒ 删字段，而不是继续假装有）；
  I28–I33 锁住 I-5（`_firstJsonObject` 花括号配平切片：JSON 后文再出现花括号段落也不缝进来；
  tick 失败原因写进 `meta.lastTickError` 并在下一轮提示词里回灌、成功一轮即撤掉）、
  I-7（坏档先原样备份到 `<档>.bad.json` 再降级空档并记 `load_corrupt`；坏线程条目移除时记
  `thread_dropped`；`save()` 无处可写/归属不符/写盘抛错都返回 `false` 并留审计，不再静默返回）、
  I-8（`_data` 记归属 `_owner`，`save()` 发现归属与当前档不一致时拒绝落盘，避免切档途中
  某个 loader 抛错把 A 档的信息写进 B 档）；
  `test_json_extract_unit.js` 的 J1–J14 锁住 O-8（JSON 提取收敛到唯一实现
  `engine/card_diagnose.js` 的 `CardDiagnose.firstJsonObject(text)`：字符串/转义感知的花括号配平，
  只取第一个能配平的对象、拿不到返回 `null`；`outputs.js` 的 `_firstJsonObject` 保持返回空串的老契约、
  `info_feed.js` 保持返回 `null`；classify / npc_runtime / npc_deduction_ai / portrait /
  proposal_semantic_check / import 六个文件里的 7 处朴素「第一个 `{` 到最后一个 `}`」切片全部改走共享件，
  J12 用源码哨兵盯住这六个文件不再出现 `indexOf('{')`/`lastIndexOf('}')`，J14 用同一批输入证明旧写法
  确实会 `JSON.parse` 失败 —— 模型在 JSON 之后继续解释（解释里又带花括号）时不再把两段缝在一起）；
  `test_story_compress_unit.js` 的 K1–K8 锁住 P54·§四 story.js 组（假进度提示 / 保留窗口口径 /
  归档原文 / 死配置 / 批次轮号口径）：K1 是 `applyWindow` 「按轮」口径的回归锚（首条仍是 system、窗口内的
  「【系统 ·」条目保留、恰好留下 N 轮真实玩家发言）；K2 证明「可压缩量 < 4 条」时**一条提示都不发**
  （旧实现先把「（正在生成日志…）」挂上去再提前返回，成功/失败提示都到不了 ⇒ 进度提示永久假挂）；
  K3 走成功路径断言两条提示的顺序、以及保留窗口**按轮**计（14 轮里留 10 轮真实玩家发言，
  旧规则「`windowRounds * 2` 条」在同一夹具下只能留 9 轮）；K4 走失败路径断言
  「（日志生成失败，保留原文）」落地且原文与 `_lastCompressMsgCount` 都没动；
  K5 把 4000 字回复喂进 `Logger.compress`，断言 `chunks`/`fullText` 存**全文**、
  只有喂摘要模型的那份节选被截到 3000 字并带「（送入摘要时节选前 3000 字）」标记
  （旧实现把归档和节选一起截，叠加 `story.js` 删原文 ⇒ 长回复永久只剩前 3000 字）；
  K6 锁 `shouldCompress` 三态与「跨日不看条数」的语义（形参 `dayMessageCount` 已改名
  `newMessageCount`，旧名与实际语义不符）；K7 是源码哨兵：`engine/core/storage.js` 不再出现
  零读取方的死配置 `autoCompressRounds`（三个真配置项仍在同一行 —— 等长改写，行号不变，
  以免 `test_p52_schema_compat.js` 锁的 `:12/:137/:153` 迁移标记漂移）；K8 是 F1b·B 的两仓源码
  哨兵：`story.js` 的批次轮号只数**批次开始前**已发生的真实玩家发言（新增 `const batchHead = 1;`，
  旧形态不再出现，而 `msgFrom: batchMsgFrom` 表达式与变量名保持原样 —— 被 `tools/log_query_smoke.js`
  F4 钉住），`vfs/logger.js` 不再声称与 `Snapshots._currentRound` 同轴（改称「本日志自身的批次
  局部轮号」，被 `tools/longline_token_smoke.js` 钉住的 `var BLOCK = 40;` 与「chunks 是 fullText
  的唯一真源」两串仍在）。
- `test_story_channel_unit.js` 的 L1–L8 锁住 P54·第10条（可选外部 AI 通道）的**可测缝**：
  引擎侧把「通道裁决」抽成 `StoryLoop._channelKind()`、把「外部回复归一化」抽成
  `StoryLoop._externalReply(toSend)`（`callAI` 只用这两处，不再内联碰设置与平台）。
  L1–L5 夹 `_channelKind` 的五条边界 —— 老档没有 `storyChannel` 键 ⇒ `direct`（fail-open，
  老存档行为逐字不变）、设置写着 `external` 但平台没实装契约 ⇒ 回落 `direct`（不把用户卡死）、
  `Storage.getGlobal()` 抛错 ⇒ `direct` 且异常不外抛、只认严格字面量（`'EXTERNAL'`/`'External'`/
  `'foo'`/`true` 一律 `direct`）；L6 夹 `_externalReply` 的返回约定（取消/空/纯空白 ⇒ `null`，
  其余 `String(...)` 原样 —— **不 trim**，与旧 `content = String(__manual)` 逐字一致，
  整轮提示词同一引用透传给契约）；L7 是源码哨兵：裁决只有一个真源
  （`this._channelKind()` 与 `this._externalReply(` 各只出现一次、`Platform.ui.requestExternalReply`
  只被两个缝碰），旧内联形态 `let __channel = 'direct'` / `__gCh` 不许复活；
  L8 是手机侧入口哨兵（设置页有「对话通道」、落盘只写两个合法值、`platform_adapter.js` NAMES
  已登记契约、`rn_platform.js` 已 `wrapRet` 转发）。桌面侧对应守卫在
  `tests/unit/test_p54_story_channel.js`：Q1 现算 md5 断言两仓 `engine/story.js` **逐字节相同**
  ⇒ L1–L7 的行为断言同时覆盖桌面；Q2 同上词法哨兵；Q3/Q4/Q5 锁桌面三个接入点
  （设置页控件与写入口、`ui_core.js` 契约入口委托、`ui_prompt.js` 实装 + NAMES 登记）；
  Q6 锁 `storyChannel` **不在 `defaultGlobal`** ⇒ 老档免迁移，靠引擎侧 fail-open 兜底。
- `test_vfs_write_contract_unit.js` 的 V1–V20 锁住 **P55/P56/P57·写入契约、失败归因与存储不可用告知**（存储满时「没存上」能不能被知道、**说的是不是真原因**、以及「读不到」会不会被误当成「你没有存档」）：
  真实 `vfs/vfs.js` + `vfs/saves.js` + `engine/core/gamestate.js` 装进 vm 沙箱，配一个可控
  `StorageAdapter`（`fail` 开关让 `setItem` 抛 `QuotaExceededError`），全组零 Electron、零 DOM。
  V1/V2 写成功时 `writeFile` 与 `writeJSON` **都必须返回 true**（旧实现 `writeJSON` 丢弃 `writeFile`
  的布尔值 ⇒ 恒 `undefined`，`engine/import/vault.js:85` 的 `writeJSON(...) === true` 因此**恒假**：
  清单明明写成功也会被当成失败）；V3 存储抛错且无兜底 ⇒ 两者都 `false`；V4 `_vfsOnWriteFail`
  救回 ⇒ `true` 且不触发 `_vfsOnFatal`；V5 兜底也失败 ⇒ `false` 且 `_vfsOnFatal` 收到一次；
  V6–V10 `Saves.savePlayer/saveChat/saveCard/touch/rename/setPlayerName` 成功 `true`、写坏 `false`
  （`touch/rename/setPlayerName` 找不到 meta 也返回 `false`，不抛）；V11 `GameState.persist()`
  全成功 `true`、任一写点失败 `false`、无存档 `true`；V12 是源码哨兵（`writeJSON` 必须
  `return this.writeFile(`、`saveDirs` 带兜底、写方法体内 `!== false`、`saveChat` 三处
  `=== false` 累计、`persist` 三处判断）；V13 只让 `vfs_dirs` 索引键写失败 ⇒ `mkdir`/`writeFile`
  不抛且数据文件照写。V14–V16（P56）继续钉「失败要说对成因」：把真实 `vfs/vfs_guard.js` 装进沙箱，
  `QuotaExceededError` ⇒ `ErrorLog` type 仍是 `StorageFull` + 旧文案「存储空间已满」；`StorageUnavailableError`
  ⇒ `StorageUnavailable` + 「本地存储不可用（数据库未就绪）」且**不再出现**「空间已满」；其它错误 ⇒
  `StorageWriteFailed` 且文案带出 `err.message`；`err` 为 `null` 也不抛。V15 直接 `require` 真实
  `vfs/storage_adapter.js`：`isAvailable()` 在 Node 兜底环境返 `false`，而 `getItem` 仍静默返 `null`、
  `setItem` 仍抛 `StorageUnavailableError` —— 把「新增探针」与「读静默/写抛的既有语义没被动」同时钉住。
  V16 是源码哨兵（`classifyFailure`、三种 type、两条文案、adapter 三支都挂 `isAvailable`）。
  V17–V19（P57）把「不可用」从布尔升级成**能解释的成因**，并钉住读侧告知：V17 `require` 真实
  adapter，`unavailableReason()` 必须非空且指明 `op-sqlite` 这一层；同一套里用新暴露的测试缝
  `_openSqliteDb(opSqliteApi)` 驱动两条路径 —— 坏模块 `open` 抛错时必须**原样抛出原始错误**
  （便于归因，不再是「整条 `require` 链一起炸」），好模块则返 `db` 并执行建表。V18 把真实
  `vfs/vfs.js` 装沙箱跑三种情形：适配器没有 `isAvailable`（老宿主/冒烟假件）⇒ 乐观按可用、
  适配器说不可用 ⇒ `storageAvailable()` 抛 `false` 且 `storageUnavailableReason()` 透出成因、
  探针自己抛错 ⇒ 按可用且不外抛。V19 是源码哨兵：`vfs.js` 两个探针 + 乐观分支、存档页
  （手机 `rn/screens/SavesScreen.js`）必须问一句 `VFS.storageAvailable()` 且把「本地存储不可用」
  说出来、adapter 三支都挂 `unavailableReason`、`_openSqliteDb` 抽成可测函数并在导出对象上暴露。
  V20 是本次排查 CI run #30（「单元测试」步骤变红、annotations 只给得到 exit code 1、job 日志要鉴权）
  时补的钉子：跑批器 `tools/run_unit_tests.js` 必须**把「崩溃到没有 SUMMARY」也算失败**
  （旧实现 `process.exit(fail ? 1 : 0)` 只累加 SUMMARY 里的失败数 ⇒ 套件崩了反而静默变绿），
  失败时必须打印 `::error title=单元测试失败::<套件名> → <首条断言原文>` annotation
  （公开仓 annotations API 免鉴权可读；只给套件名时看详情仍要下 artifact，所以把首条 `FAIL:` 原文
  截断后一并塞进去，失败套件的输出末尾 12 行也打进 step 日志，随 `rn_unit_*.log` 一起留档），
  且 `.github/workflows/smoke.yml` 的单测步骤要 `tee` 出 `rn_unit_*.log` 并作为 artifact 上传
  （`set -o pipefail` 保住退出码）。
  桌面侧同源守卫 `tests/unit/test_p55_vfs_write_contract.js`（W1–W17）逐条比
  两仓 `vfs/vfs.js`、`vfs/saves.js`、`engine/core/gamestate.js`、`engine/import/vault.js` 的形状，
  并断言 `vault.js` 两仓**逐字节相同** —— 行为断言全在手机仓，桌面只靠同源连坐，所以同源本身也钉住。
  W9/W9c 反过来禁掉无条件 `type: 'StorageFull',`（旧写法一律把失败记成配额满）；
  W10 断言 `vfs/storage_adapter.js` 两仓**逐字节相同** —— 该文件头注释写着「只允许 Electron → RN
  单向同步、禁止在 RN 仓分叉修改」，在这之前没有任何守卫看着这条铁律。
  W12（P57）在两仓查成因探针三支 + 打开步骤可测 + 模块加载失败留下原始消息；W13 在两仓查
  `vfs.js` 的只读探针与「探测件缺失即乐观」分支；W14 查桌面存档页（`engine/ui_cards.js`）
  空/非空**两支**都拼上存储不可用警示；W15 在桌面侧直接 `require` 真实 `vfs.js` + 兜底 adapter，
  断言读侧探针说「不可用」并给出成因 —— 手机侧有 V15/V18 的行为断言，桌面侧也不再只靠同源连坐。
  W16 在桌面侧把 V20 的跑批器/CI 硬化也钉一遍（含「annotation 带首条断言原文」与「失败套件输出末尾
  进 step 日志」两条，手机仓不可见时明确跳过，不假装通过）。
  W17（P58）钉「加密模块缺失不得把加密信封当明文解」：桌面 `engine/ui_cards.js` 的 `_unsealText`
  在 `window.SecureEnvelope` 缺失时，只有**看起来不像信封**的文本才原样放行，否则返回
  `{ ok:false, reason:'加密模块未加载（vfs/secure_envelope.js），解不开这份加密导出' }`
  —— 旧写法无条件 `{ ok:true, text:s }`，会把「模块没加载」掩盖成「这是一份明文档」，
  下游拿密文当明文解析，报出来的是「JSON 解析失败」，成因被彻底藏掉。
- `test_json_locate_unit.js` 的 L1–L7 + S1–S6 锁住 **P58·导入失败别把真因藏掉**：
  L1–L7 是行为断言（坏 JSON 必须 `{ok:false}` 且 `loc.pos` 不为 0、给出上下文/全文长度/可能原因，
  截断与裸换行各有一句 hint，字符串内容里的中文弯引号**不许**被当成结构引号改掉），
  S1–S4 是源码哨兵：三处粘贴入口（卡片导入、设置页存档导入、主题导入）都走
  `JsonLocate.parseJsonLoose` 而不再各自 `JSON.parse`/自己替换弯引号，且失败文案统一由
  `locDetail(loc)` 拼，`export_util.js` 的 `secureUnwrap` 在模块缺失时只放行非信封文本。
  S5 钉「模块缺席时 `isEnvelopeText` 仍要认出信封」——否则屏幕在 `isEnvelopeText` 这一步
  就把密文判成普通文本，永远走不到 `secureUnwrap`，S4 那条报错分支会变成不可达代码；
  S6 是行为断言：沙箱注入 `require` 让 `vfs/secure_envelope.js` 缺席 ⇒ 信封被认出、
  `secureUnwrap` 回 `{ok:false, reason:'加密模块不可用'}`、明文仍放行；换成真模块 ⇒
  口令对解得开、口令错回「口令不对，或文件被改动过」（两种原因共用一句是有意的：不替攻击者分辨）。
- `test_prompt_deduction_unit.js` 的 D1–D5 锁住 P54·P1（工具协议条件注入 + 推演并发闸）：
  D1 用「推演关闭」的全局配置（`Storage.getGlobal().npcDeduction.enabled = false`，也就是新装机的
  默认值）建 `PromptBuilder.buildStatic()`，断言静态段里**没有** `request_deduction`、
  **没有** `query_deductions()`，但 `npc_knows(id, text, source)` 那半句和查询扩展其余 3 个工具
  照旧（只删推演协议，不连坐别的协议）；D2 打开开关后三项全回来，并顺手量出**关/开静态段字符差
  161**（深审 §五 方案 7 原先估的是「约 290 字符」，实测后按 161 记账）；D3 喂一个**没有**
  `npcDeduction` 键的老档全局 ⇒ 按「开」处理（读不到配置时不能悄悄少发协议）；
  D4 是源码哨兵：两仓 `engine/core/prompt_builder.js` 都有 `function _deductionOn()`、缺键回落
  `true`、`_deductionOn()` 恰好 4 次出现（1 声明 + 3 处注入：引擎规则那半句 / NPC 推演协议行 /
  查询扩展拼接）；D5 是源码哨兵 + 同源检查：两仓 `engine/story.js` 仍是逐字节相同件，
  且推演触发已从「一次 `Promise.all(_pendings.map(...))` 全量打出去」改成
  `_dQueue.splice(0, 2)` 的**波次闸 2**（10 个 pending 最坏 5 波，而不是 10 路并发），
  旧变量 `_promises` 与旧写法都不再出现，汇总提示文案保留。
- `test_snapshot_cut_unit.js` 的 F1-1–F1-9 锁住 P54·§四 F1（快照跨压缩回退）：
  快照 `push` 除 `chatLength` 外再记 `anchor`（最后一条消息的 role/长度/指纹）与 `anchorLead`
  （前一条），回退切点改由 `_cutIndex(snap)` 决定 —— 数组长度仍 ≥ `chatLength` 时按老口径切
  （F1-1/F1-4 是回归锚），已被压缩时从 `min(长度, chatLength)-1` **往前找锚点**且要求前驱也对得上
  （F1-2 造「压缩丢掉 u1/G1 ⇒ 锚点下标前移 2」，断言切点 5 而不是老实现的 7；F1-6 用重复的
  「继续」证明前驱指纹能拦下切错位置）；锚点被归档、或旧档没有锚点却已压缩时**整条拒绝**
  （`{ok:false, reason:'这份快照的对话原文已被压缩归档，无法可靠回退', split:true}`，F1-3/F1-5）——
  拒绝路径一个字段都不改、后续快照也不删，取代原先「状态回退、对话不动」的静默分裂回退
  （`slice(0, snap.chatLength)` 在压缩后长度不够就变成 no-op）；F1-8 锁 `rollbackLast`
  （「重新生成」走的路）仍能定位最新快照。语义取舍：只认**仍在原文里**的快照点，不引入
  `_currentRound()` 的轮号基准（那要落盘，且牵动 `vfs/logger.js` 的 `msgFrom/msgTo` 口径 ⇒
  另立 F1b 行；F1b 已按 **B 口径**收口：`msgFrom` 只数**批次开始前**已发生的真实玩家发言
  —— 典型值 0，logger 的轮号是**本日志自身的批次局部轮号**，不再声称与 `snap.round` 同轴，
  比较时按偏保守处理，源码哨兵见 §4.4 的 K8）；桌面 `engine/ui_snapshot.js` 两处 `Logger.deleteLogsAfter(...)` 同时补第 4 参
  `r.snap.round`，与手机仓 P4（`rn/snapshot_actions.js:34`）对齐。

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

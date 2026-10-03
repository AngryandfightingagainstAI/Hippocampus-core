# Hippocampus RN · 分层公约与跑测口径 v1

本文档是**手机版仓（`D:\HippocampusRN`）**的公约，对应桌面仓的
`docs/CONVENTIONS.md`（分层公约 v1）。桌面仓那份解决的是「迁移到 RN 之前别加迁移成本」，
这一份解决的是**迁移之后、两仓并行维护**的三件事：

1. `rn/` 与 `engine/` 的分工边界（谁可以依赖 React Native，谁绝对不行）
2. **同源件**清单与同步办法（哪些文件两仓必须逐字节相同，怎么证）
3. 跑测口径（怎么跑、cwd 限制、断言数怎么数、本轮红线）

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
| `tools/*_smoke.js` | 26 套冒烟（见【四】） |

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
判定脚本不能靠记忆，必须现算（`%TEMP%\p13b_shared.js` 就是干这个的：遍历两仓 `.js`，
排除 `node_modules` / `android` / `build` / `dist` / `docs`，列三张表：同源 / 同名不同 / 仅一仓有）。

最近一次实算结果：**47 个文件逐字节相同**。

```
engine/achievements.js            engine/import/report.js          engine/story_nodes.js
engine/alias.js                   engine/import/unzip.js           engine/tasks.js
engine/calendar.js                engine/import/vault.js           engine/words.js
engine/card_diagnose.js           engine/info_feed.js              platform/platform_adapter.js
engine/card_display.js            engine/log_query.js              templates/number.js
engine/core/card_validator.js     engine/npc_runtime.js            templates/relation.js
engine/core/cards_demo.js         engine/outputs.js                tools/claim_fact_smoke.js
engine/dice.js                    engine/portrait.js               tools/import_smoke.js
engine/dice_history.js            engine/proposal_semantic_check.js vfs/local_store.js
engine/endings.js                 engine/proposal_validator.js     vfs/logger.js
engine/error_log_core.js          engine/proposals.js              vfs/storage_adapter.js
engine/events.js                  engine/runtime_repair.js
engine/import/decode.js           engine/shop.js
engine/import/draft.js            engine/snapshots.js
engine/import/formats.js          engine/status_card.js
engine/import/index.js
engine/import/middle.js
engine/import/parsers/archive.js
engine/import/parsers/pdf.js
engine/import/parsers/textlike.js
engine/import/pipeline.js
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
| 桌面 `tests/unit/test_p15_import.js` P15-9 / P15-10 | `engine/import/**` 12 个模块 + `tools/import_smoke.js`，共 13 个文件逐字节相同 |
| 桌面 `tests/unit/test_p14_claim_fact.js` | `tools/claim_fact_smoke.js` 存在且两仓同源 |
| RN `tools/log_query_smoke.js:578-579` | `vfs/logger.js` 两仓逐字节相同 |
| RN `tools/log_query_smoke.js:597-598` | `engine/info_feed.js` 两仓逐字节相同 |
| RN `tools/num_editor_smoke.js:317-318,322-329` | `templates/number.js`、`templates/relation.js` 两仓逐字节相同 |
| RN `tools/num_editor_smoke.js:331-339` | 桌面 `engine/editor.js` → RN `engine/num_editor.js` 的移植保真 |

### 2.3 ⚠ 同名但**不同源**（最容易误判）

- `tools/longline_token_smoke.js`：两仓**同名、内容不同**。RN 版 22 条断言，桌面版 38 条，
  各自写各自的夹具。**不是同源件，不要互相同步。**
- `tools/npc_boundary_smoke.js`：两仓同名、内容不同，同理不要互相同步。
- `tools/p10_smoke.js`、`tools/story_smoke.js`、`tools/home_smoke.js` 等：**RN 仓独有**。
  桌面仓的对应覆盖在 `tests/unit/`、`tests/e2e/` 下，**文件名不同**，不存在同源关系。
- `engine/core/prompt_builder.js`、`engine/story.js`、`engine/core/storage.js`、`engine/core/api_client.js`、
  `engine/core/gamestate.js`、`engine/core/tool_executor.js`、`vfs/vfs.js`、`vfs/saves.js`、`engine/theme.js`：
  两仓**都有但内容不同**（平台差异，例如桌面 `storage.js` 多一行「平台依赖：localStorage，
  RN 侧换 SecureStore」声明）。这些按**各自仓的语义**改，逻辑对齐靠测试而不是靠字节。

================================================================
【三、`rn/rn_bootstrap.js` 装载约定】
================================================================

- 当前 **63 个 `load()` 调用**（`grep -c '^\s*load(' rn/rn_bootstrap.js`）。
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

### 4.1 RN 侧（26 套）

**cwd 是硬约束：RN 的所有 smoke 必须在 `D:\HippocampusRN` 下跑**，因为脚本用相对路径找
`engine/`、`vfs/`、`rn/`。从别的目录跑会 `Cannot find module`。

```powershell
cd D:\HippocampusRN
node tools\import_smoke.js
# 一键全跑
& "$env:TEMP\p13_run_rn.ps1"
```

| 套件 | 断言 | 套件 | 断言 |
|---|---|---|---|
| `cards_smoke.js` | 35 | `num_editor_smoke.js` | 72 |
| `claim_fact_smoke.js` | 44 | `p1_settings_smoke.js` | 202 |
| `create_flow_smoke.js` | 107 | `p10_smoke.js` | 73 |
| `create_smoke.js` | 23 | `panels_smoke.js` | 102 |
| `h6_panels_smoke.js` | 124 | `polyfill_smoke.js` | 22 |
| `home_smoke.js` | 89 | `saves_smoke.js` | 17 |
| `image_smoke.js` | 39 | `settings_smoke.js` | 144 |
| `import_smoke.js` | 115 | `story_smoke.js` | 195 |
| `info_phone_smoke.js` | 45 | `theme_tokens_smoke.js` | 146 |
| `log_query_smoke.js` | 92 | `tool_ready_smoke.js` | 60 |
| `longline_token_smoke.js` | 22 | `web_search_smoke.js` | 51 |
| `npc_boundary_smoke.js` | 36 | `worldbook_smoke.js` | 180 |
| `info_tick_smoke.js` | 14 | `cache_usage_smoke.js` | 12 |

**当前基线：26 套 / 2061 ok / 0 failed。**

### 4.2 桌面侧

```powershell
cd 'D:\AI文游\神秘小引擎测试版\神秘小引擎测试版'
node tools\claims.js                      # 14 项（13 ok / 1 known-open）
node tools\run_batch.js --skip-preflight  # 全量（38 套）
node tools\longline_token_smoke.js        # 36 回合长线预算
node tools\prompt_budget_smoke.js         # 预算降级阶梯
node tools\import_smoke.js                # 导入层（与 RN 同源，115 条）
```

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

================================================================
【六、本轮批次红线（P13·B / P15）】
================================================================

- 不加新依赖（`@react-native-documents/picker` 之类**未获批**前不许装）。
- 不动证据目录（`docs/shots_*/`、`docs/_archive/`）。
- 跑批**不带** `KEEP_S_SHOTS`；跑完核截图基线（Node 逐张 SHA256）。
- `docs/TRAE_REPORT.md` 覆盖前先归档到 `docs/_archive/TRAE_REPORT_P12.md`。
- 全中文注释与文档；`docs/_archive/**` 里的历史报告**不要改**（那是历史快照，
  里面写「桌面 7 档」是对的，因为当时就是 7 档）。

---

**版本**：v1（P13·B 落地时建立）
**对应桌面仓**：`docs/CONVENTIONS.md`（分层公约 v1）

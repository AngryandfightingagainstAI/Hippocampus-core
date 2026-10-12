# TRAE_REPORT.md · RN 仓（React Native / Android）

【轮次】P47 · 天命系统 + 人设审核修复 + 文件读取链路验证（任务书 `docs/TASK_TRAE_P47_destiny_portrait_fileread.md`，签发 2026-10-08）
提交物：RN 仓代码（`rn/rn_bootstrap.js`、`rn/screens/CreateScreen.js`、`rn/screens/PortraitScreen.js`、`rn/ui_portrait_rn.js`、同源 `engine/destiny.js`/`engine/story.js`）+ 两套 smoke 断言同步；桌面仓代码与同源件四格表见桌面仓同名报告
前置：P13-A 报告已归档为 `docs/_archive/TRAE_REPORT_P13A.md`（43F8D0ACFC4B73F82A8B168CE53C2CDA）。本文件为覆盖写入。

────────────────────────────────────────

【结论】

1. **批次 1（人设两阶段审核修复）完成**：`rn/ui_portrait_rn.js` 导出 `getAuditResult`（:267）；`rn/screens/PortraitScreen.js` 适配 `{ audit, portrait }` 两阶段返回（conflict 阻断确认 / concern 提示放行 / ok 正常填；新增 `auditState` 与审核状态 UI 块）。
2. **批次 2（天命系统）完成**：新增 `engine/destiny.js`（两仓逐字节同源 A 类纯逻辑）；RN 在 `CreateScreen.js` 加「掷天命」面板，桌面在 `engine/story.js` CreateFlow 的 `renderStep` 内插入天命面板 + `index.html` 补 `.cf-destiny-*` 样式。
3. **批次 3.1（文件读取链路只读检查）完成**：5 环（FilePicker 返回 → CardsScreen 映射 → Import.run/decode → ImportVault/pipeline → query_source 工具 → prompt 声明）逐一核验，**全部通畅，未发现断点**。
4. **批次 3.2**：依 3.1 结论**无可修断点，未改任何链路代码**（如实自报，不为交差编造改动）。
5. **批次 3.3**（聊天中 📎 临时读文件）：任务书标注「可选」，本轮未授权，**未做**。
6. **回归**：RN 侧 36 套 smoke **全绿**（逐套汇总行见【验证】V3）；桌面 `tool_ready_smoke` = `TOOL_READY_SMOKE: 61 ok, 0 failed`。
7. **自报三项**（均见【改动】详述）：
   - (a) `Destiny.rollBatch` 返回结构由任务书 sketch 的「N 组、按总和排序」细化为 `[{ values:{...}, total }, ...]`（组内含 total，便于 UI 直接展示「总和」）。
   - (b) `engine/story.js` 经实测为**两仓同源件**（改前两仓均 52649 B / MD5 `440264D2A3ABF25857D68F31104BD25A` / 全 CRLF），故按项目同源纪律两仓同步改；此前「story.js 已分叉」的旧认知被本轮实测推翻。
   - (c) 为容纳新增模块 `Destiny`，同步更新两套 RN smoke 的 bootstrap 模块计数断言（64→65）。该断言本有「模块清单同步」约定（注释记载 P4 的 50→51 先例），属约定内同步而非削弱断言。

────────────────────────────────────────

【改动】

### 表 1 · 改动面清单（三数：字节 / 行尾 / MD5）

| 文件 | 仓 | 类型 | 字节 | 行尾 | MD5 |
|---|---|---|---|---|---|
| `engine/destiny.js` | RN | **新增（同源）** | 7503 | LF=221 | 1DA0E071456A7F12CA83A1F8A2E71CF9 |
| `engine/destiny.js` | 桌面 | **新增** | 7503 | LF=221 | 1DA0E071456A7F12CA83A1F8A2E71CF9 |
| `engine/story.js` | RN | 改（同源） | 55392 | CRLF=1174 | 5D41E8546968BB0FB2CDFBC75E6C9439 |
| `engine/story.js` | 桌面 | 改 | 55392 | CRLF=1174 | 5D41E8546968BB0FB2CDFBC75E6C9439 |
| `index.html` | 桌面 | 改 | 95730 | CRLF=1197 | D365C2B683EC4A495843133420FA9B49 |
| `rn/rn_bootstrap.js` | RN | 改 | 17791 | LF=308 | 0C76E7BAE70ED62A4FBB5A8472847A5D |
| `rn/screens/CreateScreen.js` | RN | 改 | 34732 | LF=803 | FA8E0AA369C05F7CE699B66CF7CB83F2 |
| `rn/screens/PortraitScreen.js` | RN | 改 | 18944 | LF=446 | BF0573A98062FF6C17A86F207D4E3C58 |
| `rn/ui_portrait_rn.js` | RN | 改 | 10741 | LF=277 | 1175FD8760281C348ED778306D2B725E |
| `tools/polyfill_smoke.js` | RN | 改（测试断言同步） | 7959 | LF=175 | B53870C356114F63EC797153409E27FB |
| `tools/theme_tokens_smoke.js` | RN | 改（测试断言同步） | 11957 | LF=239 | 492A6E6E0C587BAC16CF6F923EB2BEB9 |

### 表 2 · 同源件四格表（改前 / 改后 × 两仓）

`engine/story.js`

| | 改前 | 改后 |
|---|---|---|
| 桌面 | 52649 B / 440264D2A3ABF25857D68F31104BD25A | 55392 B / 5D41E8546968BB0FB2CDFBC75E6C9439 |
| RN | 52649 B / 440264D2A3ABF25857D68F31104BD25A | 55392 B / 5D41E8546968BB0FB2CDFBC75E6C9439 |

`engine/destiny.js`（新增）

| | 改前 | 改后 |
|---|---|---|
| 桌面 | 不存在 | 7503 B / 1DA0E071456A7F12CA83A1F8A2E71CF9 |
| RN | 不存在 | 7503 B / 1DA0E071456A7F12CA83A1F8A2E71CF9 |

「改前」两仓相等、「改后」两仓仍逐字节相等（MD5 与字节数均一致）。

### 关键改动逐项说明

**批次 1**
- `rn/ui_portrait_rn.js`：exports 对象在 `sendAndGenerate` 后补 `getAuditResult: getAuditResult,`（:267）。函数本体 :137 未动。
- `rn/screens/PortraitScreen.js`：
  - 新增 `auditState`（:80-84）存最近一次审核结果。
  - 新增统一的 `handleGenResult(result)`（:110-138）：conflict → 讨论区列问题、不填 portrait、`setErr`、`setBusy(false)` 返回；concern → 列建议 + 填 portrait；ok → 填 portrait。
  - `onGenerate()`（:141-157）改走 `UI_Portrait.generate().then(handleGenResult)`；`onSend()`（:160-181）改走 `UI_Portrait.sendAndGenerate(t).then(handleGenResult)`。两者均保留 `ApiManager.getActive()` 预检。
  - `onConfirm()`（:187-190）开头新增 conflict 阻断：`if (audit && audit.verdict === 'conflict') { failToast(...); return; }`。
  - JSX 新增审核状态块（:356-368）；styles 新增 `auditBox/auditTitle/auditBody/auditIssue`（:254-260），颜色全走 tokens（`c.hairStrong/c.panel/c.ink/c.muted/c.danger`）。

**批次 2 · 引擎层 `engine/destiny.js`（新增，两仓同源）**
- 导出：`parseFormula / rollSet / totalOf / rollBatch / config / attributes / enabled / defaultSets`；末尾双态导出（`window.Destiny` + `module.exports`）。
- `parseFormula(expr)` 返回 `function(){return evalAst(ast)}`，非法公式返回 `null`（不当 0）。自建 tokenizer + 递归下降 AST，支持 `+ - *` 与括号；`NdM` 子项优先复用 `DiceEngine.roll(count+'d'+sides).total`，`DiceEngine` 缺失时回落本地 `Math.random`（因 `DiceEngine.parse` 只认 `NdM[±k]`/check/bonus，**不认 `*`**，故 `*` 与括号层自建）。
- `rollSet(attributes)` → `{key:value,...}`；公式无效的属性项跳过。
- `rollBatch(attributes, sets)` → `[{values:{...}, total}, ...]`，按 `total` 降序；`sets` 钳在 1-20。**（对任务书 sketch 的细化，见【结论】7a）**
- `clamp`：先 `Math.round` 再按 `min/max` 钳位。
- `enabled(card)` 需 `card.worldbook.destiny.enabled === true && attributes.length > 0`；`defaultSets` 缺省 5、钳 1-20。

**批次 2 · RN UI `rn/screens/CreateScreen.js`**
- 新增状态 `destinySets/destinyPicked` 与 `onRollDestiny()`（`Destiny.rollBatch(destinyAttrs, Destiny.defaultSets(card))`）、`onPickDestiny(set)`（把 `set.values[a.key]` 写入创角 `data` 后 `CF.saveDraft(...)` 落草稿）。
- `destinyOn`/`destinyAttrs` 经 `typeof Destiny !== 'undefined'` 守卫 + try/catch 求值：卡带未启用 `worldbook.destiny` 时面板整体不渲染（创角流程零变化）。
- `renderDestiny()`（:647-681）未选态 = 「掷天命」按钮 + N 组行（属性名+值 · 总和）；已选态折叠 = 最终属性 + 总和 + 「重掷天命」。JSX 在 `{ready ? renderBody() : null}` 之前插入 `{ready ? renderDestiny() : null}`（:776）。
- styles 新增（:407-426）`destinyBox/…/destinyName`，只走 tokens。
- `rn/rn_bootstrap.js`：`load('Import', …)` 之后、`load('DiceEngine', …)` 之后新增 `load('Destiny', function () { return require('../engine/destiny.js'); });`（DiceEngine 在 :165，Destiny 在 :213 段）。

**批次 2 · 桌面 UI**
- `engine/story.js`（同源）：`start()` 清空 `_destinySets/_destinyPicked`；`renderStep()` 开头插入 `renderDestiny()`；新增 `renderDestiny()/rollDestiny()/pickDestiny(i)`。
- `index.html`：新增 `<script src="engine/destiny.js"></script>`（:1027）+ `.cf-destiny-*` 共 10 行 CSS（:539-548），颜色只走 `--c-*`。

**测试断言同步（RN）**
- `tools/polyfill_smoke.js`、`tools/theme_tokens_smoke.js`：bootstrap 断言 `ok === 64` → `ok === 65`，标签同步为「BOOTSTRAP 65/0（…、P28 加 Background、P47·批次2 加 Destiny）」，并加注释行说明 64→65 理由。

────────────────────────────────────────

【验证】

**V0 · 批次 3.1 五环只读核验**
1. `FilePicker.pickFile()` → `rn/file_picker.js` 返回 `Promise<{name,size,base64,uri}|null>`。
2. `rn/screens/CardsScreen.js:296` `parseMaterialInput({ name: picked.name, bytes: picked.base64 })` → `:261 Import.run(payload, {})`。
3. `engine/import/decode.js:12 toBytes()` 认 base64 字符串 / `data:` URI / Uint8Array。
4. `engine/core/tool_executor.js:90 query_source` 从 `ImportVault.loadImd(imp.importId)` 加载 IMD。
5. `engine/core/prompt_builder.js:133-134` 注入「导入资料…用 query_source 检索全文」；`:209` 工具清单亦声明。
- 结论：链路 5 环全通。**未发现断点 ⇒ 3.2 无代码改动。**

**V1 · Destiny 引擎行为（命令 `node -e "require('D:/HippocampusRN/engine/destiny.js')…"`，原始输出）**
```
3d6*5 range [ 15, 90 ]
(2d6+6)*5 range [ 40, 90 ]
bad: null null null null
batch n=5 desc=true keys=str,siz
enabled=true attrs=2 defaultSets=5
enabled(no)=false defaultSets(no)=5
```

**V2 · RN 语法校验（@babel/core + module:@react-native/babel-preset）**
```
BABEL_OK CreateScreen.js bytes=23625
BABEL_OK PortraitScreen.js bytes=12804
BABEL_OK ui_portrait_rn.js bytes=5482
BABEL_OK rn_bootstrap.js bytes=9141
```

**V3 · RN 全量 smoke（36/36 全绿，cwd=D:\HippocampusRN）**
```
BACKGROUND_SMOKE: 37 ok, 0 failed          CACHE_USAGE_SMOKE: 12 ok, 0 failed
CARD_COMPAT_SMOKE: 24 ok, 0 failed         CARD_IMPORT_SMOKE: 25 ok, 0 failed
CARDS_SMOKE: 35 ok, 0 failed               CLAIM_FACT_SMOKE: 44 ok, 0 failed
CREATE_FLOW_SMOKE: 115 ok, 0 failed        CREATE_SMOKE: 23 ok, 0 failed
ENDINGS_GATE_SMOKE: 27 ok, 0 failed        FILE_PICKER_SMOKE: 49 ok, 0 failed
H6_PANELS_SMOKE: 137 ok, 0 failed          HOME_SMOKE: 89 ok, 0 failed
IMAGE_SMOKE: 39 ok, 0 failed               IMPORT_SMOKE: 123 ok, 0 failed
INFO_PHONE_SMOKE: 45 ok, 0 failed          INFO_TICK_SMOKE: 14 ok, 0 failed
LOG_QUERY_SMOKE: 92 ok, 0 failed           LONGLINE_SMOKE: 22 ok, 0 failed
MOBILE_UX_SMOKE: 83 ok, 0 failed           NPC_BOUNDARY_SMOKE: 36 ok, 0 failed
NUM_EDITOR_SMOKE: 72 ok, 0 failed          OUTPUTS_REVIEW_SMOKE: 77 ok, 0 failed
P1_SETTINGS_SMOKE: 202 ok, 0 failed        P10_SMOKE: 75 ok, 0 failed
PANELS_SMOKE: 102 ok, 0 failed             POLYFILL_SMOKE: 22 ok, 0 failed
SAVES_SMOKE: 17 ok, 0 failed               SETTINGS_SMOKE: 144 ok, 0 failed
SOURCE_READABLE_SMOKE: 23 ok, 0 failed     STORY_SMOKE: 195 ok, 0 failed
theme_switch_smoke: 22 ok, 0 failed        THEME_TOKENS_SMOKE: 146 ok, 0 failed
TOOL_READY_SMOKE: 60 ok, 0 failed          VERSION_SYNC_SMOKE: 15 ok, 0 failed
WEB_SEARCH_SMOKE: 51 ok, 0 failed          WORLDBOOK_SMOKE: 180 ok, 0 failed
=== RN SMOKE: 36 ok-suites, 0 failed-suites / 36 ===
```
说明：`POLYFILL_SMOKE` / `THEME_TOKENS_SMOKE` 首轮因 bootstrap 计数断言 64 而红（`ok=65 failed=0`），按约定同步断言后转绿；此二者为**唯一**改动的测试文件。

**V4 · 桌面 tool_ready_smoke（cwd=桌面仓根）**
```
TOOL_READY_SMOKE: 61 ok, 0 failed
```

**V5 · 批次 3.1 链路三套 smoke（cwd=D:\HippocampusRN）**
```
FILE_PICKER_SMOKE: 49 ok, 0 failed
IMPORT_SMOKE: 123 ok, 0 failed
SOURCE_READABLE_SMOKE: 23 ok, 0 failed
```

────────────────────────────────────────

【遗留 / 下一步】

1. **3.3 未做**：聊天中 📎 临时读文件为任务书标注的「可选」，本轮未授权。需要请指示。
2. **真机取证未做**：本轮改的是创角 UI（天命面板）与人设审核 UI，未出真机截图。需要请指示（本轮不需重打 APK——纯 JS 改动，Metro 热更可见）。
3. **桌面 e2e 未跑**：任务书仅要求 `tool_ready_smoke`；`run_batch.js` 全量会重产冻结期截图，故主动回避。
4. **认知更正**：此前记录的「`engine/story.js` 两仓已分叉」被本轮实测推翻——两仓改前逐字节相同（全 CRLF）。已按同源件纪律处理。
5. **卡带缺省无天命配置**：`worldbook.destiny` 为可选配置，现无卡带携带该字段 ⇒ 现有卡带创角流程零变化（符合任务书「无天命配置的卡带：创角流程无变化」）。要真机演示「有天命配置」路径，需先给某卡带加 `destiny` 配置——**属数据改动，未擅自落盘，待指示**。

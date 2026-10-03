# TRAE 报告 · P11 尾项补交单（T1–T4）· RN 仓

## 【轮次】

- 任务：**P11 任务书 · 尾项补交单（2026-10-02）**，性质 = 补交 + 溯源，**不是新一轮改动**。
- 执行者：Trae｜本报告仓：RN `D:\HippocampusRN`（桌面侧同名报告见 `D:\AI文游\神秘小引擎测试版\神秘小引擎测试版\docs\TRAE_REPORT.md`）
- **本单未改任何产品代码**；RN 侧写盘 = 本报告 1 份 + 归档 1 份（`docs\_archive\TRAE_REPORT_P11.md`，目录本单新建）。T3 只出方案、未动代码。

**开轮基线（与任务书给定值逐项一致）**

| 文件 | 仓 | 字节 | MD5 |
|---|---|---|---|
| `engine/core/prompt_builder.js` | RN | 49,381 | `83CD88555EE387A09116D8FA8C05B053` |
| `engine/core/prompt_builder.js` | 桌面 | 48,055 | `DC7A753F8A5A32F8D6886C00F67FF521` |
| `engine/npc_runtime.js` | 两仓（同源件） | 45,929 | `4AC0191145925CF26289D63E34F77F4E` |

**旧报告归档**

| 归档目标 | 字节 | MD5 |
|---|---|---|
| RN `docs\_archive\TRAE_REPORT_P11.md` | 14,617 | `5CF8D2B732A84C9FD1119723683D3C71` |
| 桌面 `docs\_archive\TRAE_REPORT_P11.md` | 25,246 | `B407998929718637F98CDD9AE2AFB6D6` |

---

## 【结论】

**待开工指令** —— 本单四项已交，T3 待勾选。

- **T1**：原报告旧绝对值**不可复算**（根因 = 夹具不同：旧报用「空态」夹具，任务书指定的是 `p10_smoke.js:190-266 boot()`）。用 `boot()` 夹具重跑，**两仓四件产物逐字节相同**，数值与你独立复算吻合（buildStatic 6336 / `2734EF5B244979EA503E9DAC18A7DFA4` / 2643；buildDynamic 679 / `8984061B4303E7BCB2D75A61DD02EE11`）。**未改夹具常量、未改 `estimateTokens`、未改断言阈值。**
- **T1-口径**：`566 / 477` = `arr.join('\n').length`（直接量测）；你的 `556 / 466` = Σ 各条长度（不含分隔符）。旧报「前 366 / 319」「新增 200 / 158」为**推算值且推算有误**，已作废，改用留档快照直接量测。
- **T2**：RN 盘上无改前副本、两仓无 git ⇒ 取 **B（降级措辞）**：「P9/P10 遗留、非本轮引入」→ **「本轮未统一；来源未验证（无改前副本可比）」**，并列出 42 行行号清单。
- **T3**：A/B/C 三方案改动面已列，**未动一行代码**。
- **T4**：`HippocampusRN-1.0-release-universal-p11.apk` 62,754,990 B / `4B99190E1400FF9CE875E5D06CEB4D8A`，P10 那份未覆盖。
- **越权自报**：无。

---

## 【改动】

### 2.1 本单写盘清单（逐文件：字节 / MD5 / 行尾）

| # | 文件 | 操作 | 字节 | MD5 | 行尾 |
|---|---|---|---|---|---|
| 1 | RN `docs\TRAE_REPORT.md` | 覆盖（本报告） | 本文件自身；md5 外部核验（见对话回执） | — | LF |
| 2 | RN `docs\_archive\TRAE_REPORT_P11.md` | 新建（归档旧报） | 14,617 | `5CF8D2B732A84C9FD1119723683D3C71` | LF |
| 3 | `D:\AI文游\神秘小引擎测试版\HippocampusRN-1.0-release-universal-p11.apk` | 新建（拷贝，仓外） | 62,754,990 | `4B99190E1400FF9CE875E5D06CEB4D8A` | 二进制 |

### 2.2 P11 产品改动面参考（上轮已改，本单未动）

| 文件 | 字节 | MD5 | CRLF | 裸 LF |
|---|---|---|---|---|
| `engine/core/prompt_builder.js` | 49,381 | `83CD88555EE387A09116D8FA8C05B053` | 874 | **42** |
| `engine/core/storage.js` | 12,778 | `B2966498F3129156114B59CBF650C864` | 202 | 0 |
| `engine/npc_runtime.js`（同源件） | 45,929 | `4AC0191145925CF26289D63E34F77F4E` | 1192 | 0 |
| `tools/npc_boundary_smoke.js` | 13,690 | `441388762A7934471E82E5403D5B393C` | 0 | 247（全 LF，RN `tools/*.js` 既有约定） |
| `tools/log_query_smoke.js` | 30,900 | `9BAB3015874DDA4B51EC802D43A63D9D` | 0 | 616 |
| `tools/num_editor_smoke.js` | 29,037 | `3B5662EB040EF98936C0B148013D4C69` | 0 | 539 |
| `tools/worldbook_smoke.js` | 45,519 | `E4254069A914AE3485C5F6D7D5C66BC0` | 0 | 904 |

**storage.js 两仓残差 13 B**（桌面 12,791 − RN 12,778）= 桌面独有「平台依赖：」声明行。**非同级文件**，已记账。

**同源件四格表 `engine/npc_runtime.js`**

| | 桌面 | RN |
|---|---|---|
| 改前 | 45,653 B / `F7BA79D29EDE32AD219A55271075AA73` | 45,653 B / `F7BA79D29EDE32AD219A55271075AA73` |
| 改后 | 45,929 B / `4AC0191145925CF26289D63E34F77F4E` | 45,929 B / `4AC0191145925CF26289D63E34F77F4E` |

改后两仓仍逐字节相等。本单未再改该文件。

---

## 【验证】

### §0 开轮基线复核（原始输出）

```
> node D:\_p11_lineend.js "D:\HippocampusRN\engine\core\prompt_builder.js"
bytes = 49381   md5 = 83CD88555EE387A09116D8FA8C05B053   CRLF = 874   bareLF = 42   loneCR = 0   BOM = false

> node D:\_p11_lineend.js "d:\...\engine\core\prompt_builder.js"
bytes = 48055   md5 = DC7A753F8A5A32F8D6886C00F67FF521   CRLF = 900   bareLF = 0     BOM = false

> node D:\_p11_lineend.js "D:\HippocampusRN\engine\npc_runtime.js"   → 45929 / 4AC0191145925CF26289D63E34F77F4E
> node D:\_p11_lineend.js "d:\...\engine\npc_runtime.js"            → 45929 / 4AC0191145925CF26289D63E34F77F4E   （两仓相等）
```

与任务书给定基线逐项一致。

---

### T1 · S5 对照表可复算（RN 侧）

**做了什么** → 按任务书指定的 **RN `tools/p10_smoke.js:190-266` 的 `boot()`** 夹具复刻成独立脚本，两仓各跑一次。

**复算命令**

```powershell
node D:\_p11_t1_measure.js "D:\HippocampusRN"                              # RN
node D:\_p11_t1_measure.js "d:\AI文游\神秘小引擎测试版\神秘小引擎测试版"     # 桌面（对照）
node D:\_p11_t1_counts.js                                                  # 口径
node D:\_p11_t1_counts_pre.js                                              # 改前（2026-09-30 留档快照）
```

**精确调用序列 + gameState 状态**（同一进程顺序执行，无重跑）

```
1) PB.buildStatic() → 2) PB.buildSemiStatic() → 3) PB.buildDynamic()（首次，调用前 _lastTrimmedLevel=undefined，未经历降级）
→ 4) PB.estimateTokens(第 1 步返回串)（纯函数无副作用） → 5) PB.buildSystem()（末位；内部会再调一次 buildDynamic）

量测点状态（脚本实测打印）：
  currentCard.name='T10'（game.title='测试卡带' / steps=[] / statusCard={enabled:false} /
                         worldbook={npcs:[{id:'npc_a',name:'甲'}], mapNodes:{}, worldSetting:{}, weather:{mode:'off'}}）
  playerData.keys=["portrait","inventory","_openingPrompt"]   chatHistory.length=0
  hint=undefined   _pendingSystemNotices=0 条
  Storage.getGlobal().promptBudget=undefined ⇒ _getBudget()={"enabled":true,"maxTokens":3000}
  降级污染：无（buildDynamic 后 _lastTrimmedLevel=0、_lastTrimLog=[]）
  缓存：buildSemiStatic 会写 GameState._cachedStaticDynamic（同进程二次调用返回缓存）
```

**两仓并排（运行时直接打印，非手算）**

| 项 | RN | 桌面 | 差异 |
|---|---|---|---|
| `buildStatic()` len / 码点 / md5(utf8) / tok | 6336 / 6336 / `2734EF5B244979EA503E9DAC18A7DFA4` / 2643 | 同 | 0 |
| `buildSemiStatic()` len / md5(utf8) | 200 / `F32A95FD8E41981E12EED9797F1F5CC2` | 同 | 0 |
| `buildDynamic()`(level0) len / md5(utf8) / tok | 679 / `8984061B4303E7BCB2D75A61DD02EE11` / 309 | 同 | 0 |
| `buildSystem()` len / md5(utf8) / tok | 7217 / `1F24D1BBA8EA40B0D5F74F47AD43B479` / 3054 | 同 | 0 |
| `estimateTokens(buildStatic)` | 2643 | 2643 | 0 |

**首个不同字符偏移：不存在**（四件产物 md5 全等）。RN 原始输出：

```
ROOT = D:\HippocampusRN
VARIANT = full
budget = {"enabled":true,"maxTokens":3000}
  <state before buildStatic> currentCard.name=T10 playerData.keys=["portrait","inventory","_openingPrompt"] chatHistory.length=0 hint=undefined _pendingSystemNotices.length=0
[1 buildStatic]     String.length=6336  codePoints=6336  bytes(utf8)=11867  md5(utf8)=2734EF5B244979EA503E9DAC18A7DFA4  md5(utf16le)=4A52F4B2177EFA3BDB66725229D763AA  est=2643
[2 buildSemiStatic] String.length=200   codePoints=200   bytes(utf8)=524    md5(utf8)=F32A95FD8E41981E12EED9797F1F5CC2  est=103
  _lastTrimmedLevel(before) = undefined
[3 buildDynamic]    String.length=679   codePoints=679   bytes(utf8)=1514   md5(utf8)=8984061B4303E7BCB2D75A61DD02EE11  est=309
  _lastTrimmedLevel(after)=0   _lastTrimLog(after)=[]   _lastPromptEstimate=309   _lastPromptChars=679
[4 estimateTokens(buildStatic)] = 2643
[5 buildSystem] length = 7217  md5(utf8) = 1F24D1BBA8EA40B0D5F74F47AD43B479  estimateTokens = 3054
```

**旧报绝对值对不上的根因（减法实验，可复现）**

```
### noportrait（删 playerData.portrait）  buildStatic 6336 / buildSemiStatic 143 / buildDynamic 679
### noplayer  （删 playerData 整块）      buildStatic 6336 / buildSemiStatic 抛 TypeError
### nostate   （删 currentState）         buildStatic 6336 / buildSemiStatic 200 / buildDynamic 抛错
```

⇒ 三件产物都随夹具 GameState 状态变化。旧报标签为「空态 GameState」（见归档旧报 §5），那一版临时脚本已删除 ⇒ **旧绝对值不可复算**，如实记。**未为对齐数字改夹具常量 / `estimateTokens` / 断言阈值。**

**旧报「新增文本 52 / 106」更正**：直接量测得 `【世界自行运转】=50`、`【NPC 社交距离三档】=98`。

**口径声明（§四.1 的 566 / 477）**

```
-- engineRules --  条数=11   Σ各条 String.length=556   arr.join('\n').length=566
-- promptRules --  条数=12   Σ各条 String.length=466   arr.join('\n').length=477
```

计数表达式 = `GM_DEFAULTS.engineRules.join('\n').length` / `GM_DEFAULTS.promptRules.join('\n').length` —— **直接量测**；含条间 `\n`，**不含**渲染前缀（`· ` / `1. `）、不含注释、不含首尾空白。差值 `10 = 11−1`、`11 = 12−1`。

| 区 | 改前（2026-09-30 桌面留档快照直接量测） | 改后（两仓相同） | Δ |
|---|---|---|---|
| `engineRules` | 9 条 / Σraw 356 / join 364 | 11 条 / Σraw 556 / join **566** | +2 条 / Σraw +200 / join +202 |
| `promptRules` | 10 条 / Σraw 318 / join 327 | 12 条 / Σraw 466 / join **477** | +2 条 / Σraw +148 / join +150 |

> 旧报「前 366 / 319 字符」「新增 200 / 158」= **推算值，非直接量测，且推算有误**（漏计新增的 2 个 `\n`）⇒ 作废。
> 留档快照 = 桌面 `留档_2026-09-30_真实userData_PACK2关账前\src_snapshot\engine__core__prompt_builder.js`（35,996 B / `5042DC2D778B901D0EBB423FB2052A12`）；其 `GM_DEFAULTS` 前 9 / 前 10 条逐条长度与现文完全一致。**RN 侧无对应改前留档 ⇒ RN 改前值「未直接实测」**（与 T2 同因）。

---

### T2 · 42 行裸 LF —— 取 B（降级措辞 + 行号清单）

**做了什么** → 全盘搜 RN 改前副本；搜不到 ⇒ 降级措辞 + 列全部 42 行行号。

```
> Glob D:\HippocampusRN  **/*prompt_builder*  → 仅 d:\HippocampusRN\engine\core\prompt_builder.js（1 份）
> Glob 母目录            **/*prompt_builder*  → 桌面现行 1 份 + 2026-09-30 桌面留档快照 1 份（均非 RN 版）
```

⇒ **无改前副本可证**（两仓亦无 git 历史，与本单 §T2 陈述一致）。

**42 行行号清单**

```
CRLF = 874   bareLF = 42   loneCR = 0   BOM = false
bareLF = [44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,
          183,184,185,186,187,
          202,203,204,205,206,207,208,209,210,
          225,227,228,229,233,
          382,383]
```

**措辞变更**

| | 旧 | 新 |
|---|---|---|
| 报告 | 「RN 侧 42 行裸 LF 为 P9/P10 遗留、**非本轮引入**」 | 「RN 侧 42 行裸 LF **本轮未统一；来源未验证（无改前副本可比）**」 |

**佐证（非证明）**：① `:44–64` 为 P10·B1 的注释块（注释文本只表达作者意图，不证明行尾来源）；② P11 在 RN 的改动行（`:20` / `:22` / `:36–37`）**均不在** 42 行清单内 ⇒ 与本轮改动无交集；③ 桌面同文件 900 CRLF / 0 裸 LF。

---

### T3 · 跨仓耦合处置（只出方案，未动代码）

**耦合点（实测）**

| 类型 | 文件:行 | 内容 |
|---|---|---|
| 桌面绝对路径 | `worldbook_smoke.js:22`、`p10_smoke.js:16`、`num_editor_smoke.js:22`、`log_query_smoke.js:20` | `var DESK = 'd:\\AI文游\\神秘小引擎测试版\\神秘小引擎测试版';` |
| 桌面文件当锁定基线（3 处） | `log_query_smoke.js:584-595`（`bases`）/ 断言 `:597`；`num_editor_smoke.js:474-480`（`BASE`）/ `:481-485`；`worldbook_smoke.js:586-596`（`LOCK`）/ `:597-600` | 三项：`gamestate.js`、`prompt_builder.js`（现 48055 / `DC7A753F…`）、`info_feed.js` |
| 桌面参考件（只读） | `num_editor_smoke.js:487-490`；`worldbook_smoke.js:573-579` | 桌面 `web_search.js` / `editor.js` / 7 个世界书文件 |
| 跨仓同源哨兵（**正确设计，建议保留**） | `log_query_smoke.js:578-579`（F13）、`:599-600` | 断「桌面 X ≡ RN X」——同源纪律的正向守卫 |

**已发生的实际触发**：P11 改桌面 `prompt_builder.js` 后这 3 条基线全部转红，本轮已做 3 处改指（`log_query_smoke.js:590`、`num_editor_smoke.js:478`、`worldbook_smoke.js:594`）。

#### 方案 A（推荐）：只比对 RN 本仓基线，桌面仅软提示

| 文件 | 行 | 改后 | 断言变化 |
|---|---|---|---|
| `log_query_smoke.js` | `:586-590` + `:597` | 三项基线改取 `path.join(root, …)`，值为 **RN 本仓** md5；桌面只留 `fs.existsSync(DESK+…)` 软提示（不 red） | 3 条**换比较对象**，条数不变 |
| `num_editor_smoke.js` | `:476-478` + `:481-485` | 同上 | 同上 |
| `worldbook_smoke.js` | `:592-594` + `:597-600` | 同上 | 同上 |
| `REF` 参考件 | `num_editor :487-490`、`worldbook :573-579` | 建议一并改读 RN 本仓同名文件（RN 有 `engine/web_search.js`、`engine/editor.js`；`worldbook/*` 为 RN 独有） | 条数不变 |
| `DESK` 声明 4 处 | `:20/:22/:22/:16` | REF 本仓化后可删；或保留作软提示 | — |

- RN 本仓新基线值：`prompt_builder.js` `83CD88555EE387A09116D8FA8C05B053`（49,381 B）；`gamestate.js` / `info_feed.js` 按 RN 盘上现值。
- 这 3 个文件是 **RN 独有**（桌面无同名 smoke）⇒ **非两仓同源件，无四格表义务**；改后也不产生新同源关系。
- **不删、不放宽**任何断言。副作用：改 RN 文件也要改 RN 基线（自洽）。

#### 方案 B：保留跨仓哨兵 + 加注释

| 文件 | 行 | 改后 |
|---|---|---|
| `log_query_smoke.js` / `num_editor_smoke.js` / `worldbook_smoke.js` / `p10_smoke.js` | `:20` / `:22` / `:22` / `:16` | 各加 3 行注释：「刻意的跨仓哨兵；桌面仓改动会让本仓失败，属**预期**」 |
| RN `docs\TRAE_REPORT.md` | — | 记一条「已知跨仓耦合」 |

- **断言零变化**；两仓 md5 仅因注释变化；无同源件义务。
- 代价：桌面每次改那 3 个文件必须手工同步 3 处基线（P11 已发生一次）。

#### 方案 C：桌面也建同名 smoke，两边对称

| 项 | 内容 |
|---|---|
| 新增文件 | 桌面 `tools\log_query_smoke.js` / `num_editor_smoke.js` / `worldbook_smoke.js`（约 105 KB） |
| 阻塞 | 依赖 RN 独有模块（`engine/num_editor.js`、`engine/wb_common.js`、`engine/wb/*.js`），桌面无 ⇒ 需大段裁剪或先移植 |
| 连带 | 桌面 `tools\run_batch.js` 需注册（**不在本单白名单**） |
| 建议 | **不推荐** |

**待勾选**：A / B / C。

---

### T4 · P11 APK 归档（已完成）

```
> Copy-Item "D:\HippocampusRN\android\app\build\outputs\apk\release\app-release.apk" "d:\AI文游\神秘小引擎测试版\HippocampusRN-1.0-release-universal-p11.apk" -Force
T4 d:\AI文游\神秘小引擎测试版\HippocampusRN-1.0-release-universal-p11.apk
  bytes=62754990   md5=4B99190E1400FF9CE875E5D06CEB4D8A   mtime=2026/10/2 7:57:45
--- P10（未覆盖）---
d:\AI文游\神秘小引擎测试版\HippocampusRN-1.0-release-universal.apk
  bytes=62754530   md5=340013A5F6D492F3B0A8C57A08D55FD8   mtime=2026/10/2 6:57:23
```

p11 包与源包 `app-release.apk` **逐字节一致**；P10 包**未被覆盖**。

---

### §5 RN 侧复跑口径（本单不重跑）

本单未改产品代码 ⇒ **不重跑、不改任何既有数字**。沿用 P11 关账实测：

| 项 | 结果（本单未变） |
|---|---|
| RN 21 套 smoke | 1795 ok / 0 failed（含 P11 新增 58；`polyfill=22`、`theme_tokens=146` 与 P10 逐字一致） |
| `tools\h6_panels_smoke.js` 三 cwd | 124 / 124 / 124 |
| `tools\npc_boundary_smoke.js` | 36 ok / 0 failed |
| `tools\longline_token_smoke.js` | 22 ok / 0 failed |
| 桌面 `claims.js` | 11 ok / 2 failed / 1 known-open（Y01/Y02） |
| 桌面 `run_batch.js --skip-preflight` | `BATCH_FAIL=0`，30 套全绿 |
| 桌面 `prompt_budget_smoke.js` / `npc_boundary_smoke.js` | 33 ok / 45 ok |

---

## 【遗留 · 下一步】

1. **T3 待勾选**（A / B / C）——本单不动代码。
2. **RN 侧 42 行裸 LF** 来源未验证；若要统一，需单开「行尾归一化」轮（会改 `prompt_builder.js` md5 ⇒ 3 处基线需同步改指）。
3. **跨仓耦合（若选 B）** 需在 `docs\CONVENTIONS.md` 补一条「已知跨仓哨兵」说明。
4. 旧报历史账：RN `docs\_archive\`（本单新建）现存放 `TRAE_REPORT_P11.md`。

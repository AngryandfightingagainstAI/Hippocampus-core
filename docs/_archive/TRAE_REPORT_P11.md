# TRAE_REPORT.md · 信箱

【轮次】P11 · 桌面同步 + 提示词边界引擎级化（合并轮）· RN 仓 `D:\HippocampusRN`
（上一轮 P10 报告已被本轮覆盖；P10 关键数字见下文引用处）

---

## 一 · 结论

**待开工指令**。

- RN 侧产品文件改动 3 个：`engine/core/prompt_builder.js`、`engine/core/storage.js`、`engine/npc_runtime.js`（**同源件**）；新增 2 个 smoke、改指 4 个既有 smoke。
- **同源件 `engine/npc_runtime.js` 两仓同步改，改后字节与 MD5 完全相等**（45,929 B / 4AC0191145925CF26289D63E34F77F4E）；改前两仓也相等（45,653 B / F7BA79D29EDE32AD219A55271075AA73）。
- **提示词口径：两仓静态协议已 0 差异** —— `buildStatic()` / `buildSemiStatic()` / `buildDynamic()`（空态）在两仓**逐字节相同**（md5 见【验证】4）；唯一残留差异是 `DEGRADE_STEPS`（RN 6 档 / 桌面 7 档），取 ②记为长期差异并写进桌面 `docs\PROMPT_TRACE.md`。
- **21 套 smoke 全绿：1795 ok / 0 failed**（P10 关账 1737 + 本轮新增 58 = longline 22 + npc_boundary 36）；**无删减**。`h6_panels_smoke` 三 cwd 一致 124/124。
- **release 重打 + 装机 + 冷启动截图已完成**：lastUpdateTime=`2026-10-02 08:00:44`。
- **无越权**：本仓写盘仅限 `engine/core/prompt_builder.js`、`engine/core/storage.js`、`engine/npc_runtime.js`、`tools/*_smoke.js`、`docs\TRAE_REPORT.md`、`p11_shots\`（截图证据）。`p11_shots\` 为新建证据目录（沿用 p1_shots…p9_shots 命名惯例），如实记录。
- **桌面仓**另有 2 个 claims FAIL（Y01/Y02）与本轮无关（根因 P10·C3 对桌面 `docs/CONVENTIONS.md` 的补录），详见桌面 `docs\TRAE_REPORT.md`。

---

## 二 · 改动

### 2.1 RN 仓文件表（字节 + MD5）

| 文件 | 前 | 后 |
|---|---|---|
| `engine/core/prompt_builder.js` | 47,989 B / CD134879… | **49,381 B / 83CD88555EE387A09116D8FA8C05B053**（874 CRLF + 42 行既有裸 LF） |
| `engine/core/storage.js` | 12,929 B / 3887067B… | **12,778 B / B2966498F3129156114B59CBF650C864**（202 全 CRLF） |
| `engine/npc_runtime.js`（同源件） | 45,653 B / F7BA79D29EDE32AD219A55271075AA73 | **45,929 B / 4AC0191145925CF26289D63E34F77F4E**（1192 全 CRLF） |
| `tools/npc_boundary_smoke.js`（新增） | — | 13,690 B / 441388762A7934471E82E5403D5B393C（247 LF） |
| `tools/longline_token_smoke.js`（新增） | — | 14,175 B / EBBD85EEBFB4027135753DCED5EFBB6A（283 LF） |
| `p11_shots/cold_start_release.png`（新增证据） | — | 1,602,275 B / MD5 29FA78FC5F005133A3ADC230A75B2404 |

### 2.2 逐项改动说明

**S1 · 默认 cardStyle 去重 + 行为规则引擎级化**
- `engine/core/storage.js` 默认 `gm.cardStyle`：删【世界自行运转】全文、【NPC 社交距离三档】全文、【一句话总纲】内「不替玩家决策」句（RN 侧【感官锚点】【对话功能】重复段已在 P10·B2 删除）⇒ cardStyle 1,057 → **832 字符**。
- `engine/core/prompt_builder.js` `GM_DEFAULTS`：`engineRules` 补 S2（`:20`）/ S3（`:22`）；`promptRules` 补【世界自行运转】/【NPC 社交距离三档】（`:36-37`）。
- **存量用户配置不动**：已落盘 `gm.cardStyle` 不迁移、不清洗。

**S2 / S3 · 玩家主体边界细则 + NPC 自主细则**（引擎级，不受用户配置影响）
- S2：`不替玩家决策，不得替玩家写「说了什么 / 想了什么 / 感受到什么 / 决定了什么 / 下一步一定会做什么」。例外只有两种：玩家输入明确要求，或引擎已产生确定状态。玩家输入按 OOC 行动指令理解（与【用户指令识别】的 OOC 口径一致）。`
- S3：`NPC 可以拒绝、误解、不信、忽略玩家、改变计划、与他人行动、产生玩家不知道的信息、在玩家离开后继续行动。可以行动 ≠ 必须行动：允许不行动、等待、观察、犹豫。`

**S6 · KNOWLEDGE_SOURCES 补 rumor / misconception（同源件）**
- `engine/npc_runtime.js`：`['witness','told','public','deduced','manual','legacy']` → `['witness','told','rumor','public','deduced','misconception','manual','legacy']`（6 → 8 值），4 处 `KNOWLEDGE_SOURCES.indexOf(` 校验点贯通（存档归一化 / 合并默认值 / API 入参 / `npc_knows` 工具入参，非法回落 `deduced`）。
- `engine/core/prompt_builder.js:202` 工具说明同步：`source: witness/told/rumor/public/deduced/misconception/manual，默认 deduced`。

**S10 · 新增 `tools/longline_token_smoke.js`**（36 回合曲线 + Logger 两层）
**S11 / S12 · 新增 `tools/npc_boundary_smoke.js`**（① 引擎级规则 ② source 枚举 ③ 暧昧/恋爱防回退 ④ S1 防回退 ⑤ S12 旧存档降级路径）

### 2.3 改指（4 处既有 smoke 断言，逐条给理由）

| 文件 | 断言 | 前值 | 后值 | 理由（事实变化） |
|---|---|---|---|---|
| `tools/log_query_smoke.js` | G 段桌面基线 | `80B5870D519EE0FAAB80DEA18BEA7357` | `DC7A753F8A5A32F8D6886C00F67FF521` | 桌面 `engine/core/prompt_builder.js` 被 P11·S1/S2/S3/S5/S6/S7 改动（规则搬家 + 补细则 + 口径复核 + 预算口径拆分），原基线对应文件已不存在 |
| `tools/num_editor_smoke.js` | I7 桌面基线 | `43724 / 80B5870D…` | `48055 / DC7A753F…` | 同上 |
| `tools/worldbook_smoke.js` | Q 锁定基线 | `43724 / 80B5870D…` | `48055 / DC7A753F…` | 同上 |
| `tools/p10_smoke.js` | B2b 红证 | — | — | P10 遗留：B2 红证随实测事实更新（上一轮段内完成，此处记账） |

**未删/未放宽任何断言**；4 处均为「值改指」，断言语义与强度不变（仍为字节 + MD5 双比对）。

---

## 三 · 验证

> 所有命令 cwd = `D:\HippocampusRN`。数字可复现。

### 1. 全量 smoke（21 套，逐套结果）

```
$ foreach (每个 tools\*_smoke.js) { node <file> }
cards_smoke.js                21 ok / 0 failed
create_flow_smoke.js         107 ok / 0 failed
create_smoke.js               23 ok / 0 failed
h6_panels_smoke.js           124 ok / 0 failed
home_smoke.js                 89 ok / 0 failed
image_smoke.js                39 ok / 0 failed
info_phone_smoke.js           40 ok / 0 failed
log_query_smoke.js            92 ok / 0 failed
longline_token_smoke.js       22 ok / 0 failed   ← 本轮新增
npc_boundary_smoke.js         36 ok / 0 failed   ← 本轮新增
num_editor_smoke.js           72 ok / 0 failed
p1_settings_smoke.js         202 ok / 0 failed
p10_smoke.js                  73 ok / 0 failed
panels_smoke.js              102 ok / 0 failed
polyfill_smoke.js             22 ok / 0 failed
saves_smoke.js                17 ok / 0 failed
settings_smoke.js            142 ok / 0 failed
story_smoke.js               195 ok / 0 failed
theme_tokens_smoke.js        146 ok / 0 failed
web_search_smoke.js           51 ok / 0 failed
worldbook_smoke.js           180 ok / 0 failed
TOTAL ok=1795 failed=0
```

对比 P10 关账 1737 / 0：**+58**（新增两套），**无一套减量**，`polyfill=22`、`theme_tokens=146` 与 P10 逐字一致。

### 2. `h6_panels_smoke` 三 cwd 一致

```
=== cwd=D:\HippocampusRN ===        H6_PANELS_SMOKE: 124 ok, 0 failed
=== cwd=D:\HippocampusRN\tools ===  H6_PANELS_SMOKE: 124 ok, 0 failed
=== cwd=D:\（绝对路径）===           H6_PANELS_SMOKE: 124 ok, 0 failed
```

### 3. 新增 `node tools\npc_boundary_smoke.js` 明细

```
PASS: S11-a..i   引擎级规则（不替玩家决策细则 5 项 / 例外两种 / OOC；NPC 可以拒绝 8 项 / 可以行动 ≠ 必须行动）
PASS: S11-j..o   S1 防回退（promptRules 含【世界自行运转】【NPC 社交距离三档】；默认 cardStyle 不含；去重命中 0）
PASS: S11-p..u   npc_knows source 枚举（含 rumor/misconception；保留原 6 值；indexOf 校验点 4 处；提示词同步）
PASS: S11-v..z   提示词 / GM_DEFAULTS / 默认 cardStyle 不含「暧昧」「恋爱」
PASS: S12-a..f   旧存档降级路径源码口径（routeMissingStep / openSave / CONTINUE_REASONS）
PASS: S12-g..j   旧存档降级路径行为口径（真调 openSave：create-flow / portrait / 字段齐放行）
NPC_BOUNDARY_SMOKE: 36 ok, 0 failed
```

### 4. S5 · 两仓提示词口径实测（同夹具）

| 项 | 桌面 | RN | 判定 |
|---|---|---|---|
| `buildStatic()` | len=6333 / md5=34F9241B9035E91624176CFADE8A087D | 同 | **逐字节相同** |
| `buildSemiStatic()` | len=102 / md5=373B113FE81F419888CCBEE70FA49BE3 | 同 | **逐字节相同** |
| `buildDynamic()`（空态 level0） | len=384 / md5=7534ADB20EC7016B2AB6B824A3ED5453 | 同 | **逐字节相同** |
| `estimateTokens(buildStatic)` | 2640 | 2640 | 同值 |
| `DEGRADE_STEPS` | 7 档（含 `names`） | 6 档 | **长期差异（②）** |

`estimateTokens` 前后：RN 侧静态文本 `buildStatic` 由 P11 前 47,989 B 源文件对应的文本，收敛到与桌面**同为 6333 字符 / 2640 tok**（S1/S2/S3 新增规则计入后两仓相等）。

### 5. S10 · 长线 token 原始数据表（36 回合）

```
---- S10 长线曲线（36 回合）----
回合 | 第四部分 est(token) | 已降级档数 | chatHistory 条数
   1 |                  335 |          0 |                2
   5 |                  547 |          0 |               10
  10 |                  766 |          0 |               20
  15 |                  854 |          1 |               30
  20 |                  860 |          6 |               40
  25 |                  996 |          6 |               50
  30 |                 1133 |          6 |               60
  35 |                 1269 |          6 |               70
  36 |                 1296 |          6 |               72
```

- 档数序列单调不倒退：`0×12,1×4,3×3,6×17`；首次降级第 13 回合，封顶 6。
- 档序 = `["recent1","clip2","count1","sum2","sum1","sum0"]`；每档降级后 token 不增；`level0=4263 → level6=2764` 字符。
- Logger 两层：120 条 → `chunks=3`；+40 条 → `chunks=4`（不重复累积）、`messageCount=160`（累计非重置）、`fullText` 恒由 chunks 拼出；摘要 63 ≤ 200 字。
- 地板区在 level6 仍在：第四部分表头 / `>>> 当前时间：` / `>>> 今天是 …昨天…明天…`。

```
LONGLINE_SMOKE: 22 ok, 0 failed
```

### 6. 同源件四格表（`engine/npc_runtime.js`）

| | 改前 | 改后 |
|---|---|---|
| 桌面仓 | 45,653 B / F7BA79D29EDE32AD219A55271075AA73 | 45,929 B / 4AC0191145925CF26289D63E34F77F4E |
| RN 仓 | 45,653 B / F7BA79D29EDE32AD219A55271075AA73 | 45,929 B / 4AC0191145925CF26289D63E34F77F4E |

改前相等 ⇒ 同源件成立；改后仍**逐字节相等**。本轮 `engine/info_feed.js` 未改（两仓仍 38,401 B / C0D889B645A585C874DB26F3DFB12DBC）。

### 7. release 重打 + 装机 + 冷启动

```
$ cd android; .\gradlew.bat assembleRelease
BUILD SUCCESSFUL in 46s
267 actionable tasks: 30 executed, 237 up-to-date

android\app\build\outputs\apk\release\app-release.apk   62,754,990 B   2026/10/2 7:57:45

$ adb install -r …\app-release.apk
Success

$ adb shell dumpsys package com.hippocampusrn | findstr lastUpdateTime
      lastUpdateTime=2026-10-02 08:00:44

$ adb shell am force-stop com.hippocampusrn
$ adb shell am start -n com.hippocampusrn/.MainActivity
Starting: Intent { cmp=com.hippocampusrn/.MainActivity }
$ adb shell screencap -p /sdcard/p11_cold.png
$ adb pull /sdcard/p11_cold.png …\p11_shots\cold_start_release.png
/sdcard/p11_cold.png: 1 file pulled, 0 skipped. 35.7 MB/s (1602275 bytes in 0.043s)
```

冷启动截图（p11_shots\cold_start_release.png，1,602,275 B / MD5 29FA78FC5F005133A3ADC230A75B2404）经目视：主页正常渲染（`HIPPOCAMPUS CORE` 头、卡带列表、书票·主题选择器），非黑屏、非闪退。

### 8. S12 · 旧存档降级/拦截路径实测

见【验证】3 的 S12-a..j：源码口径 6 条（routeMissingStep 真跳转、openSave 两分支、inventory 排除、CONTINUE_REASONS 文案）+ 行为口径 4 条（真调 `openSave`：缺 playerData 子字段 → `create-flow`；缺 portrait → `portrait` 且 `UI_Portrait.start` 真被调用；字段齐 → `{ok:true, mode:'fresh'}` 进叙事页）。**均预期内拦截/放行，无缺陷。**

---

## 四 · 必答三问

### 问 1：规则搬家有没有真生效？

**有。** RN 默认 `cardStyle` 1,057 → **832 字符**（与桌面后值相等）；两段行为规则 + 「不替玩家决策」句已上提到 `GM_DEFAULTS`（`engineRules` 11 条 / 566 字符，`promptRules` 12 条 / 477 字符，两仓相等）。新装/新档：规则恒在场，玩家清空 cardStyle 不伤引擎规则。存量 `gm.cardStyle` 不迁移 ⇒ 老档会双份（≤340 字额外 token），有意取舍、非静默。

### 问 2：两仓提示词口径现在差在哪？

**静态协议 0 差异**（`buildStatic`/`buildSemiStatic`/`buildDynamic(空态)` 三者的 len+md5 两仓全同）；仅剩 `DEGRADE_STEPS` 的 `names` 档（RN 6 / 桌面 7），已记长期差异并写入桌面 `docs\PROMPT_TRACE.md:62`。**为什么可以接受**：该档只影响超预算时的渲染形态，不影响静态协议与工具声明；RN 侧 P10·B1 判定该档对真实数据是空档（`_toNameString` 只认 `·` 开头条目行）故删，桌面保留更保守（不丢【镜头内】信息）。

### 问 3：长线会不会膨胀/丢状态？

**不会。** ① 刹车第 13 回合触发、6 档封顶、单调不倒退；② Logger 按 40 线性分块（3→4，不重复累积），`fullText` 恒由 chunks 拼出；③ 顶档 level6 仍保留第四部分表头 / 当前时间 / 今天是·昨天·明天（地板区不进阶梯）。夹具把 `maxTokens` 压到 900 逼出刹车，末轮 est=1296 > 900 是「6 档用尽后的地板区余量」，生产默认 3000 ⇒ 远低于预算；**不是刹车没触发、不是日志没压缩、不是状态被裁掉**。

---

## 五 · 遗留 / 下一步

1. **`names` 降级档长期差异**（RN 6 / 桌面 7）：如需收敛，需授权同时改桌面 `engine\core\prompt_builder.js` 与 `tools\prompt_budget_smoke.js`（J1 断言）。
2. `engine/core/prompt_builder.js` 有 **42 行既有裸 LF**（P9/P10 遗留，非本轮引入）；本轮未统一，避免与两仓同源纪律冲突。
3. 存量用户 `gm.cardStyle` 未迁移 ⇒ 旧档规则双份（见必答三问 #1），如需清洗需另开迁移任务。
4. 桌面仓 `tools\claims.js` 2 个 FAIL（Y01/Y02，根因 P10·C3）不由本仓负责，详见桌面 `docs\TRAE_REPORT.md` 的【待批】。
5. `h6_panels` / `info_phone` / `p10` 等既有 smoke 本轮**未改指、未删断言**；改指的 4 处见 §2.3。

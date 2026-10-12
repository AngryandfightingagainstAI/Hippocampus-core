# TRAE_REPORT.md · RN 仓（HippocampusRN）

【轮次】P48 · Electron 天命面板核实 + 卡带指令补天命段 + 版本号 1.3.0 + APK 构建安装（任务书 `..\神秘小引擎测试版\docs\TRAE_TASK_P48_destiny_ui_version.md`，签发 2026-10-08）
提交物：RN 仓代码（改 `rn/instruction_templates.js`、`package.json`、`android/app/build.gradle`、`tools/version_sync_smoke.js`）+ 构建产物 `app-debug.apk` + 真机安装证据；桌面侧代码与守卫证据见桌面仓同名报告
前置：P47 报告已归档为 `docs/_archive/TRAE_REPORT_P47.md`（A024C062DB2FFF8B5C4F2CDAB9D4902F）。本文件为覆盖写入。

────────────────────────────────────────

【结论】

1. **任务 1（Electron 天命面板 JS）——前提错误，经你裁决「视为已完成」，未改码**。桌面 `index.html` 无创角渲染 JS（只有 `#cf-body` 容器与 `CreateFlow` 三按钮）；P47 已把面板实现于 `engine/story.js` 的 `renderDestiny / rollDestiny / pickDestiny`。按字面再加一份会成死代码 / 重复渲染路径（违反「禁止叠加防御」），故不加。属性落点经你裁决沿用**扁平 `data[key]`**（RN 侧 `CreateScreen.js:244-253` 即此口径；任务书字面的 `playerData.attributes[key]` 全仓无此结构）。
2. **任务 2（卡带指令补天命段）完成**：`rn/instruction_templates.js` 的 `part5()` 末尾插入「9. 天命系统 destiny（worldbook.destiny）」，与桌面 `engine/ui_cards.js` 的 `getInstructionTemplatePart5()` **逐字一致**（P16A-5/6 实测通过）；并同步桌面 `tests/unit/test_p16_instruction.js` 的 `EDITED_JOINED_MD5`：`047B81A6918264581D217DCEEB0EEE68` → `033B8C6382CC141F4F338C0DF59A1705`（拼合 23116 字）。
3. **任务 3（版本号）完成**：RN `package.json` `1.2.0` → `1.3.0`；`android/app/build.gradle` `versionCode 10200` → `10300`、`versionName "1.2.0"` → `"1.3.0"`。经你裁决**同时同步既存 P49 版本同步守卫**（两仓 `tools/version_sync_smoke.js` 基线 + 桌面批内守卫 + 桌面 `package-lock.json`），否则守卫必红。
4. **任务 4（APK）完成**：`gradlew assembleDebug` → `BUILD SUCCESSFUL in 7m 58s`；`adb install -r` → `Success`；设备 `V2118A`（34089226650035U）实测 `versionName=1.3.0 / versionCode=10300`（装前为 1.2.0 / 10200）。
5. **遗留 1 红（你裁决「不重打，如实记红」）**：桌面 `dist/latest.yml` 仍 `1.2.0`，触发 `VS-14` 与桌面 P49-4/6/15 红（与 RN 侧无关，但 RN `tools/version_sync_smoke.js` 会跨仓读到它，故本仓守卫也报 1 红）。
6. **自报 2 项**：
   - (a) 改桌面 `engine/ui_cards.js` 时编辑器把 33 行新行落成裸 LF，已字节级修正（本仓 `rn/instruction_templates.js` 本就是裸 LF，无此问题）。
   - (b) part5 表头「以下 5 个系统都是可选的」与实际条目数（改动前 8 / 改动后 9）不符，属存量文案，本轮未改。

────────────────────────────────────────

【改动】

**A. RN 仓**

| # | 文件 | 改动 | 改后 bytes | 改后 MD5 |
|---|------|------|-----------|----------|
| 1 | `rn/instruction_templates.js` | `part5()` 末尾（`'· title/content/desc …'` 之后）插入 33 行「9. 天命系统 destiny」段（与桌面逐字一致） | 41109 | 306F11AD046FCD90120480B28FA8B67B |
| 2 | `package.json` | :3 `"version": "1.2.0"` → `"1.3.0"` | 1347 | 43B7C4061AAD620F692A84C2684BAE72 |
| 3 | `android/app/build.gradle` | :85 `versionCode 10200` → `10300`；:86 `versionName "1.2.0"` → `"1.3.0"` | 4732 | C0B11B0C42F5E854FFE8FF59DABC474A |
| 4 | `tools/version_sync_smoke.js` | :29-30 `EXPECT_VERSION '1.2.0'→'1.3.0'`、`MIN_VERSION_CODE 10200→10300`（与桌面逐字节同源） | 8794 | 8DE5CCC8206B8FE33C02081EDE0F0566 |

**B. 本轮改动的测试/守卫（逐条理由；非削弱断言，条数未减）**

| # | 文件（属哪仓） | 改动 | 理由 |
|---|----------------|------|------|
| 5 | 桌面 `tests/unit/test_p16_instruction.js` | `EDITED_JOINED_MD5` `047B81A6…` → `033B8C63…` | part5 新增段 ⇒ 拼合 MD5 必变；按该文件 P34→P43 更新先例同步。P16A-5/6（两仓逐字相同 / MD5 一致）仍原样守卫 |
| 6 | 桌面 `tests/unit/test_p49_version_sync.js` | `EXPECT_VERSION`/`EXPECT_CODE` → `1.3.0`/`10300` | P49 设计即「改版本必须显式改基线」；不改则 P49-8/9/13 必红 |
| 7 | 两仓 `tools/version_sync_smoke.js` | 同上基线 | 同上；且两仓必须逐字节同源（VS-15） |

**C. 桌面仓其余改动（同轮）**：`engine/ui_cards.js`（78474 B / C725CF0D468453751CB230942B4B6F29）、`package.json`（977 B / F1DE26C42280B7A9C2C5C544C44BAE9B）、`package-lock.json`（175061 B / 8B2677C03A214B8AF7C1BEF578551C79）。

**D. 未改（明确声明）**：`app.json`（P49 守卫 VS-13 要求它不含 version，该约束未破）；`D:\HippocampusRN\package-lock.json`（P49 口径「四处」不含 RN lock，其根仍为模板默认 `0.0.1`）；`dist/**`（桌面产物，你裁决不重打）。

**插入段原文**（与桌面 `engine/ui_cards.js` 逐字一致）：

```
───── 9. 天命系统 destiny（worldbook.destiny）─────
作用：创角时先掷 N 组属性，玩家挑一组作为"天命"，直接写进玩家属性。
适用：CoC 跑团式属性生成，或任何"先掷骰定底子"的题材。

"destiny": {
  "enabled": true,
  "sets": 5,
  "attributes": [
    { "key": "str", "name": "力量", "formula": "3d6*5", "min": 15, "max": 90 },
    { "key": "dex", "name": "敏捷", "formula": "3d6*5", "min": 15, "max": 90 },
    { "key": "con", "name": "体质", "formula": "3d6*5", "min": 15, "max": 90 },
    { "key": "siz", "name": "体型", "formula": "(2d6+6)*5", "min": 40, "max": 90 },
    { "key": "int", "name": "智力", "formula": "(2d6+6)*5", "min": 40, "max": 90 },
    { "key": "pow", "name": "意志", "formula": "3d6*5", "min": 15, "max": 90 },
    { "key": "edu", "name": "教育", "formula": "3d6*5", "min": 15, "max": 90 },
    { "key": "app", "name": "外貌", "formula": "3d6*5", "min": 15, "max": 90 }
  ]
}

字段说明：
· enabled：是否启用天命系统。false 或不配置 ⇒ 创角流程不出现天命面板（零变化）
· sets：掷骰组数（默认 5，范围 1-20）
· attributes：属性列表
  - key：属性唯一标识，选中后作为创角数据的键名写入（扁平）
  - name：显示名称
  - formula：掷骰公式（支持 3d6*5 / (2d6+6)*5 / 4d4+2，支持 + - * 三种运算与括号）
  - min / max：数值钳位范围（掷出结果超出则钳到边界）

三种做法：
· 不填 destiny → 没有天命系统，创角时无天命面板
· 填 "destiny": { "enabled": false } → 显式关闭
· 填完整内容 → 创角时出现「掷天命」：掷 N 组 → 玩家挑一组 → 属性写入创角数据
```

────────────────────────────────────────

【验证】

**V1 指令模板结构守卫** — `cwd=D:\HippocampusRN`，`node tools/p1_settings_smoke.js`，末行：

```
P1_SETTINGS_SMOKE: 202 ok, 0 failed
```
判定：**PASS**（含 P1I4-1/3/5/6：六段导出、`getInstructionTemplate()` 严格等于 p1+'\n'+…+p6、7 按钮文案、说明行逐字）

**V2 卡带兼容 / 两仓同源守卫** — `cwd=D:\HippocampusRN`，`node tools/card_compat_smoke.js`，末行：

```
CARD_COMPAT_SMOKE: 24 ok, 0 failed
```
（含 `ok W-4 两仓同源 engine/outputs.js（35476 字符）`、`ok W-5 手机模板含「顶层 npcs 兼容口径」`、`ok W-5d 旧误导口径已移除`）
判定：**PASS**

**V3 桌面模板守卫（跨仓读本仓 part5）** — `cwd=桌面仓`，`node tests/unit/test_p16_instruction.js`：

```
PASS: P16A-5 两仓六段逐字相同（各 214/20/13/26/232/198 行）
PASS: P16A-6 拼合后 MD5 两仓一致（033B8C6382CC141F4F338C0DF59A1705，23116 字）
PASS: P16A-7 模板正文等于 P16·A 定稿版（未被悄悄改动）
---------------------------------
SUMMARY: 13 passed, 0 failed
```
判定：**PASS**（证明本仓 part5 与桌面逐字一致）

**V4 版本同步守卫** — `cwd=D:\HippocampusRN`，`node tools/version_sync_smoke.js`：

```
ok   VS-1 本仓可识别（手机：HippocampusRN）
ok   VS-5 手机 package.json version = 1.3.0（实测 1.3.0）
ok   VS-6 Android versionName = 1.3.0（实测 1.3.0）
ok   VS-7 Android versionCode = versionName 派生值 10300（实测 10300）
ok   VS-8 Android versionCode >= 底线 10300（只增不回退）
ok   VS-10 两仓 package.json version 逐字相等（桌面 1.3.0 / 手机 1.3.0）
ok   VS-12 build.gradle 里 versionName / versionCode 各只声明一次
ok   VS-13 手机 app.json 没有引入第二个 version 字段
ok   VS-15 两仓 tools/version_sync_smoke.js 逐字节同源（8794 B）
FAIL VS-14 dist/latest.yml 的 version = package.json version（实测 1.2.0）  :: latest.yml 决定将来 electron-updater 认哪个版本，必须与 package.json 同值

VERSION_SYNC_SMOKE: 14 ok, 1 failed
```
判定：**14 PASS / 1 红**（红为桌面产物 `dist/latest.yml`，非本仓文件）

桌面批内守卫 `node tests/unit/test_p49_version_sync.js`（cwd=桌面仓）：`SUMMARY: 12 passed, 3 failed`（红同为 `dist/latest.yml`：P49-4 / P49-6 / P49-15）

**V5 任务 4 · APK 构建** — `cwd=D:\HippocampusRN\android`，`.\gradlew.bat assembleDebug`：

```
> Task :app:assembleDebug
BUILD SUCCESSFUL in 7m 58s
212 actionable tasks: 95 executed, 117 up-to-date
```
判定：**PASS**

**V6 任务 4 · 真机安装与版本核验**：

```
adb devices -l
34089226650035U        device product:PD2118 model:V2118A device:PD2118 transport_id:1

adb install -r "D:\HippocampusRN\android\app\build\outputs\apk\debug\app-debug.apk"
Performing Streamed Install
Success

adb shell dumpsys package com.hippocampusrn | Select-String "versionCode|versionName"
    versionCode=10300 minSdk=24 targetSdk=36
    versionName=1.3.0

adb shell pm list packages | Select-String hippocampusrn
package:com.hippocampusrn
```
（`lastUpdateTime=2026-10-08 22:01:42`；装前实测 `versionCode=10200 / versionName=1.2.0`）
判定：**PASS**

**V7 产物指纹**：

```
9876465F622A40BABA061F8834EC1213  131254518  android\app\build\outputs\apk\debug\app-debug.apk
```
判定：**PASS**

**V8 残留扫描** — 本仓 `tools/` 下 grep `1\.2\.0|10200`：**No matches found**；桌面 `tests/`+`tools/` 同扫亦无。判定：**PASS**

────────────────────────────────────────

【遗留 / 下一步】

1. **红：桌面 `dist/latest.yml` = 1.2.0**（桌面 VS-14 + P49-4/6/15）。你已裁决「不重打，如实记红」。修法：桌面仓 `npm run pack`。
2. **存量文案不一致（未改）**：`rn/instruction_templates.js` / 桌面 `engine/ui_cards.js` part5 表头「以下 **5** 个系统都是可选的」，实际条目改动前 8 / 改动后 **9**。要修需两仓同步并再改 P16A-7 常量。
3. **未做真机截图**：P48 任务书未要求界面截图；V6 仅覆盖安装与版本号。任务 1 的天命面板可见性本轮**无 UI 证据**（其逻辑在 P47 已落地）。
4. **本仓 `package-lock.json` 根仍 `0.0.1`**（P49 口径「四处」不含它，未动）。
5. 待你批复；未获批前不再改码。

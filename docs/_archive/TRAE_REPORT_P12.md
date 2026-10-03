# TRAE_REPORT · P12（跨仓耦合方案 A + claims 两红 + 降档口径收敛）

## 【轮次】
P12 · 收尾轮。RN 仓视角。对应任务书《P12（跨仓耦合方案 A + claims 两红 + 降档口径收敛）》。
前置归档（红线：上轮报告先归档）：

| 仓 | 归档文件 | 字节 | MD5 | 行数 |
|---|---|---|---|---|
| 桌面 | `docs/_archive/TRAE_REPORT_P11尾项补交单.md`（新建） | 25,975 | `EBEDEE3C5BC5E2F47265FBD2B3432E3F` | 339 |
| RN | `docs/_archive/TRAE_REPORT_P11尾项补交单.md`（新建） | 17,175 | `83E8F980D43D4582367A6B8FAA1110D5` | 242 |

开轮基线复算（本机实测，与任务书抬头一致）：

| 文件 | 仓 | 字节 | MD5 |
|---|---|---|---|
| engine/core/prompt_builder.js | 桌面 | 48,055 | `DC7A753F8A5A32F8D6886C00F67FF521` |
| engine/core/prompt_builder.js | RN | 49,381 | `83CD88555EE387A09116D8FA8C05B053` |
| engine/info_feed.js | 两仓（同源件） | 38,401 | `C0D889B645A585C874DB26F3DFB12DBC` |
| engine/npc_runtime.js | 两仓（同源件） | 45,929 | `4AC0191145925CF26289D63E34F77F4E` |

两仓结构差异（任务书已核，不去「补平」）：RN 有 `engine/num_editor.js` / `engine/wb_common.js` / `engine/wb/*.js`，桌面没有；桌面有 `engine/editor.js`（实测 `D:\HippocampusRN\engine\editor.js` = **不存在**）。

## 【结论】

**待开工指令** —— 本轮 S1/S2/S4/S5 已完成；**S3 主体（统一为 6 档）做不了**（先决条件被实测证伪，已按用户批复维持桌面 7 档），两仓强制降级夹具差异已 100% 归因。

1. **S1 跨仓耦合 → 方案 A：完成。** RN `tools/log_query_smoke.js` / `num_editor_smoke.js` / `worldbook_smoke.js` 的「锁定基线」比较对象由桌面仓改本仓（`path.join(root, …)`），基线值取 RN 现盘实测；桌面件降为软提示。断言条数不变（92 / 72 / 180）。跨仓同源哨兵保留。实验双向取证完成。
2. **S2 claims 两条红：完成（桌面侧修复，RN 侧记账）。** 详见桌面报告【验证】S2（红证 11/2/1 → 绿证 13/0/1）。
3. **S3 names 降档口径收敛：做不了（+ 原因）。** 桌面 `names` 档非空档（实测 -237 token，`_toNameString` 兜底 `split('\n')[0]`），删档后桌面 C2 转红（1147 > 1000）；用户批复「撤回删档，维持桌面 7 档」。任务书要求的两仓强制降级夹具已照做，差异完整归因（见【验证】S3-②）。
4. **S4 RN 42 行裸 LF → CRLF：完成。** 49,381 / 874 CRLF / 42 裸 LF → **49,423 / 916 CRLF / 0 裸 LF / 0 loneCR**，内容逐行相等，`node --check` 通过。
5. **S5 同源件 + 全量回归：完成。** RN 21 套 **1795 ok / 0 failed**；同源件两仓 MD5 仍相等；桌面侧回归全绿（30/30、claims 13/0/1、prompt_budget 33/0、npc_boundary 45/0、packaged 10/0）；截图基线 84/84 sha256 全等；RN 重打 release → 装机 → 冷启动截图 → 归档 `…-universal-p12.apk`。

**需上级知悉（自报）：**
- **(a)** 本轮 RN APK 与 P11 APK **逐字节相同**（`4B99190E…`）：S4 只改行尾、bundle 内容不变 ⇒ gradle `mergeReleaseAssets/packageRelease` 判 UP-TO-DATE。已按流程照常归档 p12 包（不覆盖 p10/p11），并如实报「同 MD5」。
- **(b)** S3 档数两仓 7 / 6 不一致（按批复维持），任务书「档序逐字相同（6 档）」验收项未达成。

## 【改动】

### RN（白名单内）
| # | 文件 | 字节 | MD5 | 行尾 | 操作 |
|---|---|---|---|---|---|
| 1 | `engine/core/prompt_builder.js` | 49,423 | `C6F536BB3A7D23B76341D454E4F1CC42` | 916 CRLF / 0 裸 LF / 0 loneCR / 无 BOM | 改：S4 行尾归一（42 裸 LF→CRLF，+42 B） |
| 2 | `tools/log_query_smoke.js` | 31,124 | `690087118CBB4AEE450751567FF63515` | 0 CRLF / 619 裸 LF | 改：S1 锁定基线本仓化（runG） |
| 3 | `tools/num_editor_smoke.js` | 29,549 | `0E3A048716441351A2AB9232EDD7ED17` | 0 CRLF / 546 裸 LF | 改：S1 BASE/REF 本仓化 + 桌面软提示 |
| 4 | `tools/worldbook_smoke.js` | 46,370 | `E110CF28A96BFD66A2669206634F7AD2` | 0 CRLF / 913 裸 LF | 改：S1 LOCK/REF 本仓化 + 桌面软提示 |
| 5 | `tools/p10_smoke.js` | 27,418 | `A136A8B0E0632A1A676D85420141E3DE` | 0 CRLF / 511 裸 LF | 改：删无引用的 `var DESK` 声明（:16 改注释） |
| 6 | `docs/_archive/TRAE_REPORT_P11尾项补交单.md` | 17,175 | `83E8F980D43D4582367A6B8FAA1110D5` | 裸 LF | 新建（归档 P11 RN 报告，逐字节相等） |
| 7 | `docs/TRAE_REPORT.md` | 本报告 | — | — | 覆写 |
| 8 | 交付目录 `…\HippocampusRN-1.0-release-universal-p12.apk` | 62,754,990 | `4B99190E1400FF9CE875E5D06CEB4D8A` | — | 新建归档（不覆盖 p10/p11） |
| — | 截图 `…\p12_cold_start.png` | 1,602,105 | — | — | 新建（冷启动证据，存交付目录，不落仓内） |

S1 改动理由注释（每处均已写入源码）：「此改动源于 P11 复核发现的跨仓耦合，方案 A（用户批准）」「刻意的跨仓参考，不参与断言」。

### 桌面侧（本报告同步记账）
| # | 文件 | 字节 | MD5 | 操作 |
|---|---|---|---|---|
| 1 | `docs/CONVENTIONS.md` | 12,858 | `C17A10C3E40D338D37FC2DB783B40A3A` | 改：删 3 条 RN 独有 A 类项（40→37） |
| 2 | `engine/classify.js` | 20,299 | `F6716D20EC0BA44E8ED53561DCCDB8EC` | 改：补「平台依赖：」声明 |
| 3 | `docs/_archive/TRAE_REPORT_P11尾项补交单.md` | 25,975 | `EBEDEE3C5BC5E2F47265FBD2B3432E3F` | 新建归档 |
| 4 | `docs/TRAE_REPORT.md` | 见桌面报告 | — | 覆写 |
| — | `engine/core/prompt_builder.js` | 48,055 | `DC7A753F8A5A32F8D6886C00F67FF521` | 未改动（S3 撤回后回到开轮基线） |
| — | `tools/prompt_budget_smoke.js` | 14,720 | `971573B1D62A9DDBD8564BE57D82CBF5` | 未改动（S3 撤回后还原） |

### 同源件四格表（改前 / 改后 × 两仓）
| 文件 | 桌面 改前 | 桌面 改后 | RN 改前 | RN 改后 | 判定 |
|---|---|---|---|---|---|
| `engine/info_feed.js` | 38,401 / `C0D889B645A585C874DB26F3DFB12DBC` | 同（未动） | 38,401 / `C0D889B6…` | 同（未动） | 未动 + 两仓 MD5 仍相等 |
| `engine/npc_runtime.js` | 45,929 / `4AC0191145925CF26289D63E34F77F4E` | 同（未动） | 45,929 / `4AC01911…` | 同（未动） | 未动 + 两仓 MD5 仍相等 |

原始输出：
```
info_feed  desk=38401/C0D889B645A585C874DB26F3DFB12DBC  rn=38401/C0D889B645A585C874DB26F3DFB12DBC  equal=True
npc_runtime desk=45929/4AC0191145925CF26289D63E34F77F4E  rn=45929/4AC0191145925CF26289D63E34F77F4E  equal=True
```

## 【验证】

### S1 · 跨仓耦合方案 A

**改了哪几处（逐处）**
| # | 文件:行 | 改什么 |
|---|---|---|
| 1 | `log_query_smoke.js` runG（bases 三条 + 3 条断言） | 比较对象 `path.join(DESK,…)` → `path.join(root,…)`；基线值换 RN 现盘（gamestate 9999/`B47489D4…`、prompt_builder 49423/`C6F536BB…`、info_feed 38401/`C0D889B6…`） |
| 2 | `log_query_smoke.js` 末 | 新增桌面同名件软提示循环（`console.log`，不参与断言） |
| 3 | `num_editor_smoke.js` BASE（:475-484）+ I7 断言 | 桌面三基线 → RN 本仓三基线，条数不变（3 条） |
| 4 | `num_editor_smoke.js` REF（:489-497）+ I8 断言 | `engine/web_search.js` 改指 RN 本仓（12200/`8A06F697…`）；桌面独有件 `engine/editor.js` 槽位改锁 RN 移植产物 `engine/num_editor.js`（11458/`01E7BED6…`），条数不变（2 条） |
| 5 | `num_editor_smoke.js` 末 | 桌面软提示循环（editor.js / web_search.js） |
| 6 | `worldbook_smoke.js` runQ（LOCK 3 条 + REF 15 条 + 目录合计 1 条） | 全部本仓：`engine/wb_common.js`(3587/`EB5BC8F4…`) + `engine/wb/*.js` 12 件 + `engine/num_editor.js` + `engine/web_search.js`；目录合计改 RN 本仓 `wbTotal=54163` |
| 7 | `worldbook_smoke.js` 末 | 桌面软提示（`worldbook/`、`engine/editor.js`、`engine/web_search.js`） |
| 8 | `p10_smoke.js:16` | 删除无引用的 `var DESK`，改注释说明 |

**原始输出（cwd = `D:\HippocampusRN`）**
```
LOG_QUERY_SMOKE: 92 ok, 0 failed
NUM_EDITOR_SMOKE: 72 ok, 0 failed
WORLDBOOK_SMOKE: 180 ok, 0 failed
```
断言条数未变（92 / 72 / 180，与改前逐套相同）。

**正向实验（只改桌面 prompt_builder.js 一行注释 → RN 三套仍全绿）**
```
桌面件 48055 → 48116 / 4B380381F226DCD254C67E8AB19B0C2D（临时）
LOG_QUERY_SMOKE: 92 ok, 0 failed
NUM_EDITOR_SMOKE: 72 ok, 0 failed
WORLDBOOK_SMOKE: 180 ok, 0 failed
```
**控制组红证（比较对象指回桌面 → 2 红）**
```
LOG_QUERY_SMOKE: 90 ok, 2 failed
FAIL: G [控制组] 桌面 engine/core/prompt_builder.js MD5 与记录一致（actual="7ACA3B02409F0B42A4CC68F6AE53ED52"）
```
**实验后还原**
```
桌面 engine/core/prompt_builder.js：bytes 48055 md5 DC7A753F8A5A32F8D6886C00F67FF521 CRLF 900 bareLF 0
PB_MATCHES_BASELINE true ；复跑 LOG_QUERY_SMOKE: 92 ok, 0 failed
```

**grep 复核（RN `tools/` 残留 DESK 引用）**
```
log_query_smoke.js:579  md5(path.join(DESK,'vfs','logger.js')) === md5(path.join(root,'vfs','logger.js'))   ← F13 跨仓同源哨兵（保留）
log_query_smoke.js:598  md5(path.join(DESK,'engine','info_feed.js'))                                       ← 跨仓同源哨兵（保留）
log_query_smoke.js:601  var dp = path.join(DESK, b[0]);                                                    ← 软提示
num_editor_smoke.js:317-318,331  templates/number.js,relation.js + DESK/engine/editor.js                   ← 模板同源 + 移植保真哨兵（保留）
num_editor_smoke.js:500  var dp = path.join(DESK, b[0]);                                                   ← 软提示
worldbook_smoke.js:610   var dp = path.join(DESK, rel);                                                    ← 软提示
p10_smoke.js:16          // 原硬编码 DESK 绝对路径已删除
```
结论：**无任何「桌面文件字节/MD5」再作 red 基线**；剩余为同源/移植保真哨兵（正向守卫）+ 软提示。

### S2 · claims 两条红（桌面侧执行）
红证 → 绿证：`CLAIMS: 11 ok, 2 failed, 1 known-open` → `CLAIMS: 13 ok, 0 failed, 1 known-open`。两条 FAIL 全文与 details 见桌面报告【验证】S2（Y01 三文件不存在 CONVENTIONS.md:49/50/51；Y02 `engine/classify.js` 缺声明）。known-open 仍 D03/theme-ids-exist。C02 84/58/21、T01 77 未变。

### S3 · names 降档口径收敛

**(a) 主体：做不了 + 原因**（详见桌面报告 S3；桌面 `names` 档实测 -237 token，删档后 C2 红 1147 > 1000，用户批复维持 7 档）。

RN 侧档序（未改，保持 P10·B1 删档后的 6 档）：
```
RN：DEGRADE_STEPS 档序（6 档） = ["recent1","clip2","count1","sum2","sum1","sum0"]
```

**(b) ① 默认夹具（boot()，maxTokens=3000）四件产物两仓并排**：两仓 md5 全等
| 产物 | 桌面 len/md5 | RN len/md5 | est |
|---|---|---|---|
| buildStatic | 6,336 / `2734EF5B244979EA503E9DAC18A7DFA4` | 6,336 / `2734EF5B244979EA503E9DAC18A7DFA4` | 2,643 |
| buildSemiStatic | 200 / `F32A95FD8E41981E12EED9797F1F5CC2` | 200 / `F32A95FD8E41981E12EED9797F1F5CC2` | 103 |
| buildDynamic | 679 / `8984061B4303E7BCB2D75A61DD02EE11` | 679 / `8984061B4303E7BCB2D75A61DD02EE11` | 309（level 0） |
| buildSystem | 7,217 / `1F24D1BBA8EA40B0D5F74F47AD43B479` | 7,217 / `1F24D1BBA8EA40B0D5F74F47AD43B479` | 3,054 |

该夹具停在 level 0，**只证 level 0 相同**。

**(c) ② 强制降级夹具（maxTokens=100 与 1，同一 boot() 状态）**
```
桌面：DEGRADE_STEPS 档序（7 档） = ["recent1","clip2","names","count1","sum2","sum1","sum0"]
RN  ：DEGRADE_STEPS 档序（6 档） = ["recent1","clip2","count1","sum2","sum1","sum0"]

RN（maxTokens=100，maxTokens=1 结果逐字节相同）：
_lastTrimmedLevel = 6
_lastTrimLog = [{"section":"recent1","before":309,"after":309,...},{"section":"clip2","before":309,"after":309,...},
                {"section":"count1","before":309,"after":305,...},{"section":"sum2","before":305,"after":305,...},
                {"section":"sum1","before":305,"after":305,...},{"section":"sum0","before":305,"after":291,...}]
final text len = 631  md5 = 924CC77076CB664BE0DF732F0B18C13C  est = 291

桌面（maxTokens=100）：
_lastTrimmedLevel = 7
_lastTrimLog = [recent1 309→309, clip2 309→309, names 309→288, count1 288→284, sum2 284→284, sum1 284→284, sum0 284→270]
final text len = 575  md5 = 75333B1319663A08C713500BA111AAB6  est = 270
```
差异定位与归因：
```
desk len=575  rn len=631 ; firstDiffOffset=324
RN 文本删掉 1 行「>>> （想让某人上镜头：npc_focus(id)；想让人离开现场：npc_scene_leave(id)）\n」（56 字符）后 == 桌面文本（逐字节）
hint len = 56 ; rn after removing hint == desk ? True ; rn2 len=575  desk len=575
```
- **第几档开始不同**：第 3 档（桌面 `names`，RN 无）。
- **首个不同字符偏移**：324。
- **归因（逐条列源码行）**：
  - 桌面 [prompt_builder.js:582-583](file:///d:/AI文游/神秘小引擎测试版/神秘小引擎测试版/engine/core/prompt_builder.js#L582-L583)：names 档 ON 时 `if (!on('names')) lines.push('>>> （想让某人上镜头…）')` 抑制该提示行。
  - RN [prompt_builder.js:588-592](file:///D:/HippocampusRN/engine/core/prompt_builder.js#L588-L592)：names 档已删，该提示行无条件 push。
  - RN 的 `_isTailLine`（[prompt_builder.js:805](file:///D:/HippocampusRN/engine/core/prompt_builder.js#L805)）在本夹具下 `count1` 产出与桌面**逐字一致**（两仓 count1 均 -4 token、文本相同），未产生额外差异。
- **结论**：差异 100% 归因于桌面 names 档存在与否 ⇒ 判为**「已知同源外差异」**，不算本轮失败。

### S4 · RN 42 行裸 LF → CRLF
```
改前：bytes 49381  md5 83CD88555EE387A09116D8FA8C05B053  CRLF 874  bareLF 42  loneCR 0
      裸 LF 行号：44–64, 183–187, 202–210, 225, 227, 228, 229, 233, 382, 383
改后：bytes 49423  md5 C6F536BB3A7D23B76341D454E4F1CC42  CRLF 916  bareLF 0  loneCR 0  无 BOM
字节差 = +42（= 42 个 \r）；行数 917 → 917（含末尾空元素）；firstDiffLine = -1（剥行尾后逐行相等）
content_hash 改前 = 改后 = 2D41E57BFA78FCD0C2ED3542320D67B1
node --check 退出码 = 0
```
连带：`num_editor_smoke.js` I7 的 prompt_builder 基线已同步为 `49423 / C6F536BB3A7D23B76341D454E4F1CC42`（S1 时写定），72 ok；`log_query_smoke.js` 同源基线同步，92 ok。桌面 `prompt_budget_smoke.js` A0a/A0c 不引用 RN 文件字节/MD5，不受影响。

### S5 · 同源件与全量回归

**RN 21 套（cwd = `D:\HippocampusRN`，逐套原始输出）**
```
cards_smoke.js        => CARDS_SMOKE: 21 ok, 0 failed
create_flow_smoke.js  => CREATE_FLOW_SMOKE: 107 ok, 0 failed
create_smoke.js       => CREATE_SMOKE: 23 ok, 0 failed
h6_panels_smoke.js    => H6_PANELS_SMOKE: 124 ok, 0 failed
home_smoke.js         => HOME_SMOKE: 89 ok, 0 failed
image_smoke.js        => IMAGE_SMOKE: 39 ok, 0 failed
info_phone_smoke.js   => INFO_PHONE_SMOKE: 40 ok, 0 failed
log_query_smoke.js    => LOG_QUERY_SMOKE: 92 ok, 0 failed
longline_token_smoke.js => LONGLINE_SMOKE: 22 ok, 0 failed
npc_boundary_smoke.js => NPC_BOUNDARY_SMOKE: 36 ok, 0 failed
num_editor_smoke.js   => NUM_EDITOR_SMOKE: 72 ok, 0 failed
p1_settings_smoke.js  => P1_SETTINGS_SMOKE: 202 ok, 0 failed
p10_smoke.js          => P10_SMOKE: 73 ok, 0 failed
panels_smoke.js       => PANELS_SMOKE: 102 ok, 0 failed
polyfill_smoke.js     => POLYFILL_SMOKE: 22 ok, 0 failed
saves_smoke.js        => SAVES_SMOKE: 17 ok, 0 failed
settings_smoke.js     => SETTINGS_SMOKE: 142 ok, 0 failed
story_smoke.js        => STORY_SMOKE: 195 ok, 0 failed
theme_tokens_smoke.js => THEME_TOKENS_SMOKE: 146 ok, 0 failed
web_search_smoke.js   => WEB_SEARCH_SMOKE: 51 ok, 0 failed
worldbook_smoke.js    => WORLDBOOK_SMOKE: 180 ok, 0 failed

TOTAL ok=1795 failed=0
```
与改动前基线一致（新增计入、未删）。

**桌面回归（摘要，逐套全文见桌面报告）**
```
CLAIMS: 13 ok, 0 failed, 1 known-open (共 14 项)
BATCH_END BATCH_FAIL=0 DURATION=276s ；[run_batch] 全绿 30 个测试（不带 KEEP_S_SHOTS）
PROMPT_BUDGET_SMOKE: 33 ok, 0 failed（J1 走到底档数 = 7）
NPC_BOUNDARY_SMOKE(desktop): 45 ok, 0 failed
PACKAGED_SMOKE: 10 ok, 0 failed
```

**截图基线（命令 + 输出）**
```
now=84 frozen=84 ；sha256 全等 = 84 / 差异 = 0 / 缺档 = 0（run_batch 前）
POST-BATCH sha256 equal=84 diff=0 missing=0（run_batch 后复检）
```
（比对对象：`docs/design_refs/s_shots/*.png` ↔ `D:\AI文游\神秘小引擎测试版\留档_2026-09-30_s_shots_PACK2前后\frozen_before\*.png`）

**RN 重打包 + 真机（S4 改了产品文件，按老流程）**
```
gradlew assembleRelease → BUILD SUCCESSFUL in 34s（27 executed / 240 up-to-date）
:app:createBundleReleaseJsAndAssets 执行；:app:mergeReleaseAssets UP-TO-DATE；:app:packageRelease UP-TO-DATE
⇒ S4 只改行尾、bundle 内容不变 ⇒ 本轮 APK 与 P11 逐字节相同
app-release.apk  62,754,990 B  MD5 4B99190E1400FF9CE875E5D06CEB4D8A
adb install -r -i com.android.vending → Success
adb shell am force-stop com.hippocampusrn → am start -n com.hippocampusrn/.MainActivity → 冷启动 7s
adb shell screencap -p /sdcard/p12_cold.png + adb pull → d:\AI文游\神秘小引擎测试版\p12_cold_start.png（1,602,105 B，主页正常渲染）
dumpsys package com.hippocampusrn → versionName=1.0 / lastUpdateTime=2026-10-02 10:11:00
归档：…\HippocampusRN-1.0-release-universal-p12.apk（62,754,990 / 4B99190E…）
既有归档未覆盖：…-universal-p11.apk（4B99190E…，重算相同）、…-universal.apk（340013A5…）
```

## 【遗留/下一步】

1. **S3 档数两仓不一致（7 / 6）**：按批复维持桌面 7 档；任务书「档序逐字相同（6 档）」验收项未达成，如实标注。
2. **本轮 RN APK 与 P11 同 MD5**：因 S4 仅改行尾、bundle 不变。若上级要求「p12 必须是内容不同的新包」，需有实际语义改动后再打。
3. **S1 遗留跨仓哨兵**：`num_editor_smoke.js:317-318/331`（templates 同源 + editor→num_editor 移植保真）仍跨仓比较，属正向守卫，未动；如需本仓化请另行批准。
4. **报告已写入 TRAE_REPORT.md**（本文件，覆盖写入；P11 RN 报告已归档 `docs/_archive/TRAE_REPORT_P11尾项补交单.md`）。

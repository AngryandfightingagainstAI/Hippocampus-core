# TRAE_REPORT.md · RN 仓（React Native / Android）

【轮次】P13-A（S1 手机未读可见化 + S2 设置页切 tab 脏守卫）· RN 仓 + 同源件核对 + 真机取证
提交物：RN 仓代码 + 本报告 + 真机截图（`docs/shots_p13/`，29 张）
前置：P12 已关账。P12 报告已先归档为 `docs/_archive/TRAE_REPORT_P12.md`（18,345 B / `D028A93D20179355CAD68905269D2AF1`，与任务书一致），本文件为覆盖写入。

────────────────────────────────────────

【结论】

1. P13-A 两个 S 项在 RN 仓落地完成，**每项都有「红证（旧代码下失败）→ 逐字节还原 drift=0 → 绿证」闭环**。
2. S1 真源唯一且不截断：叙事页顶栏、侧栏徽标、面板内「未读 N」三处**全部逐字消费 `InfoFeed.unreadTotal()`**，未新增第二计数器；`> 99` 仅显示口径 `99+`，真值不动。
3. S1-d 已读时机与桌面一致：**打开面板不标已读，进线程才 `PanelData.infoMarkRead`**。
4. S2：`SettingsScreen.switchTab` 切 tab 前过 `WB.DirtyGuard.checkAny()`，进入 worldbook 与**离开 worldbook** 都拦；用 `pendingGuard` / `desiredTab` 两个 ref 处理 Promise 竞态（连点以最后一次点击为准，不会「确认框还在、tab 已切」）。
5. 同源件 `engine/info_feed.js`、`engine/npc_runtime.js` **本轮未改**，两仓仍逐字节相等（四格表见【改动】）。
6. 回归：RN 21 套 `TOTAL_OK=1802 TOTAL_FAIL=0 ANOMALY:none`（P12 基线 1,795 ⇒ +7）；桌面回归见桌面仓报告，截图基线 `SHOTS_BASELINE_OK 84/84`（84 张 Node 逐张 SHA256 全等）。
7. 真机：release 重打 → `lastUpdateTime=2026-10-02 13:32:08`；APK `62,756,682 B / 43E4695F283837F82C9D9E2260212BC3`；APK 内 bundle 与构建生成物同 MD5（确为新包）。
8. 须自报偏差 6 条 + 1 条实测不符（两仓 `engine/story.js` 早已不同源），见【遗留/下一步】§7。

────────────────────────────────────────

【改动】

### 逐文件一句话

| # | 文件 | 一句话 |
|---|------|--------|
| 1 | `rn/components/SidebarDrawer.js` | `panelRow(key, label, badge)` 支持徽标（`showBadge = badge>0`，`>99 → 99+`）；`infoPhone` 行传入 `infoUnread` |
| 2 | `rn/screens/StoryScreen.js` | 顶栏「有未读才占位」的 📱+N（`topPhone` / `topPhoneBadge`，样式走 useTheme tokens）；无未读 `: null` 不占位 |
| 3 | `rn/story_changes.js` | `formatChangesForUI` 加 `info` 分支账块行（`send` → `手机收到了新讯息`，`broadcast` → `手机收到了新广播`） |
| 4 | `engine/story.js` | tick 前后比对未读真增量，**真增长才** `Platform.ui.appendHint('📱 手机收到了新讯息')` |
| 5 | `rn/screens/SettingsScreen.js` | 新增 `WB` 引入 + `switchTab` 脏守卫 + 竞态护栏；全部 tab `onPress` 改走 `switchTab`（无裸 `setCurTab` 直切） |
| 6 | `tools/info_phone_smoke.js` | 新增 S5-a 断言 G7–G11（侧栏徽标出口 / 三处同真源 / 顶栏出口 / 页边注出口 / 面板出口+PanelHost 分派） |
| 7 | `tools/settings_smoke.js` | 新增 S5-b 断言 H1（WB 引入 + 双向条件 + checkAny + 竞态护栏）、H2（无裸 setCurTab 直切残留） |

### 关键落点（行号已用 Grep 直读磁盘核验）

- `rn/components/SidebarDrawer.js:207-208` — `infoUnread = InfoFeed.unreadTotal() || 0`；`:211-212` `function panelRow(key, label, badge)` / `var showBadge = (typeof badge === 'number' && badge > 0);`；`:222-225` 徽标渲染（`badge > 99 ? '99+' : String(badge)`）；`:276` `{panelRow('infoPhone', '手机', infoUnread)}`
- `rn/screens/StoryScreen.js:194-195` — `phoneUnread = InfoFeed.unreadTotal() || 0`；`:520-529` `{phoneUnread > 0 ? (<TouchableOpacity style={styles.topPhone} ...><Text>{'📱'}</Text><View style={styles.topPhoneBadge}><Text>{phoneUnread > 99 ? '99+' : String(phoneUnread)}</Text></View></TouchableOpacity>) : null}`
- `rn/story_changes.js:104-106` — `} else if (r.type === 'info') {` → `if (r.action === 'send') lines.push({ icon: 'device-mobile', text: '手机收到了新讯息' });`
- `engine/story.js:576-585` — `__unreadBefore` / `__unreadAfter` / `if (__unreadAfter <= __unreadBefore) return;` / `Platform.ui.appendHint('📱 手机收到了新讯息');`
- `rn/screens/SettingsScreen.js:33` — `var WB = require('../../engine/wb_common.js');`；`:64-86` `switchTab` + `pendingGuard`/`desiredTab`；`:72` `var needGuard = (id === 'worldbook' || curTab === 'worldbook');`；`:77` `Promise.resolve(WB.DirtyGuard.checkAny()).then(...)`；`:156` `onPress: function () { switchTab(t.id); }`

### §4.4 改动面清单（字节 / MD5 改前→改后 / 行尾三数 / BOM）

> 行尾口径 = 逻辑行数 / CRLF 数 / 裸 LF 数。BOM 一律 `noBOM`。RN 侧除 `engine/story.js` 外均为纯 LF。

| 文件 | 改前 | 改后 | 行尾（logical / CRLF / loneLF） |
|------|------|------|-------------------------------|
| `rn/components/SidebarDrawer.js` | **未在动手前留基线（自报，见 §7-5）** | 13,324 B / `27E16E5801A5EC206F22CC3C9E763329` | 283 / 0 / 283 |
| `rn/screens/StoryScreen.js` | **未在动手前留基线（自报）** | 28,117 B / `340A6F90467B54A68B106F358AE561F1` | 586 / 0 / 586 |
| `rn/story_changes.js` | **未在动手前留基线（自报）** | 7,779 B / `88827B63A65D063E2F099C5D162FC41B` | 123 / 0 / 123 |
| `engine/story.js` | **未在动手前留基线（自报）** | 50,462 B / `8751ECABDD1DA57691BFEBFFA300B5F1` | 1076 / 1069 / 7（7 处裸 LF 在 L238-242、L322-323，RN 独有 `max_tokens` 透传区与 NpcDeduction 区，**非本轮编辑区**，既有） |
| `rn/screens/SettingsScreen.js` | **未在动手前留基线（自报）** | 7,870 B / `87786A37E7DFBF8BF90F26A9CEAA2685` | 173 / 0 / 173 |
| `tools/info_phone_smoke.js` | **未在动手前留基线（自报）** | 28,244 B / `5C2A78ACE9FC8816DD4EB10ADD908037` | 559 / 0 / 558（尾无换行） |
| `tools/settings_smoke.js` | **未在动手前留基线（自报）** | 27,211 B / `8C31583A9263860C30D0807822ED778D` | 450 / 0 / 450 |

改后字节稳定性证据：`p13_red_run.js post` 复算 `RESTORED_MD5_CHECK drift=0`（10 文件全部回原值）。

### 同源件四格表（改前两仓相等 ⇒ 改后仍相等）

| 同源件 | 桌面 改前 | RN 改前 | 桌面 改后 | RN 改后 |
|--------|-----------|---------|-----------|---------|
| `engine/info_feed.js` | 38,401 B / `C0D889B645A585C874DB26F3DFB12DBC` | 38,401 B / `C0D889B645A585C874DB26F3DFB12DBC` | 同（未改） | 同（未改） |
| `engine/npc_runtime.js` | 45,929 B / `4AC0191145925CF26289D63E34F77F4E` | 45,929 B / `4AC0191145925CF26289D63E34F77F4E` | 同（未改） | 同（未改） |

结论：本轮**无同源件改动**，四格全等。

────────────────────────────────────────

【验证】

### §4.2 RN 21 套（命令 → 逐套末行汇总原文；cwd = `D:\HippocampusRN`）

```
> node %TEMP%\p13_rn_suites.js
PASS tools/cards_smoke.js         (CARDS_SMOKE: 21 ok, 0 failed) 704ms
PASS tools/create_flow_smoke.js   (CREATE_FLOW_SMOKE: 107 ok, 0 failed) 147ms
PASS tools/create_smoke.js        (CREATE_SMOKE: 23 ok, 0 failed) 740ms
PASS tools/h6_panels_smoke.js     (H6_PANELS_SMOKE: 124 ok, 0 failed) 2392ms
PASS tools/home_smoke.js          (HOME_SMOKE: 89 ok, 0 failed) 806ms
PASS tools/image_smoke.js         (IMAGE_SMOKE: 39 ok, 0 failed) 808ms
PASS tools/info_phone_smoke.js    (INFO_PHONE_SMOKE: 45 ok, 0 failed) 2267ms
PASS tools/log_query_smoke.js     (LOG_QUERY_SMOKE: 92 ok, 0 failed) 134ms
PASS tools/longline_token_smoke.js (LONGLINE_SMOKE: 22 ok, 0 failed) 113ms
PASS tools/npc_boundary_smoke.js  (NPC_BOUNDARY_SMOKE: 36 ok, 0 failed) 94ms
PASS tools/num_editor_smoke.js    (NUM_EDITOR_SMOKE: 72 ok, 0 failed) 664ms
PASS tools/p10_smoke.js           (P10_SMOKE: 73 ok, 0 failed) 134ms
PASS tools/p1_settings_smoke.js   (P1_SETTINGS_SMOKE: 202 ok, 0 failed) 1326ms
PASS tools/panels_smoke.js        (PANELS_SMOKE: 102 ok, 0 failed) 987ms
PASS tools/polyfill_smoke.js      (POLYFILL_SMOKE: 22 ok, 0 failed) 2044ms
PASS tools/saves_smoke.js         (SAVES_SMOKE: 17 ok, 0 failed) 687ms
PASS tools/settings_smoke.js      (SETTINGS_SMOKE: 144 ok, 0 failed) 1242ms
PASS tools/story_smoke.js         (STORY_SMOKE: 195 ok, 0 failed) 1507ms
PASS tools/theme_tokens_smoke.js  (THEME_TOKENS_SMOKE: 146 ok, 0 failed) 2045ms
PASS tools/web_search_smoke.js    (WEB_SEARCH_SMOKE: 51 ok, 0 failed) 103ms
PASS tools/worldbook_smoke.js     (WORLDBOOK_SMOKE: 180 ok, 0 failed) 1195ms
SUITES=21 TOTAL_OK=1802 TOTAL_FAIL=0
ANOMALY: none
```
**计数口径**：以每套**最后一行**汇总行为准（`theme_tokens_smoke` 内嵌 BOOTSTRAP 行、`polyfill_smoke` 印两行等，不逐行累加——P12 曾因此得 1897 而非 1795）。P12 基线 1,795 ⇒ 本轮 +7（info_phone 40→45：+5；settings 142→144：+2）。**断言数只增不减。**

### §S5 新增断言（本轮）

- `tools/info_phone_smoke.js` G7/G8/G9/G10/G11（末行 `INFO_PHONE_SMOKE: 45 ok, 0 failed`）
  - `G7 S1-a 侧栏未读徽标出口（panelRow 第三参 badge + infoPhone 传未读数 + 徽标渲染）`
  - `G8 S5-a 三处未读同真源（SidebarDrawer / StoryScreen / panel_data 各消费点逐字）`（含反向断言「无第二真源 `setUnread`/`setPhoneUnread`」）
  - `G9 S1-b 叙事页顶栏未读出口（无未读不占位：三元 + null 分支）`
  - `G10 S1-c 页边注出口（story_changes info 分支 + engine/story tick 后 appendHint）`
  - `G11 S5-a 面板内未读出口 + PanelHost 分派（InfoPhonePanel 渲染出口 / infoPhone 路由）`
- `tools/settings_smoke.js` H1/H2（末行 `SETTINGS_SMOKE: 144 ok, 0 failed`）
  - `H1 P13·S2 切 tab 守卫点：WB 引入 + 双向条件 + checkAny + 竞态护栏`
  - `H2 P13·S2 全部 tab onPress 走 switchTab（无裸 setCurTab 直切残留）`

### §红证 / 绿证（31 处突变 → 全红 → drift=0 还原 → 全绿）

```
> node %TEMP%\p13_red_run.js red
=== MUTATE ===
（f0 index.html 2 / f1 ui_core 10 / f2 ui_panels 4 / f3 desktop story 1 /
  f4 SidebarDrawer 5 / f5 StoryScreen 3 / f6 panel_data 1 / f7 story_changes 1 /
  f8 RN story 1 / f9 SettingsScreen 5）替换命中总数=33
=== RED RUNS (期望全红) ===
[tests/unit/test_p13_visible.js] EXIT=1 :: SUMMARY: 0 passed, 6 failed
[tools/info_phone_smoke.js]      EXIT=1 :: INFO_PHONE_SMOKE: 41 ok, 4 failed
[tools/settings_smoke.js]        EXIT=1 :: SETTINGS_SMOKE: 142 ok, 2 failed
   FAIL: H1 P13·S2 切 tab 守卫点：WB 引入 + 双向条件 + checkAny + 竞态护栏
   FAIL: H2 P13·S2 全部 tab onPress 走 switchTab（无裸 setCurTab 直切残留）

> node %TEMP%\p13_red_run.js post
=== RESTORE ===
RESTORED 10 files
RESTORED_MD5_CHECK drift=0 (0 = 逐字节还原)
=== GREEN RUNS (期望全绿) ===
[tests/unit/test_p13_visible.js] EXIT=0 :: SUMMARY: 6 passed, 0 failed
[tools/info_phone_smoke.js]      EXIT=0 :: INFO_PHONE_SMOKE: 45 ok, 0 failed
[tools/settings_smoke.js]        EXIT=0 :: SETTINGS_SMOKE: 144 ok, 0 failed
```
反面要求达成：删/改被守护的**产品代码**（徽标传参、`unreadTotal()` 赋值、顶栏三元、info 分支、页边注、守卫条件、`switchTab` 接线）后断言必红 ⇒ 非恒真断言。

### §4.1 桌面回归（同源件交叉核对；命令在桌面仓根）

```
> node tools\claims.js                  → CLAIMS: 13 ok, 0 failed, 1 known-open (共 14 项)
> node tools\prompt_budget_smoke.js     → PROMPT_BUDGET_SMOKE: 33 ok, 0 failed
> node tools\npc_boundary_smoke.js      → NPC_BOUNDARY_SMOKE(desktop): 45 ok, 0 failed
> node tools\run_batch.js --skip-preflight → BATCH_END BATCH_FAIL=0 DURATION=277s（31 套）
```

### §4.3 截图基线 84/84（Node 逐张 SHA256）

```
> node %TEMP%\p13_shots_check.js
now=84 frozen=84 sha_diff=0 only_now=0 only_frozen=0
SHOTS_BASELINE_OK 84/84
```

### §5 真机取证

- **APK**：`gradlew assembleRelease` 产物 = 归档件 `D:\AI文游\神秘小引擎测试版\HippocampusRN-1.0-release-universal-p13.apk`
  `62,756,682 B / 43E4695F283837F82C9D9E2260212BC3`（**未覆盖** p11/p12 归档件；p11/p12 = 62,754,990 B / `4B99190E1400FF9CE875E5D06CEB4D8A`，本轮 APK 与之不同）
- **是否新包判定**：APK 内 `assets/index.android.bundle` = `2,024,320 B / B426787CD58B83E323DCCCEAF3AB3E4B`，与构建生成物 `android/app/build/generated/assets/react/release/index.android.bundle` **同 MD5** ⇒ 确为新构建（非旧包复用）。*注：APK 内该路径不在源码树，用 `tar -xf ... assets/index.android.bundle` 解出比对（偏差 4）。*
- **装机**：`adb install -r -i com.android.vending`（vivo 必须带 `-i`，否则卡 PackageInterceptActivity）
- **`adb shell dumpsys package com.hippocampusrn`**：
  ```
  codePath=/data/app/~~tHeG1afO0ZeumrIzQBb-ng==/com.hippocampusrn-OcS7mnO_a6-avvQh9uVOrw==
  versionName=1.0
  lastUpdateTime=2026-10-02 13:32:08
  ```
  设备：`34089226650035U  product:PD2118 model:V2118A`
- **截图目录**：`docs/shots_p13/`（29 张 + `_probe.png`），关键链：

| 图 | 内容 |
|----|------|
| `p13_30_red_story_nobadge` / `p13_31_red_panel_unread1` / `p13_32_red_sidebar_nobadge` | **设备级红证**：同一未读=1 场景下，红变体包叙事页无顶栏徽标、侧栏「手机 ›」无徽标，而面板内仍「未读 1」（真值对照） |
| `p13_40_coldstart` → `p13_41_after_continue` | force-stop 后冷启 → 继续存档 |
| `p13_50_topbar_unread1` / `p13_51_sidebar_badge1` / `p13_52_panel_unread1` | **绿证**：AI 调 `info_send`（`text="P13 unread probe"`）后，顶栏 `📱 1`、侧栏 `手机`+`1`、面板「未读 1」三处同时=1 且同真源 |
| `p13_52_panel_unread1`（打开面板）| **打开面板不清零**（仍为 1）⇒ 证明「打开面板不标已读」 |
| `p13_53_restart_home` / `p13_54_restart_topbar1` / `p13_55_restart_sidebar1` | force-stop 冷启后顶栏/侧栏仍=1 ⇒ **未读跨重启持久**（非「归零」） |
| `p13_56_thread_read0` | 进线程 → 面板「未读 0」 |
| `p13_57_topbar_after_read` | 返回叙事页顶栏无徽标且不占位 |
| `p13_27_bottom` | 叙事流末尾 `· 手机收到了新讯息` 页边注（另有 logcat `Skipping invisible child ... text: · 手机收到了新讯息` 佐证已渲染、仅屏幕外被 uiautomator 跳过） |

- **截图纪律**：只用 `adb shell screencap -p /sdcard/x.png` + `adb pull`（禁止 `>` 重定向——`exec-out > file` 产物字节不同：2,910,081 vs 1,603,064）。

### §S1-d 已读时机核对（三处同源同一时刻同数）

- 语义（不动）：**打开手机面板本身不标已读**；点线程标题进详情才 `markRead`。
- RN：`rn/components/InfoPhonePanel.js:140-145 enterThread(threadId) { PanelData.infoMarkRead(threadId); setDraft(''); setOpenThread(threadId); }`；列表态每线程 `●N`（`:284-286`）、详情态顶部「未读 N」（`:352`）。
- 桌面：`engine/ui_panels.js:323 openInfoThread` → `:326 InfoFeed.markRead(id)`（本轮对齐 RN 改成两态）。
- 三处（侧栏徽标 / 顶栏 / 面板内「未读 N」）读同一 `InfoFeed.unreadTotal()`；真机链证明同一时刻同数、进线程后同步下降。判定：**两仓一致，无 bug**。

### §6 玩家在游戏里能看到什么（改动前 / 改动后）— RN

| 屏 | 改动前 | 改动后（★本轮新增） |
|----|--------|---------------------|
| 主页（HomeScreen） | 卡库列表/创建/导入 | 无变化（本轮未动主页） |
| 叙事页（StoryScreen） | 顶栏只有侧栏键 + 卡名 + 时钟；AI 主动发讯后玩家无感知 | ★顶栏 📱+N（**仅 n>0 才渲染**，无未读 `: null` 不留空位，点击 `openPanel('infoPhone')`）；★tick 发讯后叙事流末尾页边注「📱 手机收到了新讯息」；★`info_send` 工具结果在 changes 行多一行 `· 手机收到了新讯息` |
| 侧栏（SidebarDrawer） | 「手机」行无提示 | ★行尾徽标显示未读数（n>0 才显示，n>99 显示 `99+`） |
| 面板（InfoPhonePanel） | 未读数只在面板内 | ★列表态「未读 N」+ 每线程 `●N`，点线程进详情；打开面板不清零、进线程才清零 |
| 设置（SettingsScreen） | 从「世界书」切到别的 tab，未保存修改静默丢失 | ★切 tab 前过 `WB.DirtyGuard.checkAny()`：离开 worldbook 也拦；选「继续编辑」保持当前 tab、选「放弃修改」才切；连点以最后一次点击为准 |

触发条件速查：未读增加 = `info_send`（`from !== 'player'` 时 unread+1）/ 空闲 `tick`；归零 = 进线程 `markRead`。本轮**不新增** AI 主动发讯的行为证据（R2，需真人测试者，属用户侧）。

────────────────────────────────────────

【遗留/下一步】

### §7 偏差与越界自报（性质 / 根因 / 授权来源 / 改动量）

1. **桌面 `tool_executor.js` info 分支实测 `:468-471`**（任务书 §2 写 `:417-421`）。性质：行号偏差；根因：任务书旧行号；授权来源：§7「以实测为准」；改动量：0。
2. **桌面 `engine/story.js` tick 落点实测 `:571-580`**（任务书 §2 写 `:560-561`）。同 1；改动量：0。
3. **RN `SettingsScreen.js` 的 WB 引入路径实测 `require('../../engine/wb_common.js')`**（任务书 §2 写 `../../../`）。性质：路径偏差；根因：任务书笔误（`rn/screens/` 上溯两级即仓根）；授权来源：§7；改动量：0。
4. **APK 内 `assets/index.android.bundle` 不在源码树**（任务书 §5 直接比对）。性质：取证路径偏差；根因：Hermes 产物在 `android/app/build/generated/assets/react/release/`；处置：`tar -xf` 解出比对；改动量：0。
5. **未在动手前为「任务书附基线」之外的文件留「改前」字节/MD5**（RN 侧 7 个文件 + 桌面 4 个文件）。性质：取证缺口；根因：动手前只核了任务书附表的 5 个文件基线，未对全改动集做改前快照；授权来源：§4.4 要求「动手前自己取一次」——**此处我漏做，主动自报**；改动量：0（改后态由红证逐字节备份 + `drift=0` 复跑证明稳定）。
6. **任务书 §6 称「桌面 P12 归档件应与 RN 归档件逐字节相等」，实测前提有误**。性质：任务书前提不符；根因：两仓 P12 报告本是两份不同文档；实测桌面归档 30,014 B / `2D6E1C57…`、RN 归档 18,345 B / `D028A93D…`，**分别与任务书给的两个字节/MD5 精确一致**；改动量：0。
7. **实测不符：两仓 `engine/story.js` 早已不同源**（桌面 49,898 B / RN 50,462 B，逐行比对 **834 行差异**，含 RN 独有 P5·S6-5 `max_tokens` 透传）。性质：任务书附基线把它列「请自行确认」；根因：非本轮引入的历史分叉；处置：本轮按任务书「RN 对应点自己定位」各自改（RN `:576-585` / 桌面 `:571-580`）；改动量：各自一处页边注块。**未列入本项目「同源件」（同源件仅 info_feed.js / npc_runtime.js，四格全等）。**

无其他越权改动：本轮 RN 仓写入文件仅上述 7 个（5 产品 + 2 测试），均在任务书授权面内。

### 未完成 / 移交 P13-B

- P13-B 全部未开工（按用户裁决「A 完成即停、等复核再开 B」）：S3 names 降档统一、S4 桌面长线 token 套件、S5-c/S5-d 计数口径收口、**RN `docs/CONVENTIONS.md`（R5 债务，RN `docs/` 现仅 `TRAE_REPORT.md` + `_archive/` + `shots_p13/`）**。

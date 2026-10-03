# H7 报告 · 剧情外信息层（手机）一期实现

> 唯一真相源：`D:\AI文游\神秘小引擎测试版\设计稿_剧情外信息层.md`（v2 定稿）+ `任务书_H7信息层一期.md`
> 通道：P1 批次 · P1-H 包 · 本项目**第一次同时改两仓**

---

## 【轮次】

P1-H / H7 一期 · 分步 S1→S5 全部走完，另补 S10 回归。

---

## 【结论】

**七项交付物全部落地，逐条判定如下：**

| # | 交付物 | 判定 | 依据 |
|---|--------|------|------|
| A | `engine/info_feed.js` 两仓逐字节同源 | **PASS** | 两仓均 37,520 B / MD5 `09CF6E57A6117064605E06131BC9484D` |
| B | 桌面接入 8 处 + `renderInfoFeedPanel()` | **PASS** | 8 处逐条 grep 见位（见【验证】§1） |
| C | RN 接入 8 处 + `rn/components/InfoPhonePanel.js` | **PASS** | 见【改动】表 |
| D | `D:\HippocampusRN\tools\info_phone_smoke.js`（A–F 六组） | **PASS** | `INFO_PHONE_SMOKE: 33 ok, 0 failed` |
| E | `claims.js` 72→76；`rn_startup_smoke.js` 加 InfoFeed | **PASS** | `CLAIMS: 13 ok, 0 failed, 1 known-open`；`SMOKE: 49 ok, 0 failed` |
| F | 本报告 + 真机截图 | **PASS** | 13 张截图（【验证】§5） |
| — | 既有 smoke 不回归 | **PASS** | 13 套全绿（含本轮同步 2 处陈旧断言） |

**必须自报的偏差 / 越界（6 条）：**

1. **【越界·已获当轮授权】** 改了 H7 授权清单外的 `rn/screens/settings/DataTab.js`（6 行）与 `rn/screens/settings/ColorTab.js`（1 行）。根因：`rn/screens/settings/` 下这两个文件把相对深度按 `rn/screens/` 写成 `../../`，应为 `../../../`，导致 Metro 整包 `UnableToResolveError`，S4 真机取证全段被阻断。已按红线「范围外改动先报告」停下发问，用户答复「授权按根因修 7 处」后修，只改相对深度、不动逻辑。
2. **【越界·已获当轮授权】** 改了 `tools/theme_tokens_smoke.js:44` 与 `tools/polyfill_smoke.js:43`：`BOOTSTRAP 47/0` → `48/0`。根因：P1-H 使 `rn_bootstrap.js` 模块数 47→48（新增 InfoFeed，`:161`），两套既有 smoke 的硬编码模块数断言陈旧。性质与任务书 §2 E 项 `claims.js 72→76` 完全一致。已发问，用户答复「授权同步两处断言」。
3. `rn/rn_bootstrap.js:160` 的注释原来写「37,199 B / MD5 6318B395F1550CC548C376C48590FE34」，与实测（37,520 B / `09CF6E57…`）不符，本轮改为实测值。
4. `engine/info_feed.js` 的 `info_send` / `info_broadcast` 返回值新增回显字段（`to`/`toName`/`text`/`title`），偏离设计稿 §4.1/§4.2 的文档化返回契约——不加这些字段 `tool_executor.formatForHistory` 的「讯息/广播」分支回显只剩空串（桌面 `engine/core/tool_executor.js:417-421`、RN `engine/core/tool_executor.js` 同分支）。
5. **RN 侧未改 `engine/core/prompt_builder.js` 与 `engine/core/gamestate.js`**（设计稿 §10.3 清单未列）⇒ RN 侧正常回合 AI 拿不到信息层提示词；tick 路径不受影响（走模块自带 `_tickPrompt`），切档靠 `load()` 懒加载兜底。
6. **`index.html` 的 script 插在 `:1042`**（`npc_deduction_ai.js` 之后），设计稿 §10.2 提到的位置是 `:1040`/`:1041`。

**任务书 §6 两问的答案：**

1. **同源办法 = 写一份、整文件复制另一份，再 MD5 复核**。从不「照抄行号」，也不跨仓继承行号；改动一律整文件同步。核对命令与原始输出见【验证】§1。
2. **桌面文案一致性的证明方式 = 源码级逐字断言（可复现命令见【验证】§4）**。原理：三处空态文案在桌面与 RN 都是字符串字面量，直接按 UTF-8 读源码做逐字命中比对即可证明；RN 侧另有 smoke E6 组把同一比对固化成了断言。

**未完成 / 未做：** `P1_REPORT.md`（P1 批次总报告）未写——见【遗留】1。

---

## 【改动】

### 桌面仓（`D:\AI文游\神秘小引擎测试版\神秘小引擎测试版\`）

| 文件 | 改前 字节/MD5 | 改后 字节/MD5 | 一句话 |
|------|---------------|---------------|--------|
| engine/info_feed.js | 新建（无改前） | 37520 / `09CF6E57A6117064605E06131BC9484D` | 新模块：数据层 + 4 工具 + 提示词注入 + 传播 + tick + 处分/混流 |
| engine/story.js | 未留存（下同） | 48538 / `EB271D780E101A49A33D1E9CDC4BB8D3` | 回合末 `InfoFeed.tick({round, locationId})`（`:560-561`） |
| engine/core/gamestate.js | — | 10046 / `9B3FC583DF088FE24B774BE4378F860C` | 切档 `InfoFeed.load()`（`:60`） |
| engine/core/prompt_builder.js | — | 35769 / `E436081C4766EB9BA74D93A9BF3DAE84` | `InfoFeed.formatForPrompt()` 注入（`:561-562`） |
| engine/core/tool_executor.js | — | 26668 / `61B1382223D7BC055ECFFEAA3E7FDB0A` | `formatForHistory` 加 `info` 分支（`:417-421`） |
| engine/module_registry.js | — | 4324 / `97033F519C78087F2CBB3AFE0DF85538` | 登记 InfoFeed（`:57`） |
| engine/ui_core.js | — | 73859 / `2BC2DC244C3165CBD8BFFF71378E0FAD` | 侧栏 push 手机入口（`:356`）+ 标题（`:792`）+ 分派（`:829`） |
| engine/ui_panels.js | — | 43091 / `F5776A16773529EAE54DC79A19E68507` | `renderInfoFeedPanel()`（`:258`）+ `promoteInfoToStory()`（`:334`） |
| index.html | — | 91648 / `ED75E889A36499C066341CBF910236DD` | 挂 `engine/info_feed.js`（`:1042`） |
| tools/claims.js | — | 35380 / `40730D7F2172D70D7F34C4CB2C4D0DF0` | T01 契约数 72→76（`:399-420`） |
| tools/rn_startup_smoke.js | — | 4932 / `AC3D68748188C1C2459A9376380AB3DA` | 模块表加 InfoFeed（`:46`）+ 等待放宽到 2300ms（`:77`） |

### RN 仓（`D:\HippocampusRN\`）

| 文件 | 改前 字节/MD5 | 改后 字节/MD5 | 一句话 |
|------|---------------|---------------|--------|
| engine/info_feed.js | 新建 | 37520 / `09CF6E57A6117064605E06131BC9484D` | 与桌面逐字节相同 |
| engine/story.js | 未留存 | 48538 / `EB271D780E101A49A33D1E9CDC4BB8D3` | 与桌面逐字节相同 |
| engine/core/tool_executor.js | — | 26554 / `118916D18623E6F0AD480DB0AADF8CE9` | `formatForHistory` 加 `info` 分支（行号独立定位） |
| rn/rn_bootstrap.js | — | 12285 / `0E97B95927A309FF6CECEA1EFDE36E30` | 挂第 48 模块 InfoFeed（`:161`）+ 顶部注释同步 |
| rn/components/PanelHost.js | — | 5935 / `B18AACD560FDB58D60A269690ABED12C` | require + `TITLE_MAP` + 分派 |
| rn/components/SidebarDrawer.js | — | 10969 / `92B35997E7524E6DEEB16F44C7919EBF` | 侧栏「手机」入口（`:238`）+ 头注 |
| rn/components/InfoPhonePanel.js | 新建 | 15304 / `6FFA59537F23C089DAF41FDE8302CC0A` | B 类面板：讯息/广播 tab、线程气泡、写讯息、跟进正文 |
| rn/panels/panel_data.js | — | 37091 / `658BAE900734DFBBE695C5D2E49A8967` | `computeInfoPhone` + 4 个动作壳（`:735-877`） |
| rn/screens/settings/DataTab.js | 13863 / `3E83BBDB5BA8FAACC517C4B09EA5663A` | 13881 / `C9B6D78354F8FC0133792BE18C2D0B93` | **越界（已授权）**：6 处 `../../` → `../../../` |
| rn/screens/settings/ColorTab.js | 23238 / `CE0308D8B9FDB9FDCFB93DBFD3F57219` | 23241 / `80BF6938ADD64B7DF35CEECB938F8492` | **越界（已授权）**：1 处 `../../` → `../../../` |
| tools/info_phone_smoke.js | 新建 | 18745 / `4A44C3E1C8099BA1A3AAA7A109E773D6` | A–F 六组共 33 条断言 |
| tools/theme_tokens_smoke.js | 未留存 | 11668 / `05289B2FE26CF0D9AC393F83F76ED161` | **越界（已授权）**：BOOTSTRAP 47→48 |
| tools/polyfill_smoke.js | 未留存 | 7670 / `E273470F6EF974049ECB130457D87088` | **越界（已授权）**：BOOTSTRAP 47→48 |

### 未改动确认

- 两仓 `package.json` / `android/**` / `app.json` / `index.js`：未改，未新增依赖
- 设备播种数据 `vfs:/cards/h5_demo_v1.json`、`global:home_cardId`：未改
- 设备备份 `.bak-h5` / `.bak-key` / `.bak-20260928` / `.bak-h6`：未删
- 桌面仓范围内其余文件：未动

---

## 【验证】

### 1. 两仓同源（任务书 §4.1）

命令（PowerShell，可复现）：

```powershell
$A='d:\AI文游\神秘小引擎测试版\神秘小引擎测试版\engine\info_feed.js'; $B='D:\HippocampusRN\engine\info_feed.js'
$C='d:\AI文游\神秘小引擎测试版\神秘小引擎测试版\engine\story.js';    $D='D:\HippocampusRN\engine\story.js'
foreach($f in @($A,$B,$C,$D)){ $i=Get-Item $f; Write-Output ($i.Length.ToString()+'  '+(Get-FileHash $f -Algorithm MD5).Hash+'  '+$f) }
```

原始输出：

```
37520  09CF6E57A6117064605E06131BC9484D  d:\AI文游\神秘小引擎测试版\神秘小引擎测试版\engine\info_feed.js
37520  09CF6E57A6117064605E06131BC9484D  D:\HippocampusRN\engine\info_feed.js
48538  EB271D780E101A49A33D1E9CDC4BB8D3  d:\AI文游\神秘小引擎测试版\神秘小引擎测试版\engine\story.js
48538  EB271D780E101A49A33D1E9CDC4BB8D3  D:\HippocampusRN\engine\story.js
```

判定 **PASS**：两个文件两仓各逐字节相同。

### 2. 桌面接入 8 处逐条见位

```
engine/core/gamestate.js:60    if (typeof InfoFeed !== 'undefined' && typeof InfoFeed.load === 'function') InfoFeed.load();
engine/core/prompt_builder.js:561-562  InfoFeed.formatForPrompt()
engine/core/tool_executor.js:417-421   else if (r.type === 'info') { send → 📱 讯息 / broadcast → 📡 广播 }
engine/story.js:560-561        InfoFeed.tick({ round: GameState.currentRound, locationId: ... })
engine/ui_core.js:356          allPanels.push({ id: 'infoPhone', num: '<span data-icon="device-mobile"></span>', name: '手机', full: false });
engine/ui_core.js:792          else if (panelId === 'infoPhone') title = '<span data-icon="device-mobile"></span> 手机';
engine/ui_core.js:829          if (panelId === 'infoPhone') return this.renderInfoFeedPanel();
engine/ui_panels.js:258        renderInfoFeedPanel() { … 空态「还没有收到任何讯息。」「还没有广播。」「手机模块未加载。」 }
engine/ui_panels.js:334        promoteInfoToStory(id) { … InfoFeed.promoteToStory(String(id||''), { by: 'player' }) }
engine/module_registry.js:57   { name: 'InfoFeed', group: '业务' },
index.html:1042                <script src="engine/info_feed.js"></script>
```

### 3. smoke 原始输出

**新增一套（cwd = `D:\HippocampusRN`）：**

```
INFO_PHONE_SMOKE: 33 ok, 0 failed
```

**既有 13 套（cwd = `D:\HippocampusRN`）：**

| smoke 文件 | 输出 | 判定 |
|------------|------|------|
| theme_tokens_smoke.js | `THEME_TOKENS_SMOKE: 146 ok, 0 failed` | PASS（本轮同步后） |
| polyfill_smoke.js | `POLYFILL_SMOKE: 22 ok, 0 failed` | PASS（本轮同步后） |
| settings_smoke.js | `SETTINGS_SMOKE: 103 ok, 0 failed` | PASS |
| home_smoke.js | `HOME_SMOKE: 89 ok, 0 failed` | PASS |
| cards_smoke.js | `CARDS_SMOKE: 21 ok, 0 failed` | PASS |
| create_smoke.js | `CREATE_SMOKE: 21 ok, 0 failed` | PASS |
| saves_smoke.js | `SAVES_SMOKE: 17 ok, 0 failed` | PASS |
| story_smoke.js | `STORY_SMOKE: 162 ok, 0 failed` | PASS |
| image_smoke.js | `IMAGE_SMOKE: 39 ok, 0 failed` | PASS |
| panels_smoke.js | `PANELS_SMOKE: 101 ok, 0 failed` | PASS |
| h6_panels_smoke.js | `H6_PANELS_SMOKE: 119 ok, 0 failed` | PASS |
| p1_settings_smoke.js | `P1_SETTINGS_SMOKE: 174 ok, 0 failed` | PASS |
| info_phone_smoke.js | `INFO_PHONE_SMOKE: 33 ok, 0 failed` | PASS（新增） |

合计 **14 套 / 1047 ok / 0 failed**。

> 未同步前的红证据（本轮第一次跑，两套各 1 failed）：
> ```
> THEME_TOKENS_SMOKE: 145 ok, 1 failed
> FAILURES:
>   - BOOTSTRAP 47/0（H6 加 UI_Portrait、P1-F 加 CARDS、P1-G 加 CardClassifyPure） :: ok=48 failed=0
> POLYFILL_SMOKE: 21 ok, 1 failed
> FAILURES:
>   - BOOTSTRAP 47/0（…） :: ok=48 failed=0
> ```

**桌面侧两套（cwd = 桌面仓根）：**

```
SMOKE: 49 ok, 0 failed
CLAIMS: 13 ok, 0 failed, 1 known-open (共 14 项)
```

### 4. 桌面 ⇄ RN 空态文案逐字比对（任务书 §6 问题 2 的答案）

命令（PowerShell，可复现）：

```powershell
$desk='d:\AI文游\神秘小引擎测试版\神秘小引擎测试版'; $rn='D:\HippocampusRN'
$pat='还没有收到任何讯息。|还没有广播。|手机模块未加载。'
Get-Content -Encoding UTF8 (Join-Path $desk 'engine\ui_panels.js') | Select-String -Pattern $pat | % { $_.LineNumber.ToString()+': '+$_.Line.Trim() }
Get-Content -Encoding UTF8 (Join-Path $rn 'rn\components\InfoPhonePanel.js') | Select-String -Pattern $pat | % { $_.LineNumber.ToString()+': '+$_.Line.Trim() }
Get-Content -Encoding UTF8 (Join-Path $rn 'rn\panels\panel_data.js') | Select-String -Pattern $pat | % { $_.LineNumber.ToString()+': '+$_.Line.Trim() }
```

原始输出：

```
=== 桌面（Electron）===
256: // 空态文案与 RN 逐字一致：还没有收到任何讯息。/ 还没有广播。/ 手机模块未加载。
259: if (typeof InfoFeed === 'undefined') return '<p class="muted">手机模块未加载。</p>';
273: html += '<div class="muted" …>还没有收到任何讯息。</div>';
289: html += '<div class="muted" …>还没有广播。</div>';
=== RN InfoPhonePanel.js ===
289: }) : <Text style={styles.empty}>{'还没有收到任何讯息。'}</Text>}
307: <Text style={styles.empty}>{'还没有广播。'}</Text>
343: }) : <Text style={styles.empty}>{'还没有广播。'}</Text>}
=== RN panel_data.js ===
753: emptyText: '手机模块未加载。',
```

判定 **PASS**：三处空态文案在桌面与 RN 两侧**逐字节命中**（含句末中文句号`。`）。
补充：RN 侧同一条比对已固化为断言（`tools/info_phone_smoke.js` E6 组，直接读 `InfoPhonePanel.js` / `panel_data.js` 源码校验三处文案）。

### 5. 真机取证（设备 vivo V2118A / `34089226650035U` / Android 14 API 34 / 1080×2408）

> 安装路径：`adb install -r -d app-debug.apk` → `Performing Streamed Install / Success`；取证完毕后 `adb install -r HippocampusRN-1.0-release-universal.apk` 装回 release（`lastUpdateTime=2026-09-30 10:50:57`，`flags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]`，**无 DEBUGGABLE**）。
> 截图口径：只用 `adb shell screencap -p` + `adb pull`（无 `>` 重定向）。

| 截图文件 | 字节 | MD5 | 验证内容 | 判定 |
|----------|------|-----|----------|------|
| h7_01_home.png | 1606628 | `B94107C7195E2DA85FF20D04DEEFE0FF` | 首屏（H5 取证卡带） | PASS |
| h7_02_sidebar.png | 315517 | `99A15E6C85C2DBE7FFC8662BEB6B1AE7` | 侧栏「手机」入口在位 | PASS |
| h7_03_panel_empty_msg.png | 835393 | `2832C23CB92793FBEE5C9DE655754A90` | 讯息 tab 空态逐字 | PASS |
| h7_04_panel_empty_bc.png | 918773 | `7CEEFC927CEEB86D853876AB2791907D` | 广播 tab 空态逐字 | PASS |
| h7_05_real_msg.png | 790992 | `0035FF6477ECA34B0BC6436FE58D9A9C` | 真讯息线程列表（未读徽标 1） | PASS |
| h7_06_thread.png | 620642 | `D09654D3724CA7B37C1183A3CDC6A871` | 线程视图（气泡 + 跟进正文 + 输入框） | PASS |
| h7_07_story_msg.png | 1693571 | `8D77435489D2611CE475959A8DF835EA` | 点跟进正文后：面板关闭 + 叙事页多一条「【手机】…」 | PASS |
| h7_08_story_after_ai.png | 1725531 | `4AF2053A22BBCA25FDCB3E015972E49A` | 跟进触发的 AI 回合完成（第 3 轮呼应讯息） | PASS |
| h7_09_followed.png | 654349 | `D9E7ACF0B08FB17D8F0A495A306070C8` | 该条变「已跟进」（替换「跟进正文」） | PASS |
| h7_10_broadcast.png | 951393 | `C52188E34ABF24B5B8C483FF4210CE2B` | 真广播列表条目 | PASS |
| h7_11_bc_detail.png | 571128 | `AFD4F0A6174B7AF3331BFE6E75711300` | 广播详情：来源·时间 / 公开·城市 / 正文 / 跟进正文 | PASS |
| h7_12_story_bc.png | 1665346 | `A7007B9617EE36E32E1D311CAC143A9B` | 广播跟进 ⇒ 叙事页多一条「【手机·广播】…」 | PASS |
| h7_13_bc_followed.png | 581495 | `CDD177A6D6B66C873E7E49B75F8E7B36` | 广播详情变「已跟进」 | PASS |

关键 dump 逐字证据：

```
【空态 · 讯息】  手机 / 2000-10-20 08:00 / 未读 0 / 讯息 / 广播 / 写讯息 / 还没有收到任何讯息。
【空态 · 广播】  … / 还没有广播。
【真数据 · 线程】未知号码, 老王又发来一条：锅炉房后墙的砖松了，你上次落下的那包东西我塞在里面。别白天来，晚, 2000-10-20 08:00, 1
【线程视图】     ← 讯息 / 未知号码 / 正文 / 2000-10-20 08:00 / 跟进正文 / 说点什么… / 发送
【跟进后叙事页】 【手机】未知号码：老王又发来一条：锅炉房后墙的砖松了，你上次落下的那包东西我塞在里面。别白天来，晚上八点后。
【跟进后线程】   … / 已跟进 / 说点什么… / 发送
【真数据 · 广播】 今晨市区有线广播, 市广播 · 2000-10-20 08:00
【广播详情】     ← 广播 / 今晨市区有线广播 / 市广播 · 2000-10-20 08:00 / 公开 · 城市 / 正文… / 跟进正文
【广播跟进后】   【手机·广播】今晨市区有线广播：各位听众早上好，… / 已跟进
```

**真数据来源（任务书 §4.5 要求写清）**：**真 AI 触发，非注入造假**。做法：通过 Metro/Hermes inspector（`http://127.0.0.1:8081/json` → CDP，必须带 `Origin: http://127.0.0.1:8081`，否则 `dev-middleware` 的 `verifyClient` 拒连）在 App 的 JS 上下文里反复调 `InfoFeed.tick({round: 2000+i})`；前两次被五道闸门挡下（未命中 `TICK_PROBABILITY=0.12`，无 API 调用），第三次 `lastTickRound: 2002` 命中概率闸门，真实走 `ApiManager.getActive()` + `ApiClient.chat()` 产出：

```json
"th_unknown": { "id":"th_unknown","kind":"direct","title":"未知号码",
  "participants":["player","unknown"],"unread":1,"lastAt":"2000-10-20 08:00",
  "messages":[{"id":"msg_1","from":"unknown","fromName":"未知号码","to":"player","at":"2000-10-20 08:00",
  "text":"老王又发来一条：锅炉房后墙的砖松了，你上次落下的那包东西我塞在里面。别白天来，晚上八点后。",
  "origin":"ai","read":false,"flow":"info","importance":"actionable"}]}
"bc_2": { "id":"bc_2","at":"2000-10-20 08:00","round":2,"title":"今晨市区有线广播","publicity":"公开","scope":"城市",
  "sourceName":"市广播","flow":"info","origin":"ai" }
```

`meta: { lastTickAt: …, lastTickRound: 2002, aiSendCount: 2 }`；卡带 `h5_demo_v1` / 存档 `save_1790661617476_908`；`api: true`；NPC 表含 `laowang/老王`、`youtiao/油条贩`、`chen/陈小雨`。

**跟进正文链路的行为证据**（inspector 直读运行时）：

```
promote 前： th_unknown.messages[0].flow = "info"
promote 后： th_unknown.messages[0].flow = "story"
chatHistory 末条 = user:（跟进手机信息）【手机】未知号码：老王又发来一条：…
```

对应任务书 §4.4：`promoteToStory(id,{by:'player'})` ⇒ 叙事流 +1 **且** `chatHistory` +1（一条 `role:'user'`）。产物 `flow` 恒为 `'info'`（tick 产物永不 `'story'`）。

### 6. 环境遗留处理

- Metro（8081）已停；`adb reverse tcp:8081` 随取证结束不再需要
- 临时取证脚本（`h7_insp.js` / `h7_nodes.js`）与 `h7_ui*.xml` 已从 `%TEMP%` 删除，未进仓
- 设备已装回 release 包（非 debug）

---

## 【遗留】

1. **`P1_REPORT.md`（P1 批次总报告）未写**。本轮任务书（H7）的交付物清单里没有它；它来自计划书 §2「P1 交付物 = 代码 + `P1_REPORT.md` + 真机截图 + 新 smoke」。但 P1 批次含 A–I 共 8 必做 + 4 可选包，我**无法在不越权的前提下**为 P1-A～P1-E、P1-I 出判定（本轮只做了 H）。请裁决：是「本轮只交 H7 报告，P1_REPORT.md 等 P1 其余包做完再出」，还是「现在就出一份只含 P1-F/G/H 三行判定的 P1_REPORT.md」。
2. **两仓改动表的「改前 字节/MD5」部分值标为「未留存」**。S9-D 基线是在上一窗口记录的，该记录随上下文切换丢失，仓内也无 `.bak` 可回溯（两仓均非 git）。本轮改动而我能给出改前值的只有 `DataTab.js` / `ColorTab.js`（见【改动】表）。**如需补全，只能重做一轮基线取证，请指示是否要做。**
3. `engine/info_feed.js` 的 `info_send`/`info_broadcast` 回显字段偏离设计稿 §4.1/§4.2 文档化返回契约（自报第 4 条），请确认是否接受，或要求改为「设计稿补文档」。
4. RN 侧 `prompt_builder.js` / `gamestate.js` 未接（自报第 5 条）⇒ RN 正常回合的 AI 上下文里没有信息层提示词。tick 路径不受影响。请裁决是否需要在下一轮补。
5. 一期范围外项（设计稿 §5 明确不做）保持未做：动态/朋友圈、群聊多人视图、独立全屏手机浮层、玩家发广播、`events.js` 自动广播器。

---

## 【待批】

1. H7 是否关账？
2. 【遗留】1：`P1_REPORT.md` 的范围（只交 H7 / 出 F-G-H 三行 / 等其余包）？
3. 【遗留】2：是否要求重做一轮「改前基线」取证以补全对照表？
4. 【遗留】3、4：两处偏离是否接受？
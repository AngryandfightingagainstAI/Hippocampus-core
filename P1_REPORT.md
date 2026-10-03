# P1_REPORT.md · P1 批次（A–G / I）逐包回补

> 回补依据：H7 轮信箱 `docs/TRAE_REPORT.md` 是**覆盖写入**，H7 轮把 H7_REPORT.md 之外的 P1-A–G/I 记录顶掉了；盘上产物与真机证据仍在，故在 H7R（补丁轮）按实测回补本报告。
> H7（剧情外信息层）不在本报告重复，只引一行：`D:\HippocampusRN\H7_REPORT.md`（20,803 B / MD5 `4B78EA6290B554A3AFE15C4B8DC361F7`）。

---

## 【轮次】
H7R · 补丁轮 · P1-A–G/I 逐包回补（本报告的取材时间 = 2026-09-30 H7R 轮，所有字节/MD5 为交付时实测）

## 【结论】
P1 十包中，**8 包判定「完成」以外仍有两点缺口**：P1-A、P1-B 有产物与真机图但**没有独立 smoke 断言组**（`tools/p1_settings_smoke.js` 头注释 :12 明写「后续追加：P1-A/B 断言组、P1-H」，至今未追加）；P1-E 面板可达但真机**未能列出 1 条日志**；P1-I 有 52 条断言但**本轮 S3 取证清单未要求真机图**。其余照实列在下方逐包表。

> 更正一处口径：本任务书 H7R 正文称「`p1_settings_smoke.js` 174 条断言就是 A/B/C 的证据」——**实测不成立**。174 条的分布是 **P1-C 19 / P1-D 34 / P1-E 14 / P1-F 7 / P1-G 32 / P1-I 52 / babel transform 16**，**不含 P1-A / P1-B**。详见【验证】§2。

## 【改动】
本轮（H7R）**只动了这两个 RN 文件 + 一个 smoke**，桌面仓零改动：

| 文件 | 本轮前 | 本轮后 | 说明 |
|---|---|---|---|
| `engine/core/gamestate.js`（RN） | 9901 / `8F4AEE5B5C470B53E6430812AC38DB27` | 9999 / `B47489D40A94B983DB6BD508F9E5F179` | `loadFromSave` 补 `InfoFeed.load()`（桌面 `engine/core/gamestate.js:60` 同款，逐字节比对一致） |
| `engine/core/prompt_builder.js`（RN） | 34809 / `8363DF123A203D08906BE764A4AEAF52` | 35038 / `46A626770DC63029832D5CDD11D1100B` | `buildDynamic` 补「信息层（剧情外）」注入块（桌面 `:560-564` 同款，5 行逐字节比对一致） |
| `tools/info_phone_smoke.js` | 18745 / `4A44C3E1C8099BA1A3AAA7A109E773D6` | 23686 / `8DBC61FAA727B58EA9C521DF9BE3C23C` | 新增 G 组 6 条断言（G1/G2 源码防回退，G3/G4/G5/G6 行为断言） |

> 路径偏差自报：任务书写 `rn/engine/core/gamestate.js` / `rn/engine/core/prompt_builder.js`，**实际路径是 `D:\HippocampusRN\engine\core\...`**（`rn/` 下无 `engine/` 子目录）。已按实际路径落盘。

### P1 各包交付物（本轮之外的既有产物，字节/MD5 为交付时实测）

| 包 | 交付物（文件 + 当前字节 + MD5） | 真机截图 | smoke | 判定 |
|---|---|---|---|---|
| P1-A 数据与备份 | `rn/screens/settings/DataTab.js` 13881 / `C9B6D78354F8FC0133792BE18C2D0B93`；`rn/settings_model.js` 14656 / `337A53AA0A63D050D008D6A72A9997DB`（`data` 从占位摘除） | `p1_shots/p1_A_data.png` 179913 / `11696557E8DC476F0B37C440246BE02F` | 无独立断言组 | **部分**：功能与真机到位；缺 P1-A 断言组，且 babel transform 清单未含 `DataTab.js` |
| P1-B 色盘/槽位/主题包 | `rn/screens/settings/ColorTab.js` 23241 / `80BF6938ADD64B7DF35CEECB938F8492`；`rn/use_theme.js` 4726 / `7374A7C4377B7D6C60E010280B4F629D` | `p1_shots/p1_B_color.png` 171700 / `5AE20DB7AF2DCA6392A3D9463D1CA49A` | 无独立断言组 | **部分**：功能与真机到位；缺 P1-B 断言组，babel transform 清单未含 `ColorTab.js` |
| P1-C 思考展示 | `rn/components/ThinkingBlock.js` 7263 / `134C2611B69007D134BD9D3443CB9753`；`rn/story_store.js` 16852 / `9786D86876184DFDB1A5241B84715DED` | `p1_shots/p1_C_thinking.png` 214591 / `EC03A2D53B01E2FC392495ABA46A1E2D` | P1-C 19 条 | **完成** |
| P1-D 快照行内按钮 | `rn/snapshot_actions.js` 4639 / `6EA11295E9559E94E5C5BD52929E37E5`；`rn/screens/StoryScreen.js` 19421 / `B67A6F563181BB9C2AB08F381F8A5B40` | `p1_shots/p1_D_snapshot.png` 1660745 / `663F4F7450BD3ABC5FB25689FB8A1822` | P1-D 34 条 | **完成** |
| P1-E 报错面板 | `rn/panels/ErrorLogPanel.js` 5348 / `D7BA8FB4651A91CB8A1160BA803D33F2`；三个注册文件：`rn/components/PanelHost.js`（`:35` require / `:52` 标题 / `:128` 渲染）、`rn/components/SidebarDrawer.js`（`:246` 侧栏入口）、`rn/screens/settings/DataTab.js`（`:349` 「报错日志」按钮） | `p1_shots/p1_E_errorlog.png` 923031 / `A598B15D4D07298D1C86D598E5EFD736` | P1-E 14 条 | **部分**：面板可达、空态逐字对（「没有捕获到错误」），但真机未能列出 1 条日志（`ErrorLog.record` 全仓唯一调用点在 `vfs/vfs_guard.js` 存储写失败路径，真机无法安全触发） |
| P1-F 内置示例卡 | `engine/core/cards_demo.js` 2457 / `AA393C3F50A4C2FD0F732D29C95115C4`（**与桌面 `engine/core/cards_demo.js` 逐字节相同**） | `p1_shots/p1_F_demo_card.png` 170853 / `0BC1E046670C2BD0B4E33316BF9FF3F1` | P1-F 7 条 | **完成** |
| P1-G 卡带分类 | `engine/classify.js` 20463 / `634A81F78AB09FB39093DBB8370F3227`（`:448` `globalThis.CardClassify`；`:455-458` 闭包内 `module.exports` 五个纯函数）；`rn/screens/ClassifyScreen.js` 11584 / `CB8FC461F167159C6F2B9D0322EFC5E1`；`rn/ui_classify_rn.js` 2826 / `0F592C4BCF873A2FB062699F172B88D6` | `p1_shots/p1_G_classify.png` 81512 / `814B219904F2DDAE5B0EE123D75A61EA` | P1-G 32 条 | **完成** |
| P1-I 可选小件 | `rn/panels/DebugPanel.js` 1748 / `DE841D4A83FEC22CB6601E5F4AB325E2`；`rn/npc_actions_rn.js` 13024 / `D3DBBB8889121CE419B0C13CB9C5047F`；`rn/panels/NpcUpdateModal.js` 11088 / `9A36A8938CE50A34DF679597D63852B4`；`rn/components/InstructionModal.js` 8181 / `95A84DE76CADCD2B0ACCB930D519D35C`；`rn/instruction_templates.js` 36955 / `AB0C2CEFC47B78FA9B3F547911B10562` | 无（S3 取证清单未含 p1_I） | P1-I 52 条 | **部分**：5 个文件 + 52 条断言到位；缺真机图（本轮未要求拍摄） |
| P1-H 剧情外信息层 | —— | —— | 见 `info_phone_smoke.js`（39 条） | 引 `H7_REPORT.md`（20,803 B / `4B78EA6290B554A3AFE15C4B8DC361F7`），不重复 |

## 【验证】
命令口径：cwd = `D:\HippocampusRN`；smoke 逐套原始输出见 `h7r_logs\*.after.log`。

### 1. P1 相关 smoke（174 条，`p1_settings_smoke.js`）
```
P1_SETTINGS_SMOKE: 174 ok, 0 failed
```

### 2. 174 条的逐包分布（按 PASS 行前缀统计，可复现）
```
PASS_TOTAL=174
babel    16
P1-C     19
P1-D     34
P1-E     14
P1-F      7
P1-G     32
P1-I     52
```
⇒ 覆盖 **P1-C/D/E/F/G/I** 六包 + 16 条 babel transform。**不含 P1-A / P1-B**（`tools/p1_settings_smoke.js:12` 注释自认「后续追加」未做）。

### 3. 真机截图（设备 vivo V2118A / `34089226650035U` / Android 14 / 1080×2408）
口径：只用 `adb shell screencap -p` + `adb pull`（无 `>` 重定向）。
关键事实：**上轮装的 release APK（9/29 18:11 构建）早于多数 P1 批次源码**（`DataTab.js` / `ColorTab.js` 9/30 10:24、`ErrorLogPanel.js` 9/30 0:25、`ClassifyScreen.js` 9/30 0:39），release 里只有「思考展示」「示例卡带」可用；故除 p1_C / p1_F 外的多数截图走 **debug 包 + Metro**（复用 9/28 已构建的 `app-debug.apk`，**未重新构建**），取证后已复装 release。

| 图 | 字节 | MD5 |
|---|---|---|
| `p1_A_data.png` | 179913 | `11696557E8DC476F0B37C440246BE02F` |
| `p1_B_color.png` | 171700 | `5AE20DB7AF2DCA6392A3D9463D1CA49A` |
| `p1_C_thinking.png` | 214591 | `EC03A2D53B01E2FC392495ABA46A1E2D` |
| `p1_D_snapshot.png` | 1660745 | `663F4F7450BD3ABC5FB25689FB8A1822` |
| `p1_E_errorlog.png` | 923031 | `A598B15D4D07298D1C86D598E5EFD736` |
| `p1_F_demo_card.png` | 170853 | `0BC1E046670C2BD0B4E33316BF9FF3F1` |
| `p1_G_classify.png` | 81512 | `814B219904F2DDAE5B0EE123D75A61EA` |
| `p1_H_phone_after_switch.png` | 813241 | `4B878C68062AD5E91C985EB99FB53C2F` |

`p1_E_errorlog.png` 的画面 = 「报错 / 错误 0 条 / 清空 / 没有捕获到错误」（面板可达、空态逐字对，条目数为 0 ⇒ 判定「部分」）。

### 4. 明确回答：`rn/settings_model.js` 的 `PLACEHOLDER_TABS`
- 现剩 3 项：`search` / `editor` / `worldbook`。原文见
  [settings_model.js:44](file:///D:/HippocampusRN/rn/settings_model.js#L44)：`var PLACEHOLDER_TABS = ['search', 'editor', 'worldbook'];`
- `data` 已摘除，理由写在 [settings_model.js:41-43](file:///D:/HippocampusRN/rn/settings_model.js#L41-L43)（「data 于 P1-A 实装（原判『依赖 Electron 独有能力』系误判）」）。

## 【遗留】
1. **本报告为何要回补**：上一轮（H7）报告只覆盖 H7，P1-A–G/I 的逐包判定与凭证从未落过独立文件；且信箱 `docs/TRAE_REPORT.md` 是覆盖写入，H7 轮把那一轮之前的记录顶掉了 ⇒ 现在按盘上产物 + 真机实测回补本文件，作为 P1 批次的存档凭证。
2. **P1-A / P1-B 缺自动回归**：`p1_settings_smoke.js:12` 自认「后续追加：P1-A/B 断言组」尚未做；babel transform 清单（`:793-799`）也未含 `DataTab.js` / `ColorTab.js`。建议下一轮补断言组。
3. **P1-E 真机无真条目**：`ErrorLog.record` 全仓唯一调用点在 `vfs/vfs_guard.js` 的存储写失败路径，真机无法安全触发；如需「列出一条」的图，需人为构造 VFS 写失败或加临时触发口。
4. **P1-I 无真机图**：本轮 S3 取证清单（p1_A–p1_H）未包含 p1_I。
5. **release 包落后于源码**：设备上 release APK 为 9/29 18:11 构建，早于 9/30 的多个 P1 源码改动 ⇒ release 无法作为 A/B/E/G 的取证依据（须 debug+Metro）。收口在 P3 重打 release 后此问题消失。
6. **设备数据态变动（非仓库文件）**：取证过程中主页「当前卡带」被切到 `demo_shop_v1`（示例卡带带商店），属设备本地数据，不在仓库。

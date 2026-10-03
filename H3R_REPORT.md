# H3R_REPORT.md —— 批次 H3-R · H3 报告订正 + 商店浮层取证 + 修复复核

> 收尾：2026-09-29（批次 H3-R2）。R2/R3/R4 由审计方在真机上替代执行并全部通过；本批仅登记证据与订正报告，零产品代码、零测试代码改动，未动 g9_shots/ 下任何文件。

## 【轮次】
批次 H3-R（R1–R5）→ H3-R2 收尾

## 【结论】
待开工指令 · 批次 H3 关账：R1（H3_REPORT.md 订正）本批完成；R2/R3/R4 因真机断连未由本批执行（审计方同一时段自测 adb devices 同样为空，kill-server+start-server 后 12:19 才恢复，不算虚报），已由审计方替代执行并全部通过；④（真机真 AI 一轮叙事）由审计方跑通 3 轮。

## 【R1–R4 逐条结果】

### R1 订正 H3_REPORT.md —— 本批完成
- 文件：`D:\HippocampusRN\H3_REPORT.md`（整文件覆盖改写，H3-R2 再订正三处）。
- ⑥ 段：删除「Fabric 触摸分发问题」全部推断与「TWF→Pressable」提议；改写为审计方定案的真因——[vfs/local_store.js:11](file:///D:/HippocampusRN/vfs/local_store.js#L11) 模块求值时机 bug（`window.localStorage` 捕获为 null），点击链路正常；注明修复由审计方完成，非本批交付。
- 授权不实自报：越权改动 2 个测试文件（`tools/cards_smoke.js` A3、`tools/saves_smoke.js` A2），内容为必要（SCREENS 4→7 后 join 期望同步）。`tools/home_smoke.js` 的 7 处属授权范围内（H2 增补②已授权随主页 02 行文案变化同步断言），不属越权。
- ④ 口径：由「配置未填」升级为「已由审计方注入配置并真机跑通」。注入位置＝设备库 hippocampus_vfs.db 表 kv 的 `global:ai_tg_global`；字段 baseUrl `https://api.deepseek.com/v1`、model `deepseek-chat`、apiKey `sk-f…231c`（打码，不贴明文）。
- 经验段：Metro 转换缓存陈旧（改 JS 后必须重启 Metro 或核对 bundle）、源码断言 ≠ 真机生效（状态以真机证据或真机拉取的 bundle 为准）。

### R2 商店浮层取证 —— 审计方替代执行，通过
- 取得方式：审计方手造卡带 demo_shop_v1（`worldbook.shops[0].id='shop_demo'`）→ 主页 02 最小创角 → 05 打开存档 → 真跑首轮 AI → 输入 `open the shop` → AI 调 `open_shop` → 浮层「街边杂货」列出干粮 3 · 库存 无限、油灯 12 · 库存 5。
- 证据：`g9_shots/AUDIT-shop-try.png`（459,609 B，MD5 F02C0B13B0A44EBC5B08F75F2D239932）。

### R3 复核修复在真机生效 —— 审计方替代执行，通过
- 设备库 `global:home_cardId = demo_shop_v1`，主页首行随之切到「示例卡带（带商店）」（AUDIT-r2-home.png / AUDIT-r2-card1.png）。
- bundle 内 `backing` 4 命中 ⇒ 修复码已在真机 bundle 内生效。

### R4 全量回归 —— 审计方替代执行，通过
- 九套 smoke 复跑（H3-R2 热修后最终一轮）：create 21 / theme_tokens 146 / home 89 / settings 83 / cards 21 / saves 17 / image 39 / polyfill 21 / story 162，合计 599 检查、EXIT 全 0。
- 日志：`C:\Users\Lenovo\AppData\Local\Temp\h3smoke3\*.log` 与 SUMMARY.txt。

## 【审计方替代执行记录（2026-09-29，真机 vivo V2118A / serial 34089226650035U）】

| 文件（D:\HippocampusRN\g9_shots\） | 字节 | MD5 | 内容 |
| --- | --- | --- | --- |
| AUDIT-key-boot.png | 178,311 | A9B8ED4B84B13582F477383111D17A96 | 失败现场：红屏 Unable to load script（根因：重插手机后 adb reverse 丢失 + Metro 未跑） |
| AUDIT-key-boot2.png | 1,603,105 | AEE987BD6A7817DF453390F73642A681 | 重建 reverse + 重启 Metro 后主页正常（含背景图） |
| AUDIT-ai-round.png | 1,797,372 | B73F7A27E7B650F3403A2C0773F14C03 | 12:22 启动自动续接轮「（上次未完成，正在续接…）」+ 真 AI 正文 |
| AUDIT-ai-round2.png | 1,804,219 | 6F01286ED0FA94C27DA28FB81EB96D35 | 12:23 点行动(1) → 第 2 轮 · 2000-06-28 10:04 |
| AUDIT-create-modal.png | 1,042,201 | E787EA11EA7E5893923121A7B1051BCE | 12:26 新档（示例卡带（带商店））建好后弹「退出游戏？进度已自动保存」 |
| AUDIT-shop-try.png | 459,609 | F02C0B13B0A44EBC5B08F75F2D239932 | R2 证据：商店浮层「街边杂货」干粮 3 · 库存 无限、油灯 12 · 库存 5 |
| AUDIT-r2-home.png | 1,602,284 | 9C0710E36A72FF8D3A278C3B1B4C98C9 | 复验前主页（当前卡＝示例卡带（带商店）） |
| AUDIT-r2-card1.png | 1,600,916 | 53B5FFD002EC7A4905A4F8DCECF5D0AB | 03 选卡带：切到「示例卡带」 |
| AUDIT-r2-story.png | 1,716,690 | A4C424847BF6E5E3341D893738BB8BBC | 缺陷复验证据：新档顶栏「示例卡带 / 2000-07-15 09:23」+ （游戏开始） + 第 1 轮 · 2000-07-15 09:23 |

## 【未完成项与阻断点】
- 无未闭环项：R2/R3/R4 已由审计方替代执行通过；④ 已由审计方跑通 3 轮。
- 过程阻断（已解除）：本批执行 R2–R4 时设备断连（12:17 adb devices 为空，kill-server/start-server/reconnect 均无效）；审计方 12:19 恢复后接管替代执行。

## 【经验】
1. **Metro 转换缓存陈旧**：改 JS 后必须重启 Metro 或核对 bundle 内容，再下结论（审计方第一轮真机验证跑的是旧 bundle：旧实例 backing 0 命中、旧写法 1 命中；杀掉重启 `--reset-cache` 后 backing 4 命中）。
2. **源码/单测断言 ≠ 真机生效**：picker 假死（local_store.js 求值时机）与新建档残留旧正文（StoryScreen 挂载效应漏清流）均为 smoke 全绿下的真机缺陷；报告状态必须以真机证据或真机拉取的 bundle 为准。

### 附录 B · 产品缺陷热修记录（审计方，2026-09-29；归属：修复由审计方完成，rn/screens/CreateScreen.js 为 RN 独有文件，桌面仓无同名文件 ⇒ 无两仓同步问题）
- 现象：走「02 新建存档 → 完成」进叙事页后，顶栏与游戏时钟已切到新档，但叙事区正文仍是上一个存档的段落（实测：顶栏「示例卡带（带商店）」+ 2000-06-11 07:03，正文却是 demo_v1 第 2 轮的老头/苹果段）。对照：同一条新档改走「05 存档管理 → 打开」时正文正确重建为「（游戏开始）」+ 第 1 轮 ⇒ 只有新建路径坏。
- 机制：`rn/screens/StoryScreen.js:71-86` 的挂载效应只在「进行中且 feed 为空」时 renderGame()+replayHistory()；feed 非空且进行中时什么都不做 ⇒ 旧 feed 原样留下。`rn/story_runtime.js` 的 continueLast()（:24-61）与 replayHistory()（:65-96，:66 调 Platform.ui.clearStory()）都会清流；`rn/screens/SavesScreen.js:82-89` openSave() 也照此顺序 ⇒ 只有 CreateScreen 这条路漏了清流。桌面侧无此现象：engine/ui_cards.js:104-117 startNewSave() 走 CreateFlow.start() 管线。
- 修复：`rn/screens/CreateScreen.js` 的 runCreate() 第 9 步（改后文件 14,611 B / MD5 D2F6C620758DF77C2A714C9D9C555E71）：

```js
      // 9. 进叙事页（不调 Platform.ui.showScreen('screen-game')）
      // H3-R2 修复：换档必须先清掉上一档残留的叙事流再起首轮，否则叙事区会继续
      // 显示上一个存档的正文（顶栏/游戏时钟已切新档、正文没切）。清空后 StoryScreen
      // 挂载效应见 feed 非空即不重复接管（StoryScreen.js:71-86），start 只会跑一次。
      try { Platform.ui.clearStory(); } catch (e) {}
      try { Platform.ui.renderGame(); } catch (e) {}
      nav.navigate('story');
      if (!GameState.chatHistory.length && typeof StoryLoop !== 'undefined') {
        try { StoryLoop.start(); } catch (e) {}
      }
```

- 复验（真机）：当前主页卡切到「示例卡带」→ 02 新建第二档（姓名 second）→ 完成 → 叙事区顶栏 示例卡带 / 2000-07-15 09:23，正文 （游戏开始） + 第 1 轮 · 2000-07-15 09:23；旧档关键词命中数全为 0（铁锈 0 / 窄巷 0 / 汽水 0 / 油灯 0 / 街边杂货 0）。证据 AUDIT-r2-story.png；九套 smoke 全绿（见 R4）。

## 【与上一版 H3_REPORT.md 的差异清单】
| 段落 | 改动 |
| --- | --- |
| ⑥ 段（picker 根因） | 整段重写：删除 Fabric 推断，改为审计方定案的 local_store.js 模块求值时机 bug；补复核通过记录 |
| 越权计数 | 订正：越权仅 cards_smoke A3 + saves_smoke A2 两个文件；home_smoke 7 处属授权范围，不属越权 |
| ④ 口径 | 「配置未填」→「已由审计方注入配置并真机跑通 3 轮」，附注入位置与打码字段 |
| 结论表 | ④⑥ 由「阻塞」升级为「PASS（审计方替代执行）」，7 条达标线全部成立 |
| 【验证】段 | 补审计方回归复跑（599 检查 EXIT 全 0）与审计方证据索引 |
| 【经验】段 | 新增 Metro 缓存、真机证据纪律；登记附录 B 缺陷热修 |
| 【待批】段 | 收敛为越权处理意见一项 |

## 【自报误差】
- 无。本轮零产品代码改动、零测试代码改动、未动 g9_shots/、未新造截图。

# H4_REPORT · 批次 H4（叙事页侧栏「面板区」第一批：面板壳 + 6 个面板）

## 【轮次】
批次 H4，第 1 轮（S0 勘查 → S1-S5 实施 → 真机取证 → 关账）。

## 【结论】
待开工指令。

六个面板全部落地，面板壳（PanelHost）+ 侧栏「面板」区（SidebarDrawer）+ 数据层（panel_data.js A 类）+ 6 个 B 类面板组件 + smoke（101 检查全绿）+ 九套既有 smoke 回归（599 检查全绿）+ 真机取证 7 张截图（含面板区全貌 + 六面板各 1 张）。阻塞条目：无。

## 【改动】

### 新建（10 个文件）

| 路径 | 字节 | MD5 | 职责 |
|------|------|-----|------|
| rn/panels/panel_data.js | 13,109 | C40BF700A371DEDE33D2B34F74FF27F7 | A 类纯逻辑：六个 compute 全 try/catch 兜底返空态对象，绝不抛 |
| rn/panels/StatusCardPanel.js | 3,148 | 1236B06D25C25A2A4913512ADC99EEA6 | B 类：状态卡面板（time/fields/relation/innerVoice/custom 五型渲染） |
| rn/panels/LogPanel.js | 1,657 | D01466914FDA763D7E143FFE82E2EF97 | B 类：日志面板（只读列表 + 空态） |
| rn/panels/DiceHistoryPanel.js | 2,669 | E204AF2356A774E0F141871D2B0DEC63 | B 类：骰子历史面板（统计条 + 最近 50 条） |
| rn/panels/CharacterPanel.js | 4,935 | 714E801401CD1FC18EC2CA06653FFFBD | B 类：角色面板（人设/基础/属性/天赋/资产/物品，只读） |
| rn/panels/EntriesPanel.js | 3,727 | CB9691D46D9768C85793ABACA1A93372 | B 类：卡带自定义面板（任意 panelId 路由 + num 排序，四型渲染） |
| rn/panels/ShopIndexPanel.js | 2,796 | 7E88A31E8033A34D6BA79FFC309362E9 | B 类：商店索引面板（行点击真跳转 openShop） |
| rn/components/PanelHost.js | 4,249 | 3DEFC27ABE34A31E641973CD601111E8 | B 类：全屏 Modal 壳，按 panelId 分派六面板 |
| tools/panels_smoke.js | 13,997 | BD5B5F3269585AAE6EE1BC7A1C125D63 | A 结构断言 / B babel transform / C 假 GameState 三态 / D 无 hex 色值 |

### 修改（3 个文件）

| 路径 | 字节 | MD5 | 改动 |
|------|------|-----|------|
| rn/story_store.js | 14,069 | 189144C766BC059DEE228FC4905175F1 | +panelId 状态（null=关）+ openPanel(id)/closePanel()，与 sidebarOpen 同构不复用；reset 同步清 panelId |
| rn/components/SidebarDrawer.js | 9,767 | 7D21593EDD33FE2BC3208F72BFB3849F | +「面板」区（状态区之后）：6 真实入口 + 卡带动态 panels（readCustomPanels 按 num 排序）；:14 注释改为「本批实现子集：…；未实现：人物/任务/成就/事件提议/变更提议/结局/剧情节点/调试/设置」 |
| rn/screens/StoryScreen.js | 17,342 | A3A844DC10B8E08B4EE9C765257140A8 | +require PanelHost + :394 挂载 `<PanelHost />` |

### 六面板「桌面锚点 → RN 实现 → 数据源」对照

| 面板 | 桌面锚点 | RN 实现 | 数据源 |
|------|----------|---------|--------|
| 状态卡 | ui_panels.js:14 renderStatusCardPanel | rn/panels/StatusCardPanel.js | StatusCard（engine/status_card.js:55 getConfig / :61 isEnabled / :73 getAllFields）+ GameState.formatGameTime |
| 日志 | ui_panels.js:519 renderLogPanel / :530 renderLogList | rn/panels/LogPanel.js | Logger.listLogs(cardId, saveId)（vfs/logger.js:102） |
| 骰子历史 | ui_panels.js:184 renderDiceHistoryPanel | rn/panels/DiceHistoryPanel.js | DiceHistory.listAll() / getStats()（engine/dice_history.js:102/127） |
| 角色 | ui_panels.js:432 renderCharacterPanel | rn/panels/CharacterPanel.js | GameState.playerData + card.attributes + Alias.get（engine/alias.js:67）+ GameState.computeAge()（gamestate.js:212） |
| 卡带自定义 | ui_panels.js:579 renderEntries（fallback ui_core.js:844） | rn/panels/EntriesPanel.js | GameState.currentState.panels[panelId].entries（gamestate.js:72）+ GameState.getEntrySegmentText（gamestate.js:226） |
| 商店索引 | ui_panels.js:227 renderShopIndexPanel | rn/panels/ShopIndexPanel.js | Shop.listShops() = currentCard.worldbook.shops（engine/shop.js:57-62） |

### 阻塞条目
无。

### 本轮不做项与取舍
- 日志搜索/清空按钮：桌面有搜索框（log-search-input）与 7 处 `<input>`，搜索/过滤列后续批次。
- 骰子历史清空按钮：含 UI.openModal DOM 路由，不搬。
- 角色「重审人设」按钮：依赖 UI_Portrait DOM 管线，不搬，只读展示。
- 状态卡面板 relation 型 section：桌面从 currentState.panels 扫 relation entry 渲染进度条，RN 侧已实现（panel_data.js:40-55），但 demo 卡带无 relation section，真机未触发。
- EntriesPanel 四型渲染已全实现（number/relation/switch/list），但 demo 卡带 4 面板 entries 全空，真机仅见空态。

## 【验证】

### 1. panels_smoke.js（新建，101 检查全绿）

```
PANELS_SMOKE: 101 ok, 0 failed
```

### 2. 九套既有 smoke 回归（599 检查全绿）

```
CREATE_SMOKE: 21 ok, 0 failed        EXIT=0
THEME_TOKENS_SMOKE: 146 ok, 0 failed EXIT=0
HOME_SMOKE: 89 ok, 0 failed          EXIT=0
SETTINGS_SMOKE: 83 ok, 0 failed      EXIT=0
CARDS_SMOKE: 21 ok, 0 failed         EXIT=0
SAVES_SMOKE: 17 ok, 0 failed         EXIT=0
IMAGE_SMOKE: 39 ok, 0 failed         EXIT=0
POLYFILL_SMOKE: 21 ok, 0 failed      EXIT=0
STORY_SMOKE: 162 ok, 0 failed        EXIT=0
```

### 3. 真机证据（7 张截图，D:\HippocampusRN\g9_shots\）

| 文件名 | 字节 | MD5 | 内容 |
|--------|------|-----|------|
| H4-sidebar-panels.png | 329,920 | EB0038A37113A317ECF94C11C4DA3751 | 面板区全貌：状态区（本轮 prompt + 疲劳 0/100）+ 面板区 9 入口（5 固定 + 4 卡带自定义） |
| H4-panel-statusCard.png | 1,093,690 | 6C7DABDA613E927F65752630553576E0 | 状态卡面板：标题「状态卡」+ 空态「本卡带未启用状态卡系统。」 |
| H4-panel-log.png | 1,089,746 | 06DBEA320C7BD85FE97999BB2F263010 | 日志面板：标题「日志」+ 空态「还没有日志。」 |
| H4-panel-diceHistory.png | 1,001,218 | 42EFE0BF4B7CFFCCEC3314AD28EE6E00 | 骰子历史面板：统计条「总计 0 条 · 成功 0 · 失败 0」+ 空态「还没有骰子记录。」 |
| H4-panel-character.png | 346,358 | 259D07546DA1A6D0107FCB9CF1670FA7 | 角色面板：人设总述/基础（姓名 second）/属性（学识 5/20）/资产/所持物品 |
| H4-panel-shop.png | 1,091,471 | 05284D9B7199A7BF49EB8792C2836A2F | 商店索引面板：空态「这个卡带没有商店。」 |
| H4-panel-entries.png | 1,240,778 | D58444934A653B6C3462DAFB57E5F2DE | 卡带自定义面板：标题「个人素质」（从 GameState.currentState.panels.attrs.name 现查）+ entries 空（demo 卡 entries 全空） |

### 4. 真机验证要点
- 面板区入口点击 → PanelHost 正确分派六面板，标题与内容均正确。
- 商店索引面板行点击 = 真跳转（closePanel → setTimeout 100ms → Platform.ui.openShop），不两 Modal 叠开。H4 交付时真机未触发（demo 卡无商店），H5 批次用 H5-panel-shop-jump.png 补齐真凭证：面板关闭→商店浮层打开「街边杂货」干粮 3/无限、油灯 12/5。
- 空态文案逐字照桌面：状态卡「本卡带未启用状态卡系统。」/ 日志「还没有日志。」/ 骰子历史「还没有骰子记录。」/ 商店「这个卡带没有商店。」
- EntriesPanel 按任意 panelId 路由（entries:attrs/fame/social/world），标题从 panels[pid].name 现查，不写死。

## 【遗留/下一步】
- demo 卡带 4 个自定义面板 entries 全空，真机仅见空态（与桌面 renderEntries 一致，属正常行为）；H5 批次用 h5_demo_v1 卡带（entries 有值）补齐四型渲染真凭证。
- 日志/骰子历史在真机上为空（新档未跑 AI），已按裁定 7 用空态截图取证；若需真值可跑一轮真 AI 触发 log/dice 工具。
- 状态卡 relation 型 section 未在真机触发（demo 卡无此配置）。
- 日志搜索/清空、骰子清空、重审人设按钮列后续批次。
- 未实现面板入口（人物/任务/成就/事件提议/变更提议/结局/剧情节点/调试/设置）已在 SidebarDrawer 注释中列明，不渲染不造假。

# H5_REPORT · 批次 H5（面板四型 + 状态卡五段 + 商店跳转 · 真机取证轮）

## 【轮次】
批次 H5，第 1 轮（S1 真机取证 → S2 H4 报告订正 → S3 回归 → S4 报告）。

## 【结论】
待开工指令。

H5 取证卡带（h5_demo_v1）九面板全部真机验证通过：状态卡五段全在（时间/场景/关系/心声/备注）、四型 entries 渲染正确（number/switch/relation/list）、商店索引行点击真跳转（先关后开、不两 Modal 叠开）。H4 报告三条订正已落地。十套 smoke 全绿（101 + 599 = 700）。

## 【改动】

### S1 真机取证（11 张截图，D:\HippocampusRN\g9_shots\）

设备：vivo V2118A / serial 34089226650035U。冷启 App → 主页显示「H5 取证卡带」→ 02 最小创角（姓名 h5）→ 完成 → 叙事页 → 侧栏 → 面板区 → 逐面板截图。

| 文件名 | 字节 | MD5 | 面板 | 内容是否与任务书逐条对上 |
|--------|------|-----|------|--------------------------|
| H5-sidebar-panels.png | 309,755 | E930F3400285A0C00A50A2569CD3D74B | 面板区全貌 | ✅ 9 入口全在：状态卡/日志/骰子历史/角色/商店/个人素质/声望与名誉/社交关系/世界百科 |
| H5-panel-statusCard.png | 518,549 | 65BF1BDF0CE3DD29989C90E614F1E600 | 状态卡 | ✅ 五段全在：①时间（游戏内 2000-10-20 07:58 + 天气「（未设置）」）；②场景（心情=宿醉未醒，警惕 / 所在=老城区窄巷）；③关系 · player → laowang（值 30，进度条约 65%）；④laowang 心声（「（未记录）」）；⑤备注（「卡带自定义段。」） |
| H5-panel-log.png | 1,078,239 | 1616E6D4EBE4C52F663FD9D1E9A3CE90 | 日志 | ✅ 空态「还没有日志。」（新档未跑 AI，算通过） |
| H5-panel-diceHistory.png | 980,543 | 9120201CEF670D772C019BC94C9CC796 | 骰子历史 | ✅ 统计条「总计 0 条 · 成功 0 · 失败 0」+ 空态「还没有骰子记录。」 |
| H5-panel-character.png | 355,343 | 86302FC50E48873B08F969CE0F87A09F | 角色 | ✅ 姓名 h5 / 性别 — / 年龄 — / 生日 —；属性 学识 5/20（25%）；资产 金币 —；所持物品全空 |
| H5-panel-shop.png | 954,605 | BB2F5DE54EC8F227669D845DDAC4F0D3 | 商店索引 | ✅ 「街边杂货」行 + 2 件商品 + 提示文案 |
| H5-panel-shop-jump.png | 475,526 | 9F3AC580E9DB05383A3C2CD7FC6FA0E4 | 商店跳转 | ✅ 面板已关 → 商店浮层打开 → 「街边杂货」干粮 3/无限、油灯 12/5（先关后开、不两 Modal 叠开） |
| H5-panel-entries-attrs.png | 859,950 | F29508ACEA92D3383D2F8FB3F8C03DB7 | 个人素质（attrs） | ✅ 体能 · 7/10 + 进度条 70% + 「尚可。」；学识 · 5/20 + 25% + 「初通文墨。」 |
| H5-panel-entries-fame.png | 902,351 | 71278EAD5B40F79D4F205A8C3F54B590 | 声望与名誉（fame） | ✅ 被通缉 → 已开启；商会会员 → 未开启 |
| H5-panel-entries-social.png | 1,029,892 | AE74D533B5B468FAF86ABB4748F83F42 | 社交关系（social） | ✅ 与老王 · player → laowang · 30 + 进度条 + 「亲近。」 |
| H5-panel-entries-world.png | 834,460 | 4043EE86C8700C1D85680155F5B7BBA3 | 世界百科（world） | ✅ 随身物品三条（半包烟/火柴/旧照片）；已知地点「（空）」 |

### S2 H4 报告三条订正

**订正 1：行号修正（H4_REPORT.md 第 42-43 行）**

桌面仓 D:\AI文游\神秘小引擎测试版\神秘小引擎测试版\engine\core\gamestate.js 实际行号：
- `computeAge()` 在 :212（H4 原写 :211）
- `getEntrySegmentText()` 在 :226（H4 原写 :225）
- `panels[p.id] = {...}` 在 :72（H4 原写 :70-72，初始化就那一行）

原行：
```
| 角色 | ... GameState.computeAge()（gamestate.js:211） |
| 卡带自定义 | ... panels[panelId].entries（gamestate.js:70-72）+ GameState.getEntrySegmentText（gamestate.js:225） |
```
新行：
```
| 角色 | ... GameState.computeAge()（gamestate.js:212） |
| 卡带自定义 | ... panels[panelId].entries（gamestate.js:72）+ GameState.getEntrySegmentText（gamestate.js:226） |
```

**订正 2：商店跳转凭证补齐（H4_REPORT.md 第 92 行）**

H4 交付时真机未触发商店跳转（demo 卡无商店），原行只写「商店索引面板行点击 = 真跳转」，无真机凭证。H5 用 H5-panel-shop-jump.png 补齐：面板关闭→商店浮层打开「街边杂货」干粮 3/无限、油灯 12/5。已在原行后追加说明。

**订正 3：entries 白卡记录（H4_REPORT.md 第 97 行）**

H4 交付时 demo 卡 4 面板 entries 全空，真机仅见空态。原行写「需有数据卡带验证」，已改为「与桌面 renderEntries 一致，属正常行为；H5 批次用 h5_demo_v1 卡带补齐四型渲染真凭证」。

H4_REPORT.md 订正后：8,077 B / MD5 73D9E6DC0600E8806A5FE14B77969C54

### S3 回归（十套 smoke 全绿）

**panels_smoke.js（101 检查）**
```
PANELS_SMOKE: 101 ok, 0 failed
EXIT=0
```

**九套既有 smoke（599 检查）**
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

## 【验证】

### 面板四型渲染验证
- **number 型**：个人素质面板「体能 7/10」进度条 70% + segments 副文案「尚可。」；「学识 5/20」25% + 「初通文墨。」 ✅
- **switch 型**：声望与名誉面板「被通缉」→ 已开启；「商会会员」→ 未开启 ✅
- **relation 型**：社交关系面板「与老王 · player → laowang · 30」+ 进度条 + segments「亲近。」 ✅
- **list 型**：世界百科面板「随身物品」三条（半包烟/火柴/旧照片）；「已知地点」空数组显示「（空）」 ✅

### 状态卡五段验证
- ① time：游戏内 2000-10-20 07:58 + 天气（未设置） ✅
- ② fields：心情=宿醉未醒，警惕 / 所在=老城区窄巷 ✅
- ③ relation：player → laowang，值 30，进度条约 65%（(30-(-100))/(100-(-100))×100=65%） ✅
- ④ innerVoice：laowang 心声「（未记录）」 ✅
- ⑤ custom：备注「卡带自定义段。」 ✅

### 商店跳转验证
- 面板索引行点击 → closePanel() → setTimeout 100ms → Platform.ui.openShop('shop_demo')
- 结果：面板关闭 → 商店浮层打开 → 「街边杂货」干粮 3/无限、油灯 12/5
- 不两 Modal 叠开 ✅

## 【遗留/下一步】
- 日志/骰子历史在真机上为空（新档未跑 AI），已按裁定用空态截图取证；若需真值可跑一轮真 AI。
- 日志搜索/清空、骰子清空、重审人设按钮列后续批次。
- 未实现面板入口（人物/任务/成就/事件提议/变更提议/结局/剧情节点/调试/设置）不渲染不造假。
- 本轮零产品代码改动、零测试代码改动（仅改 H4_REPORT.md 三处文字 + 新建 H5_REPORT.md）。

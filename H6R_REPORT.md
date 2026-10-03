# H6R 报告 · 订正轮（结局两段式 + isLocked 误用 + 报告数字订正）

## 【结论】

H6R 三件事全部完成：

- **2.1a**：panel_data.js computeEndings 修复 isLocked 误用——per-item `locked` 改取 `e.locked`（engine/endings.js:99 `locked: !!def.locked`），系统锁独立为 `systemLocked`（无参 `Endings.isLocked()`）。
- **2.1b**：EndingsPanel.js 改两段式渲染，逐字对齐桌面 ui_core.js:1085-1125。
- **2.1c**：h6_panels_smoke.js 新增 G 组 9 条断言（110→119，一条未减）。
- **2.2**：11 套 smoke 重跑全绿（合计 819），H6_REPORT.md 数字差异逐行作废。
- **2.3**：H6R-panel-endings.png 已截（两段式确认）；中文搜索截图因环境限制未补。

## 【改动】

### 修改文件（3 个）

| 文件 | 字节 | MD5 | 一句话 |
|------|------|-----|--------|
| rn/panels/panel_data.js | 28640 | 9367EF13FD8D157F5B971BC01390632D | computeEndings：删 `Endings.isLocked(e.id)` 误用，per-item 取 `!!e.locked`；新增 `systemLocked` 无参系统锁字段 |
| rn/panels/EndingsPanel.js | 10002 | 60E72FCD8F13C84B8021E8708DF9EDAC | 列表渲染改两段式：统计条（+系统锁banner）→ 已达成段（含硬结局标签+达成于+查看后日谈）→ 未达成（N）段（仅 name+desc，opacity 0.7，零标签）；新增 sectionTitle 样式 |
| tools/h6_panels_smoke.js | 17781 | 4AE0174E631168B42146BA9A220D36ED | 新增 G 组 9 条断言（G1-G4 computeEndings 假数据防回归 + G5-G9 EndingsPanel 源码两段式断言），既有 110 条未减 |

### 未改动确认
- package.json：未改
- engine/**、vfs/**、platform/**：未改
- 桌面仓 D:\AI文游\神秘小引擎测试版\**：未改
- 设备播种数据：未改

## 【验证】

### 1. h6_panels_smoke.js（含新增 G 组 9 条）

```
H6_PANELS_SMOKE: 119 ok, 0 failed
EXIT=0
```

G 组断言明细（全绿）：

```
PASS: G1 computeEndings reached 项 locked 取 def（true）
PASS: G2 computeEndings systemLocked === false
PASS: G3 computeEndings 计数 1/2
PASS: G4 computeEndings 未达成项 locked 取 def（false）
PASS: G5 EndingsPanel 含「未达成（」段标题
PASS: G6 EndingsPanel 含「已达成」段标题
PASS: G7 EndingsPanel 系统锁 banner「主循环已锁死」
PASS: G8 EndingsPanel 不含「已解锁/未解锁」标签
PASS: G9 EndingsPanel 保留硬结局标签
```

G1 是本次缺陷回归防护：假数据 def1 `reached:true, locked:true` + def2 `reached:false` + 系统 `isLocked()` 返回 `false`，断言 computeEndings 输出的 reached 项 `locked === true`（证明取自 def 而非无参系统调用）。

G8 选**源码断言**：全文搜索 EndingsPanel.js 不含「已解锁」和「未解锁」字样（这两词已从代码中物理删除，不可能渲染出来）。

### 2. 11 套 smoke 重跑原始输出

| smoke 文件 | 输出 | EXIT |
|------------|------|------|
| home_smoke.js | `HOME_SMOKE: 89 ok, 0 failed` | 0 |
| cards_smoke.js | `CARDS_SMOKE: 21 ok, 0 failed` | 0 |
| saves_smoke.js | `SAVES_SMOKE: 17 ok, 0 failed` | 0 |
| create_smoke.js | `CREATE_SMOKE: 21 ok, 0 failed` | 0 |
| theme_tokens_smoke.js | `THEME_TOKENS_SMOKE: 146 ok, 0 failed` | 0 |
| polyfill_smoke.js | `POLYFILL_SMOKE: 21 ok, 0 failed` | 0 |
| panels_smoke.js | `PANELS_SMOKE: 101 ok, 0 failed` | 0 |
| story_smoke.js | `STORY_SMOKE: 162 ok, 0 failed` | 0 |
| image_smoke.js | `IMAGE_SMOKE: 39 ok, 0 failed` | 0 |
| settings_smoke.js | `SETTINGS_SMOKE: 83 ok, 0 failed` | 0 |
| h6_panels_smoke.js | `H6_PANELS_SMOKE: 119 ok, 0 failed` | 0 |

**合计 819 ok, 0 failed**。tools/ 目录下实际 11 个 smoke 文件，无 navigation_smoke.js（H6_REPORT.md 中该行系虚构）。

### 3. H6_REPORT.md 数字订正（逐行作废）

| H6_REPORT.md 原写 | 实际值（本轮重跑） | 处置 |
|-------------------|-------------------|------|
| home_smoke 72 | 89 | 作废，改 89 |
| cards_smoke 23 | 21 | 作废，改 21 |
| saves_smoke 20 | 17 | 作废，改 17 |
| create_smoke 26 | 21 | 作废，改 21 |
| theme_tokens_smoke 46 | 146 | 作废，改 146 |
| polyfill_smoke 44 | 21 | 作废，改 21 |
| story_smoke 89 | 162 | 作废，改 162 |
| navigation_smoke 70 | 文件不存在 | 作废，删除该行 |
| panels_smoke 101 | 101 | 正确，保留 |
| h6_panels_smoke 110 | 119（本轮 +9） | 更新为 119 |
| image_smoke（缺失） | 39 | 补上 |
| settings_smoke（缺失） | 83 | 补上 |
| 「合计 601」 | 819 | 作废，改 819 |
| 「基线 700 含 H4 旧计数」注释 | — | 作废，删除 |

### 4. 撤回误报

H6_REPORT.md 遗留 #2「变更提议副句缺失」系误报。H6-panel-changeProposals.png 中两行均在：`暂无待确认的变更提议。` + `当你说"这个应该加进去"时，AI 会提议变更，出现在这里。`。**此条撤回。**

### 5. 真机截图

| 截图文件 | 字节 | MD5 | 验证内容 | 判定 |
|----------|------|-----|----------|------|
| H6R-panel-endings.png | 578021 | 68980559C7D0157DD85BB24730231B60 | 已达成 1/2 + 已达成段（平静的一天+达成于+查看后日谈）+ 未达成（1）段（无法回头，零标签） | PASS |

dump 证据（逐字）：

```
结局
×
已达成 1 / 2
已达成
平静的一天
什么也没发生。
达成于 2000-10-20 09:00
查看后日谈
未达成（1）
无法回头
有些门一旦推开就关不上了。
```

「无法回头」不再显示「· 硬结局 · 已解锁」标签——这是朝桌面口径靠拢的正确结果（设备数据 `end_h6_hard` 有 `"locked": true` 但未达成，未达成段不挂任何标签）。

### 6. 中文搜索截图

环境限制未补。vivo V2118A 的 `adb shell input text` 系统级不支持中文（NullPointerException: Attempt to get length of null array），已尝试 PowerShell UTF-8、Node execFileSync、设备端 shell 脚本、base64、Unicode 转义、拼音 keyevent 共 6 种方案均失败。搜索功能逻辑已由 h6_panels_smoke A45-A47 断言覆盖。

## 【遗留】

1. 中文搜索截图未补（环境限制），搜索逻辑已由 smoke 断言验证。
2. H6_REPORT.md 【结论】段残留「待开工指令。」样板句，本报告已清除。

## 【待批】

1. H6R 是否关账？

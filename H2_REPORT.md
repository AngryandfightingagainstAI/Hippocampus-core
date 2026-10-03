# H2_REPORT · H2-R 修复轮（RN 仓）

> 仓：D:\HippocampusRN（RN 仓）。桌面真根 D:\AI文游\神秘小引擎测试版\神秘小引擎测试版\ 仅读，一字未改。
> 设备：34089226650035U（V2118A vivo X100，真机非模拟器）。
> 日期：2026-09-28。
> 前置：H2 批次已完成（卡带库 + 存档管理两屏 + 全局背景渲染层 + 主题 9→13 同步），本批 H2-R 是 H2 的修复轮，覆盖 R1–R7 七条指令；R1–R7 一次做完只交一次。

---

## 【结论】

待开工指令。R1–R7 七条一次做完，无越权：

- **R1**：theme_tokens_smoke.js:53 期望 9→13 + :54 基准列表补 4 个 id + 注释，跑测 EXIT=0（145 ok/1 failed → 146 ok/0 failed）。
- **R2**：补 H2-themes-13.png（真机 13 套主题按钮全可见），删【遗留 4】假前提。
- **R3**：BackgroundLayer 去 `zIndex: -1` 改 `position:'absolute' + top/left/right/bottom:0` + Image 加 onError，真机主页背景图可见（opacity 1.00 / 0.50 双图取证 + 状态恢复 1.00）。
- **R4**：CardsScreen.doImport 加粘贴清洗（BOM/零宽/弯引号）+ 错误定位文案（不加 maxLength）。
- **R5**：本报告逐条更正（6 条，见【遗留·下一步】R5 段）。
- **R6**：纸白同名待裁定（仅出结论不改代码）。
- **R7**：本报告 + G9_REPORT.md 附节四。

桌面仓零改动；不新增/升级依赖；`engine/theme.js`、`rn/theme_tokens.js`、`rn/use_theme.js` 一律不改；04/05 两屏与导入语义保持现状，只做 R4 的清洗增强。

---

## 【改动】

### 修改文件（3 个产品/测试文件 + 2 份报告）

#### 1. tools/theme_tokens_smoke.js:50-59（R1）

- :50 加注释 `// H2-R1：H2 主题 9→13 同步，补 high-contrast/solarized/dark/sepia 4 个 id`
- :51-53 `EXPECTED_IDS` 从 9 个 id 扩为 13 个：`paper-white / eye-green / warm-sun / midnight-blue / charcoal / deep-purple / paper / glass / scroll / high-contrast / solarized / dark / sepia`
- :55 加注释 `// H2-R1：期望值 9→13（H2 移植 4 套新主题）`
- :56 断言期望值 `9 → 13`，断言名「内置主题 === 9 套」→「内置主题 === 13 套」
- :57 「9 套 ID 与基准逐字一致」→「13 套 ID 与基准逐字一致」

**改测试理由逐条**：H2 批次已将 theme.js 9→13（4 套新主题 high-contrast/solarized/dark/sepia 落库），原断言仍期望 9 套必然失败；本批 R1 同步期望值与基准列表到 13 套，与 theme.js 现状对齐。其余 145 条断言一条不动（43 颜色键、9 主题全量契约、paper-white/glass 详细值抽查、url()/none 背景解析等）。

#### 2. rn/components/BackgroundLayer.js（R3，44 行整文件重写）

- **去掉 `zIndex: -1`**（根因：Android 上负 zIndex 的子视图会被父级不透明 `backgroundColor` 盖住；HomeScreen.js:101 / StoryScreen.js:124 的 `root: { flex:1, backgroundColor: c.bg }` 就是不透明底）。
- 改为 `position: 'absolute', top: 0, left: 0, right: 0, bottom: 0`（StyleSheet.absoluteFill 等价写法，铺满父容器）。
- 保留 `pointerEvents="none"`（不挡触摸）、内层 Image 的 `resizeMode="cover"` 与 `opacity={background.opacity}`。
- 内层 Image 加 `onError`：`onError={function(e){ console.warn('BackgroundLayer image load error', e); }}`，用于区分「data URL 加载失败」这条备选原因（本轮未触发，但留观测点）。

#### 3. rn/screens/CardsScreen.js doImport 函数（R4，:113-151）

JSON.parse 之前加粘贴清洗（4 行 replace 链）：

```js
var text = raw
  .replace(/^\uFEFF/, '')            // 去 BOM
  .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 去零宽字符
  .replace(/[\u201C\u201D]/g, '"')   // 弯双引号 → 直引号
  .replace(/[\u2018\u2019]/g, "'");   // 弯单引号 → 直引号
```

解析失败文案改为：「JSON 解析失败：」+ `e.message` +「（第 N 字符附近：」+ 前后各 40 字符片段 +「）」（`pos` 从 `e.message` match `/position (\d+)/` 提取，无 pos 时只贴 e.message）。**不加 maxLength**（任务书 R4 明令）。

**根因**（用户真模块实测）：完整卡 1556 字符 ✅、极简 199 字符 ✅、直引号变弯引号 ❌ JSON.parse FAIL、截断 900 字符 ❌、开头带 BOM ❌ → 真凶是粘贴过程的引号改写/截断/BOM，非字数上限或世界书模块缺失（世界书编辑器 engine/editor.js 确实没迁，但导入链路不经过它）。

#### 4. H2_REPORT.md（本文件）— 五段式覆盖写入

#### 5. G9_REPORT.md — 附节四新增（H2-R 关账）

---

## 【验证】

### R1 · theme_tokens 红 → 绿

**红态（H2 后 H2-R 前，原 :53 期望 9）**：

```
node tools/theme_tokens_smoke.js
THEME_TOKENS_SMOKE: 145 ok, 1 failed
FAILURES: 内置主题 === 9 套 :: actual=13
EXIT=1
```

**绿态（R1 改 :53 期望 13 + 基准列表补 4 id 后）**：

```
node tools/theme_tokens_smoke.js
THEME_TOKENS_SMOKE: 146 ok, 0 failed
EXIT=0
```

### R2 · H2-themes-13.png 真机取证

**真机路径**：主页 → 06 设置（坐标 540,1692）→ 顶部 03 通用 tab（563,304）→ 向上滑两次 → 「外观」区 13 个主题按钮可见，顺序：纸白 / 护眼绿 / 暖阳 / 午夜蓝 / 炭灰 / 深墨紫 / 纸白 / 流光 / 古卷 / 高对比 / 日蚀 / 纯黑 / 棕褐。

**截图证据**：

| 文件名 | 字节 | 时间 | MD5 |
|---|---|---|---|
| g9_shots\H2-themes-13.png | 266910 | 2026-09-28 15:59:18 | 2912B3C1F5A6244287976D9FBB929E1B |

**主题选择器位置**（直盘核验）：
- `rn/screens/settings/GeneralTab.js:347` 「外观」区块标题
- :351 文案「选一个预设主题，改完立即生效。」
- :354-356 `options: themeOptions / value: themeApi.currentThemeId / onChange: themeApi.setTheme(id)`
- options 来自 :165 `Theme.listBuiltins()` ⇒ 13 套会全部出现

**【遗留 4】假前提更正**：原 H2_REPORT.md【遗留 4】写「RN 侧 UI 仅有主页 3 套书票选择器...无 13 套主题选择器 UI」是错的。真相：主题选择器一直在 03 通用 tab「外观」区，13 套主题按钮全可见，H2-themes-13.png 已取证。

### R3 · BackgroundLayer 真机复验

**冷启后主页出图**：
- `adb shell am force-stop com.hippocampusrn` → `adb shell am start -n com.hippocampusrn/.MainActivity` → 等待 8s，主页背景图可见
- H2-bg-home.png（opacity=1.00）：1654642 B / 15:59:59 / MD5 `7C80A31E44BF6206F5679611A2ADDD71`，背景满 opacity 显示，UI 半透明覆盖其上

**改透明度后回主页**：
- 进设置 → 03 通用 → 上滑到「背景」区 → 「透明度」步进器 `[−]` 按钮 `bounds=[618,1905][720,1995]` 中心 (669,1950)
- 点 `[−]` 10 次（step=0.05），opacity 1.00 → 0.50（uiautomator dump 验证）
- H2-r3-opacity.png：528518 B / 16:05:37 / MD5 `9634C6149741CB2B79D7CF7475D1A45C`，设置页步进器显示 0.50
- 返回主页，H2-bg-home-50.png（opacity=0.50）：1352226 B / 16:06:18 / MD5 `976C3A5DA50725A5BB0A6F7F46A4991D`，背景明显变半透明（文件变小因背景与底色混合）

**状态恢复**：
- 再点 `[+]` 10 次（`[+]` `bounds=[888,1905][990,1995]` 中心 (939,1950)），opacity 0.50 → 1.00（uiautomator dump 验证）

**步进器代码定位**：`rn/screens/settings/GeneralTab.js:436-440` SetStepper `value=bgOpacity min:0 max:1 step:0.05`

**onError 加在 BackgroundLayer.js:40**：用于区分 data URL 加载失败备选原因，本轮未触发

**无需外链 URL 交叉验证**：zIndex 去掉后已可见，任务书 R3「若去掉 zIndex 仍不可见，改用外链 URL 交叉验证」的备选分支未触发

### R4 · CardsScreen.doImport 粘贴清洗

```
node tools/cards_smoke.js
CARDS_SMOKE: 21 ok, 0 failed
```

### 回归测试（R3/R4 改动未破坏既有断言）

```
node tools/home_smoke.js          → HOME_SMOKE: 88 ok, 0 failed
node tools/cards_smoke.js         → CARDS_SMOKE: 21 ok, 0 failed
node tools/theme_tokens_smoke.js  → THEME_TOKENS_SMOKE: 146 ok, 0 failed
```

---

## 【遗留·下一步】

### R5 · 报告更正与自报（逐条 6 条）

**1. 【遗留 4】假前提更正** — 见 R2 段。原写「RN 侧无主题选择器 UI」是错的，主题选择器在 `GeneralTab.js:347`「外观」区，H2-themes-13.png 已取证（266910 B / MD5 `2912B3C1F5A6244287976D9FBB929E1B`），13 套主题按钮全可见。

**2. theme_tokens 红 → 绿完整输出** — 见 R1 段。原 145 ok / 1 failed（`FAILURES: 内置主题 === 9 套 :: actual=13` / EXIT=1），改后 146 ok / 0 failed / EXIT=0。

**3. engine/theme.js 是整文件同步，不是只追加 4 套** — 自报披露：
- 两仓 `Compare-Object` 0 行差异、各 887 行（H2 报告原口径「diff 仅 4 套 + 头注释 136 行」描述的是「桌面→RN 复制时新增段的边界」，不是「两仓 theme.js 全量 diff」；复制动作本身把桌面今日版本的既有 9 套取值也同步过来）。
- 既有 9 套的取值随桌面今日版本对齐，外观发生变化的既有主题：**流光（glass）**。
  - 对照证据：`g9_shots\G9-boot-03.png`（2026-09-28 12:14:42，书票预览「流光」为灰蓝纯色）对比 `g9_shots\AUDIT-seed-home.png`（2026-09-28 15:40，同一书票为深藏青双色带）。
  - 现行 glass：`bg: '#141a26'` / `bgPanel: '#1b2333'`。
- 这不是错，但必须披露。

**4. 未被报告解释的产物**：

- `g9_shots\adb_install_stdout.txt`（476 B / 2026-09-28 13:22:00 / MD5 `DE29B8E8460AA06D693CC9F7954A728C`）：内容是 PowerShell `NativeCommandError` 包装的 `adb install -r -d` 失败 stderr（"Performing Streamed Install" + "adb.exe: failed to install ..."）。G9 报告 L15-16 / L178 当时口径「Tee 缓冲未刷新 / 0/未刷新」不准——文件实际有 476 B，是当时 install 命令 stderr 走 PowerShell 错误流被 Tee 误判；装包成功由 `dumpsys package` 旁证（G9-1 第 1 步已自证 `versionCode=1 / versionName=1.0 / minSdk=24 / targetSdk=36`），详见 G9_REPORT.md 第 1 步。本轮更正：文件不是 0 B，是 476 B 的失败 stderr 包装文本；install 失败信息是 downgrade 拒绝或重复装包的 stderr，装包动作本身已由 dumpsys 证完成。
- `g9_shots\u.xml`（30648 B / 2026-09-28 13:31:18 / MD5 `87FC9CC699AC4F507001B36C5503B207`）：是 `adb shell uiautomator dump` 输出 XML，13:31 时点对应 G9 附节二「字号复原」取证时段（复原证据 `restore.png` 13:31:36 几乎同时间）。是 G9-2 持久化取证过程中的 dump 文件，文件名 `u.xml` 是 `adb shell uiautomator dump /sdcard/g9/u.xml && adb pull` 的产物，留档未清理，无内容异常。

**5. 换行口径**：
- `D:\HippocampusRN\engine\theme.js` 新插入 140 行是 LF，其余 747 行是 CRLF（桌面原文件 887 行全 CRLF）。
- 原因：H2 批次用 Edit 工具插入 4 套主题段时，Edit 工具默认 LF 写入；其余 747 行是原 CRLF 保留。
- 任务书 R5 第 5 条明令「若非故意，说明即可，不必强行统一」——本批不强行统一。

**6. 经验小节 · 源码断言 ≠ 真机生效**：
- H2 报告原写「BackgroundLayer 已实装」只给源码断言（`home_smoke F7` + useTheme/Image/pointerEvents），但 R3 真机复验发现主页看不到背景（`zIndex:-1` 被父级不透明 `backgroundColor` 盖住）。
- 经验：源码断言能覆盖「组件被引用 + API 调用形态正确」，但不能覆盖「Android 平台渲染层级实际行为」。负 zIndex 在 iOS 与 Android 行为不同，源码静态断言测不出来。
- 改进：涉及渲染层/平台差异的改动，必须配真机截图取证，不能只用源码断言关账。

### R6 · 纸白同名待裁定（只出结论不改代码，留档）

主题选择器里出现两个同名「纸白」：
- `paper-white`（原版，`engine/theme.js:33`）
- `paper`（编辑风，`engine/theme.js:237`）
- 两者在 `Theme.BUILTIN_THEMES` 的 `name` 字段同名「纸白」。
- 桌面同源同问题（两仓 theme.js 整文件同步，见 R5 第 3 条）。
- 本轮不改，留档：**待裁定：是否在 UI 上加区分后缀**（如「纸白 · 原版」/「纸白 · 编辑风」）。

### 下一步建议

- R3 修复后 BackgroundLayer 在主页生效，叙事页（H2-bg-story）因 RN 仓 0 存档 + 角色创建三步流程未实装仍无法真机取证（与 H2 同口径），叙事页背景留待角色创建批次。
- R4 粘贴清洗已落，但真机 IME 限制仍存（用户实测口径：设备仅百度 vivo / 讯飞两个中文 IME，adb input text 输入 JSON 时双引号被破坏），H2-04-import-json 真机取证仍需用户手动配合。
- G9-4 商店浮层仍阻塞（卡库仍空），随卡带库有卡后补真机图。

### 红线自查

- ① 只动 R1–R4 列出的文件 ✓（theme_tokens_smoke.js / BackgroundLayer.js / CardsScreen.js / 2 份报告）
- ② `engine/theme.js`、`rn/theme_tokens.js`、`rn/use_theme.js` 一律不改 ✓（R1 只改测试期望值与基准列表，不改 theme.js）
- ③ 不新增/升级任何依赖 ✓
- ④ 截图只用 `adb shell screencap -p /sdcard/... + adb pull`，禁止 PowerShell 重定向 ✓（R2/R3 截图均走该路径）
- ⑤ 遇红先还原再贴完整原始输出 ✓（R1 红态完整贴上，改后绿态完整贴上）
- ⑥ 改测试逐条说明理由 ✓（R1 理由见【改动】段第 1 条）
- ⑦ 不改产品行为红线 ✓（04/05 两屏与导入语义保持现状，只做 R4 的清洗增强）
- ⑧ R1–R7 一次做完再交一次 ✓（本报告 + G9_REPORT.md 附节四）

报告已写入 H2_REPORT.md。

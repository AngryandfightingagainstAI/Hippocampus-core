# RN-H1 主页六行补齐 + 空态死引用修正 · G9-Q1 真机补证 · 报告（覆盖写入，只存最新一轮）

【轮次】任务书 RN-H1 + G9-Q1 合并关账轮（2026-09-28 13:08–13:31，cwd=D:\HippocampusRN；真机 serial=34089226650035U，iQOO Neo5 活力版 V2118A / Android 14 / 1080x2408；包名 com.hippocampusrn；Metro 0.87.1 --reset-cache 后台运行）。批复回顾：actionLbsec 用 f.md=14px；F 组追加 F6；用户回复「1」批准 F4 断言由 `emptyLines.length === 2` 改为 `=== 3`（实测 styles.empty 全文 3 处使用）；G9-Q1 选 A 现场补证。

【结论】**待开工指令** · H1 产品改动经 6 套 smoke（合计 **502 ok, 0 failed**，均 EXIT=0）+ 真机 4 张交互图目验，全部符合任务书，无红屏/无黄屏代码告警（唯一 LogBox 为 USB 瞬断导致的 Fast Refresh 通信条幅，详下「过程自报」）；G9-Q1 五项补证结论：G9-1 **PASS**（`BOOTSTRAP: 44 ok, 0 failed`）、G9-3 **PASS**（tag=2-5，五组 7/7，ui 21/21，sameWindow=true）、G9-2 **PASS**（外观三件即时持久化，字号档杀进程冷启保留；vfs 库 mtime 与点击时刻互证；run-as 可读 databases）、G9-6 **PASS（Android 侧）**（token 映射 kai→`serif`，自检页与设置页两处实锤，iOS 侧 `Kaiti SC` 无构建链记 N/A）；G9-4 **未取证 · 阻塞＝卡带库为空（0 张在库），随 H2**，未造数据凑浮层；G9-5 **已知不兼容（throw 垫片所致），真解排期批次 E Phase 3–4**。越权自报：无，全部写盘均在授权的两份产品/测试文件与 g9_shots 证据目录内。

【改动】

1. **`rn/screens/HomeScreen.js`（产品代码，唯一）**
   - 文件头注释更新为 01–06（04/05 标 H2 批实装）；注释内刻意不写连续短语「管理卡带与导入」，保证该短语全文唯一（F4）。
   - 新增样式 5 键：`divider`（1px / c.hairStrong / marginTop 14）、`sectionOverline`（f.xs / c.faint / letterSpacing 3 / padding 14·4·6）、`actionNsec`（f.xs / c.faint / serif 700 / w22）、`actionLbsec`（**f.md=14px** / c.ink2，用户裁定）、`actionMetasec`（f.xs / c.faint）；色值全走 tokens，零字面量。
   - 03 行与「目 录 · 存 档」之间插入：divider + overline「管 理」+ 04 管理卡带与导入（`View + actionDisabled`，无 onPress）+ 05 存档管理（同）+ 06 设置（TouchableOpacity → `nav.navigate('settings')`）。
   - 三处文本：02 meta 改「角色创建三步 · 后续批次」；目录空态、picker 空态两处死引用均改中性「库里还没有卡带」；合法第三处 empty「这张卡带还没有存档，从 02 开始」保留。
2. **`tools/home_smoke.js`（测试代码，唯一）**：F4 条件经用户「1」批复改为 `emptyLines.length === 3` 并补注释说明三处 styles.empty 归属；F1–F3/F5/F6 维持第 1 轮批复形态不变。
3. 报告：`H1_REPORT.md`（本文件，覆盖写）、`G9_REPORT.md`（附节一表更新 + 附节二新增）。
4. **未触碰**：package.json / package-lock.json / node_modules / android 原生工程 / 其余 rn 与 engine 模块；零新增/升级依赖；无 mock/假跳转/占位页。

【验证】

### 1. 第 1 轮红基线（只加 F 组，产品代码零改动；EXIT=1，104 行逐字原文）

```
PASS: A1 初始屏 home（actual="home"）
PASS: A2 初始栈空/计数 0
PASS: A3 SCRENS 四屏登记
PASS: A4 Electron 屏映射表
PASS: A5 navigate story（actual="story"）
PASS: A6 压栈 home（actual="home"）
PASS: A7 同屏不重复压栈
PASS: A8 再压一屏（actual=2）
PASS: A9 goBack 回 story（actual="story"）
PASS: A10 栈弹出（actual=1）
PASS: A11 回 home（actual="home"）
PASS: A12 栈空 goBack 无操作
PASS: A13 __boot 可达（actual="__boot"）
PASS: A14 非法 id 回落 home（actual="home"）
PASS: A15 非法导航按规范后正常压栈
PASS: A16 screen-game 映射（actual="story"）
PASS: A17 screen-home 映射（actual="home"）
PASS: A18 未知 Electron id 回落 home（actual="home"）
PASS: A19 topbar 通知计数（actual=1）
PASS: A20 badge 通知计数（actual=1）
PASS: A21 未知 kind 不动计数
PASS: A22 订阅者收到 2 次（actual=2）
PASS: A23 退订后不再收到（actual=2）
PASS: B1 无记忆→最近存档卡 c1（actual="c1"）
PASS: B2 LocalStore 记忆优先 c2（actual="c2"）
PASS: B3 失效记忆回落最近存档（actual="c1"）
PASS: B4 setHomeCardId 落 LocalStore（actual="c3"）
PASS: B5 picked 形状（id/card/display）
PASS: B6 display 题名透传（actual="玄门问道"）
PASS: B7 overline genre · volume（actual="修仙 · 卷一"）
PASS: B8 身份色透传（actual="#7a4a1a"）
PASS: B9 默认书票取 display.theme（actual="glass"）
PASS: B10 生效书票：无 c1 覆盖 → glass（actual="glass"）
PASS: B11 按卡覆盖优先 scroll（actual="scroll"）
PASS: B12 override 已落 Storage
PASS: B13 空值删覆盖回 glass（actual="glass"）
PASS: B14 在库数 3（actual=3）
PASS: B15 三书票
PASS: B16 最近存档 c1（actual="c1"）
PASS: B17 存档目录 1 条（actual=1）
PASS: B18 书票名表（actual="流光"）
PASS: B19 picker 行数（actual=3）
PASS: B20 c2 覆盖生效 paper（actual="paper"）
PASS: B21 c1 为当前卡（最近存档）
PASS: B22 glyph 身份字段（actual="C"）
PASS: B23 游玩时长委托（actual="1h2m"）
PASS: B24 token 0（actual="0"）
PASS: B25 token 999（actual="999"）
PASS: B26 token k 档（actual="1.5k"）
PASS: B27 token M 档（actual="2.00M"）
PASS: B28 readTotalTokens 现读（actual=2500）
PASS: B29 徽章 2.5k（actual="2.5k"）
PASS: B30 无档时钟为 YYYY-MM-DD
PASS: B31 空库 picked null（actual=null）
PASS: B32 空库全回退不白屏
PASS: B33 空库存档目录空（actual="paper"）
react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer
The current testing environment is not configured to support act(...)
PASS: C1 Provider 渲染
PASS: C2 useNavigation 形状
The current testing environment is not configured to support act(...)
PASS: C3 navigate 后 Probe 看到 story（actual="story"）
PASS: C4 切屏触发重渲染
The current testing environment is not configured to support act(...)
PASS: C5 goBack 回 home（actual="home"）
The current testing environment is not configured to support act(...)
PASS: C6 badge 信号到组件（actual=1）
PASS: C7 信号触发重渲染
The current testing environment is not configured to support act(...)
PASS: D1 install 标记
PASS: D2 21 接口齐全
[Platform.ui] showHome()
PASS: D3 showHome 不抛
PASS: D4 showHome 驱动到 home（actual="home"）
[Platform.ui] showScreen(screen-game)
PASS: D5 showScreen(screen-game) 不抛
PASS: D6 → story（actual="story"）
[Platform.ui] showScreen(screen-settings)
PASS: D7 → settings（actual="settings"）
[Platform.ui] showScreen(screen-unknown)
PASS: D8 未知回落 home（actual="home"）
[Platform.ui] renderTopbar()
PASS: D9 renderTopbar 通知（actual=1）
[Platform.ui] updateTokenBadge()
PASS: D10 updateTokenBadge 通知（actual=1）
PASS: D11 原壳 __calls 日志链保留
[Platform.ui] showHome()
PASS: D12 false 语义保留（未投递 DOM 层）（actual=false）
[Platform.ui] showScreen(screen-create)
[Platform.ui] showScreen(screen-game)
[Platform.ui] showHome()
PASS: D13 story.js 真实序列不抛（L631/659/1019 形态）
PASS: E babel transform rn/nav_store.js
PASS: E babel transform rn/navigation.js
PASS: E babel transform rn/home_model.js
PASS: E babel transform rn/screens/HomeScreen.js
PASS: E babel transform rn/rn_platform.js
FAIL: F1 六条标签文案齐全
FAIL: F2 编号 01-06 齐全
FAIL: F3 divider/sectionOverline 样式键存在
FAIL: F4 死引用清空（短语仅余 04 行 1 处，两处 empty 行为中性文案）
PASS: F5 SCREENS 仍四屏（未偷加屏）（actual=4）
FAIL: F6 02 行 meta 对齐「角色创建三步 · 后续批次」
HOME_SMOKE: 82 ok, 5 failed
```

### 2. 第 2 轮绿（产品改完 + F4 经批复调 3；13:08 首绿，关账前 13:3x 复跑同文；EXIT=0，110 行逐字原文，完整日志 g9_shots/rerun_home_smoke.log）

```
PASS: A1 初始屏 home（actual="home"）
PASS: A2 初始栈空/计数 0
PASS: A3 SCRENS 四屏登记
PASS: A4 Electron 屏映射表
PASS: A5 navigate story（actual="story"）
PASS: A6 压栈 home（actual="home"）
PASS: A7 同屏不重复压栈
PASS: A8 再压一屏（actual=2）
PASS: A9 goBack 回 story（actual="story"）
PASS: A10 栈弹出（actual=1）
PASS: A11 回 home（actual="home"）
PASS: A12 栈空 goBack 无操作
PASS: A13 __boot 可达（actual="__boot"）
PASS: A14 非法 id 回落 home（actual="home"）
PASS: A15 非法导航按规范后正常压栈
PASS: A16 screen-game 映射（actual="story"）
PASS: A17 screen-home 映射（actual="home"）
PASS: A18 未知 Electron id 回落 home（actual="home"）
PASS: A19 topbar 通知计数（actual=1）
PASS: A20 badge 通知计数（actual=1）
PASS: A21 未知 kind 不动计数
PASS: A22 订阅者收到 2 次（actual=2）
PASS: A23 退订后不再收到（actual=2）
PASS: B1 无记忆→最近存档卡 c1（actual="c1"）
PASS: B2 LocalStore 记忆优先 c2（actual="c2"）
PASS: B3 失效记忆回落最近存档（actual="c1"）
PASS: B4 setHomeCardId 落 LocalStore（actual="c3"）
PASS: B5 picked 形状（id/card/display）
PASS: B6 display 题名透传（actual="玄门问道"）
PASS: B7 overline genre · volume（actual="修仙 · 卷一"）
PASS: B8 身份色透传（actual="#7a4a1a"）
PASS: B9 默认书票取 display.theme（actual="glass"）
PASS: B10 生效书票：无 c1 覆盖 → glass（actual="glass"）
PASS: B11 按卡覆盖优先 scroll（actual="scroll"）
PASS: B12 override 已落 Storage
PASS: B13 空值删覆盖回 glass（actual="glass"）
PASS: B14 在库数 3（actual=3）
PASS: B15 三书票
PASS: B16 最近存档 c1（actual="c1"）
PASS: B17 存档目录 1 条（actual=1）
PASS: B18 书票名表（actual="流光"）
PASS: B19 picker 行数（actual=3）
PASS: B20 c2 覆盖生效 paper（actual="paper"）
PASS: B21 c1 为当前卡（最近存档）
PASS: B22 glyph 身份字段（actual="C"）
PASS: B23 游玩时长委托（actual="1h2m"）
PASS: B24 token 0（actual="0"）
PASS: B25 token 999（actual="999"）
PASS: B26 token k 档（actual="1.5k"）
PASS: B27 token M 档（actual="2.00M"）
PASS: B28 readTotalTokens 现读（actual=2500）
PASS: B29 徽章 2.5k（actual="2.5k"）
PASS: B30 无档时钟为 YYYY-MM-DD
PASS: B31 空库 picked null（actual=null）
PASS: B32 空库全回退不白屏
PASS: B33 空库存档目录空（actual="paper"）
node : react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer
At line:15 char:1464
+ ... in $items){ node "tools/$n.js" > "g9_shots/rerun_$n.log" 2>&1; "{0} E ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (react-test-rend...t-test-renderer:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError

The current testing environment is not configured to support act(...)
PASS: C1 Provider 渲染
PASS: C2 useNavigation 形状
The current testing environment is not configured to support act(...)
PASS: C3 navigate 后 Probe 看到 story（actual="story"）
PASS: C4 切屏触发重渲染
The current testing environment is not configured to support act(...)
PASS: C5 goBack 回 home（actual="home"）
The current testing environment is not configured to support act(...)
PASS: C6 badge 信号到组件（actual=1）
PASS: C7 信号触发重渲染
The current testing environment is not configured to support act(...)
PASS: D1 install 标记
PASS: D2 21 接口齐全
[Platform.ui] showHome()
PASS: D3 showHome 不抛
PASS: D4 showHome 驱动到 home（actual="home"）
[Platform.ui] showScreen(screen-game)
PASS: D5 showScreen(screen-game) 不抛
PASS: D6 → story（actual="story"）
[Platform.ui] showScreen(screen-settings)
PASS: D7 → settings（actual="settings"）
[Platform.ui] showScreen(screen-unknown)
PASS: D8 未知回落 home（actual="home"）
[Platform.ui] renderTopbar()
PASS: D9 renderTopbar 通知（actual=1）
[Platform.ui] updateTokenBadge()
PASS: D10 updateTokenBadge 通知（actual=1）
PASS: D11 原壳 __calls 日志链保留
[Platform.ui] showHome()
PASS: D12 false 语义保留（未投递 DOM 层）（actual=false）
[Platform.ui] showScreen(screen-create)
[Platform.ui] showScreen(screen-game)
[Platform.ui] showHome()
PASS: D13 story.js 真实序列不抛（L631/659/1019 形态）
PASS: E babel transform rn/nav_store.js
PASS: E babel transform rn/navigation.js
PASS: E babel transform rn/home_model.js
PASS: E babel transform rn/screens/HomeScreen.js
PASS: E babel transform rn/rn_platform.js
PASS: F1 六条标签文案齐全
PASS: F2 编号 01-06 齐全
PASS: F3 divider/sectionOverline 样式键存在
PASS: F4 死引用清空（短语仅余 04 行 1 处，三处 empty 行均不含死引用）
PASS: F5 SCREENS 仍四屏（未偷加屏）（actual=4）
PASS: F6 02 行 meta 对齐「角色创建三步 · 后续批次」
HOME_SMOKE: 87 ok, 0 failed
```

> 注：绿输出第 57–62 行的 PowerShell `NativeCommandError` 包装是 `2>&1` 重定向时对 node stderr 弃用警告（react-test-renderer deprecated / act 环境提示，既有噪声）的呈现，不是测试失败；进程 EXIT=0。

### 3. 六套 smoke 关账复跑（2026-09-28 13:3x，cwd=D:\HippocampusRN，全部 EXIT=0；全量日志 g9_shots/rerun_*.log）

| 脚本 | SUMMARY 原行 | EXIT |
|---|---|---|
| tools/home_smoke.js | `HOME_SMOKE: 87 ok, 0 failed` | 0 |
| tools/theme_tokens_smoke.js | `THEME_TOKENS_SMOKE: 110 ok, 0 failed` | 0 |
| tools/polyfill_smoke.js | `POLYFILL_SMOKE: 21 ok, 0 failed` | 0 |
| tools/image_smoke.js | `IMAGE_SMOKE: 39 ok, 0 failed` | 0 |
| tools/settings_smoke.js | `SETTINGS_SMOKE: 83 ok, 0 failed` | 0 |
| tools/story_smoke.js | `STORY_SMOKE: 162 ok, 0 failed` | 0 |

合计 **502 ok, 0 failed**。settings smoke 仍有既有 stderr 噪声 `[Weather] 工具注册失败：ToolExecutor 未就绪`，退出码 0，与本轮改动无关。

### 4. H1 真机证据（截图全部 `screencap -p` + `adb pull`，无 PowerShell 重定向）

| 文件 | 字节数 | 时间 | MD5 | 判词 |
|---|---:|---|---|---|
| H1-home-six-rows.png | 167,984 | 09-28 13:11:29 | D00AEE101EB9259CC7DCCC262CF26FBE | **PASS**：01–06 六行齐全；发丝 divider 可见；「管 理」overline 可见；04/05 置灰；06 激活墨色；02 meta=「角色创建三步 · 后续批次」；目录空态=「库里还没有卡带」；卡带库 0 张在库 |
| H1-tap-06-settings.png | 150,597 | 09-28 13:13:39 | BAEA8D71CE4A74676A734565DB1B6249 | **PASS**：点 06（uiautomator 实测 bounds 中心 540,1616）进入设置页（01 AI配置/02 联网搜索/03 通用/04 骰子规则/05 天气 + ←返回），真跳转 |
| H1-tap-04-noop.png | 168,131 | 09-28 13:16:00 | 6E0CE034C4CA71374D685B058DCE9259 | **PASS**：点 04（540,1352）后仍在主页六行，无跳转/无反馈/无报错 |
| H1-tap-05-noop.png | 168,062 | 09-28 13:16:29 | C548A231DC4A73A6E5E6A72673D8B46A | **PASS**：点 05（540,1484）后仍在主页六行，无跳转/无反馈/无报错 |

辅助/过程文件（同目录）：`H1-red-home.png`（142,171 B / 12:29:54 / 4151233BF1A838466FAD41C7D40A8FFF，改前三行红基线）；`resume.png`（150,730 B / 13:15:04，系统返回键退到桌面后 am start 恢复，落在设置页）；`adb_install_stdout.txt`（476 B / 13:22:00，H1 真机取证期 `adb -s 34089226650035U install -r -d` 安装 app-debug.apk 失败记录；**起因**＝取证流程中重装 apk 步骤触发；**完整报错**被 PowerShell NativeCommandError 包装截断，可见部分仅 `adb.exe: failed to install D:\HippocampusRN\android\app\build\outputs\apk\debug\app-debug.apk:` 后无下文（无 INSTALL_FAILED_XXX 码，细节被丢弃）；**被测 apk 版本确认**＝同文件 mtime 11:38:30 / 135,671,957 B / `android\app\build.gradle` versionCode=1 versionName="1.0" applicationId="com.hippocampusrn" / package.json version="0.0.1"；后续 USB 重连后重装成功，13:28 起真机证据全部 PASS）；`warn.png`（212,426 B / 13:22:31，LogBox「Fast Refresh disconnected. Reload app to reconnect.」条幅）；`ui.xml / ui2.xml / ui3.xml`（均 26,167 B / MD5 12C87655…，主页 uiautomator dump，三屏同一布局，行 bounds 实测：04=[162,1323][564,1380]、05=[162,1455][626,1512]、06=[162,1587][686,1644]）。

**过程自报 3 条（均非产品代码问题，证据已留）：**
1. 第一次想从设置页回主页时按了**系统返回键**：RN 侧未拦截 BackHandler，Android 默认行为直接把 Activity 退到桌面，首张 04 图（3,114,637 B）拍到的是手机桌面，证据无效；已改用屏内「← 返回」（nav.goBack）回主页重拍并覆盖同名文件，桌面废图未保留。
2. 取证中途 USB **瞬断一次**（adb 报 `device not found`），导致 `adb reverse` 被清空、Metro LogBox 弹「Fast Refresh disconnected. Reload app to reconnect.」（warn.png）；重连后重建 `reverse tcp:8081`（实测 `UsbFfs tcp:8081 tcp:8081`），后续冷启 bundle 正常，无红屏。
3. G9-2 首次选「滑动窗口保留轮数」10→11 做持久化项，冷启后回 10。查代码 [GeneralTab.js:13-14](rn/screens/settings/GeneralTab.js) 注释与 :79-82 `save()` 确认：**外观三件（主题/字号档/字体）即时生效入库，其余字段本地暂存、必须点「保存」按钮才一次写全**——未按保存回退是设计行为，不是持久化 bug。该次截图留档 `G9-2-counter-unsaved.png`（208,756 B / 13:23:44 / 21AEF296F757682EDEAE3865307A468B），正式改测见下条。

### 5. G9-1 / G9-3：长按报头进 __boot（`input swipe 297 168 297 168 800`，报头 bounds=[48,145][547,191]）

| 文件 | 字节数 | 时间 | MD5 | 判词 |
|---|---:|---|---|---|
| G9-1-boot-selfcheck.png | 286,853 | 09-28 13:18:17 | 8F6CE42CD0AB233F6B1812DEE59F4CEE | **G9-1 PASS / G9-3 PASS**：屏内原文「引擎就绪 · Bootstrap」「启动全集 44 模块 · globalThis 挂载自检（战役 2·2-5）」「**BOOTSTRAP: 44 ok, 0 failed**」「total = 44 · ok = 44 · failed = 0」「全部 44 模块挂载成功，globalThis 引导链就绪。」；下接「Platform RN 实装自检（2-5）」「合并标记 = 2-5 · 五组 7/7 · ui 21/21 · window同对象=true」，✓http / ✓dialog.alert / ✓dialog.confirm / ✓lifecycle.onForeground / ✓onBackground / ✓onPageHide / ✓image.compressFile |
| G9-1-boot-selfcheck-2.png | 349,013 | 09-28 13:19:01 | FF4289F8D27B5D85F2E16174842B08E8 | ui\* 21 接口（typeof === function）全列（toast … clearStory / openShop）；Theme tokens 自检：colors 键数=52（43 语义+11 编辑风别名）、bg=#f5f3ee text=#2a2a2a accent=#5D5113、fontSizes base=13 xs=10 sm=11.5 lg=16 xl=20（fs-scale=1）、radius 0/2/6/8、**fonts sans=sans-serif serif=serif kai=serif mono=monospace**、background image=null opacity=1 editorial radius=2 blur=0 grain=0 bodyLh=1.85 |

logcat 原行（冷启时刻，`adb logcat -d -s ReactNativeJS:V`；完整落 g9_shots/g9_logcat_bootstrap.log，611 B / MD5 FC8CEA6AE413B8B85536253D7F1B5DB8）：
```
09-28 13:10:55.505 12581 16319 I ReactNativeJS: RN_PLATFORM: merged tag=2-5
09-28 13:10:55.531 12581 16319 I ReactNativeJS: BOOTSTRAP: 44 ok, 0 failed
09-28 13:10:55.531 12581 16319 I ReactNativeJS: RN_PLATFORM_CHECK: tag=2-5 http=fn alert=fn confirm=fn fg=fn bg=fn hide=fn compress=fn uiToast=fn uiOpenShop=fn sameWindow=true
09-28 13:10:55.533 12581 16319 I ReactNativeJS: Running "HippocampusRN" with {"rootTag":1,"initialProps":{},"fabric":true}
```
G9-2 冷启后 13:29:14 再次打印同一组三行（g9_shots/g9_logcat_after_restart.log，486 B / MD5 C484731AEC6D7EAF59456CAE4A44B51B）：
```
09-28 13:29:14.057 16266 18507 I ReactNativeJS: RN_PLATFORM: merged tag=2-5
09-28 13:29:14.093 16266 18507 I ReactNativeJS: BOOTSTRAP: 44 ok, 0 failed
09-28 13:29:14.093 16266 18507 I ReactNativeJS: RN_PLATFORM_CHECK: tag=2-5 http=fn alert=fn confirm=fn fg=fn bg=fn hide=fn compress=fn uiToast=fn uiOpenShop=fn sameWindow=true
09-28 13:29:14.095 16266 18507 I ReactNativeJS: Running "HippocampusRN" with {"rootTag":1,"initialProps":{},"fabric":true}
```
判定：G9-1 模块链路 PASS（44/44，两次冷启同值）；G9-3 平台桥 PASS（合并标记 2-5；http/dialog 2/lifecycle 3/image 1 共 7 项 fn；ui 21 项 fn；window 同对象）。`compress=fn` 仅证明 rn_platform 桥壳函数存在，与 G9-5 的真包垫片不冲突（桥壳在调用真包时才走不兼容路径）。

### 6. G9-2：设置持久化（外观三件即时入库路径，非计数器暂存路径）

| 文件 | 字节数 | 时间 | MD5 | 判词 |
|---|---:|---|---|---|
| G9-2-before.png | 164,070 | 09-28 13:28:47 | 0045051E518223C5EF4AFC4C50BAFF03 | 设置 03 通用外观区点字号「大」（fs-scale 1→1.15）后回主页：全页字号明显放大（标题/六行/元信息），即时生效 |
| G9-2-after-restart.png | 164,054 | 09-28 13:29:30 | 003C13C2D7F87E32048A2692356D4564 | `am force-stop` → 重挂 reverse → `am start` 冷启（18s 完整 bundle）后主页仍为大字号，与改前图同版（字节差 16 B 仅状态栏时钟），**持久化 PASS** |

设备侧库文件旁证（`run-as` 可用，debug 包，原行）：
```
PS> adb -s 34089226650035U shell run-as com.hippocampusrn ls -l databases
total 16
-rw------- 1 u0_a5 u0_a5 16384 2026-09-28 13:28 hippocampus_vfs.db
```
该 db mtime=13:28 与点「大」时刻一致；取证完点回「标准」后同命令再读 mtime=13:31（restore.png，138,677 B / MD5 B2EC3405BE96054563EE7C6E3D20CF62，「标准」chip 选中、字号复原），证明写路径可重复。设备当前已恢复标准档（fs-scale=1）。
reverse 原行：`UsbFfs tcp:8081 tcp:8081`。

### 7. G9-6：字体口径（Android 实测；iOS N/A）

| 文件 | 字节数 | 时间 | MD5 | 判词 |
|---|---:|---|---|---|
| G9-6-fonts.png | 141,454 | 09-28 13:26:34 | 88C6454E76F8EB6C2C23D923A1C797A5 | 设置 03「字体」卡：说明原文「界面字体用于按钮和标题，正文字体用于剧情。RN 侧使用离线系统栈。」；界面字体=系统默认；正文字体=系统衬线；同屏可见字号三档（小/标准/大） |
| G9-6-font-picker.png | 104,360 | 09-28 13:26:37 | 6876F2DE24590C78714897CE11CC7EF3 | 界面字体选择器仅 2 项：**•系统默认 / 思源黑体**——无楷体入口 |
| G9-6-serif-picker.png | 103,682 | 09-28 13:27:15 | 5DB2C46BBCBD4366ADE92C58EB8D4FB1 | 正文字体选择器 4 项：•系统衬线 / 霞鹜文楷 / 思源宋体 / 马善政毛笔楷（选项为双仓共享 Theme.FONT_OPTIONS；RN 端未内嵌 LXGW/马善政 webfont，按栈语义映射，非真字形） |

代码依据 `rn/theme_tokens.js:56-64` 直盘原文：
```
// CSS font stack → RN 单 fontFamily。
// RN fontFamily 不接受 CSS 通用族栈（'-apple-system, …'）与未内嵌的
// CDN webfont（Noto/LXGW/马善政），故按"栈语义 + 平台可用系统字体"映射；
// kai（楷体）Android 无系统楷体，降级 serif（阶段 0 已标注的视觉降级点）。
var SYSTEM_FONTS = {
  ios: { sans: 'System', serif: 'Georgia', kai: 'Kaiti SC', mono: 'Menlo' },
  android: { sans: 'sans-serif', serif: 'serif', kai: 'serif', mono: 'monospace' },
  default: { sans: 'sans-serif', serif: 'serif', kai: 'serif', mono: 'monospace' }
};
```
判定：**Android 无系统楷体，RN token 映射 kai 降级为 `'serif'`**（自检页 `fonts … kai=serif` 同文旁证）；**iOS 侧 `'Kaiti SC'` 记 N/A**（仓内无 iOS 构建链，全批口径）。

### 8. G9-4 / G9-5（不取图）

- **G9-4 商店浮层：未取证 · 阻塞＝卡带库为空（主页 03 行实测「0张在库」，目录空态「库里还没有卡带」）。** 商店浮层无卡可挂，本轮不允许造卡带/造数据，随 H2 卡带库实装后补证。
- **G9-5 背景图压缩链路：已知不兼容。** 真垫片 `node_modules/expo-image-manipulator/index.js`（504 B / MD5 EDF66D81DCF6C0B8F7EB0C19216E1E86）运行时 `throw new Error('expo-image-manipulator stub: 真包与 RN 0.87 不兼容（G9 探针）')`；根因 expo SDK 57 面向 RN 0.86，expo-asset 链路引用 RN 0.87 已移除的 @react-native/assets-registry（G9-boot-02 红屏实锤）。真解（摘依赖/替代压缩实现/release bundle 验证）排期**批次 E Phase 3–4**；垫片在 node_modules 内，`npm install` 即覆盖丢失。

【遗留/下一步】

1. **待开工指令**：H1 与 G9-Q1 证据链已闭环，候批复关账；批复后建议开 **H2**：04「管理卡带与导入」（卡带库/导入真功能）、05「存档管理」（全部存档）实装，届时 04/05 由 `View+actionDisabled` 换真 onPress；01/02 行同属后续批次（01 暂无存档、02 角色创建三步）。
2. G9-4 随 H2 卡带库有卡后补商店浮层真机图；G9-5 随批次 E Phase 3–4 真修后重验压缩链路与 release bundle。
3. iOS 侧（含 Kaiti SC 楷体）全批 N/A，无构建链。
4. 设备状态：app 在前台设置 03 页（字号已复原标准、界面/正文字体未改、主题纸白）；后台 Metro `--reset-cache` 仍在 8081 运行；USB 曾瞬断，reverse 已重建，后续长取证建议留意线缆。
5. 本轮全部新增写盘均在 `g9_shots/` 与两份报告内；证据总览可按本报告各表与 `g9_shots/` 目录逐文件对账（另有 rerun_\*_smoke.log 六份全量日志、两份 logcat 原行日志、u\*.xml 坐标 dump）。

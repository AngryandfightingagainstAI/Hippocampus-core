# 神秘小引擎（Hippocampus）

**一个在手机上玩的 AI 文字冒险。剧本、NPC、世界走向全由大模型当场编，存档和日志只留在你自己手机里。**

不需要服务器，不需要注册账号，不用等别人开服——你给它一张「卡带」（世界观 + 角色 + 规则），它让 AI 当主持人，你按选项或自己打字往下玩。

> 版本：1.3.1 ｜ Android 7.0+ ｜ Windows 桌面版 ｜ MIT 许可
> 手机版在本仓（`HippocampusRN`），桌面版是同一个引擎内核 + Electron 外壳。

**项目现状**：40 套 RN smoke 共 2625 条断言全绿；桌面版另有 14 项预检 + 65 套回归。

---

## 先看它长什么样

| 叙事页 | 侧栏（角色卡） |
|---|---|
| ![叙事页](docs/shots_p13/p13_50_topbar_unread1.png) | ![侧栏](docs/shots_p13/p13_51_sidebar_badge1.png) |

| 手机讯息面板 | 关掉再打开还能接着玩 |
|---|---|
| ![手机面板](docs/shots_p13/p13_52_panel_unread1.png) | ![续玩](docs/shots_p13/p13_41_after_continue.png) |

| 导入卡带 | 导入后先给你一份体检报告 |
|---|---|
| ![导入入口](docs/shots_p15/p15_import_section.png) | ![导入报告](docs/shots_p15/p15_inapp_report.png) |

---

## 三步开始玩

**1. 装到手机上**

👉 **[下载最新 APK](https://github.com/AngryandfightingagainstAI/Hippocampus-core/releases/latest)**

在 Release 页面下载最新那条里的 `HippocampusRN-<版本>-release-universal-<批次>.apk`，点开安装（第一次需要在系统里允许「安装未知来源应用」）。每个 Release 都写了版本号与 APK 的 SHA256，可以自己核对。

**2. 打开 App，先跑一把**

首屏自带一张「示例卡带」，直接点「新建存档」就能玩，不用准备任何东西。
想玩自己的世界：点「导入卡带」，把卡带 JSON 粘进去（或从文件选）。

**3. 接上 AI**

设置 → 🤖 AI：

- **有 API key**：填 Base URL / 模型名 / Key（OpenAI、DeepSeek、Gemini、通义、中转站、本地 Ollama 都行，只要是 OpenAI 兼容接口）。
- **没有 key / 不想花钱**：把「对话通道」切成 **外部 AI（手动复制 → 粘贴）**。这时 App 完全不联网——你把每轮的提示词复制出去，交给任意一个 AI（网页版、别的客户端都行），再把它的回复粘回来提交。

---

## 卡带是什么

一张卡带就是一个世界：世界观、NPC、属性、商店、结局都写在里面，本质是一个 JSON。

- **不想写**：把已有的设定文档（txt / md / docx / pdf / epub 等）丢进「导入文游资料」，引擎会解析成卡带草稿，再让 AI 补缺口，补完还要过一遍校验才允许入库。
- **会写**：直接写 JSON 粘贴导入；导入前引擎会先给你一份「卡带诊断」——缺哪个面板、哪个字段没填、哪条引用断了，都会列出来，`WARN` 也能强行导入。

---

## 常见问题

**要电脑吗？**
玩不用，一个 APK 就够。只有想自己改代码、自己打包 APK 才需要电脑。

**要不要花钱？**
软件本身 MIT 免费。AI 的钱是给模型商的：填自己的 key，按调用量付费。
一分钱都不想花也能玩——用「外部 AI」通道，把你已经在用的网页版 AI 的回复粘回来，App 这边不产生任何请求。

**存档在哪？会不会被上传？**
在手机本地的 SQLite 里（`hippocampus_vfs.db`），不上传，也没有账号。卸载或清数据会一起删掉，重要存档请用「数据」页导出备份。

**支持 iPhone 吗？**
暂不支持。原生模块（选文件等）只写了 Android 一侧，`ios/` 目前是模板脚手架。

**AI 会玩着玩着忘掉前面吗？**
引擎每回合会重新拼一份「状态快照」（数值、在场 NPC、时间、未读讯息、世界书命中项）给 AI，历史太长时会把旧对话压成「日志」，所以比普通 AI 聊天抗忘。但长局仍会有偏差，这不是无记忆问题的彻底解。

**AI 会不会乱改我的数值？**
所有世界改动只能通过受限制的工具调用（改数值、加物品、掷骰、查 NPC……）。而且从 1.3.x 起有状态守卫：某一轮工具全部失败却动了数值，引擎会自动回滚并告诉 AI「重来」。

**能玩多人 / 联机吗？**
不能。这是单人、纯本地的。

---

## 玩起来有什么

- **叙事**：流式回合制；选项按钮或自定义行动输入；`重新生成`（只重来最新一轮）、`回到这里`（回退到某轮快照）。
- **思考链**：模型返回的推理过程、联网搜索结果、token 用量，三块可分别开关。
- **骰子**：`1d100`、对抗检定、`/ra50` 这类简写，历史可查。
- **手机讯息**：AI 可以在剧情外给你发短信/广播，未读有红点；要不要让它进正文由你决定。
- **角色卡 / 侧栏**：属性、名声、关系、物品、世界书命中项一屏可见。
- **世界书**：世界观、NPC、种族、职业、技能、物品、商店、势力、货币、地图、时间线、产出物，共 12 个子编辑器。
- **设置十页**：AI / 搜索 / 通用 / 骰子 / 天气 / 实时 / 编辑器 / 世界书 / 数据 / GM。
- **主题**：纸白 / 流光 / 古卷，可导入主题包。

---

## 它是怎么做到「不像普通 AI 聊天」的（给好奇的人）

<details>
<summary>展开看实现要点</summary>

1. **每回合重建状态，而不是把历史一股脑塞进去**：HUD、侧栏、镜头内 NPC、未读讯息、产出物、世界书命中项打成结构化快照进提示词。
2. **旧对话自动压缩成日志**：跨天或累积到阈值时，用一次独立调用产出 `title/summary/entities/tags/unresolved`，原文留在本机，摘要回灌提示词。
3. **预算刹车**：估算超预算就 6 档逐级降级（保留最近 1 条 → 裁到 2 条 → 收敛查询 → … → 摘要降到 0），并在侧栏显示「已降级 N 档」。
4. **工具白名单**：AI 只能通过 `<<<TOOL>>>{...}<<<END>>>` 调用受限制的工具改世界，状态变更可回放、可审计。
5. **状态守卫**：工具执行前后各拍一次状态快照，本轮没有任何工具成功却改了数值 ⇒ 自动回滚并回喂 AI 重试。
6. **主体边界**：引擎级规则禁止 AI 替你写「想了什么 / 感受到什么 / 决定了什么」。

</details>

---

# 给开发者

> 下面都是从源码跑、打包、跑测试的内容，需要电脑（Node 22 / JDK 17 / Android SDK）。

## 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | ≥ 22.11（`package.json` engines） |
| JDK | 17（`JAVA_HOME` 指向 JDK 17） |
| Android SDK | `ANDROID_HOME` + platform-tools + build-tools |
| React Native CLI | 随 `@react-native-community/cli 20.2.0` 自带 |

JavaScript 引擎全在仓库里，**不需要额外下载模型或数据**。

## 安装依赖

```sh
npm install
```

## 开发模式运行（连真机 / 模拟器）

```sh
# 终端 1：起 Metro
npm start

# 终端 2：装到设备
npm run android
```

> 装 APK 到 vivo 等国产 ROM 时，请用 `adb install -r -i com.android.vending`，否则会被 `PackageInterceptActivity` 拦住。

## 打包 APK

```sh
cd android
./gradlew assembleRelease      # Windows: gradlew.bat assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`

> **签名口径（自 1.3.1 起）**：release 型用 `android/keystore/keystore.properties` 指向的正式 keystore 签名，
> 该凭据文件与 keystore 均不入仓。若凭据缺失（新克隆 / CI），构建会**回退 debug 签名**并在构建日志打 `WARN` ——
> 回退包仅供本地调试，**禁止上传 Release**（debug 证书是公开的，任何人都能伪造「同签名」更新包）。

`assets/index.android.bundle` 是 Hermes 字节码（Metro 打包产物），直接对 APK 搜中文搜不到，属正常现象。

> **产物只含一套 ABI**：`android/gradle.properties` 的 `reactNativeArchitectures` 决定带哪几套原生库，当前为 `arm64-v8a`。
> P54 实测同一份源码：四 ABI 全打 62,967,094 B，只留 `arm64-v8a` 后 22,005,657 B（其中原生库 14,578,360 B / 13 个 `.so`）。
> 要联调 x86 模拟器时把该行改回 `armeabi-v7a,arm64-v8a,x86,x86_64` 再打包。
> 历史归档件名里的 `-universal-` 是当时的口径，与当前这只包不符——认版本号和 SHA256，别认文件名。

## 跑测试

测试**不依赖真机**，全是 Node 跑的 smoke（少量用仓内 babel 做 JSX 语法校验）：

```sh
node tools/run_all_smokes.js        # 一键全跑（40 套）
node tools/run_unit_tests.js        # 单元测试（14 套 / 200 条）
```

当前基线：**40 套 / 2625 ok / 0 failed**（两仓同在的本机环境）。单仓口径：**2615 ok / 0 failed / `TOTAL_SKIP=20`**（`HIPPOCAMPUS_PC` 指向不存在目录时实测；总断言差 21 而 skip 记 20，是各套降级粒度不同导致的既有现象，以实测为准）。

CI（GitHub Actions，`.github/workflows/smoke.yml`）在**单仓**环境下跑同一套 `node tools/run_all_smokes.js`：CI 里看不到桌面仓，跨仓同源断言自动降级为 SKIP。降级只影响「另一仓是否可见」这类断言，不影响产品行为。

引擎本身也能离开 React Native 跑：`engine/` + `vfs/` 在纯 Node 下可加载（只有 `rn/export_util.js`、`rn/rn_platform.js`、`rn/use_theme.js` 三个文件 `require('react-native')`），因此可以做无头回合驱动测试。

`tests/unit/` 的 14 套单元测试用 `vm` 沙箱、零新依赖、秒级：`proposal_validator`（17 条）、`info_feed`（33 条）、`tool_executor`（18 条）、`outputs`（30 条）、`json_extract`（14 条）、`story_compress`（8 条）、`story_channel`（8 条）、`prompt_deduction`（5 条）、`snapshot_cut`（9 条）、`vfs_write_contract`（20 条）、`json_locate`（13 条）、`ui_proxy_cycle`（5 条）、`kdf_async`（8 条）、`p67_creation_quiz`（12 条）。它们**不进 smoke 基线**（跑批器只扫 `tools/*_smoke.js`），定位改动边界比 smoke 快，详见 `docs/CONVENTIONS.md` §4.4。

## 项目结构

```
HippocampusRN/
├── App.tsx                 路由根（home/story/settings/cards/saves/create/portrait/classify）
├── engine/                 引擎内核（与桌面版共用，无 RN 依赖）
│   ├── core/               gamestate / prompt_builder / tool_executor / api_client / storage / saves …
│   ├── story.js            StoryLoop（回合主循环）+ CreateFlow（创角流程）
│   ├── creation_quiz.js    开局问卷（分院/灯杖/守灯兽）确定性判卷
│   ├── state_guard.js      回合状态守卫（无工具成功却改数值 ⇒ 回滚）
│   ├── info_feed.js        剧情外信息层（手机）
│   ├── npc_runtime.js      NPC 运行时、知识来源
│   ├── snapshots.js        快照与回退
│   ├── import/             导入文游资料（22 种格式 → 中间格式 → 卡带草稿）
│   ├── worldbook / wb/     世界书数据层
│   └── …                   events / tasks / achievements / endings / shop / dice / weather / proposals …
├── vfs/                    存储抽象层
│   ├── vfs.js              路径化 KV（前缀 vfs:）
│   ├── storage_adapter.js  真机 op-sqlite / 兜底 localStorage
│   ├── saves.js            存档
│   └── logger.js           日志与压缩
├── rn/                     手机壳（React Native）
│   ├── screens/            StoryScreen / HomeScreen / SettingsScreen / CreateScreen …
│   │   └── settings/       十个设置页 + worldbook 的 12 个子编辑器
│   ├── components/         SidebarDrawer / PanelHost / ThinkingBlock / InfoPhonePanel …
│   ├── panels/             15 个面板 + panel_data.js
│   ├── rn_platform.js      引擎 → 平台桥（Platform.ui.*）
│   └── rn_bootstrap.js     按序加载 68 个引擎模块
├── tools/                  40 套 smoke 测试
└── docs/                   报告与真机截图
```

## 数据落在哪里

- 真机：SQLite 数据库 `hippocampus_vfs.db`，表 `kv(k, v)`，所有路径以 `vfs:` 为键前缀。
- 键结构示例：`vfs:/saves/<cardId>/<saveId>/{meta,player,npc_runtime,chat/index,...}.json`。
- 日志：`vfs:/saves/<cardId>/<saveId>/logs/<年>/<月>/W<周>/<日期>.json`，另有 `_week.json` 索引。
- **一切都在本机**。唯一的对外请求是你自己配置的模型 API 与（可选的）联网搜索。

## 接自己的 AI（详细）

设置 → 🤖 AI → 添加配置，填 `baseUrl` / `model` / `apiKey`：

- 兼容 OpenAI Chat Completions 格式的**任何**端点（官方、中转、本地 Ollama / llama.cpp / vLLM 都行）。
- 本地地址（`localhost` / `127.0.0.1` / `::1` / 内网段）**免 Key**。
- 支持 JSON mode；模型不支持时自动降级重试一次。
- 「最大输出」建议 ≥ 8192：思考模型会把 `reasoning_content` 和正文共用一个 completion 预算，调小了正文会被挤掉（引擎检测到空正文会直接提示你调高）。
- 可选填搜索 API，AI 就能用 `web_search` 工具。

### 两条通道的取舍（直连 / 外部 AI）

`engine/core/api_client.js` 保留「直连自己的模型」这条路，也是默认路径：提示词直接发给设置里那个端点，一轮一问，最省事，但你需要有 Key。

设置 → 🤖 AI → **对话通道** 里可以选 **外部 AI（手动复制 → 粘贴）**：App 不联网，先把整轮提示词用「复制提示词」交给任意 AI，再把回复粘回弹窗提交。代价是每轮多两步手动操作。

两条路走同一套 intake：粘贴回来的正文一样要过工具调用解析、状态校验与压缩归档，所以换通道不会让存档格式分叉。

## 已知限制

- **仅 Android 可用**：`android/` 完整可打包；`ios/` 是 RN 0.87.1 的模板脚手架，**从未 `pod install`**（无 `Podfile.lock` / `Pods/` / `.xcworkspace`），且「选文件」是 Android 专有原生模块（`android/app/src/main/java/com/hippocampusrn/FilePickerModule.kt`）。要上 iOS 得先补 iOS 侧 picker 原生模块，再做 pod 安装与真机验证。
- **信息层仍是概率性的**（25 分钟冷却 + 25%），所以「连着好些回合没有短信」是正常表现；只有**第一条**有触达保证。
- **农历节日不做**（每年日期不同，引擎暂不支持）。
- **导入文游资料**在手机版：文本类可以粘贴，也可以点「从文件导入…」走系统文件选择器；docx / odt / epub / PDF / ZIP 这类压缩包格式建议在桌面版导入后再导出卡带。
- **创角流程**、**结局触发**、**元层提议**已有自动化覆盖（`tools/create_flow_smoke.js` 120 条、`tools/endings_gate_smoke.js` 27 条、`tools/proposal_audit_smoke.js` 19 条），但真机人工验证仍是主要手段。
- 设置页「未保存就切 tab」目前只拦**涉及世界书的切换**；其他页之间切换不拦，因为那些页是即时生效的。

## 致谢与许可

- 引擎、桥接层与 UI 壳为本项目自研。
- 运行时依赖：React Native、`@op-engineering/op-sqlite`、`react-native-mmkv`、`react-native-image-picker`、`react-native-safe-area-context`。

> 本项目以 **MIT** 许可发布，全文见仓内 [`LICENSE`](LICENSE)。所引用的卡带素材（若有）请以各素材来源的授权为准。

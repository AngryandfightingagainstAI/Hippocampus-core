# 开发 / 打包 / 测试说明（HippocampusRN）

> README 只讲「玩家怎么用」。这份文件讲「想改代码、自己打包、跑测试」要做什么。
> 需要电脑：Node 22 / JDK 17 / Android SDK。

## 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | ≥ 22.11（`package.json` 的 `engines`） |
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

> 装 APK 到 vivo 等国产 ROM 时，系统会弹「安全守护」拦截页（`PackageInterceptActivity`）。
> 必须在设备上点「已了解应用的风险检测结果」→「继续安装」，否则 `adb install` 会一直挂着。

## 打包 APK

```sh
cd android
./gradlew assembleRelease      # Windows: gradlew.bat assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`

> **签名口径（自 1.3.1 起）**：release 型用 `android/keystore/keystore.properties` 指向的正式 keystore 签名，
> 该凭据文件与 keystore 均不入仓。若凭据缺失（新克隆 / CI），构建会**回退 debug 签名**并在构建日志打 `WARN` ——
> 回退包仅供本地调试，**禁止上传 Release**（debug 证书是公开的，任何人都能伪造「同签名」更新包）。
> 从 1.3.1 起还加了任务图守卫：只要本次构建带 `*Release` 任务而凭据缺失，会直接抛 `GradleException` 终止，
> 想临时放行用 `-PallowDebugSigning=true`。详见 `android/keystore-README.md`。

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

## 两个仓的关系

- 手机版在本仓（`HippocampusRN`），桌面版是**同一个引擎内核** + Electron 外壳。
- `engine/` 与 `vfs/` 大部分文件两仓同源，由 `tools/engine_sync.js` 守着一份登记册（`tools/engine_sync_manifest.json`）：
  `node tools/engine_sync.js --check`（守卫，漂移即退出码 1）、`--write`（把 canonical 推到另一侧）、`--regen`（重算登记册）、`--list`。
  canonical 是**手机仓**；比较一律先 CRLF→LF，所以行尾差异合法，BOM 差异不合法。
- 桌面仓路径可用 `HIPPOCAMPUS_PC` 覆盖（单仓环境里跨仓断言会自动 SKIP）。

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
│   ├── panels/             16 个面板 + panel_data.js
│   ├── rn_platform.js      引擎 → 平台桥（Platform.ui.*）
│   └── rn_bootstrap.js     按序加载 68 个引擎模块
├── tools/                  40 套 smoke 测试
└── docs/                   报告与真机截图（本文件、CONVENTIONS.md、RELEASE_NOTES_*.md）
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

## 实现要点（为什么它不像普通 AI 聊天）

1. **每回合重建状态，而不是把历史一股脑塞进去**：HUD、侧栏、镜头内 NPC、未读讯息、产出物、世界书命中项打成结构化快照进提示词。
2. **旧对话自动压缩成日志**：跨天或累积到阈值时，用一次独立调用产出 `title/summary/entities/tags/unresolved`，原文留在本机，摘要回灌提示词。
3. **预算刹车**：估算超预算就 6 档逐级降级（保留最近 1 条 → 裁到 2 条 → 收敛查询 → … → 摘要降到 0），并在侧栏显示「已降级 N 档」。
4. **工具白名单**：AI 只能通过 `<<<TOOL>>>{...}<<<END>>>` 调用受限制的工具改世界，状态变更可回放、可审计。
5. **状态守卫**：工具执行前后各拍一次状态快照，本轮没有任何工具成功却改了数值 ⇒ 自动回滚并回喂 AI 重试。
6. **主体边界**：引擎级规则禁止 AI 替你写「想了什么 / 感受到什么 / 决定了什么」。

## 安全相关

- 卡带备份默认会把 API Key 一起导出（明文），导出前会弹窗问你要不要带；选「取消」= 导出不含 Key 的版本。
- 桌面版的错误日志在写盘前会做脱敏（`sk-*`、`apiKey=`、`Authorization:` 等），避免「复制整份报告」把 Key 带出去。
- 桌面版 Electron 开了 `contextIsolation` / `sandbox` / 禁 `webview` / 导航与开窗白名单 / 权限白名单，并在 `index.html` 里带 CSP。
- 详细清单见桌面仓的 `安全排查报告.md` 与 `真机排查报告-生成卡带指令按键.md`。

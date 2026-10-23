# 发布说明与发布流程（docs/releases）

这个目录放**每个 Release 的说明原文**，也是 `tools/release_publish.js` 唯一认可的上传来源。

## 为什么要专门做一套

v1.3.3 那次 Release 的标题和正文在上传时被毁掉了：所有中文变成单个问号。GitHub 上至今能看到那行坏标题 —— `v1.3.3 - ` 后面一个字一个问号，原本的「问卷功能修复」已经无从辨认。
原因是当时的发布是手搓命令行——中文先经过 Windows 控制台（CP936/GBK）再转 ASCII，无法表示的字符被逐字替换成 `?`，损坏发生在**发出去之前**，GitHub 只是忠实保存了坏文本。

所以现在发布只走这一个入口，三道闸：

1. **说明写进文件**：`docs/releases/vX.Y.Z.md`，UTF-8 无 BOM，首行 `# 标题`，其余是正文。中文不经过任何 shell 参数。
2. **发前体检**（`check` 子命令）：出现 U+FFFD、连续问号、或「有中文却仍有孤立问号」一律拒发（行内代码里的单个 `?` 不算）。
3. **发后回读**（脚本内置）：PATCH/POST 之后再 GET 一次，逐字符比对 name/body，不一致直接报错——杜绝「以为发出去了」。

## 用法

```bash
# 1) 先体检（不发网络请求）
node tools/release_publish.js check docs/releases/v1.3.6.md

# 2) 更新一个已有 Release 的标题/正文（不动 tag、不动资产）
node tools/release_publish.js edit --tag v1.3.3 --notes docs/releases/v1.3.3.md

# 3) 新建 Release（tag 不存在时由 API 创建在 --target 指定的提交上）
node tools/release_publish.js create --tag v1.3.6 --notes docs/releases/v1.3.6.md --target main

# 4) 看一眼远端现在存的是什么
node tools/release_publish.js show --tag v1.3.6
```

加 `--dry-run` 只打印将要发送的标题与正文长度，不碰远端。

凭据：优先读环境变量 `GITHUB_TOKEN`；没有就调 `git credential fill`（只在内存里用，不落盘、不打印）。Windows 上 PATH 里没有 git 时，脚本会自动试 MinGit 的 `git.exe`，或用 `GIT_BIN` 指定。

## 自检

```bash
node tools/release_publish_smoke.js
```

覆盖：中文被吃成问号 / U+FFFD / 中文夹孤立问号都要拦下；正常中文与行内代码里的 `?` 不误报；`# 标题` 拆分；
以及**本目录每份 `.md` 都要过体检**——以后谁提交一份坏说明，smoke 直接红。

## 发一版的完整清单

1. 版本号三处一起改：`package.json`、`android/app/build.gradle`（`versionCode` 末位 +1）、`tools/version_sync_smoke.js` 的 `EXPECT_VERSION` / `MIN_VERSION_CODE`。
2. `node tools/version_sync_smoke.js`（手机/桌面两侧各跑一次）→ 全绿。
3. 构建 APK 与桌面安装包，记下 SHA256。
4. 写 `docs/releases/vX.Y.Z.md`（首行标题），`check` 通过。
5. `create`（或 `edit`）→ 回读比对通过。
6. 上传资产：`HippocampusRN-x.y.z-release.apk`、`Hippocampus-core-Setup-x.y.z.exe`、`SHA256SUMS.txt`。

## 已有说明

- `v1.3.3.md` — 开局问卷：自写答案不再被强行归类（2026-10-23 按提交 `139f8d4` 重写，原正文已在上传时损坏）。

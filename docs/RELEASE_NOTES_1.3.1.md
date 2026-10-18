# Release Notes · 1.3.1

签发：2026-10-17（P56 批次）

## 版本

| 项 | 值 |
|---|---|
| versionName | 1.3.1 |
| versionCode | 10301 |
| 桌面 `package.json` | 1.3.1 |
| 构建基线（手机） | `23cdefa`（含 P58/P59/P60/P61/P64·story.js 同源同步） |

## 变更摘要

1. **Android release 改正式签名**：自 1.3.1 起 release 型用 `android/keystore/keystore.properties` 指向的
   正式 keystore 签名（此前 release 沿用 `debug.keystore`，与公开 debug 证书同签名 ⇒ 任何人可伪造「同签名」更新包）。
   凭据缺失时回退 debug 签名并在构建日志打 `WARN`，**回退包禁止上传 Release**。
2. **part5 模板表头文案修正**：两仓「以下 5 个系统都是可选的」→「以下 9 个系统都是可选的」（表格实际条目为 9 条）。

## 产物与校验值

### Android APK

- 文件：`android/app/build/outputs/apk/release/app-release.apk`
- 大小：22,049,669 B
- SHA256：`E6DE967221EAED53A616D44507ABBBFB58E826FF04246DD8FEF0D6E46049C070`
- 签名证书 SHA-256 指纹：`1C:D4:96:04:E4:FD:B4:34:C0:C7:6A:79:FF:83:C7:00:B9:B3:78:B6:C6:5C:C8:6F:E7:5C:36:BE:A3:54:FF:F4`
- keystore alias：`hippocampus-release`；有效期 10000 天（2026-10-17 → 2054-03-04）；RSA 2048
- 验签：`apksigner verify --print-certs` 通过，证书主体 `CN=Hippocampus, OU=Hippocampus, O=Hippocampus, L=Unknown, ST=Unknown, C=CN`（**不再是 Android Debug**）

### 桌面安装包

- 文件：`dist/Hippocampus core Setup 1.3.1.exe`
- 大小：111,700,915 B
- sha512：`PYcb/ijzWtIaoDXRxIwVLLigVa+G9uXHiZt6HgS4YHa8HofUBxPUMJfvKdHsll8GcI6XB8jTN0ipIGYXjayLMA==`
  （取自 `dist/latest.yml`，`version: 1.3.1`，`releaseDate: 2026-10-18T07:16:17.247Z`）
- SHA256：`AE9394B5B4DB6AABB1C14A54474218E7BCD99764B3E3A84B38DD1EF779D940CA`
- 打包基线：桌面 `7f9da82`（含 P59 的 `window.UI = {}` 命名空间根修复、P61 同源信封异步 KDF、P64 报头时钟每回合刷新 + 诊断球在创角屏让位）

## 上传

本批次用 GitHub REST API（`POST /releases` + `POST /releases/{id}/assets`，凭据取自本机 `git credential fill`，不入仓）
创建 **v1.3.1** Release 并上传两份产物：

- `HippocampusRN-1.3.1-release.apk`（正式 keystore 签名，可直接覆盖 1.3.0 **仅当**其亦为同证书；debug 签名的旧包需卸载重装）
- `Hippocampus-core-Setup-1.3.1.exe`（NSIS 安装包，命名对齐 `dist/latest.yml` 以便自动更新识别）
- `SHA256SUMS.txt`（两份产物的 SHA256 清单）

## 凭据纪律

keystore 与 `keystore.properties` 不入仓（`.gitignore` 已排除 `android/keystore/`）；密码不出现在任何入仓文件与本说明中。

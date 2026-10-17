# Release Notes · 1.3.1

签发：2026-10-17（P56 批次）

## 版本

| 项 | 值 |
|---|---|
| versionName | 1.3.1 |
| versionCode | 10301 |
| 桌面 `package.json` | 1.3.1 |

## 变更摘要

1. **Android release 改正式签名**：自 1.3.1 起 release 型用 `android/keystore/keystore.properties` 指向的
   正式 keystore 签名（此前 release 沿用 `debug.keystore`，与公开 debug 证书同签名 ⇒ 任何人可伪造「同签名」更新包）。
   凭据缺失时回退 debug 签名并在构建日志打 `WARN`，**回退包禁止上传 Release**。
2. **part5 模板表头文案修正**：两仓「以下 5 个系统都是可选的」→「以下 9 个系统都是可选的」（表格实际条目为 9 条）。

## 产物与校验值

### Android APK

- 文件：`android/app/build/outputs/apk/release/app-release.apk`
- 大小：22,037,165 B
- SHA256：`399ABFB59B3183BDE768A1F1AC45C745E87D31144A50A3D5CA1B2F89D4140200`
- 签名证书 SHA-256 指纹：`1C:D4:96:04:E4:FD:B4:34:C0:C7:6A:79:FF:83:C7:00:B9:B3:78:B6:C6:5C:C8:6F:E7:5C:36:BE:A3:54:FF:F4`
- keystore alias：`hippocampus-release`；有效期 10000 天（2026-10-17 → 2054-03-04）；RSA 2048
- 验签：`apksigner verify --print-certs` 通过，证书主体 `CN=Hippocampus, OU=Hippocampus, O=Hippocampus, L=Unknown, ST=Unknown, C=CN`（**不再是 Android Debug**）

### 桌面安装包

- 文件：`dist/Hippocampus core Setup 1.3.1.exe`
- 大小：111,693,720 B
- sha512：`VnjIDsxDu/T3svGug5SZU+G62FQEJEWVHXoytlVMxrACJVjnsnOHjmYxPryAdQxHKT5i6gqBq8g/95bqLtHiwg==`
  （取自 `dist/latest.yml`，`version: 1.3.1`，`releaseDate: 2026-10-17T03:14:02.237Z`）

## 上传

**GitHub Release 上传 1.3.1 由用户手工完成**（本批次不碰 `gh` / 网页）。

## 凭据纪律

keystore 与 `keystore.properties` 不入仓（`.gitignore` 已排除 `android/keystore/`）；密码不出现在任何入仓文件与本说明中。

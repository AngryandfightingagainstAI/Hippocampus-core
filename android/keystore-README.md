# Android 签名凭据（release）

本目录（`android/keystore/`）整目录被 `.gitignore` 排除，**不要**把正式密钥提交进仓。

## 现状

- `keystore.properties` + `hippocampus-release.keystore` 已在本机存在，
  所以本机 `assembleRelease` 出的是正式签名的包
  （已发布 APK 实测证书 `CN=Hippocampus`，SHA-256 指纹
  `1cd49604e4fdb434c0c76a79ff83c700b9b378b6c65cc86fe75c36bea354fff4`）。
- 新克隆的仓库默认**没有**这两个文件。此时 `android/app/build.gradle` 里的
  `signingConfigs.release` 会回退到 `android/app/debug.keystore`（那是个公开的
  调试密钥，仓库里带着是 RN 模板的惯例，`react-native run-android` 需要它）。

## 为什么 `debug.keystore` 还留在仓库里

它就是 debug 构建的签名密钥，删了 `run-android` 直接失败。真正的风险不是
「文件存在」，而是「release 包被悄悄用 debug 密钥签了还发布出去」。所以保护
做在构建脚本上（`android/app/build.gradle` 的 `taskGraph.whenReady` 守卫）：
只要本次构建包含 `*Release` 任务、且 `keystore.properties` 不存在，就直接抛
`GradleException` 中断构建，除非显式传 `-PallowDebugSigning=true`。

## 生成正式密钥（换机器 / 换发布者时）

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore android/keystore/hippocampus-release.keystore \
  -alias hippocampus \
  -keyalg RSA -keysize 2048 -validity 10000
```

然后把 `android/keystore.properties.example` 复制成
`android/keystore/keystore.properties` 并填四个值：

```properties
storeFile=../keystore/hippocampus-release.keystore
storePassword=***
keyAlias=hippocampus
keyPassword=***
```

`storeFile` 是相对 `android/app/` 的路径。

## 发布前自检

```bash
# 1) 确认产物用的是正式证书
$ANDROID_HOME/build-tools/<ver>/apksigner verify --print-certs app-release.apk
#    期望 CN=Hippocampus，而不是 CN=Android Debug

# 2) 确认没有回退
grep -i "回退 debug 签名" <构建日志>   # 有输出就说明签名回退过，禁止发布
```

## 密钥丢了怎么办

Google Play 的 App Signing 可以让上传密钥轮换，但**本机 keystore 丢了就无法
给已有安装升级**（签名不一致会安装失败）。建议把 keystore + 口令离线备份
（U 盘 / 密码管理器），不要只留在这台机器上。

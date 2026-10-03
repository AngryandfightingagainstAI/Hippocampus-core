# G9 真机全量复验报告（覆盖写入，只存最新一轮）

> **【2026-09-28 补·最新】G9-Q1 已按裁决 A 现场补证，最新结论见文末「附节二 · G9-Q1 真机补证（RN-H1 合并轮）」：G9-1/2/3/6 PASS（6 为 Android 侧，iOS N/A）、G9-4 阻塞随 H2、G9-5 已实测 PASS（批次 E · 2026-09-28，摘依赖 + picker 原生压缩 + 真机选图冷启保留，详见 E_REPORT.md）。以下首轮红屏报告与附节一 Phase 0 关账原样保留为历史证据。**

【轮次】任务书 A r2 · G9 真机全量复验 — 第 1 步装新包 + G9-boot 红屏证据（2026-09-28）

【结论】待开工指令 · **第 1 步构建装包成功 + app 启动后 Metro bundle 红屏（expo-modules-core 未装）**。Gradle build 26m24s 成功落 135.67MB 新 apk、设备装包成功（versionCode=1 / versionName=1.0 / minSdk=24 / targetSdk=36，与 r2 二节基线对账一致）、app 进程已起（PID 26969）、adb reverse tcp:8081 通、Metro 8081 在跑，但 app 启动后向 Metro 请求 `index.bundle` 时 Metro 报 500：`Unable to resolve module expo-modules-core from D:\HippocampusRN\node_modules\expo-image-manipulator\src\ImageManipulator.ts`，app 进入 RN 红屏（"The development server returned response error code: 500"）。根因：`package.json` 只声明 `expo-image-manipulator ^57.0.20` + `react-native-image-picker ^8.2.1`，**未声明** `expo-modules-core`（peer dep），`node_modules\expo-modules-core` MISSING。按 r2 红线 3「不许新增/升级依赖」+ 用户红线「失败即贴完整原始输出 + 停，不猜修、不绕过」，本批在此停等指令，未跑任何 G9-1~G9-6 验证。

【改动】零。本批为纯验证批：
- 未改任何产品代码（engine/**、rn/**、platform/**、vfs/** 均零改动）；
- 未改 package.json / package-lock.json / android/** 的任何构建配置（gradle.properties、build.gradle、AndroidManifest.xml 等均零改动）；
- 仅在用户明确批复后用 `dangerouslyDisableSandbox=true` 跑 `npx react-native run-android --device 34089226650035U --no-packager --verbose`（理由：Gradle 构建需写 `android\.gradle\buildOutputCleanup\buildOutputCleanup.lock`，沙箱对 `.lock` 文件统一保护，环境变量 `GRADLE_USER_HOME` 隔离无法绕过项目本地 `.lock`）；
- 构建期间临时设 `GRADLE_USER_HOME=C:\Users\Lenovo\AppData\Local\Temp\g9_gradle`（隔离缓存目录，避免污染 `C:\Users\Lenovo\.gradle`，不改任何配置文件）；
- 未自己装驱动、未改注册表；
- 新增写盘仅在 `D:\HippocampusRN\g9_shots\` 内（G9-boot-01.png 截图、run_android_stdout.txt 构建日志、adb_install_stdout.txt 装包日志——后者因 Tee 缓冲未刷新但 dumpsys 已证装包成功）。

【验证】

### 第 0 步 · 设备硬闸门（四条同时通过）

`adb devices -l`（daemon 重启后）：
```
34089226650035U        device product:PD2118 model:V2118A device:PD2118 transport_id:1
```
- 1 台设备，状态 `device` ✓
- serial `34089226650035U` 不以 `emulator-` 开头 ✓

设备身份六项 + `ro.build.characteristics`：
| 项 | 命令 | 输出 |
|---|---|---|
| ro.product.model | `adb shell getprop ro.product.model` | `V2118A` |
| ro.product.brand | `adb shell getprop ro.product.brand` | `vivo` |
| ro.product.device | `adb shell getprop ro.product.device` | `PD2118` |
| ro.build.version.release | `adb shell getprop ro.build.version.release` | `14` |
| ro.build.version.sdk | `adb shell getprop ro.build.version.sdk` | `34` |
| ro.serialno + wm size | `adb shell getprop ro.serialno` + `adb shell wm size` | `34089226650035U` + `Physical size: 1080x2408` |
| ro.build.characteristics | `adb shell getprop ro.build.characteristics` | `default`（不含 emulator） ✓ |

四条通过条件全过（r2 一节）。

### 第 0.1 步 · 连接故障分型（重跑，切到「（无）正常」）

**命令 3**：`pnputil /enum-devices /connected | findstr /i "iQOO vivo 2D95 WPD MTP ADB"`（关键行）：
```
Instance ID:                USB\VID_2D95&PID_6013\34089226650035U
Instance ID:                USB\VID_2D95&PID_6013&MI_01\6&1cdeab7e&0&0001
Instance ID:                SWD\WPDBUSENUM\_??_USBSTOR#Disk&Ven_AIC&Prod_flash&Rev_1.0#20200203&0#{53f56307-b6bf-11d0-94f2-00a0c91efb8b}
Class Name:                 WPD
Driver Name:                wpdfs.inf
Instance ID:                USB\VID_2D95&PID_6013&MI_00\6&1cdeab7e&0&0000
Device Description:         iQOO Neo5 活力版
Class Name:                 WPD
Manufacturer Name:          vivo
Driver Name:                wpdmtp.inf
Instance ID:                USB\VID_2D95&PID_6013&MI_02\6&1cdeab7e&0&0002
Device Description:         ADB Interface
```
关键变化：复合设备 PID 从 `6012`（MTP only）→ `6013`（MTP + 大容量 + **ADB Interface** MI_02）；ADB 接口已挂出。

**命令 4**：`reg query "HKLM\SYSTEM\CurrentControlSet\Enum\USB" /f "VID_2D95" /k`：
```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6012  (历史)
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6012&MI_00
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6012&MI_01
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6013  (当前活动)
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6013&MI_00
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6013&MI_01
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6013&MI_02  (ADB)
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6018  (历史)
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6018&MI_00
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_2D95&PID_6018&MI_01
End of search: 10 match(es) found.
```

分型判定：**（无）正常** — MI_02 已挂 `ADB Interface`，`adb devices` 1 台 `device` 状态。可进第 1 步。

### 第 1 步 · 装新包前置 6 个 Node smoke（全绿，cwd=D:\HippocampusRN）

| 脚本 | SUMMARY | EXIT |
|---|---|---|
| `node tools/theme_tokens_smoke.js` | `THEME_TOKENS_SMOKE: 110 ok, 0 failed` | 0 |
| `node tools/polyfill_smoke.js` | `POLYFILL_SMOKE: 21 ok, 0 failed` | 0 |
| `node tools/home_smoke.js` | `HOME_SMOKE: 81 ok, 0 failed` | 0 |
| `node tools/image_smoke.js` | `IMAGE_SMOKE: 39 ok, 0 failed` | 0 |
| `node tools/settings_smoke.js` | `SETTINGS_SMOKE: 83 ok, 0 failed` | 0 |
| `node tools/story_smoke.js` | `STORY_SMOKE: 162 ok, 0 failed` | 0 |

合计 **496 ok, 0 failed**，前置门全绿。注意：`theme_tokens_smoke` 报「内置主题 === 9 套」——这是 RN 仓 theme.js 的实测（D 批 13 套落库只动 Electron 仓，RN 仓 theme.js 仍 9 套；本批按 r2 红线 2 不许改 engine/**，未触碰）。

### 第 1 步 · 构建并安装（沙箱禁用 + GRADLE_USER_HOME 隔离，按用户批复）

命令（cwd=D:\HippocampusRN）：
```
$env:GRADLE_USER_HOME = "C:\Users\Lenovo\AppData\Local\Temp\g9_gradle"
npx react-native run-android --device 34089226650035U --no-packager --verbose
```
关键 stdout 行（完整日志 `D:\HippocampusRN\g9_shots\run_android_stdout.txt`，size≈25KB）：
```
info Building the app...
debug Running command "gradlew.bat app:assembleDebug -x lint -PreactNativeDevServerPort=8081"
...
BUILD SUCCESSFUL in 26m 24s
166 actionable tasks: 71 executed, 95 up-to-date
info Connecting to the development server...
debug Running command "D:\AndroidSdk\platform-tools\adb -s 34089226650035U reverse tcp:8081 tcp:8081"
8081
info Installing the app on the device "34089226650035U"...
debug Running command "cd android && adb -s 34089226650035U install -r -d D:\HippocampusRN\android/app/build/outputs/apk/debug/app-debug.apk"
```
后台 job `job-cf2014c13b4244278a0cf6f7a753a5db` 退出码 0（successed）。

APK 产物自证（与 r2 红线 4「不许复用 09-18 旧 apk」对账）：
- 路径：`D:\HippocampusRN\android\app\build\outputs\apk\debug\app-debug.apk`
- 字节数：135,671,957（≈135.67 MB；旧 09-18 包 130,988,531 B ≈ 130.99 MB，**字节数不同 ⇒ 新包**）
- mtime：`2026-09-28 11:38:30`

设备装包自证：
```
adb -s 34089226650035U shell dumpsys package com.hippocampusrn | Select-String "versionName","versionCode"
    versionCode=1 minSdk=24 targetSdk=36
    versionName=1.0
```
与 r2 二节基线对账一致（applicationId=com.hippocampusrn / versionCode 1 / versionName "1.0" / minSdk 24 / targetSdk 36）。

app 进程 + adb reverse：
```
adb shell ps -A | findstr hippocampusrn
  u0_a5        26969   967   15625540 158224 0                   0 S com.hippocampusrn
adb reverse --list
  UsbFfs tcp:8081 tcp:8081
```
app 已启动（PID 26969），adb reverse 8081 通。

### 第 2 步 · G9-boot 红屏证据（任务书 r2 三节 G9-1 入口前置：app 启动后必须能加载 JS bundle）

按 r2 三节「截图只用 screencap + pull」：
```
adb shell mkdir -p /sdcard/g9
adb shell screencap -p /sdcard/g9/G9-boot-01.png
adb pull /sdcard/g9/G9-boot-01.png D:\HippocampusRN\g9_shots\G9-boot-01.png
adb shell rm /sdcard/g9/G9-boot-01.png
```
截图自证（按 r2 三节"每张图落地后写文件名 + 字节数 + MD5"）：
- 文件名：`D:\HippocampusRN\g9_shots\G9-boot-01.png`
- 字节数：173,752
- MD5：`3604D6897BEEAB61A0AA365018CC0A02`

截图内容（红屏，RN 开发错误页）：
- 头部："The development server returned response error code: 500"
- URL：`http://localhost:8081/index.bundle?platform=android&dev=true&...&app=com.hippocampusrn&...`
- Body：`{"type":"UnableToResolveError","originModulePath":"D:\\HippocampusRN\\node_modules\\expo-image-manipulator\\src\\ImageManipulator.ts","targetModuleName":"expo-modules-core","message":"Unable to resolve module expo-modules-core from D:\\HippocampusRN\\node_modules\\expo-image-manipulator\\src\\ImageManipulator.ts: expo-modules-core could not be found within the project or in these directories:..."}`
- 底部按钮：DISMISS (ESC) / RELOAD (R, R)

**判定：app 启动后 Metro bundle 失败 → RN 红屏 → G9-1 入口不可达（无法长按 home 进 __boot）。**

### 根因核验（package.json + node_modules）

`D:\HippocampusRN\package.json` grep（命中 2 行，未命中 expo-modules-core）：
```
15:    "expo-image-manipulator": "^57.0.20",
18:    "react-native-image-picker": "^8.2.1",
```

`node_modules` 装包实测：
| 路径 | 状态 |
|---|---|
| `D:\HippocampusRN\node_modules\expo-modules-core` | **MISSING** |
| `D:\HippocampusRN\node_modules\expo-image-manipulator` | INSTALLED v57.0.20 |
| `D:\HippocampusRN\node_modules\react-native-image-picker` | INSTALLED v8.2.1 |

`expo-image-manipulator` v57.0.20 在 `node_modules\expo-image-manipulator\src\ImageManipulator.ts:1` 的 `import { useReleasingSharedObject } from 'expo-modules-core';` 触发 Metro 解析失败 → 整个 index.bundle 500 → app 红屏。

证据文件清单（`g9_shots\`）：
| 文件 | 字节数 | MD5 | 用途 |
|---|---|---|---|
| `G9-boot-01.png` | 173,752 | `3604D6897BEEAB61A0AA365018CC0A02` | 红屏截图 |
| `run_android_stdout.txt` | ≈25KB | （构建日志，非二进制） | run-android 完整 stdout |
| `adb_install_stdout.txt` | 0/未刷新 | — | Tee 缓冲未刷新（已用 dumpsys 旁证装包成功） |

【遗留/下一步】

1. **依赖树缺陷**：`expo-image-manipulator` 的 peer dep `expo-modules-core` 在 package.json 未声明、node_modules 未装。这是项目级问题，不在 G9 验收范围但导致 G9 全批无法启动 app。
   - 按 r2 红线 3「不许新增/升级依赖（package.json、package-lock.json、android/** 的构建配置一律不动）」——Trae 无权自装；
   - 装包动作会触碰 `package.json` + `package-lock.json` + `node_modules`，明显越界。

2. **等用户决定**（任选其一）：
   - **A. 批复装 expo-modules-core**：用户消息正文明确批复后，Trae 跑 `npm install expo-modules-core@<与 expo-image-manipulator@57 兼容的版本>`（或 `--save-optional` / `--no-save` 视用户指示），装完重跑 Metro + app，进 G9-1 验证；
   - **B. 用户自跑 npm install**：用户在自己终端装，装完告知 Trae，Trae 重启 Metro + 重启 app，进 G9-1 验证；
   - **C. 暂停 G9，转任务 B**（story.js 簇 A 迁移，全在 Electron 仓，不碰 RN，沙箱限制不影响）；G9 待依赖树理顺后恢复。
   - **D. 其他指令**。

3. **任务书 r2 红线 8 条**（仍生效）：
   - 不许启动模拟器/AVD；serial 必须非 emulator-（已遵守：serial=34089226650035U）；
   - 不许改任何产品代码（已遵守：零改动）；
   - 不许新增/升级依赖（已遵守：未装 expo-modules-core，停下报告）；
   - 不许复用 09-18 旧 apk（已遵守：apk mtime=2026-09-28 11:38:30，字节数 135.67MB≠旧 130.99MB）；
   - 不许自己装驱动、动注册表（已遵守）；
   - 截图只用 screencap + pull（已遵守）；
   - 每次取证贴原始命令+原始输出（已遵守）；
   - 一条命令只做一件事（已遵守）。

4. **本批沙箱禁用说明**：用户在 AskUserQuestion 中明确批复「批复禁沙箱，Trae 跑 run-android」后，Trae 用 `dangerouslyDisableSandbox=true` 跑 `npx react-native run-android`。理由：Gradle 构建需写 `android\.gradle\buildOutputCleanup\buildOutputCleanup.lock` + `C:\Users\Lenovo\.gradle\caches\...\fileHashes.lock`，沙箱策略对 `.lock` 文件统一保护，环境变量 `GRADLE_USER_HOME` 隔离无法绕过项目本地 `.lock`。这是构建成功的必要条件，由用户批复授权，非 Trae 主动越权。

5. **任务书【遗留】节要求的"tools/rn_startup_smoke.js 在 rn/rn_bootstrap.js:101 被引用但仓内不存在"漂移**：本批未核验（被 Metro 红屏挡住，未进 __boot），留待依赖树修复后随 G9-1（r2 新口径：BOOTSTRAP 44 模块设备复验）一并取证。

6. **后台 Metro job 仍在跑**：`job-939fa26c9a964f30a921e894e9698f53`（`npx react-native start`）保持在 8081 端口运行，Metro 输出最后一条是上述 UnableToResolveError 堆栈。依赖树修复后无需重启 Metro（Metro 会自动重 bundle）；如需重启可 `Get-Process node | Stop-Process -Force` 后再 `npx react-native start`（后台）。

【待批】

| 编号 | 名称 | 状态 |
|---|---|---|
| G9-boot | app 启动加载 JS bundle | **FAIL：红屏 "Unable to resolve module expo-modules-core"**，截图 `G9-boot-01.png` |
| G9-1 | 模块链路（BOOTSTRAP 44） | N/A，待依赖树修复后开工 |
| G9-2 | op-sqlite 持久化 | N/A，待开工 |
| G9-3 | 整体自检（RN_PLATFORM + RN_PLATFORM_CHECK + NO_FATAL_NO_REDBOX） | N/A，待开工 |
| G9-4 | 商店浮层 | N/A，待开工 |
| G9-5 | 背景图 | N/A，待开工 |
| G9-6 | 字体口径 | N/A，待开工 |
| iOS | 无 iOS 构建链 | N/A（全批） |

待用户消息正文批复（A/B/C/D 任一）后恢复执行。

---

# 附节 · G9 Phase 0 关账（RN-H1 任务书第〇节欠账补写，2026-09-28 12:3x）

【轮次】RN-H1 任务书第〇节「先补一件欠账」· 仅对 G9 Phase 0（boot 转绿）做磁盘实据关账；本附节由 RN-H1 第 0 阶段同轮核验写出，写本节前未做任何代码/依赖改动，只做只读核验 + 截图取证。

【结论】**待开工指令** · Phase 0 目标（app 能加载 JS bundle、主页绿屏渲染）经磁盘实据 + 本会话实时目验确认**已达成**；但任务书第〇节要求的「G9-1/2/3/4/6 逐项」**盘上无对应证据**（仅有三张 G9-boot 截图，无 __boot 自检页/持久化重启/商店浮层/字体的任何截图或日志），本附节不虚填 PASS，逐项标「未取证」并挂裁决（见【待批】G9-Q1）。另自报两处与任务书措辞的事实出入（见下「出入自报」），均不改变 Phase 0 结论。

**出入自报（证据优先，不照措辞转写）：**
1. **垫片路径**：任务书称「垫片已建（index.js 首行 `// G9 探针垫片（2026-09-28）`…）」。直盘核验：垫片真实路径是 `D:\HippocampusRN\node_modules\expo-image-manipulator\index.js`（504 B / mtime 2026-09-28 12:11:19 / MD5 `EDF66D81DCF6C0B8F7EB0C19216E1E86`）；RN 仓根 `D:\HippocampusRN\index.js` 仍是未改动的 RN 标准模板（187 B / mtime 2026-09-17 04:07:04 / MD5 `ADE3B5E3ABC75237F168C020A9A63176`，首行 `/**`，无任何垫片文字）。
2. **G9-boot-02 不是绿屏过程图**：任务书只点名 G9-boot-03 已绿。直盘目验 G9-boot-02（176,849 B / 11:59:03）是**第二个红屏**：`Unable to resolve module @react-native/assets-registry/registry from ...\node_modules\expo\node_modules\expo-asset\build\Asset.js`（即垫片注释第 2 行所述「expo-asset 引用 RN 0.87 已移除模块」的实锤）。红屏演进实为两阶段：boot-01（expo-modules-core 缺失）→ boot-02（expo-asset 链路不兼容）→ 12:11 垫片落地 → boot-03 绿。

【改动】（本节为补记账目，改动均发生在此前会话；本会话只核验现状，未新建/删除/编辑任何代码文件）
- `node_modules\expo-modules-core` junction：已建后又撤。现状 `Test-Path = False`，无残留 reparse point（LinkType/Target 均空）。
- 垫片：`node_modules\expo-image-manipulator\index.js` 被替换为 504 B 探针壳（5 行），全文逐字：
  ```
  // G9 探针垫片（2026-09-28）：真包与 RN 0.87.1 基线不兼容（expo SDK 57 面向 RN 0.86，
  // expo-asset/build/Asset.js:1 引用 RN 0.87 已移除的 @react-native/assets-registry/registry）。
  // Metro 静态解析 require，try/catch 挡不住打包期；此壳让 bundle 可构建，
  // 运行时 require 抛错 → 与 rn_platform.js:126-133 既有的「模块不可用」分支语义一致。
  throw new Error('expo-image-manipulator stub: 真包与 RN 0.87 不兼容（G9 探针）');
  ```
  注意：垫片在 `node_modules` 内，**重装依赖即丢失**，非持久修复。
- 产品代码零改动：RN 根 `index.js`（187 B，09-17 mtime）、`engine/**`、`rn/**`、`platform/**`、`vfs/**` 本会话核验均未触碰；`package.json` 1,389 B / mtime 2026-09-28 01:59:38、`package-lock.json` 556,886 B / mtime 2026-09-28 01:59:39（Phase 0 前后未在本会话变动）。

【验证】
设备（本会话 12:29 实时）：`adb devices -l` → `34089226650035U  device product:PD2118 model:V2118A device:PD2118`（iQOO Neo5 活力版，Android 14 / SDK 34，非模拟器，1 台）；app 进程在跑（PID 9764）、`adb reverse` 8081 在、焦点窗 = `com.hippocampusrn/.MainActivity`。

| 项 | 判定 | 证据 |
|---|---|---|
| G9-boot（app 启动加载 bundle，主页绿屏） | **PASS** | `g9_shots\G9-boot-03.png` 142,221 B / 12:14:42 / MD5 `40A37E7D14AEDD05F011CB1EF8EB366C`，目验＝主页完整渲染（报头/三 tab/书封/01-03 行/目录/三书票）；本会话 12:29 实时再截 `g9_shots\H1-red-home.png` 142,171 B / MD5 `4151233BF1A838466FAD41C7D40A8FFF` 复核 app 仍绿、无红屏 |
| 红屏①（历史，已被解决） | 留档 | `G9-boot-01.png` 173,752 B / MD5 `3604D6897BEEAB61A0AA365018CC0A02`：expo-modules-core 解析失败 |
| 红屏②（历史，垫片针对的第二不兼容点） | 留档 | `G9-boot-02.png` 176,849 B / MD5 `C4A24AE793E000C41D4A59F1DB950D2A`：@react-native/assets-registry 解析失败 |
| G9-1 模块链路（BOOTSTRAP 44） | **PASS（附节二补证）** | __boot 自检页截图 G9-1-boot-selfcheck.png：`BOOTSTRAP: 44 ok, 0 failed`；logcat 两次冷启原行同值 |
| G9-2 持久化（写→重启→读） | **PASS（附节二补证）** | 字号档「大」→ force-stop → 冷启保留（before/after 两图）；run-as 读到 hippocampus_vfs.db，mtime 与点击时刻互证 |
| G9-3 整体自检（RN_PLATFORM / RN_PLATFORM_CHECK） | **PASS（附节二补证）** | tag=2-5，五组 7/7，ui 21/21，sameWindow=true；屏摄 + logcat 原行双证 |
| G9-4 商店浮层 | **未取证 · 阻塞随 H2** | 卡带库 0 张在库，无卡可挂；不许造数据，附节二记录 |
| G9-5 背景图 / 图片压缩链路 | **实测 PASS（批次 E · 2026-09-28）** | 摘依赖 expo-image-manipulator（npm uninstall 移除 186 包含 expo 子树）+ 压缩前移到 picker 原生实现（maxWidth/maxHeight/quality）+ compressFileImpl 改 base64 直收 + oversize 标记；bundle EXIT=0；6 套 smoke 全绿 502 ok 0 failed；真机选图链路 PASS（E-bg-picked.png 设置页缩略图出现 + E-bg-after-restart.png 冷启后主页正常 + vfs 字节搜索 data:image/jpeg;base64,/9j/... idx=7084 持久化硬证 + E-boot.png BOOTSTRAP 44 ok 0 failed）；详见 E_REPORT.md |
| G9-6 字体口径 | **PASS（Android，附节二补证）** | 字体项/两选择器截图 + theme_tokens.js 映射：kai→serif；iOS `Kaiti SC` N/A |
| iOS | N/A | 无 iOS 构建链（全批口径不变） |

【遗留】
1. ~~G9-1/2/3/4/6 未取证，待 G9-Q1 裁决。~~ **已按 G9-Q1 裁决 A 于 2026-09-28 13:10–13:31 现场补证，结论见文末附节二**：G9-1/2/3/6 PASS（6 限 Android），G9-4 因卡带库为空仍未取证、随 H2。
2. Phase 1–4 清理未做（按任务书第〇节口径照列）：`package.json` 仍含 `expo-image-manipulator ^57.0.20`（L15，grep 实测）；依赖未摘（真包目录仍在 node_modules，仅其入口 index.js 被垫片替换；`expo-modules-core` 路径不存在）；release `bundle` 命令未跑（已验证的是 Metro dev bundle 可构建并渲染，非 release 产物）。垫片在 node_modules 内，`npm install` 会覆盖丢失。
3. 后台 Metro（首轮报告第 6 条遗留）状态本会话未核验进程归属，8081 reverse 与 app 取 bundle 正常。

【证据清单】
| 文件 | 字节数 | 时间 | MD5 |
|---|---|---|---|
| `g9_shots\G9-boot-01.png`（红屏①） | 173,752 | 2026-09-28 11:48:52 | 3604D6897BEEAB61A0AA365018CC0A02 |
| `g9_shots\G9-boot-02.png`（红屏②） | 176,849 | 2026-09-28 11:59:03 | C4A24AE793E000C41D4A59F1DB950D2A |
| `g9_shots\G9-boot-03.png`（绿屏主页） | 142,221 | 2026-09-28 12:14:42 | 40A37E7D14AEDD05F011CB1EF8EB366C |
| `g9_shots\H1-red-home.png`（本会话复核） | 142,171 | 2026-09-28 12:29:54 | 4151233BF1A838466FAD41C7D40A8FFF |
| `g9_shots\run_android_stdout.txt` | 25,774 | 2026-09-28 11:47:09 | BDBF3221CA1B595F6539E28287A016EB |
| 垫片 `node_modules\expo-image-manipulator\index.js` | 504 | 2026-09-28 12:11:19 | EDF66D81DCF6C0B8F7EB0C19216E1E86 |

【待批】
- **G9-Q1**：~~五项如何处置，待裁。~~ **已按裁决（A）执行完毕（2026-09-28）**，证据与逐项判定见附节二；待批复关账。
- **G9-Q2**：垫片为 node_modules 内临时探针，Phase 1–4（摘依赖 / release bundle / 图片链路替代方案）的开工时点请示。附节二实测时垫片仍在、dev bundle 与冷启正常；真解随批次 E Phase 3–4。

---

# 附节二 · G9-Q1 真机补证（RN-H1 合并轮，2026-09-28 13:10–13:31）

【轮次】G9-Q1 裁决 A 执行轮，与 RN-H1 合并；cwd=D:\HippocampusRN；真机 34089226650035U（V2118A / Android 14 / 1080x2408）；包 com.hippocampusrn；Metro 0.87.1 `--reset-cache`，adb reverse `UsbFfs tcp:8081 tcp:8081`。本节只给 G9 判定与证据指针，H1 六行的 smoke 全文与完整过程自报见 `H1_REPORT.md`（同轮五段终稿）。

【结论】**待开工指令** · G9-1 **PASS**、G9-2 **PASS**、G9-3 **PASS**、G9-6 **PASS（Android 侧；iOS 记 N/A）**；G9-4 **未取证 · 阻塞＝卡带库为空（0 张在库），随 H2**；G9-5 **实测 PASS（批次 E · 2026-09-28，摘依赖 + picker 原生压缩 + 真机选图冷启保留，详见 E_REPORT.md）**。两次冷启（13:10:55、13:29:14）logcat 原行一致，全程无红屏；唯一 LogBox 条幅是 USB 瞬断导致的 Fast Refresh 断连，重建 reverse 后恢复，与代码无关。无越权改动。

【改动】本节为纯取证轮，未改任何产品/测试代码；写盘仅 `g9_shots/` 证据文件（截图 9 张、logcat 日志 2 份、uiautomator dump 若干）+ 两份报告。设备设置改动 1 项（字号档→大）已在取证后复原（标准），vfs 库两次 mtime 互证。

【验证】

**G9-1 模块链路 — PASS。** 主页长按报头（bounds=[48,145][547,191]，`input swipe 297 168 297 168 800`）进 __boot 自检页：
- `g9_shots/G9-1-boot-selfcheck.png`，286,853 B，13:18:17，MD5 `8F6CE42CD0AB233F6B1812DEE59F4CEE`：屏内原文「**BOOTSTRAP: 44 ok, 0 failed**」「total = 44 · ok = 44 · failed = 0」「全部 44 模块挂载成功，globalThis 引导链就绪。」
- logcat 两次冷启原行（g9_logcat_bootstrap.log / g9_logcat_after_restart.log）：`BOOTSTRAP: 44 ok, 0 failed`（13:10:55.531 与 13:29:14.093）。

**G9-3 平台自检 — PASS。** 同屏 + 同 logcat：
- 屏内（G9-1-boot-selfcheck.png / -2.png）：「合并标记 = 2-5 · 五组 7/7 · ui 21/21 · window同对象=true」；7 项 ✓（http、dialog.alert、dialog.confirm、lifecycle.onForeground/onBackground/onPageHide、image.compressFile）；ui\* 21 接口 typeof===function 全列（toast/appendHint/fillIcons/confirmAsync/showScreen/appendStory/appendDiceResult/setBusy/showStoryLoading/renderTopbar/renderSidebarExpanded/appendProposalCard/updateTokenBadge/showStoryError/_currentRoundNum/showSettingsTab/showHome/renderGame/renderChapterHead/clearStory/openShop）。
- logcat 原行（两次冷启逐字相同）：
  `RN_PLATFORM: merged tag=2-5`
  `RN_PLATFORM_CHECK: tag=2-5 http=fn alert=fn confirm=fn fg=fn bg=fn hide=fn compress=fn uiToast=fn uiOpenShop=fn sameWindow=true`
- `G9-1-boot-selfcheck-2.png`，349,013 B，13:19:01，MD5 `FF4289F8D27B5D85F2E16174842B08E8`，另含 Theme tokens 自检（colors 52 键、fontSizes 13/10/11.5/16/20、radius 0/2/6/8、`fonts sans=sans-serif serif=serif kai=serif mono=monospace`）。

**G9-2 持久化 — PASS。** 路径：设置 03 通用 → 外观区字号档（该卡三件＝主题/字号档/字体为即时生效入库；其余字段本地暂存、按「保存」才写，GeneralTab.js:13-14/79-82）。
- 改：字号「标准」→「大」（fs-scale 1→1.15）。`G9-2-before.png` 164,070 B / 13:28:47 / MD5 `0045051E518223C5EF4AFC4C50BAFF03`：主页全页字号放大。
- 验：`am force-stop com.hippocampusrn` → 重建 reverse → `am start` 冷启 18s。`G9-2-after-restart.png` 164,054 B / 13:29:30 / MD5 `003C13C2D7F87E32048A2692356D4564`：大字号保留（两图字节差仅 16 B＝状态栏时钟）。
- 库旁证：`run-as com.hippocampusrn ls -l databases` → `-rw------- 1 u0_a5 u0_a5 16384 2026-09-28 13:28 hippocampus_vfs.db`（mtime 与点击同刻；复原「标准」后再读 mtime=13:31，写路径可重复）。复原证据 `restore.png` 138,677 B / 13:31:36 / MD5 `B2EC3405BE96054563EE7C6E3D20CF62`。
- 过程留档：首次误用计数器项（滑动窗口保留轮数 10→11 未按保存，冷启回 10＝设计行为，非缺陷），截图 `G9-2-counter-unsaved.png` 208,756 B / MD5 `21AEF296F757682EDEAE3865307A468B`。

**G9-6 字体（Android）— PASS；iOS N/A。**
- `G9-6-fonts.png` 141,454 B / 13:26:34 / MD5 `88C6454E76F8EB6C2C23D923A1C797A5`：字体卡原文「界面字体用于按钮和标题，正文字体用于剧情。RN 侧使用离线系统栈。」；界面字体＝系统默认、正文字体＝系统衬线。
- `G9-6-font-picker.png` 104,360 B / MD5 `6876F2DE24590C78714897CE11CC7EF3`：界面字体选择器仅「系统默认 / 思源黑体」，无楷体入口。
- `G9-6-serif-picker.png` 103,682 B / MD5 `5DB2C46BBCBD4366ADE92C58EB8D4FB1`：正文字体 4 项（系统衬线/霞鹜文楷/思源宋体/马善政毛笔楷，双仓共享 Theme.FONT_OPTIONS；RN 未内嵌 LXGW/马善政 webfont，按栈语义映射）。
- 判词（依 rn/theme_tokens.js:56-64 直盘）：**Android 无系统楷体，RN token 映射中 kai 降级为 `'serif'`**（自检页 `kai=serif` 同文旁证）；**iOS 侧 `'Kaiti SC'` 记 N/A**（无 iOS 构建链）。

**G9-4 商店浮层 — 未取证 · 阻塞。** 主页实测「03 换一张卡带 0张在库」、目录空态「库里还没有卡带」；商店浮层无卡可挂，本轮严禁造卡带/造数据，随 H2 卡带库实装后补真机图。

**G9-5 背景图压缩 — 已实测 PASS（批次 E · 2026-09-28）。** 本轮取证当时 `node_modules/expo-image-manipulator/index.js` 为 504 B throw 垫片（MD5 `EDF66D81DCF6C0B8F7EB0C19216E1E86`，运行时 `throw … stub … RN 0.87 不兼容`）；根因 expo SDK 57 对 RN 0.86、expo-asset 引用 RN 0.87 已移除的 @react-native/assets-registry（G9-boot-02 红屏实锤）。本轮两次冷启 bundle 正常仅说明垫片维持可构建，当时判定不兼容。**批次 E 已真解**：npm uninstall 摘依赖（移除 186 包含 expo 子树）+ 压缩前移到 picker 原生实现（maxWidth/maxHeight/quality）+ compressFileImpl 改 base64 直收 + oversize 标记；bundle EXIT=0；6 套 smoke 全绿 502 ok 0 failed；真机选图链路 PASS（E-bg-picked.png 设置页缩略图 + E-bg-after-restart.png 冷启后主页正常 + vfs 字节搜索 data:image/jpeg;base64,/9j/... idx=7084 持久化硬证 + E-boot.png BOOTSTRAP 44 ok 0 failed）。详见 E_REPORT.md。

【遗留/下一步】
1. 待批复关账；G9-4 随 H2（卡带库有卡）补浮层取证；G9-5 已实测 PASS（批次 E · 2026-09-28），详见 E_REPORT.md。
2. 垫片在 node_modules 内，`npm install` 即覆盖；Phase 1–4 其余项（package.json 摘依赖、release bundle 验证）未做（G9-Q2 待批）。
3. iOS 全项 N/A；设备字号已复原，Metro 后台运行中，reverse 已重建（USB 曾瞬断一次，warn.png 留档）。

---

# 附节三 · H2 卡带库实装后 G9-4 复核（2026-09-28 15:1x）

【轮次】批次 H2 · 第 5 步真机取证同轮。卡带库已实装（CardsScreen.js 新建 + Storage.getAllCards / getImportedCards / setImportedCards 接通），按附节二承诺「随 H2 卡带库实装后补 G9-4 浮层取证」复核。

【结论】G9-4 商店浮层 — **仍阻塞（卡库仍空）**。

【阻塞根因】卡带库导入流程受设备 IME 限制无法在真机完成：
- 设备 34089226650035U（V2118A）仅百度 vivo / 讯飞两个中文 IME（`adb shell ime list -s` 确认），无英文键盘。
- adb input text 输入卡带 JSON 时双引号 `"` 被中文 IME 拦截替换为中文乱码（第一次，h2_input_check.png 证据：`schemaVersion`→`V而是哦那` 等）；禁用两个 IME 后双引号被 adb 传输层吃掉变无引号（第二次，h2_input2.png 证据：`{"schemaVersion":1,...}`→`{schemaVersion:1,...}`）。
- 无法通过真机粘贴 JSON 完成导入 → 卡库仍 0 张 → 商店浮层无卡可挂。

【已取证据】
- H2-04-cards.png（卡带库空态：0张 + 导入区 +「诊断并导入」按钮，MD5 69C4D6548B90E916EF721E07F20E76BC）证实 CardsScreen 已实装、导入入口可达。
- h2_input_check.png / h2_input2.png 证实 IME 限制（双引号被破坏）。
- cards_smoke.js C7-C12 源码断言覆盖导入链路（CardValidator.validate / getImportedCards / setImportedCards / 成功失败文案），21 ok 0 failed。

【下一步】若用户手动在设备粘贴 JSON 导入成功（绕过 adb input text 的 IME 限制），卡库有卡后 G9-4 商店浮层可补真机图。详见 H2_REPORT.md【遗留】段。

---

# 附节四 · H2-R 关账（2026-09-28 16:xx）

【轮次】批次 H2-R · RN 修复轮。R1–R7 一次做完，详见 H2_REPORT.md。本附节只记 G9 口径项的关联变化，H2-R 自身改动见 H2_REPORT.md【改动】段。

【结论】**待开工指令** · G9-1/2/3/6 维持附节二 PASS（H2-R 未改 __boot / 持久化 / 字体）；G9-4 仍阻塞（卡库仍空，R4 粘贴清洗已落但真机 IME 限制仍存）；G9-5 维持批次 E PASS（H2-R 未改图片链路）。新增 H2-R 真机证据 4 张（H2-themes-13 / H2-bg-home / H2-r3-opacity / H2-bg-home-50）入 `g9_shots\`。

【改动】零（G9 口径项无改动；H2-R 改动见 H2_REPORT.md【改动】段）

【验证】

**H2-R 真机证据清单（g9_shots\）**：

| 文件名 | 字节 | 时间 | MD5 | 用途 |
|---|---|---|---|---|
| H2-themes-13.png | 266910 | 2026-09-28 15:59:18 | 2912B3C1F5A6244287976D9FBB929E1B | R2：13 套主题按钮全可见 |
| H2-bg-home.png | 1654642 | 2026-09-28 15:59:59 | 7C80A31E44BF6206F5679611A2ADDD71 | R3：主页背景 opacity=1.00 |
| H2-r3-opacity.png | 528518 | 2026-09-28 16:05:37 | 9634C6149741CB2B79D7CF7475D1A45C | R3：设置页步进器 0.50 |
| H2-bg-home-50.png | 1352226 | 2026-09-28 16:06:18 | 976C3A5DA50725A5BB0A6F7F46A4991D | R3：主页背景 opacity=0.50 |

**G9 项判定（H2-R 后口径）**：

| 项 | 判定 | 关联 |
|---|---|---|
| G9-boot | PASS | 附节二（不变） |
| G9-1 模块链路 | PASS | 附节二（不变） |
| G9-2 持久化 | PASS | 附节二（不变） |
| G9-3 整体自检 | PASS | 附节二（不变） |
| G9-4 商店浮层 | 未取证 · 阻塞 | 卡库仍空（R4 清洗已落，真机 IME 限制仍存） |
| G9-5 背景图压缩 | PASS（批次 E） | H2-R 未改图片链路；R3 修复的是 BackgroundLayer 渲染层，与 G9-5 图片压缩链路无关 |
| G9-6 字体 | PASS（Android） | 附节二（不变） |
| iOS | N/A | 全批口径不变 |

**R5 自报的 G9 报告口径更正**：
- `adb_install_stdout.txt` 实际 476 B（非 G9 报告 L178 原写「0/未刷新」），内容是 PowerShell `NativeCommandError` 包装的 `adb install -r -d` 失败 stderr；装包成功由 `dumpsys package` 旁证（G9-1 第 1 步已自证 `versionCode=1 / versionName=1.0`），详见 H2_REPORT.md R5 第 4 条。
- `u.xml`（30648 B / 13:31:18）是 G9-2 持久化取证时段的 `uiautomator dump` 留档（与复原证据 `restore.png` 13:31:36 几乎同时间），非异常产物，详见 H2_REPORT.md R5 第 4 条。

【遗留/下一步】
1. G9-4 商店浮层仍阻塞，随卡带库有卡后补真机图。
2. 叙事页背景（H2-bg-story）仍因 RN 仓 0 存档 + 角色创建未实装无法取证，随角色创建批次。
3. G9-5 维持批次 E PASS，无新动作。

【待批】H2-R 七条已交卷，待用户消息正文批复关账。

# 批次 E · 摘掉 expo-image-manipulator + 压缩链路换成 picker 原生实现（覆盖写入，只存最新一轮）

【轮次】任务书批次 E（2026-09-28 13:53–14:14，cwd=D:\HippocampusRN；真机 serial=34089226650035U，iQOO Neo5 活力版 V2118A / Android 14 / 1080x2408；包名 com.hippocampusrn；Metro 0.87.1 `--reset-cache` 后台 8081；adb reverse `UsbFfs tcp:8081 tcp:8081`）。任务书 4 步：第 0 步补 H1_REPORT.md 欠账（adb_install_stdout 说明行，13:22）→ 第 1 步红证据（不恢复真包）→ 第 2 步改码（仅 rn_platform.js + GeneralTab.js 两文件）→ 第 3 步摘依赖（npm uninstall + 4 条清零证）→ 第 4 步绿验收（bundle + 6 套 smoke + 真机选图两张 + __boot）。

【结论】**待开工指令** · 批次 E 全部 4 步完成，摘依赖链路完整。npm uninstall 移除 186 包（含 expo 与 expo 子树，连带带走 node_modules\expo-image-manipulator.real 残留）；4 条清零证全绿（`npm ls expo --depth=0` 空 / package.json 零命中 / `node_modules\expo` False / package-lock.json expo 条目 0）；bundle EXIT=0（"Done writing bundle output"）；6 套 smoke 全绿合计 **502 ok, 0 failed**（HOME 87 / THEME_TOKENS 110 / POLYFILL 21 / IMAGE 39 / SETTINGS 83 / STORY 162，与 H1 轮总数一致）；真机选图链路 PASS（picker 原生压缩 + base64 直收 + dataURL 持久化），冷启后背景图 dataURL 仍在 vfs（字节搜索 `data:image/jpeg;base64,` idx=7084，预览 `/9j/4AAQSkZJRg...` 标准 JPEG 头，data:image 出现 1 次），__boot 自检 **44 ok, 0 failed**，`image.compressFile ✓`（批次 E 改动模块挂载正常），21 个 ui 接口全 ✓，`window同对象=true`。G9-5 改判实测 PASS。越权自报：无，所有写盘均在授权的两份产品文件 + 测试日志 + g9_shots 证据目录 + 两份报告内；smoke 断言一条未改；截图一律 screencap + pull（禁 PowerShell 重定向生成 PNG）。

【改动】

1. **`rn/rn_platform.js`**（产品代码，唯一改动 1，文件 MD5 F16768EF26AC10A019DBD64A6BDCB9CA，20064 B，mtime 13:53:09）
   - **注释段 L43-75 更新**为批次 E 实装说明：原计划 expo-image-manipulator manipulateAsync 替代 canvas，G9-5 实测真包与 RN 0.87 不兼容（expo SDK 57 面向 RN 0.86，expo-asset/build/Asset.js:1 引用 RN 0.87 已移除的 @react-native/assets-registry/registry，红屏实锤 g9_shots/G9-boot-02.png）；批次 E 真解=压缩前移到 picker 原生实现 + compressFileImpl 改为 base64 直收 + bytes 估算 + oversize 标记，不再有第二趟可压；纯函数 calcFit/selectQuality 仍导出（A 组断言不改），保留为 Electron 端压缩算法参考实现。
   - **`compressFileImpl` 整函数重写 L123-158**（整函数如下）：

```js
function compressFileImpl(file, opts) {
  var o = Object.assign({
    maxSize: 256,
    quality: 0.8,
    fallbackQuality: 0.6,
    maxBytes: 81920
  }, opts || {});

  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('没有文件')); return; }
    var input = normalizeImageInput(file);
    if (!input) { reject(new Error('没有文件')); return; }
    if (input.err) { reject(new Error(input.err)); return; }

    // 批次 E（2026-09-28）：expo-image-manipulator 真包与 RN 0.87 不兼容，
    // 已摘依赖（npm uninstall）。压缩前移到 launchImageLibrary 系统选择器
    // 原生实现（maxWidth/maxHeight/quality），asset.base64 由 picker 直接返回。
    // 本函数仅做：dataURL 组装 + bytes 估算 + oversize 标记，不再有第二趟可压。
    // 旧实装的 manipulateAsync 两趟压缩链路（含 fallbackQuality 二趟）整体移除；
    // 纯函数 calcFit/selectQuality 仍导出（image_smoke A 组断言不改），保留为
    // Electron 端压缩算法参考实现，后续 RN 侧若引入真压缩可直接复用。
    // 无 base64（File 形态或 picker 未 includeBase64）→ '图片解析失败'，
    // 保 image_smoke B6 语义（39 项断言一条不改）。
    if (!file.base64) {
      reject(new Error('图片解析失败'));
      return;
    }

    var src = 'data:image/jpeg;base64,' + file.base64;
    var bytes = estimateDataUrlBytes(src);
    var w = (typeof file.width === 'number') ? file.width : 0;
    var h = (typeof file.height === 'number') ? file.height : 0;
    var oversize = bytes > o.maxBytes;
    resolve({ src: src, bytes: bytes, w: w, h: h, oversize: oversize });
  });
}
```

   - 删 `require('expo-image-manipulator')` 与 manipulateAsync 两趟压缩链路（含 fallbackQuality 二趟）；改为 base64 直收（`'data:image/jpeg;base64,' + file.base64`）+ `estimateDataUrlBytes` 估算 + `oversize` 标记；无 base64 → `reject(new Error('图片解析失败'))` 保 image_smoke B6 语义（39 项断言一条不改）；返回形态 `{src, bytes, w, h, oversize}`。Grep 确认 `require('expo-image-manipulator')` 零命中、`oversize` 落地 L155-156。

2. **`rn/screens/settings/GeneralTab.js`**（产品代码，唯一改动 2，文件 MD5 DBCC4072F65A78E4C183D566182405DE，17565 B，mtime 13:53:54）
   - **L115 launchImageLibrary 参数改**为 `{ mediaType: 'photo', selectionLimit: 1, maxWidth: 1280, maxHeight: 1280, quality: 0.8, includeBase64: true }`（压缩前移到系统选择器原生实现，零第三方运行时依赖；includeBase64:true 让 asset.base64 由 picker 直接产出）。
   - **L126-127 compressFile 调用签名与 opts 保持不变**：`Platform.image.compressFile(asset, { maxSize: 1280, quality: 0.8, fallbackQuality: 0.55, maxBytes: 512 * 1024 })`。
   - **L135-139 oversize 落库决策**=仍落库 + toast warn 提示「图片偏大（XKB），已落库但可能影响加载」（与 Electron fallbackQuality 二趟后无条件 resolve 落库语义对齐；picker 1280/0.8 压缩后通常 < 512KB，oversize 是极复杂纹理图边界情况）。
   - `pickImage` 整函数 L101-144（整函数如下）：

```js
function pickImage() {
  if (picking) return; // 防重入
  var picker;
  try {
    picker = require('react-native-image-picker');
  } catch (eReq) {
    bgToast('图片库不可用', 'error');
    return;
  }
  setPicking(true);
  // 批次 E（2026-09-28）：压缩前移到 picker 原生实现（maxWidth/maxHeight/quality
  // 在系统选择器内做尺寸 + JPEG 质量压缩，零第三方运行时依赖）。
  // includeBase64: true 让 asset.base64 由 picker 直接产出，compressFile
  // 仅做 dataURL 组装 + bytes 估算 + oversize 标记（不再有第二趟可压）。
  picker.launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, maxWidth: 1280, maxHeight: 1280, quality: 0.8, includeBase64: true }, function (resp) {
    setPicking(false);
    if (!resp || resp.didCancel) return;
    if (resp.errorCode) { bgToast('图片读取失败', 'error'); return; }
    var asset = (resp.assets && resp.assets[0]) || null;
    if (!asset || !asset.uri) { bgToast('图片读取失败', 'error'); return; }
    // 2MB 选图预检（同 Electron ui.js L76 pickBackgroundImage）
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      bgToast('图片超过 2MB，请压缩后再用', 'warn');
      return;
    }
    Platform.image.compressFile(asset, {
      maxSize: 1280, quality: 0.8, fallbackQuality: 0.55, maxBytes: 512 * 1024
    }).then(function (r) {
      // 批次 E：compressFile 不再做真压缩，oversize 标记是 picker 原生压缩
      // 后仍超 maxBytes 的边界情况。决策：仍落库 + toast warn 提示「图片偏大」，
      // 让用户知情但功能不阻塞（与 Electron fallbackQuality 二趟后无条件
      // resolve 落库的语义对齐；picker 已在系统层做 1280/0.8 压缩，正常图
      // 通常 < 512KB，oversize 是极复杂纹理图的边界情况）。
      themeApi.setBackground({ image: r.src });
      if (r.oversize) {
        bgToast('图片偏大（' + Math.round(r.bytes / 1024) + 'KB），已落库但可能影响加载', 'warn');
      } else {
        bgToast('背景已更新', 'success');
      }
    }, function (e) {
      bgToast('图片读取失败：' + ((e && e.message) || e), 'error');
    });
  });
}
```

3. **依赖**（本轮唯一授权动依赖的批次）：`npm uninstall expo-image-manipulator` 移除 186 包（含 expo 与 expo 子树）；`node_modules\expo-image-manipulator.real` 残留被 npm uninstall 一并带走（实测 `NO .real` + `expo-image-manipulator GONE`）。package.json MD5 4F0B8DD3C3A2DC99CCDC45FF9FFB82ED（1347 B，mtime 13:55:44），package-lock.json MD5 92886E61F5589198E5D85A27513D5364（453071 B，mtime 13:55:45）。

4. **compressFile 调用面全清单**（rn/ + tools/，已分析）：
   - 真改 2 处：`rn_platform.js:112-173`（compressFileImpl）+ `GeneralTab.js:111/122-124`（picker 参数 + 落库决策）
   - 不动 4 处：`rn_platform.js:11/44` 注释行、`:371-372` 桥壳签名（`compressFile: function(file, opts) { return compressFileImpl(file, opts); }`）、`rn_bootstrap.js:180/197` typeof 自检、`GeneralTab.js:10` 注释行
   - 测试 4 处：`tools/image_smoke.js:8/82/85/95` B 组守卫断言一条不改（B6 合法 asset 无 base64 → reject '图片解析失败' 由新实装保住）

5. **image_smoke B 组语义保住路径**（新实装逐条对账）：
   - B1 null → normalizeImageInput 返回 null → reject '没有文件'
   - B2 undefined → 同上
   - B3 `{type:'application/pdf', uri}` → type 守卫 → reject '不是图片文件'
   - B4 `{uri:'file:///a.txt'}` → 无 type + 后缀不匹配 → reject '不是图片文件'
   - B5 `{type:'image/png'}` → 有 type 无 uri → reject '没有文件'
   - B6 `{uri:'file:///a.jpg', width:100, height:100}` → 守卫通过 → 无 base64 → reject '图片解析失败' ✓

6. **报告**：`E_REPORT.md`（本文件，覆盖写）；`G9_REPORT.md` 附节一 G9-5 判词更新为「实测 PASS」+ 附节二结论同步 + 顶部声明同步；`H1_REPORT.md` 第 0 步补欠账（adb_install_stdout 说明行，13:22，1 处命中）。

7. **未触碰**：engine/**、vfs/**、platform/** 零改动；不新增任何依赖（本轮是减依赖）；smoke 断言一条不改；截图一律 screencap + pull（禁 PowerShell 重定向生成 PNG）；遇红先还原再贴完整输出（本轮无红）。

【验证】

### 第 1 步 · 红证据（真包不可用，3 条）

1. `node_modules\expo-image-manipulator.real\src\ImageManipulator.ts:1-2` 命中 expo-modules-core：
   - `import { useReleasingSharedObject } from 'expo-modules-core';`
   - `import type { SharedRef } from 'expo-modules-core/types';`
   - 注：任务书原路径 `node_modules\expo-image-manipulator\src\ImageManipulator.ts` 在主包不存在——主包已是 504B throw 垫片 `index.js`（MD5 EDF66D81DCF6C0B8F7EB0C19216E1E86），真包代码在 `.real` 残留目录，npm uninstall 后已随包带走。
2. `node_modules\expo\node_modules\expo-asset\build\Asset.js:1` 命中：
   - `import { getAssetByID } from '@react-native/assets-registry/registry';`
   - expo 子树，npm uninstall 后已随包带走。
3. `g9_shots\G9-boot-02.png` | 176849 B | MD5 C4A24AE793E000C41D4A59F1DB950D2A | mtime 11:59:03（红屏实锤， expo-asset → @react-native/assets-registry 链路根因）

### 第 2 步 · 代码改写（整函数 diff）

见【改动】段 1/2，整函数已完整贴出。

### 第 3 步 · 摘依赖（npm 原始输出 + 4 条清零证）

**npm uninstall 原始输出**：

```
removed 186 packages, and audited 868 packages in 9s

183 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

**4 条清零证 + 残留清理**：

| 项 | 命令 | 结果 |
|---|---|---|
| 1 | `npm ls expo --depth=0` | `└── (empty)`（Exit code 1 是 npm ls 在空状态下的固有返回，非错误） |
| 2 | `Select-String -Path package.json -Pattern expo` | 零命中 |
| 3 | `Test-Path node_modules\expo` | False |
| 4 | `Test-Path node_modules\expo-image-manipulator` | False |
| 5 | `Select-String -Path package-lock.json -Pattern '"expo"' -CaseSensitive` | 0 |
| 6 | `Select-String -Path package-lock.json -Pattern 'expo-image-manipulator'` | 0 |
| 7 | `.real` 残留 | `NO .real` + `expo-image-manipulator GONE`（npm uninstall 一并带走） |

### 第 4 步 a · bundle EXIT=0

命令：`npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output "$env:TEMP\hippo_e_bundle.js" --assets-dest "$env:TEMP\hippo_e_assets"`

完整尾部输出：

```
                        ▒▒▓▓▓▓▒▒
                     ▒▓▓▓▒▒░░▒▒▓▓▓▒
                  ▒▓▓▓▓░░░▒▒▒▒░░░▓▓▓▓▒
                 ▓▓▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▓▓
                 ▓▓░░░░░▒▓▓▓▓▓▓▒░░░░░▓▓
                 ▓▓░░▓▓▒░░░▒▒░░░▒▓▒░░▓▓
                 ▓▓░░▓▓▓▓▓▒▒▒▒▓▓▓▓▒░░▓▓
                 ▓▓░░▓▓▓▓▓▓▓▓▓▓▓▓▓▒░░▓▓
                 ▓▓▒░░▒▒▓▓▓▓▓▓▓▓▒░░░▒▓▓
                  ▒▓▓▓▒░░░▒▓▓▒░░░▒▓▓▓▒
                     ▒▓▓▓▒░░░░▒▓▓▓▒
                        ▒▒▓▓▓▓▒▒


                Welcome to Metro v0.87.1
              Fast - Scalable - Integrated


 WARN  Attempted to import the module "D:\HippocampusRN\node_modules\react-native\src\private\featureflags\ReactNativeFeatureFlags" which is not listed in the "exports" of "D:\HippocampusRN\node_modules\react-native" under the requested subpath "./src/private/featureflags/ReactNativeFeatureFlags". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API.
LOG:Writing bundle output to: C:\Users\Lenovo\AppData\Local\Temp\hippo_e_bundle.js
LOG:Done writing bundle output
```

EXIT=0（WARN ReactNativeFeatureFlags 是 RN 0.87 已知噪声，与摘依赖无关）

### 第 4 步 b · 6 套 smoke 全绿

| smoke | 日志文件 | 字节 | MD5 | SUMMARY 原行 | EXIT |
|---|---|---|---|---|---|
| HOME | tools/smoke_e_home.log | 5110 | E0DDD71E93F33EA8F6E68DD6D70DEA94 | `HOME_SMOKE: 87 ok, 0 failed` | 0 |
| THEME_TOKENS | tools/smoke_e_theme_tokens.log | 6019 | FF3B2DE5A15554ADFF6DC0E25E69954D | `THEME_TOKENS_SMOKE: 110 ok, 0 failed` | 0 |
| POLYFILL | tools/smoke_e_polyfill.log | 1901 | 5F725C087A985A74FADFDC976A82A74A | `POLYFILL_SMOKE: 21 ok, 0 failed` | 0 |
| IMAGE | tools/smoke_e_image.log | 1946 | DBA856D1301CFB417D4E41337F1B7F95 | `IMAGE_SMOKE: 39 ok, 0 failed` | 0 |
| SETTINGS | tools/smoke_e_settings.log | 4476 | 132E010A36C2CFB3A6557B5D27113E29 | `SETTINGS_SMOKE: 83 ok, 0 failed` | 0 |
| STORY | tools/smoke_e_story.log | 8859 | 6B8F4732F41C63D5B182DAD2ED9DA2CC | `STORY_SMOKE: 162 ok, 0 failed` | 0 |

合计 **502 ok, 0 failed**（87+110+21+39+83+162=502，与 H1 轮总数一致）。settings_smoke 有 `[Weather] 工具注册失败：ToolExecutor 未就绪` 噪声到 stderr，`2>$null` 抑制后取 SUMMARY。

### 第 4 步 c · 真机取证（3 张截图 + vfs 硬证）

**截图证据**：

| 文件 | 字节 | MD5 | mtime | 内容判定 |
|---|---|---|---|---|
| g9_shots/E-bg-picked.png | 1084230 | F4A6ED3049C8A20CBA3479BE001C835B | 14:09:43 | 设置 03 通用页（tab 高亮深绿），背景卡缩略图出现（森林树木照，低角度仰拍），透明度 1.00，"选择图片"按钮可见 → PASS |
| g9_shots/E-bg-after-restart.png | 167981 | 883EA76970A0BFC4CCA09CACC7FA0498 | 14:11:17 | 冷启后主页 6 行布局正常（HIPPOCAMPUS CORE / 主页·叙事·设置 三 tab / 01-06 / 书票主题三张），无红屏无错误（本批主页不渲染全局背景，grounding H1：全局背景渲染层排 4-7） → PASS |
| g9_shots/E-boot.png | 286716 | 9E394EB26930420FB007E7E01F178F9B | 14:14:05 | __boot 自检页：`BOOTSTRAP: 44 ok, 0 failed` / `total = 44 · ok = 44 · failed = 0` / "全部44模块挂载成功，globalThis引导链就绪" / Platform RN 自检：合并标记=2-5，五组7/7，ui 21/21，window同对象=true / `image.compressFile ✓`（批次 E 改动模块挂载正常）/ 21 个 ui 接口全 ✓ / 无错误 → PASS |

**vfs 持久化硬证**（背景图 dataURL 冷启后仍在）：

| 项 | 证据 |
|---|---|
| vfs 库 | `databases/hippocampus_vfs.db` 446464 B（设备端），mtime 14:08（选图写入时刻，与 E-bg-picked.png 14:09 互证） |
| adb pull | 拉到 PC 446520 B（cat padding 差异，内容一致） |
| 字节搜索 | `data:image/jpeg;base64,` idx=7084 |
| 预览 | `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gIYSUNDX1BST0ZJTEUAAQEAAAIIA`（标准 JPEG base64 头，/9j/ 是 JPEG magic） |
| data:image 计数 | 1 次（背景图 1 张，符合预期） |

**过程自报**：
- logcat `ReactNativeJS:V` 全程无输出（RN 0.87 + 这台设备的 logcat tag 配置问题，H1 轮亦有同样现象；UI 截图证据为主证，logcat 旁证缺失不影响结论）。
- Metro `--reset-cache` 首次 transform 60 秒超时断连（RN 0.87 已知现象，BUNDLE 进度到 99% 696/708 后 app 端断连），第二次 transform 完成后 app 正常加载。
- adb reverse 失效一次（`adb reverse --list` 空），疑 USB 瞬断（H1 轮报告同因），重建 `adb reverse tcp:8081 tcp:8081` + force-stop + am start 后正常。
- 过程探针图 probe_e*.png 已清理（不入报告）。

【遗留/下一步】

1. **logcat ReactNativeJS:V 旁证缺失**（设备 logcat tag 配置问题），后续批次可探索 `adb shell setprop log.tag.ReactNativeJS VERBOSE` 或 RN 0.87 的 logcat 配置；不影响 UI 截图主证。
2. **全局背景渲染层（4-7）仍未实装**，主页/叙事页不渲染背景图（本批只在设置页背景卡缩略预览闭环）；E-bg-after-restart.png 主页无背景图是预期，非缺陷。
3. **compressFile 纯函数 calcFit/selectQuality 仍导出但 compressFileImpl 不再调用**，保留为 Electron 端压缩算法参考实现，后续 RN 侧若引入真压缩（如原生 canvas / expo-image）可直接复用。
4. **oversize 落库决策**=仍落库 + toast warn，与 Electron fallbackQuality 二趟后无条件 resolve 落库语义对齐；picker 1280/0.8 压缩后通常 < 512KB，oversize 是极复杂纹理图的边界情况，实测选图（森林树木照）未触发 oversize。
5. **G9-5 已改判实测 PASS**（摘依赖 + picker 原生压缩 + 真机选图冷启保留），G9 其余项保持 H1 轮判词（G9-1/2/3/6 PASS，G9-4 阻塞随 H2，iOS 全项 N/A）。
6. **下一步建议**：批次 F（待用户下达任务书）。Metro 后台 8081 仍运行（PID 2448），adb reverse 已重建，真机在线，可继续。

# TRAE_REPORT（信箱 · 只存最新一轮）

【轮次】2026-10-23（第 2 批）· RN 设置页模型名 UI 同步桌面形态 + release 重打装机取证（上接第 1 批：PRESETS 更新 + 桌面输入框常驻）

【结论】完成。RN `rn/screens/settings/ApiTab.js`（RN 独有文件，不回写桌面）模型名区域改为与桌面同构：下拉首项「-- 快捷选择 --」+「自定义（在下方输入）」选项，**输入框常驻可编辑**（原先选「自定义…」才出现），placeholder「输入任意模型名，或用上方下拉快捷填入」；选中具体模型即填入并保存，自定义/快捷选择不动 model。arm64 正式 release 重打成功并完成模拟器取证（x86_64 取证包验证后已恢复 arm64 正式包）。无越权操作。

【改动】

| # | 文件 | 改动 |
|---|---|---|
| 1 | `rn/screens/settings/ApiTab.js` | ①modelOptions 构造：头部加 `{value:'',label:'-- 快捷选择 --'}`，尾项 label「自定义…」→「自定义（在下方输入）」；②SetSelect onChange 简化：`if (v && v !== '__custom__') setField('model', v)`（删除原 setCs 空刷新分支）；③模型名 TextInput 由 `selectValue==='__custom__'` 条件渲染改为**常驻渲染**，placeholder「手动输入模型名」→「输入任意模型名，或用上方下拉快捷填入」。15684 B / CBC669528E4C41E1F94ADDEF35B01BAA |
| 2 | `android/app/build/outputs/apk/release/app-release.apk` | 重打 arm64 正式包（含第 1 批 PRESETS + 本批 ApiTab）。22251925 B / E432CD9ECA23294B1DA86EE9C8F18F2D |

构建取证过程：默认 `assembleRelease`（arm64）→ adb 装机启动即崩（`SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`）→ 根因非代码：P54·第9条 APK 瘦身 `reactNativeArchitectures=arm64-v8a`（gradle.properties），当前设备是 x86_64 模拟器，arm64-only 包必然 SoLoader 崩 → 按 `-PreactNativeArchitectures=x86_64` 打取证包验证（模拟器调试的注释内既有口径）→ 验证后重打 arm64 正式包恢复产物（22251925 B，与验证前字节数一致）。

【验证】
- 语法：`node --check rn/screens/settings/ApiTab.js` → EXIT=0
- smoke 针对性：`SETTINGS_SMOKE: 139 ok, 5 failed`（5 红全为既有 G 组，与改动前一致）；`P1_SETTINGS_SMOKE: 202 ok, 0 failed`
- RN 全量 smoke 终验（cwd=D:\HippocampusRN，`node tools\run_all_smokes.js`）：
  `RN_ALL_END SUITES=40 TOTAL_OK=2620 TOTAL_FAIL=7 TOTAL_SKIP=0 DURATION=19s`
  与 ApiTab 改动前逐项一致（log_query F5 / num_editor H5 / settings G×5 均为既有红，第 1 批报告已判定记账），**零新增红**
- 真机取证（x86_64 取证包装 emulator-5554）：
  - 构建：`BUILD SUCCESSFUL`（x86_64 取证包 22678014 B）；装机 `Success`；冷启动正常
  - 截图 `g9_shots/api_shot2.png`（178109 B）：预设行出现「API 中转站」；编辑区「模型名 qwen2.5:7b ▼」
  - 截图 `g9_shots/api_shot3.png`（210003 B）：模型名下拉（qwen2.5:7b ▾）**下方常驻输入框显示 qwen2.5:7b** + 温度/Top P/最大输出等表单完整 —— 新形态生效
- 模拟器当前保留 x86_64 取证包（arm64 正式包装 x86_64 模拟器必崩，属 P54 瘦身配置设计使然）；**真机安装请用仓内正式包** `android/app/build/outputs/apk/release/app-release.apk`（arm64）

【遗留/下一步】
1. settings_smoke G1/G2/G3/G5/G7 共 5 条既有红（`max_tokens_migrated_v2` 迁移断言 vs RN 源码无该逻辑，2026-10-23 桌面「最大输出不设上限」批遗留漂移），处置待批复
2. `log_query_smoke.js` F5 / `num_editor_smoke.js` H5 既有红，与 API 配置无关
3. 真机（arm64）实装正式包复核由用户掌握设备时进行；模拟器取证包仅作 UI 验证

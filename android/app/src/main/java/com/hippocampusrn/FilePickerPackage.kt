package com.hippocampusrn

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * P20：把 FilePickerModule 交给 React Native 注册。
 *
 * 注册位置：android/app/src/main/java/com/hippocampusrn/MainApplication.kt 的
 *   PackageList(this).packages.apply { add(FilePickerPackage()) }
 *
 * 为什么用老的 ReactPackage 而不是 TurboModule codegen：
 *   本工程 newArchEnabled=true（bridgeless），RN 0.87.1 在
 *   ReactNativeNewArchitectureFeatureFlagsDefaults 里把 enableBridgelessArchitecture 和
 *   useTurboModuleInterop 都默认置为 true，ReactPackageTurboModuleManagerDelegate
 *   会把这种包里的模块经 getLegacyModule() 暴露给 JS —— 也就是 NativeModules.FilePicker 可用。
 *   好处是不用动 package.json / 不生成 codegen 代码，符合「不新增依赖、少动构建」的纪律。
 */
class FilePickerPackage : ReactPackage {

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(FilePickerModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}

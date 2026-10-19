# ============================================================
# ProGuard / R8 规则（release 构建）
#
# 现状：android/app/build.gradle 里 enableProguardInReleaseBuilds = false，
# 所以本文件的规则暂时**没有被用到**。保留成「已就绪」状态的原因：
#   RN 0.87 + Hermes + op-sqlite(JNI) + MMKV 这几块都有反射/JNI 入口，
#   随手打开 minifyEnabled 很容易在运行时才炸（表现为白屏或某功能静默失效），
#   必须配合一次真机 release 包冒烟才能确认。
#
# 打开步骤（三行，做完**必须**跑真机 release 冒烟）：
#   1) android/app/build.gradle: def enableProguardInReleaseBuilds = true
#   2) cd android && ./gradlew assembleRelease
#   3) 装机后逐项过：启动 → 建卡 → 开局 → 设置里存 API Key → 发一条消息
#      → 存档/读档 → 世界书面板 → 退出重进（验证 op-sqlite 落盘）
#   任一步失败就来这里补 -keep，别靠猜。
# ============================================================

# ---- React Native 核心 ----
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp *;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ---- JNI：native 方法由 C++ 侧按名字查找，不能被裁/改名 ----
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { @com.facebook.react.bridge.ReactMethod <methods>; }

# ---- @op-engineering/op-sqlite ----
-keep class io.github.op_engineering.opsqlite.** { *; }
-dontwarn io.github.op_engineering.opsqlite.**

# ---- react-native-mmkv（当前未使用，留规则防以后启用时踩坑）----
-keep class com.reactnativecommunity.mmkv.** { *; }
-dontwarn com.reactnativecommunity.mmkv.**

# ---- react-native-image-picker ----
-keep class com.imagepicker.** { *; }
-dontwarn com.imagepicker.**

# ---- react-native-safe-area-context ----
-keep class com.th3rdwave.safeareacontext.** { *; }

# ---- 序列化/反射常见坑 ----
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-dontwarn javax.annotation.**
-dontwarn kotlin.**
-dontwarn okhttp3.**
-dontwarn okio.**

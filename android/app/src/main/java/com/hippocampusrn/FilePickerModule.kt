package com.hippocampusrn

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream

/**
 * P20（用户 m05320 诉求：「文件识别…我们需要的是可以上传文件至APP」）
 *
 * 只干一件事：把手机上选中的资料文件读成字节交回 JS。
 *   JS 契约见 rn/file_picker.js：  FilePicker.pickFile() → { name, size, base64, uri } | null
 *   拿到 base64 之后走 engine/import/pipeline.js 的 ingest({ name, bytes })，
 *   decode.js 的 toBytes() 本来就认 base64 字符串 —— 所以 docx / pdf / zip 这类
 *   粘贴不进去的二进制资料，现在也能进「导入文游资料」这条链。
 *
 * 约束（照本仓纪律）：
 *   · 不新增任何 npm / 原生依赖，只用系统自带的 SAF（ACTION_OPEN_DOCUMENT）。
 *   · 用户取消不是错误：resolve(null)，不 reject。
 *   · 读不出来 / 文件过大：reject 带人话消息，界面必须显示（不静默）。
 *   · iOS 侧没实现，rn/file_picker.js 在没有原生模块时安全返回 null（后面有 Mac 再补）。
 */
class FilePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    const val NAME = "FilePicker"

    /** 请求码随便取一个不与 RN 自身冲突的值（0x5060 = "P`"），RN 自己用 0x5000 段给别的用途。*/
    private const val REQUEST_CODE = 0x5060

    /** 单文件上限：base64 之后字符串约为 4/3，再大的档不该走这条路（避免把 JS 线程撑爆）。*/
    private const val MAX_BYTES = 24 * 1024 * 1024

    /** 能直接选到的类型：文本类 + 手机上常见的资料容器。其余类型系统里也能翻到。*/
    private val MIME_TYPES =
        arrayOf(
            "text/*",
            "application/json",
            "application/xml",
            "application/x-yaml",
            "application/pdf",
            "application/epub+zip",
            "application/zip",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.oasis.opendocument.text",
            "application/rtf",
            "application/octet-stream",
        )
  }

  private var pending: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  /** JS: NativeModules.FilePicker.pickFile() */
  @ReactMethod
  fun pickFile(promise: Promise) {
    // ReactContextBaseJavaModule.getCurrentActivity() 是 protected Kotlin fun，
    //   拿不到属性语法；官方给的替代就是 reactApplicationContext.currentActivity。
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "现在没有可用的界面，稍后再试一次")
      return
    }
    if (pending != null) {
      promise.reject("E_BUSY", "已经有一个文件选择窗口在等了，先把它关掉")
      return
    }

    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          putExtra(Intent.EXTRA_MIME_TYPES, MIME_TYPES)
          putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
        }

    pending = promise
    try {
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (e: Exception) {
      pending = null
      promise.reject("E_NO_PICKER", "这台设备没有可用的文件选择器：" + (e.message ?: ""), e)
    }
  }

  // 签名必须与 ActivityEventListener.kt:19 逐字一致（activity 非空）
  override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
  ) {
    if (requestCode != REQUEST_CODE) return
    val promise = pending ?: return
    pending = null

    val uri: Uri? = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      // 用户按了返回 / 没选 —— 不是错误
      promise.resolve(null)
      return
    }

    try {
      // 部分机型的 provider 在回调之后会立刻收回读权限，先申请持久读权限兜底（失败不影响本次读）
      try {
        reactContext.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      } catch (ignored: Exception) {}

      val name = queryDisplayName(uri)
      val bytes = readAllBytes(uri)
      val map =
          Arguments.createMap().apply {
            putString("name", name)
            putString("uri", uri.toString())
            putDouble("size", bytes.size.toDouble())
            putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
          }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_READ_FAILED", "读这个文件失败：" + (e.message ?: e.javaClass.simpleName), e)
    }
  }

  // 签名必须与 ActivityEventListener.kt:22 逐字一致（intent 非空）
  override fun onNewIntent(intent: Intent) {
    // 不需要
  }

  override fun invalidate() {
    val promise = pending
    pending = null
    promise?.reject("E_CANCELLED", "原生模块被销毁，文件选择中断")
    try {
      reactContext.removeActivityEventListener(this)
    } catch (ignored: Exception) {}
    super.invalidate()
  }

  private fun queryDisplayName(uri: Uri): String {
    var name: String? = null
    var cursor: Cursor? = null
    try {
      cursor =
          reactContext.contentResolver.query(
              uri,
              arrayOf(OpenableColumns.DISPLAY_NAME),
              null,
              null,
              null,
          )
      if (cursor != null && cursor.moveToFirst()) {
        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (idx >= 0) name = cursor.getString(idx)
      }
    } catch (ignored: Exception) {
    } finally {
      try {
        cursor?.close()
      } catch (ignored: Exception) {}
    }
    if (name.isNullOrBlank()) name = uri.lastPathSegment ?: "选中的资料"
    return name
  }

  private fun readAllBytes(uri: Uri): ByteArray {
    val input =
        reactContext.contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("打不开这个文件（内容提供者没有给出数据流）")
    input.use { ins ->
      val out = ByteArrayOutputStream()
      val buf = ByteArray(64 * 1024)
      var total = 0
      while (true) {
        val n = ins.read(buf)
        if (n <= 0) break
        total += n
        if (total > MAX_BYTES) {
          throw IllegalStateException("文件超过 " + (MAX_BYTES / 1024 / 1024) + " MB，换小一点的文件再试")
        }
        out.write(buf, 0, n)
      }
      return out.toByteArray()
    }
  }
}

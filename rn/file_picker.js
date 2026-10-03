// ============================================================
// P20：手机上的资料文件选择（RN 独有）
//
// 为什么要有这个文件（用户 m05320）：
//   「文件识别如果是直接内容输进去那还叫什么文件识别，我们需要的是可以上传文件至APP」
//   桌面侧的对应物是 engine/ui_cards.js 的 UI.pickMaterialFile()（真的文件选择框）；
//   RN 侧以前只能把正文粘进输入框，docx / pdf / zip 这类二进制资料根本进不来。
//
// 原生实现：android/app/src/main/java/com/hippocampusrn/FilePickerModule.kt
//   只用系统自带的 SAF（ACTION_OPEN_DOCUMENT），不新增任何 npm / 原生依赖。
//   注册在 MainApplication.kt 的 PackageList(...).apply { add(FilePickerPackage()) }。
//
// 契约：
//   available() → boolean
//   pickFile()  → Promise<{ name, size, base64, uri } | null>
//                 null = 用户取消，或这台设备/平台还没有原生实现（iOS 待有 Mac 再补）
//   拿到的 base64 直接当 bytes 喂给导入层：
//     Import.run({ name: picked.name, bytes: picked.base64 }, {})
//   engine/import/decode.js 的 toBytes() 本来就认 base64 字符串。
//
// 纪律：不静默失败 —— 原生侧 reject 的错误原样往上抛，界面必须显示出来。
// ============================================================

'use strict';

// 故意用「调用时再 require」：这个文件在纯 Node 的无头测试里也要能被加载，
// 那时 react-native 往往是打桩的，加载期直接 require 会把整个屏的 smoke 拖挂。
function rnModule() {
  try { return require('react-native'); } catch (e) { return null; }
}

function nativeModule() {
  try {
    var RN = rnModule();
    var m = RN && RN.NativeModules ? RN.NativeModules.FilePicker : null;
    return m && typeof m.pickFile === 'function' ? m : null;
  } catch (e) {
    return null;
  }
}

function available() {
  return !!nativeModule();
}

// base64 的字符数不等于字节数：每 4 个字符 = 3 字节，尾部 '=' 是填充、必须扣掉
// （不扣的话 'YWJjZA==' 会被算成 6 字节，比真实 4 字节虚报 50%）。
// 原生实现（FilePickerModule.kt）总会给 size，这里只是它没给时的兜底。
function base64Bytes(b64) {
  if (!b64) return 0;
  var pad = 0;
  if (b64.charAt(b64.length - 1) === '=') pad += 1;
  if (b64.charAt(b64.length - 2) === '=') pad += 1;
  return Math.floor(b64.length * 3 / 4) - pad;
}

function pickFile() {
  var m = nativeModule();
  if (!m) return Promise.resolve(null);
  return Promise.resolve()
    .then(function () { return m.pickFile(); })
    .then(function (r) {
      if (!r) return null;
      var b64 = r.base64 == null ? '' : String(r.base64);
      return {
        name: String(r.name || '选中的资料'),
        size: typeof r.size === 'number' ? r.size : base64Bytes(b64),
        base64: b64,
        uri: r.uri ? String(r.uri) : null,
      };
    });
}

module.exports = { available: available, pickFile: pickFile };

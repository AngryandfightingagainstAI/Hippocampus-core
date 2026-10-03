// ============================================================
// P20 · RN「上传文件到 App」smoke（用户 m05320 诉求 2）
// 用法：cwd = RN 仓根 → node tools/file_picker_smoke.js
//
// 背景：RN 侧以前只能把资料正文粘进输入框，docx / odt / epub / pdf / zip
//   这类二进制资料根本进不来（CardsScreen.js 自己写着「RN 侧的文件选择器还没接」）。
//   本批加了两块：
//     · 原生 android/app/src/main/java/com/hippocampusrn/FilePickerModule.kt
//       （系统 SAF：ACTION_OPEN_DOCUMENT → 文件名 + base64，不新增任何依赖）
//       + FilePickerPackage.kt + MainApplication.kt 注册
//     · JS 包装 rn/file_picker.js 与 CardsScreen「选择文件…」接线
//
// 本测试纯 Node（不需要手机）：
//   A. rn/file_picker.js 的契约：有/无原生模块、规范化、用户取消、错误不被吞
//   B. 真导入层：base64 → Import.run({ bytes }) 与直接给字节等价、
//      二进制/坏包不静默丢（报告里必须有话）
//   C. CardsScreen 接线（源码级定位 + 反向：粘贴路径不许回归）
//   D. 原生侧与依赖纪律（用系统 SAF、注册进 MainApplication、没加新依赖）
// ============================================================

'use strict';

var path = require('path');
var fs = require('fs');
var root = path.resolve(__dirname, '..');

var ok = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name + (detail ? (' :: ' + detail) : '')); }
}
function eq(name, actual, expected) {
  check(name + '（actual=' + JSON.stringify(actual) + '）', actual === expected);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ---------- react-native 最小桩：file_picker.js 是「调用时」才 require 它 ----------
var Module = require('module');
var origLoad = Module._load;
var RNStub = {
  Platform: { OS: 'android' },
  NativeModules: {},
  View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity', StatusBar: 'StatusBar',
  StyleSheet: { create: function (o) { return o; }, flatten: function (o) { return o; }, absoluteFill: {} }
};
Module._load = function (request) {
  if (request === 'react-native') return RNStub;
  return origLoad.apply(this, arguments);
};

var FP_PATH = path.join(root, 'rn', 'file_picker.js');

// ============ A 组：rn/file_picker.js 契约 ============
async function runA() {
  check('A1 rn/file_picker.js 存在', fs.existsSync(FP_PATH));

  var FP = null;
  try { FP = require(FP_PATH); } catch (e) {
    check('A2 rn/file_picker.js 可加载并导出 { available, pickFile }', false, e.message);
    return;
  }
  check('A2 rn/file_picker.js 可加载并导出 { available, pickFile }',
    FP && typeof FP.available === 'function' && typeof FP.pickFile === 'function');

  // A3 没有原生模块（iOS / 未装原生实现的构建）：安全降级，不抛
  RNStub.NativeModules = {};
  eq('A3 没有原生模块时 available() = false', FP.available(), false);
  var r3 = await FP.pickFile();
  eq('A4 没有原生模块时 pickFile() = null（不抛）', r3, null);

  // A5 有原生模块
  RNStub.NativeModules = {
    FilePicker: {
      pickFile: function () {
        return Promise.resolve({ name: '设定.md', size: 12, base64: 'YWJjZGVmZ2hpams=', uri: 'content://doc/1' });
      }
    }
  };
  eq('A5 有原生模块时 available() = true', FP.available(), true);
  var r5 = await FP.pickFile();
  check('A6 pickFile() 规范化成 { name, size, base64, uri }',
    !!r5 && r5.name === '设定.md' && r5.size === 12 && r5.base64 === 'YWJjZGVmZ2hpams=' && r5.uri === 'content://doc/1',
    'got=' + JSON.stringify(r5));

  // A7 用户取消：原生 resolve(null) → null（不是错误）
  RNStub.NativeModules.FilePicker.pickFile = function () { return Promise.resolve(null); };
  eq('A7 用户取消（原生 resolve null）→ pickFile() = null', await FP.pickFile(), null);

  // A8 原生缺 name / size：给默认值，别把 undefined 传进导入层
  RNStub.NativeModules.FilePicker.pickFile = function () {
    return Promise.resolve({ base64: 'YWJjZA==' });
  };
  var r8 = await FP.pickFile();
  check('A8 name/size 缺失时补默认值（name 非空、size 由 base64 推算 = 4）',
    !!r8 && r8.name === '选中的资料' && r8.size === 4, 'got=' + JSON.stringify(r8));

  // A9 原生报错必须往上抛（不静默吞掉）
  RNStub.NativeModules.FilePicker.pickFile = function () {
    return Promise.reject(new Error('读这个文件失败：权限不够'));
  };
  var threw = null;
  try { await FP.pickFile(); } catch (e) { threw = e; }
  check('A9 原生报错原样抛出（不静默）', !!threw && /权限不够/.test(String(threw.message)),
    'threw=' + String(threw && threw.message));
}

// ============ B 组：真导入层（base64 → bytes） ============
var ImportDecode, Import;
function loadImportLayer() {
  function load(rel, globalName) {
    var m = require(path.join(root, rel));
    if (globalName) global[globalName] = m;
    return m;
  }
  ImportDecode = load('engine/import/decode.js', 'ImportDecode');
  load('engine/import/unzip.js', 'ImportUnzip');
  load('engine/import/middle.js', 'ImportMiddle');
  load('engine/import/formats.js', 'ImportFormats');
  load('engine/import/report.js', 'ImportReport');
  var TEXTLIKE = load('engine/import/parsers/textlike.js', 'ImportParseTextlike');
  global.ImportHtml = TEXTLIKE.ImportHtml;
  load('engine/import/parsers/archive.js', 'ImportParseArchive');
  global.ImportParsePdf = load('engine/import/parsers/pdf.js', 'ImportParsePdfGo');
  load('engine/import/pipeline.js', 'ImportPipeline');
  load('engine/import/vault.js', 'ImportVault');
  load('engine/import/draft.js', 'ImportDraft');
  Import = load('engine/import/index.js', 'Import');
  global.CardValidator = require(path.join(root, 'engine/core/card_validator.js'));
  Import.init();
}

function b64OfBytes(bytes) {
  return ImportDecode.toBase64(bytes);
}

function runB() {
  loadImportLayer();

  // B1：base64 与直接给字节必须产出同一份草稿（选文件走的就是 base64 这条路）
  var md = '# 世界观\n\n这是一段设定文字，用来测试标题与段落。\n\n## 规则\n\n| 名称 | 效果 |\n|---|---|\n| 火 | 热 |\n';
  var rawBytes = ImportDecode.toUTF8(md);
  var fromBytes = Import.run({ name: '设定.md', bytes: rawBytes }, { vault: false });
  var fromB64 = Import.run({ name: '设定.md', bytes: b64OfBytes(rawBytes) }, { vault: false });
  eq('B1 base64 与原始字节产出同一 cardId', fromB64.draft.card.cardId, fromBytes.draft.card.cardId);
  eq('B2 base64 路径的中间格式字节数 = 原文 len', fromB64.imd.source.bytes, rawBytes.length);
  eq('B3 文件真名进了草稿来源（设定.md）', fromB64.imd.source.name, '设定.md');

  // B4：二进制资料（.docx 形状的坏包）：不抛，且必须留下人话（不静默丢内容）
  var broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22, 0x33, 0x44, 0x55]);
  var r4 = Import.run({ name: '边缘之城.docx', bytes: b64OfBytes(broken) }, { vault: false });
  check('B4 坏 docx（base64）不抛且出了草稿', !!r4 && !!r4.draft && !!r4.draft.card.cardId);
  var txt4 = String(Import.reportText(r4) || '');
  check('B5 坏 docx 的报告里写明原因（不静默）', txt4.length > 0 && /边缘之城\.docx/.test(txt4),
    'report=' + txt4.slice(0, 160));

  // B6：pdf 头（粘贴不进去的类型）：字节数必须原样保留
  var pdf = ImportDecode.toUTF8('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  var r6 = Import.run({ name: '夜航手册.pdf', bytes: b64OfBytes(pdf) }, { vault: false });
  eq('B6 pdf（base64）字节数原样保留', r6.imd.source.bytes, pdf.length);
  check('B7 pdf 报告可读（有文件名）', /夜航手册\.pdf/.test(String(Import.reportText(r6) || '')));

  // B8：base64 里的换行/空格（原生有些实现会带）= decode.js 的宽容路径
  var wrapped = b64OfBytes(rawBytes).replace(/(.{16})/g, '$1\n');
  var r8 = Import.run({ name: '设定.md', bytes: wrapped }, { vault: false });
  eq('B8 带换行的 base64 仍解析成功', r8.imd.source.bytes, rawBytes.length);
}

// ============ C 组：CardsScreen 接线 ============
function runC() {
  var cs = read(path.join('rn', 'screens', 'CardsScreen.js'));

  check('C1 CardsScreen require 了 rn/file_picker.js',
    cs.indexOf("require('../file_picker.js')") >= 0);
  check('C2 定义了 doPickMaterialFile', cs.indexOf('function doPickMaterialFile(') >= 0);
  check('C3 调用 FilePicker.pickFile()', cs.indexOf('FilePicker.pickFile()') >= 0);
  check('C4 先问 available()，没原生实现时给人话提示（不静默）',
    cs.indexOf('if (!FilePicker.available())') >= 0 && cs.indexOf('没有接上文件选择器') >= 0);
  check('C5 选中文件后把 bytes（base64）交给导入层',
    cs.indexOf('parseMaterialInput({ name: picked.name, bytes: picked.base64 })') >= 0);
  check('C6 解析入口只走一个函数，粘贴路径不许回归',
    cs.indexOf('function parseMaterialInput(input)') >= 0 &&
    cs.indexOf('parseMaterialInput({ name: name, text: raw })') >= 0 &&
    cs.indexOf('Import.run({ name: name, text: raw }') < 0);
  check('C7 界面上真的有「选择文件…」按钮接上 doPickMaterialFile',
    cs.indexOf('onPress={doPickMaterialFile}') >= 0 && cs.indexOf("'选择文件…'") >= 0);
  check('C8 旧文案「RN 侧的文件选择器还没接」已不再是事实陈述',
    cs.indexOf('RN 侧的文件选择器还没接') < 0);
  check('C9 选文件失败 / 空内容都要显示出来（不静默）',
    cs.indexOf("setMatMsg({ type: 'error', text: '选文件失败：'") >= 0 &&
    cs.indexOf('这个文件没读到内容：') >= 0);
  check('C10 取消（picked 为 null）时清掉提示、不报错',
    cs.indexOf('if (!picked) { setMatMsg(null); return; }') >= 0);

  // C11：光比字符串看不出「接线把 JSX 写坏了」。真拿仓内 babel 把这文件解析一遍，
  //   漏括号 / 标签不闭合 / 表达式语法错，这里必须红。
  //   （有效性另用 p20_babel_guard_proof.js 证明：故意写坏同一条按钮行 → 解析抛错。）
  var parseErr = null;
  try {
    var BabelCore = require(path.join(root, 'node_modules', '@babel', 'core'));
    BabelCore.transformFileSync(path.join(root, 'rn', 'screens', 'CardsScreen.js'), {
      cwd: root, configFile: path.join(root, 'babel.config.js')
    });
  } catch (e) { parseErr = e && e.message; }
  check('C11 CardsScreen.js 能过仓内 babel（接线没写坏 JSX）', !parseErr, 'err=' + parseErr);
}

// ============ D 组：原生侧与依赖纪律 ============
function runD() {
  var ktPath = path.join('android', 'app', 'src', 'main', 'java', 'com', 'hippocampusrn', 'FilePickerModule.kt');
  var pkgPath = path.join('android', 'app', 'src', 'main', 'java', 'com', 'hippocampusrn', 'FilePickerPackage.kt');
  check('D1 FilePickerModule.kt 存在', exists(ktPath));
  check('D2 FilePickerPackage.kt 存在', exists(pkgPath));
  if (!exists(ktPath) || !exists(pkgPath)) return;

  var kt = read(ktPath);
  var pkg = read(pkgPath);
  var app = read(path.join('android', 'app', 'src', 'main', 'java', 'com', 'hippocampusrn', 'MainApplication.kt'));
  var pj = JSON.parse(read('package.json'));
  var fp = read(path.join('rn', 'file_picker.js'));

  check('D3 用系统 SAF 选文件（ACTION_OPEN_DOCUMENT + CATEGORY_OPENABLE）',
    kt.indexOf('Intent.ACTION_OPEN_DOCUMENT') >= 0 && kt.indexOf('Intent.CATEGORY_OPENABLE') >= 0);
  check('D4 读真实文件名（OpenableColumns.DISPLAY_NAME）', kt.indexOf('OpenableColumns.DISPLAY_NAME') >= 0);
  check('D5 字节以 base64 交回 JS（Base64.encodeToString / NO_WRAP）',
    kt.indexOf('Base64.encodeToString') >= 0 && kt.indexOf('Base64.NO_WRAP') >= 0);
  check('D6 用户取消 resolve(null)，不当错误报（resultCode != RESULT_OK）',
    kt.indexOf('Activity.RESULT_OK') >= 0 && kt.indexOf('promise.resolve(null)') >= 0);
  check('D7 reject 带人话错误码（E_READ_FAILED / E_NO_ACTIVITY / E_NO_PICKER）',
    kt.indexOf('"E_READ_FAILED"') >= 0 && kt.indexOf('"E_NO_ACTIVITY"') >= 0 && kt.indexOf('"E_NO_PICKER"') >= 0);
  check('D8 有单文件体积上限（不让 base64 把 JS 线程撑爆）', kt.indexOf('MAX_BYTES') >= 0);
  check('D9 FilePickerPackage 是真 ReactPackage 且交出 FilePickerModule',
    pkg.indexOf(': ReactPackage') >= 0 && pkg.indexOf('listOf(FilePickerModule(reactContext))') >= 0);
  check('D10 MainApplication 里注册了 FilePickerPackage',
    app.indexOf('add(FilePickerPackage())') >= 0);
  check('D11 模块名与 JS 侧一致（NativeModules.FilePicker）',
    kt.indexOf('const val NAME = "FilePicker"') >= 0);

  // D12：依赖表必须与开工前逐项一致（本批的全部意义之一：只用系统 SAF，不加依赖）
  //   故意不写「黑名单正则」——那会误伤开工前就有的 react-native-image-picker。
  var deps = Object.keys(pj.dependencies || {}).sort();
  var baseline = ['@op-engineering/op-sqlite', '@react-native/new-app-screen', 'react',
    'react-native', 'react-native-image-picker', 'react-native-mmkv',
    'react-native-safe-area-context'].sort();
  var added = deps.filter(function (d) { return baseline.indexOf(d) < 0; });
  var removed = baseline.filter(function (d) { return deps.indexOf(d) < 0; });
  check('D12 package.json 依赖表与开工前一致（' + deps.length + ' 个，没多也没少）',
    added.length === 0 && removed.length === 0,
    'added=' + JSON.stringify(added) + ' removed=' + JSON.stringify(removed));

  // D13：JS 包装层除 react-native 外不许 require 第三方
  var reqs = [];
  var re = /require\(\s*'([^']+)'\s*\)/g, m;
  while ((m = re.exec(fp))) reqs.push(m[1]);
  var third = reqs.filter(function (r) { return r.charAt(0) !== '.' && r.indexOf('react-native') !== 0; });
  check('D13 rn/file_picker.js 只依赖 react-native（' + JSON.stringify(reqs) + '）', third.length === 0,
    'third=' + JSON.stringify(third));
}

// ============ 主流程 ============
(async function () {
  try {
    await runA();
    runB();
    runC();
    runD();
    console.log('FILE_PICKER_SMOKE: ' + ok + ' ok, ' + fail + ' failed');
    if (fail > 0) process.exit(1);
  } catch (e) {
    console.log('SMOKE_CRASH: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  }
})();

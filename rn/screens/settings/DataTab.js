// ============================================================
// 战役 P1-A：设置页 · 数据与备份 tab（B 类）
// grounding：engine/ui_settings.js:461-485 renderDataInto
//   逐按钮对齐：导出全部 / 清空全部 / 导入单存档 / 查看 VFS /
//   导出 VFS / 引擎自检 / 报错日志 / 卡带修复 / 回归测试 / 主题包。
// RN 侧：
//   - 设备通道只用 Share.share + Clipboard（node_modules 内置，
//     禁 npm 装包），降级路径：Share 失败 → 剪贴板 → toast 提示。
//   - 无 location.reload：清空全部后 navigate('home') + StoryStore.clear()
//   - 主题包导入导出入口落此处，实装在 P1-B ColorTab。
//   - 回归测试不搬 suite，改为 PC 侧 11 套 smoke 清单说明块。
// 文案逐字照桌面；新增文案由本任务书指定。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var Share = RN.Share;
var Clipboard = RN.Clipboard;

var useTheme = require('../../use_theme.js').useTheme;
var Model = require('../../settings_model.js');
var Controls = require('../../components/settings/controls.js');
var SetCard = Controls.SetCard;
var SetNote = Controls.SetNote;
var SetButton = Controls.SetButton;
var SetTextInput = Controls.SetTextInput;

var Storage = require('../../../engine/core/storage.js');
var VFS = require('../../../vfs/vfs.js');
var StorageAdapter = require('../../../vfs/storage_adapter.js');
var NavStore = require('../../nav_store.js');
var StoryStore = require('../../story_store.js');

function DataTab() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  // ---------- 状态 ----------
  var importState = React.useState('');
  var importText = importState[0];
  var setImportText = importState[1];
  var importMsgState = React.useState(null);
  var importMsg = importMsgState[0];
  var setImportMsg = importMsgState[1];
  var vfsInfoState = React.useState(null);
  var vfsInfo = vfsInfoState[0];
  var setVfsInfo = vfsInfoState[1];
  var auditState = React.useState(null);
  var auditText = auditState[0];
  var setAuditText = auditState[1];
  var repairState = React.useState(null);
  var repairReport = repairState[0];
  var setRepairReport = repairState[1];

  // ---------- 导出通道 ----------
  function doExportAll() {
    try {
      var payload = { global: Storage.getGlobal(), vfs: VFS.exportAll() };
      var text = JSON.stringify(payload, null, 2);
      shareOrCopy(text, '导出全部', 'ai_textgame_backup.json');
    } catch (e) {
      toast('导出失败：' + e.message, 'error');
    }
  }
  function doExportVFS() {
    try {
      var text = JSON.stringify(VFS.exportAll(), null, 2);
      shareOrCopy(text, '导出 VFS', 'vfs_backup.json');
    } catch (e) {
      toast('导出失败：' + e.message, 'error');
    }
  }
  function shareOrCopy(text, okLabel, filenameHint) {
    Share.share({ message: text, title: okLabel })
      .then(function (res) {
        if (res && res.action === Share.sharedAction) {
          toast(okLabel + ' 已发送', 'success');
        } else {
          // dismissed：静默
        }
      })
      .catch(function () {
        // Share 失败（无支持应用 / 取消）→ 降级剪贴板
        Clipboard.setString(text);
        toast(okLabel + ' 已复制到剪贴板（请手动粘贴保存）', 'info');
      });
  }
  function toast(msg, type) {
    StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 });
  }

  // ---------- 清空全部 ----------
  function doClearAll() {
    Platform.ui.confirmAsync('确定清空全部本地数据？')
      .then(function (ok) {
        if (!ok) return;
        try {
          StorageAdapter.clear();
          // RN 无 location.reload：清完回主页并重置 store
          StoryStore.clear();
          NavStore.navigate('home');
          toast('已清空', 'success');
        } catch (e) {
          toast('清空失败：' + e.message, 'error');
        }
      });
  }

  // ---------- 导入单存档 ----------
  function doImportSave() {
    var raw = String(importText || '').trim();
    if (!raw) {
      setImportMsg({ type: 'warn', text: '内容为空' });
      return;
    }
    // 粘贴清洗（同 CardsScreen:119-124）
    var text = raw
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    var data;
    try { data = JSON.parse(text); }
    catch (e) {
      setImportMsg({ type: 'error', text: 'JSON 解析失败：' + e.message });
      return;
    }
    var r = Model.importSaveFromJson(data);
    if (!r.ok) {
      setImportMsg({ type: 'error', text: r.reason });
      return;
    }
    setImportMsg({ type: 'success', text: '存档已导入（' + r.written + ' 个文件）' });
    setImportText('');
  }

  // ---------- 查看 VFS ----------
  function doShowVFS() {
    var info = VFS._debug ? VFS._debug() : _fallbackVfsDebug();
    setVfsInfo(info);
  }
  function _fallbackVfsDebug() {
    var dirs = [];
    var files = [];
    for (var i = 0; i < StorageAdapter.length; i++) {
      var k = StorageAdapter.key(i);
      if (!k) continue;
      if (k.indexOf('vfs:') !== 0) continue;
      var p = k.slice(4);
      if (p.indexOf('/') < 0) continue;
      files.push(p);
      var dir = p.slice(0, p.lastIndexOf('/'));
      if (dirs.indexOf(dir) < 0) dirs.push(dir);
    }
    return { dirs: dirs, files: files };
  }

  // ---------- 引擎自检 ----------
  function doAudit() {
    var Audit = require('../../../engine/audit.js');
    try {
      var r = Audit.report ? Audit.report() : '';
      setAuditText(String(r));
    } catch (e) {
      setAuditText('自检异常：' + e.message);
    }
  }

  // ---------- 卡带修复 ----------
  function doRepair() {
    var RuntimeRepair = require('../../../engine/runtime_repair.js');
    if (!RuntimeRepair || !RuntimeRepair.repairCard) {
      toast('RuntimeRepair 未加载', 'error');
      return;
    }
    var cards = Storage.getAllCards();
    var ids = Object.keys(cards);
    if (!ids.length) {
      toast('没有可修复的卡带', 'warn');
      return;
    }
    var firstId = ids[0];
    try {
      var r = RuntimeRepair.repairCard(firstId);
      if (!r.ok) { toast(r.reason || '修复失败', 'error'); return; }
      setRepairReport(r.report || r);
    } catch (e) {
      toast('修复异常：' + e.message, 'error');
    }
  }

  // ---------- 主题包（P10·A8：入口二选一，导出/导入统一收到 ColorTab）----------
  // 原 DataTab 的 doExportTheme 与 ColorTab「主题包」区 (:630-658) 重复，
  // 且 ColorTab 那份还带「粘贴导入」，功能更全 ⇒ 保留 ColorTab，本 tab 只留指路。

  // ---------- 回归测试说明块 ----------
  var SMOKE_LIST = [
    'home_smoke.js', 'cards_smoke.js', 'saves_smoke.js', 'create_smoke.js',
    'theme_tokens_smoke.js', 'polyfill_smoke.js', 'story_smoke.js',
    'panels_smoke.js', 'h6_panels_smoke.js', 'settings_smoke.js',
    'image_smoke.js'
  ];

  // ---------- styles ----------
  var styles = React.useMemo(function () {
    return RN.StyleSheet.create({
      card: {
        backgroundColor: c.bgCard,
        borderRadius: tk.radius.sm,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 12
      },
      title: {
        fontFamily: tk.fonts.kai,
        fontSize: f.md,
        color: c.ink,
        marginBottom: 8
      },
      muted: {
        fontSize: f.xs,
        color: c.muted,
        lineHeight: Math.round(f.xs * 1.7),
        marginBottom: 8
      },
      btnRow: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
        marginVertical: 4
      },
      textarea: {
        borderWidth: 1,
        borderColor: c.hairStrong,
        borderRadius: tk.radius.sm,
        padding: 12,
        minHeight: 120,
        fontSize: f.sm,
        color: c.text,
        fontFamily: tk.fonts.mono,
        textAlignVertical: 'top',
        marginBottom: 8
      },
      mono: {
        fontFamily: tk.fonts.mono,
        fontSize: f.xs,
        color: c.muted,
        lineHeight: Math.round(f.xs * 1.7)
      },
      msgOk: { fontSize: f.sm, color: c.success, marginTop: 4 },
      msgWarn: { fontSize: f.sm, color: c.warning, marginTop: 4 },
      msgErr: { fontSize: f.sm, color: c.danger, marginTop: 4 },
      auditBox: {
        backgroundColor: c.panel,
        borderRadius: tk.radius.sm,
        padding: 10,
        marginTop: 6
      }
    });
  }, [tk]);

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    // --- 数据管理 ---
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.title }, '数据管理'),
      React.createElement(View, { style: styles.btnRow },
        React.createElement(SetButton, { label: '导出全部', onPress: doExportAll }),
        React.createElement(SetButton, { label: '清空全部', onPress: doClearAll, kind: 'danger' })
      ),
      React.createElement(Text, { style: styles.muted },
        '导出全部 = 全局配置 + VFS（含所有卡带、存档、日志）。'
      ),
      React.createElement(View, { style: styles.btnRow },
        React.createElement(SetButton, { label: '导入单存档', onPress: doImportSave })
      ),
      React.createElement(SetNote, null,
        '导入单存档 = 从其他设备导出的 .json 存档文件恢复一份存档。需要先有对应卡带。'
      ),
      React.createElement(SetTextInput, {
        value: importText,
        onChangeText: setImportText,
        multiline: true,
        rows: 5,
        placeholder: '粘贴存档 JSON（ai_tg_save 格式）...'
      }),
      importMsg
        ? React.createElement(Text, {
            style: importMsg.type === 'success' ? styles.msgOk
              : (importMsg.type === 'warn' ? styles.msgWarn : styles.msgErr)
          }, importMsg.text)
        : null
    ),
    // --- VFS ---
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.title }, 'VFS'),
      React.createElement(View, { style: styles.btnRow },
        React.createElement(SetButton, { label: '查看', onPress: doShowVFS }),
        React.createElement(SetButton, { label: '导出', onPress: doExportVFS })
      ),
      vfsInfo
        ? React.createElement(View, { style: styles.auditBox },
            React.createElement(Text, { style: styles.muted }, '目录：'),
            vfsInfo.dirs.map(function (d, i) {
              return React.createElement(Text, { key: 'd' + i, style: styles.mono }, d + '/');
            }),
            React.createElement(Text, { style: [styles.muted, { marginTop: 6 }] }, '文件：'),
            vfsInfo.files.length
              ? vfsInfo.files.map(function (ff, i) {
                  return React.createElement(Text, { key: 'f' + i, style: styles.mono }, ff);
                })
              : React.createElement(Text, { style: styles.mono }, '空')
          )
        : null
    ),
    // --- 引擎自检 ---
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.title }, '引擎自检'),
      React.createElement(Text, { style: styles.muted },
        '扫描模块加载、配置、存档、卡带、存储。只读，不改任何东西。'
      ),
      React.createElement(View, { style: styles.btnRow },
        React.createElement(SetButton, { label: '运行自检', onPress: doAudit, kind: 'primary' }),
        React.createElement(SetButton, { label: '报错日志', onPress: function () { StoryStore.openPanel('errorLog'); } }),
        React.createElement(SetButton, { label: '修复卡带', onPress: doRepair })
      ),
      auditText
        ? React.createElement(View, { style: styles.auditBox },
            React.createElement(Text, { style: styles.mono }, auditText)
          )
        : null,
      repairReport
        ? React.createElement(View, { style: styles.auditBox },
            React.createElement(Text, { style: styles.mono }, JSON.stringify(repairReport, null, 2))
          )
        : null
    ),
    // --- 回归测试（PC 侧说明） ---
    // P6·S4-5：原文案泄露开发机绝对路径（D:\HippocampusRN），改写为
    // 面向玩家的通用表述（保留测试清单文件名，去掉机器路径）。
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.title }, '回归测试'),
      React.createElement(Text, { style: styles.muted },
        'PC 侧 Node 一次性跑完引擎核心逻辑测试（不烧 token）。设备端无法直接运行，请在 PC 端的项目源码目录执行 tools/ 下的回归脚本：'
      ),
      React.createElement(View, { style: { marginTop: 6 } },
        SMOKE_LIST.map(function (n) {
          return React.createElement(Text, { key: n, style: styles.mono }, '· ' + n);
        })
      )
    ),
    // --- 主题包（P10·A8：入口唯一化，本 tab 只指路） ---
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.title }, '主题包'),
      React.createElement(SetNote, null, '主题包导出 / 导入 / 色盘 / 槽位管理都在「通用」tab 的「我的主题」区，本页不再重复出入口。')
    )
  );
}

module.exports = { DataTab: DataTab };

// ============================================================
// 战役 P1-B：设置页 · 外观配色 tab（B 类）
// grounding：engine/theme.js COLOR_GROUPS/COLOR_VAR_MAP/COLOR_LABELS、
//   ui_theme.js:130-198 取色器交互 / :200-246 槽位 / :48-62 主题包。
// 约束：
//   - 取色器自绘（无 iro / 无 expo-linear-gradient / 无第三方库）
//   - 色相条 + SV 面板用 View responder 连续拖拽
//   - 应用 = Theme.setColorOverride + bumpThemeRev（立即变色）
//   - 重置 = Theme.clearOverrides + bumpThemeRev
//   - toast 文案逐字对 ui_theme.js:180「已应用自定义色值」/:191「已重置为预设主题」
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var ScrollView = RN.ScrollView;
var TouchableOpacity = RN.TouchableOpacity;
var TextInput = RN.TextInput;
var Share = RN.Share;
var Clipboard = RN.Clipboard;

var useTheme = require('../../use_theme.js').useTheme;
var bumpThemeRev = require('../../use_theme.js').bumpThemeRev;
var Controls = require('../../components/settings/controls.js');
var SetCard = Controls.SetCard;
var SetNote = Controls.SetNote;
var SetButton = Controls.SetButton;
var SetTextInput = Controls.SetTextInput;
var SetChips = Controls.SetChips;

var Theme = require('../../../engine/theme.js');
var StoryStore = require('../../story_store.js');

// ------------------------------------------------------------
// 颜色转换工具（零依赖）
// ------------------------------------------------------------
function hexToRgb(hex) {
  var s = String(hex || '').replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(function (c) { return c + c; }).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16)
  };
}
function rgbToHex(r, g, b) {
  var toHex = function (n) {
    var h = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return h.length === 1 ? '0' + h : h;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
function rgbToHsv(r, g, b) {
  var rd = r / 255, gd = g / 255, bd = b / 255;
  var max = Math.max(rd, gd, bd), min = Math.min(rd, gd, bd);
  var h = 0, s = 0, v = max;
  var d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case rd: h = (gd - bd) / d + (gd < bd ? 6 : 0); break;
      case gd: h = (bd - rd) / d + 2; break;
      case bd: h = (rd - gd) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s, v: v };
}
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));
  var c = v * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = v - c;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}
function hsvToHex(h, s, v) {
  var rgb = hsvToRgb(h, s, v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// ------------------------------------------------------------
// 自绘取色器（Hue 条 + SV 面板，连续拖拽，零依赖）
// ------------------------------------------------------------
function ColorPicker(props) {
  var hsv = props.hsv;
  var onChange = props.onChange;
  var size = 220;

  var hueLayout = React.useRef(null);
  var svLayout = React.useRef(null);

  function handleHue(e) {
    var layout = hueLayout.current;
    if (!layout || !layout.width) return;
    var x = (e.nativeEvent.locationX != null) ? e.nativeEvent.locationX : 0;
    var h = Math.max(0, Math.min(360, (x / layout.width) * 360));
    onChange({ h: h, s: hsv.s, v: hsv.v });
  }
  function handleSv(e) {
    var layout = svLayout.current;
    if (!layout || !layout.width || !layout.height) return;
    var x = (e.nativeEvent.locationX != null) ? e.nativeEvent.locationX : 0;
    var y = (e.nativeEvent.locationY != null) ? e.nativeEvent.locationY : 0;
    var s = Math.max(0, Math.min(1, x / layout.width));
    var v = Math.max(0, Math.min(1, 1 - (y / layout.height)));
    onChange({ h: hsv.h, s: s, v: v });
  }

  var pureColor = hsvToHex(hsv.h, 1, 1);
  var currentColor = hsvToHex(hsv.h, hsv.s, hsv.v);

  // 指示圈位置
  var circleX = Math.round(hsv.s * size);
  var circleY = Math.round((1 - hsv.v) * size);

  return React.createElement(
    View,
    { style: { alignItems: 'center', marginVertical: 10 } },
    // 预览色块 + HEX
    React.createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 } },
      React.createElement(View, {
        style: {
          width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: '#ccc',
          backgroundColor: currentColor
        }
      }),
      React.createElement(Text, { style: { fontFamily: 'monospace', fontSize: 15, color: '#333' } }, currentColor)
    ),
    // Hue 条（彩虹 6 段）
    React.createElement(
      View,
      {
        style: { width: size, height: 28, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#ccc' },
        onLayout: function (e) { hueLayout.current = e.nativeEvent.layout; },
        onStartShouldSetResponder: function () { return true; },
        onResponderGrant: handleHue,
        onResponderMove: handleHue
      },
      [
        { bg: '#ff0000' }, { bg: '#ffff00' }, { bg: '#00ff00' },
        { bg: '#00ffff' }, { bg: '#0000ff' }, { bg: '#ff00ff' }
      ].map(function (seg, i) {
        return React.createElement(View, { key: 'hue' + i, style: { flex: 1, backgroundColor: seg.bg } });
      })
    ),
    // Hue 滑块指示器
    React.createElement(
      View,
      { style: { width: size, height: 4, marginTop: 2, marginBottom: 8 } },
      React.createElement(View, {
        style: {
          position: 'absolute',
          left: Math.max(0, Math.min(size - 4, (hsv.h / 360) * size)),
          top: 0,
          width: 4,
          height: 14,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#000',
          borderRadius: 2,
          marginTop: -5
        }
      })
    ),
    // SV 面板
    React.createElement(
      View,
      {
        style: {
          width: size,
          height: size,
          backgroundColor: pureColor,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: '#ccc',
          overflow: 'hidden'
        },
        onLayout: function (e) { svLayout.current = e.nativeEvent.layout; },
        onStartShouldSetResponder: function () { return true; },
        onResponderGrant: handleSv,
        onResponderMove: handleSv
      },
      // 白色→透明（Saturation 渐变）用一层 overlay 模拟
      React.createElement(View, {
        style: {
          position: 'absolute',
          left: 0, top: 0, right: 0, bottom: 0,
          backgroundColor: '#fff',
          opacity: 1 - hsv.s
        }
      }),
      // 黑色→透明（Value 渐变）——这里用静态黑色渐变 overlay，
      // 但 RN 无渐变，改为背景纯色 + 指示器足够表达语义。
      // 为了更接近，放一个从底部向上的黑色半透明遮罩表示暗角。
      React.createElement(View, {
        style: {
          position: 'absolute',
          left: 0, top: 0, right: 0, bottom: 0,
          backgroundColor: '#000',
          opacity: 1 - hsv.v
        }
      }),
      // 指示圈
      React.createElement(View, {
        style: {
          position: 'absolute',
          left: Math.max(0, Math.min(size - 12, circleX - 6)),
          top: Math.max(0, Math.min(size - 12, circleY - 6)),
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: '#fff',
          backgroundColor: 'transparent'
        }
      })
    )
  );
}

// ------------------------------------------------------------
// ColorTab 主组件
// ------------------------------------------------------------
function ColorTab() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var groups = Theme.COLOR_GROUPS || [];
  var labels = Theme.COLOR_LABELS || {};

  // 当前选中的分组
  var groupState = React.useState((groups[0] && groups[0].id) || 'bg');
  var activeGroupId = groupState[0];
  var setActiveGroupId = groupState[1];

  // 当前选中的色键
  var keyState = React.useState(null);
  var activeKey = keyState[0];
  var setActiveKey = keyState[1];

  // HSV 状态
  var hsvState = React.useState({ h: 0, s: 0, v: 1 });
  var hsv = hsvState[0];
  var setHsv = hsvState[1];

  // HEX 输入
  var hexState = React.useState('');
  var hexInput = hexState[0];
  var setHexInput = hexState[1];

  // 槽位
  var slotsState = React.useState([]);
  var slots = slotsState[0];
  var setSlots = slotsState[1];

  // 槽位编辑态 {index, text}
  var editState = React.useState(null);
  var editingSlot = editState[0];
  var setEditingSlot = editState[1];

  // 导入
  var importState = React.useState('');
  var importText = importState[0];
  var setImportText = importState[1];
  var importMsgState = React.useState(null);
  var importMsg = importMsgState[0];
  var setImportMsg = importMsgState[1];

  // 刷新槽位
  function refreshSlots() {
    try { setSlots(Theme.listSlots()); } catch (e) { setSlots([]); }
  }
  React.useEffect(function () {
    refreshSlots();
  }, []);

  // activeKey 变化时同步 HSV
  React.useEffect(function () {
    if (!activeKey) return;
    var color = (themeApi.theme && themeApi.theme.colors && themeApi.theme.colors[activeKey]) || '#f5f3ee';
    var rgb = hexToRgb(color);
    if (rgb) {
      var hsv0 = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setHsv(hsv0);
      setHexInput(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
  }, [activeKey, themeApi.theme]);

  // HSV 变化时同步 HEX 输入（仅在非用户输入 HEX 时）
  React.useEffect(function () {
    if (!activeKey) return;
    setHexInput(hsvToHex(hsv.h, hsv.s, hsv.v));
  }, [hsv]);

  function toast(msg, type) {
    StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 });
  }

  // ---------- 分组切换 ----------
  var groupOptions = groups.map(function (g) {
    return { value: g.id, label: g.name };
  });
  var activeGroup = null;
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === activeGroupId) { activeGroup = groups[i]; break; }
  }

  // ---------- 色键列表 ----------
  function renderKeyList() {
    if (!activeGroup) return null;
    var curColors = (themeApi.theme && themeApi.theme.colors) || {};
    return React.createElement(
      View,
      { style: { marginTop: 8 } },
      activeGroup.keys.map(function (k) {
        var color = curColors[k] || '#cccccc';
        var isActive = k === activeKey;
        return React.createElement(
          TouchableOpacity,
          {
            key: k,
            onPress: function () { setActiveKey(k); },
            style: {
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
              paddingHorizontal: 10,
              marginBottom: 6,
              borderRadius: tk.radius.sm,
              borderWidth: 1,
              borderColor: isActive ? c.primary : c.hair,
              backgroundColor: isActive ? c.primary + '15' : c.bgCard
            }
          },
          React.createElement(View, {
            style: {
              width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: c.hair,
              backgroundColor: color, marginRight: 10
            }
          }),
          React.createElement(Text, { style: { flex: 1, fontSize: f.sm, color: c.ink } }, labels[k] || k),
          React.createElement(Text, { style: { fontSize: f.xs, color: c.muted, fontFamily: tk.fonts.mono } }, color)
        );
      })
    );
  }

  // ---------- 应用 / 重置 ----------
  function applyColor() {
    if (!activeKey) { toast('先选择一个色键', 'warn'); return; }
    var hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    try {
      var r = Theme.setColorOverride(activeKey, hex);
      if (!r.ok) { toast(r.reason || '应用失败', 'error'); return; }
      bumpThemeRev();
      toast('已应用自定义色值', 'success');
    } catch (e) {
      toast('应用异常：' + e.message, 'error');
    }
  }
  function resetColors() {
    try {
      Theme.clearOverrides();
      bumpThemeRev();
      toast('已重置为预设主题', 'success');
    } catch (e) {
      toast('重置异常：' + e.message, 'error');
    }
  }

  // ---------- HEX 手动输入 ----------
  function onHexChange(text) {
    setHexInput(text);
    var rgb = hexToRgb(text);
    if (rgb && activeKey) {
      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    }
  }

  // ---------- 槽位操作 ----------
  function startSaveSlot(index) {
    setEditingSlot({ index: index, text: '' });
  }
  function commitSaveSlot() {
    if (!editingSlot) return;
    var name = String(editingSlot.text || '').trim();
    if (!name) { toast('名称不能为空', 'warn'); return; }
    try {
      var r = Theme.saveSlot(editingSlot.index, name);
      if (r.ok) { toast('已保存到槽位 ' + (r.index + 1), 'success'); }
      else { toast(r.reason || '保存失败', 'error'); }
    } catch (e) { toast('保存异常：' + e.message, 'error'); }
    setEditingSlot(null);
    refreshSlots();
  }
  function loadSlot(index) {
    try {
      var r = Theme.loadSlot(index);
      if (r.ok) {
        bumpThemeRev();
        toast('已切换到「' + r.name + '」', 'success');
      } else {
        toast(r.reason || '加载失败', 'error');
      }
    } catch (e) { toast('加载异常：' + e.message, 'error'); }
    refreshSlots();
  }
  function deleteSlot(index) {
    Platform.ui.confirmAsync('清除槽位 ' + (index + 1) + '？')
      .then(function (ok) {
        if (!ok) return;
        try {
          Theme.deleteSlot(index);
          toast('已清除', 'success');
        } catch (e) { toast('清除异常：' + e.message, 'error'); }
        refreshSlots();
      });
  }
  function startRenameSlot(index) {
    var slot = slots[index];
    if (!slot || !slot.hasData) return;
    setEditingSlot({ index: index, text: slot.name || '' });
  }
  function commitRenameSlot() {
    if (!editingSlot) return;
    var name = String(editingSlot.text || '').trim();
    if (!name) { toast('名称不能为空', 'warn'); return; }
    try {
      var r = Theme.renameSlot(editingSlot.index, name);
      if (r.ok) { toast('已重命名', 'success'); }
      else { toast(r.reason || '重命名失败', 'error'); }
    } catch (e) { toast('重命名异常：' + e.message, 'error'); }
    setEditingSlot(null);
    refreshSlots();
  }

  // ---------- 主题包 ----------
  function shareOrCopy(text, okLabel) {
    Share.share({ message: text, title: okLabel })
      .then(function (res) {
        if (res && res.action === Share.sharedAction) toast(okLabel + ' 已发送', 'success');
      })
      .catch(function () {
        Clipboard.setString(text);
        toast(okLabel + ' 已复制到剪贴板（请手动粘贴保存）', 'info');
      });
  }
  function doExportTheme() {
    try {
      var text = Theme.exportTheme();
      shareOrCopy(text, '主题包已导出');
    } catch (e) { toast('导出失败：' + e.message, 'error'); }
  }
  function doImportTheme() {
    var raw = String(importText || '').trim();
    if (!raw) { setImportMsg({ type: 'warn', text: '内容为空' }); return; }
    var text = raw
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    try {
      var r = Theme.importTheme(text);
      if (!r.ok) { setImportMsg({ type: 'error', text: '导入失败：' + r.reason }); return; }
      bumpThemeRev();
      setImportMsg({ type: 'success', text: '已应用主题「' + r.name + '」' });
      setImportText('');
    } catch (e) {
      setImportMsg({ type: 'error', text: '导入异常：' + e.message });
    }
  }

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      View,
      { style: { paddingBottom: 24 } },

      // === 分组选择 ===
      React.createElement(
        SetCard,
        { title: '配色分组' },
        React.createElement(SetChips, {
          options: groupOptions,
          value: activeGroupId,
          onChange: function (id) { setActiveGroupId(id); setActiveKey(null); }
        }),
        renderKeyList()
      ),

      // === 取色器 ===
      activeKey ? React.createElement(
        SetCard,
        { title: '取色器 · ' + (labels[activeKey] || activeKey) },
        React.createElement(ColorPicker, {
          hsv: hsv,
          onChange: function (next) { setHsv(next); }
        }),
        React.createElement(
          View,
          { style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 } },
          React.createElement(Text, { style: { fontSize: f.sm, color: c.ink } }, 'HEX'),
          React.createElement(TextInput, {
            value: hexInput,
            onChangeText: onHexChange,
            style: {
              flex: 1,
              borderWidth: 1,
              borderColor: c.hairStrong,
              borderRadius: tk.radius.sm,
              paddingHorizontal: 10,
              paddingVertical: 6,
              fontSize: f.sm,
              color: c.text,
              fontFamily: tk.fonts.mono
            }
          })
        ),
        React.createElement(
          View,
          { style: { flexDirection: 'row', gap: 10, marginTop: 12 } },
          React.createElement(SetButton, { label: '应用', onPress: applyColor, kind: 'primary' }),
          React.createElement(SetButton, { label: '重置', onPress: resetColors })
        )
      ) : null,

      // === 我的主题 7 槽位 ===
      React.createElement(
        SetCard,
        { title: '我的主题（7 槽位）' },
        React.createElement(SetNote, null, '点击空槽位保存当前主题；点击已有槽位直接切换。'),
        React.createElement(
          View,
          { style: { marginTop: 6 } },
          slots.map(function (slot, idx) {
            var isEditing = editingSlot && editingSlot.index === idx;
            return React.createElement(
              View,
              {
                key: 'slot' + idx,
                style: {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderBottomWidth: idx < slots.length - 1 ? 1 : 0,
                  borderBottomColor: c.hair
                }
              },
              React.createElement(Text, {
                style: { width: 26, fontSize: f.xs, color: c.muted }
              }, (idx + 1) + '.'),
              !slot.hasData && !isEditing ? React.createElement(
                TouchableOpacity,
                { onPress: function () { startSaveSlot(idx); } },
                React.createElement(Text, { style: { fontSize: f.sm, color: c.primary } }, '+ 保存当前主题')
              ) : null,
              slot.hasData && !isEditing ? React.createElement(
                View,
                { style: { flex: 1, flexDirection: 'row', alignItems: 'center' } },
                React.createElement(Text, { style: { flex: 1, fontSize: f.sm, color: c.ink } }, slot.name || ('主题' + (idx + 1))),
                React.createElement(TouchableOpacity, {
                  onPress: function () { loadSlot(idx); },
                  style: { marginHorizontal: 6, padding: 4 }
                }, React.createElement(Text, { style: { fontSize: f.xs, color: c.primary } }, '加载')),
                React.createElement(TouchableOpacity, {
                  onPress: function () { startRenameSlot(idx); },
                  style: { marginHorizontal: 6, padding: 4 }
                }, React.createElement(Text, { style: { fontSize: f.xs, color: c.ink2 } }, '重命名')),
                React.createElement(TouchableOpacity, {
                  onPress: function () { deleteSlot(idx); },
                  style: { marginHorizontal: 6, padding: 4 }
                }, React.createElement(Text, { style: { fontSize: f.xs, color: c.danger } }, '删除'))
              ) : null,
              isEditing ? React.createElement(
                View,
                { style: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 } },
                React.createElement(TextInput, {
                  value: editingSlot.text,
                  onChangeText: function (t) { setEditingSlot({ index: idx, text: t }); },
                  placeholder: '主题名称',
                  autoFocus: true,
                  style: {
                    flex: 1,
                    borderWidth: 1,
                    borderColor: c.hairStrong,
                    borderRadius: tk.radius.sm,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    fontSize: f.sm,
                    color: c.text
                  }
                }),
                React.createElement(TouchableOpacity, {
                  onPress: function () {
                    if (slot.hasData) commitRenameSlot();
                    else commitSaveSlot();
                  }
                }, React.createElement(Text, { style: { fontSize: f.sm, color: c.primary } }, '确定')),
                React.createElement(TouchableOpacity, {
                  onPress: function () { setEditingSlot(null); }
                }, React.createElement(Text, { style: { fontSize: f.sm, color: c.muted } }, '取消'))
              ) : null
            );
          })
        )
      ),

      // === 主题包导入导出 ===
      React.createElement(
        SetCard,
        { title: '主题包' },
        React.createElement(
          View,
          { style: { flexDirection: 'row', gap: 10, marginBottom: 8 } },
          React.createElement(SetButton, { label: '导出主题包', onPress: doExportTheme }),
          React.createElement(SetButton, { label: '粘贴导入', onPress: doImportTheme, kind: 'primary' })
        ),
        React.createElement(SetTextInput, {
          value: importText,
          onChangeText: setImportText,
          placeholder: '粘贴主题包 JSON…',
          multiline: true,
          rows: 4
        }),
        importMsg ? React.createElement(
          Text,
          {
            style: {
              marginTop: 6,
              fontSize: f.sm,
              color: importMsg.type === 'error' ? c.danger : (importMsg.type === 'warn' ? c.warning : c.success)
            }
          },
          importMsg.text
        ) : null
      )
    )
  );
}

module.exports = { ColorTab: ColorTab };

// ============================================================
// 战役 4 · 批次 4-5b：设置页 · AI 配置 tab（B 类）
// grounding：ui_settings.js renderApiInto（L11-73）+ pickApi/addApi/
//   addApiPreset/dupApi/delApi/updateActiveApi（L109-119）+ testApi
//   （L121-133）。
//   - 配置列表（name/model·baseUrl + 当前 badge + 复制/删除）
//   - + 新增配置 / 快速添加预设（PRESETS 跳过「自定义」）
//   - 编辑当前配置：名/Base URL/API Key/模型（select+自定义输入）/
//     温度/Top P/最大输出（SetStepper，用户裁决 4）/JSON Mode，
//     全部「修改自动保存」即时写（updateActiveApi 语义）
//   - 测试连通：ApiClient.chat（RN 侧走 Platform.http → fetch），
//     成功截断 80 字 / 失败显原因（用户裁决 3：ApiClient 已挂载）
// 数据层：globalThis.ApiManager（bootstrap L116）/ ApiClient（L115）；
//   模型清单走 settings_model.getModelsForBaseUrl（A 类，Node 可测）。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../use_theme.js').useTheme;
var Model = require('../../settings_model.js');
var Controls = require('../../components/settings/controls.js');

function ApiTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  // ver：列表操作后 bump 重读 ApiManager；cur：当前配置本地副本（受控输入）
  var verState = React.useState(0);
  var ver = verState[0];
  var bumpVer = verState[1];

  var all = null;
  try { all = globalThis.ApiManager.getAll(); } catch (e) { all = { profiles: [], activeId: null }; }
  var cur = null;
  try { cur = globalThis.ApiManager.getActive(); } catch (e2) { cur = null; }

  var curState = React.useState(function () { return snapshotCur(cur); });
  var cs = curState[0];
  var setCs = curState[1];

  // activeId 变化（pick/add/dup 后）时重置本地副本
  React.useEffect(function () {
    setCs(snapshotCur(cur));
    // eslint 依赖豁免：ver 变化即重读
  }, [ver, all && all.activeId]);

  function snapshotCur(c0) {
    if (!c0) return null;
    return {
      name: c0.name || '', baseUrl: c0.baseUrl || '', apiKey: c0.apiKey || '',
      model: c0.model || '', temperature: c0.temperature, top_p: c0.top_p,
      max_tokens: c0.max_tokens, jsonMode: c0.jsonMode || 'auto'
    };
  }

  function updateActive(patch) {
    try { globalThis.ApiManager.update(cur.id, patch); } catch (e3) {}
  }

  function setField(key, v) {
    var patch = {};
    patch[key] = v;
    setCs(function (prev) { return Object.assign({}, prev, patch); });
    updateActive(patch);
  }

  // ---- 列表操作（pickApi/addApi/addApiPreset/dupApi/delApi 语义）----
  function pick(id) {
    globalThis.ApiManager.setActive(id);
    bumpVer(function (v) { return v + 1; });
  }
  function add() {
    var p = globalThis.ApiManager.add();
    globalThis.ApiManager.setActive(p.id);
    bumpVer(function (v) { return v + 1; });
  }
  function addPreset(i) {
    var pre = globalThis.ApiManager.PRESETS[i];
    var p = globalThis.ApiManager.add(pre);
    globalThis.ApiManager.setActive(p.id);
    bumpVer(function (v) { return v + 1; });
  }
  function dup(id) {
    var cpy = globalThis.ApiManager.duplicate(id);
    if (cpy) bumpVer(function (v) { return v + 1; });
  }
  function del(id) {
    Platform.ui.confirmAsync('删除此配置？').then(function (ok) {
      if (!ok) return;
      globalThis.ApiManager.remove(id);
      bumpVer(function (v) { return v + 1; });
    });
  }

  // ---- 测试连通（testApi 语义）----
  var testState = React.useState(null); // null | {running} | {ok, detail} | {fail, detail}
  var test = testState[0];
  var setTest = testState[1];

  function runTest() {
    setTest({ running: true });
    var ApiClient = globalThis.ApiClient;
    ApiClient.chat([{ role: 'user', content: '回复 OK 两个字' }], { max_tokens: 100, temperature: 0 })
      .then(function (content) {
        setTest({ ok: true, detail: String(content).slice(0, 80) });
      })
      .catch(function (e4) {
        setTest({ ok: false, detail: e4 && e4.message ? e4.message : String(e4) });
      });
  }

  // ---- 模型清单（_getModelsForBaseUrl 同构，A 类下沉）----
  var knownModels = Model.getModelsForBaseUrl(cs ? cs.baseUrl : '');
  var curModel = cs ? (cs.model || '') : '';
  var isKnown = knownModels.indexOf(curModel) >= 0;
  var selectValue = isKnown ? curModel : (curModel ? '__custom__' : '');

  var modelOptions = knownModels.map(function (m) { return { value: m, label: m }; });
  modelOptions.push({ value: '__custom__', label: '自定义…' });

  return React.createElement(
    View,
    { style: { flex: 1 } },

    // ---- 配置列表卡 ----
    React.createElement(
      Controls.SetCard,
      { title: 'AI 配置' },
      (all.profiles || []).map(function (p) {
        var active = p.id === all.activeId;
        return React.createElement(
          View,
          {
            key: p.id,
            style: {
              borderWidth: 1, borderColor: active ? c.primary : c.hairStrong,
              borderRadius: tk.radius.sm, padding: 10, marginBottom: 8
            }
          },
          React.createElement(
            TouchableOpacity,
            { onPress: function () { pick(p.id); } },
            React.createElement(
              View,
              { style: { flexDirection: 'row', alignItems: 'center' } },
              React.createElement(
                View,
                { style: { flex: 1, minWidth: 0 } },
                React.createElement(
                  Text,
                  { style: { fontSize: f.sm, color: c.ink, fontWeight: active ? '700' : '400' } },
                  (p.name || '未命名') + (active ? '  〔当前〕' : '')
                ),
                React.createElement(
                  Text,
                  { style: { fontSize: f.xs, color: c.muted, marginTop: 2 } },
                  (p.model || '（未填模型）') + ' · ' + (p.baseUrl || '（未填地址）')
                )
              )
            )
          ),
          React.createElement(
            View,
            { style: { flexDirection: 'row', gap: 8, marginTop: 8 } },
            React.createElement(
              TouchableOpacity,
              { onPress: function () { dup(p.id); }, style: { borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, paddingHorizontal: 10, paddingVertical: 4 } },
              React.createElement(Text, { style: { fontSize: f.xs, color: c.ink2 } }, '复制')
            ),
            React.createElement(
              TouchableOpacity,
              { onPress: function () { del(p.id); }, style: { borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, paddingHorizontal: 10, paddingVertical: 4 } },
              React.createElement(Text, { style: { fontSize: f.xs, color: c.danger } }, '删除')
            )
          )
        );
      }),
      React.createElement(
        View,
        { style: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 14 } },
        React.createElement(Controls.SetButton, { label: '+ 新增配置', onPress: add, kind: 'primary' })
      ),
      React.createElement(
        Controls.SetNote,
        null,
        '快速添加预设：'
      ),
      React.createElement(
        View,
        { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
        (globalThis.ApiManager.PRESETS || []).map(function (p, i) {
          if (p.name === '自定义') return null;
          return React.createElement(
            TouchableOpacity,
            {
              key: 'pre' + i,
              onPress: function () { addPreset(i); },
              style: { borderWidth: 1, borderColor: c.hairStrong, borderRadius: tk.radius.sm, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.bgCard }
            },
            React.createElement(Text, { style: { fontSize: f.xs, color: c.ink2 } }, p.name)
          );
        })
      )
    ),

    // ---- 编辑当前配置卡 ----
    cs
      ? React.createElement(
          Controls.SetCard,
          { title: '编辑当前配置（修改自动保存）' },
          React.createElement(Controls.SetRow, { label: '配置名' },
            React.createElement(
              View,
              { style: { width: 180 } },
              React.createElement(Controls.SetTextInput, { value: cs.name, onChangeText: function (v) { setField('name', v); } })
            )),
          React.createElement(Controls.SetRow, { label: 'Base URL' },
            React.createElement(
              View,
              { style: { width: 180 } },
              React.createElement(Controls.SetTextInput, { value: cs.baseUrl, onChangeText: function (v) { setField('baseUrl', v); } })
            )),
          React.createElement(Controls.SetRow, { label: 'API Key' },
            React.createElement(
              View,
              { style: { width: 180 } },
              React.createElement(Controls.SetTextInput, { value: cs.apiKey, onChangeText: function (v) { setField('apiKey', v); }, secure: true })
            )),
          React.createElement(Controls.SetSelect, {
            label: '模型名',
            value: selectValue,
            options: modelOptions,
            onChange: function (v) {
              if (v === '__custom__') {
                // onModelSelectChange 语义：自定义 → 显示输入框（下方 TextInput 常显，无需切换）
                setCs(function (prev) { return Object.assign({}, prev); });
              } else if (v) {
                setField('model', v);
              }
            }
          }),
          selectValue === '__custom__'
            ? React.createElement(
                View,
                { style: { marginTop: 6 } },
                React.createElement(Controls.SetTextInput, {
                  value: curModel,
                  placeholder: '手动输入模型名',
                  onChangeText: function (v) { setField('model', v); }
                })
              )
            : null,
          React.createElement(Controls.SetRow, { label: '温度' },
            React.createElement(Controls.SetStepper, {
              value: cs.temperature, min: 0, max: 2, step: 0.1,
              format: function (v) { return Number(v).toFixed(1); },
              onChange: function (v) { setField('temperature', v); }
            })),
          React.createElement(Controls.SetRow, { label: 'Top P' },
            React.createElement(Controls.SetStepper, {
              value: cs.top_p, min: 0, max: 1, step: 0.05,
              format: function (v) { return Number(v).toFixed(2); },
              onChange: function (v) { setField('top_p', v); }
            })),
          React.createElement(Controls.SetRow, { label: '最大输出' },
            React.createElement(Controls.SetStepper, {
              value: cs.max_tokens, min: 256, max: 131072, step: 1024,
              onChange: function (v) { setField('max_tokens', v); }
            })),
          React.createElement(Controls.SetSelect, {
            label: 'JSON Mode',
            value: cs.jsonMode,
            options: [
              { value: 'auto', label: '自动（推荐）' },
              { value: 'on', label: '强制开' },
              { value: 'off', label: '关闭' }
            ],
            onChange: function (v) { setField('jsonMode', v); }
          }),
          React.createElement(
            View,
            { style: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 } },
            React.createElement(Controls.SetButton, { label: '测试连通', onPress: runTest, kind: 'primary' }),
            test && test.running
              ? React.createElement(Text, { style: { fontSize: f.xs, color: c.muted } }, '正在测试…')
              : null,
            test && test.ok
              ? React.createElement(Text, { style: { fontSize: f.xs, color: c.success, flexShrink: 1 } }, '✓ 连通 ' + test.detail)
              : null,
            test && test.ok === false
              ? React.createElement(Text, { style: { fontSize: f.xs, color: c.danger, flexShrink: 1 } }, '✗ 失败 ' + test.detail)
              : null
          )
        )
      : React.createElement(
          Controls.SetCard,
          { title: '编辑当前配置' },
          React.createElement(Controls.SetNote, { first: true }, '（暂无可用配置，先新增一个）')
        )
  );
}

module.exports = { ApiTab: ApiTab };

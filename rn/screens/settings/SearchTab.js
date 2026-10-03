// ============================================================
// 战役 P2 · S1：设置页 · 联网搜索 tab（B 类）
// grounding：ui_settings.js renderSearchInto（L135-197）+ pickSearch（L199）
//   + addSearch（L201）+ addSearchPreset（L203）+ dupSearch（L205）
//   + delSearch（L207）+ updateActiveSearch（L209）+ testSearch（L211-233）。
// 数据层：globalThis.WebSearchManager（rn_bootstrap.js 装载，两仓逐字节同源）；
//   密钥/配置落 Storage.getGlobal().search（引擎侧口径，非 settings 段）。
//   测试关键词表照 ui.js:113 TEST_KEYWORDS 逐字。
// 文案逐字照桌面；RN 侧不搬 HTML。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Text = RN.Text;
var TouchableOpacity = RN.TouchableOpacity;

var useTheme = require('../../use_theme.js').useTheme;
var Controls = require('../../components/settings/controls.js');
var StoryStore = require('../../story_store.js');

// ui.js:113 TEST_KEYWORDS 逐字
var TEST_KEYWORDS = [
  '海猫络合物',
  '奈亚拉托提普',
  '莎布尼古拉斯',
  '犹格索托斯',
  '睫角守宫',
  '鬃狮蜥',
  '空洞骑士',
  '丝之歌',
  '博德之门3'
];

// 后端类型下拉项（ui_settings.js:180-185 逐字）
var BACKEND_OPTIONS = [
  { value: 'bocha', label: '博查 Bocha' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'serper', label: 'Serper' },
  { value: 'google', label: 'Google CSE' },
  { value: 'bing', label: 'Bing' },
  { value: 'custom', label: '自定义' }
];

function SearchTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  function WSM() { return globalThis.WebSearchManager; }

  // ver：任何写操作后 bump 重读；curSnap：当前配置本地副本（受控输入）
  var verState = React.useState(0);
  var ver = verState[0];
  var bumpVer = verState[1];

  var s = null;
  try { s = WSM().getAll(); } catch (e) { s = { profiles: [], activeId: null, enabled: false }; }
  var cur = null;
  try { cur = WSM().getActive(); } catch (e2) { cur = null; }

  var curState = React.useState(function () { return snapshotCur(cur); });
  var cs = curState[0];
  var setCs = curState[1];

  React.useEffect(function () {
    setCs(snapshotCur(cur));
    // eslint 依赖豁免：ver 变化即重读
  }, [ver, s && s.activeId]);

  function snapshotCur(c0) {
    if (!c0) return null;
    return {
      name: c0.name || '',
      backend: c0.backend || 'bocha',
      endpoint: c0.endpoint || '',
      apiKey: c0.apiKey || '',
      cx: c0.cx || '',
      count: c0.count || 3
    };
  }

  function toast(msg, type) {
    StoryStore.pushToast(msg, { type: type || 'info', duration: 3000 });
  }

  function updateActive(patch) {
    try { WSM().update(cur.id, patch); } catch (e3) {}
  }
  function setField(key, v) {
    var patch = {};
    patch[key] = v;
    setCs(function (prev) { return Object.assign({}, prev, patch); });
    updateActive(patch);
  }

  // ---- 总开关（setEnabled + 重渲染语义同 showSettingsTab('search')）----
  function toggleEnabled(b) {
    try { WSM().setEnabled(b); } catch (e4) {}
    bumpVer(function (v) { return v + 1; });
  }

  // ---- 列表操作 ----
  function pick(id) { WSM().setActive(id); bumpVer(function (v) { return v + 1; }); }
  function add() {
    var p = WSM().add();
    if (p) WSM().setActive(p.id);
    bumpVer(function (v) { return v + 1; });
  }
  function addPreset(i) {
    var pre = WSM().PRESETS[i];
    var p = WSM().add(pre);
    if (p) WSM().setActive(p.id);
    bumpVer(function (v) { return v + 1; });
  }
  function dup(id) {
    var cpy = WSM().duplicate(id);
    if (cpy) bumpVer(function (v) { return v + 1; });
  }
  function del(id) {
    // 引擎侧 remove 在 <=1 时靠 UI.toast 提示（RN 无 UI），此处先判再确认。
    var all = WSM().getAll();
    if (all.profiles.length <= 1) { toast('至少保留一个配置', 'warn'); return; }
    Platform.ui.confirmAsync('删除？').then(function (ok) {
      if (!ok) return;
      WSM().remove(id);
      bumpVer(function (v) { return v + 1; });
    });
  }

  // ---- 测试搜索（testSearch 语义，:211-233）----
  var testState = React.useState(null); // null | {running} | {ok, count, duration, titles} | {fail, detail} | {err, detail}
  var test = testState[0];
  var setTest = testState[1];

  function runTest() {
    var kw = TEST_KEYWORDS[Math.floor(Math.random() * TEST_KEYWORDS.length)];
    setTest({ running: true, kw: kw });
    WSM().query(kw, { count: 3 }).then(function (r) {
      if (r.ok) {
        setTest({
          ok: true, count: r.count, duration: r.duration,
          titles: r.results.slice(0, 3).map(function (it) { return String(it.title || '').slice(0, 60); })
        });
      } else {
        setTest({ fail: true, detail: r.reason });
      }
    }).catch(function (e5) {
      setTest({ err: true, detail: e5 && e5.message ? e5.message : String(e5) });
    });
  }

  var enabled = !!s.enabled;

  return React.createElement(
    View,
    { style: { flex: 1 } },

    // ---- 总开关卡 ----
    React.createElement(
      Controls.SetCard,
      { title: '联网搜索' },
      React.createElement(Controls.SetSwitchRow, {
        label: '启用联网搜索',
        value: enabled,
        onValueChange: toggleEnabled,
        desc: '开启后 AI 可在需要时主动调 web_search，玩家输入框也可打 /search 关键词'
      })
    ),

    !enabled
      ? React.createElement(
          Controls.SetCard,
          { title: '搜索配置' },
          React.createElement(Controls.SetNote, { first: true }, '开启后才能配置搜索服务')
        )
      : React.createElement(
          View,
          { style: { flex: 1 } },

          // ---- 配置列表 ----
          React.createElement(
            Controls.SetCard,
            { title: '搜索配置' },
            (s.profiles || []).map(function (p) {
              var active = p.id === s.activeId;
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
                    { style: { minWidth: 0 } },
                    React.createElement(
                      Text,
                      { style: { fontSize: f.sm, color: c.ink, fontWeight: active ? '700' : '400' } },
                      (p.name || '未命名') + (active ? '  〔当前〕' : '')
                    ),
                    React.createElement(
                      Text,
                      { style: { fontSize: f.xs, color: c.muted, marginTop: 2 } },
                      (p.backend || '') + ' · ' + (p.endpoint || '（未填地址）')
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
              React.createElement(Controls.SetButton, { label: '+ 新增', onPress: add, kind: 'primary' })
            ),
            React.createElement(Controls.SetNote, null, '预设：'),
            React.createElement(
              View,
              { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
              (WSM().PRESETS || []).map(function (p, i) {
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

          // ---- 编辑当前配置 ----
          cs
            ? React.createElement(
                Controls.SetCard,
                { title: '编辑当前搜索配置' },
                React.createElement(Controls.SetRow, { label: '配置名' },
                  React.createElement(
                    View,
                    { style: { width: 180 } },
                    React.createElement(Controls.SetTextInput, { value: cs.name, onChangeText: function (v) { setField('name', v); } })
                  )),
                React.createElement(Controls.SetSelect, {
                  label: '后端类型',
                  value: cs.backend,
                  options: BACKEND_OPTIONS,
                  onChange: function (v) { setField('backend', v); }
                }),
                React.createElement(Controls.SetRow, { label: 'API Endpoint' },
                  React.createElement(
                    View,
                    { style: { width: 180 } },
                    React.createElement(Controls.SetTextInput, { value: cs.endpoint, onChangeText: function (v) { setField('endpoint', v); } })
                  )),
                React.createElement(Controls.SetRow, { label: 'API Key' },
                  React.createElement(
                    View,
                    { style: { width: 180 } },
                    React.createElement(Controls.SetTextInput, { value: cs.apiKey, onChangeText: function (v) { setField('apiKey', v); }, secure: true })
                  )),
                cs.backend === 'google'
                  ? React.createElement(Controls.SetRow, { label: 'Google CX' },
                      React.createElement(
                        View,
                        { style: { width: 180 } },
                        React.createElement(Controls.SetTextInput, { value: cs.cx, onChangeText: function (v) { setField('cx', v); } })
                      ))
                  : null,
                React.createElement(Controls.SetRow, { label: '每次返回几条' },
                  React.createElement(Controls.SetStepper, {
                    value: cs.count, min: 1, max: 10, step: 1,
                    onChange: function (v) { setField('count', v); }
                  })),
                React.createElement(
                  View,
                  { style: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 } },
                  React.createElement(Controls.SetButton, { label: '测试搜索', onPress: runTest, kind: 'primary' }),
                  test && test.running
                    ? React.createElement(Text, { style: { fontSize: f.xs, color: c.muted, flexShrink: 1 } }, '正在搜索"' + test.kw + '"')
                    : null
                ),
                test && test.ok
                  ? React.createElement(
                      View,
                      { style: { marginTop: 8 } },
                      React.createElement(Text, { style: { fontSize: f.sm, color: c.success } },
                        '搜索成功，' + test.count + ' 条 / ' + test.duration + 'ms'),
                      test.titles.map(function (t, i) {
                        return React.createElement(Text, { key: 't' + i, style: { fontSize: f.xs, color: c.muted, marginTop: 2 } },
                          (i + 1) + '. ' + t);
                      })
                    )
                  : null,
                test && test.fail
                  ? React.createElement(
                      View,
                      { style: { marginTop: 8 } },
                      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '失败'),
                      React.createElement(Text, { style: { fontSize: f.xs, color: c.muted, marginTop: 2 } }, String(test.detail))
                    )
                  : null,
                test && test.err
                  ? React.createElement(
                      View,
                      { style: { marginTop: 8 } },
                      React.createElement(Text, { style: { fontSize: f.sm, color: c.danger } }, '异常'),
                      React.createElement(Text, { style: { fontSize: f.xs, color: c.muted, marginTop: 2 } }, String(test.detail))
                    )
                  : null
              )
            : React.createElement(
                Controls.SetCard,
                { title: '编辑当前搜索配置' },
                React.createElement(Controls.SetNote, { first: true }, '（暂无可用配置，先新增一个）')
              )
        )
  );
}

module.exports = { SearchTab: SearchTab };

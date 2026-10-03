// ============================================================
// 战役 4 · 批次 4-5a：设置页 · 天气 tab（B 类）
// grounding：ui_panels.js renderWeatherSettings（L256-311）+ 三个
//   _setWeatherPatch/_weatherRefreshNow/_weatherRefreshIp（L313-345）
//   - 模式三档 select 即时写（Weather.setConfig → g.weather）
//   - 卡带覆盖警告（card.worldbook.weather.mode 优先于全局）
//   - real 模式条件显示：来源 / 手动城市 / 缓存刷新 + 刷新按钮×2
//   - 当前状态行（Weather.getCurrent）
// 数据层：engine/weather.js 模块 API（RN 仓已有，bootstrap 已挂载）
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var ScrollView = RN.ScrollView;
var Text = RN.Text;

var useTheme = require('../../use_theme.js').useTheme;
var Controls = require('../../components/settings/controls.js');

function WeatherTab() {
  var tk = useTheme().tokens;
  var c = tk.colors;
  var f = tk.fontSizes;

  var st = React.useState(function () { return globalThis.Weather.getConfig(); });
  var cfg = st[0];
  var setCfg = st[1];

  var cardMode = null;
  try {
    var card = globalThis.GameState.currentCard;
    var cardCfg = card && card.worldbook && card.worldbook.weather || null;
    cardMode = cardCfg && cardCfg.mode;
  } catch (e) { cardMode = null; }

  function patch(p) {
    globalThis.Weather.setConfig(p);
    setCfg(globalThis.Weather.getConfig());
  }

  var cur = null;
  try { cur = globalThis.Weather.getCurrent(); } catch (e2) { cur = null; }

  function refreshNow() {
    globalThis.Weather.refreshNow().then(function (r) {
      if (r && r.ok) {
        try { Platform.ui.toast('已刷新：' + r.type + '（' + r.city + '）', { type: 'success' }); } catch (e3) {}
      } else {
        try { Platform.ui.toast('刷新失败：' + (r && r.reason), { type: 'error' }); } catch (e4) {}
      }
      setCfg(globalThis.Weather.getConfig());
    }).catch(function (e5) {
      try { Platform.ui.toast('刷新异常：' + e5.message, { type: 'error' }); } catch (e6) {}
    });
  }

  function refreshIp() {
    globalThis.Weather.refreshIpCache().then(function (r) {
      if (r && r.ok) {
        try { Platform.ui.toast('已重新定位：' + r.city, { type: 'success' }); } catch (e7) {}
      } else {
        try { Platform.ui.toast('定位失败：' + (r && r.reason), { type: 'error' }); } catch (e8) {}
      }
      setCfg(globalThis.Weather.getConfig());
    }).catch(function (e9) {
      try { Platform.ui.toast('定位异常：' + e9.message, { type: 'error' }); } catch (e10) {}
    });
  }

  var realActive = cfg.mode === 'real' || cardMode === 'real';

  return React.createElement(
    ScrollView,
    { style: { flex: 1 } },
    React.createElement(
      View,
      { style: { paddingBottom: 24 } },
      React.createElement(
        Controls.SetCard,
        { title: '天气系统' },
        React.createElement(
          Controls.SetNote,
          { first: true },
          '全局天气模式。如果卡带自己定义了天气模式（card.worldbook.weather.mode），会覆盖全局设置。'
        ),
        React.createElement(Controls.SetSelect, {
          label: '模式',
          value: cfg.mode,
          options: [
            { value: 'off', label: '关闭' },
            { value: 'card', label: '卡带自定义（用卡带天气池）' },
            { value: 'real', label: '同步现实天气' }
          ],
          onChange: function (v) { patch({ mode: v }); }
        }),
        cardMode && cardMode !== cfg.mode
          ? React.createElement(
              View,
              {
                style: {
                  borderLeftWidth: 3,
                  borderLeftColor: c.warning,
                  backgroundColor: c.bgPanel,
                  padding: 10,
                  borderRadius: tk.radius.sm,
                  marginTop: 6
                }
              },
              React.createElement(
                Text,
                { style: { fontSize: f.xs, color: c.warning, lineHeight: Math.round(f.xs * 1.7) } },
                '⚠ 当前卡带指定了天气模式：' + cardMode + '，实际生效的是卡带的设置，这里的全局配置会被忽略。'
              )
            )
          : null,
        realActive
          ? React.createElement(
              View,
              { style: { borderTopWidth: 1, borderTopColor: c.hair, marginTop: 12, paddingTop: 12 } },
              React.createElement(Controls.SetSelect, {
                label: '来源',
                value: cfg.realSource,
                options: [
                  { value: 'ip', label: '自动（IP 定位）' },
                  { value: 'manual', label: '手动指定城市' }
                ],
                onChange: function (v) { patch({ realSource: v }); }
              }),
              cfg.realSource === 'manual'
                ? React.createElement(
                    View,
                    { style: { marginTop: 4 } },
                    React.createElement(Controls.SetTextInput, {
                      value: cfg.manualCity || '',
                      placeholder: '例：Tokyo 或 上海',
                      onChangeText: function (v) { patch({ manualCity: v }); }
                    })
                  )
                : null,
              React.createElement(Controls.SetSelect, {
                label: 'IP 缓存刷新',
                value: cfg.cacheRefresh,
                options: [
                  { value: 'daily', label: '每天' },
                  { value: 'weekly', label: '每周' },
                  { value: 'never', label: '永不' }
                ],
                onChange: function (v) { patch({ cacheRefresh: v }); }
              }),
              cfg.ipCache && cfg.ipCache.city
                ? React.createElement(
                    Controls.SetNote,
                    null,
                    '当前缓存城市：' + cfg.ipCache.city
                  )
                : null,
              React.createElement(
                View,
                { style: { flexDirection: 'row', gap: 10, marginTop: 10 } },
                React.createElement(Controls.SetButton, { label: '立即刷新天气', onPress: refreshNow }),
                React.createElement(Controls.SetButton, { label: '重新定位城市', onPress: refreshIp })
              )
            )
          : null
      ),
      React.createElement(
        Controls.SetCard,
        { title: '当前状态' },
        cur
          ? React.createElement(
              View,
              null,
              React.createElement(Controls.SetRow, { label: '天气' }, React.createElement(
                Text, { style: { fontSize: f.sm, color: c.ink2 } }, cur.type)),
              React.createElement(Controls.SetRow, { label: '起始' }, React.createElement(
                Text, { style: { fontSize: f.sm, color: c.ink2 } }, cur.since || '—')),
              cur.city ? React.createElement(Controls.SetRow, { label: '城市' }, React.createElement(
                Text, { style: { fontSize: f.sm, color: c.ink2 } }, cur.city)) : null
            )
          : React.createElement(Controls.SetNote, { first: true }, '（未初始化）'),
        React.createElement(
          Controls.SetNote,
          null,
          '提示：AI 也可以调 set_weather 工具主动改变天气。'
        )
      )
    )
  );
}

module.exports = { WeatherTab: WeatherTab };

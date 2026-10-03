// ============================================================
// 战役 4 · 批次 H2（4-7）：全局背景渲染层（B 类，RN 组件）
// RN 独有。从 useTheme() 取 tokens.background（形状见 theme_tokens.js:151-159
//   { image: {uri} | null, opacity: number, filter: null }）。
// 有 image 时渲染绝对定位铺满、resizeMode="cover"、opacity: background.opacity、
//   pointerEvents="none" 的 Image（包一层 View 确保 pointerEvents 生效）。
// 无 image 时不渲染任何东西（返回 null）。
// 挂载点：HomeScreen root 容器内 + StoryScreen root 容器内（贴最底层，
//   内容之上，主题底色仍在——root 的 backgroundColor: c.bg 不动）。
// 纪律：颜色/字号只取自 useTheme() tokens；不引任何新依赖。
// ============================================================

'use strict';

var React = require('react');
var RN = require('react-native');
var View = RN.View;
var Image = RN.Image;

var useTheme = require('../use_theme.js').useTheme;

function BackgroundLayer() {
  var themeApi = useTheme();
  var tk = themeApi.tokens;
  var bg = tk.background;
  if (!bg || !bg.image || !bg.image.uri) return null;
  var opacity = (bg.opacity != null && bg.opacity !== '') ? Number(bg.opacity) : 1;
  if (!(opacity >= 0 && opacity <= 1)) opacity = 1;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0
      }}
    >
      <Image
        source={{ uri: bg.image.uri }}
        style={{ width: '100%', height: '100%', opacity: opacity, resizeMode: 'cover' }}
        resizeMode="cover"
        onError={function (e) { console.warn('BackgroundLayer image load error:', String(bg.image.uri).slice(0, 40), e && e.nativeEvent && e.nativeEvent.error); }}
      />
    </View>
  );
}

module.exports = { BackgroundLayer: BackgroundLayer };

// ============================================================
// 战役 4 · 批次 4-2：自建路由 · React 绑定（B 类，依赖 React）
// RN 独有。状态真源在 ./nav_store.js（A 类单例，Platform.ui 桥接壳
// 与 React 共同读写）；本文件只提供 Context + useSyncExternalStore。
//
// <NavigationProvider> 包在 SafeAreaProvider 内、路由根之外；
// useNavigation() 返回：
//   {
//     currentScreen: 'home'|'story'|'settings'|'__boot',
//     navigate(screenId), goBack(),
//     ui: { topbarSeq, badgeSeq }   // renderTopbar/updateTokenBadge 信号
//   }
// ============================================================

'use strict';

var React = require('react');
var navStore = require('./nav_store.js');

var NavigationContext = React.createContext(null);

function NavigationProvider(props) {
  var snapshot = React.useSyncExternalStore(
    navStore.subscribe,
    navStore.getSnapshot,
    navStore.getSnapshot
  );

  // 回调取 store 上的固定函数引用（store 不随快照换对象），保证引用稳定
  var value = React.useMemo(function () {
    return {
      currentScreen: snapshot.screen,
      navigate: navStore.navigate,
      goBack: navStore.goBack,
      ui: { topbarSeq: snapshot.topbarSeq, badgeSeq: snapshot.badgeSeq }
    };
  }, [snapshot]);

  return React.createElement(NavigationContext.Provider, { value: value }, props.children);
}

function useNavigation() {
  var v = React.useContext(NavigationContext);
  if (!v) {
    throw new Error('useNavigation 必须在 <NavigationProvider> 内使用');
  }
  return v;
}

module.exports = {
  NavigationProvider: NavigationProvider,
  useNavigation: useNavigation
};

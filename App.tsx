import { StatusBar, StyleSheet, Text, View, ScrollView } from 'react-native';
import { useEffect } from 'react';

// 关键：Metro 的 inlineRequires 会把 `const boot = require(...)` 延迟到首次
// 使用点（App 首次渲染）才执行；裸 require 语句无赋值目标，不会被内联延迟，
// 保证 44 模块引导在本模块体执行的第一行同步完成，后续 module 作用域自检
// 看到的 globalThis 才是引导后的状态。
require('./rn/rn_bootstrap');
// 模块缓存返回结果对象（此时 44 模块已全部挂载）
const boot: any = require('./rn/rn_bootstrap');

// 4-1：useTheme hook（B 类）与共享主题数据层（engine/theme.js，缓存同对象）
const useThemeModule: any = require('./rn/use_theme');
const ThemeModule: any = require('./engine/theme.js');
const THEME_IDS: Array<string> = ThemeModule.BUILTIN_THEMES.map((t: any) => t.id);

// 4-2：自建路由（nav_store A 类单例 + navigation React 绑定）+ 主页
const SafeAreaModule: any = require('react-native-safe-area-context');
const SafeAreaProvider: any = SafeAreaModule.SafeAreaProvider;
const NavigationModule: any = require('./rn/navigation');
const HomeScreenModule: any = require('./rn/screens/HomeScreen');
// 4-3：叙事页 + 根层浮层 Host（confirmAsync 确认框；toast/busy 等 4-3b 追加）
const StoryScreenModule: any = require('./rn/screens/StoryScreen');
const OverlayHostModule: any = require('./rn/components/OverlayHost');
// P9·S6：面板宿主提到根层——此前只挂在 StoryScreen，设置屏调
// StoryStore.openPanel('errorLog') 是死链（且 panelId 残留会回叙事页乱弹窗）。
const PanelHostModule: any = require('./rn/components/PanelHost');
// 4-5a：设置页（RN 独有，零桥接壳，数据层直驱）
const SettingsScreenModule: any = require('./rn/screens/SettingsScreen');
// H2：卡带库 + 存档管理两屏（RN 独有，B 类组件，数据层直驱）
const CardsScreenModule: any = require('./rn/screens/CardsScreen');
const SavesScreenModule: any = require('./rn/screens/SavesScreen');
// H3：最小创角屏（RN 独有，B 类组件，九步建档契约见 H3 任务书第二节）
const CreateScreenModule: any = require('./rn/screens/CreateScreen');
// H6 G9：人设屏（RN 独有，B 类组件，UI_Portrait RN 侧交互入口）
const PortraitScreenModule: any = require('./rn/screens/PortraitScreen');
const ClassifyScreenModule: any = require('./rn/screens/ClassifyScreen');
// P10·A4：存储告警（桌面 engine/mobile.js:132-140 阈值 + :154-155 启动 3s/每 5 分钟）
const StorageWarnModule: any = require('./rn/storage_warn');

// 2-5b：Platform 五组接口自检数据由 bootstrap 在自身模块作用域取值后导出
// （与业务模块运行时的 globalThis 视角一致）
const pc: any = boot.platformCheck || {};
const GROUP_CHECKS: Array<[string, boolean]> = [
  ['http', !!pc.http],
  ['dialog.alert', !!pc.dialogAlert],
  ['dialog.confirm', !!pc.dialogConfirm],
  ['lifecycle.onForeground', !!pc.lcFg],
  ['lifecycle.onBackground', !!pc.lcBg],
  ['lifecycle.onPageHide', !!pc.lcHide],
  ['image.compressFile', !!pc.imageCompress],
];
const uiFns: Record<string, boolean> = pc.uiFns || {};
const UI_NAMES = Object.keys(uiFns);
const UI_CHECKS: Array<[string, boolean]> = UI_NAMES.map((n) => [n, !!uiFns[n]]);
const groupOk = GROUP_CHECKS.filter((c) => c[1]).length;
const uiOk = UI_CHECKS.filter((c) => c[1]).length;
const platformAllOk =
  boot.platformTag === '2-5' && groupOk === GROUP_CHECKS.length && uiOk === UI_NAMES.length;

// 4-2：story/settings 尚未建屏，占位页（tokens 着色，不造假功能）
function PlaceholderScreen({ label, hint }: { label: string; hint: string }) {
  const { tokens: tk } = useThemeModule.useTheme();
  const nav = NavigationModule.useNavigation();
  return (
    <View style={{ flex: 1, backgroundColor: tk.colors.bg, padding: 24, justifyContent: 'center' }}>
      <StatusBar barStyle="dark-content" />
      <Text style={{ fontFamily: tk.fonts.kai, fontSize: tk.fontSizes.xl, color: tk.colors.ink }}>
        {label}
      </Text>
      <Text style={{ fontSize: tk.fontSizes.sm, color: tk.colors.muted, marginTop: 8 }}>{hint}</Text>
      <Text
        style={{ fontSize: tk.fontSizes.base, color: tk.colors.accent, marginTop: 20 }}
        onPress={() => nav.navigate('home')}
      >
        {'\u2190 返回主页'}
      </Text>
    </View>
  );
}

// 4-3：路由根。home=HomeScreen；story=StoryScreen（4-3a P0+P1）；
// settings=占位；__boot=原 44 模块自检页。OverlayHost 为根层浮层
// （confirmAsync 等），任意路由下壳弹窗都有真实渲染链路。
function Root() {
  const nav = NavigationModule.useNavigation();
  let screen: any;
  if (nav.currentScreen === 'home') screen = <HomeScreenModule.HomeScreen />;
  else if (nav.currentScreen === '__boot') screen = <BootScreen />;
  else if (nav.currentScreen === 'story') screen = <StoryScreenModule.StoryScreen />;
  else if (nav.currentScreen === 'settings') screen = <SettingsScreenModule.SettingsScreen />;
  else if (nav.currentScreen === 'cards') screen = <CardsScreenModule.CardsScreen />;
  else if (nav.currentScreen === 'saves') screen = <SavesScreenModule.SavesScreen />;
  else if (nav.currentScreen === 'create') screen = <CreateScreenModule.CreateScreen />;
  else if (nav.currentScreen === 'portrait') screen = <PortraitScreenModule.PortraitScreen />;
  else if (nav.currentScreen === 'classify') screen = <ClassifyScreenModule.ClassifyScreen />;
  else screen = <PlaceholderScreen label="未知页面" hint={String(nav.currentScreen)} />;
  return (
    <>
      {screen}
      <OverlayHostModule.OverlayHost />
      {/* P9·S6：面板宿主提到根层，任意路由（含设置屏）都能开面板 */}
      <PanelHostModule.PanelHost />
    </>
  );
}

function App() {
  // P10·A4：存储告警接线（启动 3s 后一次 + 每 5 分钟 + 回前台一次）
  useEffect(() => { StorageWarnModule.start(); }, []);
  return (
    <SafeAreaProvider>
      <NavigationModule.NavigationProvider>
        <Root />
      </NavigationModule.NavigationProvider>
    </SafeAreaProvider>
  );
}

// 原启动自检页整体保留为 __boot 开发路由
function BootScreen() {
  const nav = NavigationModule.useNavigation();
  const allOk = boot.failed === 0;
  // 4-1：当前主题 tokens（数据源 = Theme.getActive → buildCssVars → buildStyleTokens）
  const { tokens: tk, theme: activeTheme, currentThemeId: themeId, setTheme } =
    useThemeModule.useTheme();

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.tokBtn} onPress={() => nav.navigate('home')}>
          {'\u2190 返回主页（__boot 自检页）'}
        </Text>
        <Text style={styles.title}>引擎就绪 · Bootstrap</Text>
        <Text style={styles.hint}>启动全集 44 模块 · globalThis 挂载自检（战役 2 · 2-5）</Text>

        <Text style={allOk ? styles.summaryOk : styles.summaryFail}>{boot.summary}</Text>
        <Text style={styles.sub}>
          total = {boot.total} · ok = {boot.ok} · failed = {boot.failed}
        </Text>

        {allOk ? (
          <Text style={styles.okLine}>全部 44 模块挂载成功，globalThis 引导链就绪。</Text>
        ) : (
          <>
            <Text style={styles.section}>失败模块（{boot.failed}）· 根因清单 = 战役 3 输入：</Text>
            {boot.failures.map((f: any, i: number) => (
              <Text key={i} style={styles.failBlock}>
                <Text style={styles.failName}>{'\u2717 '}{f.name}</Text>
                <Text style={styles.failMsg}>{'\n  ' + String(f.message).split('\n')[0]}</Text>
              </Text>
            ))}
          </>
        )}

        <Text style={styles.section}>Platform RN 实装自检（2-5）</Text>
        <Text style={platformAllOk ? styles.okLine : styles.failName}>
          合并标记 = {String(boot.platformTag)} · 五组 {groupOk}/{GROUP_CHECKS.length} · ui {uiOk}/{UI_NAMES.length} · window同对象={String(pc.sameWindow)}
        </Text>
        {GROUP_CHECKS.map(([label, ok], i) => (
          <Text key={'g' + i} style={styles.checkLine}>
            {ok ? '\u2713 ' : '\u2717 '}{label}
          </Text>
        ))}
        <Text style={styles.uiHead}>ui.* 21 接口（typeof === function）：</Text>
        <Text style={styles.uiList}>
          {UI_CHECKS.map(([label, ok]) => (ok ? '\u2713' : '\u2717') + ' ' + label).join('\n')}
        </Text>

        <Text style={styles.section}>Theme tokens 自检（4-1 · useTheme）</Text>
        <Text
          style={styles.tokBtn}
          onPress={() => {
            const idx = THEME_IDS.indexOf(themeId);
            setTheme(THEME_IDS[(idx + 1) % THEME_IDS.length]);
          }}
        >
          {'切换主题 \u2192 ' + themeId + '（' + activeTheme.name + '）'}
        </Text>
        <Text style={styles.tokLine}>
          {'colors 键数 = ' + Object.keys(tk.colors).length + '（43 语义 + 11 编辑风别名）'}
        </Text>
        <Text style={styles.tokLine}>
          {'bg=' + tk.colors.bg + '  text=' + tk.colors.text + '  accent=' + tk.colors.accent}
        </Text>
        <Text style={[styles.tokSample, { color: tk.colors.text }]}>
          {'tokens 着色示例：fontSizes.base=' + tk.fontSizes.base +
            ' xs=' + tk.fontSizes.xs + ' sm=' + tk.fontSizes.sm +
            ' lg=' + tk.fontSizes.lg + ' xl=' + tk.fontSizes.xl +
            '（fs-scale=' + tk.meta.fontScale + '）'}
        </Text>
        <Text style={styles.tokLine}>
          {'radius none/sm/md/lg = ' + tk.radius.none + '/' + tk.radius.sm +
            '/' + tk.radius.md + '/' + tk.radius.lg}
        </Text>
        <Text style={styles.tokLine}>
          {'fonts sans=' + tk.fonts.sans + ' serif=' + tk.fonts.serif +
            ' kai=' + tk.fonts.kai + ' mono=' + tk.fonts.mono}
        </Text>
        <Text style={styles.tokLine}>
          {'background image=' + String(tk.background.image) +
            ' opacity=' + tk.background.opacity +
            '  editorial radius=' + tk.editorial.radius +
            ' blur=' + tk.editorial.glassBlur +
            ' grain=' + tk.editorial.paperGrain +
            ' bodyLh=' + tk.editorial.bodyLh}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f5f3ee', minHeight: '100%' },
  title: { fontSize: 18, color: '#5D5113', fontWeight: 'bold', marginTop: 30, marginBottom: 6 },
  hint: { fontSize: 12, color: '#7a7a7a', marginBottom: 18 },
  summaryOk: { fontSize: 20, color: '#2e6b34', fontWeight: 'bold', marginBottom: 6 },
  summaryFail: { fontSize: 20, color: '#9b2c2c', fontWeight: 'bold', marginBottom: 6 },
  sub: { fontSize: 12, color: '#7a7a7a', marginBottom: 16 },
  okLine: { fontSize: 13, color: '#2e6b34', marginTop: 4, marginBottom: 8 },
  section: { fontSize: 13, color: '#9b2c2c', fontWeight: 'bold', marginTop: 12, marginBottom: 8 },
  failBlock: { fontSize: 12, marginBottom: 10, lineHeight: 1.5 },
  failName: { color: '#9b2c2c', fontWeight: 'bold', fontFamily: 'monospace' },
  failMsg: { color: '#3a3a3a', fontFamily: 'monospace' },
  checkLine: { fontSize: 12, color: '#2e6b34', fontFamily: 'monospace', lineHeight: 17 },
  uiHead: { fontSize: 12, color: '#5D5113', fontWeight: 'bold', marginTop: 10, marginBottom: 6 },
  uiList: { fontSize: 11, color: '#3a3a3a', fontFamily: 'monospace', lineHeight: 16 },
  tokBtn: {
    fontSize: 13, color: '#5D5113', fontWeight: 'bold', alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#5D5113', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  tokLine: { fontSize: 11, color: '#3a3a3a', fontFamily: 'monospace', lineHeight: 17 },
  tokSample: { fontSize: 12, lineHeight: 18, marginVertical: 4 },
});

export default App;

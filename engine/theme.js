// ============================================================
// 主题系统 · 数据层
// 13 套内置预设（旧六主题 + 编辑风三书票 paper/glass/scroll + 新增 high-contrast/solarized/dark/sepia）+ 序列化/反序列化 + CSS 变量生成
// 分层：A 类 · 纯逻辑，不碰 UI/DOM（应用层由 ui.js 调用 buildCssVars 后写入）
// ============================================================

(function() {
// 【主题 schema 扩展约定】v1 起为开放 schema。
// 未来给主题加新字段（borderStyle / cornerDecoration / dividerStyle / 动画等）时的流程：
//   1. 在 BUILTIN_THEMES 各主题里加默认值（可选字段）
//   2. 在 buildCssVars 里把字段映射成 CSS 变量（供 UI 消费）
//   3. 不需要改 mergeWithDefault / exportTheme / importTheme —— 未知字段自动透传
// 向下兼容：旧主题包缺字段，用 BUILTIN_THEMES[0] 的默认值兜底；
//           新主题包多字段，旧引擎合并时忽略、不报错。
var SCHEMA_VERSION = 1;
var SLOT_COUNT = 7;

var FONT_OPTIONS = {
  sans: [
    { id: 'system', name: '系统默认', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif', css: '' },
    { id: 'noto-sans-sc', name: '思源黑体', family: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif', css: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/index.css' }
  ],
  serif: [
    { id: 'system-serif', name: '系统衬线', family: 'Georgia, "Songti SC", "STSong", "SimSun", serif', css: '' },
    { id: 'lxgw-wenkai', name: '霞鹜文楷', family: '"LXGW WenKai", "Songti SC", "STSong", serif', css: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont/style.css' },
    { id: 'noto-serif-sc', name: '思源宋体', family: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif', css: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc/index.css' },
    { id: 'ma-shan-zheng', name: '马善政毛笔楷', family: '"Ma Shan Zheng", "Songti SC", "STSong", serif', css: 'https://cdn.jsdelivr.net/npm/@fontsource/ma-shan-zheng/index.css' }
  ]
};

var BUILTIN_THEMES = [
{
id: 'paper-white', name: '纸白', author: '内置', schemaVersion: 1, desc: '米色底 · 原版',
colors: {
bg: '#f5f3ee', bgPanel: '#f0ede6', bgTopbar: '#faf8f4', bgCard: '#ffffff', bgWhite: '#fff',
border: '#e0ddd6', borderStrong: '#d0cdc6',
primary: '#4a4736', accent: '#5D5113',
text: '#2a2a2a', text2: '#3a3a3a', text3: '#1a1a1a',
textMuted: '#6a6a6a', textMuted2: '#7a7a7a', textMuted3: '#5a5a5a',
textFaint: '#a0a0a0', textFaint2: '#b8b8b8', textBlue: '#6a6a78',
danger: '#c44a4a', dangerBg: '#f5e8e8',
success: '#4a9a6a', successBg: '#e8f0e8',
warning: '#8a6a1a', warningBg: '#f5f0e0',
info: '#2a4a6a', infoBg: '#e8eef5',
yellow: '#b8963a', orange: '#c47a2a',
shadow: '#5d563c',
          borderDanger: '#d0a0a0', borderSuccess: '#a0c0a0', borderInfo: '#a0b8d0',
          dangerHover: '#e8d0d0',
          deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
          deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
          deepWarningBg: '#2a2318', deepUncertainBg: '#2a2a38', deepRejectedBg: '#2a1a1a',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(0,0,0,0.6)', maskStrong: 'rgba(0,0,0,0.85)'
},
fonts: {
sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' }
},
{
id: 'eye-green', name: '护眼绿', author: '内置', schemaVersion: 1, desc: '淡绿底 · 长时间阅读',
colors: {
bg: '#dce8dc', bgPanel: '#d0dccd', bgTopbar: '#e0ead0', bgCard: '#e8f0e8', bgWhite: '#f0f8f0',
border: '#b8c8b5', borderStrong: '#a0b0a0',
primary: '#2a5a3a', accent: '#1a4a2a',
text: '#1a2a1a', text2: '#2a3a2a', text3: '#0a1a0a',
textMuted: '#4a5a4a', textMuted2: '#5a6a5a', textMuted3: '#3a4a3a',
textFaint: '#7a8a7a', textFaint2: '#9a9a9a', textBlue: '#4a6a5a',
danger: '#a03a3a', dangerBg: '#e8d8d8',
success: '#2a7a4a', successBg: '#d0e8d0',
warning: '#7a6a1a', warningBg: '#e8e0c0',
info: '#2a4a5a', infoBg: '#d0e0e8',
yellow: '#9a8a2a', orange: '#b06a2a',
shadow: '#3a5a3a',
          borderDanger: '#b0a0a0', borderSuccess: '#90b890', borderInfo: '#90b0c0',
          dangerHover: '#d8c0c0',
          deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
          deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
          deepWarningBg: '#2a2318', deepUncertainBg: '#2a2a38', deepRejectedBg: '#2a1a1a',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(0,0,0,0.55)', maskStrong: 'rgba(0,0,0,0.8)'
},
fonts: {
sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' }
},
{
id: 'warm-sun', name: '暖阳', author: '内置', schemaVersion: 1, desc: '淡暖橙 · 温暖阅读',
colors: {
bg: '#fae8d0', bgPanel: '#f5ddb8', bgTopbar: '#f8ecd8', bgCard: '#fff5e0', bgWhite: '#fffaf0',
border: '#e0c8a0', borderStrong: '#d0b080',
primary: '#8a4a2a', accent: '#6a3a1a',
text: '#3a2a1a', text2: '#4a3a2a', text3: '#2a1a0a',
textMuted: '#6a5a4a', textMuted2: '#7a6a5a', textMuted3: '#5a4a3a',
textFaint: '#a09080', textFaint2: '#b8a890', textBlue: '#7a6a5a',
danger: '#b03a3a', dangerBg: '#f0d8d8',
success: '#5a8a3a', successBg: '#e0e8c8',
warning: '#a07a1a', warningBg: '#f0e0b0',
info: '#5a5a7a', infoBg: '#e0dce8',
yellow: '#c09020', orange: '#d07030',
shadow: '#7a5a3a',
          borderDanger: '#d0a0a0', borderSuccess: '#a0c080', borderInfo: '#b0a8c0',
          dangerHover: '#e8c8c0',
          deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
          deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
          deepWarningBg: '#2a2318', deepUncertainBg: '#2a2a38', deepRejectedBg: '#2a1a1a',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(40,20,0,0.55)', maskStrong: 'rgba(40,20,0,0.8)'
},
fonts: {
sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' }
},
{
id: 'midnight-blue', name: '午夜蓝', author: '内置', schemaVersion: 1, desc: '深蓝底 · Nord 风格',
colors: {
bg: '#2E3440', bgPanel: '#3B4252', bgTopbar: '#434C5E', bgCard: '#4C566A', bgWhite: '#5A6478',
border: '#4C566A', borderStrong: '#5A6478',
primary: '#88C0D0', accent: '#EBCB8B',
text: '#ECEFF4', text2: '#D8DEE9', text3: '#FFFFFF',
textMuted: '#81A1C1', textMuted2: '#9AACBE', textMuted3: '#7A8A9A',
textFaint: '#6A7A8A', textFaint2: '#5A6A7A', textBlue: '#88C0D0',
danger: '#BF616A', dangerBg: '#4A2A2A',
success: '#A3BE8C', successBg: '#2A3A2A',
warning: '#EBCB8B', warningBg: '#3A3420',
info: '#81A1C1', infoBg: '#2A3A4A',
yellow: '#EBCB8B', orange: '#D08770',
shadow: '#0a0a14',
          borderDanger: '#5a3a3a', borderSuccess: '#3a5a3a', borderInfo: '#3a4a6a',
          dangerHover: '#4a2a2a',
          deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
          deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
          deepWarningBg: '#2a2318', deepUncertainBg: '#2a2a38', deepRejectedBg: '#2a1a1a',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(0,0,0,0.7)', maskStrong: 'rgba(0,0,0,0.9)'
},
fonts: {
sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' }
},
{
id: 'charcoal', name: '炭灰', author: '内置', schemaVersion: 1, desc: '深灰底 · Dracula 风格',
colors: {
bg: '#282a36', bgPanel: '#2d2f3f', bgTopbar: '#21222c', bgCard: '#44475a', bgWhite: '#4e5266',
border: '#44475a', borderStrong: '#5A5E72',
primary: '#bd93f9', accent: '#ff79c6',
text: '#f8f8f2', text2: '#e0e0d8', text3: '#ffffff',
textMuted: '#b0b0c0', textMuted2: '#a0a0b0', textMuted3: '#9090a0',
textFaint: '#707080', textFaint2: '#606070', textBlue: '#8be9fd',
danger: '#ff5555', dangerBg: '#4a2a2a',
success: '#50fa7b', successBg: '#2a3a2a',
warning: '#f1fa8c', warningBg: '#3a3420',
info: '#8be9fd', infoBg: '#2a3a4a',
yellow: '#f1fa8c', orange: '#ffb86c',
shadow: '#0a0a14',
          borderDanger: '#5a3a3a', borderSuccess: '#3a5a3a', borderInfo: '#3a3a6a',
          dangerHover: '#4a2a2a',
          deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
          deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
          deepWarningBg: '#2a2318', deepUncertainBg: '#2a2a38', deepRejectedBg: '#2a1a1a',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(0,0,0,0.75)', maskStrong: 'rgba(0,0,0,0.9)'
},
fonts: {
sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' }
},
{
id: 'deep-purple', name: '深墨紫', author: '内置', schemaVersion: 1, desc: '深紫底 · Catppuccin Mocha',
colors: {
bg: '#1e1e2e', bgPanel: '#181825', bgTopbar: '#11111b', bgCard: '#313244', bgWhite: '#45475a',
border: '#313244', borderStrong: '#45475a',
primary: '#cba6f7', accent: '#f5c2e7',
text: '#cdd6f4', text2: '#bac2de', text3: '#ffffff',
textMuted: '#a6adc8', textMuted2: '#9399b2', textMuted3: '#7f849c',
textFaint: '#6c7086', textFaint2: '#585b70', textBlue: '#89b4fa',
danger: '#f38ba8', dangerBg: '#4a2a3a',
success: '#a6e3a1', successBg: '#2a3a2a',
warning: '#f9e2af', warningBg: '#3a3420',
info: '#89b4fa', infoBg: '#2a3040',
yellow: '#f9e2af', orange: '#fab387',
shadow: '#0a0a14',
          borderDanger: '#5a3a4a', borderSuccess: '#3a5a4a', borderInfo: '#3a3a6a',
          dangerHover: '#4a2a3a',
          deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
          deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
          deepWarningBg: '#2a2318', deepUncertainBg: '#2a2a38', deepRejectedBg: '#2a1a1a',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(0,0,0,0.75)', maskStrong: 'rgba(0,0,0,0.92)'
},
fonts: {
sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' }
},
// ============================================================
// 编辑风三书票（战役 3 · U-1）
// colors 沿用旧 schema 全量键（旧 --c-* 桥接不破版）；
// editorial 为新增开放字段：--radius / --glass-blur / --paper-grain 等编辑风 token
// 字体栈全部离线系统栈（补1：无网默认可用，CDN webfont 仅 FONT_OPTIONS 可选增强）
// ============================================================
{
id: 'paper', name: '纸白 · 编辑风', author: '内置', schemaVersion: 1, desc: '编辑风 · 纸白书页（米白纸面 · 无圆角 · 发丝线）',
colors: {
bg: '#f5f3ee', bgPanel: '#f0ede6', bgTopbar: '#faf8f4', bgCard: '#ffffff', bgWhite: '#fff',
border: '#e0ddd6', borderStrong: '#d0cdc6',
primary: '#4a4736', accent: '#5d5113',
text: '#2a2a2a', text2: '#3a3a3a', text3: '#1a1a1a',
textMuted: '#6a6a6a', textMuted2: '#7a7a7a', textMuted3: '#5a5a5a',
textFaint: '#8a8a8a', textFaint2: '#b8b8b8', textBlue: '#6a6a78',
danger: '#c44a4a', dangerBg: '#f5e8e8',
success: '#4a9a6a', successBg: '#e8f0e8',
warning: '#8a6a1a', warningBg: '#f5f0e0',
info: '#2a4a6a', infoBg: '#e8eef5',
yellow: '#b8963a', orange: '#c47a2a',
shadow: '#5d563c',
          borderDanger: '#d0a0a0', borderSuccess: '#a0c0a0', borderInfo: '#a0b8d0',
          dangerHover: '#e8d0d0',
          deepErrorBg: '#f0d8d8', deepErrorText: '#8a3030',
          deepSuccessBg: '#d8e8d8', deepSuccessText: '#306a4a',
          deepWarningBg: '#ece0c8', deepUncertainBg: '#e4e4e0', deepRejectedBg: '#eee0dc',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(0,0,0,0.6)', maskStrong: 'rgba(0,0,0,0.85)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '4px', lg: '6px' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '0px', glassBlur: '0px', paperGrain: '0.04', seal: '#a8402f', bodySize: '16px', bodyLh: '1.8' }
},
{
id: 'glass', name: '流光', author: '内置', schemaVersion: 1, desc: '编辑风 · 流光玻璃（深夜蓝黑 · 半透明磨砂 · 大圆角）',
colors: {
bg: '#141a26', bgPanel: '#1b2333', bgTopbar: '#1f2839', bgCard: 'rgba(255,255,255,0.07)', bgWhite: '#141a26',
border: 'rgba(255,255,255,0.14)', borderStrong: 'rgba(255,255,255,0.24)',
primary: '#e8ecf5', accent: '#d4b26a',
text: '#e8ecf5', text2: '#cfd6e4', text3: '#ffffff',
textMuted: '#93a0b8', textMuted2: '#8491a8', textMuted3: '#a8b4c8',
textFaint: '#6d7a92', textFaint2: '#5a657c', textBlue: '#8fb0d0',
danger: '#e0706a', dangerBg: 'rgba(192,74,74,0.18)',
success: '#7cc092', successBg: 'rgba(74,154,106,0.18)',
warning: '#d8b25c', warningBg: 'rgba(180,150,60,0.18)',
info: '#7fa8d0', infoBg: 'rgba(80,120,170,0.18)',
yellow: '#d8b25c', orange: '#d08a5a',
shadow: '#05080f',
          borderDanger: 'rgba(224,112,106,0.5)', borderSuccess: 'rgba(124,192,146,0.5)', borderInfo: 'rgba(127,168,208,0.5)',
          dangerHover: 'rgba(224,112,106,0.25)',
          deepErrorBg: '#3a1f24', deepErrorText: '#ffb0a8',
          deepSuccessBg: '#1f3528', deepSuccessText: '#a0e0b8',
          deepWarningBg: '#352c18', deepUncertainBg: '#242c3c', deepRejectedBg: '#2e2028',
          shadowSm: 'rgba(0,0,0,0.4)',
          mask: 'rgba(0,0,0,0.62)', maskStrong: 'rgba(0,0,0,0.82)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '4px', md: '8px', lg: '12px' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '12px', glassBlur: '14px', paperGrain: '0.02', seal: '#e0706a', bodySize: '16px', bodyLh: '1.8' }
},
{
id: 'scroll', name: '古卷', author: '内置', schemaVersion: 1, desc: '编辑风 · 古卷黄麻（暖黄纸面 · 中圆角）',
colors: {
bg: '#efe6d6', bgPanel: '#e7dcc6', bgTopbar: '#efe4cd', bgCard: '#f7f0e2', bgWhite: '#fbf6ea',
border: '#d9cbae', borderStrong: '#c4b28c',
primary: '#3b2f22', accent: '#7a5a2a',
text: '#3b2f22', text2: '#4a3c2c', text3: '#241c14',
textMuted: '#6e5f4c', textMuted2: '#7d6e5a', textMuted3: '#5e5040',
textFaint: '#8a7a64', textFaint2: '#9c8e78', textBlue: '#6a5f4c',
danger: '#b04a3a', dangerBg: '#f0dcd2',
success: '#5a8a52', successBg: '#e2ecd8',
warning: '#9a7a1a', warningBg: '#f0e6cc',
info: '#4a6a7a', infoBg: '#dce6e8',
yellow: '#b8903a', orange: '#c07a3a',
shadow: '#6a5a3a',
          borderDanger: '#d0a898', borderSuccess: '#a8c098', borderInfo: '#a0b8c0',
          dangerHover: '#e8d4c8',
          deepErrorBg: '#ecd8cc', deepErrorText: '#7a3020',
          deepSuccessBg: '#d8e2cc', deepSuccessText: '#3a5a30',
          deepWarningBg: '#e8dcbf', deepUncertainBg: '#e0dccd', deepRejectedBg: '#e8dcd2',
          shadowSm: 'rgba(0,0,0,0.3)',
          mask: 'rgba(40,25,10,0.55)', maskStrong: 'rgba(40,25,10,0.8)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '4px', lg: '6px' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '6px', glassBlur: '0px', paperGrain: '0.04', seal: '#b04a3a', bodySize: '16px', bodyLh: '1.8' }
},
{
id: 'high-contrast', name: '高对比', author: '内置', schemaVersion: 1, desc: '纯黑白 · 无障碍 AAA · 零圆角',
colors: {
bg: '#ffffff', bgPanel: '#f2f2f2', bgTopbar: '#ffffff', bgCard: '#ffffff', bgWhite: '#ffffff',
border: '#000000', borderStrong: '#000000',
primary: '#000000', accent: '#0043ce',
text: '#000000', text2: '#000000', text3: '#000000',
textMuted: '#1a1a1a', textMuted2: '#262626', textMuted3: '#0d0d0d',
textFaint: '#333333', textFaint2: '#404040', textBlue: '#0043ce',
danger: '#b3001b', dangerBg: '#ffe8e8',
success: '#0a5c22', successBg: '#e6f5e9',
warning: '#6b4700', warningBg: '#fff3d6',
info: '#003b73', infoBg: '#e4eefc',
yellow: '#7a5c00', orange: '#a34000',
shadow: '#000000',
borderDanger: '#b3001b', borderSuccess: '#0a5c22', borderInfo: '#003b73',
dangerHover: '#ffd0d0',
deepErrorBg: '#ffd6d6', deepErrorText: '#7a0010',
deepSuccessBg: '#d6f0dc', deepSuccessText: '#06521a',
deepWarningBg: '#ffe9b8', deepUncertainBg: '#e0e0e0', deepRejectedBg: '#f0e0e0',
shadowSm: 'rgba(0,0,0,0.45)',
mask: 'rgba(0,0,0,0.75)', maskStrong: 'rgba(0,0,0,0.92)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '11px', sm: '12.5px', base: '14px', md: '15px', lg: '17px', xl: '21px' },
radius: { none: '0', sm: '0', md: '0', lg: '0' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '0px', glassBlur: '0px', paperGrain: '0', seal: '#b3001b', bodySize: '17px', bodyLh: '1.9' }
},
{
id: 'solarized', name: '日蚀', author: '内置', schemaVersion: 1, desc: 'Solarized 官方暗色 · 去饱和青灰',
colors: {
bg: '#002b36', bgPanel: '#073642', bgTopbar: '#00212b', bgCard: '#073642', bgWhite: '#0a3d4a',
border: '#12505f', borderStrong: '#586e75',
primary: '#93a1a1', accent: '#b58900',
text: '#839496', text2: '#93a1a1', text3: '#fdf6e3',
textMuted: '#657b83', textMuted2: '#586e75', textMuted3: '#7a8f96',
textFaint: '#4e5f66', textFaint2: '#586e75', textBlue: '#268bd2',
danger: '#dc322f', dangerBg: 'rgba(220,50,47,0.16)',
success: '#859900', successBg: 'rgba(133,153,0,0.16)',
warning: '#b58900', warningBg: 'rgba(181,137,0,0.16)',
info: '#268bd2', infoBg: 'rgba(38,139,210,0.16)',
yellow: '#b58900', orange: '#cb4b16',
shadow: '#00161c',
borderDanger: 'rgba(220,50,47,0.5)', borderSuccess: 'rgba(133,153,0,0.5)', borderInfo: 'rgba(38,139,210,0.5)',
dangerHover: 'rgba(220,50,47,0.25)',
deepErrorBg: '#3d1414', deepErrorText: '#f5a3a3',
deepSuccessBg: '#232a08', deepSuccessText: '#c3d94a',
deepWarningBg: '#33280a', deepUncertainBg: '#12303a', deepRejectedBg: '#3a1a1a',
shadowSm: 'rgba(0,0,0,0.4)',
mask: 'rgba(0,20,26,0.72)', maskStrong: 'rgba(0,20,26,0.9)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '4px', lg: '6px' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '4px', glassBlur: '0px', paperGrain: '0.02', seal: '#cb4b16', bodySize: '16px', bodyLh: '1.85' }
},
{
id: 'dark', name: '纯黑', author: '内置', schemaVersion: 1, desc: '中性近纯黑 · 无色相 · OLED 友好',
colors: {
bg: '#0d0d0f', bgPanel: '#141417', bgTopbar: '#0a0a0c', bgCard: '#1c1c20', bgWhite: '#26262b',
border: '#2a2a30', borderStrong: '#3a3a42',
primary: '#e6e6e8', accent: '#8ab4f8',
text: '#e8e8ea', text2: '#d0d0d4', text3: '#ffffff',
textMuted: '#9a9aa2', textMuted2: '#8a8a92', textMuted3: '#aaaab2',
textFaint: '#6e6e76', textFaint2: '#5c5c64', textBlue: '#8ab4f8',
danger: '#ff6b6b', dangerBg: 'rgba(255,107,107,0.14)',
success: '#6fd08c', successBg: 'rgba(111,208,140,0.14)',
warning: '#e0c060', warningBg: 'rgba(224,192,96,0.14)',
info: '#8ab4f8', infoBg: 'rgba(138,180,248,0.14)',
yellow: '#e0c060', orange: '#f0a05a',
shadow: '#000000',
borderDanger: 'rgba(255,107,107,0.5)', borderSuccess: 'rgba(111,208,140,0.5)', borderInfo: 'rgba(138,180,248,0.5)',
dangerHover: 'rgba(255,107,107,0.25)',
deepErrorBg: '#3a1a1a', deepErrorText: '#ffb0b0',
deepSuccessBg: '#1a3a2a', deepSuccessText: '#a0ffc0',
deepWarningBg: '#2a2318', deepUncertainBg: '#22222a', deepRejectedBg: '#2a1a1a',
shadowSm: 'rgba(0,0,0,0.5)',
mask: 'rgba(0,0,0,0.8)', maskStrong: 'rgba(0,0,0,0.94)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10px', sm: '11.5px', base: '13px', md: '14px', lg: '16px', xl: '20px' },
radius: { none: '0', sm: '3px', md: '8px', lg: '12px' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '8px', glassBlur: '10px', paperGrain: '0.02', seal: '#ff6b6b', bodySize: '16px', bodyLh: '1.8' }
},
{
id: 'sepia', name: '棕褐', author: '内置', schemaVersion: 1, desc: '经典久读棕 · 低亮度对比 · 大字距',
colors: {
bg: '#f4ecd8', bgPanel: '#ece2c8', bgTopbar: '#f8f2e2', bgCard: '#fbf7ec', bgWhite: '#fffdf7',
border: '#ded0b0', borderStrong: '#c8b68e',
primary: '#5b4636', accent: '#8a5a2b',
text: '#3f3226', text2: '#4e3f30', text3: '#2b2118',
textMuted: '#6b5a48', textMuted2: '#7d6b56', textMuted3: '#5a4a3a',
textFaint: '#8f7d64', textFaint2: '#a2927a', textBlue: '#4a5f6b',
danger: '#a8452f', dangerBg: '#f2dcd2',
success: '#4f7a48', successBg: '#e2ecd8',
warning: '#8a6a12', warningBg: '#f2e6c8',
info: '#45606e', infoBg: '#dde7ea',
yellow: '#a8821f', orange: '#b96a2a',
shadow: '#5b4636',
borderDanger: '#cfa694', borderSuccess: '#a8c098', borderInfo: '#9fb4bd',
dangerHover: '#e8cfc5',
deepErrorBg: '#eed6cc', deepErrorText: '#7a2a18',
deepSuccessBg: '#dce8d2', deepSuccessText: '#33562c',
deepWarningBg: '#eee0be', deepUncertainBg: '#e6e0d2', deepRejectedBg: '#ecdcd4',
shadowSm: 'rgba(0,0,0,0.3)',
mask: 'rgba(45,32,18,0.55)', maskStrong: 'rgba(45,32,18,0.8)'
},
fonts: {
sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
serif: 'Georgia, "Songti SC", "STSong", "SimSun", serif',
kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
mono: 'Consolas, monospace'
},
fontSizes: { xs: '10.5px', sm: '12px', base: '13.5px', md: '14.5px', lg: '16.5px', xl: '20px' },
radius: { none: '0', sm: '2px', md: '6px', lg: '8px' },
background: { image: '', opacity: 1, filter: 'none' },
editorial: { radius: '6px', glassBlur: '0px', paperGrain: '0.05', seal: '#a8452f', bodySize: '17px', bodyLh: '1.95' }
}
];

var COLOR_VAR_MAP = {
bg: '--c-bg', bgPanel: '--c-bg-panel', bgTopbar: '--c-bg-topbar',
bgCard: '--c-bg-card', bgWhite: '--c-bg-white',
border: '--c-border', borderStrong: '--c-border-strong',
primary: '--c-primary', accent: '--c-accent',
text: '--c-text', text2: '--c-text-2', text3: '--c-text-3',
textMuted: '--c-text-muted', textMuted2: '--c-text-muted2', textMuted3: '--c-text-muted3',
textFaint: '--c-text-faint', textFaint2: '--c-text-faint2', textBlue: '--c-text-blue',
danger: '--c-danger', dangerBg: '--c-danger-bg',
success: '--c-success', successBg: '--c-success-bg',
warning: '--c-warning', warningBg: '--c-warning-bg',
info: '--c-info', infoBg: '--c-info-bg',
yellow: '--c-yellow', orange: '--c-orange',
mask: '--c-mask', maskStrong: '--c-mask-strong',
shadow: '--c-shadow',
  borderDanger: '--c-border-danger', borderSuccess: '--c-border-success', borderInfo: '--c-border-info',
  dangerHover: '--c-danger-hover',
  deepErrorBg: '--c-deep-error-bg', deepErrorText: '--c-deep-error-text',
  deepSuccessBg: '--c-deep-success-bg', deepSuccessText: '--c-deep-success-text',
  deepWarningBg: '--c-deep-warning-bg', deepUncertainBg: '--c-deep-uncertain-bg', deepRejectedBg: '--c-deep-rejected-bg',
  shadowSm: '--c-shadow-sm'
};

var COLOR_GROUPS = [
{ id: 'bg', name: '背景', keys: ['bg', 'bgPanel', 'bgTopbar', 'bgCard', 'bgWhite'] },
{ id: 'border', name: '边框', keys: ['border', 'borderStrong', 'borderDanger', 'borderSuccess', 'borderInfo'] },
{ id: 'primary', name: '主色', keys: ['primary', 'accent'] },
{ id: 'text', name: '文字', keys: ['text', 'text2', 'text3', 'textMuted', 'textMuted2', 'textMuted3', 'textFaint', 'textFaint2', 'textBlue'] },
{ id: 'status', name: '状态色', keys: ['danger', 'dangerBg', 'success', 'successBg', 'warning', 'warningBg', 'info', 'infoBg', 'yellow', 'orange', 'dangerHover'] },
{ id: 'deep', name: '深层状态', keys: ['deepErrorBg', 'deepErrorText', 'deepSuccessBg', 'deepSuccessText', 'deepWarningBg', 'deepUncertainBg', 'deepRejectedBg'] },
{ id: 'misc', name: '其他', keys: ['mask', 'maskStrong', 'shadow', 'shadowSm'] }
];

var COLOR_LABELS = {
bg: '主背景', bgPanel: '面板背景', bgTopbar: '顶栏背景', bgCard: '卡片背景', bgWhite: '纯白',
border: '边框', borderStrong: '强边框', borderDanger: '危险边框', borderSuccess: '成功边框', borderInfo: '信息边框',
primary: '主色', accent: '强调色',
text: '主文字', text2: '次文字', text3: '深文字', textMuted: '中灰文字', textMuted2: '灰文字', textMuted3: '暗灰文字', textFaint: '浅灰文字', textFaint2: '更浅灰', textBlue: '蓝灰文字',
danger: '危险/红', dangerBg: '危险浅底', success: '成功/绿', successBg: '成功浅底', warning: '警告/黄', warningBg: '警告浅底', info: '信息/蓝', infoBg: '信息浅底', yellow: '黄', orange: '橙', dangerHover: '危险悬停',
deepErrorBg: '深错误底', deepErrorText: '深错误字', deepSuccessBg: '深成功底', deepSuccessText: '深成功字', deepWarningBg: '深警告底', deepUncertainBg: '深未确定底', deepRejectedBg: '深已拒绝底',
mask: '遮罩', maskStrong: '深遮罩', shadow: '阴影', shadowSm: '小阴影'
};

var FONT_SCALES = [
  { id: 'small',  name: '小',   value: 0.9 },
  { id: 'normal', name: '标准', value: 1 },
  { id: 'large',  name: '大',   value: 1.15 }
];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function findBuiltin(id) {
for (var i = 0; i < BUILTIN_THEMES.length; i++) {
if (BUILTIN_THEMES[i].id === id) return BUILTIN_THEMES[i];
}
return null;
}

function validateTheme(theme) {
if (!theme || typeof theme !== 'object') return { ok: false, reason: '不是对象' };
if (!theme.id || typeof theme.id !== 'string') return { ok: false, reason: '缺少 id' };
if (!theme.name || typeof theme.name !== 'string') return { ok: false, reason: '缺少 name' };
if (!theme.colors || typeof theme.colors !== 'object') return { ok: false, reason: '缺少 colors' };
return { ok: true };
}

function mergeWithDefault(theme) {
var def = BUILTIN_THEMES[0];
var out = clone(def);
if (theme.id) out.id = theme.id;
if (theme.name) out.name = theme.name;
if (theme.author) out.author = theme.author;
if (theme.schemaVersion) out.schemaVersion = theme.schemaVersion;
if (theme.desc) out.desc = theme.desc;
if (theme.colors) {
Object.keys(theme.colors).forEach(function(k) {
if (k in out.colors && typeof theme.colors[k] === 'string') out.colors[k] = theme.colors[k];
});
}
if (theme.fonts) {
Object.keys(theme.fonts).forEach(function(k) {
if (k in out.fonts && typeof theme.fonts[k] === 'string') out.fonts[k] = theme.fonts[k];
});
}
if (theme.fontSizes) {
Object.keys(theme.fontSizes).forEach(function(k) {
if (k in out.fontSizes && typeof theme.fontSizes[k] === 'string') out.fontSizes[k] = theme.fontSizes[k];
});
}
if (theme.radius) {
Object.keys(theme.radius).forEach(function(k) {
if (k in out.radius && typeof theme.radius[k] === 'string') out.radius[k] = theme.radius[k];
});
}
if (theme.background && typeof theme.background === 'object') {
out.background = Object.assign(out.background, theme.background);
}
// 开放 schema：透传未知的顶层键。
// 未来给主题加新字段（如 borderStyle / cornerDecoration / dividerStyle）时，
// 只要更新 BUILTIN_THEMES 与 buildCssVars，合并逻辑无需再改。
Object.keys(theme).forEach(function(k) {
if (k === '__proto__' || k === 'constructor') return;
if (k === 'colors' || k === 'fonts' || k === 'fontSizes' || k === 'radius' || k === 'background') return;
if (k === 'id' || k === 'name' || k === 'author' || k === 'schemaVersion' || k === 'desc') return;
if (theme[k] !== undefined) out[k] = theme[k];
});
return out;
}

var Theme = {
SCHEMA_VERSION: SCHEMA_VERSION,
BUILTIN_THEMES: BUILTIN_THEMES,
COLOR_VAR_MAP: COLOR_VAR_MAP,
COLOR_GROUPS: COLOR_GROUPS,
FONT_SCALES: FONT_SCALES,
COLOR_LABELS: COLOR_LABELS,
SLOT_COUNT: SLOT_COUNT,
FONT_OPTIONS: FONT_OPTIONS,

listBuiltins: function() {
return BUILTIN_THEMES.map(function(t) {
return { id: t.id, name: t.name, desc: t.desc, author: t.author };
});
},

getActive: function() {
var g;
try { g = Storage.getGlobal(); } catch (e) { return clone(BUILTIN_THEMES[0]); }
var s = (g.settings && g.settings.theme) || {};
var activeId = s.activeId || 'paper-white';
var custom = s.custom || null;
if (activeId === 'custom' && custom) return mergeWithDefault(custom);
var builtin = findBuiltin(activeId);
if (!builtin) builtin = BUILTIN_THEMES[0];
var merged = clone(builtin);
if (custom && s.overrides) {
Object.keys(s.overrides).forEach(function(k) {
if (k in merged.colors) merged.colors[k] = s.overrides[k];
});
}
if (s.backgroundOverrides && merged.background) {
Object.keys(s.backgroundOverrides).forEach(function(k) {
if (k === 'image' || k === 'opacity') {
merged.background[k] = s.backgroundOverrides[k];
}
});
}
if (s.fontScale != null) merged.fontScale = s.fontScale;
if (s.fontIds && typeof s.fontIds === 'object') {
  var sansOpt = null, serifOpt = null;
  (FONT_OPTIONS.sans || []).forEach(function(o) { if (o.id === s.fontIds.sans) sansOpt = o; });
  (FONT_OPTIONS.serif || []).forEach(function(o) { if (o.id === s.fontIds.serif) serifOpt = o; });
  if (sansOpt) merged.fonts.sans = sansOpt.family;
  if (serifOpt) merged.fonts.serif = serifOpt.family;
}
return merged;
},

getBuiltin: function(id) {
var t = findBuiltin(id);
return t ? clone(t) : null;
},

buildCssVars: function(theme) {
if (!theme) theme = this.getActive();
var vars = {};
Object.keys(theme.colors).forEach(function(k) {
var cssVar = COLOR_VAR_MAP[k];
if (cssVar) vars[cssVar] = theme.colors[k];
});
vars['--font-sans'] = theme.fonts.sans;
vars['--font-serif'] = theme.fonts.serif;
vars['--font-mono'] = theme.fonts.mono;
Object.keys(theme.fontSizes).forEach(function(k) {
vars['--font-size-' + k] = theme.fontSizes[k];
});
Object.keys(theme.radius).forEach(function(k) {
vars['--radius-' + k] = theme.radius[k];
});
vars['--glass-opacity'] = (theme.background && theme.background.opacity != null) ? String(theme.background.opacity) : '1';
vars['--bg-image'] = (theme.background && theme.background.image) ? ('url("' + theme.background.image + '")') : 'none';
vars['--fs-scale'] = String((theme.fontScale != null) ? theme.fontScale : 1);
// ---- 编辑风 token 桥接（战役 3 · U-1）----
// 编辑风三书票走 colors/editorial；旧六主题与旧导入包无 editorial，
// 在此单点兜底为旧视觉（圆角 2px、无纸纹、无磨砂），保证不破版。
var ed = theme.editorial || {};
vars['--bg'] = theme.colors.bg;
vars['--panel'] = theme.colors.bgPanel;
vars['--card'] = theme.colors.bgCard;
vars['--ink'] = theme.colors.text;
vars['--ink-2'] = theme.colors.text2;
vars['--muted'] = theme.colors.textMuted;
vars['--faint'] = theme.colors.textFaint;
vars['--hair'] = theme.colors.border;
vars['--hair-strong'] = theme.colors.borderStrong;
vars['--accent'] = theme.colors.accent;
vars['--sans'] = theme.fonts.sans;
vars['--serif'] = theme.fonts.serif;
vars['--kai'] = theme.fonts.kai || '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif';
vars['--radius'] = ed.radius || '2px';
vars['--glass-blur'] = ed.glassBlur || '0px';
vars['--paper-grain'] = (ed.paperGrain != null && ed.paperGrain !== '') ? String(ed.paperGrain) : '0';
vars['--seal'] = ed.seal || '#a8402f';
vars['--body-size'] = ed.bodySize || '17px';
vars['--body-lh'] = ed.bodyLh || '1.85';
return vars;
},

importTheme: function(json) {
var theme;
try { theme = (typeof json === 'string') ? JSON.parse(json) : json; }
catch (e) { return { ok: false, reason: 'JSON 解析失败：' + e.message }; }
var v = validateTheme(theme);
if (!v.ok) return v;
var merged = mergeWithDefault(theme);
var g = Storage.getGlobal();
if (!g.settings) g.settings = {};
if (!g.settings.theme) g.settings.theme = {};
g.settings.theme.activeId = 'custom';
g.settings.theme.custom = merged;
Storage.setGlobal(g);
return { ok: true, name: merged.name };
},

exportTheme: function() {
// 开放 schema：全量导出 getActive() 的所有键，
// 未来新增主题字段（borderStyle / cornerDecoration 等）自动随包导出，无需改此函数。
var active = this.getActive();
var out = clone(active);
out.schemaVersion = SCHEMA_VERSION;
if (!out.id) out.id = 'custom';
if (!out.name) out.name = '未命名主题';
return JSON.stringify(out, null, 2);
},

setBuiltin: function(id) {
if (!findBuiltin(id)) return { ok: false, reason: '内置不存在：' + id };
var g = Storage.getGlobal();
if (!g.settings) g.settings = {};
if (!g.settings.theme) g.settings.theme = {};
g.settings.theme.activeId = id;
g.settings.theme.custom = null;
Storage.setGlobal(g);
return { ok: true, id: id };
},

setColorOverride: function(key, value) {
if (!COLOR_VAR_MAP[key]) return { ok: false, reason: '未知色键：' + key };
var g = Storage.getGlobal();
if (!g.settings) g.settings = {};
if (!g.settings.theme) g.settings.theme = {};
if (!g.settings.theme.overrides) g.settings.theme.overrides = {};
g.settings.theme.overrides[key] = String(value);
Storage.setGlobal(g);
return { ok: true, key: key, value: value };
},

clearOverrides: function() {
var g = Storage.getGlobal();
if (g.settings && g.settings.theme) {
g.settings.theme.overrides = {};
Storage.setGlobal(g);
}
return { ok: true };
},

listSlots: function() {
  var g = Storage.getGlobal();
  var slots = (g.settings && g.settings.theme && g.settings.theme.slots) || [];
  var out = [];
  for (var i = 0; i < SLOT_COUNT; i++) {
    var s = slots[i] || null;
    out.push(s ? { index: i, name: s.name || ('主题' + (i + 1)), hasData: true } : { index: i, name: '', hasData: false });
  }
  return out;
},

saveSlot: function(index, name) {
  index = Number(index);
  if (index < 0 || index >= SLOT_COUNT) return { ok: false, reason: '槽位越界' };
  var g = Storage.getGlobal();
  if (!g.settings) g.settings = {};
  if (!g.settings.theme) g.settings.theme = {};
  if (!Array.isArray(g.settings.theme.slots)) g.settings.theme.slots = [];
  var active = this.getActive();
  var snapshot = {
    name: String(name || ('主题' + (index + 1))),
    colors: JSON.parse(JSON.stringify(active.colors)),
    fonts: JSON.parse(JSON.stringify(active.fonts)),
    fontSizes: JSON.parse(JSON.stringify(active.fontSizes)),
    radius: JSON.parse(JSON.stringify(active.radius)),
    background: JSON.parse(JSON.stringify(active.background || {})),
    // editorial 随槽位快照（旧主题为 null，buildCssVars 内单点兜底旧视觉）
    editorial: active.editorial ? JSON.parse(JSON.stringify(active.editorial)) : null,
    fontScale: (active.fontScale != null) ? active.fontScale : 1
  };
  g.settings.theme.slots[index] = snapshot;
  Storage.setGlobal(g);
  return { ok: true, index: index, name: snapshot.name };
},

loadSlot: function(index) {
  index = Number(index);
  var g = Storage.getGlobal();
  var slots = (g.settings && g.settings.theme && g.settings.theme.slots) || [];
  var s = slots[index];
  if (!s) return { ok: false, reason: '槽位为空' };
  if (!g.settings.theme) g.settings.theme = {};
  g.settings.theme.activeId = 'custom';
  g.settings.theme.custom = {
    id: 'custom',
    name: s.name || ('主题' + (index + 1)),
    colors: s.colors || {},
    fonts: s.fonts || {},
    fontSizes: s.fontSizes || {},
    radius: s.radius || {},
    background: s.background || {},
    editorial: s.editorial || null
  };
  g.settings.theme.fontScale = (s.fontScale != null) ? s.fontScale : 1;
  g.settings.theme.overrides = {};
  g.settings.theme.backgroundOverrides = {};
  Storage.setGlobal(g);
  return { ok: true, index: index, name: g.settings.theme.custom.name };
},

deleteSlot: function(index) {
  index = Number(index);
  var g = Storage.getGlobal();
  if (!g.settings || !g.settings.theme || !Array.isArray(g.settings.theme.slots)) return { ok: true };
  g.settings.theme.slots[index] = null;
  Storage.setGlobal(g);
  return { ok: true, index: index };
},

renameSlot: function(index, name) {
  index = Number(index);
  var g = Storage.getGlobal();
  var slots = (g.settings && g.settings.theme && g.settings.theme.slots) || [];
  var s = slots[index];
  if (!s) return { ok: false, reason: '槽位为空' };
  s.name = String(name || s.name);
  Storage.setGlobal(g);
  return { ok: true, index: index, name: s.name };
},

setFont: function(kind, fontId) {
  if (kind !== 'sans' && kind !== 'serif') return { ok: false, reason: 'kind 必须是 sans 或 serif' };
  var opts = FONT_OPTIONS[kind] || [];
  var opt = null;
  for (var i = 0; i < opts.length; i++) if (opts[i].id === fontId) opt = opts[i];
  if (!opt) return { ok: false, reason: '字体不存在：' + fontId };
  var g = Storage.getGlobal();
  if (!g.settings) g.settings = {};
  if (!g.settings.theme) g.settings.theme = {};
  if (!g.settings.theme.fontIds) g.settings.theme.fontIds = {};
  g.settings.theme.fontIds[kind] = fontId;
  Storage.setGlobal(g);
  return { ok: true, kind: kind, id: fontId, family: opt.family, css: opt.css || '' };
},

getFontId: function(kind) {
  var g = Storage.getGlobal();
  var ids = (g.settings && g.settings.theme && g.settings.theme.fontIds) || {};
  if (kind === 'sans') return ids.sans || 'system';
  if (kind === 'serif') return ids.serif || 'system-serif';
  return '';
},

setBackground: function(patch) {
if (!patch || typeof patch !== 'object') return { ok: false, reason: '参数不是对象' };
var g = Storage.getGlobal();
if (!g.settings) g.settings = {};
if (!g.settings.theme) g.settings.theme = {};
if (!g.settings.theme.backgroundOverrides) g.settings.theme.backgroundOverrides = {};
var valid = ['image', 'opacity'];
Object.keys(patch).forEach(function(k) {
if (valid.indexOf(k) >= 0) g.settings.theme.backgroundOverrides[k] = patch[k];
});
Storage.setGlobal(g);
return { ok: true };
},

clearBackground: function() {
var g = Storage.getGlobal();
if (g.settings && g.settings.theme) {
g.settings.theme.backgroundOverrides = {};
Storage.setGlobal(g);
}
return { ok: true };
},

setFontScale: function(value) {
var g = Storage.getGlobal();
if (!g.settings) g.settings = {};
if (!g.settings.theme) g.settings.theme = {};
g.settings.theme.fontScale = Number(value) || 1;
Storage.setGlobal(g);
return { ok: true, fontScale: g.settings.theme.fontScale };
},

previewTheme: function(theme) {
var v = validateTheme(theme);
if (!v.ok) return v;
var merged = mergeWithDefault(theme);
return { ok: true, vars: this.buildCssVars(merged) };
}
};

if (typeof window !== 'undefined') window.Theme = Theme;
if (typeof module !== 'undefined' && module.exports) module.exports = Theme;
})();

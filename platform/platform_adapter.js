// ============================================================
// 平台适配层 · 网络 + 对话 + 生命周期 + 图片 + UI 跨层收口
// 与 StorageAdapter / LocalStore 独立：那两个管存储，这里管网络请求
// 和用户对话弹窗。
// 迁 RN 落点（战役 2 已批，C-2 案 A）：
//   http         → RN 内置 fetch，直接透传；
//   dialog.alert → 保持同步签名 void：RN 侧覆盖 Platform.ui.toast 为
//                  console.warn + 全局事件总线，调用点零修改（不使用
//                  Alert.alert，故无需把调用点改成 await）；
//   lifecycle    → AppState 映射（active/background）；
//   image.compressFile → RN 侧本战役 stub（reject），战役 3 接图片库。
// ============================================================

(function() {
  var Platform = {
    // 直连 fetch，接口与原生一致：返回 Promise<Response>
    // 用法：await Platform.http(url, { method, headers, body })
    // RN 侧可直接实现为 fetch（RN 有内置），或换成 axios 之类的库
    http: function(url, options) {
      return window.fetch(url, options);
    },

    dialog: {
      // 告警提示：收口到 Platform.ui.toast（非阻塞提示条）
      // 同步签名 void：调用点保持同步语义（不依赖返回值），改内部实现无传染。
      // Platform.ui.toast 在 UI 未就绪时返回 false → 退回原生 window.alert；
      // RN 侧桥接层覆盖 Platform.ui.toast（console.warn + 事件总线）后同样走同步语义。
      alert: function(msg) {
        if (Platform.ui.toast(msg, { type: 'warn' }) !== false) return;
        if (typeof window !== 'undefined') window.alert(msg);
      },
      // 同步确认，语义等价于原生 confirm（返回 boolean）
      // Web 侧现在只有 story.js 用（M5 才收），先定义接口供将来替换
      confirm: function(msg) {
        return window.confirm(msg);
      }
    },

    image: {
      // 从 File/Blob 压缩到 base64 dataURL。
      // file : <input type=file> 选到的 File（RN 侧换成 {uri,name,type} 之类）
      // opts : { maxSize, quality, fallbackQuality, maxBytes }
      // 返回 : Promise<{ src, bytes, w, h }>
      //   src            完整 dataURL（data:image/jpeg;base64,...）
      //   bytes          base64 净荷估算字节（去掉前缀 ×0.75 后四舍五入）
      //   w / h          缩放后尺寸（最长边 ≤ maxSize 的等比整数）
      // 前置守卫两种 Error："没有文件" / "不是图片文件"
      // 解码失败两种 Error："图片解析失败" / "文件读取失败"
      // 两级质量：先 quality，超 maxBytes 再用 fallbackQuality 压一次，只降一次
      compressFile: function(file, opts) {
        opts = opts || {};
        var maxSize = opts.maxSize != null ? opts.maxSize : 256;
        var quality = opts.quality != null ? opts.quality : 0.8;
        var fallbackQuality = opts.fallbackQuality != null ? opts.fallbackQuality : 0.6;
        var maxBytes = opts.maxBytes != null ? opts.maxBytes : 81920; // 80KB
        var jpegPrefix = 'data:image/jpeg;base64,';
        return new Promise(function(resolve, reject) {
          if (!file) { reject(new Error('没有文件')); return; }
          if (!/^image\//.test(file.type)) { reject(new Error('不是图片文件')); return; }
          var reader = new FileReader();
          reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
              try {
                var w = img.width, h = img.height;
                var scale = Math.min(1, maxSize / Math.max(w, h));
                var nw = Math.round(w * scale);
                var nh = Math.round(h * scale);
                var canvas = document.createElement('canvas');
                canvas.width = nw; canvas.height = nh;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, nw, nh);
                var dataUrl = canvas.toDataURL('image/jpeg', quality);
                var bytes = Math.round((dataUrl.length - jpegPrefix.length) * 0.75);
                if (bytes > maxBytes) {
                  dataUrl = canvas.toDataURL('image/jpeg', fallbackQuality);
                  bytes = Math.round((dataUrl.length - jpegPrefix.length) * 0.75);
                }
                resolve({ src: dataUrl, bytes: bytes, w: nw, h: nh });
              } catch (err) { reject(err); }
            };
            img.onerror = function() { reject(new Error('图片解析失败')); };
            img.src = e.target.result;
          };
          reader.onerror = function() { reject(new Error('文件读取失败')); };
          reader.readAsDataURL(file);
        });
      }
    },

    lifecycle: {
      // 应用进入前台（Web：visibilitychange + visible）
      // RN 侧对应 AppState.change + active
      onForeground: function(cb) {
        if (typeof document === 'undefined') return;
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'visible') cb();
        });
      },
      // 应用进入后台（Web：visibilitychange + hidden）
      // RN 侧对应 AppState.change + background/inactive
      // 注意：RN 上应用被完全杀掉无法拦截，存盘不要只依赖 onPageHide
      onBackground: function(cb) {
        if (typeof document === 'undefined') return;
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'hidden') cb();
        });
      },
      // 页面即将卸载（Web：pagehide；关闭/刷新/导航离开）
      // RN 侧无对应物，实现为空操作。调用方代码不用改，只是这个钩子
      // 在 RN 上永不触发——"最后的存盘机会"由 onBackground 保证
      onPageHide: function(cb) {
        if (typeof window === 'undefined') return;
        window.addEventListener('pagehide', cb);
      }
    },

    // UI 跨层调用收口（业务 → UI 组件）
    // 业务层（engine/vfs）一律调 Platform.ui.xxx，不裸引用 UI：
    // - Web/Electron：以下方法默认转发到全局 UI.xxx（typeof 守卫）；
    // - RN：无 UI 层，由 RN 桥接层（战役 3）覆盖为 console/事件/导航实现，
    //   未覆盖前调用为 no-op（返回 false），保证 bootstrap 与引擎方法不崩。
    ui: (function() {
      // 20 个收口方法（战役 2 · 2-1 批按盘点表 1；renderGame 为施工中
      // 发现 story.js L659 漏盘后按同范式补齐，关账报告已标注；
      // renderChapterHead 为 2026-09-25 契约漏登补登——story.js L565 已按收口
      // 范式调用但名单漏登，致开局渲染抛 Platform.ui.renderChapterHead is not
      // a function；契约静态校验见 tests/unit/test_platform_ui_contract.js；
      // showGame 为 2026-09-27 删除——2-1 登记的空头契约，全仓零定义零调用
      // （实际导航走 showScreen('screen-game') + renderGame），契约测试 C5 抓出）：
      // 返回值一律透传（Promise / 数值 / 布尔原样返回，confirmAsync 可 await）；
      // UI 未就绪（含 RN 未覆盖）时返回 false，供 dialog.alert 等需要判断
      // "是否投递成功"的调用方走兜底。
      // 契约总数 = NAMES 20 + 单独委托 ui.openShop = 21。
      var NAMES = [
        'toast', 'appendHint', 'fillIcons', 'confirmAsync',
        'showScreen', 'appendStory', 'appendDiceResult',
        'setBusy', 'showStoryLoading', 'renderTopbar',
        'renderSidebarExpanded', 'appendProposalCard', 'updateTokenBadge',
        'showStoryError', '_currentRoundNum', 'showSettingsTab',
        'showHome', 'renderGame', 'renderChapterHead', 'clearStory'
      ];
      var ui = {};
      NAMES.forEach(function(name) {
        ui[name] = function() {
          if (typeof UI !== 'undefined' && typeof UI[name] === 'function') {
            return UI[name].apply(UI, arguments);
          }
          return false;
        };
      });
      // 商店打开：默认转发 UI_Shop；RN 侧由桥接层覆盖为 navigation.navigate
      ui.openShop = function(shopId) {
        if (typeof UI_Shop !== 'undefined' && UI_Shop.open) return UI_Shop.open(shopId);
        return null;
      };
      return ui;
    })()
  };
  if (typeof window !== 'undefined') window.Platform = Platform;
  if (typeof module !== 'undefined' && module.exports) module.exports = Platform;
})();

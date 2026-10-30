// Rime 外觀設計器 · 原生窗口(JXA 備援方案)
// 當本機沒有 Xcode 命令行工具、沒法編譯 window.m 時使用:用 macOS 自帶的 osascript(JXA)
// 創建 NSWindow + WKWebView。不需要編譯。每一步都會把進度寫到 stderr(啟動器會存進 window.log)。
// 用法: osascript -l JavaScript window.js <URL> [圖標路徑] [標題]
ObjC.import('Cocoa');
ObjC.import('WebKit');

function log(msg) { console.log('[window.js] ' + msg); }

function run(argv) {
  var url = argv[0];
  var iconPath = argv[1] || '';
  var title = argv[2] || 'Rime 外觀設計器';
  if (!url) { throw new Error('缺少 URL 參數'); }
  log('start ' + url.replace(/t=.*/, 't=***'));

  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyRegular);
  log('app ok');

  // ---- 程序圖標(Dock)----
  try {
    if (iconPath) {
      var img = $.NSImage.alloc.initWithContentsOfFile(iconPath);
      if (img) { app.setApplicationIconImage(img); }
    }
  } catch (e) { log('icon failed: ' + e); }

  // ---- 菜單:必須有「編輯」菜單,輸入框裏的 ⌘C/⌘V/⌘A/⌘Z 才能用 ----
  try {
    var CMD = 1048576;    // NSEventModifierFlagCommand
    var SHIFT = 131072;   // NSEventModifierFlagShift
    var item = function (label, action, key, mask) {
      var it = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(label, action, key);
      if (mask !== undefined) { it.setKeyEquivalentModifierMask(mask); }
      return it;
    };
    var submenu = function (label, items) {
      var holder = $.NSMenuItem.alloc.init;
      var menu = $.NSMenu.alloc.initWithTitle(label);
      items.forEach(function (x) { menu.addItem(x); });
      holder.setSubmenu(menu);
      return holder;
    };
    var sep = function () { return $.NSMenuItem.separatorItem; };
    var mainMenu = $.NSMenu.alloc.init;
    mainMenu.addItem(submenu(title, [
      item('隱藏 ' + title, 'hide:', 'h'),
      sep(),
      item('退出 ' + title, 'terminate:', 'q')
    ]));
    mainMenu.addItem(submenu('編輯', [
      item('撤銷', 'undo:', 'z'),
      item('重做', 'redo:', 'z', CMD | SHIFT),
      sep(),
      item('剪切', 'cut:', 'x'),
      item('複製', 'copy:', 'c'),
      item('粘貼', 'paste:', 'v'),
      item('全選', 'selectAll:', 'a')
    ]));
    mainMenu.addItem(submenu('窗口', [
      item('最小化', 'performMiniaturize:', 'm'),
      item('關閉窗口', 'performClose:', 'w')
    ]));
    app.setMainMenu(mainMenu);
    log('menu ok');
  } catch (e) { log('menu failed: ' + e); }

  // ---- 代理:關閉最後一個窗口就退出程序(失敗不致命:服務會在無心跳後自行退出,啟動器隨之收尾)----
  try {
    ObjC.registerSubclass({
      name: 'RimeUIAppDelegate',
      superclass: 'NSObject',
      protocols: ['NSApplicationDelegate'],
      methods: {
        'applicationShouldTerminateAfterLastWindowClosed:': {
          types: ['bool', ['id']],
          implementation: function (sender) { return true; }
        }
      }
    });
    var delegate = $.RimeUIAppDelegate.alloc.init;
    app.setDelegate(delegate);
    log('delegate ok');
  } catch (e) { log('delegate failed: ' + e); }

  // ---- 窗口 + 網頁 ----
  // 樣式 15 = 標題欄 | 可關閉 | 可最小化 | 可縮放;2 = NSBackingStoreBuffered
  var win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, 1260, 880), 15, 2, false);
  win.setTitle(title);
  win.setMinSize($.NSMakeSize(920, 640));
  win.center;
  try { win.setFrameAutosaveName('RimeAppearanceDesignerMainWindow'); } catch (e) { log('autosave failed: ' + e); }
  log('window ok');

  var cfg = $.WKWebViewConfiguration.alloc.init;
  var web = $.WKWebView.alloc.initWithFrameConfiguration(win.contentView.bounds, cfg);
  web.setAutoresizingMask(18);    // 寬高跟隨窗口(NSViewWidthSizable | NSViewHeightSizable)
  win.contentView.addSubview(web);
  web.loadRequest($.NSURLRequest.requestWithURL($.NSURL.URLWithString(url)));
  log('webview ok');

  win.makeKeyAndOrderFront(null);
  app.activateIgnoringOtherApps(true);
  log('running');
  app.run();
}

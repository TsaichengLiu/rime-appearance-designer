// Rime 外觀設計器 · 原生窗口(Objective-C)
// 啟動器在本機有 Xcode 命令行工具時,把這個文件編譯成一個小程序並緩存,之後每次啟動直接運行,不再編譯。
//   clang -fobjc-arc -O1 -framework Cocoa -framework WebKit window.m -o RimeUIWindow
// 用法: RimeUIWindow <URL> [圖標路徑] [標題]
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface RimeUIDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *web;
@property (assign) BOOL forceClose;
@property (copy) NSString *host;
@end

@implementation RimeUIDelegate

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

// 關窗口前問頁面有沒有未套用的改動
- (BOOL)windowShouldClose:(NSWindow *)sender {
  if (self.forceClose) return YES;
  [self.web evaluateJavaScript:@"!!(window.__ST && window.__ST.dirty)" completionHandler:^(id result, NSError *err) {
    BOOL dirty = (err == nil) && [result respondsToSelector:@selector(boolValue)] && [result boolValue];
    if (!dirty) { self.forceClose = YES; [self.window performClose:nil]; return; }
    NSAlert *a = [[NSAlert alloc] init];
    a.messageText = @"有未套用的改動";
    a.informativeText = @"現在關閉會丟掉這些改動。";
    [a addButtonWithTitle:@"取消"];
    [a addButtonWithTitle:@"放棄改動並關閉"];
    [a beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse r) {
      if (r == NSAlertSecondButtonReturn) { self.forceClose = YES; [self.window performClose:nil]; }
    }];
  }];
  return NO;
}

// ---- 頁面里的 alert / confirm / prompt(WKWebView 默認不顯示,這裏補上)----
- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
  NSAlert *a = [[NSAlert alloc] init]; a.messageText = message; [a addButtonWithTitle:@"好"];
  [a beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse r) { completionHandler(); }];
}
- (void)webView:(WKWebView *)webView runJavaScriptConfirmPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(BOOL))completionHandler {
  NSAlert *a = [[NSAlert alloc] init]; a.messageText = message; [a addButtonWithTitle:@"確定"]; [a addButtonWithTitle:@"取消"];
  [a beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse r) { completionHandler(r == NSAlertFirstButtonReturn); }];
}

// ---- 只允許界面自己的本地地址,外部鏈接交給系統瀏覽器 ----
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  NSURL *u = action.request.URL;
  if ([u.host isEqualToString:@"127.0.0.1"] || [u.scheme isEqualToString:@"about"]) { decisionHandler(WKNavigationActionPolicyAllow); return; }
  if (u) [[NSWorkspace sharedWorkspace] openURL:u];
  decisionHandler(WKNavigationActionPolicyCancel);
}
@end

static NSMenuItem *Item(NSString *title, SEL action, NSString *key, NSEventModifierFlags mask) {
  NSMenuItem *it = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:key];
  if (mask) it.keyEquivalentModifierMask = mask;
  return it;
}
static NSMenuItem *Sub(NSString *title, NSArray<NSMenuItem *> *items) {
  NSMenuItem *holder = [[NSMenuItem alloc] init];
  NSMenu *menu = [[NSMenu alloc] initWithTitle:title];
  for (NSMenuItem *i in items) [menu addItem:i];
  holder.submenu = menu;
  return holder;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2) { fprintf(stderr, "usage: RimeUIWindow URL [icon] [title]\n"); return 2; }
    NSString *urlStr = [NSString stringWithUTF8String:argv[1]];
    NSString *iconPath = argc > 2 ? [NSString stringWithUTF8String:argv[2]] : @"";
    NSString *title = argc > 3 ? [NSString stringWithUTF8String:argv[3]] : @"Rime 外觀設計器";

    NSApplication *app = [NSApplication sharedApplication];
    [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    if (iconPath.length) {
      NSImage *img = [[NSImage alloc] initWithContentsOfFile:iconPath];
      if (img) [app setApplicationIconImage:img];
    }

    // 菜單:有「編輯」菜單,輸入框里的 ⌘C ⌘V ⌘A ⌘Z 才能用
    NSMenu *main = [[NSMenu alloc] init];
    [main addItem:Sub(title, @[
      Item([@"隱藏 " stringByAppendingString:title], @selector(hide:), @"h", 0),
      [NSMenuItem separatorItem],
      Item([@"退出 " stringByAppendingString:title], @selector(terminate:), @"q", 0)])];
    [main addItem:Sub(@"編輯", @[
      Item(@"撤銷", NSSelectorFromString(@"undo:"), @"z", 0),
      Item(@"重做", NSSelectorFromString(@"redo:"), @"z", NSEventModifierFlagCommand | NSEventModifierFlagShift),
      [NSMenuItem separatorItem],
      Item(@"剪切", @selector(cut:), @"x", 0),
      Item(@"複製", @selector(copy:), @"c", 0),
      Item(@"粘貼", @selector(paste:), @"v", 0),
      Item(@"全選", @selector(selectAll:), @"a", 0)])];
    [main addItem:Sub(@"窗口", @[
      Item(@"最小化", @selector(performMiniaturize:), @"m", 0),
      Item(@"關閉窗口", @selector(performClose:), @"w", 0)])];
    [app setMainMenu:main];

    RimeUIDelegate *d = [[RimeUIDelegate alloc] init];
    app.delegate = d;

    NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;
    NSWindow *w = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1260, 880) styleMask:style backing:NSBackingStoreBuffered defer:NO];
    w.title = title;
    w.minSize = NSMakeSize(920, 640);
    w.releasedWhenClosed = NO;
    [w center];
    [w setFrameAutosaveName:@"RimeAppearanceDesignerMainWindow"];
    w.delegate = d;

    WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
    WKWebView *web = [[WKWebView alloc] initWithFrame:[w.contentView bounds] configuration:cfg];
    web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    web.UIDelegate = d;
    web.navigationDelegate = d;
    [w.contentView addSubview:web];
    d.window = w;
    d.web = web;

    [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:urlStr]]];
    [w makeKeyAndOrderFront:nil];
    if (@available(macOS 14.0, *)) { [app activate]; } else { [app activateIgnoringOtherApps:YES]; }
    [app run];
  }
  return 0;
}

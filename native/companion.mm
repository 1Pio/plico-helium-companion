// Copyright 2026 The plico Authors
// SPDX-License-Identifier: GPL-3.0-only
#import "companion.h"
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <Cocoa/Cocoa.h>
#include <arpa/inet.h>
#import <libproc.h>
#include <signal.h>
#include <unistd.h>
#include <set>
#include <thread>
#include <vector>
#include "extension_origin.h"
#include "keymap.h"
#include "plico/core/gesture_router.h"
#include "plico/core/navigator_model.h"
#include "preferences.h"
#include "presentation.h"
#include "protocol.h"
using namespace plico;
static bool TraceEnabled() { return getenv("PLICO_DIAGNOSTICS") != nullptr; }
static BOOL PairingFailure(const char* reason, int error = 0) {
  if (TraceEnabled()) fprintf(stderr, "plico: pairing unavailable: %s error=%d\n", reason, error);
  return NO;
}
static int64_t Now() { return (int64_t)(NSProcessInfo.processInfo.systemUptime * 1000); }
static NSArray* IDs(const std::vector<TabId>& v) {
  NSMutableArray* a = [NSMutableArray array];
  for (auto id : v) [a addObject:@(id)];
  return a;
}
static std::vector<TabId> Vector(id a) {
  std::vector<TabId> v;
  if ([a isKindOfClass:NSArray.class])
    for (id x in a)
      if ([x isKindOfClass:NSNumber.class]) v.push_back([x longLongValue]);
  return v;
}
static unsigned Mods(CGEventFlags f) {
  return ((f & kCGEventFlagMaskCommand) ? kCommand : 0) |
         ((f & kCGEventFlagMaskControl) ? kControl : 0) |
         ((f & kCGEventFlagMaskShift) ? kShift : 0) |
         ((f & kCGEventFlagMaskAlternate) ? kOption : 0);
}
static CGEventRef Tap(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void* context) {
  return [(__bridge Companion*)context event:event type:type];
}
@implementation Companion
- (instancetype)init {
  if ((self = [super init])) {
    router = new GestureRouter(model);
    _requests = [NSMutableSet set];
    _rows = @[];
    _tabs = @{};
    _icons = [NSCache new];
    _icons.countLimit = 128;
  }
  return self;
}
- (void)applicationDidFinishLaunching:(NSNotification*)note {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
  NSMenu* main = [NSMenu new];
  NSMenuItem* edit = [NSMenuItem new];
  edit.title = @"Edit";
  edit.submenu = [NSMenu new];
  [main addItem:edit];
  for (NSArray* entry in @[
         @[ @"Undo", @"undo:", @"z" ], @[ @"Redo", @"redo:", @"Z" ], @[ @"Cut", @"cut:", @"x" ],
         @[ @"Copy", @"copy:", @"c" ], @[ @"Paste", @"paste:", @"v" ],
         @[ @"Select All", @"selectAll:", @"a" ]
       ]) {
    NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:entry[0]
                                                  action:NSSelectorFromString(entry[1])
                                           keyEquivalent:entry[2]];
    [edit.submenu addItem:item];
  }
  NSApp.mainMenu = main;
  self.statusItem = [NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];
  self.statusItem.button.title = @"p";
  NSMenu* menu = [NSMenu new];
  for (NSArray* entry in @[
         @[ @"Open navigator", @"toggle:" ], @[ @"Enable Accessibility…", @"permission:" ],
         @[ @"Disconnect Plico", @"quit:" ]
       ]) {
    NSMenuItem* i = [[NSMenuItem alloc] initWithTitle:entry[0]
                                               action:NSSelectorFromString(entry[1])
                                        keyEquivalent:@""];
    i.target = self;
    [menu addItem:i];
  }
  self.statusItem.menu = menu;
  NSNotificationCenter* nc = NSWorkspace.sharedWorkspace.notificationCenter;
  [nc addObserver:self
         selector:@selector(deactivate:)
             name:NSWorkspaceDidActivateApplicationNotification
           object:nil];
  [nc addObserver:self
         selector:@selector(deactivate:)
             name:NSWorkspaceWillSleepNotification
           object:nil];
  [[NSDistributedNotificationCenter defaultCenter] addObserver:self
                                                      selector:@selector(deactivate:)
                                                          name:@"com.apple.screenIsLocked"
                                                        object:nil];
  self.panel = [[PlicoPanel alloc]
      initWithContentRect:NSMakeRect(0, 0, 800, 480)
                styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                  backing:NSBackingStoreBuffered
                    defer:NO];
  self.panel.animationBehavior = NSWindowAnimationBehaviorNone;
  self.panel.appearance = nil;
  self.panel.title = @"Plico Navigator";
  self.panel.level = NSFloatingWindowLevel;
  self.panel.opaque = NO;
  self.panel.backgroundColor = NSColor.clearColor;
  self.panel.hasShadow = NO;
  self.panel.hidesOnDeactivate = NO;
  self.panel.collectionBehavior =
      NSWindowCollectionBehaviorMoveToActiveSpace | NSWindowCollectionBehaviorFullScreenAuxiliary;
  NSView* root = [[NSView alloc] initWithFrame:self.panel.contentView.bounds];
  self.panel.contentView = root;
  self.barAmbient = [PlicoAmbientView new];
  [root addSubview:self.barAmbient];
  self.barMaterial = [PlicoMaterial new];
  self.stackMaterial = [PlicoMaterial new];
  [root addSubview:self.barMaterial];
  [root addSubview:self.stackMaterial];
  self.navigator = [[NavigatorView alloc] initWithFrame:root.bounds];
  self.navigator.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.navigator.owner = self;
  [root addSubview:self.navigator];
  self.composer = [[PlicoPanel alloc]
      initWithContentRect:NSMakeRect(0, 0, 620, 420)
                styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                  backing:NSBackingStoreBuffered
                    defer:NO];
  self.composer.animationBehavior = NSWindowAnimationBehaviorNone;
  self.composer.appearance = self.panel.appearance;
  self.composer.title = @"Plico Search";
  self.composer.level = NSFloatingWindowLevel;
  self.composer.opaque = NO;
  self.composer.backgroundColor = NSColor.clearColor;
  self.composer.hasShadow = YES;
  self.composer.collectionBehavior = self.panel.collectionBehavior;
  self.composer.hasShadow = NO;
  self.inputMaterial = [PlicoMaterial new];
  self.resultMaterial = [PlicoMaterial new];
  [self.composer.contentView addSubview:self.inputMaterial];
  [self.composer.contentView addSubview:self.resultMaterial];
  self.field = [[NSTextField alloc] initWithFrame:NSZeroRect];
  self.field.font = [NSFont systemFontOfSize:18 weight:NSFontWeightRegular];
  self.field.focusRingType = NSFocusRingTypeNone;
  self.field.bordered = NO;
  self.field.usesSingleLineMode = YES;
  self.field.cell.scrollable = YES;
  self.field.drawsBackground = NO;
  self.field.placeholderAttributedString = [[NSAttributedString alloc]
      initWithString:@"Search or enter an address"
          attributes:@{
            NSForegroundColorAttributeName : NSColor.secondaryLabelColor,
            NSFontAttributeName : self.field.font
          }];
  self.field.delegate = self;
  [self.inputMaterial addSubview:self.field];
  NSImageView* search = [[NSImageView alloc] initWithFrame:NSMakeRect(24, 22, 20, 20)];
  search.image = [NSImage imageWithSystemSymbolName:@"magnifyingglass"
                           accessibilityDescription:@"Search"];
  search.contentTintColor = NSColor.secondaryLabelColor;
  [self.inputMaterial addSubview:search];
  NSButton* submit = [NSButton buttonWithTitle:@"↵" target:self action:@selector(choose:)];
  submit.frame = NSZeroRect;
  submit.bezelStyle = NSBezelStyleRounded;
  submit.accessibilityLabel = @"Open selected result";
  [self.inputMaterial addSubview:submit];
  NSScrollView* scroll = [[NSScrollView alloc] initWithFrame:NSZeroRect];
  self.composerScroll = scroll;
  scroll.hasVerticalScroller = YES;
  scroll.drawsBackground = NO;
  self.results = [[NSTableView alloc] initWithFrame:scroll.bounds];
  self.results.headerView = nil;
  self.results.style = NSTableViewStylePlain;
  self.results.rowHeight = 48;
  self.results.intercellSpacing = NSMakeSize(0, 0);
  self.results.backgroundColor = NSColor.clearColor;
  self.results.delegate = self;
  self.results.dataSource = self;
  self.results.target = self;
  self.results.action = @selector(choose:);
  NSTableColumn* col = [[NSTableColumn alloc] initWithIdentifier:@"result"];
  col.width = 570;
  [self.results addTableColumn:col];
  scroll.documentView = self.results;
  [self.resultMaterial addSubview:scroll];
  self.composerHint = [NSTextField labelWithString:@"↑ ↓  Select"];
  self.composerHint.font = [NSFont systemFontOfSize:11];
  self.composerHint.textColor = NSColor.secondaryLabelColor;
  [self.resultMaterial addSubview:self.composerHint];
  self.composerActions = [NSTextField labelWithString:@"↵  Open    ·    esc  Close"];
  self.composerActions.font = [NSFont systemFontOfSize:11];
  self.composerActions.textColor = NSColor.secondaryLabelColor;
  self.composerActions.alignment = NSTextAlignmentRight;
  [self.resultMaterial addSubview:self.composerActions];
  __weak Companion* weak = self;
  self.localMonitor = [NSEvent
      addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                   handler:^NSEvent*(NSEvent* e) {
                                     Companion* c = weak;
                                     if (c.composer.visible) {
                                       if (e.keyCode == 53 &&
                                           ![(NSTextView*)c.field.currentEditor hasMarkedText]) {
                                         [c cancel];
                                         return nil;
                                       }
                                       if (e.keyCode == 36 &&
                                           ![(NSTextView*)c.field.currentEditor hasMarkedText]) {
                                         [c choose:nil];
                                         return nil;
                                       }
                                     }
                                     return e;
                                   }];
  pid_t pid = getppid();
  for (int i = 0; i < 8 && pid > 1; i++) {
    NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if ([app.bundleIdentifier isEqual:@"net.imput.helium"]) {
      heliumPID = pid;
      break;
    }
    struct proc_bsdinfo info = {};
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info)) break;
    pid = info.pbi_ppid;
  }
  [self installTap];
  std::thread([weak] {
    @autoreleasepool {
      while (true) {
        @autoreleasepool {
          uint32_t size = 0;
          char* header = (char*)&size;
          size_t got = 0;
          while (got < 4) {
            ssize_t n = read(STDIN_FILENO, header + got, 4 - got);
            if (n <= 0) goto done;
            got += n;
          }
          if (!size || size > 1024 * 1024) break;
          NSMutableData* data = [NSMutableData dataWithLength:size];
          got = 0;
          while (got < size) {
            ssize_t n = read(STDIN_FILENO, (char*)data.mutableBytes + got, size - got);
            if (n <= 0) goto done;
            got += n;
          }
          if (!PlicoJSONDepthSafe(data)) break;
          id msg = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
          if (![msg isKindOfClass:NSDictionary.class]) break;
          dispatch_async(dispatch_get_main_queue(), ^{
            [weak receive:msg];
          });
        }
      }
    done:
      dispatch_async(dispatch_get_main_queue(), ^{
        [weak quit:nil];
      });
    }
  }).detach();
  fprintf(stderr, "plico: host ready; browser=%d accessibility=%d\n", heliumPID,
          AXIsProcessTrusted());
}
- (void)reportInputStatus {
  if (!self.epoch) return;
  // AX returns an unsigned-byte Boolean; box a C++ bool for JSON true/false.
  NSNumber* accessibility = @(AXIsProcessTrusted() != 0);
  NSNumber* ready = @(tap && accessibility.boolValue);
  if ([ready isEqual:self.reportedInputReady] && [accessibility isEqual:self.reportedAccessibility])
    return;
  self.reportedInputReady = ready;
  self.reportedAccessibility = accessibility;
  [self send:@{@"type" : @"hostStatus", @"inputReady" : ready, @"accessibility" : accessibility}];
}
- (void)installTap {
  if (tap || !AXIsProcessTrusted()) {
    [self reportInputStatus];
    return;
  }
  CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp) |
                     CGEventMaskBit(kCGEventFlagsChanged) | CGEventMaskBit(kCGEventLeftMouseDown) |
                     CGEventMaskBit(kCGEventRightMouseDown);
  tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask,
                         Tap, (__bridge void*)self);
  if (TraceEnabled()) fprintf(stderr, "plico: event tap created=%d\n", tap != nullptr);
  if (tap) {
    tapSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), tapSource, kCFRunLoopCommonModes);
    CGEventTapEnable(tap, true);
  }
  [self reportInputStatus];
}
- (void)permission:(id)sender {
  AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)
                                    @{(__bridge NSString*)kAXTrustedCheckOptionPrompt : @YES});
  [self installTap];
}
- (void)toggle:(id)sender {
  if (!self.actionRequest && !self.pending && !self.resetOnSnapshot && [self paired]) {
    auto r = router->KeyDown(Action::kToggle, kCommand);
    [self apply:r];
  }
}
- (void)quit:(id)sender {
  if (self.stopped) return;
  self.stopped = YES;
  [self cancel];
  if (tap) {
    CGEventTapEnable(tap, false);
    CFRunLoopRemoveSource(CFRunLoopGetMain(), tapSource, kCFRunLoopCommonModes);
    CFRelease(tapSource);
    CFRelease(tap);
    tap = nullptr;
  }
  [NSApp terminate:nil];
}
- (void)deactivate:(NSNotification*)n {
  [self cancel];
  [self installTap];
}
- (void)send:(NSDictionary*)m {
  if (!self.epoch) return;
  NSMutableDictionary* d = [m mutableCopy];
  d[@"v"] = @1;
  d[@"epoch"] = self.epoch;
  d[@"window"] = self.snapshot[@"window"][@"id"] ?: @(-1);
  d[@"revision"] = @(self.revision);
  NSString* request = NSUUID.UUID.UUIDString;
  d[@"request"] = request;
  [self.requests addObject:request];
  if ([m[@"type"] isEqual:@"attachments"]) self.attachmentRequest = request;
  if ([m[@"type"] isEqual:@"close"] || [m[@"type"] isEqual:@"mute"]) {
    self.actionRequest = request;
    self.actionKind = m[@"type"];
    self.actionTab = m[@"tab"];
    self.actionFailed = NO;
    __weak Companion* w = self;
    [self.actionTimer invalidate];
    self.actionTimer = [NSTimer
        scheduledTimerWithTimeInterval:5
                               repeats:NO
                                 block:^(NSTimer* t) {
                                   Companion* c = w;
                                   if (!c) return;
                                   [c abandonAction];
                                   c.statusItem.button.toolTip =
                                       @"Tab action is awaiting the browser. Navigation canceled.";
                                 }];
  }
  if ([m[@"type"] isEqual:@"commit"]) {
    self.pendingRequest = request;
    __weak Companion* w = self;
    [self.commitTimer invalidate];
    self.commitTimer = [NSTimer
        scheduledTimerWithTimeInterval:4
                               repeats:NO
                                 block:^(NSTimer* t) {
                                   Companion* c = w;
                                   fprintf(stderr,
                                           "plico: commit timed out; disconnecting safely\n");
                                   [c quit:nil];
                                 }];
  }
  NSData* data = [NSJSONSerialization dataWithJSONObject:d options:0 error:nil];
  if (!data || data.length > 1024 * 1024) return;
  static dispatch_queue_t output = dispatch_queue_create("plico.output", DISPATCH_QUEUE_SERIAL);
  dispatch_async(output, ^{
    uint32_t size = (uint32_t)data.length;
    NSMutableData* frame = [NSMutableData dataWithBytes:&size length:4];
    [frame appendData:data];
    size_t sent = 0;
    while (sent < frame.length) {
      ssize_t n = write(STDOUT_FILENO, (char*)frame.bytes + sent, frame.length - sent);
      if (n <= 0) break;
      sent += n;
    }
  });
}
- (void)clearAction {
  [self.actionTimer invalidate];
  self.actionTimer = nil;
  self.actionRequest = nil;
  self.actionKind = nil;
  self.actionTab = nil;
  self.actionFailed = NO;
}
- (void)abandonAction {
  if (self.snapshot && self.actionRequest) {
    self.actionFailed = YES;
    NSMutableDictionary* latest = [self.snapshot mutableCopy];
    latest[@"responseFor"] = self.actionRequest;
    [self receive:latest];
  }
  [self clearAction];
  [self cancel];
  router->ModifiersChanged(Mods(CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState)),
                           Now());
}
- (void)receive:(NSDictionary*)m {
  if (![m[@"v"] isEqual:@1] || ![m[@"epoch"] isKindOfClass:NSString.class]) return;
  NSString* type = m[@"type"];
  if ([type isEqual:@"snapshot"]) {
    if (!PlicoSnapshotValid(m)) return;
    PlicoBindings nextBindings;
    int delay = 150;
    if (!PlicoPreferences(m[@"settings"], nextBindings, delay)) return;
    if (self.epoch &&
        (![self.epoch isEqual:m[@"epoch"]] || [m[@"revision"] integerValue] < self.revision))
      return;
    Layout layout;
    layout.loose = Vector(m[@"loose"]);
    for (int s = 0; s < 10; s++) {
      layout.stacks[s] = Vector(m[@"stacks"][s]);
      if ([m[@"last"][s] isKindOfClass:NSNumber.class])
        layout.last_active[s] = [m[@"last"][s] longLongValue];
    }
    if (!NavigatorModel::Valid(layout)) return;
    bindings = nextBindings;
    router->SetRevealDelay(delay);
    NSString* theme = m[@"settings"][@"theme"] ?: @"system";
    self.theme = theme;
    NSAppearance* appearance =
        [theme isEqual:@"system"]
            ? nil
            : [NSAppearance appearanceNamed:[theme isEqual:@"dark"] ? NSAppearanceNameDarkAqua
                                                                    : NSAppearanceNameAqua];
    self.panel.appearance = appearance;
    self.composer.appearance = appearance;
    BOOL changed =
        ![self.epoch isEqual:m[@"epoch"]] || self.revision != [m[@"revision"] integerValue];
    BOOL actionSync = self.actionRequest && [m[@"responseFor"] isEqual:self.actionRequest];
    BOOL deferAction = self.actionRequest && !actionSync &&
                       [self.snapshot[@"window"][@"id"] isEqual:m[@"window"][@"id"]];
    BOOL synchronized = self.pendingRequest && [m[@"responseFor"] isEqual:self.pendingRequest];
    if (synchronized) {
      self.pending = NO;
      self.pendingRequest = nil;
      [self.commitTimer invalidate];
      self.resetOnSnapshot = YES;
    }
    NSMutableDictionary* tabs = [NSMutableDictionary dictionary];
    for (NSDictionary* t in m[@"tabs"])
      if ([t[@"id"] isKindOfClass:NSNumber.class] && [t[@"title"] isKindOfClass:NSString.class])
        tabs[t[@"id"]] = t;
    self.tabs = tabs;
    self.snapshot = m;
    self.epoch = m[@"epoch"];
    self.revision = [m[@"revision"] integerValue];
    [self reportInputStatus];
    if (actionSync) {
      BOOL preserve = !self.actionFailed;
      if ([self.actionKind isEqual:@"close"])
        preserve =
            preserve && model.ConfirmClose([self.actionTab longLongValue], layout,
                                           [m[@"active"] longLongValue], Vector(m[@"recent"]));
      else
        preserve = preserve && !changed;
      unsigned held = self.actionModifiers;
      self.actionRequest = nil;
      self.actionKind = nil;
      self.actionTab = nil;
      [self.actionTimer invalidate];
      if (!preserve) {
        [self cancel];
        model.Reset(layout, [m[@"active"] longLongValue], Vector(m[@"recent"]));
        router->ModifiersChanged(held, Now());
      } else if ([self paired])
        [self apply:router->ModifiersChanged(held, Now())];
      else {
        [self cancel];
        router->ModifiersChanged(held, Now());
      }
    } else if (!deferAction &&
               (changed || synchronized || (!self.pending && self.resetOnSnapshot))) {
      if (!self.pending) self.resetOnSnapshot = NO;
      [self cancel];
      model.Reset(layout, [m[@"active"] longLongValue], Vector(m[@"recent"]));
    }
    [self render];
  } else if ([type isEqual:@"icon"] && [m[@"epoch"] isEqual:self.epoch] &&
             PlicoString(m[@"url"], 65536) && PlicoString(m[@"data"], 45000)) {
    NSData* data = [[NSData alloc] initWithBase64EncodedString:m[@"data"] options:0];
    const unsigned char* b = (const unsigned char*)data.bytes;
    if (data.length >= 24 && memcmp(b, "\x89PNG\r\n\x1a\n", 8) == 0) {
      uint32_t width = 0, height = 0;
      memcpy(&width, b + 16, 4);
      memcpy(&height, b + 20, 4);
      width = ntohl(width);
      height = ntohl(height);
      if (width && height && width <= 64 && height <= 64) {
        NSImage* image = [[NSImage alloc] initWithData:data];
        if (image) {
          [self.icons setObject:image forKey:m[@"url"]];
          [self.navigator setNeedsDisplay:YES];
          if (self.composer.visible)
            for (NSUInteger row = 0; row < self.rows.count; row++)
              if ([self.rows[row][@"url"] isEqual:m[@"url"]]) {
                PlicoResultCell* cell = (PlicoResultCell*)[self.results viewAtColumn:0
                                                                                 row:row
                                                                     makeIfNecessary:NO];
                cell.icon = image;
                cell.needsDisplay = YES;
              }
        }
      }
    }
  } else if ([type isEqual:@"attachments"] && [m[@"epoch"] isEqual:self.epoch] &&
             [m[@"request"] isEqual:self.attachmentRequest] &&
             [m[@"window"] isEqual:self.snapshot[@"window"][@"id"]]) {
    if (!PlicoAttachmentsValid(m)) return;
    NSMutableSet* live = [NSMutableSet set];
    for (NSNumber* tab in m[@"attached"])
      if (self.tabs[tab]) [live addObject:tab];
    self.debuggerTabs = live;
    self.debuggerAvailable = [m[@"available"] boolValue];
    [self.navigator setNeedsDisplay:YES];
  } else if ([type isEqual:@"results"] && [m[@"epoch"] isEqual:self.epoch] &&
             [self.requests containsObject:m[@"request"]]) {
    if (self.composer.visible && [m[@"query"] isEqual:self.field.stringValue] &&
        PlicoResultsValid(m[@"rows"])) {
      [self setSearchRows:m[@"rows"]];
    }
  } else if ([type isEqual:@"ack"] || [type isEqual:@"error"]) {
    if (![m[@"epoch"] isEqual:self.epoch] || ![self.requests containsObject:m[@"request"]]) return;
    [self.requests removeObject:m[@"request"]];
    if ([self.pendingRequest isEqual:m[@"request"]]) {
      self.resetOnSnapshot = YES;
    }
    if ([type isEqual:@"error"] && [m[@"request"] isEqual:self.actionRequest])
      self.actionFailed = YES;
    if ([type isEqual:@"error"] && PlicoString(m[@"message"], 8192)) {
      fprintf(stderr, "plico: request rejected: %s\n", [m[@"message"] UTF8String]);
      self.statusItem.button.toolTip = m[@"message"];
    }
  } else if ([type isEqual:@"inactive"] && [m[@"epoch"] isEqual:self.epoch]) {
    [self clearAction];
    [self cancel];
    [self.commitTimer invalidate];
    self.pending = NO;
    self.pendingRequest = nil;
    self.resetOnSnapshot = NO;
    self.snapshot = nil;
    self.tabs = @{};
    [self.requests removeAllObjects];
    model.Reset(Layout{}, std::nullopt);
  }
}
- (BOOL)paired {
  if (!heliumPID || !self.snapshot || ![self.snapshot[@"window"][@"focused"] boolValue])
    return PairingFailure("no focused snapshot");
  if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != heliumPID)
    return PairingFailure("different foreground app");
  AXUIElementRef app = AXUIElementCreateApplication(heliumPID);
  AXUIElementSetMessagingTimeout(app, 0.025);
  CFTypeRef win = nullptr;
  AXError error = AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute, &win);
  CFRelease(app);
  if (error != kAXErrorSuccess || !win) return PairingFailure("AX focused window", error);
  AXUIElementSetMessagingTimeout((AXUIElementRef)win, 0.025);
  CFTypeRef pos = nullptr, size = nullptr;
  AXUIElementCopyAttributeValue((AXUIElementRef)win, kAXPositionAttribute, &pos);
  AXUIElementCopyAttributeValue((AXUIElementRef)win, kAXSizeAttribute, &size);
  CFRelease(win);
  CGPoint p = {};
  CGSize s = {};
  BOOL okay = pos && size && CFGetTypeID(pos) == AXValueGetTypeID() &&
              CFGetTypeID(size) == AXValueGetTypeID() &&
              AXValueGetValue((AXValueRef)pos, (AXValueType)kAXValueCGPointType, &p) &&
              AXValueGetValue((AXValueRef)size, (AXValueType)kAXValueCGSizeType, &s);
  if (pos) CFRelease(pos);
  if (size) CFRelease(size);
  if (!okay) return PairingFailure("AX window bounds");
  NSDictionary* w = self.snapshot[@"window"];
  if (fabs(p.x - [w[@"left"] doubleValue]) > 24 || fabs(p.y - [w[@"top"] doubleValue]) > 24 ||
      fabs(s.width - [w[@"width"] doubleValue]) > 24 ||
      fabs(s.height - [w[@"height"] doubleValue]) > 24)
    return PairingFailure("window bounds disagree");
  CGFloat screenHeight = CGDisplayBounds(CGMainDisplayID()).size.height;
  self.browserFrame = NSMakeRect(p.x, screenHeight - p.y - s.height, s.width, s.height);
  return YES;
}
- (BOOL)browserEditorFocused {
  AXUIElementRef app = AXUIElementCreateApplication(heliumPID);
  AXUIElementSetMessagingTimeout(app, 0.025);
  CFTypeRef element = nullptr;
  AXError error = AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute, &element);
  CFRelease(app);
  if (error != kAXErrorSuccess || !element) return YES;  // Unknown focus must preserve editing.
  AXUIElementSetMessagingTimeout((AXUIElementRef)element, 0.025);
  CFTypeRef role = nullptr;
  error = AXUIElementCopyAttributeValue((AXUIElementRef)element, kAXRoleAttribute, &role);
  CFRelease(element);
  BOOL editor = error != kAXErrorSuccess || !role || CFEqual(role, kAXTextFieldRole) ||
                CFEqual(role, kAXTextAreaRole) || CFEqual(role, kAXComboBoxRole);
  if (role) CFRelease(role);
  return editor;
}
- (void)cancel {
  self.navigator.revealedTab = nil;
  router->Cancel();
  [self.revealTimer invalidate];
  self.revealTimer = nil;
  [self.searchTimer invalidate];
  self.searchTimer = nil;
  router->SetEditorOwnsInput(false);
  [self.panel orderOut:nil];
  [self.composer orderOut:nil];
}
- (void)render {
  if (model.mode() == Mode::kHidden) {
    self.navigator.revealedTab = nil;
    [self.panel orderOut:nil];
    return;
  }
  if (![self paired]) {
    [self cancel];
    return;
  }
  if (!self.panel.visible) {
    self.debuggerTabs = nil;
    self.debuggerAvailable = NO;
    [self send:@{@"type" : @"attachments"}];
  }
  CGFloat width = MAX(240, MIN(self.browserFrame.size.width - 48, 1400)),
          height = MAX(100, MIN(self.browserFrame.size.height - 48, 1100));
  [self.panel setFrame:NSMakeRect(NSMidX(self.browserFrame) - width / 2,
                                  NSMidY(self.browserFrame) - height / 2, width, height)
               display:NO];
  [self.navigator setNeedsDisplay:YES];
  [self.panel orderFrontRegardless];
  [self.panel displayIfNeeded];
  [CATransaction flush];
}
- (void)apply:(GestureResult)r {
  if (r.commit) {
    NSMutableArray* stacks = [NSMutableArray array];
    for (auto& s : r.commit->layout.stacks) [stacks addObject:IDs(s)];
    self.pending = YES;
    [self send:@{
      @"type" : @"commit",
      @"loose" : IDs(r.commit->layout.loose),
      @"stacks" : stacks,
      @"activate" : @(r.commit->activate)
    }];
  }
  if ((r.host_action == HostAction::kClose || r.host_action == HostAction::kMute) &&
      model.candidate() && !self.actionRequest) {
    NSNumber* tab = @(*model.candidate());
    NSMutableDictionary* message =
        [@{@"type" : r.host_action == HostAction::kClose ? @"close" : @"mute", @"tab" : tab}
            mutableCopy];
    if (r.host_action == HostAction::kMute)
      message[@"muted"] = @(![self.tabs[tab][@"muted"] boolValue]);
    self.actionModifiers = Mods(CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState));
    [self send:message];
  }
  if (r.host_action == HostAction::kBack)
    [self send:@{@"type" : @"back", @"tab" : @(model.active().value_or(-1))}];
  if (r.host_action == HostAction::kCopyURL) {
    NSString* url = self.tabs[@(model.active().value_or(-1))][@"url"];
    if (url) {
      [NSPasteboard.generalPasteboard clearContents];
      [NSPasteboard.generalPasteboard setString:url forType:NSPasteboardTypeString];
    }
  }
  if (r.host_action == HostAction::kNewDestination || r.host_action == HostAction::kEditURL)
    [self showComposer:r.host_action == HostAction::kEditURL];
  [self render];
  [self.revealTimer invalidate];
  self.revealTimer = nil;
  if (router->reveal_deadline()) {
    NSTimeInterval delay = MAX(0.001, (*router->reveal_deadline() - Now() + 1) / 1000.0);
    __weak Companion* w = self;
    self.revealTimer = [NSTimer
        timerWithTimeInterval:delay
                      repeats:NO
                        block:^(NSTimer* t) {
                          Companion* c = w;
                          if (!c) return;
                          if (TraceEnabled())
                            fprintf(stderr, "plico: reveal timer fired deadline=%lld now=%lld\n",
                                    (long long)c->router->reveal_deadline().value_or(-1),
                                    (long long)Now());
                          if ([c paired]) {
                            c->router->RevealIfDue(Now());
                            [c apply:GestureResult{}];
                          }
                        }];
    [[NSRunLoop mainRunLoop] addTimer:self.revealTimer forMode:NSRunLoopCommonModes];
  }
}
- (CGEventRef)event:(CGEventRef)e type:(CGEventType)type {
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    [self cancel];
    if (tap) CGEventTapEnable(tap, true);
    return e;
  }
  if (!e) return e;
  int key = (int)CGEventGetIntegerValueField(e, kCGKeyboardEventKeycode);
  if (type == kCGEventKeyUp && swallowed.erase(key)) return nullptr;
  if (self.composer.visible) {
    if (type == kCGEventFlagsChanged) router->ModifiersChanged(Mods(CGEventGetFlags(e)), Now());
    if (type == kCGEventLeftMouseDown || type == kCGEventRightMouseDown) {
      CGPoint p = CGEventGetLocation(e);
      p.y = CGDisplayBounds(CGMainDisplayID()).size.height - p.y;
      if (!NSPointInRect(p, self.composer.frame)) {
        [self cancel];
        return nullptr;
      }
    }
    return e;
  }
  if (type == kCGEventKeyUp) return e;
  // A browser confirmation temporarily owns a different AX window. Let Escape
  // cancel that dialog while abandoning our draft even when geometry is unpaired.
  if (self.actionRequest && type == kCGEventKeyDown && key == 53 &&
      NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier == heliumPID) {
    BOOL close = [self.actionKind isEqual:@"close"];
    [self abandonAction];
    if (close) return e;
    swallowed.insert(key);
    return nullptr;
  }
  if (model.mode() == Mode::kHidden && !router->reveal_deadline()) {
    unsigned ordinary = Mods(CGEventGetFlags(e));
    if (type == kCGEventLeftMouseDown || type == kCGEventRightMouseDown) return e;
    if (type == kCGEventKeyDown && !(ordinary & kCommand) &&
        !(key == 48 && (ordinary & kControl)) &&
        MapKey(key, 0, ordinary, model.mode(), bindings).action != Action::kStack)
      return e;
  }
  if (self.actionRequest && type == kCGEventFlagsChanged)
    self.actionModifiers = Mods(CGEventGetFlags(e));
  BOOL pairedNow = [self paired];
  if (TraceEnabled() && type == kCGEventKeyDown) {
    static int samples = 0;
    if (samples++ < 80)
      fprintf(stderr, "plico: gesture pairing=%d front=%d browser=%d mode=%d\n", pairedNow,
              NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier, heliumPID,
              (int)model.mode());
  }
  if (!pairedNow) {
    if (model.mode() != Mode::kHidden) [self cancel];
    return e;
  }
  if (self.actionRequest) {
    if (type == kCGEventFlagsChanged) {
      self.actionModifiers = Mods(CGEventGetFlags(e));
      return e;
    }
    if (type == kCGEventKeyDown) {
      NSEvent* ne = [NSEvent eventWithCGEvent:e];
      NSString* ch = ne.charactersIgnoringModifiers.lowercaseString;
      char letter =
          ch.length == 1 && [ch characterAtIndex:0] < 128 ? (char)[ch characterAtIndex:0] : 0;
      auto mapping = MapKey(key, letter, Mods(CGEventGetFlags(e)), model.mode(), bindings);
      if (mapping.action == Action::kEscape) {
        BOOL confirmation = [self.actionKind isEqual:@"close"];
        [self cancel];
        if (confirmation) {
          [self abandonAction];
          return e;
        }
        swallowed.insert(key);
        return nullptr;
      }
      if (mapping.action != Action::kOther) {
        swallowed.insert(key);
        return nullptr;
      }
      [self cancel];
    }
    return e;
  }
  if (self.pending || self.resetOnSnapshot) return e;
  if (type == kCGEventLeftMouseDown || type == kCGEventRightMouseDown) {
    if (model.mode() != Mode::kHidden) {
      CGPoint p = CGEventGetLocation(e);
      p.y = CGDisplayBounds(CGMainDisplayID()).size.height - p.y;
      NSPoint local = [self.navigator convertPoint:[self.panel convertPointFromScreen:p]
                                          fromView:nil];
      BOOL hit = NO;
      for (NSDictionary* item in self.navigator.hits)
        if (NSPointInRect(local, [item[@"rect"] rectValue])) {
          hit = YES;
          break;
        }
      if (!NSPointInRect(p, self.panel.frame) || !hit) {
        [self cancel];
        return nullptr;
      }
    }
    return e;
  }
  unsigned mods = Mods(CGEventGetFlags(e));
  if (type == kCGEventFlagsChanged) {
    auto r = router->ModifiersChanged(mods, Now());
    [self apply:r];
    return e;
  }
  if (type != kCGEventKeyDown) return e;
  NSEvent* ne = [NSEvent eventWithCGEvent:e];
  NSString* ch = ne.charactersIgnoringModifiers.lowercaseString;
  char letter = ch.length == 1 && [ch characterAtIndex:0] < 128 ? (char)[ch characterAtIndex:0] : 0;
  auto mapping = MapKey(key, letter, mods, model.mode(), bindings);
  // Dedicated navigation wins over page focus, including unknown/loading focus.
  // Back remains a text-editing command in an editor, even after bare-hold reveal.
  if (mapping.action == Action::kBack && [self browserEditorFocused])
    mapping.action = Action::kOther;
  if (TraceEnabled() && mapping.action != Action::kOther)
    fprintf(stderr, "plico: navigation action=%d\n", (int)mapping.action);
  auto r =
      router->KeyDown(mapping.action, mods,
                      CGEventGetIntegerValueField(e, kCGKeyboardEventAutorepeat), mapping.stack);
  [self apply:r];
  if (r.consumed) {
    swallowed.insert(key);
    return nullptr;
  }
  return e;
}
@end

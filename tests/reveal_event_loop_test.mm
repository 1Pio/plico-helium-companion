// Exercise the real AppKit event loop, with no keyboard/mouse events to wake it.
// A timer callback can draw without completing AppKit's window-update cycle.
#import "native/companion.h"
#include <cassert>

@interface RevealCompanion : Companion
@property BOOL eligible;
@end
@implementation RevealCompanion
- (BOOL)paired { return self.eligible; }
- (void)render {} // Avoid unrelated window events masking the event-loop regression.
@end

@interface RevealProbe : NSObject <NSApplicationDelegate>
@property (nonatomic, strong) RevealCompanion* companion;
@property BOOL updatedDuringHold;
@property (nonatomic, copy) NSString* scenario;
@end
@implementation RevealProbe
- (void)applicationDidFinishLaunching:(NSNotification*)note {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
  self.companion = [RevealCompanion new];
  self.companion.eligible = YES;
  Layout layout;
  layout.loose = {1, 2};
  self.companion->model.Reset(layout, 1);
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(updated:)
      name:NSApplicationDidUpdateNotification object:NSApp];
  // Let startup events drain first. Every subsequent stimulus is a timer,
  // not an NSEvent; even a synthetic key can hide this bug in UI tests.
  [NSTimer scheduledTimerWithTimeInterval:0.25 repeats:NO block:^(NSTimer* timer) {
    Companion* c = self.companion;
    auto now = (int64_t)(NSProcessInfo.processInfo.systemUptime * 1000);
    [c apply:c->router->ModifiersChanged(kCommand, now)];
    assert(c.revealTimer);
    if (![self.scenario isEqual:@"hold"]) {
      [NSTimer scheduledTimerWithTimeInterval:0.05 repeats:NO block:^(NSTimer* t) {
        if ([self.scenario isEqual:@"cancel"]) [c cancel];
        else self.companion.eligible = NO;
      }];
    }
    [NSTimer scheduledTimerWithTimeInterval:0.4 repeats:NO block:^(NSTimer* t) {
      if ([self.scenario isEqual:@"hold"]) {
        assert(c->model.mode() == Mode::kCommandHold);
        assert(self.updatedDuringHold && "Reveal must wake AppKit without another input event");
        assert(!c.revealTimer);
      } else {
        assert(c->model.mode() == Mode::kHidden);
        assert(!self.updatedDuringHold);
      }
      [c cancel];
      puts("Bare-hold AppKit event-cycle check passed");
      exit(0);
    }];
  }];
}
- (void)updated:(NSNotification*)note {
  if (self.companion->model.mode() == Mode::kCommandHold) self.updatedDuringHold = YES;
}
@end
int main(int argc, const char* argv[]) {
  @autoreleasepool {
    assert(argc == 2);
    NSApplication* app = NSApplication.sharedApplication;
    RevealProbe* probe = [RevealProbe new];
    probe.scenario = @(argv[1]);
    assert(([@[@"hold", @"cancel", @"unpaired"] containsObject:probe.scenario]));
    app.delegate = probe;
    [app run];
  }
}

// Local qualification helper. Called only with the marked test browser PID.
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <Cocoa/Cocoa.h>
#include <libproc.h>
#include <mach-o/dyld.h>
#include <signal.h>
#include <unistd.h>
#include <set>
#include <vector>
static pid_t browserPID = 0;
static bool alive = true;
// Resolve the sibling app from this helper's executable, never from a user's home.
static bool ownedCompanion(pid_t pid) {
  uint32_t size = 0;
  _NSGetExecutablePath(nullptr, &size);
  std::vector<char> path(size);
  if (_NSGetExecutablePath(path.data(), &size)) return false;
  NSString* executable = [@(path.data()) stringByResolvingSymlinksInPath];
  NSString* expected =
      [[[executable stringByDeletingLastPathComponent] stringByDeletingLastPathComponent]
          stringByAppendingPathComponent:@"Plico Helium Companion.app"];
  NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
  struct proc_bsdinfo info = {};
  return proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) == sizeof(info) &&
         info.pbi_ppid == browserPID &&
         [app.bundleIdentifier isEqual:@"cc.helwig.plico.companion"] &&
         [app.bundleURL.path isEqual:expected];
}

static void stopped(int) { alive = false; }
static void emit(CGKeyCode key, bool down, CGEventFlags flags) {
  CGEventRef e = CGEventCreateKeyboardEvent(nullptr, key, down);
  CGEventSetFlags(e, flags);
  if (key == 55 || key == 54 || key == 56 || key == 60 || key == 59 || key == 62)
    CGEventSetType(e, kCGEventFlagsChanged);
  if (getenv("PLICO_TRACE_INPUT"))
    fprintf(stderr, "{\"event\":\"key\",\"uptime\":%.9f,\"key\":%d,\"down\":%s,\"flags\":%llu}\n",
            NSProcessInfo.processInfo.systemUptime, key, down ? "true" : "false",
            (unsigned long long)flags);
  CGEventPost(kCGHIDEventTap, e);
  CFRelease(e);
}
static bool paired() {
  pid_t front = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
  bool ok = alive && front == browserPID;
  if (!ok)
    fprintf(stderr, "Isolated input stopped: expected foreground PID %d, observed %d, alive=%d\n",
            browserPID, front, alive);
  return ok;
}
int main(int argc, char** argv) {
  @autoreleasepool {
    if (argc < 3) return 2;
    browserPID = atoi(argv[1]);
    NSString* command = @(argv[2]);
    NSRunningApplication* browser =
        [NSRunningApplication runningApplicationWithProcessIdentifier:browserPID];
    if (![browser.bundleIdentifier isEqual:@"net.imput.helium"]) return 3;
    if ([command isEqual:@"activate"]) {
      [browser activateWithOptions:0];
      for (int i = 0; i < 40; i++) {
        [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier == browserPID)
          return 0;
      }
      return 6;
    }
    if ([command isEqual:@"secure-input"]) {
      puts(IsSecureEventInputEnabled() ? "true" : "false");
      return 0;
    }
    if ([command isEqual:@"windows"]) {
      NSArray* windows = CFBridgingRelease(
          CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
      NSMutableArray* owned = [NSMutableArray array];
      for (NSDictionary* w in windows) {
        pid_t pid = [w[(id)kCGWindowOwnerPID] intValue];
        if (pid == browserPID || ownedCompanion(pid)) [owned addObject:w];
      }
      NSData* json = [NSJSONSerialization dataWithJSONObject:owned
                                                     options:NSJSONWritingPrettyPrinted
                                                       error:nil];
      fwrite(json.bytes, 1, json.length, stdout);
      return 0;
    }
    // User-approved public clipboard fixture. Intentionally leaves the copied URL.
    if ([command isEqual:@"copy-url"] && argc == 3) {
      if (!paired() || !AXIsProcessTrusted()) return 4;
      [NSPasteboard.generalPasteboard clearContents];
      [NSPasteboard.generalPasteboard setString:@"Plico copy test pending"
                                        forType:NSPasteboardTypeString];
      emit(55, true, kCGEventFlagMaskCommand);
      emit(56, true, kCGEventFlagMaskCommand | kCGEventFlagMaskShift);
      emit(8, true, kCGEventFlagMaskCommand | kCGEventFlagMaskShift);
      emit(8, false, kCGEventFlagMaskCommand | kCGEventFlagMaskShift);
      emit(56, false, kCGEventFlagMaskCommand);
      emit(55, false, 0);
      for (int i = 0; i < 40; i++) {
        usleep(50000);
        if ([[NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString]
                isEqual:@"https://example.org/#plico-copy-fixture"])
          return 0;
      }
      return 7;
    }
    if ([command isEqual:@"text"] && argc == 4) {
      NSString* text = @(argv[3]);
      NSSet* fixtures = [NSSet setWithArray:@[
        @"https://example.com/#plico-submit", @"example", @"abc", @"plico bookmark qualification",
        @"plico-history-qualification", @"plico-composer-target", @"grid", @"css"
      ]];
      NSURL* fixtureURL = [NSURL URLWithString:text];
      BOOL localComposer = [fixtureURL.scheme isEqual:@"http"] &&
                           [fixtureURL.host isEqual:@"127.0.0.1"] && fixtureURL.port.intValue > 0 &&
                           fixtureURL.port.intValue <= 65535 &&
                           [fixtureURL.path isEqual:@"/plico-submit"] && !fixtureURL.user &&
                           !fixtureURL.password && !fixtureURL.query && !fixtureURL.fragment;
      if ((![fixtures containsObject:text] && !localComposer) || !paired() || !AXIsProcessTrusted())
        return 4;
      std::vector<UniChar> chars(text.length);
      [text getCharacters:chars.data() range:NSMakeRange(0, text.length)];
      for (UniChar ch : chars) {
        if (!paired()) return 6;
        CGEventRef e = CGEventCreateKeyboardEvent(nullptr, 0, true);
        CGEventSetFlags(e, 0);
        CGEventKeyboardSetUnicodeString(e, 1, &ch);
        CGEventPost(kCGHIDEventTap, e);
        usleep(15000);
        CGEventSetType(e, kCGEventKeyUp);
        CGEventPost(kCGHIDEventTap, e);
        CFRelease(e);
        usleep(15000);
      }
      return 0;
    }
    // Fixed pointer fixtures only inside the exact browser-owned Plico panel.
    if ([command isEqual:@"pointer"] && argc == 4) {
      NSString* action = @(argv[3]);
      NSSet* actions = [NSSet
          setWithArray:@[ @"loose-peer", @"blank", @"stack-down", @"bar-right", @"bar-left" ]];
      if (![actions containsObject:action] || !paired() || !AXIsProcessTrusted()) return 4;
      NSArray* windows = CFBridgingRelease(
          CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
      NSDictionary* panel = nil;
      for (NSDictionary* w in windows) {
        if (![w[(id)kCGWindowName] isEqual:@"Plico Navigator"]) continue;
        pid_t pid = [w[(id)kCGWindowOwnerPID] intValue];
        if (!ownedCompanion(pid)) continue;
        if (panel) return 5;
        panel = w;
      }
      CGRect frame = {};
      if (!panel ||
          !CGRectMakeWithDictionaryRepresentation(
              (__bridge CFDictionaryRef)panel[(id)kCGWindowBounds], &frame) ||
          frame.size.width < 400 || frame.size.height < 100)
        return 5;
      CGPoint point = CGPointMake(CGRectGetMidX(frame), CGRectGetMidY(frame));
      if ([action isEqual:@"loose-peer"]) point.x += 131;
      if ([action isEqual:@"blank"])
        point = CGPointMake(CGRectGetMinX(frame) + 5, CGRectGetMinY(frame) + 5);
      if (!CGRectContainsPoint(frame, point)) return 5;
      CGEventRef sample = CGEventCreate(nullptr);
      CGPoint prior = CGEventGetLocation(sample);
      CFRelease(sample);
      signal(SIGINT, stopped);
      signal(SIGTERM, stopped);
      auto mouse = [&](CGEventType type, CGPoint at) {
        CGEventRef e = CGEventCreateMouseEvent(nullptr, type, at, kCGMouseButtonLeft);
        CGEventSetFlags(e, 0);
        CGEventPost(kCGHIDEventTap, e);
        CFRelease(e);
      };
      mouse(kCGEventMouseMoved, point);
      usleep(50000);
      int error = 0;
      sample = CGEventCreate(nullptr);
      CGPoint atInjection = CGEventGetLocation(sample);
      CFRelease(sample);
      BOOL samePanel = NO;
      NSArray* current = CFBridgingRelease(
          CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
      for (NSDictionary* w in current)
        if ([w[(id)kCGWindowNumber] isEqual:panel[(id)kCGWindowNumber]] &&
            [w[(id)kCGWindowOwnerPID] isEqual:panel[(id)kCGWindowOwnerPID]] &&
            [w[(id)kCGWindowName] isEqual:@"Plico Navigator"]) {
          CGRect nowFrame = {};
          samePanel = CGRectMakeWithDictionaryRepresentation(
                          (__bridge CFDictionaryRef)w[(id)kCGWindowBounds], &nowFrame) &&
                      CGRectEqualToRect(frame, nowFrame);
        }
      if (!paired() || !samePanel || fabs(atInjection.x - point.x) >= 2 ||
          fabs(atInjection.y - point.y) >= 2)
        error = 6;
      else if ([action isEqual:@"loose-peer"] || [action isEqual:@"blank"]) {
        mouse(kCGEventLeftMouseDown, point);
        usleep(12000);
        mouse(kCGEventLeftMouseUp, point);
      } else {
        int vertical = [action isEqual:@"stack-down"] ? -120 : 0,
            horizontal = [action isEqual:@"bar-right"]  ? 600
                         : [action isEqual:@"bar-left"] ? -600
                                                        : 0;
        CGEventRef e = CGEventCreateScrollWheelEvent(nullptr, kCGScrollEventUnitPixel, 2, vertical,
                                                     horizontal);
        CGEventSetLocation(e, point);
        CGEventSetFlags(e, 0);
        CGEventPost(kCGHIDEventTap, e);
        CFRelease(e);
      }
      usleep(80000);
      sample = CGEventCreate(nullptr);
      CGPoint now = CGEventGetLocation(sample);
      CFRelease(sample);
      // A real user move wins; never drag their pointer back after they take over.
      if (fabs(now.x - point.x) < 2 && fabs(now.y - point.y) < 2) mouse(kCGEventMouseMoved, prior);
      return error;
    }
    if (![command isEqual:@"gesture"] || argc != 5 || !AXIsProcessTrusted()) return 4;
    // A compact list of keycodes. Restrict to navigation, modifiers and Escape.
    std::set<int> allowed = {0,  13, 46, 4,  37, 38, 40, 11, 17, 31, 41, 43,  8,   18,  19, 20,
                             21, 23, 22, 26, 28, 25, 29, 36, 48, 51, 53, 123, 124, 125, 126};
    NSString* sequence = @(argv[3]);
    int hold = atoi(argv[4]);
    if (hold < 0 || hold > 2000) return 5;
    // Validate the entire bounded sequence before emitting any event.
    NSArray* parts = [sequence componentsSeparatedByString:@","];
    if (parts.count > 32) return 5;
    const int pressMilliseconds = getenv("PLICO_DEMO_INPUT") ? 90 : 12;
    int duration = 0;
    NSSet* names = [NSSet setWithArray:@[
      @"cmd+", @"cmd-", @"cmd-right+", @"cmd-right-", @"alt+", @"alt-", @"ctrl+", @"ctrl-",
      @"ctrl-right+", @"ctrl-right-", @"shift+", @"shift-", @"shift-right+", @"shift-right-",
      @"wait"
    ]];
    for (NSString* token in parts) {
      if ([names containsObject:token])
        duration += [token isEqual:@"wait"] ? hold + 20 : 20;
      else {
        NSScanner* scanner = [NSScanner scannerWithString:token];
        int value = 0;
        if (![scanner scanInt:&value] || !scanner.isAtEnd || !allowed.contains(value)) return 5;
        duration += pressMilliseconds + 20;
      }
    }
    if (duration > 8000) return 5;
    signal(SIGINT, stopped);
    signal(SIGTERM, stopped);
    CGEventFlags flags = 0;
    std::set<int> pressed;
    int error = 0;
    auto refresh = [&] {
      flags = 0;
      if (pressed.contains(55) || pressed.contains(54)) flags |= kCGEventFlagMaskCommand;
      if (pressed.contains(59) || pressed.contains(62)) flags |= kCGEventFlagMaskControl;
      if (pressed.contains(56) || pressed.contains(60)) flags |= kCGEventFlagMaskShift;
      if (pressed.contains(58)) flags |= kCGEventFlagMaskAlternate;
    };
    NSDictionary* modifiers = @{
      @"cmd+" : @55,
      @"cmd-" : @55,
      @"cmd-right+" : @54,
      @"cmd-right-" : @54,
      @"alt+" : @58,
      @"alt-" : @58,
      @"ctrl+" : @59,
      @"ctrl-" : @59,
      @"ctrl-right+" : @62,
      @"ctrl-right-" : @62,
      @"shift+" : @56,
      @"shift-" : @56,
      @"shift-right+" : @60,
      @"shift-right-" : @60
    };
    for (NSString* token in [sequence componentsSeparatedByString:@","]) {
      if (!paired()) {
        error = 6;
        break;
      }
      NSNumber* modifier = modifiers[token];
      if (modifier) {
        bool down = [token hasSuffix:@"+"];
        if (down)
          pressed.insert(modifier.intValue);
        else
          pressed.erase(modifier.intValue);
        refresh();
        emit(modifier.intValue, down, flags);
      } else if ([token isEqual:@"wait"]) {
        for (int elapsed = 0; elapsed < hold; elapsed += 20) {
          usleep(MIN(20, hold - elapsed) * 1000);
          if (!paired()) {
            error = 6;
            break;
          }
        }
        if (error) break;
      } else {
        int key = token.intValue;
        if (!allowed.contains(key)) {
          error = 5;
          break;
        }
        emit(key, true, flags);
        usleep(pressMilliseconds * 1000);
        emit(key, false, flags);
      }
      usleep(20000);
    }
    // Always release test-owned modifiers even when focus changed mid-gesture.
    while (!pressed.empty()) {
      int key = *pressed.begin();
      pressed.erase(key);
      refresh();
      emit(key, false, flags);
    }
    return error;
  }
}

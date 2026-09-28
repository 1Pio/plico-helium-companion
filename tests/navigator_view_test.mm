#include <cassert>
#import "native/companion.h"
// Verify rendering work is bounded by the viewport without removing offscreen
// tabs from keyboard navigation or the existing accessibility action list.
@interface CountingIcon : NSImage
@property NSUInteger draws;
@end
@implementation CountingIcon
- (void)drawInRect:(NSRect)r
          fromRect:(NSRect)source
         operation:(NSCompositingOperation)op
          fraction:(CGFloat)alpha
    respectFlipped:(BOOL)flipped
             hints:(NSDictionary*)hints {
  self.draws++;
}
@end
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    Companion* c = [Companion new];
    c.navigator = [[NavigatorView alloc] initWithFrame:NSMakeRect(0, 0, 1100, 800)];
    c.navigator.owner = c;
    c.barMaterial = [PlicoMaterial new];
    c.stackMaterial = [PlicoMaterial new];
    c.barAmbient = [PlicoAmbientView new];
    Layout layout;
    NSMutableDictionary* tabs = [NSMutableDictionary dictionary];
    CountingIcon* icon = [[CountingIcon alloc] initWithSize:NSMakeSize(32, 32)];
    for (int i = 1; i <= 1000; i++) {
      layout.loose.push_back(i);
      tabs[@(i)] = @{@"id" : @(i), @"title" : @"Fixture", @"url" : @"https://example.org/"};
    }
    c.tabs = tabs;
    [c.icons setObject:icon forKey:@"https://example.org/"];
    c->model.Reset(layout, 1, layout.loose);
    c->model.Begin(Mode::kCommandHold);
    NSImage* canvas = [[NSImage alloc] initWithSize:c.navigator.bounds.size];
    for (int candidate : {1, 500, 1000}) {
      c->model.Select(candidate);
      icon.draws = 0;
      [canvas lockFocus];
      [c.navigator drawRect:c.navigator.bounds];
      [canvas unlockFocus];
      assert(icon.draws > 0 && icon.draws < 25);
      assert(c.navigator.accessibilityCustomActions.count == 1000);
      assert(c->model.active() == 1 && c->model.candidate() == candidate);
      BOOL hit = NO;
      for (NSDictionary* item in c.navigator.hits)
        if ([item[@"id"] intValue] == candidate) {
          hit = YES;
          assert(!NSIsEmptyRect([item[@"rect"] rectValue]));
        }
      assert(hit);
    }
    puts("navigator viewport drawing and accessibility passed");
  }
}

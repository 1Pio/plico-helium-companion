#include <algorithm>
#import "companion.h"
@implementation NavigatorView
- (void)viewDidChangeEffectiveAppearance {
  [super viewDidChangeEffectiveAppearance];
  self.needsDisplay = YES;
}
- (BOOL)isFlipped {
  return YES;
}
- (BOOL)acceptsFirstResponder {
  return NO;
}
- (BOOL)acceptsFirstMouse:(NSEvent*)event {
  return YES;
}
- (void)drawRect:(NSRect)dirty {
  Companion* c = self.owner;
  self.hits = [NSMutableArray array];
  self.stackScrollRect = NSZeroRect;
  [self removeAllToolTips];
  const CGFloat h = 64, y = self.bounds.size.height / 2 - h / 2;
  c.barMaterial.frame = NSMakeRect(0, y, self.bounds.size.width, h);
  [c.barMaterial refresh];
  c.stackMaterial.hidden = YES;
  const auto& layout = c->model.visible();
  auto selected = c->model.candidate();
  struct Item {
    TabId id;
    int slot;
    CGFloat width;
  };
  std::vector<Item> items;
  for (auto id : layout.loose) items.push_back({id, -1, selected == id ? 280.0 : 52.0});
  for (int slot = 0; slot < 10; slot++)
    if (!layout.stacks[slot].empty())
      items.push_back({0, slot,
                       selected && std::find(layout.stacks[slot].begin(), layout.stacks[slot].end(),
                                             *selected) != layout.stacks[slot].end()
                           ? MIN(440.0, self.bounds.size.width - 36)
                           : 148.0});
  CGFloat total = 0, selectedX = 0, selectedWidth = 0;
  for (auto i : items) {
    BOOL chosen =
        i.slot < 0
            ? selected == i.id
            : (selected && std::find(layout.stacks[i.slot].begin(), layout.stacks[i.slot].end(),
                                     *selected) != layout.stacks[i.slot].end());
    if (chosen) {
      selectedX = total;
      selectedWidth = i.width;
    }
    total += i.width + 8;
  }
  CGFloat barWidth = MIN(self.bounds.size.width, MAX(120, total + 16));
  c.barMaterial.frame = NSMakeRect((self.bounds.size.width - barWidth) / 2, y, barWidth, h);
  CGFloat visible = self.bounds.size.width - 24;
  self.horizontalOffset =
      total <= visible ? 0 : MAX(0, MIN(self.horizontalOffset, total - visible));
  BOOL reveal = ![self.revealedTab isEqual:selected ? @(*selected) : nil] ||
                selectedX != self.revealedX || selectedWidth != self.revealedWidth;
  self.revealedTab = selected ? @(*selected) : nil;
  self.revealedX = selectedX;
  self.revealedWidth = selectedWidth;
  if (total > visible && reveal) {
    CGFloat at = 12 + selectedX - self.horizontalOffset;
    if (at < 12)
      self.horizontalOffset = selectedX;
    else if (at + selectedWidth > self.bounds.size.width - 12)
      self.horizontalOffset = MIN(total - visible, selectedX + selectedWidth - visible);
  }
  CGFloat x =
      total < visible ? (self.bounds.size.width - total + 8) / 2 : 12 - self.horizontalOffset;
  NSColor *ink = PlicoInk(self, NO), *secondary = PlicoInk(self, YES);
  auto highlight = [&](NSRect r) {
    [[NSColor colorWithWhite:PlicoDark(self) ? 1 : 0 alpha:PlicoDark(self) ? 0.13 : 0.085] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:r xRadius:17 yRadius:17] fill];
  };
  auto status = [&](TabId id) {
    NSMutableArray* parts = [NSMutableArray array];
    if ([c.debuggerTabs containsObject:@(id)]) [parts addObject:@"Debugger attached"];
    if ([c.tabs[@(id)][@"muted"] boolValue])
      [parts addObject:@"Muted"];
    else if ([c.tabs[@(id)][@"audible"] boolValue])
      [parts addObject:@"Playing audio"];
    return [parts componentsJoinedByString:@" · "];
  };
  auto tab = [&](TabId id, NSRect r, BOOL expanded, BOOL chosen) {
    NSDictionary* t = c.tabs[@(id)];
    if (chosen) highlight(r);
    if ([c.debuggerTabs containsObject:@(id)]) {
      [[NSColor colorWithRed:0.3 green:0.61 blue:1 alpha:0.95] setStroke];
      NSBezierPath* p = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(r, 1, 1)
                                                        xRadius:16
                                                        yRadius:16];
      p.lineWidth = 1.5;
      [p stroke];
    }
    NSImage* icon = [c.icons objectForKey:t[@"url"] ?: @""] ?: PlicoSymbol(@"globe", secondary);
    CGFloat ix = r.origin.x + 14, iy = r.origin.y + (r.size.height - 24) / 2;
    [icon drawInRect:NSMakeRect(ix, iy, 24, 24)
              fromRect:NSZeroRect
             operation:NSCompositingOperationSourceOver
              fraction:1
        respectFlipped:YES
                 hints:nil];
    BOOL muted = [t[@"muted"] boolValue], audible = [t[@"audible"] boolValue];
    if (muted || audible) {
      NSImage* speaker =
          PlicoSymbol(muted ? @"speaker.slash.fill" : @"speaker.wave.2.fill", secondary);
      [speaker drawInRect:NSMakeRect(ix + 6, r.origin.y + 1, 12, 10)
                 fromRect:NSZeroRect
                operation:NSCompositingOperationSourceOver
                 fraction:0.85
           respectFlipped:YES
                    hints:nil];
    }
    if (c->model.active() == id) {
      [secondary setFill];
      [[NSBezierPath
          bezierPathWithOvalInRect:NSMakeRect(ix + 10, r.origin.y + r.size.height - 6, 4, 4)] fill];
    }
    if (expanded) {
      NSString *detail = PlicoDomain(t[@"url"]), *extra = status(id);
      if (extra.length && chosen) detail = [NSString stringWithFormat:@"%@ · %@", detail, extra];
      PlicoText(t[@"title"], NSMakeRect(r.origin.x + 50, r.origin.y + 9, r.size.width - 62, 20), 13,
                NSFontWeightMedium, ink);
      PlicoText(detail, NSMakeRect(r.origin.x + 50, r.origin.y + 29, r.size.width - 62, 16), 11,
                NSFontWeightRegular, secondary);
    }
    NSString* tip = [NSString stringWithFormat:@"%@%@%@", t[@"title"] ?: @"",
                                               status(id).length ? @" · " : @"", status(id)];
    if (c->model.active() == id) tip = [tip stringByAppendingString:@" · Current page"];
    [self addToolTipRect:r owner:tip userData:nullptr];
    [self.hits addObject:@{@"rect" : [NSValue valueWithRect:r], @"id" : @(id), @"slot" : @(-1)}];
  };
  BOOL separator = NO;
  for (auto i : items) {
    BOOL chosen =
        i.slot < 0
            ? selected == i.id
            : (selected && std::find(layout.stacks[i.slot].begin(), layout.stacks[i.slot].end(),
                                     *selected) != layout.stacks[i.slot].end());
    NSRect rect = NSMakeRect(x, y + 5, i.width, h - 10);
    if (i.slot >= 0 && !separator && !layout.loose.empty()) {
      [[secondary colorWithAlphaComponent:0.25] setStroke];
      NSBezierPath* p = [NSBezierPath bezierPath];
      [p moveToPoint:NSMakePoint(x - 5, y + 18)];
      [p lineToPoint:NSMakePoint(x - 5, y + h - 18)];
      [p stroke];
      separator = YES;
    }
    if (i.slot < 0)
      tab(i.id, rect, chosen, chosen);
    else if (chosen) {
      const auto& tabs = layout.stacks[i.slot];
      NSInteger index = std::find(tabs.begin(), tabs.end(), *selected) - tabs.begin();
      CGFloat left = MAX(12, MIN(x, self.bounds.size.width - i.width - 12)), rowHeight = 54;
      NSInteger before = MIN(index, MAX(0, (NSInteger)((y - 42) / rowHeight))),
                after =
                    MIN((NSInteger)tabs.size() - index - 1,
                        MAX(0, (NSInteger)((self.bounds.size.height - y - h - 10) / rowHeight)));
      CGFloat top = y + 5 - before * rowHeight - 34, bottom = y + 5 + (after + 1) * rowHeight + 8;
      NSRect surface = NSMakeRect(left - 4, top, i.width + 8, bottom - top);
      self.stackScrollRect = surface;
      // Root coordinates are unflipped; this drawing view is flipped.
      c.stackMaterial.frame =
          NSMakeRect(surface.origin.x, self.bounds.size.height - NSMaxY(surface),
                     surface.size.width, surface.size.height);
      c.stackMaterial.hidden = NO;
      [c.stackMaterial refresh];
      PlicoText([NSString stringWithFormat:@"Stack %d", i.slot + 1],
                NSMakeRect(left + 14, top + 11, i.width - 110, 18), 11, NSFontWeightMedium,
                secondary);
      PlicoRightText([NSString stringWithFormat:@"%ld / %lu", (long)index + 1, tabs.size()],
                     NSMakeRect(left + i.width - 96, top + 11, 82, 18), 11, secondary);
      for (NSInteger row = index - before; row <= index + after; row++)
        tab(tabs[row], NSMakeRect(left, y + 5 + (row - index) * rowHeight, i.width, rowHeight), YES,
            row == index);
    } else {
      highlight(rect);
      PlicoText([NSString stringWithFormat:@"%d", i.slot + 1], NSMakeRect(x + 14, y + 24, 30, 22),
                15, NSFontWeightMedium, secondary);
      std::vector<TabId> previews;
      for (auto id : c->model.recent())
        if (std::find(layout.stacks[i.slot].begin(), layout.stacks[i.slot].end(), id) !=
            layout.stacks[i.slot].end()) {
          previews.push_back(id);
          if (previews.size() == 2) break;
        }
      for (size_t n = 0; n < previews.size(); n++) {
        tab(previews[n], NSMakeRect(x + 45 + n * 45, y + 5, 44, h - 10), NO, NO);
        [self.hits removeLastObject];
      }
      [self.hits
          addObject:@{@"rect" : [NSValue valueWithRect:rect], @"id" : @0, @"slot" : @(i.slot)}];
    }
    x += i.width + 8;
  }
  [self setAccessibilityElement:YES];
  [self setAccessibilityRole:NSAccessibilityGroupRole];
  [self setAccessibilityLabel:@"Plico tab navigator"];
  NSMutableArray* actions = [NSMutableArray array];
  for (NSDictionary* hit in self.hits) {
    NSString* name = [hit[@"slot"] intValue] < 0
                         ? c.tabs[hit[@"id"]][@"title"]
                         : [NSString stringWithFormat:@"Stack %d", [hit[@"slot"] intValue] + 1];
    if ([hit[@"slot"] intValue] < 0) {
      NSString* extra = status([hit[@"id"] longLongValue]);
      if (extra.length) name = [name stringByAppendingFormat:@", %@", extra];
      if (c->model.active() == [hit[@"id"] longLongValue])
        name = [name stringByAppendingString:@", current page"];
    }
    __weak Companion* weak = c;
    [actions
        addObject:[[NSAccessibilityCustomAction alloc]
                      initWithName:name ?: @"Tab"
                           handler:^BOOL {
                             Companion* owner = weak;
                             if (!owner || owner.actionRequest || owner.pending) return NO;
                             auto result =
                                 [hit[@"slot"] intValue] < 0
                                     ? owner->router->PointerSelect([hit[@"id"] longLongValue])
                                     : owner->router->PointerSelectStack([hit[@"slot"] intValue]);
                             [owner apply:result];
                             return YES;
                           }]];
  }
  [self setAccessibilityCustomActions:actions];
}
- (void)mouseDown:(NSEvent*)e {
  if (self.owner.actionRequest || self.owner.pending) return;
  NSPoint p = [self convertPoint:e.locationInWindow fromView:nil];
  for (NSDictionary* h in self.hits.reverseObjectEnumerator)
    if (NSPointInRect(p, [h[@"rect"] rectValue])) {
      auto r = [h[@"slot"] intValue] < 0
                   ? self.owner->router->PointerSelect([h[@"id"] longLongValue])
                   : self.owner->router->PointerSelectStack([h[@"slot"] intValue]);
      [self.owner apply:r];
      return;
    }
  [self.owner cancel];
}
- (void)scrollWheel:(NSEvent*)e {
  if (self.owner.actionRequest || self.owner.pending) return;
  NSPoint p = [self convertPoint:e.locationInWindow fromView:nil];
  if (NSPointInRect(p, self.stackScrollRect) &&
      fabs(e.scrollingDeltaY) >= fabs(e.scrollingDeltaX)) {
    if (e.scrollingDeltaY != 0) {
      [self.owner
          apply:self.owner->router->PointerNavigateVertical(e.scrollingDeltaY > 0 ? -1 : 1)];
    }
  } else {
    self.horizontalOffset +=
        fabs(e.scrollingDeltaX) > fabs(e.scrollingDeltaY) ? e.scrollingDeltaX : e.scrollingDeltaY;
    [self setNeedsDisplay:YES];
  }
}
@end

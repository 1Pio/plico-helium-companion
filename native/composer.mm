#import "companion.h"
@implementation Companion (Composer)
- (void)showComposer:(BOOL)edit {
  if (self.composer.visible) {
    [self.composer makeFirstResponder:self.field];
    return;
  }
  [self.panel orderOut:nil];
  self.editing = edit;
  router->SetEditorOwnsInput(true);
  self.field.stringValue = edit ? (self.tabs[@(model.active().value_or(-1))][@"url"] ?: @"") : @"";
  [self setSearchRows:@[]];
  [self.composer makeKeyAndOrderFront:nil];
  [self.composer makeFirstResponder:self.field];
  [self.field selectText:nil];
  [self search];
}
- (void)setSearchRows:(NSArray*)rows {
  NSString* q = self.field.stringValue;
  NSString* title =
      q.length ? [NSString stringWithFormat:@"%@ %@", self.editing ? @"Go to" : @"Search for", q]
               : @"Search or enter an address";
  NSMutableArray* grouped = [NSMutableArray arrayWithObject:@{
    @"kind" : @"typed",
    @"title" : title,
    @"location" : self.editing ? @"Navigate current tab" : @"Open in a new tab"
  }];
  for (NSArray* g in @[
         @[ @"tab", @"Already open" ], @[ @"History", @"Recent" ], @[ @"Bookmark", @"Bookmarks" ]
       ]) {
    BOOL added = NO;
    for (NSDictionary* r in rows)
      if ([r[@"kind"] isEqual:g[0]] || [r[@"location"] isEqual:g[0]]) {
        if (!added) {
          [grouped addObject:@{@"kind" : @"header", @"title" : g[1]}];
          added = YES;
        }
        [grouped addObject:r];
      }
  }
  self.rows = grouped;
  [self.results reloadData];
  [self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];
  [self layoutComposer];
}
- (void)layoutComposer {
  CGFloat content = 0;
  for (NSDictionary* r in self.rows) content += [r[@"kind"] isEqual:@"header"] ? 30 : 48;
  CGFloat width = MIN(660, MAX(280, self.browserFrame.size.width - 48));
  CGFloat height = MIN(480, content + 130);
  height = MIN(height, MAX(178, self.browserFrame.size.height - 48));
  CGFloat top = MIN(NSMaxY(self.browserFrame) - 24, NSMidY(self.browserFrame) + 90),
          bottom = MAX(NSMinY(self.browserFrame) + 24, top - height);
  [self.composer setFrame:NSMakeRect(NSMidX(self.browserFrame) - width / 2, bottom, width, height)
                  display:YES];
  self.inputMaterial.frame = NSMakeRect(0, height - 64, width, 64);
  self.resultMaterial.frame = NSMakeRect(0, 0, width, height - 74);
  [self.inputMaterial refresh];
  [self.resultMaterial refresh];
  self.field.frame = NSMakeRect(56, 20, width - 132, 24);
  self.field.textColor = NSColor.labelColor;
  for (NSView* v in self.inputMaterial.subviews)
    if ([v isKindOfClass:NSButton.class]) v.frame = NSMakeRect(width - 60, 18, 36, 28);
  self.composerScroll.frame = NSMakeRect(12, 40, width - 24, height - 126);
  self.results.tableColumns.firstObject.width = self.composerScroll.contentSize.width;
  self.composerHint.frame = NSMakeRect(24, 12, 100, 16);
  self.composerActions.frame = NSMakeRect(width - 214, 12, 190, 16);
}
- (void)search {
  self.latestQuery = self.field.stringValue;
  [self send:@{@"type" : @"search", @"query" : self.latestQuery}];
}
- (void)controlTextDidChange:(NSNotification*)n {
  [self.searchTimer invalidate];
  __weak Companion* w = self;
  self.searchTimer = [NSTimer scheduledTimerWithTimeInterval:0.08
                                                     repeats:NO
                                                       block:^(NSTimer* t) {
                                                         [w search];
                                                       }];
}
- (BOOL)control:(NSControl*)control textView:(NSTextView*)view doCommandBySelector:(SEL)selector {
  if ([view hasMarkedText]) return NO;
  if (selector == @selector(moveDown:) || selector == @selector(moveUp:)) {
    NSInteger next = self.results.selectedRow + (selector == @selector(moveDown:) ? 1 : -1);
    while (next >= 0 && next < (NSInteger)self.rows.count &&
           [self.rows[next][@"kind"] isEqual:@"header"])
      next += selector == @selector(moveDown:) ? 1 : -1;
    if (next < 0 || next >= (NSInteger)self.rows.count) return YES;
    [self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:next] byExtendingSelection:NO];
    [self.results scrollRowToVisible:next];
    return YES;
  }
  if (selector == @selector(insertNewline:)) {
    [self choose:nil];
    return YES;
  }
  if (selector == @selector(cancelOperation:)) {
    [self cancel];
    return YES;
  }
  return NO;
}
- (NSInteger)numberOfRowsInTableView:(NSTableView*)table {
  return self.rows.count;
}
- (CGFloat)tableView:(NSTableView*)table heightOfRow:(NSInteger)row {
  return [self.rows[row][@"kind"] isEqual:@"header"] ? 30 : 48;
}
- (BOOL)tableView:(NSTableView*)table shouldSelectRow:(NSInteger)row {
  return ![self.rows[row][@"kind"] isEqual:@"header"];
}
- (NSTableRowView*)tableView:(NSTableView*)table rowViewForRow:(NSInteger)row {
  return [PlicoResultRow new];
}
- (NSView*)tableView:(NSTableView*)table
    viewForTableColumn:(NSTableColumn*)column
                   row:(NSInteger)row {
  PlicoResultCell* cell = [PlicoResultCell new];
  cell.row = self.rows[row];
  cell.icon = [self.icons objectForKey:cell.row[@"url"] ?: @""];
  cell.accessibilityLabel =
      [NSString stringWithFormat:@"%@ %@", cell.row[@"title"] ?: @"", cell.row[@"location"] ?: @""];
  return cell;
}
- (void)choose:(id)sender {
  NSInteger row = self.results.selectedRow;
  if (row < 0 || row >= (NSInteger)self.rows.count) return;
  NSDictionary* r = self.rows[row];
  if ([r[@"kind"] isEqual:@"header"]) return;
  NSMutableDictionary* m = [@{@"type" : @"open"} mutableCopy];
  if ([r[@"kind"] isEqual:@"tab"])
    m[@"tab"] = r[@"id"];
  else {
    m[@"text"] = [r[@"kind"] isEqual:@"url"] ? r[@"url"] : self.field.stringValue;
    if (![m[@"text"] length]) return;
    if (self.editing) m[@"edit"] = @(model.active().value_or(-1));
  }
  [self send:m];
  [self cancel];
}
@end

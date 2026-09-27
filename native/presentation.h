#pragma once
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
BOOL PlicoDark(NSView* v);
NSColor* PlicoInk(NSView* v, BOOL secondary);
void PlicoText(NSString* text, NSRect rect, CGFloat size, NSFontWeight weight, NSColor* color);
void PlicoRightText(NSString* text, NSRect rect, CGFloat size, NSColor* color);
NSImage* PlicoSymbol(NSString* name, NSColor* color);
NSString* PlicoDomain(NSString* url);
@interface PlicoPanel : NSPanel
@end
@interface PlicoMaterial : NSVisualEffectView
@property (nonatomic, strong) NSView* tint;
- (void)refresh;
@end

@interface PlicoResultRow : NSTableRowView
@end

@interface PlicoResultCell : NSView
@property (nonatomic, strong) NSDictionary* row;
@property (nonatomic, strong) NSImage* icon;
@end

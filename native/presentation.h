// Native materials and typography shared by both transient surfaces.
#import <QuartzCore/QuartzCore.h>
static BOOL PlicoDark(NSView*v){return [[v.effectiveAppearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua,NSAppearanceNameDarkAqua]]isEqual:NSAppearanceNameDarkAqua];}
static NSColor* PlicoInk(NSView*v,BOOL secondary){return [NSColor colorWithWhite:PlicoDark(v)?(secondary?0.66:0.94):(secondary?0.39:0.12) alpha:1];}
static void PlicoText(NSString*text,NSRect rect,CGFloat size,NSFontWeight weight,NSColor*color){NSMutableParagraphStyle*p=[NSMutableParagraphStyle new];p.lineBreakMode=NSLineBreakByTruncatingTail;[(text?:@"")drawInRect:rect withAttributes:@{NSFontAttributeName:[NSFont systemFontOfSize:size weight:weight],NSForegroundColorAttributeName:color,NSParagraphStyleAttributeName:p}];}
static NSImage* PlicoSymbol(NSString*name,NSColor*color){NSImage*symbol=[NSImage imageWithSystemSymbolName:name accessibilityDescription:nil];if(!symbol)return nil;NSImage*result=[symbol copy];[result setTemplate:NO];[result lockFocus];[color set];NSRectFillUsingOperation(NSMakeRect(0,0,result.size.width,result.size.height),NSCompositingOperationSourceAtop);[result unlockFocus];return result;}
static NSString* PlicoDomain(NSString*url){NSURL*u=[NSURL URLWithString:url?:@""];NSString*host=u.host;if(host.length)return u.port?[NSString stringWithFormat:@"%@:%@",host,u.port]:host;return u.scheme.length?[u.scheme stringByAppendingString:@":"]:@"";}
@interface PlicoMaterial:NSVisualEffectView
@property(nonatomic,strong) NSView* tint;
@end
@implementation PlicoMaterial
-(instancetype)init{if((self=[super init])){self.material=NSVisualEffectMaterialHUDWindow;self.blendingMode=NSVisualEffectBlendingModeBehindWindow;self.state=NSVisualEffectStateActive;self.wantsLayer=YES;self.layer.cornerRadius=24;self.layer.masksToBounds=YES;self.layer.borderWidth=0.75;self.tint=[[NSView alloc]initWithFrame:self.bounds];self.tint.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;self.tint.wantsLayer=YES;[self addSubview:self.tint];}return self;}
-(void)viewDidChangeEffectiveAppearance{[super viewDidChangeEffectiveAppearance];[self refresh];}
-(void)refresh{BOOL dark=PlicoDark(self);self.layer.borderColor=[NSColor colorWithWhite:dark?1:0 alpha:dark?0.18:0.16].CGColor;self.tint.layer.backgroundColor=[NSColor colorWithWhite:dark?0.055:0.98 alpha:dark?0.68:0.35].CGColor;}
@end
@interface PlicoResultRow:NSTableRowView @end
@implementation PlicoResultRow
-(void)viewDidChangeEffectiveAppearance{[super viewDidChangeEffectiveAppearance];self.needsDisplay=YES;}
-(void)drawSelectionInRect:(NSRect)dirty{if(self.selected){[[NSColor colorWithWhite:PlicoDark(self)?1:0 alpha:PlicoDark(self)?0.12:0.08]setFill];NSRect visible=self.bounds;if(self.enclosingScrollView){NSClipView*clip=self.enclosingScrollView.contentView;visible=NSIntersectionRect(visible,[self convertRect:clip.bounds fromView:clip]);}NSRect r=NSInsetRect(visible,2,2);[[NSBezierPath bezierPathWithRoundedRect:r xRadius:10 yRadius:10]fill];}}
@end
@interface PlicoResultCell:NSView
@property(nonatomic,strong) NSDictionary* row;
@property(nonatomic,strong) NSImage* icon;
@end
@implementation PlicoResultCell
-(void)viewDidChangeEffectiveAppearance{[super viewDidChangeEffectiveAppearance];self.needsDisplay=YES;}
-(BOOL)isFlipped{return YES;}
-(void)drawRect:(NSRect)dirty{
 NSDictionary*r=self.row;BOOL header=[r[@"kind"]isEqual:@"header"];
 if(header){PlicoText(r[@"title"],NSMakeRect(12,9,self.bounds.size.width-24,20),11,NSFontWeightMedium,PlicoInk(self,YES));return;}
 NSString*symbol=[r[@"kind"]isEqual:@"typed"]?@"arrow.up.right":[r[@"kind"]isEqual:@"tab"]?@"globe":[r[@"location"]isEqual:@"Bookmark"]?@"bookmark":@"clock.arrow.circlepath";
 NSImage*icon=self.icon?:PlicoSymbol(symbol,PlicoInk(self,YES));
 [PlicoInk(self,YES)set];[icon drawInRect:NSMakeRect(12,15,20,20) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
 CGFloat width=MAX(80,self.bounds.size.width-164);
 PlicoText(r[@"title"],NSMakeRect(44,6,width,20),13,NSFontWeightMedium,PlicoInk(self,NO));
 NSString*detail=[r[@"kind"]isEqual:@"typed"]?r[@"location"]:PlicoDomain(r[@"url"]);
 if([r[@"kind"]isEqual:@"tab"])detail=[detail stringByAppendingFormat:@" · %@",r[@"location"]];
 PlicoText(detail,NSMakeRect(44,26,width,18),11,NSFontWeightRegular,PlicoInk(self,YES));
 NSString*action=[r[@"kind"]isEqual:@"tab"]?@"Switch to tab":[r[@"kind"]isEqual:@"typed"]?@"↵":@"Open";
 PlicoText(action,NSMakeRect(self.bounds.size.width-106,17,98,18),11,NSFontWeightRegular,PlicoInk(self,YES));
}
@end

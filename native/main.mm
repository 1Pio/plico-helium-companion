// Copyright 2026 The plico Authors
// SPDX-License-Identifier: GPL-3.0-only
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <libproc.h>
#include <unistd.h>
#include <signal.h>
#include <arpa/inet.h>
#include <thread>
#include <vector>
#include <set>
#include "plico/core/navigator_model.h"
#include "plico/core/gesture_router.h"
#include "extension_origin.h"
#include "protocol.h"
#include "keymap.h"
#include "preferences.h"
#include "presentation.h"
using namespace plico;
static bool TraceEnabled(){return getenv("PLICO_DIAGNOSTICS")!=nullptr;}
static BOOL PairingFailure(const char* reason,int error=0){if(TraceEnabled())fprintf(stderr,"plico: pairing unavailable: %s error=%d\n",reason,error);return NO;}
static int64_t Now(){return (int64_t)(NSProcessInfo.processInfo.systemUptime*1000);}
static NSArray* IDs(const std::vector<TabId>& v){NSMutableArray*a=[NSMutableArray array];for(auto id:v)[a addObject:@(id)];return a;}
static std::vector<TabId> Vector(id a){std::vector<TabId>v;if([a isKindOfClass:NSArray.class])for(id x in a)if([x isKindOfClass:NSNumber.class])v.push_back([x longLongValue]);return v;}
static unsigned Mods(CGEventFlags f){return ((f&kCGEventFlagMaskCommand)?kCommand:0)|((f&kCGEventFlagMaskControl)?kControl:0)|((f&kCGEventFlagMaskShift)?kShift:0)|((f&kCGEventFlagMaskAlternate)?kOption:0);}
@class Companion;
@interface PlicoPanel:NSPanel @end
@implementation PlicoPanel
-(BOOL)canBecomeKeyWindow{return YES;}
-(BOOL)canBecomeMainWindow{return NO;}
@end
@interface NavigatorView:NSView
@property(nonatomic,weak) Companion* owner;
@property(nonatomic,strong) NSMutableArray* hits;
@property(nonatomic) CGFloat horizontalOffset;
@property(nonatomic,strong) NSNumber* revealedTab;
@property(nonatomic) CGFloat revealedX;
@property(nonatomic) CGFloat revealedWidth;
@property(nonatomic) NSRect stackScrollRect;
@end
@interface Companion:NSObject<NSApplicationDelegate,NSTextFieldDelegate,NSTableViewDataSource,NSTableViewDelegate>{
@public NavigatorModel model; GestureRouter* router; CFMachPortRef tap; CFRunLoopSourceRef tapSource;
 std::set<int> swallowed; pid_t heliumPID; PlicoBindings bindings;
}
@property(nonatomic,strong) NSDictionary* snapshot;
@property(nonatomic,strong) NSDictionary* tabs;
@property(nonatomic,strong) NSCache* icons;
@property(nonatomic,strong) NSSet* debuggerTabs;
@property(nonatomic,copy) NSString* attachmentRequest;
@property(nonatomic) BOOL debuggerAvailable;
@property(nonatomic,copy) NSString* epoch;
@property(nonatomic) NSInteger revision;
@property(nonatomic,strong) PlicoPanel* panel;
@property(nonatomic,strong) NavigatorView* navigator;
@property(nonatomic,strong) PlicoPanel* composer;
@property(nonatomic,strong) PlicoMaterial* barMaterial;
@property(nonatomic,strong) PlicoMaterial* stackMaterial;
@property(nonatomic,strong) PlicoMaterial* inputMaterial;
@property(nonatomic,strong) PlicoMaterial* resultMaterial;
@property(nonatomic,strong) NSTextField* composerHint;
@property(nonatomic,copy) NSString* theme;
@property(nonatomic,copy) NSString* actionRequest;
@property(nonatomic,copy) NSString* actionKind;
@property(nonatomic,strong) NSNumber* actionTab;
@property(nonatomic) unsigned actionModifiers;
@property(nonatomic) BOOL actionFailed;
@property(nonatomic,strong) NSTimer* actionTimer;
@property(nonatomic) NSUInteger revealGeneration;
@property(nonatomic,strong) NSTextField* field;
@property(nonatomic,strong) NSTableView* results;
@property(nonatomic,strong) NSScrollView* composerScroll;
@property(nonatomic,strong) NSArray* rows;
@property(nonatomic,strong) NSTimer* revealTimer;
@property(nonatomic,strong) NSTimer* searchTimer;
@property(nonatomic,strong) NSStatusItem* statusItem;
@property(nonatomic,strong) NSMutableSet* requests;
@property(nonatomic) BOOL editing;
@property(nonatomic) BOOL pending;
@property(nonatomic,copy) NSString* pendingRequest;
@property(nonatomic,strong) NSTimer* commitTimer;
@property(nonatomic) BOOL resetOnSnapshot;
@property(nonatomic) BOOL stopped;
@property(nonatomic) NSRect browserFrame;
@property(nonatomic,strong) NSString* latestQuery;
@property(nonatomic,strong) id localMonitor;
-(void)receive:(NSDictionary*)m;
-(void)send:(NSDictionary*)m;
-(void)render;
-(void)cancel;
-(void)apply:(GestureResult)r;
-(BOOL)paired;
-(BOOL)browserEditorFocused;
-(void)showComposer:(BOOL)edit;
-(void)layoutComposer;
-(void)setSearchRows:(NSArray*)rows;
-(void)abandonAction;
-(void)clearAction;
-(void)choose:(id)sender;
-(CGEventRef)event:(CGEventRef)e type:(CGEventType)type;
@end
static CGEventRef Tap(CGEventTapProxy proxy,CGEventType type,CGEventRef event,void*context){return [(__bridge Companion*)context event:event type:type];}
@implementation NavigatorView
-(void)viewDidChangeEffectiveAppearance{[super viewDidChangeEffectiveAppearance];self.needsDisplay=YES;}
-(BOOL)isFlipped{return YES;}
-(BOOL)acceptsFirstResponder{return NO;}
-(BOOL)acceptsFirstMouse:(NSEvent*)event{return YES;}
-(void)drawRect:(NSRect)dirty{
 Companion*c=self.owner;self.hits=[NSMutableArray array];self.stackScrollRect=NSZeroRect;[self removeAllToolTips];
 const CGFloat h=64,y=self.bounds.size.height/2-h/2;
 c.barMaterial.frame=NSMakeRect(0,y,self.bounds.size.width,h);[c.barMaterial refresh];c.stackMaterial.hidden=YES;
 const auto& layout=c->model.visible();auto selected=c->model.candidate();
 struct Item{TabId id;int slot;CGFloat width;};std::vector<Item>items;
 for(auto id:layout.loose)items.push_back({id,-1,selected==id?280.0:52.0});
 for(int slot=0;slot<10;slot++)if(!layout.stacks[slot].empty())items.push_back({0,slot,selected&&std::find(layout.stacks[slot].begin(),layout.stacks[slot].end(),*selected)!=layout.stacks[slot].end()?MIN(440.0,self.bounds.size.width-36):148.0});
 CGFloat total=0,selectedX=0,selectedWidth=0;
 for(auto i:items){BOOL chosen=i.slot<0?selected==i.id:(selected&&std::find(layout.stacks[i.slot].begin(),layout.stacks[i.slot].end(),*selected)!=layout.stacks[i.slot].end());if(chosen){selectedX=total;selectedWidth=i.width;}total+=i.width+8;}
 CGFloat barWidth=MIN(self.bounds.size.width,MAX(120,total+16));c.barMaterial.frame=NSMakeRect((self.bounds.size.width-barWidth)/2,y,barWidth,h);
 CGFloat visible=self.bounds.size.width-24;
 self.horizontalOffset=total<=visible?0:MAX(0,MIN(self.horizontalOffset,total-visible));
 BOOL reveal=![self.revealedTab isEqual:selected?@(*selected):nil]||selectedX!=self.revealedX||selectedWidth!=self.revealedWidth;self.revealedTab=selected?@(*selected):nil;self.revealedX=selectedX;self.revealedWidth=selectedWidth;
 if(total>visible&&reveal){CGFloat at=12+selectedX-self.horizontalOffset;if(at<12)self.horizontalOffset=selectedX;else if(at+selectedWidth>self.bounds.size.width-12)self.horizontalOffset=MIN(total-visible,selectedX+selectedWidth-visible);}
 CGFloat x=total<visible?(self.bounds.size.width-total+8)/2:12-self.horizontalOffset;
 NSColor*ink=PlicoInk(self,NO),*secondary=PlicoInk(self,YES);
 auto highlight=[&](NSRect r){[[NSColor colorWithWhite:PlicoDark(self)?1:0 alpha:PlicoDark(self)?0.13:0.085]setFill];[[NSBezierPath bezierPathWithRoundedRect:r xRadius:17 yRadius:17]fill];};
 auto status=[&](TabId id){NSMutableArray*parts=[NSMutableArray array];if([c.debuggerTabs containsObject:@(id)])[parts addObject:@"Debugger attached"];if([c.tabs[@(id)][@"muted"]boolValue])[parts addObject:@"Muted"];else if([c.tabs[@(id)][@"audible"]boolValue])[parts addObject:@"Playing audio"];return [parts componentsJoinedByString:@" · "];};
 auto tab=[&](TabId id,NSRect r,BOOL expanded,BOOL chosen){
  NSDictionary*t=c.tabs[@(id)];if(chosen)highlight(r);
  if([c.debuggerTabs containsObject:@(id)]){[[NSColor colorWithRed:0.3 green:0.61 blue:1 alpha:0.95]setStroke];NSBezierPath*p=[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(r,1,1) xRadius:16 yRadius:16];p.lineWidth=1.5;[p stroke];}
  NSImage*icon=[c.icons objectForKey:t[@"url"]?:@""]?:PlicoSymbol(@"globe",secondary);
  CGFloat ix=r.origin.x+14,iy=r.origin.y+(r.size.height-24)/2;
  [icon drawInRect:NSMakeRect(ix,iy,24,24) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
  BOOL muted=[t[@"muted"]boolValue],audible=[t[@"audible"]boolValue];
  if(muted||audible){NSImage*speaker=PlicoSymbol(muted?@"speaker.slash.fill":@"speaker.wave.2.fill",secondary);[speaker drawInRect:NSMakeRect(ix+6,r.origin.y+1,12,10) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:0.85 respectFlipped:YES hints:nil];}
  if(c->model.active()==id){[secondary setFill];[[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(ix+10,r.origin.y+r.size.height-6,4,4)]fill];}
  if(expanded){NSString*detail=PlicoDomain(t[@"url"]),*extra=status(id);if(extra.length&&chosen)detail=[NSString stringWithFormat:@"%@ · %@",detail,extra];PlicoText(t[@"title"],NSMakeRect(r.origin.x+50,r.origin.y+9,r.size.width-62,20),13,NSFontWeightMedium,ink);PlicoText(detail,NSMakeRect(r.origin.x+50,r.origin.y+29,r.size.width-62,16),11,NSFontWeightRegular,secondary);}
  NSString*tip=[NSString stringWithFormat:@"%@%@%@",t[@"title"]?:@"",status(id).length?@" · ":@"",status(id)];if(c->model.active()==id)tip=[tip stringByAppendingString:@" · Current page"];[self addToolTipRect:r owner:tip userData:nullptr];
  [self.hits addObject:@{@"rect":[NSValue valueWithRect:r],@"id":@(id),@"slot":@(-1)}];
 };
 BOOL separator=NO;
 for(auto i:items){
  BOOL chosen=i.slot<0?selected==i.id:(selected&&std::find(layout.stacks[i.slot].begin(),layout.stacks[i.slot].end(),*selected)!=layout.stacks[i.slot].end());
  NSRect rect=NSMakeRect(x,y+5,i.width,h-10);
  if(i.slot>=0&&!separator&&!layout.loose.empty()){[[secondary colorWithAlphaComponent:0.25]setStroke];NSBezierPath*p=[NSBezierPath bezierPath];[p moveToPoint:NSMakePoint(x-5,y+18)];[p lineToPoint:NSMakePoint(x-5,y+h-18)];[p stroke];separator=YES;}
  if(i.slot<0)tab(i.id,rect,chosen,chosen);
  else if(chosen){
   const auto&tabs=layout.stacks[i.slot];NSInteger index=std::find(tabs.begin(),tabs.end(),*selected)-tabs.begin();
   CGFloat left=MAX(12,MIN(x,self.bounds.size.width-i.width-12)),rowHeight=54;
   NSInteger before=MIN(index,MAX(0,(NSInteger)((y-42)/rowHeight))),after=MIN((NSInteger)tabs.size()-index-1,MAX(0,(NSInteger)((self.bounds.size.height-y-h-10)/rowHeight)));
   CGFloat top=y+5-before*rowHeight-34,bottom=y+5+(after+1)*rowHeight+8;
   NSRect surface=NSMakeRect(left-4,top,i.width+8,bottom-top);self.stackScrollRect=surface;
   // Root coordinates are unflipped; this drawing view is flipped.
   c.stackMaterial.frame=NSMakeRect(surface.origin.x,self.bounds.size.height-NSMaxY(surface),surface.size.width,surface.size.height);c.stackMaterial.hidden=NO;[c.stackMaterial refresh];
   PlicoText([NSString stringWithFormat:@"Stack %d",i.slot+1],NSMakeRect(left+14,top+11,i.width-110,18),11,NSFontWeightMedium,secondary);
   PlicoText([NSString stringWithFormat:@"%ld / %lu",(long)index+1,tabs.size()],NSMakeRect(left+i.width-70,top+11,60,18),11,NSFontWeightRegular,secondary);
   for(NSInteger row=index-before;row<=index+after;row++)tab(tabs[row],NSMakeRect(left,y+5+(row-index)*rowHeight,i.width,rowHeight),YES,row==index);
  }else{
   highlight(rect);PlicoText([NSString stringWithFormat:@"%d",i.slot+1],NSMakeRect(x+14,y+24,30,22),15,NSFontWeightMedium,secondary);
   std::vector<TabId> previews;for(auto id:c->model.recent())if(std::find(layout.stacks[i.slot].begin(),layout.stacks[i.slot].end(),id)!=layout.stacks[i.slot].end()){previews.push_back(id);if(previews.size()==2)break;}
   for(size_t n=0;n<previews.size();n++){tab(previews[n],NSMakeRect(x+45+n*45,y+5,44,h-10),NO,NO);[self.hits removeLastObject];}
   [self.hits addObject:@{@"rect":[NSValue valueWithRect:rect],@"id":@0,@"slot":@(i.slot)}];
  }
  x+=i.width+8;
 }
 [self setAccessibilityElement:YES];[self setAccessibilityRole:NSAccessibilityGroupRole];[self setAccessibilityLabel:@"Plico tab navigator"];
 NSMutableArray*actions=[NSMutableArray array];
 for(NSDictionary*hit in self.hits){NSString*name=[hit[@"slot"]intValue]<0?c.tabs[hit[@"id"]][@"title"]:[NSString stringWithFormat:@"Stack %d",[hit[@"slot"]intValue]+1];if([hit[@"slot"]intValue]<0){NSString*extra=status([hit[@"id"]longLongValue]);if(extra.length)name=[name stringByAppendingFormat:@", %@",extra];if(c->model.active()==[hit[@"id"]longLongValue])name=[name stringByAppendingString:@", current page"];}__weak Companion*weak=c;
  [actions addObject:[[NSAccessibilityCustomAction alloc]initWithName:name?:@"Tab" handler:^BOOL{Companion*owner=weak;if(!owner||owner.actionRequest||owner.pending)return NO;auto result=[hit[@"slot"]intValue]<0?owner->router->PointerSelect([hit[@"id"]longLongValue]):owner->router->PointerSelectStack([hit[@"slot"]intValue]);[owner apply:result];return YES;}]];}
 [self setAccessibilityCustomActions:actions];
}
-(void)mouseDown:(NSEvent*)e{
 if(self.owner.actionRequest||self.owner.pending)return;
 NSPoint p=[self convertPoint:e.locationInWindow fromView:nil];
 for(NSDictionary*h in self.hits.reverseObjectEnumerator)if(NSPointInRect(p,[h[@"rect"]rectValue])){
  auto r=[h[@"slot"]intValue]<0?self.owner->router->PointerSelect([h[@"id"]longLongValue]):self.owner->router->PointerSelectStack([h[@"slot"]intValue]);
  [self.owner apply:r];return;
 }
 [self.owner cancel];
}
-(void)scrollWheel:(NSEvent*)e{
 if(self.owner.actionRequest||self.owner.pending)return;
 NSPoint p=[self convertPoint:e.locationInWindow fromView:nil];
 if(NSPointInRect(p,self.stackScrollRect)&&fabs(e.scrollingDeltaY)>=fabs(e.scrollingDeltaX)){
  if(e.scrollingDeltaY!=0){[self.owner apply:self.owner->router->PointerNavigateVertical(e.scrollingDeltaY>0?-1:1)];}
 }else {self.horizontalOffset+=fabs(e.scrollingDeltaX)>fabs(e.scrollingDeltaY)?e.scrollingDeltaX:e.scrollingDeltaY;[self setNeedsDisplay:YES];}
}
@end
@implementation Companion
-(instancetype)init{if((self=[super init])){router=new GestureRouter(model);_requests=[NSMutableSet set];_rows=@[];_tabs=@{};_icons=[NSCache new];_icons.countLimit=128;}return self;}
-(void)applicationDidFinishLaunching:(NSNotification*)note{
 [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
 NSMenu*main=[NSMenu new];NSMenuItem*edit=[NSMenuItem new];edit.title=@"Edit";edit.submenu=[NSMenu new];[main addItem:edit];
 for(NSArray*entry in @[@[@"Undo",@"undo:",@"z"],@[@"Redo",@"redo:",@"Z"],@[@"Cut",@"cut:",@"x"],@[@"Copy",@"copy:",@"c"],@[@"Paste",@"paste:",@"v"],@[@"Select All",@"selectAll:",@"a"]]){
  NSMenuItem*item=[[NSMenuItem alloc]initWithTitle:entry[0] action:NSSelectorFromString(entry[1]) keyEquivalent:entry[2]];[edit.submenu addItem:item];
 }
 NSApp.mainMenu=main;
 self.statusItem=[NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];self.statusItem.button.title=@"p";
 NSMenu*menu=[NSMenu new];for(NSArray*entry in @[@[@"Open navigator",@"toggle:"],@[@"Enable Accessibility…",@"permission:"],@[@"Disconnect Plico",@"quit:"]]){NSMenuItem*i=[[NSMenuItem alloc]initWithTitle:entry[0] action:NSSelectorFromString(entry[1]) keyEquivalent:@""];i.target=self;[menu addItem:i];}self.statusItem.menu=menu;
 NSNotificationCenter*nc=NSWorkspace.sharedWorkspace.notificationCenter;
 [nc addObserver:self selector:@selector(deactivate:) name:NSWorkspaceDidActivateApplicationNotification object:nil];
 [nc addObserver:self selector:@selector(deactivate:) name:NSWorkspaceWillSleepNotification object:nil];
 [[NSDistributedNotificationCenter defaultCenter]addObserver:self selector:@selector(deactivate:) name:@"com.apple.screenIsLocked" object:nil];
 self.panel=[[PlicoPanel alloc]initWithContentRect:NSMakeRect(0,0,800,480) styleMask:NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
 self.panel.animationBehavior=NSWindowAnimationBehaviorNone;self.panel.appearance=nil;self.panel.title=@"Plico Navigator";self.panel.level=NSFloatingWindowLevel;self.panel.opaque=NO;self.panel.backgroundColor=NSColor.clearColor;self.panel.hasShadow=NO;self.panel.hidesOnDeactivate=NO;self.panel.collectionBehavior=NSWindowCollectionBehaviorMoveToActiveSpace|NSWindowCollectionBehaviorFullScreenAuxiliary;
 NSView*root=[[NSView alloc]initWithFrame:self.panel.contentView.bounds];self.panel.contentView=root;
 self.barMaterial=[PlicoMaterial new];self.stackMaterial=[PlicoMaterial new];[root addSubview:self.barMaterial];[root addSubview:self.stackMaterial];
 self.navigator=[[NavigatorView alloc]initWithFrame:root.bounds];self.navigator.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;self.navigator.owner=self;[root addSubview:self.navigator];
 self.composer=[[PlicoPanel alloc]initWithContentRect:NSMakeRect(0,0,620,420) styleMask:NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
 self.composer.animationBehavior=NSWindowAnimationBehaviorNone;self.composer.appearance=self.panel.appearance;self.composer.title=@"Plico Search";self.composer.level=NSFloatingWindowLevel;self.composer.opaque=NO;self.composer.backgroundColor=NSColor.clearColor;self.composer.hasShadow=YES;self.composer.collectionBehavior=self.panel.collectionBehavior;
 self.composer.hasShadow=NO;
 self.inputMaterial=[PlicoMaterial new];self.resultMaterial=[PlicoMaterial new];[self.composer.contentView addSubview:self.inputMaterial];[self.composer.contentView addSubview:self.resultMaterial];
 self.field=[[NSTextField alloc]initWithFrame:NSZeroRect];self.field.font=[NSFont systemFontOfSize:21 weight:NSFontWeightRegular];self.field.focusRingType=NSFocusRingTypeNone;self.field.bordered=NO;self.field.drawsBackground=NO;self.field.placeholderAttributedString=[[NSAttributedString alloc]initWithString:@"Search or enter an address" attributes:@{NSForegroundColorAttributeName:NSColor.secondaryLabelColor}];self.field.delegate=self;[self.inputMaterial addSubview:self.field];
 NSTextField*search=[NSTextField labelWithString:@"⌕"];search.font=[NSFont systemFontOfSize:25];search.textColor=NSColor.secondaryLabelColor;search.frame=NSMakeRect(18,20,26,30);[self.inputMaterial addSubview:search];
 NSButton*submit=[NSButton buttonWithTitle:@"↵" target:self action:@selector(choose:)];submit.frame=NSZeroRect;submit.bezelStyle=NSBezelStyleRounded;submit.accessibilityLabel=@"Open selected result";[self.inputMaterial addSubview:submit];
 NSScrollView*scroll=[[NSScrollView alloc]initWithFrame:NSZeroRect];self.composerScroll=scroll;scroll.hasVerticalScroller=YES;scroll.drawsBackground=NO;
 self.results=[[NSTableView alloc]initWithFrame:scroll.bounds];self.results.headerView=nil;self.results.rowHeight=50;self.results.intercellSpacing=NSMakeSize(0,0);self.results.backgroundColor=NSColor.clearColor;self.results.delegate=self;self.results.dataSource=self;self.results.target=self;self.results.action=@selector(choose:);NSTableColumn*col=[[NSTableColumn alloc]initWithIdentifier:@"result"];col.width=570;[self.results addTableColumn:col];scroll.documentView=self.results;[self.resultMaterial addSubview:scroll];
 self.composerHint=[NSTextField labelWithString:@"↑ ↓  Select                                             ↵  Open   ·   esc  Close"];self.composerHint.font=[NSFont systemFontOfSize:11];self.composerHint.textColor=NSColor.secondaryLabelColor;[self.resultMaterial addSubview:self.composerHint];
 __weak Companion*weak=self;
 self.localMonitor=[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent*(NSEvent*e){Companion*c=weak;if(c.composer.visible){if(e.keyCode==53&&![(NSTextView*)c.field.currentEditor hasMarkedText]){[c cancel];return nil;}if(e.keyCode==36&&![(NSTextView*)c.field.currentEditor hasMarkedText]){[c choose:nil];return nil;}}return e;}];
 pid_t pid=getppid();for(int i=0;i<8&&pid>1;i++){NSRunningApplication*app=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];if([app.bundleIdentifier isEqual:@"net.imput.helium"]){heliumPID=pid;break;}struct proc_bsdinfo info={};if(proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&info,sizeof(info))!=sizeof(info))break;pid=info.pbi_ppid;}
 [self installTap];
 std::thread([weak]{@autoreleasepool{while(true){@autoreleasepool{uint32_t size=0;char*header=(char*)&size;size_t got=0;while(got<4){ssize_t n=read(STDIN_FILENO,header+got,4-got);if(n<=0)goto done;got+=n;}if(!size||size>1024*1024)break;NSMutableData*data=[NSMutableData dataWithLength:size];got=0;while(got<size){ssize_t n=read(STDIN_FILENO,(char*)data.mutableBytes+got,size-got);if(n<=0)goto done;got+=n;}if(!PlicoJSONDepthSafe(data))break;id msg=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if(![msg isKindOfClass:NSDictionary.class])break;dispatch_async(dispatch_get_main_queue(),^{[weak receive:msg];});}}done:dispatch_async(dispatch_get_main_queue(),^{[weak quit:nil];});}}).detach();
 fprintf(stderr,"plico: host ready; browser=%d accessibility=%d\n",heliumPID,AXIsProcessTrusted());
}
-(void)installTap{
 if(tap||!AXIsProcessTrusted())return;
 CGEventMask mask=CGEventMaskBit(kCGEventKeyDown)|CGEventMaskBit(kCGEventKeyUp)|CGEventMaskBit(kCGEventFlagsChanged)|CGEventMaskBit(kCGEventLeftMouseDown)|CGEventMaskBit(kCGEventRightMouseDown);
 tap=CGEventTapCreate(kCGSessionEventTap,kCGHeadInsertEventTap,kCGEventTapOptionDefault,mask,Tap,(__bridge void*)self);
 if(TraceEnabled())fprintf(stderr,"plico: event tap created=%d\n",tap!=nullptr);
 if(tap){tapSource=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0);CFRunLoopAddSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CGEventTapEnable(tap,true);}
}
-(void)permission:(id)sender{AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{(__bridge NSString*)kAXTrustedCheckOptionPrompt:@YES});[self installTap];}
-(void)toggle:(id)sender{if(!self.actionRequest&&!self.pending&&!self.resetOnSnapshot&&[self paired]){auto r=router->KeyDown(Action::kToggle,kCommand);[self apply:r];}}
-(void)quit:(id)sender{if(self.stopped)return;self.stopped=YES;[self cancel];if(tap){CGEventTapEnable(tap,false);CFRunLoopRemoveSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CFRelease(tapSource);CFRelease(tap);tap=nullptr;}[NSApp terminate:nil];}
-(void)deactivate:(NSNotification*)n{[self cancel];[self installTap];}
-(void)send:(NSDictionary*)m{
 if(!self.epoch)return;NSMutableDictionary*d=[m mutableCopy];d[@"v"]=@1;d[@"epoch"]=self.epoch;d[@"window"]=self.snapshot[@"window"][@"id"]?:@(-1);d[@"revision"]=@(self.revision);NSString*request=NSUUID.UUID.UUIDString;d[@"request"]=request;[self.requests addObject:request];
 if([m[@"type"]isEqual:@"attachments"])self.attachmentRequest=request;
 if([m[@"type"]isEqual:@"close"]||[m[@"type"]isEqual:@"mute"]){
  self.actionRequest=request;self.actionKind=m[@"type"];self.actionTab=m[@"tab"];self.actionFailed=NO;
  __weak Companion*w=self;[self.actionTimer invalidate];self.actionTimer=[NSTimer scheduledTimerWithTimeInterval:5 repeats:NO block:^(NSTimer*t){Companion*c=w;if(!c)return;[c abandonAction];c.statusItem.button.toolTip=@"Tab action is awaiting the browser. Navigation canceled.";}];
 }
 if([m[@"type"]isEqual:@"commit"]){self.pendingRequest=request;__weak Companion*w=self;[self.commitTimer invalidate];self.commitTimer=[NSTimer scheduledTimerWithTimeInterval:4 repeats:NO block:^(NSTimer*t){Companion*c=w;fprintf(stderr,"plico: commit timed out; disconnecting safely\n");[c quit:nil];}];}
 NSData*data=[NSJSONSerialization dataWithJSONObject:d options:0 error:nil];if(!data||data.length>1024*1024)return;
 static dispatch_queue_t output=dispatch_queue_create("plico.output",DISPATCH_QUEUE_SERIAL);
 dispatch_async(output,^{uint32_t size=(uint32_t)data.length;NSMutableData*frame=[NSMutableData dataWithBytes:&size length:4];[frame appendData:data];size_t sent=0;while(sent<frame.length){ssize_t n=write(STDOUT_FILENO,(char*)frame.bytes+sent,frame.length-sent);if(n<=0)break;sent+=n;}});
}
-(void)clearAction{[self.actionTimer invalidate];self.actionTimer=nil;self.actionRequest=nil;self.actionKind=nil;self.actionTab=nil;self.actionFailed=NO;}
-(void)abandonAction{
 if(self.snapshot&&self.actionRequest){self.actionFailed=YES;NSMutableDictionary*latest=[self.snapshot mutableCopy];latest[@"responseFor"]=self.actionRequest;[self receive:latest];}
 [self clearAction];[self cancel];router->ModifiersChanged(Mods(CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState)),Now());
}
-(void)receive:(NSDictionary*)m{
 if(![m[@"v"]isEqual:@1]||![m[@"epoch"]isKindOfClass:NSString.class])return;
 NSString*type=m[@"type"];
 if([type isEqual:@"snapshot"]){
  if(!PlicoSnapshotValid(m))return;
  PlicoBindings nextBindings;int delay=150;if(!PlicoPreferences(m[@"settings"],nextBindings,delay))return;
  if(self.epoch&&(![self.epoch isEqual:m[@"epoch"]]||[m[@"revision"]integerValue]<self.revision))return;
  Layout layout;layout.loose=Vector(m[@"loose"]);for(int s=0;s<10;s++){layout.stacks[s]=Vector(m[@"stacks"][s]);if([m[@"last"][s]isKindOfClass:NSNumber.class])layout.last_active[s]=[m[@"last"][s]longLongValue];}
  if(!NavigatorModel::Valid(layout))return;
  bindings=nextBindings;router->SetRevealDelay(delay);
  NSString*theme=m[@"settings"][@"theme"]?:@"system";self.theme=theme;NSAppearance*appearance=[theme isEqual:@"system"]?nil:[NSAppearance appearanceNamed:[theme isEqual:@"dark"]?NSAppearanceNameDarkAqua:NSAppearanceNameAqua];self.panel.appearance=appearance;self.composer.appearance=appearance;
  BOOL changed=![self.epoch isEqual:m[@"epoch"]]||self.revision!=[m[@"revision"]integerValue];
  BOOL actionSync=self.actionRequest&&[m[@"responseFor"]isEqual:self.actionRequest];
  BOOL deferAction=self.actionRequest&&!actionSync&&[self.snapshot[@"window"][@"id"]isEqual:m[@"window"][@"id"]];
  BOOL synchronized=self.pendingRequest&&[m[@"responseFor"]isEqual:self.pendingRequest];
  if(synchronized){self.pending=NO;self.pendingRequest=nil;[self.commitTimer invalidate];self.resetOnSnapshot=YES;}
  NSMutableDictionary*tabs=[NSMutableDictionary dictionary];for(NSDictionary*t in m[@"tabs"])if([t[@"id"]isKindOfClass:NSNumber.class]&&[t[@"title"]isKindOfClass:NSString.class])tabs[t[@"id"]]=t;
  self.tabs=tabs;self.snapshot=m;self.epoch=m[@"epoch"];self.revision=[m[@"revision"]integerValue];
  if(actionSync){
   BOOL preserve=!self.actionFailed;
   if([self.actionKind isEqual:@"close"])preserve=preserve&&model.ConfirmClose([self.actionTab longLongValue],layout,[m[@"active"]longLongValue],Vector(m[@"recent"]));
   else preserve=preserve&&!changed;
   unsigned held=self.actionModifiers;self.actionRequest=nil;self.actionKind=nil;self.actionTab=nil;[self.actionTimer invalidate];
   if(!preserve){[self cancel];model.Reset(layout,[m[@"active"]longLongValue],Vector(m[@"recent"]));router->ModifiersChanged(held,Now());}
   else if([self paired])[self apply:router->ModifiersChanged(held,Now())];else {[self cancel];router->ModifiersChanged(held,Now());}
  }else if(!deferAction&&(changed||synchronized||(!self.pending&&self.resetOnSnapshot))){if(!self.pending)self.resetOnSnapshot=NO;[self cancel];model.Reset(layout,[m[@"active"]longLongValue],Vector(m[@"recent"]));}
  [self render];
 }else if([type isEqual:@"icon"]&&[m[@"epoch"]isEqual:self.epoch]&&PlicoString(m[@"url"],65536)&&PlicoString(m[@"data"],45000)){
  NSData*data=[[NSData alloc]initWithBase64EncodedString:m[@"data"] options:0];
  const unsigned char*b=(const unsigned char*)data.bytes;
  if(data.length>=24&&memcmp(b,"\x89PNG\r\n\x1a\n",8)==0){uint32_t width=0,height=0;memcpy(&width,b+16,4);memcpy(&height,b+20,4);width=ntohl(width);height=ntohl(height);if(width&&height&&width<=64&&height<=64){NSImage*image=[[NSImage alloc]initWithData:data];if(image){[self.icons setObject:image forKey:m[@"url"]];[self.navigator setNeedsDisplay:YES];if(self.composer.visible)[self.results reloadData];}}}
 }else if([type isEqual:@"attachments"]&&[m[@"epoch"]isEqual:self.epoch]&&[m[@"request"]isEqual:self.attachmentRequest]&&[m[@"window"]isEqual:self.snapshot[@"window"][@"id"]]){
  if(!PlicoAttachmentsValid(m))return;
  NSMutableSet*live=[NSMutableSet set];for(NSNumber*tab in m[@"attached"])if(self.tabs[tab])[live addObject:tab];
  self.debuggerTabs=live;self.debuggerAvailable=[m[@"available"]boolValue];[self.navigator setNeedsDisplay:YES];
 }else if([type isEqual:@"results"]&&[m[@"epoch"]isEqual:self.epoch]&&[self.requests containsObject:m[@"request"]]){
  if(self.composer.visible&&[m[@"query"]isEqual:self.field.stringValue]&&PlicoResultsValid(m[@"rows"])){[self setSearchRows:m[@"rows"]];}
 }else if([type isEqual:@"ack"]||[type isEqual:@"error"]){if(![m[@"epoch"]isEqual:self.epoch]||![self.requests containsObject:m[@"request"]])return;[self.requests removeObject:m[@"request"]];if([self.pendingRequest isEqual:m[@"request"]]){self.resetOnSnapshot=YES;}if([type isEqual:@"error"]&&[m[@"request"]isEqual:self.actionRequest])self.actionFailed=YES;if([type isEqual:@"error"]&&PlicoString(m[@"message"],8192)){fprintf(stderr,"plico: request rejected: %s\n",[m[@"message"]UTF8String]);self.statusItem.button.toolTip=m[@"message"];} }
 else if([type isEqual:@"inactive"]&&[m[@"epoch"]isEqual:self.epoch]){[self clearAction];[self cancel];[self.commitTimer invalidate];self.pending=NO;self.pendingRequest=nil;self.resetOnSnapshot=NO;self.snapshot=nil;self.tabs=@{};[self.requests removeAllObjects];model.Reset(Layout{},std::nullopt);}
}
-(BOOL)paired{
 if(!heliumPID||!self.snapshot||![self.snapshot[@"window"][@"focused"]boolValue])return PairingFailure("no focused snapshot");
 if(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=heliumPID)return PairingFailure("different foreground app");
 AXUIElementRef app=AXUIElementCreateApplication(heliumPID);AXUIElementSetMessagingTimeout(app,0.025);CFTypeRef win=nullptr;
 AXError error=AXUIElementCopyAttributeValue(app,kAXFocusedWindowAttribute,&win);CFRelease(app);if(error!=kAXErrorSuccess||!win)return PairingFailure("AX focused window",error);
 AXUIElementSetMessagingTimeout((AXUIElementRef)win,0.025);CFTypeRef pos=nullptr,size=nullptr;AXUIElementCopyAttributeValue((AXUIElementRef)win,kAXPositionAttribute,&pos);AXUIElementCopyAttributeValue((AXUIElementRef)win,kAXSizeAttribute,&size);CFRelease(win);
 CGPoint p={};CGSize s={};BOOL okay=pos&&size&&CFGetTypeID(pos)==AXValueGetTypeID()&&CFGetTypeID(size)==AXValueGetTypeID()&&AXValueGetValue((AXValueRef)pos,(AXValueType)kAXValueCGPointType,&p)&&AXValueGetValue((AXValueRef)size,(AXValueType)kAXValueCGSizeType,&s);if(pos)CFRelease(pos);if(size)CFRelease(size);if(!okay)return PairingFailure("AX window bounds");
 NSDictionary*w=self.snapshot[@"window"];
 if(fabs(p.x-[w[@"left"]doubleValue])>24||fabs(p.y-[w[@"top"]doubleValue])>24||fabs(s.width-[w[@"width"]doubleValue])>24||fabs(s.height-[w[@"height"]doubleValue])>24)return PairingFailure("window bounds disagree");
 CGFloat screenHeight=CGDisplayBounds(CGMainDisplayID()).size.height;self.browserFrame=NSMakeRect(p.x,screenHeight-p.y-s.height,s.width,s.height);return YES;
}
-(BOOL)browserEditorFocused{
 AXUIElementRef app=AXUIElementCreateApplication(heliumPID);AXUIElementSetMessagingTimeout(app,0.025);CFTypeRef element=nullptr;
 AXError error=AXUIElementCopyAttributeValue(app,kAXFocusedUIElementAttribute,&element);CFRelease(app);
 if(error!=kAXErrorSuccess||!element)return YES; // Unknown focus must preserve editing.
 AXUIElementSetMessagingTimeout((AXUIElementRef)element,0.025);CFTypeRef role=nullptr;
 error=AXUIElementCopyAttributeValue((AXUIElementRef)element,kAXRoleAttribute,&role);CFRelease(element);
 BOOL editor=error!=kAXErrorSuccess||!role||CFEqual(role,kAXTextFieldRole)||CFEqual(role,kAXTextAreaRole)||CFEqual(role,kAXComboBoxRole);
 if(role)CFRelease(role);return editor;
}
-(void)cancel{self.navigator.revealedTab=nil;router->Cancel();[self.revealTimer invalidate];self.revealTimer=nil;[self.searchTimer invalidate];self.searchTimer=nil;router->SetEditorOwnsInput(false);[self.panel orderOut:nil];[self.composer orderOut:nil];}
-(void)render{
 if(model.mode()==Mode::kHidden){self.navigator.revealedTab=nil;[self.panel orderOut:nil];return;}if(![self paired]){[self cancel];return;}
 if(!self.panel.visible){self.debuggerTabs=nil;self.debuggerAvailable=NO;[self send:@{@"type":@"attachments"}];}
 CGFloat width=MAX(240,MIN(self.browserFrame.size.width-48,1400)),height=MAX(100,MIN(self.browserFrame.size.height-80,620));
 [self.panel setFrame:NSMakeRect(NSMidX(self.browserFrame)-width/2,NSMidY(self.browserFrame)-height/2,width,height) display:NO];[self.navigator setNeedsDisplay:YES];[self.panel orderFrontRegardless];[self.panel displayIfNeeded];[CATransaction flush];
}
-(void)apply:(GestureResult)r{
 if(r.commit){NSMutableArray*stacks=[NSMutableArray array];for(auto&s:r.commit->layout.stacks)[stacks addObject:IDs(s)];self.pending=YES;[self send:@{@"type":@"commit",@"loose":IDs(r.commit->layout.loose),@"stacks":stacks,@"activate":@(r.commit->activate)}];}
 if((r.host_action==HostAction::kClose||r.host_action==HostAction::kMute)&&model.candidate()&&!self.actionRequest){
  NSNumber*tab=@(*model.candidate());NSMutableDictionary*message=[@{@"type":r.host_action==HostAction::kClose?@"close":@"mute",@"tab":tab}mutableCopy];
  if(r.host_action==HostAction::kMute)message[@"muted"]=@(![self.tabs[tab][@"muted"]boolValue]);
  self.actionModifiers=Mods(CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState));[self send:message];
 }
 if(r.host_action==HostAction::kBack)[self send:@{@"type":@"back",@"tab":@(model.active().value_or(-1))}];
 if(r.host_action==HostAction::kCopyURL){NSString*url=self.tabs[@(model.active().value_or(-1))][@"url"];if(url){[NSPasteboard.generalPasteboard clearContents];[NSPasteboard.generalPasteboard setString:url forType:NSPasteboardTypeString];}}
 if(r.host_action==HostAction::kNewDestination||r.host_action==HostAction::kEditURL)[self showComposer:r.host_action==HostAction::kEditURL];
 [self render];
 [self.revealTimer invalidate];self.revealTimer=nil;
 if(router->reveal_deadline()){
  NSTimeInterval delay=MAX(0.001,(*router->reveal_deadline()-Now()+1)/1000.0);__weak Companion*w=self;
  self.revealTimer=[NSTimer timerWithTimeInterval:delay repeats:NO block:^(NSTimer*t){Companion*c=w;if(!c)return;if(TraceEnabled())fprintf(stderr,"plico: reveal timer fired deadline=%lld now=%lld\n",(long long)c->router->reveal_deadline().value_or(-1),(long long)Now());if([c paired]){c->router->RevealIfDue(Now());[c apply:GestureResult{}];}}];
  [[NSRunLoop mainRunLoop]addTimer:self.revealTimer forMode:NSRunLoopCommonModes];
 }
}
-(CGEventRef)event:(CGEventRef)e type:(CGEventType)type{
 if(type==kCGEventTapDisabledByTimeout||type==kCGEventTapDisabledByUserInput){[self cancel];if(tap)CGEventTapEnable(tap,true);return e;}
 if(!e)return e;int key=(int)CGEventGetIntegerValueField(e,kCGKeyboardEventKeycode);
 if(type==kCGEventKeyUp&&swallowed.erase(key))return nullptr;
 if(self.composer.visible){
  if(type==kCGEventFlagsChanged)router->ModifiersChanged(Mods(CGEventGetFlags(e)),Now());
  if(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown){CGPoint p=CGEventGetLocation(e);p.y=CGDisplayBounds(CGMainDisplayID()).size.height-p.y;if(!NSPointInRect(p,self.composer.frame)){[self cancel];return nullptr;}}
  return e;
 }
 if(type==kCGEventKeyUp)return e;
 // A browser confirmation temporarily owns a different AX window. Let Escape
 // cancel that dialog while abandoning our draft even when geometry is unpaired.
 if(self.actionRequest&&type==kCGEventKeyDown&&key==53&&NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==heliumPID){BOOL close=[self.actionKind isEqual:@"close"];[self abandonAction];if(close)return e;swallowed.insert(key);return nullptr;}
 if(model.mode()==Mode::kHidden&&!router->reveal_deadline()){
  unsigned ordinary=Mods(CGEventGetFlags(e));
  if(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown)return e;
  if(type==kCGEventKeyDown&&!(ordinary&kCommand)&&!(key==48&&(ordinary&kControl)))return e;
 }
 if(self.actionRequest&&type==kCGEventFlagsChanged)self.actionModifiers=Mods(CGEventGetFlags(e));
 BOOL pairedNow=[self paired];
 if(TraceEnabled()&&type==kCGEventKeyDown){static int samples=0;if(samples++<80)fprintf(stderr,"plico: gesture pairing=%d front=%d browser=%d mode=%d\n",pairedNow,NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier,heliumPID,(int)model.mode());}
 if(!pairedNow){if(model.mode()!=Mode::kHidden)[self cancel];return e;}
 if(self.actionRequest){
  if(type==kCGEventFlagsChanged){self.actionModifiers=Mods(CGEventGetFlags(e));return e;}
  if(type==kCGEventKeyDown){NSEvent*ne=[NSEvent eventWithCGEvent:e];NSString*ch=ne.charactersIgnoringModifiers.lowercaseString;char letter=ch.length==1&&[ch characterAtIndex:0]<128?(char)[ch characterAtIndex:0]:0;auto mapping=MapKey(key,letter,Mods(CGEventGetFlags(e)),model.mode(),bindings);
   if(mapping.action==Action::kEscape){BOOL confirmation=[self.actionKind isEqual:@"close"];[self cancel];if(confirmation){[self abandonAction];return e;}swallowed.insert(key);return nullptr;}
   if(mapping.action!=Action::kOther){swallowed.insert(key);return nullptr;}
   [self cancel];
  }
  return e;
 }
 if(self.pending||self.resetOnSnapshot)return e;
 if(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown){if(model.mode()!=Mode::kHidden){CGPoint p=CGEventGetLocation(e);p.y=CGDisplayBounds(CGMainDisplayID()).size.height-p.y;NSPoint local=[self.navigator convertPoint:[self.panel convertPointFromScreen:p] fromView:nil];BOOL hit=NO;
   for(NSDictionary*item in self.navigator.hits)if(NSPointInRect(local,[item[@"rect"]rectValue])){hit=YES;break;}
   if(!NSPointInRect(p,self.panel.frame)||!hit){[self cancel];return nullptr;}}return e;}
 unsigned mods=Mods(CGEventGetFlags(e));
 if(type==kCGEventFlagsChanged){auto r=router->ModifiersChanged(mods,Now());if(model.mode()==Mode::kHidden&&router->reveal_deadline()&&[self browserEditorFocused])router->Cancel();[self apply:r];return e;}
 if(type!=kCGEventKeyDown)return e;
 NSEvent*ne=[NSEvent eventWithCGEvent:e];NSString*ch=ne.charactersIgnoringModifiers.lowercaseString;
 char letter=ch.length==1&&[ch characterAtIndex:0]<128?(char)[ch characterAtIndex:0]:0;
 auto mapping=MapKey(key,letter,mods,model.mode(),bindings);
 // Hidden navigation must not hijack line/word editing or web-editor commands.
 if(model.mode()==Mode::kHidden&&[self browserEditorFocused]&&
    (mapping.action==Action::kLeft||mapping.action==Action::kRight||mapping.action==Action::kUp||mapping.action==Action::kDown||mapping.action==Action::kBack))mapping.action=Action::kOther;
 if(TraceEnabled()&&mapping.action!=Action::kOther)fprintf(stderr,"plico: navigation action=%d\n",(int)mapping.action);
 auto r=router->KeyDown(mapping.action,mods,CGEventGetIntegerValueField(e,kCGKeyboardEventAutorepeat),mapping.stack);[self apply:r];if(r.consumed){swallowed.insert(key);return nullptr;}return e;
}
-(void)showComposer:(BOOL)edit{
 if(self.composer.visible){[self.composer makeFirstResponder:self.field];return;}
 [self.panel orderOut:nil];self.editing=edit;router->SetEditorOwnsInput(true);self.field.stringValue=edit?(self.tabs[@(model.active().value_or(-1))][@"url"]?:@""):@"";
 [self setSearchRows:@[]];[self.composer makeKeyAndOrderFront:nil];[self.composer makeFirstResponder:self.field];[self.field selectText:nil];[self search];
}
-(void)setSearchRows:(NSArray*)rows{
 NSString*q=self.field.stringValue;NSString*title=q.length?[NSString stringWithFormat:@"%@ %@",self.editing?@"Go to":@"Search for",q]:@"Search or enter an address";
 NSMutableArray*grouped=[NSMutableArray arrayWithObject:@{@"kind":@"typed",@"title":title,@"location":self.editing?@"Navigate current tab":@"Open in a new tab"}];
 for(NSArray*g in @[@[@"tab",@"Already open"],@[@"History",@"Recent"],@[@"Bookmark",@"Bookmarks"]]){BOOL added=NO;for(NSDictionary*r in rows)if([r[@"kind"]isEqual:g[0]]||[r[@"location"]isEqual:g[0]]){if(!added){[grouped addObject:@{@"kind":@"header",@"title":g[1]}];added=YES;}[grouped addObject:r];}}
 self.rows=grouped;[self.results reloadData];[self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];[self layoutComposer];
}
-(void)layoutComposer{
 CGFloat content=0;for(NSDictionary*r in self.rows)content+=[r[@"kind"]isEqual:@"header"]?32:50;
 CGFloat width=MIN(660,MAX(280,self.browserFrame.size.width-48));
 CGFloat height=MIN(480,content+128);height=MIN(height,MAX(178,self.browserFrame.size.height-48));
 CGFloat top=MIN(NSMaxY(self.browserFrame)-24,NSMidY(self.browserFrame)+90),bottom=MAX(NSMinY(self.browserFrame)+24,top-height);
 [self.composer setFrame:NSMakeRect(NSMidX(self.browserFrame)-width/2,bottom,width,height) display:YES];
 self.inputMaterial.frame=NSMakeRect(0,height-70,width,70);self.resultMaterial.frame=NSMakeRect(0,0,width,height-80);[self.inputMaterial refresh];[self.resultMaterial refresh];
 self.field.frame=NSMakeRect(52,20,width-116,30);self.field.textColor=NSColor.labelColor;
 for(NSView*v in self.inputMaterial.subviews)if([v isKindOfClass:NSButton.class])v.frame=NSMakeRect(width-58,22,40,27);
 self.composerScroll.frame=NSMakeRect(10,38,width-20,height-130);
 self.results.tableColumns.firstObject.width=width-40;
 self.composerHint.frame=NSMakeRect(22,12,width-44,18);
}
-(void)search{self.latestQuery=self.field.stringValue;[self send:@{@"type":@"search",@"query":self.latestQuery}];}
-(void)controlTextDidChange:(NSNotification*)n{[self.searchTimer invalidate];__weak Companion*w=self;self.searchTimer=[NSTimer scheduledTimerWithTimeInterval:0.08 repeats:NO block:^(NSTimer*t){[w search];}];}
-(BOOL)control:(NSControl*)control textView:(NSTextView*)view doCommandBySelector:(SEL)selector{
 if([view hasMarkedText])return NO;
 if(selector==@selector(moveDown:)||selector==@selector(moveUp:)){NSInteger next=self.results.selectedRow+(selector==@selector(moveDown:)?1:-1);while(next>=0&&next<(NSInteger)self.rows.count&&[self.rows[next][@"kind"]isEqual:@"header"])next+=selector==@selector(moveDown:)?1:-1;if(next<0||next>=(NSInteger)self.rows.count)return YES;[self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:next] byExtendingSelection:NO];[self.results scrollRowToVisible:next];return YES;}
 if(selector==@selector(insertNewline:)){[self choose:nil];return YES;}if(selector==@selector(cancelOperation:)){[self cancel];return YES;}return NO;
}
-(NSInteger)numberOfRowsInTableView:(NSTableView*)table{return self.rows.count;}
-(CGFloat)tableView:(NSTableView*)table heightOfRow:(NSInteger)row{return [self.rows[row][@"kind"]isEqual:@"header"]?32:50;}
-(BOOL)tableView:(NSTableView*)table shouldSelectRow:(NSInteger)row{return ![self.rows[row][@"kind"]isEqual:@"header"];}
-(NSTableRowView*)tableView:(NSTableView*)table rowViewForRow:(NSInteger)row{return [PlicoResultRow new];}
-(NSView*)tableView:(NSTableView*)table viewForTableColumn:(NSTableColumn*)column row:(NSInteger)row{
 PlicoResultCell*cell=[PlicoResultCell new];cell.row=self.rows[row];cell.icon=[self.icons objectForKey:cell.row[@"url"]?:@""];cell.accessibilityLabel=[NSString stringWithFormat:@"%@ %@",cell.row[@"title"]?:@"",cell.row[@"location"]?:@""];return cell;
}
-(void)choose:(id)sender{
 NSInteger row=self.results.selectedRow;if(row<0||row>=(NSInteger)self.rows.count)return;NSDictionary*r=self.rows[row];if([r[@"kind"]isEqual:@"header"])return;NSMutableDictionary*m=[@{@"type":@"open"}mutableCopy];
 if([r[@"kind"]isEqual:@"tab"])m[@"tab"]=r[@"id"];
 else {m[@"text"]=[r[@"kind"]isEqual:@"url"]?r[@"url"]:self.field.stringValue;if(![m[@"text"]length])return;if(self.editing)m[@"edit"]=@(model.active().value_or(-1));}
 [self send:m];[self cancel];
}
@end
int main(int argc,const char*argv[]){@autoreleasepool{
 signal(SIGPIPE,SIG_IGN);
 if(argc<2||strcmp(argv[1],PLICO_EXTENSION_ORIGIN)!=0){fprintf(stderr,"Launch Plico through its paired Helium extension.\n");return 2;}
 NSApplication*app=[NSApplication sharedApplication];Companion*delegate=[Companion new];app.delegate=delegate;[app run];return 0;
}}

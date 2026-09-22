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
-(void)choose:(id)sender;
-(CGEventRef)event:(CGEventRef)e type:(CGEventType)type;
@end
static CGEventRef Tap(CGEventTapProxy proxy,CGEventType type,CGEventRef event,void*context){return [(__bridge Companion*)context event:event type:type];}
@implementation NavigatorView
-(BOOL)isFlipped{return YES;}
-(BOOL)acceptsFirstResponder{return NO;}
-(BOOL)acceptsFirstMouse:(NSEvent*)event{return YES;}
-(void)drawRect:(NSRect)dirty{
 Companion*c=self.owner;self.hits=[NSMutableArray array];self.stackScrollRect=NSZeroRect;[self removeAllToolTips];
 [[NSColor colorWithWhite:0.94 alpha:0.97]setFill];
 const CGFloat h=54,y=self.bounds.size.height/2-h/2;
 [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0,y,self.bounds.size.width,h) xRadius:18 yRadius:18]fill];
 const auto& layout=c->model.visible();auto selected=c->model.candidate();
 struct Item{TabId id;int slot;CGFloat width;};std::vector<Item> items;
 for(auto id:layout.loose)items.push_back({id,-1,selected==id?254.0:44.0});
 for(int s=0;s<10;s++)if(!layout.stacks[s].empty())items.push_back({0,s,selected&&std::find(layout.stacks[s].begin(),layout.stacks[s].end(),*selected)!=layout.stacks[s].end()?360.0:132.0});
 CGFloat total=0,selectedX=0,selectedWidth=0;for(auto i:items){BOOL chosen=i.slot<0?selected==i.id:(selected&&std::find(layout.stacks[i.slot].begin(),layout.stacks[i.slot].end(),*selected)!=layout.stacks[i.slot].end());if(chosen){selectedX=total;selectedWidth=i.width;}total+=i.width+8;}
 CGFloat visible=self.bounds.size.width-24;
 if(total<=visible)self.horizontalOffset=0;else self.horizontalOffset=MAX(0,MIN(self.horizontalOffset,total-visible));
 CGFloat x=total<visible?(self.bounds.size.width-total+8)/2:12-self.horizontalOffset;
 // Reveal the selected item without moving the actual browser tab.
 BOOL reveal=![self.revealedTab isEqual:selected?@(*selected):nil]||selectedX!=self.revealedX||selectedWidth!=self.revealedWidth;self.revealedTab=selected?@(*selected):nil;self.revealedX=selectedX;self.revealedWidth=selectedWidth;
 if(total>visible&&reveal){CGFloat at=12+selectedX-self.horizontalOffset;if(at<12)self.horizontalOffset=selectedX;else if(at+selectedWidth>self.bounds.size.width-12)self.horizontalOffset=MIN(total-visible,selectedX+selectedWidth-visible);x=12-self.horizontalOffset;}
 for(auto i:items){
  BOOL chosen=i.slot<0?selected==i.id:(selected&&std::find(layout.stacks[i.slot].begin(),layout.stacks[i.slot].end(),*selected)!=layout.stacks[i.slot].end());
  NSRect rect=NSMakeRect(x,y+6,i.width,h-12);
  [(chosen?[NSColor colorWithRed:0.23 green:0.38 blue:0.55 alpha:1]:[NSColor colorWithWhite:0.85 alpha:1])setFill];
  [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:12 yRadius:12]fill];
  NSDictionary*attrs=@{NSFontAttributeName:[NSFont systemFontOfSize:i.slot<0?14:20 weight:NSFontWeightMedium],NSForegroundColorAttributeName:chosen?NSColor.whiteColor:NSColor.labelColor};
  NSString*text=i.slot<0?c.tabs[@(i.id)][@"title"]:[NSString stringWithFormat:@"%d",i.slot+1];
  if(i.slot<0&&!chosen)text=text.length?[text substringToIndex:1]:@"·";
  if(i.slot<0){
   NSImage*icon=[c.icons objectForKey:c.tabs[@(i.id)][@"url"]?:@""]?:[NSImage imageWithSystemSymbolName:@"globe" accessibilityDescription:nil];
   [icon drawInRect:NSMakeRect(rect.origin.x+11,rect.origin.y+10,22,22) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
   if(chosen){NSMutableParagraphStyle*p=[NSMutableParagraphStyle new];p.lineBreakMode=NSLineBreakByTruncatingTail;NSMutableDictionary*a=[attrs mutableCopy];a[NSParagraphStyleAttributeName]=p;[text drawInRect:NSMakeRect(rect.origin.x+42,rect.origin.y+11,rect.size.width-54,22) withAttributes:a];}
  }else [text drawInRect:NSInsetRect(rect,12,10) withAttributes:attrs];
  BOOL attached=i.slot<0?[c.debuggerTabs containsObject:@(i.id)]:NO;
  if(i.slot>=0)for(auto id:layout.stacks[i.slot])if([c.debuggerTabs containsObject:@(id)])attached=YES;
  if(attached){[[NSColor colorWithRed:0.83 green:0.42 blue:0.08 alpha:1]setFill];[[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(NSMaxX(rect)-9,rect.origin.y+3,6,6)]fill];}
  [self addToolTipRect:rect owner:(attached?@"Debugger attached at last check":c.debuggerAvailable?@"No debugger detected at last check":@"Debugger status unavailable") userData:nullptr];
  [self.hits addObject:@{@"rect":[NSValue valueWithRect:rect],@"id":@(i.id),@"slot":@(i.slot)}];
  if(i.slot>=0&&chosen){
   auto &tabs=layout.stacks[i.slot];NSInteger index=std::find(tabs.begin(),tabs.end(),*selected)-tabs.begin();
   CGFloat width=MIN(316,self.bounds.size.width-24),left=MAX(12,MIN(x+44,self.bounds.size.width-width-12));
   self.stackScrollRect=NSMakeRect(left,0,width,self.bounds.size.height);
   for(NSInteger row=0;row<(NSInteger)tabs.size();row++){
    CGFloat top=y+6+(row-index)*46;if(top<4||top+42>self.bounds.size.height-4)continue;
    NSRect rr=NSMakeRect(left,top,width,42);BOOL active=row==index;
    [(active?[NSColor colorWithRed:0.23 green:0.38 blue:0.55 alpha:1]:[NSColor colorWithWhite:0.9 alpha:0.99])setFill];[[NSBezierPath bezierPathWithRoundedRect:rr xRadius:10 yRadius:10]fill];
    NSMutableParagraphStyle*p=[NSMutableParagraphStyle new];p.lineBreakMode=NSLineBreakByTruncatingTail;
    NSDictionary*a=@{NSFontAttributeName:[NSFont systemFontOfSize:14],NSForegroundColorAttributeName:active?NSColor.whiteColor:NSColor.labelColor,NSParagraphStyleAttributeName:p};
    [c.tabs[@(tabs[row])][@"title"] drawInRect:NSInsetRect(rr,12,11) withAttributes:a];
    BOOL rowAttached=[c.debuggerTabs containsObject:@(tabs[row])];
    if(rowAttached){[[NSColor colorWithRed:0.83 green:0.42 blue:0.08 alpha:1]setFill];[[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(NSMaxX(rr)-9,rr.origin.y+3,6,6)]fill];}
    [self addToolTipRect:rr owner:(rowAttached?@"Debugger attached at last check":c.debuggerAvailable?@"No debugger detected at last check":@"Debugger status unavailable") userData:nullptr];
    [self.hits addObject:@{@"rect":[NSValue valueWithRect:rr],@"id":@(tabs[row]),@"slot":@(-1)}];
   }
  }
  x+=i.width+8;
 }
 [self setAccessibilityElement:YES];[self setAccessibilityRole:NSAccessibilityGroupRole];[self setAccessibilityLabel:@"Plico tab navigator"];
 NSMutableArray*actions=[NSMutableArray array];
 for(NSDictionary*hit in self.hits){NSString*name=[hit[@"slot"]intValue]<0?c.tabs[hit[@"id"]][@"title"]:[NSString stringWithFormat:@"Stack %d",[hit[@"slot"]intValue]+1];__weak Companion*weak=c;
  BOOL hitAttached=[c.debuggerTabs containsObject:hit[@"id"]];int slot=[hit[@"slot"]intValue];if(slot>=0)for(auto id:layout.stacks[slot])if([c.debuggerTabs containsObject:@(id)])hitAttached=YES;
  if(hitAttached)name=[name stringByAppendingString:@", debugger attached at last check"];
  NSAccessibilityCustomAction*action=[[NSAccessibilityCustomAction alloc]initWithName:name?:@"Tab" handler:^BOOL{Companion*owner=weak;if(!owner)return NO;auto result=[hit[@"slot"]intValue]<0?owner->router->PointerSelect([hit[@"id"]longLongValue]):owner->router->PointerSelectStack([hit[@"slot"]intValue]);[owner apply:result];return YES;}];[actions addObject:action];}
 [self setAccessibilityCustomActions:actions];
}
-(void)mouseDown:(NSEvent*)e{
 NSPoint p=[self convertPoint:e.locationInWindow fromView:nil];
 for(NSDictionary*h in self.hits.reverseObjectEnumerator)if(NSPointInRect(p,[h[@"rect"]rectValue])){
  auto r=[h[@"slot"]intValue]<0?self.owner->router->PointerSelect([h[@"id"]longLongValue]):self.owner->router->PointerSelectStack([h[@"slot"]intValue]);
  [self.owner apply:r];return;
 }
 [self.owner cancel];
}
-(void)scrollWheel:(NSEvent*)e{
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
 self.panel.animationBehavior=NSWindowAnimationBehaviorNone;self.panel.appearance=[NSAppearance appearanceNamed:NSAppearanceNameAqua];self.panel.title=@"Plico Navigator";self.panel.level=NSFloatingWindowLevel;self.panel.opaque=NO;self.panel.backgroundColor=NSColor.clearColor;self.panel.hasShadow=NO;self.panel.hidesOnDeactivate=NO;self.panel.collectionBehavior=NSWindowCollectionBehaviorMoveToActiveSpace|NSWindowCollectionBehaviorFullScreenAuxiliary;
 self.navigator=[NavigatorView new];self.navigator.owner=self;self.panel.contentView=self.navigator;
 self.composer=[[PlicoPanel alloc]initWithContentRect:NSMakeRect(0,0,620,420) styleMask:NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
 self.composer.animationBehavior=NSWindowAnimationBehaviorNone;self.composer.appearance=self.panel.appearance;self.composer.title=@"Plico Search";self.composer.level=NSFloatingWindowLevel;self.composer.opaque=NO;self.composer.backgroundColor=NSColor.clearColor;self.composer.hasShadow=YES;self.composer.collectionBehavior=self.panel.collectionBehavior;
 self.composer.contentView.wantsLayer=YES;self.composer.contentView.layer.cornerRadius=16;self.composer.contentView.layer.masksToBounds=YES;self.composer.contentView.layer.backgroundColor=[NSColor colorWithWhite:0.97 alpha:1].CGColor;
 self.field=[[NSTextField alloc]initWithFrame:NSMakeRect(20,365,504,36)];self.field.font=[NSFont systemFontOfSize:20];self.field.focusRingType=NSFocusRingTypeNone;self.field.bordered=NO;self.field.drawsBackground=NO;self.field.placeholderString=@"Search or enter an address";self.field.delegate=self;[self.composer.contentView addSubview:self.field];
 NSButton*submit=[NSButton buttonWithTitle:@"↵" target:self action:@selector(choose:)];submit.frame=NSMakeRect(548,367,48,30);submit.bezelStyle=NSBezelStyleRounded;submit.accessibilityLabel=@"Open selected result";[self.composer.contentView addSubview:submit];
 NSScrollView*scroll=[[NSScrollView alloc]initWithFrame:NSMakeRect(12,16,596,332)];self.composerScroll=scroll;scroll.hasVerticalScroller=YES;scroll.drawsBackground=NO;
 self.results=[[NSTableView alloc]initWithFrame:scroll.bounds];self.results.headerView=nil;self.results.rowHeight=52;self.results.backgroundColor=NSColor.clearColor;self.results.delegate=self;self.results.dataSource=self;self.results.target=self;self.results.action=@selector(choose:);NSTableColumn*col=[[NSTableColumn alloc]initWithIdentifier:@"result"];col.width=570;[self.results addTableColumn:col];scroll.documentView=self.results;[self.composer.contentView addSubview:scroll];
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
-(void)toggle:(id)sender{if(!self.pending&&!self.resetOnSnapshot&&[self paired]){auto r=router->KeyDown(Action::kToggle,kCommand);[self apply:r];}}
-(void)quit:(id)sender{if(self.stopped)return;self.stopped=YES;[self cancel];if(tap){CGEventTapEnable(tap,false);CFRunLoopRemoveSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CFRelease(tapSource);CFRelease(tap);tap=nullptr;}[NSApp terminate:nil];}
-(void)deactivate:(NSNotification*)n{[self cancel];[self installTap];}
-(void)send:(NSDictionary*)m{
 if(!self.epoch)return;NSMutableDictionary*d=[m mutableCopy];d[@"v"]=@1;d[@"epoch"]=self.epoch;d[@"window"]=self.snapshot[@"window"][@"id"]?:@(-1);d[@"revision"]=@(self.revision);NSString*request=NSUUID.UUID.UUIDString;d[@"request"]=request;[self.requests addObject:request];
 if([m[@"type"]isEqual:@"attachments"])self.attachmentRequest=request;
 if([m[@"type"]isEqual:@"commit"]){self.pendingRequest=request;__weak Companion*w=self;[self.commitTimer invalidate];self.commitTimer=[NSTimer scheduledTimerWithTimeInterval:4 repeats:NO block:^(NSTimer*t){Companion*c=w;fprintf(stderr,"plico: commit timed out; disconnecting safely\n");[c quit:nil];}];}
 NSData*data=[NSJSONSerialization dataWithJSONObject:d options:0 error:nil];if(!data||data.length>1024*1024)return;
 static dispatch_queue_t output=dispatch_queue_create("plico.output",DISPATCH_QUEUE_SERIAL);
 dispatch_async(output,^{uint32_t size=(uint32_t)data.length;NSMutableData*frame=[NSMutableData dataWithBytes:&size length:4];[frame appendData:data];size_t sent=0;while(sent<frame.length){ssize_t n=write(STDOUT_FILENO,(char*)frame.bytes+sent,frame.length-sent);if(n<=0)break;sent+=n;}});
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
  BOOL changed=![self.epoch isEqual:m[@"epoch"]]||self.revision!=[m[@"revision"]integerValue];
  BOOL synchronized=self.pendingRequest&&[m[@"responseFor"]isEqual:self.pendingRequest];
  if(synchronized){self.pending=NO;self.pendingRequest=nil;[self.commitTimer invalidate];self.resetOnSnapshot=YES;}
  NSMutableDictionary*tabs=[NSMutableDictionary dictionary];for(NSDictionary*t in m[@"tabs"])if([t[@"id"]isKindOfClass:NSNumber.class]&&[t[@"title"]isKindOfClass:NSString.class])tabs[t[@"id"]]=t;
  self.tabs=tabs;self.snapshot=m;self.epoch=m[@"epoch"];self.revision=[m[@"revision"]integerValue];
  if(changed||synchronized||(!self.pending&&self.resetOnSnapshot)){if(!self.pending)self.resetOnSnapshot=NO;[self cancel];model.Reset(layout,[m[@"active"]longLongValue],Vector(m[@"recent"]));}
  [self render];
 }else if([type isEqual:@"icon"]&&[m[@"epoch"]isEqual:self.epoch]&&PlicoString(m[@"url"],65536)&&PlicoString(m[@"data"],45000)){
  NSData*data=[[NSData alloc]initWithBase64EncodedString:m[@"data"] options:0];
  const unsigned char*b=(const unsigned char*)data.bytes;
  if(data.length>=24&&memcmp(b,"\x89PNG\r\n\x1a\n",8)==0){uint32_t width=0,height=0;memcpy(&width,b+16,4);memcpy(&height,b+20,4);width=ntohl(width);height=ntohl(height);if(width&&height&&width<=64&&height<=64){NSImage*image=[[NSImage alloc]initWithData:data];if(image){[self.icons setObject:image forKey:m[@"url"]];[self.navigator setNeedsDisplay:YES];}}}
 }else if([type isEqual:@"attachments"]&&[m[@"epoch"]isEqual:self.epoch]&&[m[@"request"]isEqual:self.attachmentRequest]&&[m[@"window"]isEqual:self.snapshot[@"window"][@"id"]]){
  if(!PlicoAttachmentsValid(m))return;
  NSMutableSet*live=[NSMutableSet set];for(NSNumber*tab in m[@"attached"])if(self.tabs[tab])[live addObject:tab];
  self.debuggerTabs=live;self.debuggerAvailable=[m[@"available"]boolValue];[self.navigator setNeedsDisplay:YES];
 }else if([type isEqual:@"results"]&&[m[@"epoch"]isEqual:self.epoch]&&[self.requests containsObject:m[@"request"]]){
  if(self.composer.visible&&[m[@"query"]isEqual:self.field.stringValue]&&PlicoResultsValid(m[@"rows"])){self.rows=[@[@{@"kind":@"typed",@"title":self.field.stringValue.length?self.field.stringValue:@"Search or enter an address",@"location":self.editing?@"Navigate current tab":@"Open in a new tab"}]arrayByAddingObjectsFromArray:m[@"rows"]];[self.results reloadData];[self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];[self layoutComposer];}
 }else if([type isEqual:@"ack"]||[type isEqual:@"error"]){if(![m[@"epoch"]isEqual:self.epoch]||![self.requests containsObject:m[@"request"]])return;[self.requests removeObject:m[@"request"]];if([self.pendingRequest isEqual:m[@"request"]]){self.resetOnSnapshot=YES;}if([type isEqual:@"error"]&&PlicoString(m[@"message"],8192)){fprintf(stderr,"plico: request rejected: %s\n",[m[@"message"]UTF8String]);self.statusItem.button.toolTip=m[@"message"];} }
 else if([type isEqual:@"inactive"]&&[m[@"epoch"]isEqual:self.epoch]){[self cancel];[self.commitTimer invalidate];self.pending=NO;self.pendingRequest=nil;self.resetOnSnapshot=NO;self.snapshot=nil;self.tabs=@{};[self.requests removeAllObjects];model.Reset(Layout{},std::nullopt);}
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
 [self.panel setFrame:NSMakeRect(NSMidX(self.browserFrame)-width/2,NSMidY(self.browserFrame)-height/2,width,height) display:NO];[self.navigator setNeedsDisplay:YES];[self.panel orderFrontRegardless];
}
-(void)apply:(GestureResult)r{
 if(r.commit){NSMutableArray*stacks=[NSMutableArray array];for(auto&s:r.commit->layout.stacks)[stacks addObject:IDs(s)];self.pending=YES;[self send:@{@"type":@"commit",@"loose":IDs(r.commit->layout.loose),@"stacks":stacks,@"activate":@(r.commit->activate)}];}
 if(r.host_action==HostAction::kBack)[self send:@{@"type":@"back",@"tab":@(model.active().value_or(-1))}];
 if(r.host_action==HostAction::kCopyURL){NSString*url=self.tabs[@(model.active().value_or(-1))][@"url"];if(url){[NSPasteboard.generalPasteboard clearContents];[NSPasteboard.generalPasteboard setString:url forType:NSPasteboardTypeString];}}
 if(r.host_action==HostAction::kNewDestination||r.host_action==HostAction::kEditURL)[self showComposer:r.host_action==HostAction::kEditURL];
 [self render];
 [self.revealTimer invalidate];self.revealTimer=nil;
 if(router->reveal_deadline()){NSTimeInterval delay=MAX(0,(*router->reveal_deadline()-Now())/1000.0);__weak Companion*w=self;self.revealTimer=[NSTimer scheduledTimerWithTimeInterval:delay repeats:NO block:^(NSTimer*t){Companion*c=w;if(c&&[c paired]){c->router->RevealIfDue(Now());[c render];}}];}
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
 if(model.mode()==Mode::kHidden&&!router->reveal_deadline()){
  unsigned ordinary=Mods(CGEventGetFlags(e));
  if(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown)return e;
  if(type==kCGEventKeyDown&&!(ordinary&kCommand)&&!(key==48&&(ordinary&kControl)))return e;
 }
 BOOL pairedNow=[self paired];
 if(TraceEnabled()&&type==kCGEventKeyDown){static int samples=0;if(samples++<80)fprintf(stderr,"plico: gesture pairing=%d front=%d browser=%d mode=%d\n",pairedNow,NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier,heliumPID,(int)model.mode());}
 if(!pairedNow){if(model.mode()!=Mode::kHidden)[self cancel];return e;}
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
 self.rows=@[@{@"kind":@"typed",@"title":self.field.stringValue.length?self.field.stringValue:@"Search or enter an address",@"location":edit?@"Navigate current tab":@"Open in a new tab"}];[self.results reloadData];[self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];[self layoutComposer];[self.composer makeKeyAndOrderFront:nil];[self.composer makeFirstResponder:self.field];[self.field selectText:nil];[self search];
}
-(void)layoutComposer{
 CGFloat rows=MAX(1,MIN(6,self.rows.count)),height=84+rows*52;
 CGFloat width=MIN(620,MAX(280,self.browserFrame.size.width-48));
 height=MIN(height,MAX(136,self.browserFrame.size.height-48));
 CGFloat top=MIN(NSMaxY(self.browserFrame)-24,NSMidY(self.browserFrame)+60);
 CGFloat bottom=MAX(NSMinY(self.browserFrame)+24,top-height);
 [self.composer setFrame:NSMakeRect(NSMidX(self.browserFrame)-width/2,bottom,width,height) display:YES];
 self.field.frame=NSMakeRect(20,height-55,width-116,36);
 for(NSView*v in self.composer.contentView.subviews)if([v isKindOfClass:NSButton.class])v.frame=NSMakeRect(width-72,height-53,48,30);
 self.composerScroll.frame=NSMakeRect(12,12,width-24,height-84);
 self.results.tableColumns.firstObject.width=width-48;
}
-(void)search{self.latestQuery=self.field.stringValue;[self send:@{@"type":@"search",@"query":self.latestQuery}];}
-(void)controlTextDidChange:(NSNotification*)n{[self.searchTimer invalidate];__weak Companion*w=self;self.searchTimer=[NSTimer scheduledTimerWithTimeInterval:0.08 repeats:NO block:^(NSTimer*t){[w search];}];}
-(BOOL)control:(NSControl*)control textView:(NSTextView*)view doCommandBySelector:(SEL)selector{
 if([view hasMarkedText])return NO;
 if(selector==@selector(moveDown:)||selector==@selector(moveUp:)){NSInteger next=self.results.selectedRow+(selector==@selector(moveDown:)?1:-1);next=MAX(0,MIN(next,(NSInteger)self.rows.count-1));[self.results selectRowIndexes:[NSIndexSet indexSetWithIndex:next] byExtendingSelection:NO];[self.results scrollRowToVisible:next];return YES;}
 if(selector==@selector(insertNewline:)){[self choose:nil];return YES;}if(selector==@selector(cancelOperation:)){[self cancel];return YES;}return NO;
}
-(NSInteger)numberOfRowsInTableView:(NSTableView*)table{return self.rows.count;}
-(NSView*)tableView:(NSTableView*)table viewForTableColumn:(NSTableColumn*)column row:(NSInteger)row{
 NSDictionary*r=self.rows[row];NSTextField*t=[NSTextField wrappingLabelWithString:[NSString stringWithFormat:@"%@\n%@",r[@"title"]?:@"",r[@"location"]?:@""]];NSMutableAttributedString*label=[[NSMutableAttributedString alloc]initWithString:r[@"title"]?:@"" attributes:@{NSFontAttributeName:[NSFont systemFontOfSize:14],NSForegroundColorAttributeName:NSColor.labelColor}];[label appendAttributedString:[[NSAttributedString alloc]initWithString:[@"\n" stringByAppendingString:r[@"location"]?:@""] attributes:@{NSFontAttributeName:[NSFont systemFontOfSize:11],NSForegroundColorAttributeName:NSColor.secondaryLabelColor}]];t.attributedStringValue=label;t.maximumNumberOfLines=2;t.lineBreakMode=NSLineBreakByTruncatingTail;return t;
}
-(void)choose:(id)sender{
 NSInteger row=self.results.selectedRow;if(row<0||row>=(NSInteger)self.rows.count)return;NSDictionary*r=self.rows[row];NSMutableDictionary*m=[@{@"type":@"open"}mutableCopy];
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

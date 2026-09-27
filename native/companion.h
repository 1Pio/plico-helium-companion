// Internal native application state shared by its input and presentation units.
#pragma once
#import <ApplicationServices/ApplicationServices.h>
#import <Cocoa/Cocoa.h>
#include <set>
#include "keymap.h"
#include "plico/core/gesture_router.h"
#include "plico/core/navigator_model.h"
#include "presentation.h"
using namespace plico;
@class Companion;

@interface PlicoAmbientView : NSView
@end

@interface NavigatorView : NSView
@property (nonatomic, weak) Companion* owner;
@property (nonatomic, strong) NSMutableArray* hits;
@property (nonatomic) CGFloat horizontalOffset;
@property (nonatomic, strong) NSNumber* revealedTab;
@property (nonatomic) CGFloat revealedX;
@property (nonatomic) CGFloat revealedWidth;
@property (nonatomic) NSRect stackScrollRect;
@end
@interface Companion : NSObject <NSApplicationDelegate> {
 @public
  NavigatorModel model;
  GestureRouter* router;
  CFMachPortRef tap;
  CFRunLoopSourceRef tapSource;
  std::set<int> swallowed;
  pid_t heliumPID;
  PlicoBindings bindings;
}
@property (nonatomic, strong) PlicoAmbientView* barAmbient;
@property (nonatomic, strong) NSNumber* reportedInputReady;
@property (nonatomic, strong) NSNumber* reportedAccessibility;
@property (nonatomic, strong) NSDictionary* snapshot;
@property (nonatomic, strong) NSDictionary* tabs;
@property (nonatomic, strong) NSCache* icons;
@property (nonatomic, strong) NSSet* debuggerTabs;
@property (nonatomic, copy) NSString* attachmentRequest;
@property (nonatomic) BOOL debuggerAvailable;
@property (nonatomic, copy) NSString* epoch;
@property (nonatomic) NSInteger revision;
@property (nonatomic, strong) PlicoPanel* panel;
@property (nonatomic, strong) NavigatorView* navigator;
@property (nonatomic, strong) PlicoPanel* composer;
@property (nonatomic, strong) PlicoMaterial* barMaterial;
@property (nonatomic, strong) PlicoMaterial* stackMaterial;
@property (nonatomic, strong) PlicoMaterial* inputMaterial;
@property (nonatomic, strong) PlicoMaterial* resultMaterial;
@property (nonatomic, strong) NSTextField* composerHint;
@property (nonatomic, strong) NSTextField* composerActions;
@property (nonatomic, copy) NSString* theme;
@property (nonatomic, copy) NSString* actionRequest;
@property (nonatomic, copy) NSString* actionKind;
@property (nonatomic, strong) NSNumber* actionTab;
@property (nonatomic) unsigned actionModifiers;
@property (nonatomic) BOOL actionFailed;
@property (nonatomic, strong) NSTimer* actionTimer;
@property (nonatomic) NSUInteger revealGeneration;
@property (nonatomic, strong) NSTextField* field;
@property (nonatomic, strong) NSTableView* results;
@property (nonatomic, strong) NSScrollView* composerScroll;
@property (nonatomic, strong) NSArray* rows;
@property (nonatomic, strong) NSTimer* revealTimer;
@property (nonatomic, strong) NSTimer* searchTimer;
@property (nonatomic, strong) NSStatusItem* statusItem;
@property (nonatomic, strong) NSMutableSet* requests;
@property (nonatomic) BOOL editing;
@property (nonatomic) BOOL pending;
@property (nonatomic, copy) NSString* pendingRequest;
@property (nonatomic, strong) NSTimer* commitTimer;
@property (nonatomic) BOOL resetOnSnapshot;
@property (nonatomic) BOOL stopped;
@property (nonatomic) NSRect browserFrame;
@property (nonatomic, strong) NSString* latestQuery;
@property (nonatomic, strong) id localMonitor;
- (void)receive:(NSDictionary*)m;
- (void)send:(NSDictionary*)m;
- (void)render;
- (void)cancel;
- (void)apply:(GestureResult)r;
- (BOOL)paired;
- (BOOL)browserEditorFocused;
- (void)abandonAction;
- (void)clearAction;
- (CGEventRef)event:(CGEventRef)e type:(CGEventType)type;
@end

// Search UI owns its input; it never routes text through navigation gestures.
@interface Companion (Composer) <NSTextFieldDelegate, NSTableViewDataSource, NSTableViewDelegate>
- (void)showComposer:(BOOL)edit;
- (void)layoutComposer;
- (void)setSearchRows:(NSArray*)rows;
- (void)choose:(id)sender;
- (void)search;
@end

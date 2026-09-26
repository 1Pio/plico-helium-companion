#define main companion_application_main
#include "native/main.mm"
#undef main
#include <cassert>
int main(){@autoreleasepool{
 Companion*c=[Companion new];
 NSMutableDictionary*s=[@{@"v":@1,@"type":@"snapshot",@"epoch":@"test",@"revision":@1,@"active":@1,@"window":@{@"id":@7,@"left":@0,@"top":@0,@"width":@1000,@"height":@700,@"focused":@YES},@"tabs":@[@{@"id":@1,@"title":@"One",@"url":@"https://example.org/1"},@{@"id":@2,@"title":@"Two",@"url":@"https://example.org/2"}],@"loose":@[@1,@2],@"stacks":@[@[],@[],@[],@[],@[],@[],@[],@[],@[],@[]],@"last":@[NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null],@"recent":@[@1,@2]}mutableCopy];
 [c receive:s];assert(c->model.Begin(Mode::kCommandHold));assert(c->model.MoveHorizontal(1));c->model.CommitSelection();assert(c->model.committed().loose.front()==2);
 c.pending=YES;c.pendingRequest=@"mutation";[c.requests addObject:@"mutation"];
 [c receive:@{@"v":@1,@"epoch":@"test",@"type":@"error",@"request":@"mutation",@"message":@"Rejected for fixture"}];
 assert(c.pending);assert(c.resetOnSnapshot);
 [c receive:s];assert(c.pending);assert(c->model.committed().loose.front()==2);
 s[@"responseFor"]=@"mutation";[c receive:s];assert(!c.pending);assert(!c.resetOnSnapshot);assert(c->model.committed().loose.front()==1);
 s[@"revision"]=@0;s[@"loose"]=@[@2,@1];[c receive:s];assert(c->model.committed().loose.front()==1);
 c.pending=YES;c.pendingRequest=@"closed-window";
 [c receive:@{@"v":@1,@"epoch":@"test",@"type":@"inactive"}];assert(!c.pending);assert(!c.snapshot);assert(c->model.committed().loose.empty());
 s[@"revision"]=@2;[c receive:s];assert(!c.pending);assert(c->model.committed().loose.size()==2);
 PlicoBindings bindings;int delay=0;
 NSDictionary*keys=@{@"left":@"h",@"down":@"j",@"up":@"k",@"right":@"l",@"toggle":@"o",@"new":@"t",@"edit":@";",@"copy":@"c",@"back":@"Backspace"};
 assert(PlicoPreferences(@{@"revealDelayMs":@300,@"keys":keys},bindings,delay));assert(delay==300&&bindings.toggle=='o');
 assert(!PlicoPreferences(@{@"revealDelayMs":@YES,@"keys":keys},bindings,delay));
 assert(!PlicoPreferences(@{@"revealDelayMs":@0.5,@"keys":keys},bindings,delay));
 NSMutableArray*slots=[NSMutableArray array];for(int i=0;i<10;i++)[slots addObject:NSNull.null];slots[9]=@{@"key":@"0",@"modifiers":@2};
 assert(PlicoPreferences(@{@"revealDelayMs":@150,@"keys":keys,@"slots":slots},bindings,delay));assert(bindings.slots[9].key==29&&bindings.slots[9].modifiers==2);
 for(id invalid in @[@{@"key":@"0",@"modifiers":@1},@{@"key":@0,@"modifiers":@2},@{@"key":@"0",@"modifiers":@4294967297},@{@"key":@"0",@"modifiers":@YES}]){slots[9]=invalid;assert(!PlicoPreferences(@{@"revealDelayMs":@150,@"keys":keys,@"slots":slots},bindings,delay));}
 slots[9]=@{@"key":@"0",@"modifiers":@2};slots[0]=slots[9];assert(!PlicoPreferences(@{@"revealDelayMs":@150,@"keys":keys,@"slots":slots},bindings,delay));
 NSMutableDictionary*bad=[keys mutableCopy];bad[@"toggle"]=@"h";assert(!PlicoPreferences(@{@"revealDelayMs":@150,@"keys":bad},bindings,delay));
 // External reorder while a close confirmation is outstanding must survive timeout.
 s[@"revision"]=@3;s[@"loose"]=@[@1,@2];[c receive:s];c->model.Begin(Mode::kCommandHold);c.actionRequest=@"close";c.actionKind=@"close";c.actionTab=@2;
 s[@"revision"]=@4;s[@"loose"]=@[@2,@1];s[@"responseFor"]=NSNull.null;[c receive:s];assert(c->model.committed().loose.front()==1);
 [c abandonAction];assert(!c.actionRequest);assert(c->model.committed().loose.front()==2);
 c.actionRequest=@"last-tab";c.actionKind=@"close";[c receive:@{@"v":@1,@"epoch":@"test",@"type":@"inactive"}];assert(!c.actionRequest&&!c.actionTimer);[c abandonAction];
 s[@"revision"]=@5;[c receive:s];assert(c->model.Begin(Mode::kCommandHold));assert(!c.actionRequest);
 // A rejected action must not retain a modifier that was released while waiting.
 c->router->Cancel();c->router->ModifiersChanged(0,10);c->router->ModifiersChanged(kCommand,20);
 c.actionRequest=@"mute-rejected";c.actionKind=@"mute";c.actionTab=@1;c.actionModifiers=0;c.actionFailed=YES;
 s[@"responseFor"]=@"mute-rejected";[c receive:s];c->router->ModifiersChanged(kCommand,30);assert(c->router->reveal_deadline().has_value());
 puts("Native rejection, causal resync, window-loss and revision checks passed");
}}

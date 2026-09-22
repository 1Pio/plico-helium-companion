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
 NSMutableDictionary*bad=[keys mutableCopy];bad[@"toggle"]=@"h";assert(!PlicoPreferences(@{@"revealDelayMs":@150,@"keys":bad},bindings,delay));
 puts("Native rejection, causal resync, window-loss and revision checks passed");
}}

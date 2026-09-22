#import "native/protocol.h"
#include <cassert>
int main(){@autoreleasepool{
 NSMutableDictionary*m=[@{@"epoch":@"test",@"revision":@1,@"active":@7,@"window":@{@"id":@1,@"left":@0,@"top":@0,@"width":@1000,@"height":@700,@"focused":@YES},@"tabs":@[@{@"id":@7,@"title":@"Test",@"url":@"https://example.com"}],@"loose":@[@7],@"stacks":@[@[],@[],@[],@[],@[],@[],@[],@[],@[],@[]],@"last":@[NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null,NSNull.null],@"recent":@[@7]}mutableCopy];
 assert(PlicoSnapshotValid(m));
 for(NSString*k in @[@"last",@"tabs",@"window",@"epoch",@"loose",@"active",@"stacks"]){id saved=m[k];m[k]=@[];assert(!PlicoSnapshotValid(m));m[k]=saved;}
 m[@"tabs"]=@[@7];assert(!PlicoSnapshotValid(m));
 assert(!PlicoResultsValid(@[@1]));assert(!PlicoResultsValid(@[@{@"title":@1}]));assert(PlicoResultsValid(@[@{@"kind":@"url",@"title":@"Title",@"url":@"https://example.com",@"location":@"Bookmark"}]));
 puts("Snapshot and result shape regressions passed");
}}

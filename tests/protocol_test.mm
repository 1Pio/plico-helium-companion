#import "native/protocol.h"
#include <cassert>
int main() {
  @autoreleasepool {
    NSMutableDictionary* m = [@{
      @"epoch" : @"test",
      @"revision" : @1,
      @"active" : @7,
      @"window" : @{
        @"id" : @1,
        @"left" : @0,
        @"top" : @0,
        @"width" : @1000,
        @"height" : @700,
        @"focused" : @YES
      },
      @"tabs" : @[
        @{@"id" : @7,
          @"title" : @"Test",
          @"url" : @"https://example.com"}
      ],
      @"loose" : @[ @7 ],
      @"stacks" : @[ @[], @[], @[], @[], @[], @[], @[], @[], @[], @[] ],
      @"last" : @[
        NSNull.null, NSNull.null, NSNull.null, NSNull.null, NSNull.null, NSNull.null, NSNull.null,
        NSNull.null, NSNull.null, NSNull.null
      ],
      @"recent" : @[ @7 ]
    } mutableCopy];
    assert(PlicoSnapshotValid(m));
    m[@"responseFor"] = @{};
    assert(!PlicoSnapshotValid(m));
    [m removeObjectForKey:@"responseFor"];
    assert(PlicoJSONDepthSafe([@"{\"text\":\"[[[[{{{{\"}" dataUsingEncoding:NSUTF8StringEncoding]));
    NSString* deep = [[@"" stringByPaddingToLength:33 withString:@"[" startingAtIndex:0]
        stringByAppendingString:[@"" stringByPaddingToLength:33 withString:@"]" startingAtIndex:0]];
    assert(!PlicoJSONDepthSafe([deep dataUsingEncoding:NSUTF8StringEncoding]));
    NSString* utf16 = [NSString stringWithFormat:@"{\"a\":\"Ģ\",\"b\":%@,\"c\":\"Ģ\"}", deep];
    NSData* encoded = [utf16 dataUsingEncoding:NSUTF16LittleEndianStringEncoding];
    assert([NSJSONSerialization JSONObjectWithData:encoded options:0 error:nil]);
    assert(!PlicoJSONDepthSafe(encoded));
    assert(!PlicoJSONDepthSafe([@"{\"text\":\"unfinished" dataUsingEncoding:NSUTF8StringEncoding]));
    for (NSString* k in
         @[ @"last", @"tabs", @"window", @"epoch", @"loose", @"active", @"stacks" ]) {
      id saved = m[k];
      m[k] = @[];
      assert(!PlicoSnapshotValid(m));
      m[k] = saved;
    }
    m[@"tabs"] = @[ @7 ];
    assert(!PlicoSnapshotValid(m));
    assert(!PlicoResultsValid(@[ @1 ]));
    assert(!PlicoResultsValid(@[ @{@"title" : @1} ]));
    assert(PlicoResultsValid(@[ @{
      @"kind" : @"url",
      @"title" : @"Title",
      @"url" : @"https://example.com",
      @"location" : @"Bookmark"
    } ]));
    assert(PlicoAttachmentsValid(@{@"available" : @YES, @"attached" : @[ @1 ]}));
    assert(!PlicoAttachmentsValid(@{@"available" : @1, @"attached" : @[ @1 ]}));
    assert(!PlicoAttachmentsValid(@{@"available" : @NO, @"attached" : @[ @1 ]}));
    assert(!PlicoAttachmentsValid(@{@"available" : @YES, @"attached" : @[ @1, @1 ]}));
    assert(!PlicoAttachmentsValid(@{@"available" : @YES, @"attached" : @[ @"bad" ]}));
    puts("Snapshot and result shape regressions passed");
  }
}

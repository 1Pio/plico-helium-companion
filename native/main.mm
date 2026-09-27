// Copyright 2026 The plico Authors
// SPDX-License-Identifier: GPL-3.0-only
#include <signal.h>
#import "companion.h"
#include "extension_origin.h"
int main(int argc, const char* argv[]) {
  @autoreleasepool {
    signal(SIGPIPE, SIG_IGN);
    if (argc < 2 || strcmp(argv[1], PLICO_EXTENSION_ORIGIN) != 0) {
      fprintf(stderr, "Launch Plico through its paired Helium extension.\n");
      return 2;
    }
    NSApplication* app = [NSApplication sharedApplication];
    Companion* delegate = [Companion new];
    app.delegate = delegate;
    [app run];
    return 0;
  }
}

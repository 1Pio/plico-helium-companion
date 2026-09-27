#!/bin/bash
# Optional isolated test helper. Not installed or included in the app bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/bin
SDK="$(xcrun --show-sdk-path)"
xcrun clang++ -std=c++20 -O1 -fobjc-arc -isysroot "$SDK" -isystem "$SDK/usr/include/c++/v1" \
  -ffile-prefix-map="$PWD"=. -fdebug-prefix-map="$PWD"=. \
  -framework Cocoa -framework ApplicationServices -framework Carbon \
  scripts/native-input.mm -o build/bin/native-input

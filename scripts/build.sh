#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/bin 'build/Plico Helium Companion.app/Contents/MacOS'
CXX="$(xcrun --find clang++)"
for test in navigator_model gesture_router; do
 "$CXX" -std=c++20 -O1 -I. plico/core/navigator_model.cc plico/core/gesture_router.cc "tests/${test}_test.cc" -o "build/bin/${test}_test"
 "build/bin/${test}_test"
done
"$CXX" -std=c++20 -O1 -fobjc-arc -I. -framework Cocoa -framework ApplicationServices -framework Carbon native/main.mm plico/core/navigator_model.cc plico/core/gesture_router.cc -o 'build/Plico Helium Companion.app/Contents/MacOS/plico-companion'
cp native/Info.plist 'build/Plico Helium Companion.app/Contents/Info.plist'
codesign --force --sign - --identifier cc.helwig.plico.companion 'build/Plico Helium Companion.app'

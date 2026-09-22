#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/bin 'build/Plico Helium Companion.app/Contents/MacOS'
CXX="$(xcrun --find clang++)"
SDK="$(xcrun --show-sdk-path)"
CXXFLAGS=(-isysroot "$SDK" -isystem "$SDK/usr/include/c++/v1")
for test in navigator_model gesture_router keymap; do
 "$CXX" "${CXXFLAGS[@]}" -std=c++20 -O1 -I. plico/core/navigator_model.cc plico/core/gesture_router.cc "tests/${test}_test.cc" -o "build/bin/${test}_test"
 "build/bin/${test}_test"
done
"$CXX" "${CXXFLAGS[@]}" -std=c++20 -O1 -fobjc-arc -I. -framework Foundation tests/protocol_test.mm -o build/bin/protocol_test
build/bin/protocol_test
node --test tests/*.test.mjs
"$CXX" "${CXXFLAGS[@]}" -std=c++20 -O1 -fobjc-arc -I. -framework Cocoa -framework ApplicationServices -framework Carbon tests/native_state_test.mm plico/core/navigator_model.cc plico/core/gesture_router.cc -o build/bin/native_state_test
build/bin/native_state_test
"$CXX" "${CXXFLAGS[@]}" -std=c++20 -O1 -fobjc-arc -I. -framework Cocoa -framework ApplicationServices -framework Carbon native/main.mm plico/core/navigator_model.cc plico/core/gesture_router.cc -o 'build/Plico Helium Companion.app/Contents/MacOS/plico-companion'
cp native/Info.plist 'build/Plico Helium Companion.app/Contents/Info.plist'
codesign --force --sign - --identifier cc.helwig.plico.companion 'build/Plico Helium Companion.app'

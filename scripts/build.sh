#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/bin
stage="$(mktemp -d "$PWD/build/staging-XXXXXX")"
app="$stage/Plico Helium Companion.app"
mkdir -p "$app/Contents/MacOS"
trap 'echo "Build staging retained: $stage"' EXIT
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
python3 tests/publish_build_test.py
"$CXX" "${CXXFLAGS[@]}" -std=c++20 -O1 -fobjc-arc -I. -framework Cocoa -framework ApplicationServices -framework Carbon tests/native_state_test.mm plico/core/navigator_model.cc plico/core/gesture_router.cc -o build/bin/native_state_test
build/bin/native_state_test
"$CXX" "${CXXFLAGS[@]}" -std=c++20 -O1 -fobjc-arc -I. -framework Cocoa -framework ApplicationServices -framework Carbon native/main.mm plico/core/navigator_model.cc plico/core/gesture_router.cc -o "$app/Contents/MacOS/plico-companion"
cp native/Info.plist "$app/Contents/Info.plist"
if [[ "${PLICO_PREPARE_ONLY:-0}" == 1 ]]; then echo "Prepared unsigned candidate: $app"; exit 0; fi
codesign --force --sign "${PLICO_SIGNING_IDENTITY:--}" --identifier cc.helwig.plico.companion "$app"
python3 scripts/publish-build.py "$app"

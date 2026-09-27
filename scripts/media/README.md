# Real demo capture

These are contributor tools, not part of the installed product. Use the dedicated marked demo profile (`scripts/isolated.py launch --demo`), whose extension runs the shipping background worker. No everyday profile, account or browsing is used.

The native input helper can emit JSON key events with monotonic timestamps when `PLICO_TRACE_INPUT=1`. These record the predefined synthetic input it actually posts, including modifier release and cleanup. They do not listen to global personal keystrokes.

`capture.swift` uses ScreenCaptureKit to include only the exact isolated browser process and its child development companion. It excludes other browser windows, the desktop and menu bar, records no audio, crops to the owned browser frame and stops if focus leaves the approved processes. The first video presentation timestamp and input-event uptime share the host monotonic clock; inspect their offset before rendering overlays.

Build the optional recorder:

```sh
mkdir -p build/bin build/swift-cache
xcrun swiftc -module-cache-path build/swift-cache -parse-as-library \
  scripts/media/capture.swift -o build/bin/capture \
  -framework ScreenCaptureKit -framework AVFoundation -framework Cocoa
bash scripts/build-input.sh
```

Keep original captures, event logs and intermediate frames under ignored `.local/`. Only independently inspected final media belongs in `docs/media/` or release assets. All public-page titles/URLs, favicons, account state, first/last frames and transitions need review. Never replace an actual interaction with a fabricated product state.

Export silent H.264/yuv420p MP4 with faststart and no unnecessary metadata, up to 1920×1080/60fps. This fits the published [X Media Studio specifications](https://help.x.com/en/using-x/media-studio-faqs); upload eligibility and account limits are separate. Do not post to X as part of capture tooling.

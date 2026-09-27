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

Prepare and record one scene at a time, with the Mac idle:

```sh
PLICO_DEMO=1 node scripts/media/prepare.mjs --scene=navigation --take=review-1
PLICO_DEMO=1 node scripts/media/record.mjs navigation --take=review-1
```

Scenes are `navigation`, `stacks`, `busy` and `composer`. Each uses real public pages in the marked demo profile. Preparation closes older demo windows, loads pages sequentially, and discards inactive renderers while retaining their real titles and favicons. The busy scene Command-clicks six visible links on the public React Hooks reference page through the scoped browser input API, then sorts the resulting tabs with native keyboard gestures. Both commands refuse elevated memory pressure. Record checks the committed tab/group outcomes as well as the native connection.

Use a new `--take` name for each attempt: existing recordings are never overwritten. `prepare --window=ID` can restore an existing demo fixture after a rehearsal. Output goes under `.local/media-refresh-044/TAKE/`.

Render with Python plus Pillow and ffmpeg:

```sh
python3 scripts/media/render.py CAPTURE.mov EVENTS.jsonl OUTPUT.mp4 \
  --caption 'Hold Command · choose with the arrows' --crop 1100x700
```

`--crop-y` optionally sets a fixed vertical offset. It must remain inside the original frame. Captions follow recorded chapter timestamps; illuminated keycaps follow actual synthetic key-down/up timestamps at 60 fps; the busy scene also logs its browser-injected Command-clicks. The renderer rejects failed captures, out-of-range event times, unreleased keys and overlapping caption/keycap layouts. It trims idle footage after the final release, without speeding up gestures. Inspect the full native panel, including the bottom of composer suggestions, before accepting a crop.

Keep original captures, event logs and intermediate frames under ignored `.local/`. Only independently inspected final media belongs in `docs/media/` or release assets. All public-page titles/URLs, favicons, account state, first/last frames and transitions need review. Never replace an actual interaction with a fabricated product state.

Export silent H.264/yuv420p MP4 with faststart and no unnecessary metadata, up to 1920×1080/60fps. This fits the published [X Media Studio specifications](https://help.x.com/en/using-x/media-studio-faqs); upload eligibility and account limits are separate. Do not post to X as part of capture tooling.

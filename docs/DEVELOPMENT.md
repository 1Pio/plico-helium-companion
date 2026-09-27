# Development

Use macOS with Apple Command Line Tools, Python 3 and Node.js 22 or later. Install formatting dependencies with `npm ci --ignore-scripts`.

```sh
bash scripts/build.sh
npm run format:check
python3 tests/install_test.py
python3 tests/update_test.py
```

The build runs C++ model/router, native protocol/state, JavaScript and publication regressions, then builds/signs the app in a staging directory. A verified completed bundle replaces the development app atomically; the prior bundle stays in staging. Build sequentially. `--app-only` is the newcomer path and skips contributor tests; it requires no Node installation.

Default signing is ad-hoc. `PLICO_SIGNING_IDENTITY` can name a signing identity you own; never distribute its private key. `PLICO_PREPARE_ONLY=1` retains an unsigned candidate without publishing it. Local certificate signing is not Developer ID distribution or notarization.

Formatting: Prettier is pinned in package-lock.json. C++/Objective-C++ use `.clang-format`; Python uses Ruff formatting. Review semantic changes independently of formatting.

## Real-browser qualification

```sh
python3 scripts/isolated.py launch --qualify-bridge
bash scripts/build-input.sh
PLICO_QUALIFICATION=1 node scripts/reload-qualification.mjs
```

Only use the marked isolated profile. Grant Accessibility to the development app when macOS requests it. Qualification must not replace everyday profiles or register a test host in the normal browser data directory. The launcher refuses non-Normal memory pressure and an already running owned profile.

The native input helper is a separate executable built from `scripts/native-input.mm` with Cocoa, ApplicationServices and Carbon frameworks. It is for explicitly authorized local synthetic-input tests. Use `scripts/native-input.py` rather than invoking it against an arbitrary PID. The wrapper verifies the marked profile/process, and the helper repeatedly checks foreground identity and releases modifiers on exit. Keep the Mac idle during a test. A focus interruption is not a passing product test.

`qualify-*.mjs` exercises the actual extension and browser; the model tests are separate. Read a fixture before running it. Browser fixtures can create/close test windows and deliberately exercise crash/recovery or beforeunload. Never run those against a personal profile.

## Release checklist

1. Keep app plist, extension manifest and package version consistent. Update the changelog.
2. Build and run source tests; qualify changed behavior in real isolated Helium.
3. Test clean artifact install, permission guidance, connect/restart, update, interruption recovery, rollback and uninstall. Retain the last working installation.
4. Inspect demo pixels, full motion, timestamps, metadata and package content. No profile, raw log, local path, private key or qualification worker may ship.
5. Audit every intended public ref and GitHub release surface, not only the working tree. Preserve private recovery before history maintenance.
6. Obtain any required release review approval before changing repository visibility or publishing. Publish versioned source and checksums. Verify anonymous downloads and rendered documentation. State notarization status and compatibility boundaries precisely.
7. Install the qualified personal update separately and verify its frozen bytes, registration and browser connection.

Source/package checks alone are not evidence of native UI success. Keep detailed local logs ignored; publish a concise qualification statement with explicit limits.

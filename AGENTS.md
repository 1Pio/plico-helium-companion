# Plico Helium Companion

macOS only. Glance, Stagehand, Zen and Chromium compilation are outside this project.

Preserve stock browser binaries, everyday profiles and working installations. Use only marked isolated profiles for qualification; never write a test native host into a normal profile. Build the small app sequentially and check memory pressure before browser tests.

Native messages are untrusted: validate protocol, epoch, revision, request IDs, window/tab identity and bounds. Never process arbitrary shell commands or page-provided native actions. No all-sites permission or content script is needed. Debugger permission is observation-only: never attach, detach, send commands, identify agents or add stop controls.

Keep private browsing, raw recordings, local telemetry, keys and personal paths out of Git and release artifacts. Inspect historical refs and public surfaces before publication. Preserve GPL notices and required extension identity material.

Read docs/ARCHITECTURE.md before changing module boundaries and docs/DEVELOPMENT.md before qualification or release. Model tests, native synthetic input, screenshots, installation and physical user acceptance are distinct evidence. Record precise public limits in docs/QUALIFICATION.md and retain detailed private evidence only in ignored local files.

After a release qualifies, the established personal integration may be updated under the user's authorized development workflow. Retain verified rollback and verify frozen bytes, registration and browser connection; do not leave a qualified update only in the test build.

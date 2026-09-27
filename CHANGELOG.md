# Changelog

## 0.4.2 (release candidate)

- Remove the speculative AppKit wake event and its event-cycle test. Physical hold detection was blocked by deferred modifier events upstream of Plico; the wake event did not fix it.
- Document immediate modifier delivery with preserved tap-alone actions for keyboard remappers.

## 0.4.1 (superseded release candidate)

- Added an application-local wake event after timer reveal. Its test covered an AppKit notification, not visible panel presentation. Both are removed in 0.4.2.

## 0.4.0 (release candidate)

- Separate native application/input handling, navigator rendering, composer and shared presentation modules.
- Portable local source installation with profile discovery, identity checks, interrupted-install recovery and removal to Trash.
- Explicit ad-hoc update handling, retained rollback and readable contributor tooling.
- Distinguish a connected native channel, missing Accessibility permission and a ready keyboard hook; ignore stale connection callbacks.
- Public user, architecture, installation and security documentation, with real-browser teaching media.

Runtime qualification and real presentation assets are included for review. Public publication remains pending approval.

## 0.3.1

- Restore Command reveal and movement in ordinary page inputs and blank/loading tabs while preserving editing passthrough.
- Document the macOS Secure Input restriction on password-field navigation.

## 0.3.0

- Adopt native Helium groups while preserving their names and colors.
- Configurable stack shortcuts; Command+0 remains zoom reset.
- Refine composer alignment and retain selection when favicons arrive late.

## 0.2.0

- Candidate close/mute, horizontal wrapping and source-preserving stack sorting.
- Native material, continuous stack panels, two-MRU previews and grouped composer.
- System/light/dark themes and distinct active, audio and debugger indicators.

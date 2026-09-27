# Qualification

Plico 0.4.1 is a review candidate. Public publication is pending review of the README, presentation media and release package.

The candidate was exercised on **macOS 26.6, Apple Silicon, stock Helium 0.17.2.2**. This is a qualification statement for that combination, not a promise of broad Mac compatibility.

## What was checked

- **Source and native tests:** C++ navigation/router/keymap, bounded native protocol and state handling, 49 JavaScript bridge/model/settings tests, and staged-build publication. New status regressions cover stale-port callbacks and actual JSON boolean serialization.
- **Real Helium with native synthetic input:** delayed Command reveal, input fields and blank-loading pages, held and toggled navigation, release-to-commit, Escape cancellation, MRU, candidate close/mute, wrapping, native group adoption/order, fixed slot shortcuts and source-preserving sorting.
- **Presentation and lifecycle:** light/dark material, active/candidate/audio/debugger indicators, composer submission and late favicon arrival, pointer hit testing and scroll input, stack overflow, external tab removal, explicit disconnect/reconnect and native-host crash recovery. A normal browser quit/reopen preserved group slots, names and configured shortcuts.
- **Default source build:** built from a fresh directory with spaces using ad-hoc signing, without prior build outputs. Ten disposable-home install tests passed against that build, including existing non-Default profiles, refusal boundaries, interrupted/retried first installation, changed ad-hoc update and rollback. Four additional update-journal tests cover interruption and unknown-byte refusal.
- **Media:** actual shipping extension and companion in a separate public-page demo profile. Key overlays derive from predefined native input events and their monotonic timestamps. No personal browsing, desktop, unrelated applications or audio is included. The footage uses synthetic input, not a claim of physical keyboard acceptance.

The same navigation behavior had earlier physical user confirmation. That confirmation is not a fresh physical acceptance test of this refactored candidate.

## Command-hold investigation (0.4.1)

The physical-key issue remains unresolved in 0.4.1: the navigator was reported to appear only after another input. The earlier trace measured time from receipt of the modifier event, not from physical key-down, so it did not establish timely physical event delivery. A separate native regression using the real `NSApplication` event loop reproduced a missing window-update cycle without keyboard or mouse events. It fails on the previous implementation and passes with one application-local wake event after timer reveal. Cancellation and loss of browser pairing also pass. This narrower regression does not reproduce or settle the physical-key issue.

The signed 0.4.1 candidate passed the isolated input/loading-page suite, and a screen recording verified visible reveal during a bare synthetic Command hold and dismissal on release. Synthetic holds also worked before this change. They do not establish a physical-key fix. No idle polling, global input injection or permanent App Nap exemption was added. Installation and retained rollback passed disposable-home checks. Keyboard remappers that defer modifier events are a documented compatibility boundary; see installation troubleshooting.

## Resource sample

In a controlled documentation-tab demo, the companion process consumed about 0.03 CPU seconds over each 30-second idle interval, roughly **0.1% of one core**, both hidden and with its navigator open. Resident memory remained around **102 MiB**. These short samples exclude Helium, page renderers and the extension worker; RSS includes shared resident pages and is not total memory pressure. They are observations, not universal performance guarantees. The attachment check also verified that an idle open navigator does not repeatedly poll debugger metadata.

## Known limits

- Password-field Secure Input can prevent the external event tap receiving movement shortcuts. Plico does not bypass it.
- Pinned-tab organization and windows with more than ten native groups are unsupported.
- Browser group commits use multiple API calls and are not atomic. Native group IDs can change after rebuilding an arrangement.
- Durable group-slot restoration requires an exact unique match; ambiguous or changed restored groups are not guessed.
- Physical trackpad momentum, broad IME coverage, multiple displays/Spaces, Intel and other OS/browser versions are not comprehensively qualified.
- A clean source/home fixture on this existing Mac is not proof of fresh-machine Gatekeeper or Accessibility onboarding. Existing automation trust affected the attempted permission-denial probe. No TCC changes were made to bypass or manufacture that boundary.
- The source build is not notarized. Changed ad-hoc builds may require removing/re-adding their Accessibility entry. No private signing identity is distributed.

Final archive download and anonymous GitHub visibility checks can happen only after publication is approved. The private review package does not imply those gates have passed.

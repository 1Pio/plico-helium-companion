# Qualification

Plico 0.4.4 is distributed as source for a local build. The README and demonstration media were reviewed before publication.

The candidate was exercised on **macOS 26.6, Apple Silicon, stock Helium 0.17.2.2**. This is a qualification statement for that combination, not a promise of broad Mac compatibility.

## What was checked

- **Source and native tests:** C++ navigation/router/keymap, bounded native protocol and state handling, 49 JavaScript bridge/model/settings tests, and staged-build publication. New status regressions cover stale-port callbacks and actual JSON boolean serialization.
- **Real Helium with native synthetic input:** delayed Command reveal, input fields and blank-loading pages, held and toggled navigation, release-to-commit, Escape cancellation, MRU, candidate close/mute, wrapping, native group adoption/order, fixed slot shortcuts and source-preserving sorting.
- **Presentation and lifecycle:** light/dark material, active/candidate/audio/debugger indicators, composer submission and late favicon arrival, pointer hit testing and scroll input, stack overflow, external tab removal, explicit disconnect/reconnect and native-host crash recovery. A normal browser quit/reopen preserved group slots, names and configured shortcuts.
- **Default source build:** built from a fresh directory with spaces using ad-hoc signing, without prior build outputs. Ten disposable-home install tests passed against that build, including existing non-Default profiles, refusal boundaries, interrupted/retried first installation, changed ad-hoc update and rollback. Four additional update-journal tests cover interruption and unknown-byte refusal.
- **Media:** actual shipping extension and companion in a separate public-page demo profile. Key overlays derive from predefined native input events and their monotonic timestamps. No personal browsing, desktop, unrelated applications or audio is included. The footage uses synthetic input, not a claim of physical keyboard acceptance.

The same navigation behavior had earlier physical user confirmation. That confirmation is not a fresh physical acceptance test of this refactored candidate.

## Command-hold investigation and cleanup

The 0.4.1 application-local wake event did not resolve the reported physical-key issue. Earlier traces measured time from event receipt, not physical key-down. Synthetic holds already worked before that change, and its event-loop test did not draw a real panel.

Physical hold behavior was subsequently confirmed by the user after correcting deferred modifier delivery, without changing the 0.4.1 app. Version 0.4.2 removes the unsupported wake event and its implementation-specific test. Plico retains its single reveal timer; no polling or extra input injection is introduced. Keyboard-remapper compatibility and tap timing are described in installation troubleshooting.

The signed 0.4.2 cleanup passed the source/native checks, 49 JavaScript tests, ten disposable-home installation tests and four update/rollback tests. The isolated input/loading-page suite passed, including hold reveal, release-to-commit, cancellation and editing passthrough. A scoped recording showed the panel appearing during a bare synthetic Command hold and disappearing on release without the wake event. The earlier physical confirmation used 0.4.1 with corrected modifier delivery; it is not a separate physical acceptance test of the cleanup binary. Earlier broad qualification above applies to the 0.4.0/0.4.1 candidates.

## Navigation surface refinement (0.4.3)

The signed build passed existing source/native checks. An isolated 30-tab stack was captured in dark and light themes at its first, middle and last candidates, alongside a two-tab stack and loose-tab selection. In the tested 950-point browser window, eight rows fit from the first candidate and fourteen around a middle candidate. Only overflowing edges receive fades; a fitting stack has none. Panel bounds stayed inside the paired browser and previewing left its active tab unchanged. Native pointer checks passed for loose-tab selection, blank-space cancellation, vertical scrolling in held and toggled modes, and horizontal overflow scrolling. One foreground-interrupted attempt stopped safely; the uninterrupted rerun passed. A requested smaller window was overridden by the tiling environment, so that run is not small-window runtime proof.

## Ambient shade (0.4.4)

The approved ambient-shadow refinement adds a low-opacity elliptical gradient behind the bar material. It is clipped by the existing browser-contained panel, ignores hit testing, and introduces no animation, timer or extra window. It was reviewed as a separate local experiment before being accepted for 0.4.4.

The signed experiment passed the isolated dark/light surface fixture and pointer/scroll checks. An initial pointer attempt found no eligible panel and refused to click; a settled rerun passed. Scoped recordings show its appearance and dismissal over fixture content. Visual review sampled both three-second recordings and inspected consecutive frames around the light-theme reveal. This is synthetic-input evidence, not physical acceptance or every-frame coverage of both recordings. Small-window runtime coverage remains subject to the tiling limitation above.

The final signed 0.4.4 candidate passed the source/native suite, 49 JavaScript tests, ten disposable-home install tests, four update/rollback tests and the isolated native pointer/held-scroll suite. Personal installation was verified against frozen receipts; Helium displayed extension version 0.4.4 and Connected. The prior 0.4.3 installation was retained for rollback.

## README media refresh (0.4.4)

Four new recordings use the unchanged shipping companion in an isolated public-page profile: arrow-only selection, Shift-arrow reordering, six background reference links followed by numbered sorting, and open-tab search. Browser assertions checked the recorded selection and group commits. Navigation keys use scoped native synthetic input; background links use browser-injected Command-clicks. No gesture is sped up, and no product interface is reconstructed.

All four final MP4s played to completion in Helium. Review covered screenshots, sampled motion, consecutive frames around Command reveal/release, caption/keycap timing, complete composer framing and export metadata. An encoded-frame check matched 8,671 keycap states against event logs away from transition boundaries. GIF timing stays within one preview frame of its MP4. The README preview was checked at desktop and phone widths with every image loaded and one shortcut table; this local preview does not establish identical rendering on every GitHub client.

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

Repository publication does not establish fresh-machine installation or broader compatibility. Those limits remain as listed above.

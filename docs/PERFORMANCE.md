# Performance review

The 0.4.5 review covers native drawing, event routing, browser snapshots, favicon delivery, search, navigation memory, group commits and idle work. Changes target measured redundant work. Window pairing, request validation and external-edit checks remain intact.

## Changes

- **Draw only visible tabs.** The navigator previously prepared symbols and drew icons/text for every loose tab, even behind its clipping region. Offscreen entries now retain their model and accessibility actions without pixel or tooltip work. Identical fallback and speaker symbols are reused within each draw, so appearance changes need no persistent cache invalidation.
- **Filter irrelevant browser updates.** Loading status and automatic discard policy do not appear in Plico. These events no longer query and transmit a complete window snapshot. URL, title, favicon, audio, mute, discard, pin and group changes still refresh it.
- **Bound queued event refreshes.** A scheduled refresh stays reserved while waiting in the queue and while reading browser state. Events during the read request one trailing refresh. They cannot accumulate one snapshot every 25 ms behind a slow browser query. Direct request/response snapshots keep their existing ordering and validation.

## Measurements

A native offscreen AppKit drawing fixture used an 1100 × 800 point surface, identical placeholder icons, 24 draws and 20 retained timing samples after warmup. These measurements isolate navigator drawing; they exclude browser rendering, accessibility window pairing and display presentation.

| Loose tabs | Before, median | After, median |
| ---------- | -------------: | ------------: |
| 30         |        3.23 ms |       0.58 ms |
| 300        |       29.07 ms |       0.76 ms |
| 1,000      |       98.90 ms |       1.31 ms |

The 1,000-tab test retained all 1,000 accessibility actions. A separate regression checks that candidates at the beginning, middle and end remain visible and selectable without changing the active page.

In real isolated Helium with 60 blank tabs, 20 spaced updates to the automatic discard policy triggered **20 snapshots before and zero after**. Snapshot median latency was 1.5 ms before and 0.7 ms after in these short samples, but query timings vary and the snapshot implementation itself was not optimized. The repeatable improvement is removal of unnecessary queries and messages.

## Deliberately unchanged

- Accessibility window checks remain on the input path. Caching them without a reliable invalidation source could route keys into the wrong window.
- Group commits still verify live state between mutations. Reducing those reads requires separate race and rollback qualification.
- Search retains its 80 ms debounce and bounded displayed results. No search bottleneck was reproduced in this review.
- Restoration hashes and favicon caches keep their existing bounds. Snapshot measurements did not justify more retained cache state.
- The companion still uses one reveal deadline, event-driven snapshots and attachment checks on reveal. No polling loop was added.

These results do not establish whole-browser speedups, battery savings, VoiceOver acceptance or performance on other machines. Runtime coverage and distribution limits are recorded in [Qualification](QUALIFICATION.md).

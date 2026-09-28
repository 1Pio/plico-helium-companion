# Architecture

Plico is two small components around stock Helium. The browser remains responsible for rendering, profile data, extensions and updates.

```text
Helium tabs and groups
        │ browser APIs
MV3 background bridge ─── native messaging ─── AppKit companion
        │                                       │
profile-local memory                 C++ gesture router + draft model
                                                │
                                     native navigator and composer
```

## Responsibilities

| Module                                                   | Owns                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `plico/core/navigator_model.*`                           | Candidate selection, fixed slots, draft ordering, MRU and commit representation. No browser APIs.   |
| `plico/core/gesture_router.*`                            | Modifier lifetime, reveal deadline, held/latched modes, cancellation and emitted intent. No AppKit. |
| `native/companion.mm`                                    | Native-message lifecycle, validation, browser/window pairing, input tap and request reconciliation. |
| `native/navigator_view.mm`                               | Navigator drawing, geometry, hit testing and scrolling.                                             |
| `native/composer.mm`                                     | Search input, grouped results, selection and submission.                                            |
| `native/presentation.*`                                  | Shared material, colors, panel and result-cell presentation.                                        |
| `native/protocol.h`, `preferences.h`, `keymap.h`         | Bounded data validation, settings and native key mapping.                                           |
| `extension/background.mjs`                               | Serialized browser actions, snapshots, connection state and icon delivery.                          |
| `extension/group-slots.mjs`, `window-memory.mjs`         | Native group adoption, fixed-slot identity and durable restoration.                                 |
| `extension/model.mjs`, `back.mjs`, `debugger-status.mjs` | Browser-side validation, destination parsing, guarded opener fallback and observation-only status.  |
| `scripts/install.py`, `update.py`                        | Receipt-verified installation, exchange, recovery and removal.                                      |

## Selection and organization

The model distinguishes the actual active tab from a pending candidate. Held navigation never activates intermediate tabs. Organization changes remain a draft until commit; Escape drops the draft. Immediate close/mute actions have separate acknowledgments and reconciliation because they cannot be rolled back by canceling a draft.

The extension checks a commit against current browser state before applying it. Browser APIs are not transactional: grouping, moving and activation happen through multiple calls. External edits invalidate stale drafts rather than being silently overwritten. Restoring adopted group slots across restart requires an exact unique signature; ambiguous matches are not guessed.

## Causality and trust

Native messaging uses bounded length-prefixed JSON. The native entrypoint accepts only the configured extension origin. Both peers enforce version, session epoch, revision, request and target identity. Late responses from an obsolete gesture or connection do not become new intent. Timeout and disconnect cancel pending UI state.

The app verifies that Helium is foreground and the accessibility window matches the browser snapshot. An unavailable or mismatched window is not permission to intercept keys. The composer owns its editing keys; ordinary page editing shortcuts pass through. Secure Input remains an OS boundary.

## Work while idle

Relevant browser events coalesce snapshots, including while a queued query is in flight. Events arriving during the query request one trailing refresh. Reveal uses a single scheduled deadline rather than a polling loop. Attachment metadata is sampled on reveal, not polled continuously. Favicons are bounded and cached; native icons are capped. Navigator drawing skips offscreen pixels while retaining all navigation and accessibility targets. Shared placeholder/audio symbols are reused only within a draw. Performance qualification should measure the complete native/bridge behavior rather than infer zero overhead from these choices. See [measured changes and review scope](PERFORMANCE.md).

## Contributor tools are separate

The isolated launcher creates a marked profile and origin-restricted host registration. Qualification uses a separate extension copy with explicit test exports. Product packaging must include only `extension/background.mjs` as its worker, never the qualification copy. Native test input verifies the marked browser PID, foreground state and owned companion before sending predefined events.

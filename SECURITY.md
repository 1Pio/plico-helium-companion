# Permissions, privacy and security

Plico communicates locally between its Helium extension and a native macOS companion through Chromium native messaging. It has no analytics service, account or Plico cloud endpoint. Opening URLs and web searches naturally uses Helium's network behavior.

## Why these permissions exist

| Permission             | Purpose                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Accessibility (macOS)  | Read the focused browser window and intercept the paired navigation gesture; display native panels. |
| `tabs`, `tabGroups`    | List titles/URLs/state, switch and organize tabs, preserve native group information.                |
| `nativeMessaging`      | Connect only to the registered Plico native host.                                                   |
| `storage`              | Profile-local settings, MRU and stack restoration metadata.                                         |
| `history`, `bookmarks` | Search local destinations in the composer.                                                          |
| `search`               | Use Helium's configured search engine.                                                              |
| `favicon`              | Obtain browser-provided icons for displayed tabs.                                                   |
| `debugger`             | Call `getTargets` to observe attachment metadata when the navigator opens.                          |

Chromium displays a powerful debugger warning. Plico's product code never calls debugger attach, detach or sendCommand, never identifies an external agent, and offers no agent stop controls. This is a code-level restriction, not a narrower browser permission. There are no all-sites host permissions or page content scripts.

Tab URLs and titles cross the local native channel to render the navigator. Settings and restoration metadata stay in the extension's local storage. Debug logging and isolated qualification data are contributor-only and must not be published with a release.

## Boundaries

The native host checks the extension origin. Messages are length-bounded and validated for protocol version, epoch, revision, request ID and window/tab identity. Commands are an allowlist, never arbitrary shell or page-provided instructions. Foreground window pairing is checked before intercepting input. Stale organization drafts are canceled when browser state changes.

Accessibility is a powerful OS grant. Only enable the app you built or obtained from a release you trust. The current source-build release is not notarized and does not include any private signing key. Plico does not modify TCC, disable Secure Input or patch Helium.

## Reporting

For a suspected vulnerability, use GitHub's private vulnerability reporting if enabled for this repository. Otherwise contact the maintainer through their public GitHub profile to arrange a private channel. Do not put credentials, private browsing data or a working sensitive exploit into a public issue. Include the Plico/Helium version, minimal reproduction and the violated boundary.

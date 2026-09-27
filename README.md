# Plico Helium Companion

**Find your next tab before leaving the one you're on.**

Plico adds a native, keyboard-first navigator to [Helium](https://helium.computer/) on macOS. Hold Command, explore your tabs and stacks, then release to switch. Your pages stay put while you decide.

![Plico navigator: loose tabs, a four-tab stack and collapsed stack previews](docs/media/navigator.png)

![Hold Command, explore candidates, release to switch; Escape cancels](docs/media/navigation.gif)

[Watch the navigation demo](docs/media/navigation.mp4) · [Stacks and quick sorting](docs/media/stacks.mp4) · [Search](docs/media/composer.mp4) · [A larger workspace](docs/media/busy.mp4)

### A little room to think

- **Preview, then commit.** Move with arrows or H/J/K/L. Release Command to switch; Escape cancels the whole navigation or organization draft.
- **Fold tabs into stacks.** Add Shift to move a tab. Sort into a numbered stack without following it. Existing Helium groups keep their names and colors.
- **Open a destination, not an empty tab.** Command+T brings up a floating search field for the web, open tabs, history and bookmarks. A new tab appears only when you submit a new destination.

Helium continues to own your pages, cookies and extensions. Plico is a small companion app and extension, not another browser or a Chromium fork.

## Install

**0.4.0 is a private review candidate; public release is pending review.** The distribution path is a **local source build**, not a notarized app download. You need stock Helium, macOS and Apple's Command Line Tools. You do not need a paid developer account, Node.js or a Chromium build.

1. Open Helium once. Install Apple's tools if needed: `xcode-select --install`.
2. For this review candidate, clone this repository or download its source ZIP, then enter that folder. Versioned release downloads will follow review.
3. In Terminal, enter the extracted folder and run `bash Install.command`.
4. Follow the printed steps to load Plico's extension and grant the companion Accessibility permission.

The script builds on your Mac and installs separate copies. It never patches Helium or replaces your browser profile. Read the [installation guide](docs/INSTALLATION.md) for exact steps, signature limitations, updates, rollback and uninstall.

**Try it:** focus Helium, hold **⌘** for a moment, press **→**, then release **⌘**. The highlighted candidate becomes the active page. Press **Esc** before release to stay where you were.

## A few keys go a long way

| Intent                                    | Default shortcut                                    |
| ----------------------------------------- | --------------------------------------------------- |
| Show and explore                          | Hold **⌘**, then **← ↓ ↑ →** or **H J K L**         |
| Keep the navigator open                   | **⌘B**; repeat or tap **⌘** to commit               |
| Rearrange the candidate                   | Add **Shift** to movement                           |
| Visit a stack                             | **⌘1–9**                                            |
| Sort into a stack, selection stays behind | **⌘⇧1–9**                                           |
| Recent tabs                               | Hold **Control**, press **Tab**; **Shift** reverses |
| Search or open                            | **⌘T**                                              |
| Edit the current URL                      | **⌘;**                                              |
| Copy the current URL                      | **⌘⇧C**                                             |
| Close / mute the candidate                | **⌘W** / **⌘M**                                     |

Close and mute happen immediately; Escape does not undo them. Stack 10 is available through navigation and can have its own shortcut. Command+0 remains Helium's zoom reset. [All behavior and settings →](docs/USAGE.md)

## A place for everything

![Navigate within stacks and sort loose tabs without following them](docs/media/stacks.gif)

Stacks use Helium's native tab groups. Their numbers stay fixed, empty slots stay out of the way, and each stack remembers its last visited page.

![A detached search field with grouped open-tab, recent and bookmark results](docs/media/composer.png)

Search results show where an open tab lives. Choose it to switch, or submit your query to the default search engine. Dismissing the field creates nothing.

## Permissions and limits

Plico uses Accessibility to intercept navigation while its paired Helium window is focused. The extension reads tab/group metadata and searches your history/bookmarks locally. Chromium's broad `debugger` permission is used **only to observe whether a debugger is attached**; Plico never attaches, detaches or sends debugger commands. [Permission details →](SECURITY.md)

Password fields can enable macOS Secure Input and block movement shortcuts until you leave the field. Pinned-tab organization and windows with more than ten native groups are unsupported. Qualified on **macOS 26.6** with Apple Silicon and Helium 0.17.2.2. Intel, other browsers and broad OS compatibility are not qualified. [Qualification scope →](docs/QUALIFICATION.md)

## Develop

Native AppKit presentation, a C++ navigation model, and a small Manifest V3 bridge. No browser engine build.

- [Build, test and contribute](docs/DEVELOPMENT.md)
- [Architecture and safety invariants](docs/ARCHITECTURE.md)
- [Changes](CHANGELOG.md) · [Security](SECURITY.md) · [GPL-3.0 license](LICENSE)

The navigation model and gesture router originate in [plico](https://github.com/1Pio/plico), under GPL-3.0-only. Helium and Chromium are separate upstream projects. Plico Helium Companion is independent of Helium.

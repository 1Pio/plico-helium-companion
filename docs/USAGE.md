# Using Plico

## Hold, explore, release

Holding Command alone reveals the navigator after 150 ms by default. A navigation shortcut reveals it immediately. Left/right or H/L moves across loose tabs and stacks; up/down or K/J moves inside a stack. Both directions wrap. The highlighted candidate is a preview: the browser page changes only when you release the gesture's modifier.

A small dot marks the page still visible. Escape cancels the candidate and pending organization. Ordinary shortcuts such as Command+C dismiss the navigator and continue to the current page.

Command+B keeps the navigator open for keyboard or mouse use. Click a tab to activate it. Click empty space or press Escape to cancel. Repeat Command+B or tap Command alone to commit. Horizontal scrolling reveals an overflowing bar; vertical scrolling explores a stack.

## Organize

Loose tabs occupy the left side, stacks the right. New tabs start loose. Ten fixed slots keep their numbers; empty stacks disappear, and one-tab stacks remain stacks. A stack remembers its last active member. Collapsed stacks preview their two most recently used members.

Add Shift to movement to reorder the candidate or move it between loose tabs and stacks. These changes are previews until release. Escape cancels the whole draft. Movement can enter an empty stack slot.

Command+Shift+1–9 sorts the candidate into that slot and leaves selection on the next tab in its source list. This makes repeated sorting possible without following each tab. Normal Command+1–9 visits the remembered member. Stack 10 has no default shortcut; configure one in settings. Command+0 always remains zoom reset.

Existing native Helium groups are adopted into slots while preserving names, colors and collapsed state. If another browser action changes grouping during a draft, Plico cancels the stale draft. A multi-step commit uses separate browser API calls, so it is not an atomic browser transaction. Pinned-tab organization and more than ten groups in one window are unsupported.

## Recent tabs and destinations

Hold Control and press Tab to walk the recent-tab order; Shift reverses. The page stays unchanged until Control is released.

Command+T opens a floating destination composer. Type a URL, search query, open-tab title, bookmark or history entry. Arrow keys select a result, Enter submits, Escape or a click outside cancels. A new tab is created only for a new destination. Selecting an open result switches to that existing tab.

Command+semicolon edits the current tab's URL. Command+Shift+C copies its full URL. Default-engine searches are delegated to Helium.

Command+Backspace goes back in browser history. With no history, an eligible child tab can return to its still-open opener and close. Page text fields retain their normal Backspace editing behavior; arbitrary browser errors do not trigger closing.

## Immediate actions and status

- Command+W closes the candidate when the navigator is open. Browser before-unload confirmation still applies.
- Command+M toggles the candidate's audio mute.
- A speaker indicates playback; a crossed speaker remains while muted, even after playback stops.
- A blue outline means a debugger was attached at the most recent navigator reveal. It does not identify an agent or provide stop controls. Reopen to refresh.

Close and mute are immediate actions and are not undone by Escape.

## Settings and input fields

Open Settings from the extension popup. Choose System, Light or Dark appearance, change the reveal delay, remap letter actions, and assign digit/modifier combinations to stack slots. Settings are stored in this Helium profile.

Dedicated navigation intentionally takes precedence over Command+movement in ordinary page inputs and loading tabs. Plain arrows and ordinary editing remain available. Plico's own composer keeps text-editing keys. Password fields may enable macOS Secure Input, blocking external movement until focus leaves the protected field. Plico does not bypass that protection.

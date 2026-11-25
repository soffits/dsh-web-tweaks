# Queue

## Custom CSS

### Edge to edge

- Rare: a toast that DSH anchors to a control carries an inline `left` only, so the popup rule (inline `top` and `left`) does not move it back; on a phone with a left inset in landscape it sits off by that inset. Needs a per-axis rule.
- Rare: DSH's floating dock panes are placed through custom properties, not inline `top` and `left`, and are not moved back.
- Likely on phones with side insets, default shell insets: DSH fits a popup to the window, so one pushed against a screen edge reaches past `body` and is clipped by up to the inset's width. The clean fix is upstream (UPSTREAM.md, second report); `overflow-clip-margin` would do it here once Safari has it.

### Reports and recovery

- Rare: the recovery experiment takes any home-screen app laid out smaller than its window for the stale state (a split-screen window on a tablet might be), and would run its tries there.
- Rare: with `report` off and a page that never leaves the front, a changed setting waits for the next time the page is hidden and shown.
- Rare: a first stylesheet whose request hangs while the page stays in front is only replaced once the page has been hidden and shown; the browser's own timeout ends it sooner on most networks.
- Rare: while DSH cannot be reached, every touch a few seconds apart tries the stylesheet again and adds one to `unsent`.
- Not explained: on an iOS home-screen app, some freshly loaded pages fetched the stylesheet and then sent neither a report nor the question about the revision, while a reload a quarter of an hour later did both; not reproduced in desktop WebKit. The stylesheet lines and `unsent` are there to tell which step is missing the next time.


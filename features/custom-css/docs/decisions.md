# Decisions

## Overflow fix

- `body` is clipped in normal flow (`position: relative; overflow: clip`), never `position: fixed`: a fixed body moves the whole app into a layer iOS positions on its own, which drifts from where taps land after a rotation or resume; the relative clip stops document scrolling just as well (checked in WebKit and Chromium).

## Edge to edge

- Whether iOS lets a home-screen app draw under the status bar is not ours to decide: on the one phone measured, a fresh icon got the bottom edge (the home indicator's inset is reported) and nothing else, the window staying short by the status bar. No manifest member changes that on iOS (WebKit bugs 264220, 301994, 317153), so none is swapped in. The setting stays for the systems that grant it and for the bottom edge.
- client.js sets `viewport-fit=cover`, `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style: black-translucent`, and puts the head back on unload. The second tag is there because the recipe measured to work on current iOS has all three (WebKit bug 317153), and a wrong guess costs the user another re-install of the icon.
- One box holds everything: `body` is inset by `--edge-shell-*` margins and, through an identity transform, is the containing block of fixed boxes too. Padding the shell (`#root`) alone would miss everything portalled to `body`, and DSH's settings sheet is `position: absolute` on `body` at narrow widths, so the box has to be `body` itself.
- `html` as the containing block of fixed boxes with `body` free to be larger (overlays safe while the shell uses a strip) was tried and dropped: in Chromium a fixed box that reaches past the window then makes the document scrollable again, which is the bug the overflow fix exists for (WebKit does not). With `body` as the box, its `overflow: clip` covers fixed boxes as well. `contain: paint` on `html` does not stop the scrolling in WebKit once `body` no longer clips.
- The insets enter only as `env()` inside custom properties, never as numbers copied by script, so a rotation needs nothing from us. `--edge-shell-*` is separate from `--edge-inset-*` so that user CSS can let DSH into a strip and still read the real inset to move a control aside; the properties also let a desktop test stand in for a phone.
- No script-side recovery for stale insets after a rotation: CSS `env()` follows the rotation on current iOS (WebKit bug 191363 reads fixed since 16.4), and a script-side copy would be the one thing that can go stale.
- DSH's popups are recognised by how they are placed (children of `body` with inline `top` and `left`), because that is the property the rule corrects and they share no attribute (`role` is menu, dialog or absent). The probe places its own marks with `inset`, measured from `body`, so the rule passes them by. The rule moves popups with margins, not `translate`: DSH's popup classes set no margins of their own, and a translate of zero still changes how WebKit rasterises a popup at a fractional position, so the setting would not be pixel-identical where the insets are zero.
- Safe-area helper libraries were looked at and not used: they are utility classes for an app's own markup, and DSH's markup is not ours, so the work has to happen at the root boxes.

## Settings and the browser half

- Every setting client.js acts on is a custom property of the root element in the served stylesheet: one source, and a setting arrives together with the rules it belongs to.
- An open page learns of a changed setting by comparing revisions: the stylesheet carries one (a hash of the browser half's build and the config), the Host answers it in a header of its own and in every report answer, and the page asks when it comes to the front (`visibilitychange`, `pageshow`) or back online. Not as `etag`: a proxy that compresses the answer rewrites entity tags, and the page then took every answer for a new revision and loaded the stylesheet again each time it came to the front. A newer stylesheet is linked beside the old one and replaces it once loaded, so no rule is missing in between. DSH's own swap of a plugin's browser half fires only when the bundle file changes, not its config, and a stream from the Host would hold a connection open in every page for something that changes a few times a year.
- The features follow what the stylesheet in the page says, read when a stylesheet finishes loading and again whenever the page is shown or touched. A load event is the usual moment, not a condition: one that never comes, or settings read too early, would otherwise leave a page without its features for good.
- A page asks for the revision whatever its own stylesheet says. DSH swaps a linked plugin's browser half the moment its file changes, seconds before the Host half restarts, so new code can find itself with a stylesheet from the old Host half that names no revision; treating that as "nothing to compare" left such a page behind until a reload. While the stylesheet names another build than the running code, a touch asks too (at most every few seconds), since such a page may never be hidden and shown.
- No state can keep a page from trying again: a stylesheet that was still loading when the page was put away is replaced when it comes back, and a second copy of the module is recognised by this plugin's own stylesheet link, not by an element id anything in the page could carry.
- The browser half names its build by hashing its own factory's text, and the Host computes the same name from client.js, so a report says whether the page runs the current copy. A hand-kept version constant would be forgotten.
- client.js is one file past 500 lines: DSH loads a plugin's browser half as a single module and the plugin has no build step.
- The routes stay owner-only. Behind a sign-in plugin every signed-in person reaches DSH with DSH's own cookie, as the owner, so the rule already means "signed in".

## Reports

- Reporting and the panel are two settings. `report` draws nothing and is the one to leave on while looking into a device; `probe` puts the panel on every screen that has the page open. Both default to off: a page sending device details anywhere, even to its own Host, is something to turn on knowingly.
- One reader produces the readings for both, so the panel and the reports cannot disagree.
- A request to the Host that fails is never dropped silently. The page counts it (with the first time and the last failure, a lost report included) in `localStorage` and the next report that arrives carries the count as `unsent`. `localStorage`, not memory: what follows a refusal is usually a new page (a sign-in, a reload, the app started again), and that page is the one that can tell.
- The Host writes a line per stylesheet request while `report` is on, with the name the page gave itself (`?p=`), the same name its reports carry. Without it a page whose features never start is indistinguishable from a page that was never opened. Refused requests go to the Host's log, not to the report file: anyone who can reach the port could otherwise fill the file.
- `keepalive` only on a report sent while the page is hidden. It exists to let a line outlive its page, and browsers ration it (64 KB in flight), so lines sent from a page in front are ordinary requests.
- A page keeps one id and one line counter for its lifetime; new settings restart the features, not the series (`settings` is the first line after them).
- Lines go to `<DSH home>/custom-css/reports.jsonl`, the place DSH plugins keep state, readable by the user only, and bounded by rotating once at 512 KB. A reading is about 1 KB, so that is some hundreds of rotations of a phone.
- A burst gives a line at its first event, at quiet and once late: a rotation fires several events over half a second and iOS may settle after the last, and the first and settled states are the two worth comparing.
- Taps are reported only for a while after a burst or while the page is stale, and elements are named by tag, label and box, never by their text.

## Recovery experiment

- The stale state is recognised by what the page itself reports (a negative scroll offset, or a home-screen app whose layout is smaller than its window). `screen` cannot be used: a folding phone reported its other display's size.
- A layout iOS gives a page it holds in the background is not the stale state. A home-screen app loaded or kept while hidden can sit at a window that is short of the visible one (on the phone measured, the full width but short by the status row), and no page ever came to the front at that size, so it is left alone: tries there would run on a page nobody sees.
- Tries run in the order the setting lists, each with a reading before and after, because the point is to learn which one helps on a device nobody here can hold.
- `cover` copies numbers by script (the visual viewport's position and size onto `body`), which the rest of the plugin avoids: no CSS value exposes the visual viewport's offset in the document. It is redone after every event and removed when the state clears.
- `reload` runs once per stale state, remembered in `sessionStorage`, so a reload that does not help cannot loop.

## Viewport probe

- Tap marks and the panel are drawn absolutely in the document, not in a fixed layer, so a mark away from the finger shows a real offset between drawing and hit-testing rather than one introduced by the probe itself.

# dsh-custom-css

Custom CSS for the DeepSeek Harness (DSH) Web UI, as a small plugin with no dependency on any other plugin.

- **Your own CSS.** Put a stylesheet in the `css` field of the plugin row; it is applied to the whole page.
- **Overflow fix, on by default.** DSH's page sets `html, body, #root` to `height: 100%` and clips nothing, so anything that sticks out past the window makes the whole document scrollable, and the app header scrolls away (seen after a disconnect and reconnect). The fix clips `html` and `body` to the window, keeping `body` in normal flow (a fixed `body` gets drawn away from where taps land on iPhones after a rotation). Details: [UPSTREAM.md](UPSTREAM.md).
- **Edge to edge, off by default.** For DSH as a home-screen app on a phone: the page asks for the whole screen, reaching under the status bar and the home indicator, and DSH keeps inside the safe area by itself. How much of the screen iOS then hands over differs between versions. See [Edge to edge](#edge-to-edge).
- **Reports, off by default.** For layout and tap problems on a device you cannot look at: each open page sends what its browser reports (window, viewport and screen sizes, safe-area insets, display mode) to your DSH, on load and whenever it changes, and a few taps after each change. Nothing is drawn. See [Reports](#reports).
- **Viewport probe, off by default.** The same readings drawn over the page, with a ring where each tap lands, so one screenshot shows whether drawing and tapping agree.

## Installation

```bash
dsh plugin --profile web add github:soffits/dsh-custom-css
```

or add the bundle in the Web UI's plugin manager. A local checkout works too: `plugin_manager install_bundle` with the folder as the target.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `fixOverflow` | `true` | Apply the built-in fix that keeps the whole page from scrolling. |
| `edgeToEdge` | `false` | Take the whole screen on a phone and keep DSH inside the safe area. An installed home-screen app has to be added again. |
| `report` | `false` | Have open pages send their readings to DSH, which keeps them in `custom-css/reports.jsonl` under the DSH home. |
| `probe` | `false` | Draw the readings over the page. It shows on every device that has the page open; turn it off again when done. |
| `recover` | empty | Experiment: what to try when an iOS home-screen app comes back from a rotation with an empty band. See [Reports](#reports). |
| `css` | empty | Your CSS, added after the fix, so it can override it. |

A changed setting reaches an open page the next time it comes to the front (a tab switched back to, an app reopened), without a reload; with `report` on, also at its next report. The same goes for an update of the plugin itself: a page that got the new browser half before DSH restarted the plugin catches up at the next touch. The stylesheet is served uncached from `/custom-css/style.css` to the signed-in owner only.

## Edge to edge

DSH's page does not ask a phone for the whole screen, so for a home-screen app iOS keeps the page inside the safe area and owns that inset. After a rotation or a return from the background iOS can leave the inset of the other orientation in place: the page starts a status bar's width away from the edge with a blank band, or taps land beside where things are drawn, until the app is restarted. It shows most on a phone whose status bar sits beside the page in landscape and above it in portrait.

With `edgeToEdge` on, the page asks for the whole screen (`viewport-fit=cover`, and for a home-screen app the status bar drawn over the page). Where iOS grants it there is no system inset left to go stale; where it does not (see [Limits](#limits)), the setting changes nothing along that edge. The plugin then keeps DSH clear of the status bar and the home indicator with the browser's own live `env(safe-area-inset-*)` values: the shell, dialogs, menus, toasts and plugin overlays all stay in one box, and the strips outside it take the app's background. In a desktop browser or an ordinary tab the insets are zero and nothing changes.

### Turning it on

1. Set `edgeToEdge: true` on the plugin row and reload the page.
2. A home-screen app that is already installed has to be added again: iOS decides how the status bar is drawn when the icon is added, not when the app starts. Open DSH in Safari, wait until it has loaded, use Share → Add to Home Screen, then delete the old icon.

A home-screen app has its own storage, separate from Safari's and from the old icon's. The new one starts empty: you sign in again, and whatever DSH or its plugins keep in the browser (drafts, layout choices such as panel sizes, pairings, offline copies) is gone. Everything on the server stays.

Turning the setting off later works the other way round: an icon added while it was on keeps the status bar over the page, so add the icon once more.

### Using the strips

The plugin's default leaves the strips empty. Your own CSS can give parts of them to DSH. Two sets of custom properties on the root element:

| Property | Meaning |
| --- | --- |
| `--edge-inset-top`, `-right`, `-bottom`, `-left` | The safe-area insets as the browser reports them now. |
| `--edge-shell-top`, `-right`, `-bottom`, `-left` | How far DSH stays from each screen edge. Default: the inset on that side. |

Lower a shell inset to let DSH into that strip, then move aside what must stay readable and tappable there. For a phone with the status bar in a column on the right in landscape:

```css
@media (orientation: landscape) {
  :root { --edge-shell-right: 0px; }
  header[data-window-drag] { border-right: var(--edge-inset-right) solid transparent; }
}
```

Now the conversation and the composer use the full width and only the header row steps aside. Dialogs and other overlays follow the box, so give them the same treatment if they would reach the status items (`body > [role="presentation"]` is DSH's dialog layer). To try a layout on a desktop, give the insets numbers for a moment: `:root { --edge-inset-right: 60px; }`.

### Limits

- The status items are drawn in white over the page (that is the only over-the-page style iOS offers). On a light theme they are hard to read unless something dark sits behind them.
- DSH places its menus and popovers itself, in window coordinates, and fits them to the window, not to the safe area. The plugin moves them back to their triggers, but one that DSH had to push against a screen edge can be cut off by the strip's width.
- An overlay that sizes itself with `100vh` or `100dvh` is as tall as the screen, not as the box; it gets clipped at the box edge. `height: 100%` fits.
- iOS decides whether a home-screen app may draw under the status bar, and recent versions often say no, whatever the page declares (WebKit bugs [301994](https://bugs.webkit.org/show_bug.cgi?id=301994), [317153](https://bugs.webkit.org/show_bug.cgi?id=317153); the manifest's `display: fullscreen` does not do it either, [264220](https://bugs.webkit.org/show_bug.cgi?id=264220)). Measured on one current phone with a freshly added icon: the page reached the bottom edge and got the home indicator's inset, but the status bar stayed outside it, with the window short by the bar and the insets on that side zero. There the setting cannot remove the stale inset after a rotation. `report` shows what a device does: a `window` as large as the screen and a non-zero inset on the status bar's side mean it worked.

What DSH itself could change to make this unnecessary is in [UPSTREAM.md](UPSTREAM.md).

## Reports

With `report` on, every open page posts a reading to `/custom-css/report` and DSH appends it, one JSON object per line, to `custom-css/reports.jsonl` under the DSH home (`~/.dsh` unless `DSH_HOME` says otherwise). At 512 KB the file becomes `reports.old.jsonl` and a new one starts, so the two never hold more than about 1 MB. Only the signed-in owner's pages are listened to.

DSH also writes a line each time it serves a page the stylesheet (`"event": "stylesheet"`, with `method`, the page's id and its user agent), so a page that loaded the stylesheet and then never reported shows as exactly that. A request it refuses (not signed in, not a report, too large) goes to DSH's log as method, path and status.

A page reports when it loads and after every resize, rotation, show or hide: once at the first event of a burst, once when it has gone quiet (`settled`, with the events it saw) and once more if anything still moved a few seconds later (`late`). For half a minute after a burst it also reports up to twenty taps: where the finger was in the window and in the document, the element that got the tap, and the element drawn at that point.

Each line holds:

| Field | Meaning |
| --- | --- |
| `at`, `t`, `ms` | When DSH got it, the page's own clock, and milliseconds since the page loaded. |
| `page`, `seq` | One id per page load and a counter within it, to read a rotation as a series. The id is the `p` of the page's stylesheet requests. |
| `event`, `events` | What caused the line. `load` is a page's first line, `settings` the first after new settings reached it. |
| `window`, `html`, `visual`, `screen`, `dpr` | Window size, layout size, visual viewport (size, offset, position in the document, scale), screen and orientation. |
| `insets` | The safe-area insets, top right bottom left, measured from `env()`. |
| `body`, `root`, `scroll` | Where DSH's boxes are and how far the window is scrolled. |
| `standalone`, `display`, `visibility`, `fps` | Home-screen app or not, display mode, visible or hidden, frames per second during the burst. |
| `meta` | The viewport and status-bar tags as they are in the document. |
| `popups` | Open menus and popovers: where their inline style puts them and where they are. |
| `stale` | The page is scrolled to a negative offset, or a home-screen app is laid out smaller than its window. |
| `settings`, `revision`, `build`, `client`, `current` | The settings the page runs with, and whether its stylesheet and its copy of the plugin are the current ones. |
| `ua` | The browser's user agent. |
| `tap` | For a tap: `client`, `page`, `target`, `inside` (the point lies in the target's box) and `drawnThere`. |
| `unsent` | Only after trouble: how many requests to DSH failed since the last line that arrived (`count`, `since`), and the last of them (`last`: `what` is `report`, `stylesheet`, `revision` or `start`, `error` what the browser said, such as `HTTP 401`, and for a report the `line` that was lost). |

No page content is sent: elements are named by tag, label and box.

A page counts what it could not send in its browser's storage, so the count survives a reload, a new sign-in or the app being started again, and the next line that gets through carries it. A stretch with no lines at all therefore reads one of three ways: `unsent` on the next line (the page tried and was refused or offline), stylesheet lines without reports (the page got the stylesheet and its features did not start), or nothing (the page never asked DSH for anything).

### The recovery experiment

An iOS home-screen app can come back from a rotation with the window at its new size but the page still laid out for the old one: short by the status bar's old inset and scrolled to minus that inset, which shows as an empty band (`stale` in the reports). `recover` lists what a page should try when it sees this, in order, until the state is gone:

| Try | What it does |
| --- | --- |
| `meta` | Changes the viewport tag and puts it back. |
| `style` | Changes the root's height for a moment and forces a layout. |
| `scroll` | Scrolls the window and back. |
| `reload` | Reloads the page, once per stale state. |
| `cover` | Leaves the layout alone and gives DSH's box the visible area for as long as the state lasts. Later tries are not reached, so list it last. |

Each try is reported as `before:<name>` and `after:<name>`, so one rotation tells which of them helped. It is an experiment: none is known to work, and a window that is legitimately smaller than its layout would set it off.

## Development

`npm test` runs the unit tests, `npm run check` checks syntax.

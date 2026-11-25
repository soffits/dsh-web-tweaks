# Suggested reports for DSH's Web UI

Two suggested bug reports for deepseek-ai/deepseek-harness (issues are disabled there, so they are not filed). Seen on DSH 0.2.2-rc.1, Web UI. The plugin works around both; when DSH fixes one, the workaround goes and this file says so.

# 1. The whole page can be scrolled (after a reconnect)

## Problem

After the connection to the server drops and comes back, the whole page can be scrolled: the app header and sidebar move out of view and an empty area shows, as if the document had grown past the window.

## Cause

The shipped stylesheet (`@deepseek-ai/dsh-web-frontend`, `dist/assets/index-*.css`) has

```css
html,body,#root{height:100%;margin:0}
```

and nothing sets `overflow` on `html` or `body`. The page is only as tall as the window while everything inside it fits. As soon as any element, in or out of flow, ends below the window edge, the document becomes scrollable, and anything that scrolls the page (`scrollIntoView`, focus, the on-screen keyboard on a phone, wheel or touch over a non-scrolling area) moves the entire app. The app is a fixed-size shell with its own scroll areas, so the document should never scroll.

Which element sticks out after a reconnect was not pinned down: I could not reproduce it in headless Chromium (desktop 1280x800 and 390x844 touch viewports) with the reconnect indicator, with emulated offline/online, or with a real server restart, with a session open; the document stayed exactly window-sized throughout. So the trigger is probably specific to a browser (mobile Safari with its dynamic toolbar and keyboard is the likeliest) or to a plugin's content. The missing clip is the common point and is enough to make any such overflow scrollable.

Reproducing the symptom directly: add `<div style="position:absolute;top:calc(100vh + 120px);height:60px;width:100%">` to `body` and call `scrollIntoView()` on it. `document.scrollingElement.scrollTop` becomes 180 and the header disappears. With the fix below it stays 0.

## Suggested fix

Take the document out of the scrolling business:

```css
html { overflow: hidden; overscroll-behavior: none; }
body { position: relative; overflow: clip; overscroll-behavior: none; }
```

`overflow: hidden` on `html` alone is not enough, because script can still scroll a hidden viewport. `overflow: clip` on `body` cannot be scrolled at all, and `position: relative` makes `body` the box absolutely positioned elements are clipped by, so nothing reaches past the window. Checked in WebKit and Chromium with the repro above, with a fixed element below the window and with focus moving to a field far below: `scrollTop` stays 0 in every case. Layout is unchanged otherwise.

An earlier version of this fix made `body` `position: fixed; inset: 0`. That stops the scrolling too, but it puts the whole app into one fixed layer, and on iOS fixed layers are placed by the browser from its own idea of the viewport. In an iPhone home-screen app that idea can go stale after a rotation or a return from the background, so the app was drawn away from where taps landed, or shrunk with a blank band. Keep `body` in normal flow.

# 2. As a home-screen app on a phone, the page leaves the safe area to iOS, and nothing in it can take that over cleanly

## Problem

Added to an iPhone's home screen, DSH is laid out inside the safe area by iOS: `index.html` has `width=device-width, initial-scale=1` with no `viewport-fit=cover`, and nothing says how the status bar should be drawn. That inset belongs to the system, and after a rotation or a return from the background iOS can keep the inset of the other orientation: the page starts a status bar's width from the edge with a blank band beside it, or taps land away from where things are drawn, until the app is restarted. It is easiest to hit on a phone whose status bar sits above the page in portrait and in a column beside it in landscape, since every rotation moves the inset to another side.

Measured in the stale state, landscape after a turn from portrait: `innerWidth`/`innerHeight` and the visual viewport have the new size, but `documentElement.clientHeight` is short by the portrait status bar and the document sits at a negative scroll offset of the same amount (`scrollY`, `visualViewport.pageTop`), which is the blank band. The page can see that, so the frontend could at least notice and reload or re-place itself.

A page gets out of this by taking the whole screen (`viewport-fit=cover`, `apple-mobile-web-app-status-bar-style`) and padding itself with `env(safe-area-inset-*)`, which the browser keeps current, on the iOS versions that grant it; recent ones often keep the status bar outside the page whatever it declares (WebKit bugs 301994, 317153). This plugin's `edgeToEdge` setting does that from outside, and three things in the frontend make it harder than it should be.

## What gets in the way

1. Menus and popovers are placed by script as `position: fixed` boxes with `left` and `top` taken from `getBoundingClientRect()` and fitted to `visualViewport` / `innerWidth` / `innerHeight` (the anchored-panel hook, the context menu, tooltips, hover cards, the subagent menu). That is only right while the fixed containing block is the window itself. Put the app in a box that starts below a status bar (a transformed ancestor, which is also the only way to keep `inset: 0` dialogs and toasts inside the safe area without a rule per component) and every popup lands off by the box's offset; and because they are fitted to the window, not to that box, a popup pushed against an edge ends under the status bar or the home indicator.
2. The frontend already has the idea of chrome over the page, for the desktop title bar: `--dsh-frame-top-clearance`, `--dsh-frame-overlay-top`, `--dsh-frame-chrome-top`. It exists for the top edge only and is set from the platform attributes, so a phone's insets on the other three sides have nowhere to go.
3. Overlays are positioned against the window with fixed numbers (`inset: 0` dialog layers with 24px padding, the toast at `top: 40px`, the settings sheet as `position: absolute; height: 100%` on `body` at narrow widths). None of them reads a safe-area inset.

## Suggested fix

- In `index.html`: `viewport-fit=cover` in the viewport tag and `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`. In a browser tab and on desktop both are inert.
- Feed the existing frame variables from the insets on all four sides (`env(safe-area-inset-top, 0px)` and so on, added to the title-bar values), pad the shell with them, and use them in the overlay rules above in place of the bare numbers.
- Place popups relative to their offset parent (subtract its client rectangle) and fit them to the safe area, or use CSS anchor positioning, which the macOS menu backing already does. Either makes them independent of what the containing block is.

Until then the plugin keeps everything in one box on `body` and moves the script-placed popups back by the box's offset, recognising them as children of `body` with inline `top` and `left`. That selector is the fragile part: it holds as long as DSH keeps portalling its popups to `body` and placing them that way.

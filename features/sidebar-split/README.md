# dsh-sidebar-split

Resizable panes for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web UI sidebar, the way VS Code's side bar works.

Every plugin that adds a page also adds a row to the panel list at the top of the left sidebar (Plugins, Cron tasks and so on). That list never shrinks, so once a few plugins are installed the Workspaces browser underneath gets squeezed into whatever height is left, and on a phone that can be a couple of rows.

With this plugin the panel list and Workspaces become two panes with a line between them:

- Drag the line to give either pane more room. The panel list scrolls on its own once it's shorter than its rows, and Workspaces scrolls as before.
- Double-click (or double-tap) the line to hide the panel list completely, and again to bring it back. Dragging it all the way up hides it too.
- With the line focused, the arrow keys move it, Home hides the list, End shows every row, and Enter toggles it.
- Until you drag, the list takes at most half of the shared height. If it fits, nothing changes from the stock sidebar.
- The size is saved per browser (localStorage), so a desktop and a phone each keep their own, and other open tabs follow along.

On touch screens the line is a little taller and has a grab handle.

When the sidebar is collapsed to its icon rail, a short divider separates the panel icons from the workspace icons. The workspace icons always stay in view, and the panel icons scroll on their own when the window is too short for all of them (a fade at the bottom shows there are more).

## Install

```sh
dsh plugin --profile <profile> add github:soffits/dsh-sidebar-split
```

Or from a local clone:

```sh
dsh plugin --profile <profile> add link:/path/to/dsh-sidebar-split
```

Reload the Web UI afterwards. There's nothing to configure.

## How it works

DSH's sidebar doesn't have a slot around these two blocks, so the browser module finds them by structure: the `nav` panel list and the region right after it inside the sidebar. It adds one separator element, a few `data-sidebar-split*` attributes and a stylesheet, and takes all of them away again when the plugin is disabled.

That means it depends on DSH's internal layout. It's tested with DSH 0.2.2. If a later DSH renames those blocks the plugin simply finds nothing and the sidebar stays stock; open an issue and I'll adapt it.

## Development

```sh
npm run check   # syntax
npm test        # unit tests for the sizing rules
```

`client.js` is plain JavaScript in DSH's browser module format, no build step. `index.js` is an empty Host half that only makes DSH load it.

## License

MIT

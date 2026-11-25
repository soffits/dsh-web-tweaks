# Decisions

## Approach

- A client-only plugin that adds a separator and sizes the panel list by structure. DSH has no slot around the panel list and the workspaces region, its Slots API has no way to wrap an occupant, and the upstream repo doesn't take outside pull requests. Replacing the whole `sidebar` occupant would mean copying the shell and following every upstream change.
- Only the panel list gets a size; the workspaces region keeps `flex: 1` and takes the rest, so the two always fill the column and no feedback loop can start between them.
- The saved size is a share of the height both panes have, not pixels, so a window resize keeps the proportion. A share of 1 means "every row", so the list grows back when there is room again.
- The separator is named by the panel list itself (`aria-labelledby`), as the WAI-ARIA window splitter pattern asks, so it needs no strings of its own and follows DSH's language.

## Behaviour

- Default: the list takes at most half the shared height. A list that fits looks exactly as shipped, and there is no visible line until the list is cut off.
- Workspaces keep at least 96 px. Dragging the list under 24 px hides it; double-click or double-tap toggles it, since DSH has no pane headers to click.
- The icon rail (collapsed sidebar) gets the same two groups with a short fixed divider between them, but no sash: the rail is 56 px wide with 36 px icons, so a drag target there would be fiddly and a second saved size would be one more thing to manage. Workspace icons keep their natural height (they are few and must stay reachable); the panel icons take what is left and scroll, with no visible scrollbar (it would shift icons in so narrow a column) and a bottom fade while more icons sit below.

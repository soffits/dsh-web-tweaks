# Decisions

## Where the button lives
- Document preview header and unpreviewable state (`sidebar.right.tab.document.actions` / `.unpreviewable`): both pass the file's `absolutePath` and are Session-scoped, so `inject(sessionId)` gets the Session. The delivery card's `deliverables.file.actions` slot gets only an action URL with event coordinates, no path, so the card can't carry the button without a DSH change.

## How it downloads
- `ctx.fileActions.save(source, 'download')` from DSH's `ui-file-actions`, not our own blob/anchor code: it owns name/MIME normalisation, the browser hand-off and the Desktop adapter, and it is what the right-click Download runs.
- `source.read` walks `workspaceFiles.readBytes` windows (2 MiB, the Host default `maxBytes`), following a tighter `too-large` limit the Host names. A complete read is capped at `maxFileBytes` (32 MiB); windows are not.
- Feedback through `ctx.contextMenus.notify`, the shared toast the shipped Download row uses.

## Not adopted
- XJPeng12/dsh-client-ui-file-download (MIT): same placement, but written for 0.2.1 before `fileActions` existed, with its own download code and a build step; one commit, no upkeep.

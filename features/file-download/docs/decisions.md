# Decisions

## Where the button lives
- Document preview header and unpreviewable state (`sidebar.right.tab.document.actions` / `.unpreviewable`): both pass the file's `absolutePath` and are Session-scoped, so `inject(sessionId)` gets the Session.
- Delivery card (`deliverables.file.actions`): the slot gets only an action URL (Session id, event seq, file index), no path. The Session id comes from that URL; the path is read at click time from the card's own preview button `title` (the absolute path DSH sets), found with `closest('[data-presented-file]')`. Chosen over a Host route that resolves seq/index, which would need the Session log and its authorisation; if the markup changes the button does nothing rather than download a wrong file. Button is a short labelled "Download" with an icon, 28px high, so the card stays tidy on a phone.

## How it downloads
- `ctx.fileActions.save(source, 'download')` from DSH's `ui-file-actions`, not our own blob/anchor code: it owns name/MIME normalisation, the browser hand-off and the Desktop adapter, and it is what the right-click Download runs.
- `source.read` walks `workspaceFiles.readBytes` windows (2 MiB, the Host default `maxBytes`), following a tighter `too-large` limit the Host names. A complete read is capped at `maxFileBytes` (32 MiB); windows are not.
- Feedback through `ctx.contextMenus.notify`, the shared toast the shipped Download row uses.

## Not adopted
- XJPeng12/dsh-client-ui-file-download (MIT): same placement, but written for 0.2.1 before `fileActions` existed, with its own download code and a build step; one commit, no upkeep.

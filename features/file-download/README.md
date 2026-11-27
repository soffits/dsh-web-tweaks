# File download (`fileDownload`)

A feature of [@soffits/dsh-web-tweaks](../../README.md), switched by `fileDownload.enabled` in the `web-tweaks` row. Its history before the merge is in the archived [soffits/dsh-file-download](https://github.com/soffits/dsh-file-download) repository.

A Download button for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web document preview.

DSH 0.2.2 can download a Session file only from its right-click menu. On a phone or tablet there is no right-click, so a file the agent made (a zip, a PDF, an installer) can be previewed but not saved, and the visible control only opens the file on the machine DSH runs on. This plugin puts a Download button where a touch screen can reach it:

- on the card of every file the agent delivers (the `present` tool), a short Download button at its right end;
- in the preview header, for every file;
- in the empty state of a file the preview can't show.

The download is DSH's own `fileActions.save(source, 'download')`, the same operation the right-click Download runs, so the file name, type and browser hand-off match. The bytes come through the authorized `workspaceFiles.readBytes` Remote in 2 MiB windows, so files above the Host's 32 MiB complete-read cap download too (they are held in browser memory until saved).

## Limits

- The card's action slot (`deliverables.file.actions`) is given only the card's action URL, not the file, so the card button reads the file's path from the card itself (its preview button's `title`, the absolute path) when tapped. If a DSH update changes that markup, the button does nothing (it never downloads a wrong file) and the preview's Download still works.
- The DSH card also carries the open-in-app control, which acts on the machine DSH runs on. A remote home turns that plugin off (`ui-open-in-app` and `open-in-app` rows); this feature doesn't touch it.
- Very large files are assembled in memory before the browser saves them.

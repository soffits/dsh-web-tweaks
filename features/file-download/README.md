# dsh-file-download

A Download button for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web document preview.

DSH 0.2.2 can download a Session file only from its right-click menu. On a phone or tablet there is no right-click, so a file the agent made (a zip, a PDF, an installer) can be previewed but not saved, and the visible control only opens the file on the machine DSH runs on. This plugin puts a Download button where a touch screen can reach it:

- in the preview header, next to the open-in-app control, for every file;
- in the empty state of a file the preview can't show, under "Show file location".

Tap a delivered file's card to open its preview, then tap Download.

The download is DSH's own `fileActions.save(source, 'download')`, the same operation the right-click Download runs, so the file name, type and browser hand-off match. The bytes come through the authorized `workspaceFiles.readBytes` Remote in 2 MiB windows, so files above the Host's 32 MiB complete-read cap download too (they are held in browser memory until saved).

## Install

```sh
dsh plugin --profile web add dsh-file-download
```

Then restart DSH. Needs DSH 0.2.2-rc.1 or later (the `fileActions` service).

## Limits

- The delivery card itself still has no Download: its action slot (`deliverables.file.actions`) doesn't receive the file's path, so a plugin can't offer one there. Opening the preview is one extra tap.
- Very large files are assembled in memory before the browser saves them.

## License

MIT

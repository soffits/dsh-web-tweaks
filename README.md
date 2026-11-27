# dsh-web-tweaks

Small fixes and additions for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web UI, in one plugin. Each feature has its own switch and is on by default.

| Feature | Key | What it does |
| --- | --- | --- |
| [Custom CSS](features/custom-css/README.md) | `customCss` | Your own CSS for the whole Web UI, a fix that keeps the page from scrolling as a whole, and opt-in phone settings (edge to edge, device reports, a viewport probe). |
| [Sidebar split](features/sidebar-split/README.md) | `sidebarSplit` | The sidebar's panel list and the Workspaces become two panes with a draggable line between them; the split is kept per browser. |
| [File download](features/file-download/README.md) | `fileDownload` | A Download button on delivered-file cards and in the document preview, so a phone can download Session files (DSH offers download only in a right-click menu). |
| [Subagent model label](features/subagent-model/README.md) | `subagentModel` | A read-only label with the model and reasoning effort in a subagent session's composer. |
| [Session-scoped model picks](features/session-model/README.md) | `sessionModel` | A model picked in a Web chat stays in that chat instead of becoming the default for every new session. |

It adds no tools, so it can be turned on and off while sessions run.

## Install

```bash
dsh plugin --profile <profile> add @soffits/dsh-web-tweaks
```

or install the bundle `@soffits/dsh-web-tweaks` from the Web UI's plugin manager. It brings one row, `web-tweaks`.

## Settings

In the profile patch, as an override of the `web-tweaks` row. An override replaces the row's whole config, so list every feature you want to change:

```yaml
- id: web-tweaks
  config:
    customCss:
      enabled: true
      fixOverflow: true
      edgeToEdge: false
      css: |
        html { -webkit-text-size-adjust: 100%; }
    sidebarSplit: { enabled: true }
    fileDownload: { enabled: true }
    subagentModel: { enabled: true }
    sessionModel: { enabled: false }
```

The `customCss` settings are listed in [its page](features/custom-css/README.md#settings-under-customcss). With `sessionModel` on, set the default model for new sessions in the profile's `agent-default-model` row or on the Settings page.

An open page picks up a changed switch the next time it comes to the front, without a reload. The browser half asks the plugin which features are on at `/web-tweaks/features.json` (signed-in owner only, never cached).

## History

These features were five separate plugins until 0.1.0; their repositories are archived and their history is kept here under `features/`: [dsh-custom-css](https://github.com/soffits/dsh-custom-css), [dsh-sidebar-split](https://github.com/soffits/dsh-sidebar-split), [dsh-file-download](https://github.com/soffits/dsh-file-download), [dsh-subagent-model](https://github.com/soffits/dsh-subagent-model), [dsh-session-model](https://github.com/soffits/dsh-session-model). Settings carry over: the custom CSS settings move under `customCss`, and the stylesheet route (`/custom-css/style.css`), the report folder (`custom-css/` under the DSH home) and the sidebar split saved in each browser stay where they were.

## Development

```bash
npm ci
npm run build   # client.js from each feature's client.js and src/runtime.js
npm run check
npm test
```

## License

MIT

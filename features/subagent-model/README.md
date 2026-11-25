# dsh-subagent-model

In the DeepSeek Harness (DSH) Web UI, a normal session shows its model at the lower right of the composer ("Claude Opus 5.5 high"). A subagent session shows nothing there: the model picker hides itself, because a subagent's model can't be switched, and the model name goes with it.

This plugin adds a read-only label in the same spot for those sessions. It looks like the picker's trigger without the chevron and doesn't react to clicks. Normal sessions are unchanged: the shipped picker stays the only model control there.

The label reads the same per-session model selection the picker uses, so the name and the reasoning effort match what you would see in a normal session. A model the catalog doesn't list shows its id.

## Installation

```bash
dsh plugin --profile web add github:soffits/dsh-subagent-model
```

or add the bundle in the Web UI's plugin manager. A local checkout works too: `plugin_manager install_bundle` with the folder as the target. Reload the page afterwards; the plugin has no settings.

It needs `@deepseek-ai/dsh-client-ui-model-selection` and the conversation UI, both part of the standard Web app, and DSH 0.2.2-rc.1 or later.

## How it works

The composer's model seat is a slot with a single owner, so the plugin doesn't replace it. It registers its own entry in the neighbouring list slot `conversation.input.right`, which is drawn right before the seat, and renders only when the session is a subagent. Nothing from the shipped packages is patched.

## Development

`npm test` runs the unit tests (a recording React stand-in, no browser), `npm run check` checks syntax.

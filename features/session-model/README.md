# Session-scoped model picks (`sessionModel`)

A feature of [@soffits/dsh-web-tweaks](../../README.md), switched by `sessionModel.enabled` in the `web-tweaks` row. Its history before the merge is in the archived [soffits/dsh-session-model](https://github.com/soffits/dsh-session-model) repository.

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that keeps a model picked in a session in that session.

Out of the box, every pick in the Web UI's model picker is also saved as the default for new sessions (`agentDefaultModel.saveSelection` rewrites the `agent-default-model` row of the profile). Switching one chat to a smaller model for a quick job then quietly moves every session opened afterwards to that model too.

With this plugin loaded, the picker changes only the session it is in. The default for new sessions is whatever the profile's `agent-default-model` row says, and it changes only where that row is edited: the profile patch or the Settings page.

## How it works

The plugin waits for the `agentDefaultModel` service and replaces its `saveSelection` with a function that stores nothing, the same thing the service already does when no configuration editor is mounted. Unloading the plugin puts the original method back. If the default-model plugin reloads, this plugin reloads with it and covers the new instance.

This also covers the one other caller in DSH, which saves the first account model after a login when no API key is configured; set the default in the profile instead.

Upstream discussion about making this a built-in option: [deepseek-harness#13657](https://github.com/deepseek-ai/deepseek-harness/discussions/13657).

# dsh-session-model

A small DeepSeek Harness (DSH) plugin: a model picked in the Web UI stays in that session. `index.js` is the whole feature. It replaces `agentDefaultModel.saveSelection` with a no-op while loaded and puts the original back when it unloads. There is no client half and no settings.

## Rules

- Checks: `npm run check` and `npm test` (Node 22 or later).
- Touch only `saveSelection`, and restore it on unload. The default for new sessions stays whatever the profile's `agent-default-model` row says.
- If DSH stops saving the picker's choice as the default, remove this plugin and say so in the README.
- Everything in the repo (code, docs, commits) is English.
- Conventional Commits, squash merges; PR titles are Conventional Commit subjects.

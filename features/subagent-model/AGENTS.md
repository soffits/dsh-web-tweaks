# dsh-subagent-model

A client-only DeepSeek Harness plugin: a read-only model label in the composer of subagent sessions. `client.js` is the whole feature (plain JavaScript in DSH's Client module format, no build step); `index.js` is an empty Host half so the bundle has a row.

## Rules

- Checks: `npm run check` and `npm test` (Node 22 or later).
- Never replace the shipped model seat (`conversation.input.model`) or patch the shipped packages; the label lives in its own entry of `conversation.input.right`.
- Name and effort resolution mirror the shipped seat (`dsh-client-ui-model-selection`, `ModelSelect`). When that package changes how it derives them, change `describe` in `client.js` with it.
- When DSH shows the model for subagent sessions itself, remove this plugin and say so in the README.
- Everything in the repo (code, docs, commits) is English, except the locale files.
- Conventional Commits, squash merges; PR titles are Conventional Commit subjects.

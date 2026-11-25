# Decisions

Each feature's own decisions are in `features/<folder>/docs/decisions.md`; these are about the package.

## One package

- Five tiny plugins became one package with a switch per feature: five repositories, CI setups and profile entries for about 3,500 lines cost more upkeep than they gave, and when DSH fixes one of the things a feature works around, removing it is one folder, not a repository.
- One row, not a row per feature: DSH gives a browser half only to a row named by a whole package (`dsh-client-modules`), so per-feature rows from subpath exports could not carry the browser parts.
- The browser half gets no row config from DSH, so the Host answers the switches at `/web-tweaks/features.json` and the page starts only those features, each as a child plugin with its own `inject`. It asks again when the page comes to the front, like custom CSS's stylesheet revision check, so a changed switch needs no reload and no open stream.
- The features' browser modules stay in DSH's module format and are joined by a small build script instead of a bundler: each stays testable on its own, the joined file is plain and readable, and there is no dependency to keep up.
- Feature ids, routes, storage keys and state folders are kept from the separate plugins, so settings people already have carry over.

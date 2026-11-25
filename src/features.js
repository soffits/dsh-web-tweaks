/**
 * The features this plugin carries: one table that the Host config, the features route and the
 * client build all read. `folder` is the feature's place under features/; `browser` says whether it
 * has a browser part (client.js in that folder) that the page starts when the feature is on.
 */
export const FEATURES = Object.freeze({
  customCss: {
    folder: 'custom-css',
    browser: true,
    description: 'Serve your own CSS to the Web UI, with the fix that keeps the whole page from scrolling and the phone layout settings below.',
  },
  sidebarSplit: {
    folder: 'sidebar-split',
    browser: true,
    description: 'Split the sidebar\'s panel list and the Workspaces into two panes with a draggable sash; the split is kept per browser.',
  },
  fileDownload: {
    folder: 'file-download',
    browser: true,
    description: 'Show a Download button in the document preview (header and the "can\'t preview" state), so phones can download Session files.',
  },
  subagentModel: {
    folder: 'subagent-model',
    browser: true,
    description: 'Show which model and reasoning effort a subagent session runs, as a read-only label in its composer.',
  },
  sessionModel: {
    folder: 'session-model',
    browser: false,
    description: 'Keep a model picked in a Web chat in that chat, instead of saving it as the default for every new session.',
  },
})

/** Which features are on, by key, from the row's config. */
export function featureState(config) {
  return Object.fromEntries(Object.keys(FEATURES).map(key => [key, config[key]?.enabled === true]))
}

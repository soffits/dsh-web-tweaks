/**
 * Host half of @soffits/dsh-web-tweaks: one row, several small Web UI features, each with its own switch.
 *
 * Features with a Host part run as child plugins of this one (`customCss` serves its stylesheet,
 * `sessionModel` keeps model picks in their session). The browser half gets no row config from DSH,
 * so the Host answers which features are on at `/web-tweaks/features.json`, and client.js starts
 * only those (src/features.js, src/runtime.js).
 */
import z from '@deepseek-ai/schemastery'
import * as customCss from './features/custom-css/index.js'
import * as sessionModel from './features/session-model/index.js'
import { FEATURES, featureState } from './src/features.js'
import { createFeaturesHandler, PREFIX } from './src/http.js'

export const name = '@soffits/dsh-web-tweaks'
export const inject = ['webServer', 'connection']

const enabled = description => z.boolean().default(true).description(description)

export const Config = z.object({
  customCss: z.object({
    enabled: enabled(FEATURES.customCss.description),
    ...customCss.Config.dict,
  }).default({}).description('Your own CSS for the whole Web UI, the page-scroll fix and phone layout settings.'),
  sidebarSplit: z.object({ enabled: enabled(FEATURES.sidebarSplit.description) }).default({}),
  fileDownload: z.object({ enabled: enabled(FEATURES.fileDownload.description) }).default({}),
  subagentModel: z.object({ enabled: enabled(FEATURES.subagentModel.description) }).default({}),
  sessionModel: z.object({ enabled: enabled(FEATURES.sessionModel.description) }).default({}),
})

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {ReturnType<typeof Config>} config
 */
export function apply(ctx, config) {
  if (config.customCss.enabled) {
    const { enabled: _, ...settings } = config.customCss
    ctx.plugin(customCss, settings)
  }
  if (config.sessionModel.enabled) ctx.plugin(sessionModel)

  const state = featureState(config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: createFeaturesHandler({
      connection: ctx.connection,
      features: () => state,
      refused: ({ status, method, path }) => ctx.logger?.warn(`web-tweaks: refused ${method} ${path} with ${status}`),
    }),
  }), 'web-tweaks: routes')
}

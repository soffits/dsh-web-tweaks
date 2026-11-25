/**
 * DeepSeek Harness Host plugin: custom CSS for the Web UI. It serves one
 * stylesheet (the settings for the browser half, the built-in parts that are
 * turned on, then the user's own CSS from the plugin row) to the signed-in
 * owner; client.js links it into the page and acts on the settings. With
 * `report` on it also keeps what open pages say their browser reports, beside
 * a line for each stylesheet it served, so a page that fetched the stylesheet
 * and never reported shows as that.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Config } from './src/config.js'
import { createHandler, PREFIX } from './src/http.js'
import { clientBuild, createReportLog, stateDir } from './src/report.js'
import { composeStyle } from './src/style.js'

export const name = 'dsh-custom-css'
export const inject = ['webServer', 'connection']
export { Config }

const short = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 12)

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ fixOverflow: boolean, edgeToEdge: boolean, report: boolean, probe: boolean, recover: string[], css: string }} config
 * @param {{ dir?: string, now?: () => Date }} [options] - Where reports are kept, and the clock that stamps them.
 */
export function apply(ctx, config, { dir = stateDir(), now = () => new Date() } = {}) {
  const client = readFileSync(fileURLToPath(new URL('./client.js', import.meta.url)), 'utf8')
  // The build names the code a page should be running, the revision this code with these settings.
  const build = clientBuild(client)
  const revision = short(build, JSON.stringify(config))
  const style = composeStyle(config, { build, revision })
  const log = config.report ? createReportLog({ dir }) : undefined
  const keep = line => log.append({ at: now().toISOString(), ...line })
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: createHandler({
      connection: ctx.connection,
      style: () => style,
      revision: () => revision,
      report: log && (reading => keep({ current: reading.client === build && reading.revision === revision, ...reading })),
      served: log && (request => keep({ event: 'stylesheet', ...request })),
      refused: ({ status, method, path }) => ctx.logger?.warn(`custom-css: refused ${method} ${path} with ${status}`),
    }),
  }), 'custom-css: routes')
}

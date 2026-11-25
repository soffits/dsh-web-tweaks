/**
 * GET/HEAD /web-tweaks/features.json: which features are on, for the browser half (DSH hands a
 * plugin's browser half no row config). Answered only for the signed-in owner, never cached, so a
 * changed switch reaches an open page the next time it comes to the front.
 */
export const PREFIX = '/web-tweaks'
export const FEATURES_PATH = `${PREFIX}/features.json`

const HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})
const TEXT = { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' }

/**
 * @param {object} options
 * @param {{ admit: (request: { headers: object }) => object }} options.connection - DSH's connection service.
 * @param {() => Record<string, boolean>} options.features - The current switches.
 * @param {(refusal: { status: number, method: string, path: string }) => void} [options.refused]
 */
export function createFeaturesHandler({ connection, features, refused }) {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://web-tweaks.invalid')
    const refuse = (status, headers, text) => {
      refused?.({ status, method: req.method, path: url.pathname })
      res.writeHead(status, headers).end(text)
    }
    const admission = connection.admit(req)
    if ('rejection' in admission) return refuse(admission.rejection, TEXT, admission.rejection === 401 ? 'Sign in to DSH first.\n' : 'Forbidden.\n')
    if (admission.peer?.principal?.kind !== 'owner') return refuse(403, TEXT, 'Forbidden.\n')
    if (url.pathname !== FEATURES_PATH) return refuse(404, TEXT, 'Not found.\n')
    if (req.method !== 'GET' && req.method !== 'HEAD') return refuse(405, { ...HEADERS, allow: 'GET, HEAD' })
    const body = Buffer.from(JSON.stringify(features()), 'utf8')
    res.writeHead(200, { ...HEADERS, 'content-type': 'application/json; charset=utf-8', 'content-length': body.length })
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}

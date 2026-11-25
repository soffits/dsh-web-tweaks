/**
 * The plugin's routes, answered only for the signed-in owner (the same check
 * DSH applies to its own API; behind a sign-in plugin every signed-in person
 * reaches DSH as the owner):
 *
 * - GET/HEAD /custom-css/style.css: the stylesheet, never cached, so a changed
 *   config shows after one load. A header of its own carries its revision,
 *   which lets an open page ask whether its copy is still current without
 *   fetching it (an `etag` would say the same, but a proxy that compresses the
 *   answer rewrites it). A page names itself in `?p=`.
 * - POST /custom-css/report: one page's reading, appended to the report log
 *   when the `report` setting is on. The answer is the current revision.
 *
 * A request that is refused is told to `refused`, so a page that cannot report
 * leaves a trace on the Host.
 */
import { REPORT_MAX_BYTES } from './report.js'

export const PREFIX = '/custom-css'
export const STYLE_PATH = `${PREFIX}/style.css`
export const REPORT_PATH = `${PREFIX}/report`
/** The response header that names the current stylesheet. client.js asks for it by the same name. */
export const REVISION_HEADER = 'x-custom-css-revision'
/** The name a page gives itself: what client.js draws, nothing longer. */
const PAGE_NAME = /^[a-z0-9]{1,12}$/

const HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})
const TEXT = { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' }

/** The request body as text, or null once it is larger than `max` bytes. */
async function readBody(req, max) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > max) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @param {object} options
 * @param {{ admit: (request: { headers: object }) => ({ peer: { principal: { kind: string } } } | { rejection: 401 | 403 }) }} options.connection
 * @param {() => string} options.style - Current stylesheet text.
 * @param {() => string} [options.revision] - What names the current stylesheet.
 * @param {(reading: object) => void} [options.report] - Takes a page's reading; absent while reporting is off.
 * @param {(request: { method: string, page?: string, ua?: string }) => void} [options.served] - Told of each stylesheet request that was answered.
 * @param {(refusal: { status: number, method: string, path: string }) => void} [options.refused] - Told of each request that was not.
 */
export function createHandler({ connection, style, revision = () => '', report, served, refused }) {
  const routes = {
    [STYLE_PATH]: {
      methods: ['GET', 'HEAD'],
      answer(req, res, { url }) {
        const body = Buffer.from(style(), 'utf8')
        const page = url.searchParams.get('p') ?? ''
        served?.({ method: req.method, ...(PAGE_NAME.test(page) ? { page } : {}), ua: req.headers['user-agent'] })
        res.writeHead(200, { ...HEADERS, 'content-type': 'text/css; charset=utf-8', 'content-length': body.length, [REVISION_HEADER]: revision() })
        res.end(req.method === 'HEAD' ? undefined : body)
      },
    },
    [REPORT_PATH]: {
      methods: ['POST'],
      async answer(req, res, { refuse }) {
        const text = await readBody(req, REPORT_MAX_BYTES)
        if (text === null) return refuse(413, TEXT, 'Too large.\n')
        let reading
        try { reading = JSON.parse(text) } catch { reading = null }
        if (reading === null || typeof reading !== 'object' || Array.isArray(reading)) return refuse(400, TEXT, 'Not a report.\n')
        report?.(reading)
        res.writeHead(200, { ...HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ revision: revision(), kept: report !== undefined }))
      },
    },
  }
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://custom-css.invalid')
    const refuse = (status, headers, text) => {
      refused?.({ status, method: req.method, path: url.pathname })
      res.writeHead(status, headers).end(text)
    }
    const admission = connection.admit(req)
    if ('rejection' in admission) return refuse(admission.rejection, TEXT, admission.rejection === 401 ? 'Sign in to DSH first.\n' : 'Forbidden.\n')
    if (admission.peer?.principal?.kind !== 'owner') return refuse(403, TEXT, 'Forbidden.\n')
    const route = routes[url.pathname]
    if (route === undefined) return refuse(404, TEXT, 'Not found.\n')
    if (!route.methods.includes(req.method)) return refuse(405, { ...HEADERS, allow: route.methods.join(', ') })
    return route.answer(req, res, { url, refuse })
  }
}

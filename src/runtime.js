/**
 * Browser runtime of @soffits/dsh-web-tweaks, inlined into client.js by scripts/build-client.js.
 *
 * DSH hands a plugin's browser half no row config, so the page asks the Host which features are on
 * (`web-tweaks/features.json`) and runs each one that is as a child plugin with its own `inject`.
 * It asks again whenever the page comes to the front, so a changed switch needs no reload; a
 * failed ask is retried with a growing delay (DSH restarting, the network away). A feature's module
 * is created only when it is first turned on.
 *
 * @param {object} ctx - this plugin's browser context.
 * @param {Map<string, (require: Function) => object>} factories - feature key to module factory.
 * @param {Function} require - the page's module require.
 */
function runFeatures(ctx, factories, require) {
  const doc = typeof document === 'undefined' ? undefined : document
  const win = doc?.defaultView
  if (doc === undefined || win === undefined || typeof win.fetch !== 'function') return
  const FIRST_RETRY_MS = 1000
  const LAST_RETRY_MS = 60000
  const modules = new Map()
  const running = new Map()
  let stopped = false
  let timer = 0
  let delay = FIRST_RETRY_MS
  let asking = false

  const reconcile = (on) => {
    for (const [key, factory] of factories) {
      const fiber = running.get(key)
      if (on[key] === true && fiber === undefined) {
        if (!modules.has(key)) modules.set(key, factory(require))
        running.set(key, ctx.plugin(modules.get(key)))
      } else if (on[key] !== true && fiber !== undefined) {
        running.delete(key)
        fiber.dispose()
      }
    }
  }

  const ask = async () => {
    if (stopped || asking) return
    asking = true
    win.clearTimeout(timer)
    try {
      const res = await win.fetch(new URL('web-tweaks/features.json', doc.baseURI).href, { cache: 'no-store' })
      if (!res.ok) throw new Error(`features: HTTP ${res.status}`)
      const on = await res.json()
      if (stopped) return
      delay = FIRST_RETRY_MS
      reconcile(on)
    } catch (error) {
      if (stopped) return
      console.warn('web-tweaks:', error)
      timer = win.setTimeout(ask, delay)
      delay = Math.min(delay * 2, LAST_RETRY_MS)
    } finally {
      asking = false
    }
  }

  const onVisibility = () => { if (doc.visibilityState === 'visible') ask() }

  ctx.effect(() => {
    ask()
    doc.addEventListener('visibilitychange', onVisibility)
    win.addEventListener('online', ask)
    return () => {
      stopped = true
      win.clearTimeout(timer)
      doc.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('online', ask)
      for (const fiber of running.values()) fiber.dispose()
      running.clear()
    }
  }, 'web-tweaks: features')
}

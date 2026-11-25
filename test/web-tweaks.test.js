import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { buildClient } from '../scripts/build-client.js'
import { Config, apply, name } from '../index.js'
import { FEATURES } from '../src/features.js'
import { FEATURES_PATH } from '../src/http.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const BROWSER_KEYS = Object.keys(FEATURES).filter(key => FEATURES[key].browser)

test('package, Host name, patch row and browser module agree', () => {
  assert.equal(name, pkg.name)
  assert.match(read('cordis.patch.yml'), new RegExp(`name: '${pkg.name}'`))
  let id
  new Function('window', read('client.js'))({ __ModuleLoader__: { load: entry => { id = entry.id } } })
  assert.equal(id, pkg.name)
  for (const file of pkg.files.filter(entry => !entry.includes('*'))) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file)
  for (const language of ['en', 'zh']) {
    const { meta } = JSON.parse(read(`locale/${language}.json`))
    assert.ok(meta.title && meta.description)
  }
})

test('client.js is the build of the current sources', () => {
  assert.equal(read('client.js'), buildClient())
})

test('every feature is on by default, and custom CSS keeps its own defaults', () => {
  const config = Config({})
  for (const key of Object.keys(FEATURES)) assert.equal(config[key].enabled, true, key)
  assert.equal(config.customCss.fixOverflow, true)
  assert.equal(config.customCss.css, '')
})

/** A Host context that records child plugins and routes. */
function hostContext() {
  const children = []
  const routes = []
  const ctx = {
    plugin: (plugin, config) => { children.push({ name: plugin.name, config }) },
    effect: fn => fn(),
    webServer: { register: route => { routes.push(route); return () => {} } },
    connection: { admit: req => (req.headers.owner ? { peer: { principal: { kind: 'owner' } } } : { rejection: 401 }) },
    logger: { warn() {} },
  }
  return { ctx, children, routes }
}

/** Calls a route handler and collects the answer. */
function call(handler, { url, method = 'GET', owner = true }) {
  let status
  let body = ''
  const res = {
    writeHead(code) { status = code; return this },
    end(text) { if (text) body += String(text) },
  }
  handler({ url, method, headers: owner ? { owner: '1' } : {} }, res)
  return { status, body }
}

test('the Host starts the Host parts of the features that are on and tells the page which are on', () => {
  const { ctx, children, routes } = hostContext()
  apply(ctx, Config({ customCss: { css: 'a{}' }, sessionModel: { enabled: false }, sidebarSplit: { enabled: false } }))
  assert.deepEqual(children.map(child => child.name), ['dsh-custom-css'])
  assert.equal(children[0].config.css, 'a{}')
  assert.equal('enabled' in children[0].config, false)
  const { status, body } = call(routes[0].handler, { url: FEATURES_PATH })
  assert.equal(status, 200)
  assert.deepEqual(JSON.parse(body), { customCss: true, sidebarSplit: false, fileDownload: true, subagentModel: true, sessionModel: false })
  assert.equal(call(routes[0].handler, { url: FEATURES_PATH, owner: false }).status, 401)
  assert.equal(call(routes[0].handler, { url: '/web-tweaks/other' }).status, 404)
})

test('with every feature off the Host starts no child plugin', () => {
  const { ctx, children } = hostContext()
  apply(ctx, Config(Object.fromEntries(Object.keys(FEATURES).map(key => [key, { enabled: false }]))))
  assert.deepEqual(children, [])
})

/** Loads client.js with a page that answers the features route from `answers`, one per ask. */
function page(answers) {
  const listeners = new Map()
  const timers = []
  const created = []
  const win = {
    fetch: async (url) => {
      assert.equal(url, 'https://dsh.invalid/web-tweaks/features.json')
      const next = answers.shift()
      if (next instanceof Error) throw next
      return { ok: true, status: 200, json: async () => next }
    },
    setTimeout: fn => timers.push(fn),
    clearTimeout() {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
  }
  const doc = {
    baseURI: 'https://dsh.invalid/',
    defaultView: win,
    visibilityState: 'visible',
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
  }
  globalThis.document = doc
  let factory
  new Function('window', read('client.js'))({ __ModuleLoader__: { load: entry => { factory = entry.factory } } })
  const react = new Proxy({}, { get: () => () => null })
  const plugin = factory(spec => (spec === 'react' ? react : new Proxy({}, { get: () => () => null })))
  const running = new Map()
  const disposers = []
  const ctx = {
    effect: fn => { disposers.push(fn()) },
    plugin: feature => {
      created.push(feature)
      const key = feature.inject?.includes?.('modelDirectories') ? 'subagentModel' : feature.listLimit ? 'sidebarSplit' : 'other'
      running.set(key, (running.get(key) ?? 0) + 1)
      return { dispose: () => running.set(key, running.get(key) - 1) }
    },
  }
  plugin.apply(ctx)
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  return { plugin, running, created, listeners, timers, settle, stop: () => { for (const dispose of disposers) dispose() } }
}

test('the page starts only the features that are on, and follows a changed switch when it comes to the front', async () => {
  const off = Object.fromEntries(BROWSER_KEYS.map(key => [key, false]))
  const view = page([{ ...off, sidebarSplit: true, subagentModel: true }, { ...off, subagentModel: true }])
  assert.deepEqual(view.plugin.inject, [])
  await view.settle()
  assert.equal(view.running.get('sidebarSplit'), 1)
  assert.equal(view.running.get('subagentModel'), 1)
  assert.equal(view.created.length, 2)
  view.listeners.get('visibilitychange')()
  await view.settle()
  assert.equal(view.running.get('sidebarSplit'), 0)
  assert.equal(view.running.get('subagentModel'), 1)
  view.stop()
  assert.equal(view.running.get('subagentModel'), 0)
  assert.equal(view.listeners.has('visibilitychange'), false)
})

test('a failed ask is tried again later', async () => {
  const view = page([new Error('offline'), { sidebarSplit: true }])
  const warn = console.warn
  console.warn = () => {}
  try {
    await view.settle()
    assert.equal(view.created.length, 0)
    assert.equal(view.timers.length, 1)
    view.timers[0]()
    await view.settle()
    assert.equal(view.running.get('sidebarSplit'), 1)
  } finally {
    console.warn = warn
    view.stop()
  }
})

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, Config } from '../index.js'
import { PREFIX, REPORT_PATH, REVISION_HEADER, STYLE_PATH } from '../src/http.js'
import { clientBuild, REPORT_FILE } from '../src/report.js'
import { RECOVERIES } from '../src/style.js'

const CLIENT = fileURLToPath(new URL('../client.js', import.meta.url))
const VIEWPORT = 'width=device-width, initial-scale=1'
const SETTING = '--dsh-custom-css-'
/** The name the browser half gives itself; a stylesheet from the matching Host half carries it. */
const BUILD = clientBuild(readFileSync(CLIENT, 'utf8'))

/** Where a mounted plugin keeps its reports unless a test names a place. Never the default, which is the real DSH home. */
const SCRATCH = mkdtempSync(join(tmpdir(), 'custom-css-'))
after(() => rmSync(SCRATCH, { recursive: true }))

/** Mounts the Host plugin on a stand-in context. @returns the registered routes, their disposers and what it logged. */
function mount(config, options = { dir: SCRATCH }, admit = () => ({ peer: { principal: { kind: 'owner' } } })) {
  const routes = []
  const disposers = []
  const warnings = []
  const ctx = {
    effect(fn) { disposers.push(fn()) },
    webServer: { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) } },
    connection: { admit },
    logger: { warn: text => warnings.push(text) },
  }
  apply(ctx, Config(config), options)
  return { routes, disposers, warnings }
}

/** Sends one request through a mounted handler. */
async function request(handler, { url, method = 'GET', body, headers = {} }) {
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(text) { this.body = text; return this },
  }
  const req = { url, method, headers, async* [Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body) } }
  await handler(req, res)
  return res
}

test('the plugin registers one prefix route and removes it on unload', () => {
  const { routes, disposers } = mount({})
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, PREFIX)
  disposers[0]()
  assert.equal(routes.length, 0)
})

test('the stylesheet names the browser half that should be running and its own revision', async () => {
  const one = await request(mount({ probe: true }).routes[0].handler, { url: STYLE_PATH })
  assert.ok(one.body.toString().includes(`${SETTING}build: "${BUILD}"`))
  const revision = /--dsh-custom-css-revision: "([0-9a-f]+)"/.exec(one.body.toString())[1]
  assert.equal(one.headers[REVISION_HEADER], revision)
  assert.equal(one.headers.etag, undefined, 'no etag: a proxy that compresses the answer would rewrite it')
  const other = await request(mount({ probe: true, edgeToEdge: true }).routes[0].handler, { url: STYLE_PATH })
  assert.notEqual(other.headers[REVISION_HEADER], revision, 'another setting is another revision')
})

test('with report on, a page\'s reading is kept as one stamped line; without it nothing is written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'custom-css-'))
  try {
    const options = { dir, now: () => new Date('2026-01-02T03:04:05Z') }
    const { handler } = mount({ report: true }, options).routes[0]
    const revision = (await request(handler, { url: `${STYLE_PATH}?p=k3x9q0ab`, headers: { 'user-agent': 'TestPhone/1.0' } })).headers[REVISION_HEADER]
    const answer = await request(handler, { url: REPORT_PATH, method: 'POST', body: JSON.stringify({ seq: 1, window: [867, 669], client: BUILD, revision }) })
    assert.deepEqual(JSON.parse(answer.body), { revision, kept: true })
    await request(handler, { url: REPORT_PATH, method: 'POST', body: JSON.stringify({ seq: 2, client: 'an older build', revision }) })
    const lines = readFileSync(join(dir, REPORT_FILE), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(lines[0], { at: '2026-01-02T03:04:05.000Z', event: 'stylesheet', method: 'GET', page: 'k3x9q0ab', ua: 'TestPhone/1.0' }, 'the stylesheet it served that page is a line too: a page that fetched it and never reported shows as that')
    assert.deepEqual(lines[1], { at: '2026-01-02T03:04:05.000Z', current: true, seq: 1, window: [867, 669], client: BUILD, revision })
    assert.equal(lines[2].current, false, 'a page running an older browser half is marked')

    const quiet = mkdtempSync(join(tmpdir(), 'custom-css-'))
    const silent = mount({}, { dir: quiet }).routes[0].handler
    await request(silent, { url: STYLE_PATH })
    const off = await request(silent, { url: REPORT_PATH, method: 'POST', body: '{"seq":1}' })
    assert.equal(JSON.parse(off.body).kept, false)
    assert.throws(() => readFileSync(join(quiet, REPORT_FILE)))
    rmSync(quiet, { recursive: true })
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('a refused request is written to the Host log: method, path and status, nothing of the request itself', async () => {
  const { routes, warnings } = mount({ report: true }, undefined, () => ({ rejection: 401 }))
  const res = await request(routes[0].handler, { url: `${REPORT_PATH}?x=1`, method: 'POST', body: '{"seq":1,"ua":"TestPhone/1.0"}', headers: { cookie: 'c=1' } })
  assert.equal(res.status, 401)
  assert.deepEqual(warnings, [`custom-css: refused POST ${REPORT_PATH} with 401`])
})

/**
 * A page just big enough for client.js: head, body, events, timers the test fires itself, and computed styles.
 * @param {Record<string, string>} settings - What the stylesheet sets, by name without the prefix.
 */
function fakePage(settings = {}, { local = new Map() } = {}) {
  const head = [{ name: 'viewport', content: VIEWPORT }]
  const body = []
  const handlers = new Map()
  const timers = new Map()
  const sent = []
  const requests = []
  const storage = new Map()
  let timerId = 0
  const on = target => (type, fn) => handlers.set(`${target}:${type}`, [...(handlers.get(`${target}:${type}`) ?? []), fn])
  const off = target => (type, fn) => {
    const left = (handlers.get(`${target}:${type}`) ?? []).filter(each => each !== fn)
    if (left.length > 0) handlers.set(`${target}:${type}`, left)
    else handlers.delete(`${target}:${type}`)
  }
  /** What is listening, by `target:type`; calling an entry calls every listener of it. */
  const listeners = {
    get: key => (handlers.has(key) ? event => { for (const fn of handlers.get(key)) fn(event) } : undefined),
    get size() { return handlers.size },
  }
  const web = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) })
  const element = (list) => ({ style: {}, textContent: '', remove() { const at = list().indexOf(this); if (at >= 0) list().splice(at, 1) } })
  /**
   * `applied`: the stylesheet's rules are in the page. `latest` is the revision the Host names. `post` and `head`
   * make reports and the question about the revision fail: a status, or 'offline'.
   */
  const state = { settings, now: 1234, applied: true, revision: 'r1', latest: 'r1', post: null, head: null, reloads: 0, layout: [867, 669], scrollY: 0 }
  const bodyStyle = new Map()
  const win = {
    innerWidth: 867, innerHeight: 669, devicePixelRatio: 3, scrollX: 0,
    get scrollY() { return state.scrollY },
    screen: { width: 466, height: 678, orientation: { type: 'landscape-primary', angle: 90 } },
    navigator: { standalone: true, userAgent: 'TestPhone/1.0' },
    visualViewport: { width: 867, height: 669, offsetLeft: 0, offsetTop: 0, pageLeft: 0, get pageTop() { return state.scrollY }, scale: 1, addEventListener: on('vv'), removeEventListener: off('vv') },
    performance: { now: () => state.now },
    sessionStorage: web(storage),
    localStorage: web(local),
    location: { reload() { state.reloads += 1 } },
    scrollTo() {},
    matchMedia: query => ({ matches: query === '(display-mode: standalone)' }),
    getComputedStyle: el => (el === doc.documentElement
      ? { getPropertyValue: name => (state.applied ? { revision: `"${state.revision}"`, build: `"${state.build ?? BUILD}"`, recover: 'none', ...state.settings } : {})[name.slice(SETTING.length)] ?? '' }
      : { paddingTop: '0px', paddingRight: '84px', paddingBottom: '34px', paddingLeft: '0px' }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setInterval: () => 2, clearInterval() {},
    setTimeout(fn) { timerId += 1; timers.set(timerId, fn); return timerId },
    clearTimeout(id) { timers.delete(id) },
    fetch: async (url, { method, body: text, keepalive }) => {
      requests.push({ method, url, keepalive })
      const failing = method === 'HEAD' ? state.head : state.post
      if (failing === 'offline') throw new TypeError('Load failed')
      if (failing !== null) return { ok: false, status: failing }
      // a proxy in between has rewritten the entity tag; the revision travels in a header of its own
      if (method === 'HEAD') return { ok: true, headers: { get: name => ({ etag: `W/"${state.latest}-gzip"`, [REVISION_HEADER]: state.latest })[name] ?? null } }
      sent.push(JSON.parse(text))
      return { ok: true, json: async () => ({ revision: state.latest, kept: true }) }
    },
    addEventListener: on('window'), removeEventListener: off('window'),
  }
  const doc = {
    baseURI: 'https://dsh.example/ui/', defaultView: win, visibilityState: 'visible',
    documentElement: { get clientWidth() { return state.layout[0] }, get clientHeight() { return state.layout[1] }, style: {}, offsetHeight: 0 },
    head: { appendChild: node => head.push(node) },
    body: {
      append: (...nodes) => body.push(...nodes),
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 867, height: 669 }),
      style: { getPropertyValue: name => bodyStyle.get(name) ?? '', setProperty: (name, value) => (value === '' ? bodyStyle.delete(name) : bodyStyle.set(name, value)) },
    },
    getElementById: id => [...head, ...body].find(node => node.id === id) ?? null,
    querySelector: selector => (selector === 'link#dsh-custom-css[rel="stylesheet"]'
      ? head.find(node => node.rel === 'stylesheet' && node.id === 'dsh-custom-css')
      : head.find(node => selector === `meta[name="${node.name}"]`)) ?? null,
    querySelectorAll: () => [],
    elementFromPoint: () => null,
    createElement: tag => (tag === 'div' || tag === 'pre' ? element(() => body) : element(() => head)),
    addEventListener: on('document'), removeEventListener: off('document'),
  }
  const links = () => head.filter(node => node.rel === 'stylesheet')
  return {
    doc, win, head, body, listeners, sent, requests, state, storage, local, bodyStyle, links,
    link: () => links().at(-1),
    metas: () => Object.fromEntries(head.filter(node => node.name).map(node => [node.name, node.content])),
    /** The page goes to the back or comes to the front, as the browser tells it. */
    show(visible) {
      doc.visibilityState = visible ? 'visible' : 'hidden'
      listeners.get('document:visibilitychange')({ type: 'visibilitychange' })
    },
    /** The browser shows the page: at the end of a load, or back from the page cache. */
    pageshow() { listeners.get('window:pageshow')({ type: 'pageshow' }) },
    /** A finger on the page, on nothing in particular. */
    touch() { listeners.get('document:pointerdown')({ clientX: 1, clientY: 1, pageX: 1, pageY: 1, target: null }) },
    /** Fires the timers that are waiting now, then lets what they started run. */
    async tick() {
      const due = [...timers.entries()]
      timers.clear()
      for (const [, fn] of due) fn()
      for (let i = 0; i < 10; i += 1) await null
    },
  }
}

/** Lets answers that are already on their way arrive, without firing any timer. */
async function flush() {
  for (let i = 0; i < 10; i += 1) await null
}

async function loadClient(page) {
  const source = await readFile(CLIENT, 'utf8')
  let factory
  globalThis.window = { __ModuleLoader__: { load: ({ id, factory: created }) => { assert.equal(id, 'dsh-custom-css'); factory = created } } }
  globalThis.document = page.doc
  new Function(source)()
  const effects = []
  factory().apply({ effect: (fn) => { effects.push(fn()) } })
  return effects
}

test('client.js links the stylesheet once and removes it on dispose', async () => {
  const page = fakePage()
  const effects = await loadClient(page)
  assert.equal(page.links().length, 1)
  assert.match(page.link().href, /^https:\/\/dsh\.example\/ui\/custom-css\/style\.css\?p=[a-z0-9]+$/, 'the page names itself to the Host')
  await loadClient(page)
  assert.equal(page.links().length, 1, 'a second copy of the module adds no second link')
  effects[0]()
  assert.equal(page.links().length, 0)
})

test('with nothing turned on the page is left alone', async () => {
  const page = fakePage()
  await loadClient(page)
  page.link().onload()
  assert.equal(page.body.length, 0)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT })
  assert.equal(page.sent.length, 0)
})

test('with edge on the page asks for the whole screen, and unloading puts the head back', async () => {
  const page = fakePage({ edge: ' 1' })
  const effects = await loadClient(page)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT }, 'nothing changes before the stylesheet says so')
  page.link().onload()
  assert.deepEqual(page.metas(), {
    viewport: `${VIEWPORT}, viewport-fit=cover`,
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  })
  assert.equal(page.body.length, 0, 'edge alone starts neither the panel nor the reports')
  effects[0]()
  assert.deepEqual(page.head, [{ name: 'viewport', content: VIEWPORT }])
})

test('tags the page already has are changed in place and restored', async () => {
  const page = fakePage({ edge: '1' })
  page.head[0].content = 'width=device-width, viewport-fit=contain, initial-scale=1'
  page.head.push({ name: 'apple-mobile-web-app-status-bar-style', content: 'default' })
  const before = structuredClone(page.head)
  const effects = await loadClient(page)
  page.link().onload()
  assert.equal(page.metas().viewport, 'width=device-width, initial-scale=1, viewport-fit=cover')
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent')
  assert.equal(page.head.filter(node => node.name === 'apple-mobile-web-app-status-bar-style').length, 1)
  effects[0]()
  assert.deepEqual(page.head, before)
})

test('a setting changed on the Host reaches an open page when it comes to the front', async () => {
  const page = fakePage()
  await loadClient(page)
  const first = page.link()
  first.onload()
  page.listeners.get('document:visibilitychange')()
  await page.tick()
  assert.equal(page.links().length, 1, 'same revision: nothing is fetched again')

  Object.assign(page.state, { latest: 'r2' })
  page.listeners.get('window:pageshow')()
  await page.tick()
  assert.equal(page.links().length, 2, 'the new stylesheet loads beside the old one')
  assert.equal(page.link().href, `${first.href}&r=r2`)
  assert.deepEqual(page.metas(), { viewport: VIEWPORT })
  Object.assign(page.state, { revision: 'r2', settings: { edge: '1' } })
  page.link().onload()
  assert.deepEqual(page.links().map(node => node.id), ['dsh-custom-css'], 'and then takes its place')
  assert.ok(!page.head.includes(first))
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent', 'the new settings are acted on')

  Object.assign(page.state, { latest: 'r3' })
  page.listeners.get('document:visibilitychange')()
  await page.tick()
  Object.assign(page.state, { revision: 'r3', settings: {} })
  page.link().onload()
  assert.deepEqual(page.metas(), { viewport: VIEWPORT }, 'a setting turned off is undone the same way')
})


test('a stylesheet that did not arrive is asked for again when the page comes to the front', async () => {
  const page = fakePage({ edge: '1' })
  await loadClient(page)
  page.link().onerror()
  assert.equal(page.links().length, 0)
  page.listeners.get('window:pageshow')()
  assert.equal(page.links().length, 1)
  page.link().onload()
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent')
})

test('with probe on the panel shows the readings, marks taps, and leaves nothing behind', async () => {
  const page = fakePage({ probe: ' 1' })
  const effects = await loadClient(page)
  page.link().onload()
  const panel = page.body.find(node => node.id === 'dsh-custom-css-probe')
  assert.ok(panel)
  assert.match(panel.textContent, /window 867×669/)
  assert.match(panel.textContent, /safe-area t r b l 0 84 34 0/)
  assert.match(panel.textContent, /display standalone/)
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 500, target: null })
  assert.match(panel.textContent, /tap 100,500/)
  // 12px up and left of the tap, written as `inset` so the edge-to-edge popup rule (inline top and left) passes it by
  assert.ok(page.body.some(node => /inset:488px auto auto 88px/.test(node.style.cssText)))
  // body moved (the shell kept off a status bar): the mark still lands under the finger
  page.doc.body.getBoundingClientRect = () => ({ x: 0, y: 82, width: 867, height: 587 })
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 500, target: null })
  assert.ok(page.body.some(node => /inset:406px auto auto 88px/.test(node.style.cssText)))
  assert.ok(page.body.every(node => !/(top|left):/.test(node.style.cssText)))
  page.listeners.get('window:resize')({ type: 'resize' })
  assert.match(panel.textContent, /resize 867×669/)
  assert.equal(page.sent.length, 0, 'the panel alone reports nothing')
  effects[0]()
  assert.equal(page.body.length, 0)
  assert.deepEqual(page.head, [{ name: 'viewport', content: VIEWPORT }])
  assert.equal(page.listeners.size, 0)
})

test('with report on a page sends its readings: on load, at the start of a burst and when it settles', async () => {
  const page = fakePage({ report: '1', edge: '1' })
  const effects = await loadClient(page)
  page.link().onload()
  assert.equal(page.body.find(node => node.id === 'dsh-custom-css-probe'), undefined, 'nothing is drawn')
  const [load] = page.sent
  assert.equal(load.event, 'load')
  assert.equal(load.seq, 1)
  assert.deepEqual(load.window, [867, 669])
  assert.deepEqual(load.html, [867, 669])
  assert.deepEqual(load.screen, { size: [466, 678], orientation: 'landscape-primary', angle: 90 })
  assert.deepEqual(load.insets, [0, 84, 34, 0])
  assert.deepEqual(load.visual, { size: [867, 669], offset: [0, 0], page: [0, 0], scale: 1 })
  assert.equal(load.standalone, true)
  assert.equal(load.display, 'standalone')
  assert.equal(load.meta.viewport, `${VIEWPORT}, viewport-fit=cover`)
  assert.equal(load.meta['apple-mobile-web-app-status-bar-style'], 'black-translucent')
  assert.deepEqual(load.settings, { edge: true, probe: false, recover: [] })
  assert.equal(load.revision, 'r1')
  assert.equal(load.build, BUILD)
  assert.equal(load.client, BUILD, 'the page names its build the way the Host does')
  assert.equal(load.ua, 'TestPhone/1.0')
  assert.equal(load.stale, false)
  assert.match(load.t, /^\d{4}-\d\d-\d\dT/)

  await page.tick()
  assert.deepEqual(page.sent.map(line => line.event), ['load', 'settled'])
  await page.tick()
  assert.equal(page.sent.length, 2, 'nothing moved after the page settled: no late line')

  page.listeners.get('window:orientationchange')({ type: 'orientationchange' })
  page.listeners.get('window:resize')({ type: 'resize' })
  assert.deepEqual(page.sent.map(line => line.event), ['load', 'settled', 'orientationchange'], 'one line at the first event of a burst')
  await page.tick()
  assert.deepEqual(page.sent.at(-1).events, ['orientationchange', 'resize'])
  // a second rotation before the late look of the first is a burst of its own
  page.listeners.get('window:resize')({ type: 'resize' })
  await page.tick()
  assert.deepEqual(page.sent.slice(-2).map(line => [line.event, line.events]), [['resize', undefined], ['settled', ['resize']]])
  assert.deepEqual(page.sent.map(line => line.seq), [1, 2, 3, 4, 5, 6])
  assert.ok(page.sent.every(line => line.page === load.page))

  effects[0]()
  assert.equal(page.body.length, 0)
  assert.equal(page.listeners.size, 0)
})

test('after a burst, taps are reported with where they landed and what is drawn there', async () => {
  const page = fakePage({ report: '1' })
  await loadClient(page)
  page.link().onload()
  await page.tick()
  const target = { nodeType: 1, tagName: 'BUTTON', textContent: 'private words', closest: () => null, getBoundingClientRect: () => ({ x: 80, y: 480, left: 80, top: 480, right: 120, bottom: 520, width: 40, height: 40 }) }
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 418, pageX: 100, pageY: 336, target })
  const { event, tap } = page.sent.at(-1)
  assert.equal(event, 'tap')
  assert.deepEqual(tap, { client: [100, 418], page: [100, 336], target: 'button @80,480 40×40', inside: false, drawnThere: '?' })
})

/** The state iOS can leave behind: the window is right, the layout is short by the old inset and scrolled to minus it. */
const stale = { layout: [867, 587], scrollY: -82 }

test('recover tries each thing in order on a stale page, reporting before and after, and stops at what clears it', async () => {
  const page = fakePage({ report: '1', recover: 'meta style scroll' })
  Object.assign(page.state, stale)
  page.win.scrollTo = () => { Object.assign(page.state, { layout: [867, 669], scrollY: 0 }) }
  await loadClient(page)
  page.link().onload()
  assert.equal(page.sent[0].stale, true)
  assert.deepEqual(page.sent[0].html, [867, 587])
  assert.deepEqual(page.sent[0].scroll, [0, -82])
  await page.tick()
  await page.tick()
  await page.tick()
  await page.tick()
  const tries = page.sent.filter(line => /^(before|after):/.test(line.event)).map(line => [line.event, line.stale])
  assert.deepEqual(tries, [['before:meta', true], ['after:meta', true], ['before:style', true], ['after:style', true], ['before:scroll', true], ['after:scroll', false]])
  assert.equal(page.metas().viewport, VIEWPORT, 'the viewport tag is back as it was')
})

test('recover gives up on a size nothing cleared, and reloads once only', async () => {
  const page = fakePage({ report: '1', recover: 'reload' })
  Object.assign(page.state, stale)
  await loadClient(page)
  page.link().onload()
  for (let i = 0; i < 4; i += 1) await page.tick()
  assert.equal(page.state.reloads, 1)
  page.listeners.get('window:resize')({ type: 'resize' })
  for (let i = 0; i < 4; i += 1) await page.tick()
  assert.equal(page.state.reloads, 1, 'the same stale size is not tried again')

  const again = fakePage({ report: '1', recover: 'reload' })
  Object.assign(again.state, stale)
  again.storage.set('dsh-custom-css-reloaded', '1')
  await loadClient(again)
  again.link().onload()
  for (let i = 0; i < 4; i += 1) await again.tick()
  assert.equal(again.sent[0].event, 'after:reload')
  assert.equal(again.state.reloads, 0, 'still stale after the reload: no second one')
})

test('cover puts body over the visible area while the page is stale and lets go when it is not', async () => {
  const page = fakePage({ report: '1', recover: 'cover' })
  Object.assign(page.state, stale)
  const effects = await loadClient(page)
  page.link().onload()
  await page.tick()
  assert.deepEqual(Object.fromEntries(page.bodyStyle), { 'margin-top': '-82px', 'margin-left': '0px', width: '867px', height: '669px' })
  await page.tick()
  assert.deepEqual(page.sent.filter(line => /cover/.test(line.event)).map(line => line.event), ['before:cover', 'after:cover'])

  page.state.scrollY = -60
  page.listeners.get('vv:scroll')({ type: 'scroll' })
  assert.equal(page.bodyStyle.get('margin-top'), '-60px', 'it follows the viewport')

  Object.assign(page.state, { layout: [867, 669], scrollY: 0 })
  page.listeners.get('window:resize')({ type: 'resize' })
  await page.tick()
  assert.equal(page.bodyStyle.size, 0)
  assert.ok(page.sent.some(line => line.event === 'dropped:cover'))
  effects[0]()
})

test('every recovery the settings offer is one the browser half knows', async () => {
  const page = fakePage({ report: '1', recover: RECOVERIES.join(' ') })
  await loadClient(page)
  page.link().onload()
  assert.deepEqual(page.sent[0].settings.recover, RECOVERIES)
})

const UNSENT = 'dsh-custom-css-unsent'
/** A stylesheet from the Host half as it was before it named a build or a revision. */
const olderHost = { build: '', revision: '', latest: null, settings: {} }

test('a page linked to an older Host half\'s stylesheet catches up when it is shown or touched', async () => {
  // an update swaps the browser half the moment its file changes, before the Host half restarts
  const page = fakePage()
  Object.assign(page.state, olderHost)
  await loadClient(page)
  page.link().onload()
  page.show(false)
  page.show(true)
  await flush()
  assert.deepEqual(page.requests.map(request => request.method), ['HEAD'], 'it asks, though its stylesheet names no revision')
  assert.equal(page.links().length, 1, 'the older Host half names none either: nothing to fetch yet')

  page.touch()
  page.touch()
  await flush()
  assert.equal(page.requests.length, 2, 'a stylesheet that is not this code\'s: a touch asks again, and a second touch right after it does not')
  Object.assign(page.state, { latest: 'r1', now: page.state.now + 6000 })
  page.touch()
  await flush()
  assert.equal(page.links().length, 2, 'the Host half has restarted: the next touch finds its stylesheet')
  Object.assign(page.state, { build: BUILD, revision: 'r1', settings: { report: '1' } })
  page.link().onload()
  assert.equal(page.sent[0].event, 'load', 'and the page reports')
  page.touch()
  await flush()
  page.state.now += 6000
  page.touch()
  await flush()
  assert.equal(page.requests.filter(request => request.method === 'HEAD').length, 3, 'in step with its Host half, a touch asks nothing')
})

test('the revision is read from its own header, whatever a proxy made of the etag', async () => {
  const page = fakePage({ report: '1' })
  await loadClient(page)
  page.link().onload()
  page.pageshow()
  await flush()
  assert.deepEqual(page.requests.filter(request => request.method === 'HEAD').length, 1)
  assert.equal(page.links().length, 1, 'same revision behind a rewritten etag: the stylesheet stays')
})

test('an element of the page that shares the id does not keep the stylesheet out', async () => {
  const page = fakePage({ report: '1' })
  page.body.push({ id: 'dsh-custom-css', tagName: 'H2' })
  await loadClient(page)
  assert.equal(page.links().length, 1)
  page.link().onload()
  assert.equal(page.sent[0].event, 'load')
})

test('the features start from what the stylesheet says, even where its load event never came', async () => {
  const page = fakePage({ report: '1', edge: '1' })
  await loadClient(page)
  page.pageshow()
  assert.equal(page.sent[0].event, 'load', 'shown: the rules are there, so the features run')
  assert.equal(page.metas()['apple-mobile-web-app-status-bar-style'], 'black-translucent')
  assert.equal(page.links().length, 1)

  const other = fakePage({ report: '1' })
  await loadClient(other)
  other.touch()
  assert.equal(other.sent[0].event, 'load', 'touched: the same')
})

test('a first stylesheet still on its way is left alone while the page stays in front, and replaced once it was put away', async () => {
  const page = fakePage({ report: '1' })
  page.state.applied = false
  await loadClient(page)
  const first = page.link()
  page.pageshow()
  page.touch()
  await flush()
  assert.deepEqual(page.links(), [first], 'still loading: nothing else is asked for')
  assert.equal(page.requests.length, 0)

  page.show(false)
  page.show(true)
  assert.equal(page.links().length, 1)
  assert.notEqual(page.link(), first, 'a load the page was put away during may never end: a new one takes its place')
  assert.equal(first.onload, null, 'and the old one is no longer heard')
  page.state.applied = true
  page.link().onload()
  assert.equal(page.sent[0].event, 'load')

  // the same for a newer stylesheet on its way to replace the one in use
  page.state.latest = 'r2'
  page.pageshow()
  await flush()
  const second = page.link()
  assert.equal(page.links().length, 2)
  page.show(false)
  page.show(true)
  await flush()
  assert.ok(!page.links().includes(second))
  assert.equal(page.links().length, 2, 'asked for again')
})

test('a report the Host did not take is counted, and the next one that arrives says so, on a later page too', async () => {
  const local = new Map()
  const page = fakePage({ report: '1' }, { local })
  page.state.post = 401
  await loadClient(page)
  page.link().onload()
  await page.tick()
  await flush()
  assert.equal(page.sent.length, 0)
  const refused = JSON.parse(local.get(UNSENT))
  assert.equal(refused.count, 2)
  assert.deepEqual([refused.last.what, refused.last.error, refused.last.line.event, refused.last.line.seq], ['report', 'HTTP 401', 'settled', 2])
  assert.match(refused.since, /^\d{4}-\d\d-\d\dT/)

  page.state.post = 'offline'
  page.listeners.get('window:resize')({ type: 'resize' })
  await flush()
  assert.deepEqual([JSON.parse(local.get(UNSENT)).count, JSON.parse(local.get(UNSENT)).last.error], [3, 'Load failed'])

  // the person signs in again: the app loads anew and its first report gets through
  const next = fakePage({ report: '1' }, { local })
  await loadClient(next)
  next.link().onload()
  await flush()
  const { unsent } = next.sent[0]
  assert.equal(unsent.count, 3)
  assert.equal(unsent.since, refused.since)
  assert.deepEqual([unsent.last.what, unsent.last.error, unsent.last.line.event], ['report', 'Load failed', 'resize'])
  assert.notEqual(unsent.last.line.page, next.sent[0].page, 'the line that was lost is the earlier page\'s')
  assert.equal(local.has(UNSENT), false, 'told once')
  await next.tick()
  assert.equal(next.sent[1].event, 'settled')
  assert.equal(next.sent[1].unsent, undefined)
})

test('a stylesheet that did not load and a question that got no answer are counted the same way', async () => {
  const local = new Map()
  const page = fakePage({ report: '1' }, { local })
  await loadClient(page)
  page.link().onerror()
  assert.deepEqual([JSON.parse(local.get(UNSENT)).count, JSON.parse(local.get(UNSENT)).last.what], [1, 'stylesheet'])
  page.pageshow()
  page.link().onload()
  await flush()
  assert.deepEqual([page.sent[0].unsent.count, page.sent[0].unsent.last.error], [1, 'did not load'], 'the first report tells of the stylesheet')
  page.state.head = 502
  page.show(false)
  page.show(true)
  await flush()
  await page.tick()
  const { unsent } = page.sent.at(-1)
  assert.deepEqual([unsent.count, unsent.last.what, unsent.last.error], [1, 'revision', 'HTTP 502'])
})

test('with report off nothing is kept to send; before a stylesheet has said so, what is kept stays', async () => {
  const local = new Map([[UNSENT, JSON.stringify({ count: 2, since: '2026-01-01T00:00:00.000Z', last: { t: '2026-01-01T00:00:01.000Z', what: 'report', error: 'HTTP 401' } })]])
  const page = fakePage({}, { local })
  page.state.applied = false
  await loadClient(page)
  page.pageshow()
  page.touch()
  assert.equal(local.has(UNSENT), true)
  page.state.applied = true
  page.link().onload()
  assert.equal(local.has(UNSENT), false)
})

test('a browser that refuses storage still counts, for as long as the page lives', async () => {
  const page = fakePage({ report: '1' })
  page.win.localStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
  page.state.post = 'offline'
  await loadClient(page)
  page.link().onload()
  await flush()
  page.state.post = null
  await page.tick()
  await flush()
  assert.equal(page.sent[0].unsent.count, 1)
})

test('only a page on its way out asks the browser to finish its report without it', async () => {
  const page = fakePage({ report: '1' })
  await loadClient(page)
  page.link().onload()
  await page.tick()
  page.show(false)
  await flush()
  const posts = page.requests.filter(request => request.method === 'POST')
  assert.deepEqual(page.sent.map(line => line.event), ['load', 'settled', 'visibilitychange'])
  assert.deepEqual(posts.map(request => request.keepalive), [false, false, true])
})

test('a page keeps its name and its count of lines when a new stylesheet restarts the features', async () => {
  const page = fakePage({ report: '1' })
  await loadClient(page)
  const first = page.link()
  first.onload()
  await page.tick()
  page.state.latest = 'r2'
  page.pageshow()
  await flush()
  page.state.revision = 'r2'
  page.link().onload()
  assert.deepEqual(page.sent.map(line => [line.event, line.seq, line.revision]), [['load', 1, 'r1'], ['settled', 2, 'r1'], ['pageshow', 3, 'r1'], ['settings', 4, 'r2']])
  assert.equal(new Set(page.sent.map(line => line.page)).size, 1)
  assert.ok(first.href.endsWith(`?p=${page.sent[0].page}`), 'the name it gave the Host with its stylesheet')
})

test('features that cannot start are counted and tried again, and the page is left as it was', async () => {
  const local = new Map()
  const page = fakePage({ report: '1', edge: '1' }, { local })
  const append = page.doc.body.append
  page.doc.body.append = () => { throw new TypeError('no body yet') }
  await loadClient(page)
  assert.doesNotThrow(() => page.link().onload())
  assert.deepEqual(page.metas(), { viewport: VIEWPORT }, 'what had started is undone')
  assert.deepEqual([JSON.parse(local.get(UNSENT)).last.what, JSON.parse(local.get(UNSENT)).last.error], ['start', 'no body yet'])
  page.doc.body.append = append
  page.touch()
  await flush()
  assert.equal(page.sent[0].event, 'load')
  assert.equal(page.sent[0].unsent.last.what, 'start')
})

test('a page and the Host half agree on how a revision is asked for and where a page is named', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'custom-css-'))
  try {
    const { handler } = mount({ report: true }, { dir }).routes[0]
    const page = fakePage({ report: '1' })
    page.state.revision = 'an older one'
    page.win.fetch = async (url, { method, body }) => {
      const { pathname, search } = new URL(url)
      const res = await request(handler, { url: `${pathname.replace('/ui', '')}${search}`, method, body, headers: { 'user-agent': 'TestPhone/1.0' } })
      return { ok: res.status === 200, status: res.status, headers: { get: name => res.headers[name] ?? null }, json: async () => JSON.parse(res.body) }
    }
    await loadClient(page)
    const first = page.link()
    first.onload()
    page.pageshow()
    await flush()
    await flush()
    const { [REVISION_HEADER]: revision } = (await request(handler, { url: STYLE_PATH })).headers
    assert.equal(page.link().href, `${first.href}&r=${revision}`, 'the page learnt the Host\'s revision and asks for that stylesheet')
    const lines = readFileSync(join(dir, REPORT_FILE), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const name = new URL(first.href).searchParams.get('p')
    assert.deepEqual(lines.filter(line => line.event === 'stylesheet' && line.page === name).map(line => line.method), ['HEAD'])
    assert.ok(lines.some(line => line.event === 'load' && line.page === name), 'its report carries the same name')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

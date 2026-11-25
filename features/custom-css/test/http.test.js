import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, REPORT_PATH, REVISION_HEADER, STYLE_PATH } from '../src/http.js'
import { REPORT_MAX_BYTES } from '../src/report.js'

const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }

function respond(handler, { url = STYLE_PATH, method = 'GET', headers = {} } = {}) {
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(body) { this.body = body; return this },
  }
  handler({ url, method, headers }, res)
  return res
}

test('the owner gets the stylesheet, uncached', () => {
  const res = respond(createHandler({ connection: owner, style: () => 'a{b:c}' }))
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/css; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.body.toString(), 'a{b:c}')
})

test('HEAD sends headers only', () => {
  const res = respond(createHandler({ connection: owner, style: () => 'a{b:c}' }), { method: 'HEAD' })
  assert.equal(res.status, 200)
  assert.equal(res.body, undefined)
})

test('refused and non-owner requests get no css', () => {
  const refused = respond(createHandler({ connection: { admit: () => ({ rejection: 401 }) }, style: () => 'x' }))
  assert.equal(refused.status, 401)
  const api = respond(createHandler({ connection: { admit: () => ({ peer: { principal: { kind: 'api' } } }) }, style: () => 'x' }))
  assert.equal(api.status, 403)
})

test('other paths and methods are refused', () => {
  const handler = createHandler({ connection: owner, style: () => 'x' })
  assert.equal(respond(handler, { url: '/custom-css/other' }).status, 404)
  assert.equal(respond(handler, { method: 'POST' }).status, 405)
})

/** A request with a body, the way Node hands one over. */
async function post(handler, body, { url = REPORT_PATH } = {}) {
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(text) { this.body = text; return this },
  }
  await handler({ url, method: 'POST', headers: {}, async* [Symbol.asyncIterator]() { yield Buffer.from(body) } }, res)
  return res
}

test('the stylesheet answers with its revision, so a page can ask whether its copy is current', () => {
  const handler = createHandler({ connection: owner, style: () => 'a{b:c}', revision: () => 'r7' })
  const head = respond(handler, { method: 'HEAD' })
  assert.equal(head.headers[REVISION_HEADER], 'r7')
  assert.equal(head.headers.etag, undefined, 'not as an etag: a proxy that compresses the answer rewrites those')
  assert.equal(head.body, undefined)
  assert.equal(respond(handler, { url: `${STYLE_PATH}?p=abc123&r=r7` }).status, 200, 'a page name and a revision in the address are the same stylesheet')
})

test('each stylesheet request that is answered is told, with the page that asked', () => {
  const served = []
  const handler = createHandler({ connection: owner, style: () => 'a{b:c}', served: request => served.push(request) })
  respond(handler, { url: `${STYLE_PATH}?p=k3x9q0ab`, headers: { 'user-agent': 'TestPhone/1.0' } })
  respond(handler, { url: `${STYLE_PATH}?p=k3x9q0ab&r=r7`, method: 'HEAD', headers: { 'user-agent': 'TestPhone/1.0' } })
  respond(handler, { url: `${STYLE_PATH}?p=${'x'.repeat(200)}` })
  respond(handler, { url: `${STYLE_PATH}?p=<script>` })
  assert.deepEqual(served, [
    { method: 'GET', page: 'k3x9q0ab', ua: 'TestPhone/1.0' },
    { method: 'HEAD', page: 'k3x9q0ab', ua: 'TestPhone/1.0' },
    { method: 'GET', ua: undefined },
    { method: 'GET', ua: undefined },
  ], 'a name that is not one a page draws is left out')
  respond(createHandler({ connection: { admit: () => ({ rejection: 401 }) }, style: () => 'x', served: request => served.push(request) }))
  assert.equal(served.length, 4, 'a refused request was not served')
})

test('every refused request is told: who may not, what is not there, what is not a report', async () => {
  const refused = []
  const told = { refused: refusal => refused.push(refusal) }
  await post(createHandler({ connection: { admit: () => ({ rejection: 401 }) }, style: () => '', ...told }), '{"seq":1}', { url: `${REPORT_PATH}?secret=1` })
  respond(createHandler({ connection: { admit: () => ({ peer: { principal: { kind: 'api' } } }) }, style: () => '', ...told }))
  const handler = createHandler({ connection: owner, style: () => '', ...told })
  respond(handler, { url: '/custom-css/other' })
  respond(handler, { method: 'POST' })
  await post(handler, 'not json')
  await post(handler, JSON.stringify({ pad: 'x'.repeat(REPORT_MAX_BYTES) }))
  assert.deepEqual(refused, [
    { status: 401, method: 'POST', path: REPORT_PATH },
    { status: 403, method: 'GET', path: STYLE_PATH },
    { status: 404, method: 'GET', path: '/custom-css/other' },
    { status: 405, method: 'POST', path: STYLE_PATH },
    { status: 400, method: 'POST', path: REPORT_PATH },
    { status: 413, method: 'POST', path: REPORT_PATH },
  ], 'the path only, never the query')
  assert.equal((await post(handler, '{"seq":1}')).status, 200)
  assert.equal(refused.length, 6)
})

test('a report is taken from the signed-in owner only, and answered with the current revision', async () => {
  const taken = []
  const handler = createHandler({ connection: owner, style: () => '', revision: () => 'r7', report: reading => taken.push(reading) })
  const ok = await post(handler, '{"seq":1,"window":[867,669]}')
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(ok.body), { revision: 'r7', kept: true })
  assert.deepEqual(taken, [{ seq: 1, window: [867, 669] }])

  for (const connection of [{ admit: () => ({ rejection: 401 }) }, { admit: () => ({ peer: { principal: { kind: 'share-viewer' } } }) }]) {
    const refused = await post(createHandler({ connection, style: () => '', report: reading => taken.push(reading) }), '{"seq":2}')
    assert.ok(refused.status === 401 || refused.status === 403)
  }
  assert.equal(taken.length, 1)
})

test('what is not a report is refused: other methods, other shapes, too many bytes', async () => {
  const taken = []
  const handler = createHandler({ connection: owner, style: () => '', report: reading => taken.push(reading) })
  const get = respond(handler, { url: REPORT_PATH })
  assert.equal(get.status, 405)
  assert.equal(get.headers.allow, 'POST')
  assert.equal((await post(handler, 'not json')).status, 400)
  assert.equal((await post(handler, '[1,2]')).status, 400)
  assert.equal((await post(handler, JSON.stringify({ pad: 'x'.repeat(REPORT_MAX_BYTES) }))).status, 413)
  assert.equal(taken.length, 0)
})

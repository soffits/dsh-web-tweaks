import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

/**
 * Load the browser module the way the Web shell does: register a factory,
 * then materialize it with a module-table `require`.
 * @returns the module exports.
 */
async function loadModule() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const registrations = []
  globalThis.window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  new Function(source)()
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].id, 'dsh-file-download')
  return registrations[0].factory((specifier) => {
    if (specifier === 'react') return { createElement: () => null, useState: () => [false, () => {}], useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (fn) => fn }
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { Button: 'Button', Tooltip: 'Tooltip', IconDownloadOutlineRegular: 'Icon' }
    throw new Error(`unexpected module request ${specifier}`)
  })
}

/** A fake `readBytes` over one buffer with a window cap, recording each request. */
function fakeReadBytes(bytes, cap) {
  const calls = []
  const readBytes = async (sessionId, path, options) => {
    calls.push({ sessionId, path, ...options.range })
    const { offset, length } = options.range
    if (length > cap) return { ok: false, error: { code: 'workspace-file/too-large', details: { path, limit: cap } } }
    const data = bytes.subarray(offset, offset + length)
    return { ok: true, value: { data, offset, eof: offset + data.byteLength >= bytes.byteLength } }
  }
  return { readBytes, calls }
}

test('registers under its own id with the services it uses', async () => {
  const { apply, inject } = await loadModule()
  assert.equal(typeof apply, 'function')
  assert.deepEqual(inject, ['slots', 'locale', 'fileActions', 'contextMenus', 'remote', 'remote.workspaceFiles'])
})

test('basenameOf handles POSIX and Windows paths', async () => {
  const { basenameOf } = await loadModule()
  assert.equal(basenameOf('/home/a/Duo-signing.zip'), 'Duo-signing.zip')
  assert.equal(basenameOf('C:\\Users\\a\\报告 1.pdf'), '报告 1.pdf')
  assert.equal(basenameOf('/x/dir/'), 'dir')
})

test('mediaTypeOf knows common suffixes and leaves the rest empty', async () => {
  const { mediaTypeOf } = await loadModule()
  assert.equal(mediaTypeOf('a.ZIP'), 'application/zip')
  assert.equal(mediaTypeOf('a.pdf'), 'application/pdf')
  assert.equal(mediaTypeOf('a.unknownext'), '')
  assert.equal(mediaTypeOf('.bashrc'), '')
})

test('readWhole walks windows until eof and keeps every byte', async () => {
  const { readWhole } = await loadModule()
  const bytes = new Uint8Array(5 * 1024 * 1024 + 7).map((_, index) => index % 251)
  const { readBytes, calls } = fakeReadBytes(bytes, 2 * 1024 * 1024)
  const blob = await readWhole(readBytes, 's1', '/f.bin', 'application/octet-stream', new AbortController().signal)
  assert.equal(blob.size, bytes.byteLength)
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)
  assert.equal(blob.type, 'application/octet-stream')
  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => call.sessionId === 's1' && call.path === '/f.bin'))
})

test('readWhole follows a tighter window cap the Host names', async () => {
  const { readWhole } = await loadModule()
  const bytes = new Uint8Array(300 * 1024).fill(9)
  const { readBytes, calls } = fakeReadBytes(bytes, 128 * 1024)
  const blob = await readWhole(readBytes, 's', '/f', '', new AbortController().signal)
  assert.equal(blob.size, bytes.byteLength)
  assert.equal(calls[0].length, 2 * 1024 * 1024)
  assert.ok(calls.slice(1).every((call) => call.length === 128 * 1024))
})

test('readWhole reads an empty file as an empty blob', async () => {
  const { readWhole } = await loadModule()
  const { readBytes } = fakeReadBytes(new Uint8Array(0), 2 * 1024 * 1024)
  const blob = await readWhole(readBytes, 's', '/empty', 'text/plain', new AbortController().signal)
  assert.equal(blob.size, 0)
})

test('readWhole rejects on a failed read and on abort', async () => {
  const { readWhole } = await loadModule()
  const failing = async () => ({ ok: false, error: { code: 'workspace-file/not-found', details: {} } })
  await assert.rejects(readWhole(failing, 's', '/gone', '', new AbortController().signal), /not-found/)
  const controller = new AbortController()
  controller.abort()
  const { readBytes } = fakeReadBytes(new Uint8Array(10), 1024)
  await assert.rejects(readWhole(readBytes, 's', '/f', '', controller.signal))
})

test('apply registers a header and an empty-state control that save through fileActions', async () => {
  const { apply } = await loadModule()
  const registered = []
  const notices = []
  const saves = []
  const bytes = new Uint8Array([1, 2, 3])
  const { readBytes } = fakeReadBytes(bytes, 1024)
  const ctx = {
    effect: (fn) => { fn() },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_name, fn) => fn(), register: (options, component) => { registered.push({ options, component }); return () => {} } },
    remote: { workspaceFiles: { readBytes } },
    fileActions: { save: async (source, mode) => { saves.push({ source, mode, blob: await source.read(new AbortController().signal) }); return { status: 'requested' } } },
    contextMenus: { notify: (text, ok) => { notices.push([text, ok]) } },
  }
  apply(ctx)
  assert.deepEqual(registered.map((entry) => entry.options.name), ['sidebar.right.tab.document.actions', 'sidebar.right.tab.document.unpreviewable'])
  const { start } = registered[0].options.inject('session-1')
  await start('/home/a/Duo-signing.zip', new AbortController().signal)
  assert.equal(saves.length, 1)
  assert.equal(saves[0].mode, 'download')
  assert.equal(saves[0].source.name, 'Duo-signing.zip')
  assert.equal(saves[0].source.mediaType, 'application/zip')
  assert.match(saves[0].source.url, /api\/file\?path=%2Fhome%2Fa%2FDuo-signing\.zip$/)
  assert.equal(saves[0].blob.size, 3)
  assert.deepEqual(notices, [['started', true]])
})

test('a failed save is announced once as a failure', async () => {
  const { apply } = await loadModule()
  const registered = []
  const notices = []
  const ctx = {
    effect: (fn) => { fn() },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_name, fn) => fn(), register: (options) => { registered.push(options); return () => {} } },
    remote: { workspaceFiles: { readBytes: async () => ({ ok: false, error: { code: 'gateway/internal' } }) } },
    fileActions: { save: async (source) => { await source.read(new AbortController().signal); return { status: 'requested' } } },
    contextMenus: { notify: (text, ok) => { notices.push([text, ok]) } },
  }
  apply(ctx)
  const original = console.warn
  console.warn = () => {}
  try {
    await registered[1].inject('s').start('/x/a.zip', new AbortController().signal)
  } finally { console.warn = original }
  assert.deepEqual(notices, [['failed', false]])
})

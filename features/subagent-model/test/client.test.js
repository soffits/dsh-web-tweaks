/**
 * Loads client.js the way DSH's module loader does, with a recording React
 * stand-in, and checks what the browser half registers and what it renders
 * for a subagent session, a normal session and a session with no selection.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

/** createElement records the tree; function components are called, so a render shows what ends up on the page. */
function element(type, props, ...children) {
  if (typeof type === 'function') return type({ ...props, children })
  return { type, props: props ?? {}, children: children.flat().filter(child => child !== null) }
}

function load({ snapshot } = {}) {
  const React = {
    createElement: element,
    useSyncExternalStore: (_subscribe, read) => read(),
  }
  let factory
  globalThis.window = { __ModuleLoader__: { load: ({ id, factory: created }) => { factory = { id, create: created } } } }
  const styles = []
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ dataset: {}, remove() { styles.pop() } }),
    head: { appendChild: tag => styles.push(tag) },
  }
  // eslint-disable-next-line no-new-func -- the module defines window.__ModuleLoader__ itself
  new Function(source)()
  const plugin = factory.create(name => (name === 'react' ? React : assert.fail(name)))

  const registered = []
  const dictionaries = new Map()
  const disposers = []
  const subagents = new Set(['child'])
  const stores = new Map()
  const ctx = {
    effect: fn => disposers.push(fn()),
    locale: {
      register: (_ns, language, table) => { dictionaries.set(language, table); return () => {} },
      bind: () => (key, params) => params === undefined ? key : `${key}:${JSON.stringify(params)}`,
    },
    slots: {
      inject: (name, create) => registered.push({ name, ...create() }),
      register: (definition, component) => ({ definition, component }),
    },
    sessions: { subagentAddress: id => subagents.has(id) ? { parent: 'root' } : undefined },
    modelDirectories: {
      directoryFor(id) {
        if (id === 'gone') throw new Error('no scope')
        if (!stores.has(id)) stores.set(id, { subscribe: () => () => {}, getSnapshot: () => snapshot })
        return { store: stores.get(id) }
      },
    },
  }
  plugin.apply(ctx)
  return { plugin, dictionaries, styles, disposers, factory, registered }
}

const catalog = {
  current: { provider: 'claude-code', model: 'claude-opus-5-5', reasoningEffort: 'high' },
  groups: [{
    id: 'claude-code',
    models: [{
      id: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      reasoning: { defaultEffort: 'medium', efforts: [{ id: 'high', name: 'high' }, { id: 'medium', name: 'medium' }] },
    }],
  }],
}

/** Render the registered slot entry for a session, as the slot host would. */
function render(loaded, sessionId) {
  const { registered } = loaded
  const [entry] = registered
  const props = entry.definition.inject(sessionId)
  return entry.component(props)
}

test('registers one entry of its own in the composer right slot, without touching the shipped seat', () => {
  const loaded = load({ snapshot: catalog })
  assert.equal(loaded.factory.id, 'dsh-subagent-model')
  assert.equal(loaded.registered.length, 1)
  const [{ name, definition }] = loaded.registered
  assert.equal(name, 'conversation.input.right')
  assert.equal(definition.name, 'conversation.input.right')
  assert.equal(definition.id, 'subagent-model')
  assert.deepEqual(loaded.plugin.inject, ['slots', 'locale', 'sessions', 'modelDirectories'])
})

test('a subagent session gets the model name and effort as a read-only label', () => {
  const loaded = load({ snapshot: catalog })
  const tree = render(loaded, 'child')
  assert.equal(tree.type, 'span')
  assert.equal(tree.props.title, 'Claude Opus 5.5 · high')
  assert.equal(tree.props['data-model-id'], 'claude-opus-5-5')
  assert.deepEqual(tree.children.map(child => child.children[0]), ['Claude Opus 5.5', 'high'])
  assert.equal(tree.props.onClick, undefined)
})

test('a normal session renders nothing, so the shipped picker stays the only model control', () => {
  const loaded = load({ snapshot: catalog })
  assert.equal(render(loaded, 'root'), null)
  assert.equal(render(loaded, undefined), null)
})

test('the model default effort is used when the session recorded none', () => {
  const loaded = load({ snapshot: { ...catalog, current: { provider: 'claude-code', model: 'claude-opus-5-5' } } })
  assert.equal(render(loaded, 'child').props.title, 'Claude Opus 5.5 · medium')
})

test('a model the catalog does not list shows its id, without an effort it cannot name', () => {
  const loaded = load({ snapshot: { ...catalog, current: { provider: 'other', model: 'mystery-1' } } })
  const tree = render(loaded, 'child')
  assert.equal(tree.props.title, 'mystery-1')
  assert.equal(tree.children.length, 1)
})

test('an unknown effort id is shown as recorded', () => {
  const loaded = load({ snapshot: { ...catalog, current: { provider: 'claude-code', model: 'claude-opus-5-5', reasoningEffort: 'xhigh' } } })
  assert.equal(render(loaded, 'child').props.title, 'Claude Opus 5.5 · xhigh')
})

test('nothing renders before a selection is known, or for a session without a scope', () => {
  assert.equal(render(load({ snapshot: { current: null, groups: [] } }), 'child'), null)
  assert.equal(render(load({ snapshot: catalog }), 'gone'), null)
})

test('both dictionaries carry the same keys, the styles are added once and removed on dispose', () => {
  const loaded = load({ snapshot: catalog })
  assert.deepEqual(Object.keys(loaded.dictionaries.get('zh')).sort(), Object.keys(loaded.dictionaries.get('en')).sort())
  assert.equal(loaded.styles.length, 1)
  for (const dispose of loaded.disposers) dispose()
  assert.equal(loaded.styles.length, 0)
})

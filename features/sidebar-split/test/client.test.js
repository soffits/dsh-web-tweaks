import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function loadModule() {
  let registered
  const window = { __ModuleLoader__: { load: (entry) => { registered = entry } } }
  new Function('window', readFileSync(new URL('../client.js', import.meta.url), 'utf8'))(window)
  return { id: registered.id, module: registered.factory(() => { throw new Error('no imports expected') }) }
}

const { id, module } = loadModule()
const { listLimit, stateForHeight, parseState } = module

test('registers under the package name with no injected services', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(id, pkg.name)
  assert.deepEqual(module.inject, [])
})

test('a list that fits keeps its full height by default', () => {
  assert.equal(listLimit({ ratio: null, hidden: false }, { total: 800, natural: 200 }), 200)
})

test('a long list gets half the area by default and the workspaces the rest', () => {
  assert.equal(listLimit({ ratio: null, hidden: false }, { total: 600, natural: 450 }), 300)
})

test('the workspaces always keep their minimum', () => {
  assert.equal(listLimit({ ratio: 1, hidden: false }, { total: 300, natural: 450 }), 204)
})

test('a hidden list has no height', () => {
  assert.equal(listLimit({ ratio: 0.8, hidden: true }, { total: 600, natural: 450 }), 0)
})

test('dragging near the top hides the list, and a later drag brings it back', () => {
  assert.deepEqual(stateForHeight(10, { total: 600, natural: 450 }), { ratio: null, hidden: true })
  assert.deepEqual(stateForHeight(150, { total: 600, natural: 450 }), { ratio: 0.25, hidden: false })
})

test('dragging past the last row remembers "show every row"', () => {
  const state = stateForHeight(500, { total: 900, natural: 450 })
  assert.deepEqual(state, { ratio: 1, hidden: false })
  assert.equal(listLimit(state, { total: 900, natural: 450 }), 450)
})

test('a drag is clamped to the room the workspaces leave', () => {
  const state = stateForHeight(560, { total: 600, natural: 900 })
  assert.equal(listLimit(state, { total: 600, natural: 900 }), 504)
})

test('stored state is validated', () => {
  assert.deepEqual(parseState(null), { ratio: null, hidden: false })
  assert.deepEqual(parseState('not json'), { ratio: null, hidden: false })
  assert.deepEqual(parseState('{"ratio":2,"hidden":"yes"}'), { ratio: null, hidden: false })
  assert.deepEqual(parseState('{"ratio":0.4,"hidden":true}'), { ratio: 0.4, hidden: true })
})

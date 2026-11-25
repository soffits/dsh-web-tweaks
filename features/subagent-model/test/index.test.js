import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { apply, name } from '../index.js'

const json = async path => JSON.parse(await readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))

test('the Host half is a no-op named like the package', async () => {
  const pkg = await json('../package.json')
  assert.equal(name, pkg.name)
  assert.equal(apply(), undefined)
})

test('the client entry id, patch row and manifest agree', async () => {
  const pkg = await json('../package.json')
  const patch = await readFile(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
  assert.match(patch, new RegExp(`name: '${pkg.name}'`))
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.exports['./client'])
  for (const file of pkg.files.filter(entry => !entry.includes('*'))) await readFile(fileURLToPath(new URL(`../${file}`, import.meta.url)))
})

test('every locale file has a title and a description', async () => {
  for (const language of ['en', 'zh']) {
    const { meta } = await json(`../locale/${language}.json`)
    assert.ok(meta.title && meta.description)
  }
})

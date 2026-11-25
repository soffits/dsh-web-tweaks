import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReportLog, fnv1a, OLD_REPORT_FILE, REPORT_FILE, stateDir } from '../src/report.js'

test('reports live in the plugin\'s own folder under the DSH home', () => {
  assert.equal(stateDir({ DSH_HOME: '/srv/dsh' }), join('/srv/dsh', 'custom-css'))
})

test('the report log stays bounded: a full file becomes the old one and a new one starts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'custom-css-'))
  try {
    const log = createReportLog({ dir, limit: 200 })
    const line = seq => ({ seq, pad: 'x'.repeat(60) })
    for (let seq = 1; seq <= 7; seq += 1) log.append(line(seq))
    const read = name => readFileSync(join(dir, name), 'utf8').trim().split('\n').map(text => JSON.parse(text).seq)
    // two lines fit under the limit
    assert.deepEqual(read(OLD_REPORT_FILE), [5, 6], 'the file before the current one; older lines are gone')
    assert.deepEqual(read(REPORT_FILE), [7])
    assert.ok(statSync(join(dir, REPORT_FILE)).size <= 200)
    assert.equal(statSync(join(dir, REPORT_FILE)).mode & 0o777, 0o600)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('the build hash is FNV-1a', () => {
  assert.equal(fnv1a(''), '811c9dc5')
  assert.equal(fnv1a('a'), 'e40c292c')
  assert.equal(fnv1a('foobar'), 'bf9cf968')
})

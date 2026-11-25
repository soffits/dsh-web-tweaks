/**
 * Where pages' reports go: one JSON object per line in
 * `<DSH home>/custom-css/reports.jsonl`. The file is bounded: when the next
 * line would take it past `limit` bytes it becomes `reports.old.jsonl`
 * (replacing the one before) and a new file starts, so the two together stay
 * under twice the limit.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const REPORT_FILE = 'reports.jsonl'
export const OLD_REPORT_FILE = 'reports.old.jsonl'
/** Bytes one report file may reach. */
export const REPORT_LIMIT = 512 * 1024
/** Bytes one report may have; a page's reading is about 1 KB. */
export const REPORT_MAX_BYTES = 8 * 1024

/** The plugin's own folder under the DSH home. */
export function stateDir(env = process.env) {
  return join(env.DSH_HOME || join(homedir(), '.dsh'), 'custom-css')
}

/** FNV-1a over UTF-16 code units, as 8 hex digits. client.js has the same function and names itself with it. */
export function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * The name a browser half built from `source` gives itself: the hash of its factory's text.
 * @param {string} source - client.js
 */
export function clientBuild(source) {
  let factory
  new Function('window', source)({ __ModuleLoader__: { load: (module) => { factory = module.factory } } })
  return fnv1a(factory.toString())
}

/**
 * @param {object} options
 * @param {string} options.dir
 * @param {number} [options.limit]
 * @returns {{ append: (report: object) => void, file: string }}
 */
export function createReportLog({ dir, limit = REPORT_LIMIT }) {
  const file = join(dir, REPORT_FILE)
  const size = () => { try { return statSync(file).size } catch { return 0 } }
  return {
    file,
    append(report) {
      const line = `${JSON.stringify(report)}\n`
      mkdirSync(dir, { recursive: true })
      if (size() + Buffer.byteLength(line) > limit) renameSync(file, join(dir, OLD_REPORT_FILE))
      appendFileSync(file, line, { mode: 0o600 })
    },
  }
}

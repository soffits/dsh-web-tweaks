import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../src/config.js'
import { clientSettings, composeStyle, EDGE_TO_EDGE, OVERFLOW_FIX, RECOVERIES } from '../src/style.js'

test('defaults: the overflow fix on, no edge to edge, no report, no probe, no recovery, no user css', () => {
  const config = Config({})
  assert.equal(config.fixOverflow, true)
  assert.equal(config.edgeToEdge, false)
  assert.equal(config.report, false)
  assert.equal(config.probe, false)
  assert.deepEqual(config.recover, [])
  assert.equal(config.css, '')
  const style = composeStyle(config)
  assert.ok(style.includes(OVERFLOW_FIX))
  assert.ok(!style.includes('edge'))
  assert.ok(!style.includes('--dsh-custom-css-probe'))
  assert.ok(!style.includes('--dsh-custom-css-report'))
  assert.ok(!style.includes('your css'))
})

test('the fix clips html and body so the document cannot scroll', () => {
  assert.match(OVERFLOW_FIX, /html\s*{[^}]*overflow:\s*hidden/)
  // body clips its content and is the containing block of absolutely positioned elements, so they are clipped too
  assert.match(OVERFLOW_FIX, /body\s*{[^}]*position:\s*relative[^}]*overflow:\s*clip/s)
})

test('the fix keeps body in normal flow, never in a fixed layer', () => {
  // iOS places fixed layers from its own viewport, which goes stale after a rotation: the app is drawn away from where taps land
  assert.doesNotMatch(OVERFLOW_FIX, /position:\s*fixed/)
  assert.doesNotMatch(OVERFLOW_FIX, /inset:/)
})

const SIDES = ['top', 'right', 'bottom', 'left']
/** The declarations of the first rule for `selector`, as a property → value map. */
function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(`(?:^|})\\s*${escaped}\\s*{([^}]*)}`).exec(css.replace(/\/\*.*?\*\//gs, ''))?.[1]
  assert.ok(block !== undefined, `no rule for ${selector}`)
  return Object.fromEntries(block.split(';').map(line => line.trim()).filter(Boolean).map((line) => {
    const colon = line.indexOf(':')
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  }))
}

test('the settings client.js acts on travel as custom properties, with what names the stylesheet', () => {
  const settings = rule(clientSettings({ edgeToEdge: true, report: true, recover: ['scroll', 'cover'] }, { build: 'b1', revision: 'r1' }), ':root')
  assert.deepEqual(settings, {
    '--dsh-custom-css-build': '"b1"',
    '--dsh-custom-css-revision': '"r1"',
    '--dsh-custom-css-edge': '1',
    '--dsh-custom-css-report': '1',
    '--dsh-custom-css-recover': 'scroll cover',
  })
  const off = rule(clientSettings({}, { build: 'b1', revision: 'r1' }), ':root')
  assert.deepEqual(Object.keys(off), ['--dsh-custom-css-build', '--dsh-custom-css-revision', '--dsh-custom-css-recover'])
  assert.equal(off['--dsh-custom-css-recover'], 'none')
  assert.deepEqual(Config({ recover: RECOVERIES }).recover, RECOVERIES)
  assert.throws(() => Config({ recover: ['pray'] }))
})

test('edge to edge comes after the overflow fix and before the user css', () => {
  const style = composeStyle({ fixOverflow: true, edgeToEdge: true, css: ':root { --edge-shell-right: 0px }' })
  assert.ok(style.indexOf(OVERFLOW_FIX) < style.indexOf(EDGE_TO_EDGE))
  assert.ok(style.indexOf(EDGE_TO_EDGE) < style.indexOf('--edge-shell-right: 0px'), 'user css can lower a shell inset')
})

test('edge to edge takes every inset from env(), and the shell keeps to them unless told otherwise', () => {
  const root = rule(EDGE_TO_EDGE, ':root')
  for (const side of SIDES) {
    assert.equal(root[`--edge-inset-${side}`], `env(safe-area-inset-${side}, 0px)`)
    assert.equal(root[`--edge-shell-${side}`], `var(--edge-inset-${side})`)
  }
  assert.doesNotMatch(EDGE_TO_EDGE.replace(/, 0px\)/g, ')'), /\d+px/, 'no inset is written down as a number')
})

test('edge to edge keeps body, and with it every fixed box, inside the shell insets', () => {
  const body = rule(EDGE_TO_EDGE, 'body')
  assert.equal(body.margin, SIDES.map(side => `var(--edge-shell-${side})`).join(' '))
  assert.equal(body.height, 'calc(100% - var(--edge-shell-top) - var(--edge-shell-bottom))')
  // the transform makes body the containing block of position: fixed descendants, so they stay in and get clipped with the rest
  assert.equal(body.transform, 'translate(0)')
})

test('edge to edge moves popups placed in window coordinates back by where body starts', () => {
  const popup = rule(EDGE_TO_EDGE, 'body > [style*="top:"][style*="left:"]')
  assert.equal(popup['margin-top'], 'calc(-1 * var(--edge-shell-top))')
  assert.equal(popup['margin-left'], 'calc(-1 * var(--edge-shell-left))')
  // not a translate: even at zero it changes how the popup is rasterised
  assert.equal(popup.translate, undefined)
})

test('edge to edge leaves the overflow fix alone: body stays in normal flow', () => {
  assert.doesNotMatch(EDGE_TO_EDGE, /position:/)
  assert.doesNotMatch(EDGE_TO_EDGE, /overflow/)
})

test('user css comes after the fix, so it can override it', () => {
  const style = composeStyle({ fixOverflow: true, css: 'body { color: red }' })
  assert.ok(style.indexOf('overflow: hidden') < style.indexOf('color: red'))
})

test('the fix can be turned off and only the user css remains', () => {
  const style = composeStyle({ fixOverflow: false, css: ' a { top: 0 } ' })
  assert.ok(!style.includes('overflow'))
  assert.match(style, /a \{ top: 0 \}/)
})

test('with nothing turned on the stylesheet holds the settings for client.js and no rule for the page', () => {
  const style = composeStyle({ fixOverflow: false, css: '  ' }, { build: 'b1', revision: 'r1' })
  assert.equal(style, `/* dsh-custom-css: settings for the browser half */\n${clientSettings({}, { build: 'b1', revision: 'r1' })}`)
  assert.deepEqual(style.replace(/\/\*.*?\*\//gs, '').match(/[^{}\s][^{}]*(?={)/g).map(selector => selector.trim()), [':root'])
})

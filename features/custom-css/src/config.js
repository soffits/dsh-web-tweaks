import z from '@deepseek-ai/schemastery'
import { RECOVERIES } from './style.js'

export const Config = z.object({
  fixOverflow: z.boolean().default(true)
    .description('Apply the built-in fix that keeps the whole page from scrolling (for example after a reconnect) by clipping html and body to the window.'),
  edgeToEdge: z.boolean().default(false)
    .description('Take the whole screen on a phone: the page reaches under the status bar and the home indicator, and DSH keeps inside the safe area by itself. An app already on the home screen has to be added again to pick it up. See the README.'),
  report: z.boolean().default(false)
    .description('Have each open page send what its browser reports (window, screen and viewport sizes, safe-area insets, display mode, the tags this plugin set, user agent) to this DSH, on load and whenever they change. Nothing is drawn. The lines are kept in custom-css/reports.jsonl under the DSH home, beside one for each time a page fetched the stylesheet. For diagnosing layout problems on a device you cannot look at.'),
  probe: z.boolean().default(false)
    .description('Draw the same readings over the page, with a mark where each tap lands. Shows on every device that has the page open; leave it off otherwise.'),
  recover: z.array(z.union(RECOVERIES.map(name => z.const(name)))).default([])
    .description('Experiment for iOS home-screen apps that come back from a rotation laid out for the other orientation, with an empty band along one edge: when a page sees that state, try these in order until one clears it (meta: rewrite the viewport tag; style: force a layout; scroll: scroll the window and back; reload: reload the page, once; cover: put DSH over the visible area for as long as the state lasts, so list it last). With `report` on, each try is reported before and after.'),
  css: z.string().role('textarea').default('')
    .description('Your own CSS, applied to the whole Web UI after the built-in fix. Reload the page after changing it.'),
})

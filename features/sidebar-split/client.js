/*
 * Browser half of dsh-sidebar-split. DSH's left sidebar stacks the global
 * panel list (Plugins, Cron tasks, every plugin's entry) above the
 * Workspaces browser, and the list never shrinks, so with many plugins the
 * workspaces get only what is left. This module turns the two into panes
 * split by a draggable sash, like VS Code's side bar: the list scrolls on its
 * own once it is shorter than its rows, the workspaces take the rest, and the
 * chosen split is kept per browser in localStorage.
 *
 * The sidebar offers no slot around these two blocks, so the module finds
 * them by structure: the `nav` panel list and the region area that follows
 * it inside the sidebar root. It only adds a sash element, data attributes
 * and one stylesheet, and removes all of them when it unloads. If a DSH
 * update renames those blocks, nothing is found and the sidebar stays as
 * shipped.
 *
 * Plain JavaScript in DSH's Client module format (no build step).
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-split',
  factory() {
    const STORAGE_KEY = 'dsh-sidebar-split'
    const STYLE_ID = 'dsh-sidebar-split-style'
    const SASH_CLASS = 'dsh-sidebar-split-sash'
    const ROOT_ATTR = 'data-sidebar-split'
    const CAPPED_ATTR = 'data-sidebar-split-capped'
    const HIDDEN_ATTR = 'data-sidebar-split-hidden'
    const DRAGGING_ATTR = 'data-sidebar-split-dragging'
    const RAIL_ATTR = 'data-sidebar-split-rail'
    const REGION_ATTR = 'data-sidebar-split-region'
    const LIST_VAR = '--dsh-sidebar-split-list'

    /** Share of the split area the panel list gets until the user picks one. */
    const DEFAULT_RATIO = 0.5
    /** Height the workspaces pane always keeps, in px. */
    const MIN_REGION = 96
    /** Dragging the list shorter than this hides it, in px. */
    const SNAP = 24
    /** Arrow-key step, in px. */
    const KEY_STEP = 24
    /** Pointer travel below which a press counts as a tap, in px. */
    const TAP_SLOP = 4
    /** Two taps closer than this toggle the list, in ms. */
    const DOUBLE_TAP_MS = 350

    const PANEL_LIST = 'nav[class*="_panelList"]'
    const REGION_CLASS = /(?:^|\s)[\w-]+_regionArea(?:\s|$)/
    const RAIL_CLASS = /(?:^|\s)[\w-]+_collapsed(?:\s|$)/

    const STYLE = `
[${ROOT_ATTR}] > nav {
  flex: 0 1 auto;
  min-height: 0;
  max-height: var(${LIST_VAR});
  margin-bottom: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
[${ROOT_ATTR}][${HIDDEN_ATTR}] > nav { visibility: hidden; }
.${SASH_CLASS} {
  position: relative;
  flex: none;
  height: 8px;
  margin-inline: calc(-1 * var(--dsh-sidebar-inline-padding, 8px));
  cursor: row-resize;
  touch-action: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.${SASH_CLASS}::before {
  content: "";
  position: absolute;
  left: calc(var(--dsh-sidebar-inline-padding, 8px) + var(--dsh-sidebar-paint-inset, 3px));
  right: calc(var(--dsh-sidebar-inline-padding, 8px) + var(--dsh-sidebar-paint-inset, 3px));
  top: calc(50% - 0.5px);
  height: 1px;
  border-radius: 1px;
  background: transparent;
  transition: background-color 0.1s ease-out, top 0.1s ease-out, height 0.1s ease-out;
}
[${CAPPED_ATTR}] > .${SASH_CLASS}::before { background: var(--dsw-alias-border-l2); }
@media (hover: hover) {
  .${SASH_CLASS}:hover::before {
    transition-delay: 0.3s;
    top: calc(50% - 1px);
    height: 2px;
    background: var(--dsw-alias-state-business-primary);
  }
}
.${SASH_CLASS}[data-active]::before,
.${SASH_CLASS}:focus-visible::before {
  transition-delay: 0s;
  top: calc(50% - 1px);
  height: 2px;
  background: var(--dsw-alias-state-business-primary);
}
@media (pointer: coarse) {
  .${SASH_CLASS} { height: 20px; }
  .${SASH_CLASS}::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 36px;
    height: 4px;
    margin: -2px 0 0 -18px;
    border-radius: 2px;
    background: var(--dsw-alias-border-l3);
  }
}
[${RAIL_ATTR}] > nav {
  flex: 0 1 auto;
  min-height: 0;
  margin-bottom: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
[${RAIL_ATTR}] > nav::-webkit-scrollbar { display: none; }
[${RAIL_ATTR}][${CAPPED_ATTR}] > nav {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 20px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 20px), transparent);
}
[${RAIL_ATTR}] > [${REGION_ATTR}] { flex: none; }
[${RAIL_ATTR}] > .${SASH_CLASS} {
  height: 24px;
  margin-inline: 0;
  cursor: default;
  pointer-events: none;
}
[${RAIL_ATTR}] > .${SASH_CLASS}::before {
  left: calc(50% - 10px);
  right: auto;
  width: 20px;
  background: var(--dsw-alias-border-l2);
}
[${RAIL_ATTR}] > .${SASH_CLASS}::after { display: none; }
html[${DRAGGING_ATTR}], html[${DRAGGING_ATTR}] * {
  cursor: row-resize !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
`

    /**
     * Height the panel list may take.
     * @param {{ ratio: number | null, hidden: boolean }} state - The saved choice; a null ratio means the default.
     * @param {{ total: number, natural: number }} size - Height shared by list and workspaces, and the list's full content height.
     * @returns {number} The list's maximum height in px.
     */
    function listLimit(state, { total, natural }) {
      if (state.hidden) return 0
      const room = Math.max(0, total - MIN_REGION)
      const wanted = (state.ratio ?? DEFAULT_RATIO) * total
      return Math.max(0, Math.round(Math.min(wanted, natural, room)))
    }

    /**
     * The state a drag or key press to a list height leads to.
     * @param {number} height - Requested list height in px.
     * @param {{ total: number, natural: number }} size - As for listLimit.
     * @returns {{ ratio: number | null, hidden: boolean }} Hidden below SNAP; ratio 1 once every row fits, so the list keeps showing all of them.
     */
    function stateForHeight(height, { total, natural }) {
      if (height < SNAP) return { ratio: null, hidden: true }
      const room = Math.max(0, total - MIN_REGION)
      if (height >= natural && natural <= room) return { ratio: 1, hidden: false }
      if (total <= 0) return { ratio: null, hidden: false }
      return { ratio: Math.min(height, room) / total, hidden: false }
    }

    /** @param {string | null} text - Stored JSON. */
    function parseState(text) {
      try {
        const value = JSON.parse(text ?? 'null')
        const ratio = typeof value?.ratio === 'number' && value.ratio >= 0 && value.ratio <= 1 ? value.ratio : null
        return { ratio, hidden: value?.hidden === true }
      } catch {
        return { ratio: null, hidden: false }
      }
    }

    /** Find every sidebar's panel list and the workspaces region that follows it. */
    function findSidebars(doc) {
      const found = []
      for (const nav of doc.querySelectorAll(PANEL_LIST)) {
        const root = nav.parentElement
        if (root === null) continue
        const region = Array.from(root.children).find((el) => el !== nav && REGION_CLASS.test(el.className))
        if (region !== undefined) found.push({ root, nav, region })
      }
      return found
    }

    /**
     * One sidebar's split: the sash, its pointer and keyboard handling, and
     * the list height it writes onto the sidebar root.
     */
    function createSplit(doc, parts, store) {
      let { root, nav, region } = parts
      const sash = doc.createElement('div')
      sash.className = SASH_CLASS
      sash.setAttribute('role', 'separator')
      sash.setAttribute('aria-orientation', 'horizontal')
      sash.setAttribute('aria-valuemin', '0')
      sash.setAttribute('aria-valuemax', '100')
      sash.tabIndex = 0

      let drag = null
      let lastTap = 0
      let frame = 0
      const win = doc.defaultView

      const size = () => ({
        total: nav.getBoundingClientRect().height + region.getBoundingClientRect().height,
        natural: nav.scrollHeight,
      })

      const place = () => {
        if (sash.previousElementSibling !== nav || sash.nextElementSibling !== region) root.insertBefore(sash, region)
        if (!region.hasAttribute(REGION_ATTR)) region.setAttribute(REGION_ATTR, '')
      }

      /** The icon rail: a fixed divider, panel icons scroll above it, workspace icons keep their height below. */
      const showRail = () => {
        if (root.hasAttribute(ROOT_ATTR)) {
          root.removeAttribute(ROOT_ATTR)
          root.removeAttribute(HIDDEN_ATTR)
          root.style.removeProperty(LIST_VAR)
        }
        if (!root.hasAttribute(RAIL_ATTR)) root.setAttribute(RAIL_ATTR, '')
        place()
        sash.tabIndex = -1
        sash.setAttribute('aria-hidden', 'true')
        root.toggleAttribute(CAPPED_ATTR, nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1)
      }

      const show = (state) => {
        if (RAIL_CLASS.test(root.className)) {
          showRail()
          return
        }
        if (root.hasAttribute(RAIL_ATTR)) root.removeAttribute(RAIL_ATTR)
        if (!root.hasAttribute(ROOT_ATTR)) root.setAttribute(ROOT_ATTR, '')
        place()
        sash.tabIndex = 0
        sash.removeAttribute('aria-hidden')
        if (nav.id === '') nav.id = `dsh-sidebar-split-list-${Math.random().toString(36).slice(2, 8)}`
        sash.setAttribute('aria-controls', nav.id)
        sash.setAttribute('aria-labelledby', nav.id)
        const geometry = size()
        const limit = listLimit(state, geometry)
        const value = `${limit}px`
        if (root.style.getPropertyValue(LIST_VAR) !== value) root.style.setProperty(LIST_VAR, value)
        root.toggleAttribute(CAPPED_ATTR, limit < geometry.natural - 1)
        root.toggleAttribute(HIDDEN_ATTR, state.hidden)
        const percent = geometry.total > 0 ? Math.round((limit / geometry.total) * 100) : 0
        sash.setAttribute('aria-valuenow', String(percent))
      }

      const sync = () => {
        frame = 0
        if (drag === null) show(store.get())
      }
      const schedule = () => {
        if (frame === 0) frame = win.requestAnimationFrame(sync)
      }

      const preview = (height) => {
        const state = stateForHeight(height, size())
        show(state)
        return state
      }

      const onPointerDown = (event) => {
        if (event.button !== 0 || root.hasAttribute(RAIL_ATTR)) return
        event.preventDefault()
        sash.setPointerCapture(event.pointerId)
        drag = { id: event.pointerId, y: event.clientY, height: nav.getBoundingClientRect().height, moved: false, state: store.get() }
        sash.setAttribute('data-active', '')
        doc.documentElement.setAttribute(DRAGGING_ATTR, '')
      }
      const onPointerMove = (event) => {
        if (drag === null || event.pointerId !== drag.id) return
        const dy = event.clientY - drag.y
        if (!drag.moved && Math.abs(dy) < TAP_SLOP) return
        drag.moved = true
        drag.state = preview(drag.height + dy)
      }
      const finish = (event) => {
        if (drag === null || event.pointerId !== drag.id) return
        const { moved, state } = drag
        drag = null
        sash.removeAttribute('data-active')
        doc.documentElement.removeAttribute(DRAGGING_ATTR)
        if (moved) {
          lastTap = 0
          store.set(state)
          return
        }
        if (event.type !== 'pointerup') return
        const now = event.timeStamp
        if (now - lastTap < DOUBLE_TAP_MS) {
          lastTap = 0
          store.toggle()
        } else {
          lastTap = now
        }
      }
      const onKeyDown = (event) => {
        if (root.hasAttribute(RAIL_ATTR)) return
        const height = listLimit(store.get(), size())
        let state
        if (event.key === 'ArrowUp') state = stateForHeight(height - KEY_STEP, size())
        else if (event.key === 'ArrowDown') state = stateForHeight(Math.max(height, SNAP) + KEY_STEP, size())
        else if (event.key === 'Home') state = { ...store.get(), hidden: true }
        else if (event.key === 'End') state = { ratio: 1, hidden: false }
        else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          store.toggle()
          return
        } else return
        event.preventDefault()
        store.set(state)
      }

      sash.addEventListener('pointerdown', onPointerDown)
      sash.addEventListener('pointermove', onPointerMove)
      sash.addEventListener('pointerup', finish)
      sash.addEventListener('pointercancel', finish)
      sash.addEventListener('lostpointercapture', finish)
      sash.addEventListener('keydown', onKeyDown)

      const resize = new win.ResizeObserver(schedule)
      const mutations = new win.MutationObserver(schedule)
      let scrolled = null
      const observe = () => {
        scrolled?.removeEventListener('scroll', schedule)
        scrolled = nav
        nav.addEventListener('scroll', schedule, { passive: true })
        resize.disconnect()
        mutations.disconnect()
        resize.observe(root)
        resize.observe(region)
        mutations.observe(root, { attributes: true, attributeFilter: ['class'] })
        mutations.observe(root, { childList: true })
        mutations.observe(nav, { childList: true, subtree: true })
      }
      observe()

      function detach() {
        sash.remove()
        region.removeAttribute(REGION_ATTR)
        root.removeAttribute(RAIL_ATTR)
        root.removeAttribute(ROOT_ATTR)
        root.removeAttribute(CAPPED_ATTR)
        root.removeAttribute(HIDDEN_ATTR)
        root.style.removeProperty(LIST_VAR)
      }

      return {
        root,
        /** Follow a re-rendered list or region inside the same root. */
        adopt(next) {
          if (next.nav === nav && next.region === region) return
          if (next.region !== region) region.removeAttribute(REGION_ATTR)
          nav = next.nav
          region = next.region
          observe()
          schedule()
        },
        connected: () => root.isConnected,
        refresh: schedule,
        apply: () => {
          if (drag === null) show(store.get())
        },
        dispose() {
          if (frame !== 0) win.cancelAnimationFrame(frame)
          resize.disconnect()
          mutations.disconnect()
          scrolled?.removeEventListener('scroll', schedule)
          if (drag !== null) doc.documentElement.removeAttribute(DRAGGING_ATTR)
          detach()
          if (nav.id.startsWith('dsh-sidebar-split-list-')) nav.removeAttribute('id')
        },
      }
    }

    /** The saved split, shared by every sidebar in the page and by other tabs. */
    function createStore(win, onChange) {
      const storage = (() => {
        try {
          return win.localStorage
        } catch {
          return null
        }
      })()
      let state = parseState(storage?.getItem(STORAGE_KEY) ?? null)
      const set = (next) => {
        state = { ratio: next.ratio, hidden: next.hidden }
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {
          // Private mode or a full quota: the split still applies until reload.
        }
        onChange()
      }
      return {
        get: () => state,
        set,
        toggle: () => set({ ratio: state.ratio, hidden: !state.hidden }),
        reload: () => {
          state = parseState(storage?.getItem(STORAGE_KEY) ?? null)
          onChange()
        },
      }
    }

    function start(doc) {
      const win = doc.defaultView
      const splits = new Map()
      const store = createStore(win, () => {
        for (const split of splits.values()) split.apply()
      })

      const style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = STYLE
      doc.head.appendChild(style)

      let frame = 0
      const scan = () => {
        frame = 0
        const seen = new Set()
        for (const parts of findSidebars(doc)) {
          seen.add(parts.root)
          const split = splits.get(parts.root)
          if (split === undefined) splits.set(parts.root, createSplit(doc, parts, store))
          else split.adopt(parts)
          splits.get(parts.root).refresh()
        }
        for (const [root, split] of splits) {
          if (!seen.has(root) || !split.connected()) {
            split.dispose()
            splits.delete(root)
          }
        }
      }
      const schedule = () => {
        if (frame === 0) frame = win.requestAnimationFrame(scan)
      }
      const touchesSidebar = (node) =>
        node.nodeType === 1 && (node.matches(PANEL_LIST) || node.querySelector(PANEL_LIST) !== null || REGION_CLASS.test(node.className))
      const page = new win.MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) if (touchesSidebar(node)) return schedule()
          for (const node of record.removedNodes) if (touchesSidebar(node)) return schedule()
        }
      })
      page.observe(doc.body, { childList: true, subtree: true })

      const onStorage = (event) => {
        if (event.key === STORAGE_KEY || event.key === null) store.reload()
      }
      win.addEventListener('storage', onStorage)
      scan()

      return () => {
        if (frame !== 0) win.cancelAnimationFrame(frame)
        page.disconnect()
        win.removeEventListener('storage', onStorage)
        for (const split of splits.values()) split.dispose()
        splits.clear()
        style.remove()
      }
    }

    return {
      inject: [],
      apply(ctx) {
        if (typeof document === 'undefined') return
        ctx.effect(() => start(document), 'sidebar-split: panes')
      },
      listLimit,
      stateForHeight,
      parseState,
    }
  },
})

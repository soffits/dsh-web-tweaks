/*
 * Browser half of dsh-subagent-model: a read-only model label in the composer
 * of subagent sessions.
 *
 * The shipped model picker owns the composer's one model seat and renders
 * nothing for subagent sessions, because their model cannot be switched. The
 * label goes into the neighbouring list slot, right before that seat, so the
 * shipped package stays untouched. The model and effort come from the same
 * per-session directory the picker reads (the session's recorded selection
 * resolved against the model catalog); the label never writes to it.
 *
 * Plain JavaScript in DSH's Client module format (no build step). React comes
 * from the page's module table. Styles use only the host theme tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-model',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useSyncExternalStore } = React

    const NS = 'dsh-subagent-model'
    const STYLE_ID = 'dsh-subagent-model'
    const SLOT = 'conversation.input.right'

    const en = {
      aria: 'Model: {model}',
      ariaEffort: 'Model: {model}, reasoning {effort}',
    }
    const zh = {
      aria: '模型：{model}',
      ariaEffort: '模型：{model}，推理强度 {effort}',
    }

    // Same box as the shipped model seat's trigger, minus the hover and the chevron.
    const CSS = `
.dsm-label{box-sizing:border-box;display:flex;align-items:center;gap:4px;min-width:0;max-width:360px;height:28px;padding:0 8px;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:400;line-height:20px;cursor:default;user-select:none;-webkit-user-select:none}
.dsm-model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-effort{min-width:0;flex-shrink:1000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption)}
`

    /**
     * The model and effort names a directory snapshot stands for, resolved
     * the way the shipped seat does it (catalog name, effort level name,
     * the model's default effort when none is recorded). A model the catalog
     * does not list shows its id. Nothing until a selection is known.
     */
    function describe(snapshot) {
      const current = snapshot?.current
      if (current === null || current === undefined) return undefined
      const group = snapshot.groups?.find(item => item.id === current.provider)
      const model = group?.models?.find(item => item.id === current.model)
      const reasoning = model?.reasoning
      const effort = current.reasoningEffort ?? reasoning?.defaultEffort
      const effortName = effort === undefined
        ? undefined
        : reasoning?.efforts?.find(level => level.id === effort)?.name ?? effort
      return { model: model?.name ?? current.model, effort: effortName }
    }

    function Label({ t, store }) {
      const snapshot = useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot())
      const shown = describe(snapshot)
      if (shown === undefined) return null
      const title = shown.effort === undefined ? shown.model : `${shown.model} · ${shown.effort}`
      const aria = shown.effort === undefined
        ? t('aria', { model: shown.model })
        : t('ariaEffort', { model: shown.model, effort: shown.effort })
      return h('span', { className: 'dsm-label', title, 'aria-label': aria, 'data-provider-id': snapshot.current.provider, 'data-model-id': snapshot.current.model },
        h('span', { className: 'dsm-model' }, shown.model),
        shown.effort === undefined ? null : h('span', { className: 'dsm-effort' }, shown.effort))
    }

    /** Only subagent sessions get a label; the shipped seat covers the rest. */
    function SubagentModel({ t, sessionId, sessions, modelDirectories }) {
      if (sessionId === undefined || sessions.subagentAddress(sessionId) === undefined) return null
      let directory
      try {
        directory = modelDirectories.directoryFor(sessionId)
      } catch {
        return null
      }
      return h(Label, { t, store: directory.store })
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'modelDirectories'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [ctx.locale.register(NS, 'en', en), ctx.locale.register(NS, 'zh', zh)]
          return () => { for (const dispose of disposers) dispose() }
        }, 'subagent-model: dictionaries')
        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return () => {}
          const tag = document.createElement('style')
          tag.id = STYLE_ID
          tag.dataset.plugin = NS
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'subagent-model: styles')

        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: 'subagent-model',
          order: 1000,
          locale: NS,
          inject: sessionId => ({ t, sessionId, sessions: ctx.sessions, modelDirectories: ctx.modelDirectories }),
        }, SubagentModel))
      },
    }
  },
})

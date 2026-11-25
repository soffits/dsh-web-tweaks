/*
 * Browser half of dsh-file-download. DSH 0.2.2 can download a Session file
 * only from its context menu, which opens on right-click or the keyboard, so
 * a phone has no way to reach it. This module adds a visible Download button
 * to the document preview: in its header next to the open-in-app control, and
 * in the empty state of a file the preview cannot show (a zip, an installer).
 *
 * The download itself is DSH's own `fileActions.save(source, 'download')`,
 * the same operation the context menu runs. The bytes come from the
 * authorized `workspaceFiles.readBytes` Remote in bounded windows, so a file
 * above the Host's complete-file cap still downloads.
 *
 * Plain JavaScript in DSH's Client module format (no build step).
 */
window.__ModuleLoader__.load({
  id: 'dsh-file-download',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { Button, Tooltip, IconDownloadOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')

    const NS = 'fileDownload'
    const STYLE_ID = 'dsh-file-download-style'
    /** First window size: the Host's default per-window cap (`maxBytes`). */
    const WINDOW_BYTES = 2 * 1024 * 1024

    const en = {
      download: 'Download',
      downloading: 'Preparing download…',
      started: 'Download started',
      failed: 'Could not download the file. Try again.',
    }
    const zh = {
      download: '下载',
      downloading: '正在准备下载…',
      started: '已开始下载',
      failed: '无法下载文件，请重试',
    }

    /** Media types for the suffixes people most often download; the rest go as bytes. */
    const MEDIA_TYPES = {
      pdf: 'application/pdf', zip: 'application/zip', json: 'application/json', txt: 'text/plain',
      md: 'text/markdown', csv: 'text/csv', html: 'text/html', png: 'image/png', jpg: 'image/jpeg',
      jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg',
      mp4: 'video/mp4', mov: 'video/quicktime', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ipa: 'application/octet-stream', apk: 'application/vnd.android.package-archive',
    }

    /**
     * The file name a path ends in, for POSIX and Windows paths alike.
     * @param path - absolute path in the file's execution environment.
     * @returns the last path segment.
     */
    function basenameOf(path) {
      const trimmed = path.replace(/[\\/]+$/u, '')
      return trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1)
    }

    /**
     * Media type for a file name, or '' when unknown (the download keeps its name then).
     * @param name - file name.
     * @returns the MIME type or ''.
     */
    function mediaTypeOf(name) {
      const dot = name.lastIndexOf('.')
      return dot <= 0 ? '' : MEDIA_TYPES[name.slice(dot + 1).toLowerCase()] ?? ''
    }

    /**
     * The original's authenticated URL (DSH's `/api/file` route), which names
     * the source; the bytes themselves come from `read`.
     * @param path - absolute file path.
     * @returns an absolute URL beside the app.
     */
    function fileUrl(path) {
      const base = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI
      return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href
    }

    /**
     * A signal that aborts when either input does.
     * @param first - one signal.
     * @param second - the other.
     * @returns the combined signal.
     */
    function eitherSignal(first, second) {
      const controller = new AbortController()
      for (const signal of [first, second]) {
        if (signal.aborted) controller.abort(signal.reason)
        else signal.addEventListener('abort', () => { controller.abort(signal.reason) }, { once: true })
      }
      return controller.signal
    }

    /**
     * Read a whole file through bounded `readBytes` windows. A Host with a
     * tighter window cap answers `workspace-file/too-large` with its limit,
     * and the walk continues at that size.
     * @param readBytes - `remote.workspaceFiles.readBytes`.
     * @param sessionId - Session whose filesystem authorizes the read.
     * @param path - absolute file path.
     * @param mediaType - type recorded on the Blob.
     * @param signal - cancels the walk.
     * @returns the file's bytes.
     */
    async function readWhole(readBytes, sessionId, path, mediaType, signal) {
      const parts = []
      let offset = 0
      let length = WINDOW_BYTES
      for (;;) {
        signal.throwIfAborted()
        const result = await readBytes(sessionId, path, { range: { offset, length } }, signal)
        if (!result.ok) {
          const limit = result.error?.code === 'workspace-file/too-large' ? result.error.details?.limit : undefined
          if (Number.isSafeInteger(limit) && limit > 0 && limit < length) {
            length = limit
            continue
          }
          throw new Error(`File read failed: ${result.error?.code ?? 'unknown'}`)
        }
        const data = result.value.data
        if (data.byteLength > 0) parts.push(data)
        offset += data.byteLength
        if (result.value.eof || data.byteLength === 0) break
      }
      return new Blob(parts, { type: mediaType })
    }

    /** Header button sized like the preview's other 24px icon controls. */
    const CSS = `
.dsh-fd-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
  padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.dsh-fd-icon:hover:not(:disabled) { background: var(--dsw-alias-button-ghost-bg-hover, rgba(127, 127, 127, 0.14)); }
.dsh-fd-icon:disabled { opacity: 0.5; cursor: default; }
.dsh-fd-icon svg { width: 16px; height: 16px; }
`

    function installStyle() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.append(style)
      return () => { style.remove() }
    }

    /**
     * Shared gesture state of one control: one download at a time, cancelled on unmount.
     * @param props - slot props with the injected `start`.
     * @returns busy flag and the click handler.
     */
    function useDownload(props) {
      const [busy, setBusy] = React.useState(false)
      const running = React.useRef(null)
      React.useEffect(() => () => { running.current?.abort() }, [])
      const onClick = React.useCallback(() => {
        if (running.current !== null) return
        const controller = new AbortController()
        running.current = controller
        setBusy(true)
        void props.start(props.absolutePath, controller.signal).finally(() => {
          if (running.current === controller) running.current = null
          if (!controller.signal.aborted) setBusy(false)
        })
      }, [props.absolutePath, props.start])
      return { busy, onClick }
    }

    /** Icon button in the document header. */
    function HeaderDownload(props) {
      const { busy, onClick } = useDownload(props)
      if (typeof props.absolutePath !== 'string') return null
      const label = busy ? props.t('downloading') : props.t('download')
      return React.createElement(Tooltip, { portal: true, label, side: 'bottom', delayMs: 500 },
        React.createElement('button', {
          type: 'button', className: 'dsh-fd-icon', disabled: busy, 'aria-label': label,
          'data-file-download': 'header', onClick,
        }, React.createElement(IconDownloadOutlineRegular, null)))
    }

    /** Labelled button in the empty state of a file the preview cannot show. */
    function EmptyDownload(props) {
      const { busy, onClick } = useDownload(props)
      if (typeof props.absolutePath !== 'string') return null
      return React.createElement(Button, {
        variant: 'outline', disabled: busy, 'data-file-download': 'empty', onClick,
        icon: React.createElement(IconDownloadOutlineRegular, null),
      }, busy ? props.t('downloading') : props.t('download'))
    }

    const inject = ['slots', 'locale', 'fileActions', 'contextMenus', 'remote', 'remote.workspaceFiles']

    /**
     * Register the dictionaries and both Download controls for the plugin's lifetime.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(installStyle, 'file-download: style')
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'file-download: dictionaries')
      const t = ctx.locale.bind(NS)
      const injected = (sessionId) => ({
        start: async (absolutePath, signal) => {
          const name = basenameOf(absolutePath)
          const mediaType = mediaTypeOf(name)
          try {
            const result = await ctx.fileActions.save({
              url: fileUrl(absolutePath), name, mediaType,
              read: (readSignal) => readWhole(
                (...args) => ctx.remote.workspaceFiles.readBytes(...args), sessionId, absolutePath, mediaType,
                eitherSignal(signal, readSignal)),
            }, 'download')
            if (result.status !== 'cancelled') ctx.contextMenus.notify(t('started'), true)
          } catch (error) {
            if (signal.aborted) return
            console.warn('dsh-file-download:', error)
            ctx.contextMenus.notify(t('failed'), false)
          }
        },
      })
      for (const [name, component] of [
        ['sidebar.right.tab.document.actions', HeaderDownload],
        ['sidebar.right.tab.document.unpreviewable', EmptyDownload],
      ]) {
        ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({
          name, id: 'file-download', order: 100, locale: NS, inject: injected,
        }, component)), `file-download: ${name}`)
      }
    }

    exports.apply = apply
    exports.inject = inject
    exports.basenameOf = basenameOf
    exports.mediaTypeOf = mediaTypeOf
    exports.readWhole = readWhole
    return module.exports
  },
})

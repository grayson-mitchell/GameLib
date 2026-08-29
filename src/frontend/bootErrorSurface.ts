/**
 * i18n-gate-exempt: this module renders the renderer's bootstrap-failure
 * surface and runs BEFORE i18next.init() completes, so no t() call here can
 * resolve -- its English strings are deliberate and permanent (D-14, D-19).
 */

/**
 * Dependency-free on-page error surface (Phase 27 Plan 05 blank-screen fix).
 *
 * The Tauri dev webview exposes no right-click "Inspect" on macOS, so any uncaught
 * error during renderer bootstrap otherwise leaves a SILENT blank white page with no
 * way to read the cause. This module installs global `error` / `unhandledrejection`
 * handlers that render the actual error text straight into `#root`, so the failure is
 * visible on-screen even without devtools.
 *
 * It must be the FIRST import of the renderer entry (`index.tsx`): ES modules evaluate
 * imports depth-first in declaration order, so registering these handlers here — in a
 * module with ZERO imports — guarantees they are live before any other module in the
 * bundle evaluates, and can therefore catch import-time throws (e.g. a `window.api`
 * that was never attached because Tauri detection failed).
 *
 * No-op in normal operation; was equally harmless back when this ran in the Electron build.
 */

/**
 * Mirrors `UNPORTED_CHANNEL_MARKER` in `common/types/sidecarTransport.ts`.
 *
 * Deliberately duplicated as a literal instead of imported: this module's zero-import
 * property is load-bearing (see the header) and was proven so the hard way — Rollup's
 * chunking reorders module evaluation across chunk boundaries, so every import here is a
 * chance for these handlers to register too late to catch the very errors they exist for.
 * A one-word string is a cheap price for keeping that guarantee absolute. If the constant
 * ever changes, this must change with it.
 */
const UNPORTED_CHANNEL_MARKER = '[GAMELIB_UNPORTED_CHANNEL]'

function renderBootError(context: string, error: unknown): void {
  try {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}\n\n${error.stack ?? '(no stack)'}`
        : String(error)

    // An unported channel is a documented seam gap, not a bootstrap failure. Much of the
    // frontend invokes channels at module scope with an uncaught `.then()` — harmless under
    // Electron (every handler exists), an unhandled rejection against the skeleton sidecar.
    // Hijacking the page for those would make the walking skeleton unusable until all ~217
    // endpoints are ported, which is precisely what this phase defers. Log and move on.
    if (message.includes(UNPORTED_CHANNEL_MARKER)) {
      console.warn(
        `[GameLib] unported channel called during ${context} — expected seam gap ` +
          `(see SEAM.md § Deferred), continuing:`,
        message
      )
      return
    }

    // Never clobber an already-mounted app. Once React has rendered, a late error belongs in
    // the console, not painted over a working UI — this surface exists for the pre-mount
    // blank-page case where there is nothing else to look at.
    const root = document.getElementById('root')
    if (root && root.childElementCount > 0) {
      console.error(`[GameLib] post-mount error (${context}):`, error)
      return
    }
    const escaped = message.replace(/[&<>]/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
    )
    const el = document.getElementById('root') ?? document.body
    if (el) {
      el.innerHTML =
        '<pre style="white-space:pre-wrap;margin:0;padding:24px;height:100vh;' +
        'box-sizing:border-box;overflow:auto;font:12px/1.5 ui-monospace,SFMono-Regular,' +
        'Menlo,monospace;color:#ff8a8a;background:#141414">' +
        `GameLib renderer bootstrap error (${context}):\n\n${escaped}</pre>`
    }
  } catch {
    // Last resort — if even this fails there is nothing more we can do.
  }
}

window.addEventListener('error', (event: ErrorEvent) => {
  renderBootError('window.error', event.error ?? event.message)
})

window.addEventListener(
  'unhandledrejection',
  (event: PromiseRejectionEvent) => {
    renderBootError('unhandledrejection', event.reason)
  }
)

export {}

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
 * No-op in normal operation; harmless under Electron.
 */

function renderBootError(context: string, error: unknown): void {
  try {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}\n\n${error.stack ?? '(no stack)'}`
        : String(error)
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

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  renderBootError('unhandledrejection', event.reason)
})

export {}

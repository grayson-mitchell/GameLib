import i18next from 'i18next'

/**
 * CR-04 (Phase 34.1 code review): a translation lookup that survives an UNINITIALIZED
 * i18next instance.
 *
 * `handleExit` became sidecar-reachable this slice (`appShellFlowRegistration.ts`
 * registers `ipcMain.on('quit', ...)`), and the headless sidecar never runs the
 * `i18next.use(Backend).init({...})` call that lives inside `main.ts`'s
 * `app.whenReady()` block. On an uninitialized instance `i18next.t(key, fallback)`
 * returns `undefined` -- the fallback argument does NOT save it (verified against the
 * installed i18next 22.5.1). Those `undefined`s crossed the wire as JSON `null` and
 * `main.rs`'s `dialog_message` arm renders them via `.unwrap_or("")`, so the user was
 * shown a BLANK message with TWO BLANK BUTTONS on the quit-confirm -- with no way to
 * tell which one cancels, on a dialog whose other branch kills in-flight downloads.
 *
 * Under Electron i18next IS initialized, so this returns the real translation and
 * behaviour is unchanged.
 */
export function tOrFallback(key: string, fallback: string): string {
  try {
    const translated: unknown = i18next.t(key, fallback)
    return typeof translated === 'string' && translated.length > 0
      ? translated
      : fallback
  } catch {
    return fallback
  }
}

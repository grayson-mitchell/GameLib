import { Runner } from 'common/types'

// Not exported: used only within this module (same ts-prune precedent as
// `repairFailure.ts`).
interface ToggleShortcutsOptions {
  hasShortcuts: boolean
  appName: string
  runner: Runner
  setHasShortcuts: (exists: boolean) => void
  setBusy: (busy: boolean) => void
}

/**
 * Todo `2026-10-12-gamesubmenu-shows-remove-shortcuts-before-the-write-is-known`
 * (quick 261012-ca6).
 *
 * GameSubMenu used to flip `hasShortcuts` the moment it fired the send-kind
 * `addShortcut`/`removeShortcut`, before anyone knew whether the write worked,
 * so a failed add left the menu reading "Remove shortcuts" and a second click
 * ran the remove path against shortcuts that were never written.
 *
 * Both channels are invoke-kind now and resolve whether a shortcut exists on
 * disk once the work has settled. That answer, and nothing else, sets the
 * state. It is "do shortcuts exist now", not "did the call succeed": a partial
 * write (one of two files written) shows "Remove shortcuts" because a
 * removable shortcut exists, and an add that wrote nothing does not flip.
 * `result === true` keeps a malformed reply from flipping the state.
 *
 * A rejection (a broken transport, or the shell's 60 s invoke bound) leaves the
 * state unchanged. The sidecar still toasts when the work completes, and the
 * remount probe (`shortcutsExists`) corrects any drift.
 *
 * `setBusy(false)` runs in `finally`, so the spinner cannot stick. This never
 * rethrows: React does not await an onClick promise, so a rethrow would become
 * an unhandled rejection.
 */
export async function toggleShortcuts({
  hasShortcuts,
  appName,
  runner,
  setHasShortcuts,
  setBusy
}: ToggleShortcutsOptions): Promise<void> {
  setBusy(true)
  const channel = hasShortcuts ? 'removeShortcut' : 'addShortcut'

  try {
    const result = hasShortcuts
      ? await window.api.removeShortcut(appName, runner)
      : await window.api.addShortcut(appName, runner, true)

    setHasShortcuts(result === true)
  } catch (error) {
    let errorText = '<unstringifiable error>'
    try {
      errorText =
        error instanceof Error ? (error.stack ?? error.message) : String(error)
    } catch {
      // keep the fallback errorText
    }

    try {
      // `error` is passed as a second ARGUMENT, not interpolated, so the
      // console formats it lazily and a hostile value cannot break the line.
      console.error(`${channel} failed for ${appName}:`, error)
    } catch {
      // the log call below must still run
    }

    try {
      window.api.logError(`${channel} failed for ${appName}: ${errorText}`)
    } catch (logErr) {
      try {
        console.error(
          'logError failed while reporting a shortcut failure:',
          logErr
        )
      } catch {
        // nothing left to try
      }
    }
  } finally {
    setBusy(false)
  }
}

import type { Runner } from 'common/types'

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`).
interface ToggleShortcutsOptions {
  appName: string
  runner: Runner
  hasShortcuts: boolean
  setHasShortcuts: (value: boolean) => void
}

/**
 * Add or remove a game's desktop/start-menu shortcuts and flip the menu label from the RESOLVED
 * outcome only (todo `2026-10-12-gamesubmenu-shows-remove-shortcuts-before-the-write-is-known`,
 * quick 261012-f05).
 *
 * `addShortcut`/`removeShortcut` are invoke-kind and resolve `true` only once the sidecar's write
 * succeeded. The check is a strict `=== true` on purpose: the Rust shell floors a missing result
 * at `Value::Null`, and a stale bundle could resolve `undefined`; neither may read as success.
 * A `false` (the sidecar already toasted the add failure and logged both) leaves the label alone.
 *
 * A rejection (the 60 s invoke bound, a dead sidecar) is caught, logged to the renderer console
 * and leaves the label alone. No user-facing text is added here: the sidecar toasts every write
 * failure it can see, and this path means the transport itself failed, so there is no new i18n
 * string and no l10n fill is needed.
 */
export async function toggleShortcuts({
  appName,
  runner,
  hasShortcuts,
  setHasShortcuts
}: ToggleShortcutsOptions): Promise<void> {
  const channel = hasShortcuts ? 'removeShortcut' : 'addShortcut'
  try {
    const ok = hasShortcuts
      ? await window.api.removeShortcut(appName, runner)
      : await window.api.addShortcut(appName, runner, true)

    if (ok === true) {
      setHasShortcuts(!hasShortcuts)
    }
  } catch (error) {
    console.error(`${channel} failed for ${appName}:`, error)
  }
}

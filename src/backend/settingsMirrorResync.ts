import type { AppSettings } from 'common/types'
import type { GlobalConfigSlice } from './config'
import type { Stores } from './services/types'

/**
 * Merge config.json settings into the store/config.json `settings` mirror.
 * config.json wins on every key it holds; keys only the mirror holds survive
 * (renderer readers such as settingsState.readInitialSettings and authState
 * read the mirror and must not lose anything). Copying getSettings() also
 * delivers config.json-derived keys (focusRow, trayIconVariant migration
 * result, defaultWinePrefixDir) into the mirror, which is the CR-01 intent in
 * common/focusRowMigration.ts (config.json authoritative); writeConfig in
 * backend/utils.ts already spreads the full config into the mirror the same
 * way. Pure: mutates neither input.
 */
export function mergeSettingsMirror(
  mirror: Record<string, unknown> | undefined | null,
  settings: AppSettings
): Record<string, unknown> {
  return { ...(mirror ?? {}), ...settings }
}

/**
 * store/config.json `settings` is a write-through mirror that was never
 * resynced at boot, so a hand edit (74 UAT item 20/28) drifted silently from
 * config.json defaultSettings, which is what Settings and checkGameUpdates
 * actually read (quick 261114-l1j). Called once from the sidecar 'config'
 * boot step.
 *
 * Synchronous and wholly guarded: a failure logs and returns, it never fails
 * boot. Opens no timer, watcher, promise or handle (sidecar exit contract).
 */
export function resyncSettingsMirror(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  configStore: Pick<Stores['kvs']['configStore'], 'get_nodefault' | 'set'>
  logError: (msg: string, err: unknown) => void
}): void {
  try {
    const mirror = deps.configStore.get_nodefault('settings') as
      | Record<string, unknown>
      | undefined
    const merged = mergeSettingsMirror(mirror, deps.config.getSettings())
    if (JSON.stringify(merged) !== JSON.stringify(mirror)) {
      deps.configStore.set('settings', merged as never)
    }
  } catch (error) {
    deps.logError('[bootstrap] settings mirror resync failed', error)
  }
}

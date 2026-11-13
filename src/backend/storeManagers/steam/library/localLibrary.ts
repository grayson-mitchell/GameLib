import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import { refreshInstallState } from './refresh'

/**
 * Restore the cached Steam library plus live local install state into the
 * backend library map without any sync (UAT 23).
 *
 * Under Tauri `SteamLibraryManager.init()` never runs, so the backend map is
 * otherwise filled only by a full authenticated sync in `refresh()`. Signed
 * out, that map stays empty: launches and `detectSteamUpdates` (which iterates
 * the map) see nothing. Every `refresh()` exit that does not sync calls this.
 *
 * Scope: seeds from the persisted cache of the last successful sync and
 * reconciles install state from ACFs. It does not enumerate ACF-only apps (that
 * would surface Steamworks redistributables); a signed-out profile always had
 * a prior sync. Issues no CM logon and starts no timer or handle.
 */
export async function restoreLocalSteamLibrary(
  deps: ManagerDeps,
  opts?: { pushAll?: boolean }
): Promise<{ seeded: number }> {
  const library = deps.steamSession.libraryState.library
  let seeded = 0
  if (library.size === 0) {
    const cached = deps.stores.steam.steamLibraryStore.get('games', [])
    for (const g of cached) {
      library.set(g.app_name, g)
      deps.sendFrontendMessage('pushGameToLibrary', g)
    }
    seeded = cached.length
    if (seeded > 0) {
      logInfo(
        `Steam: loaded ${seeded} games from cache (no library sync this pass)`,
        LogPrefix.Steam
      )
    }
  } else if (opts?.pushAll) {
    for (const g of library.values()) {
      deps.sendFrontendMessage('pushGameToLibrary', g)
    }
  }
  try {
    await refreshInstallState(deps)
  } catch (err) {
    logWarning(
      ['Steam: local install-state reconcile failed:', err],
      LogPrefix.Steam
    )
  }
  return { seeded }
}

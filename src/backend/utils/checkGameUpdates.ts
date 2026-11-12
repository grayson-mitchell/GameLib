/**
 * Runner-generic update-check (Phase 30 Plan 02, D-05b/D-12).
 *
 * Extracted verbatim from `backend/main.ts`'s inline `checkGameUpdates` invoke
 * handler body so both the Electron build and the Tauri sidecar's
 * `installFlowRegistration.ts` import ONE shared implementation, rather than
 * forking update-check behavior between the two builds.
 *
 * D-05b: the map's import cost is already sunk in the sidecar —
 * `steamFlowRegistration.ts`'s load-bearing first `import '../storeManagers'`
 * (the 27-05 circular-init fix) already force-constructs all six
 * the library manager map entries before any curated registration module (this
 * one included) is ever imported. A Steam-only reshape of this handler would
 * therefore buy zero import-graph savings and would only fork the Tauri
 * build's update-check behavior from Electron's for no benefit.
 *
 * Phase 74 D-02: only `listAutoUpdateableGames` (when a runner defines it) feeds
 * `autoUpdate`; Steam-registered stale games stay badge-only by construction.
 *
 * D-12: consistent with D-05b, this stays runner-generic (iterates every
 * entry in the library manager map) in both builds, not Steam-only.
 */

import type { GlobalConfigSlice } from 'backend/config'
import { logWarning, LogPrefix } from 'backend/logger'
import type { LibraryManager } from 'common/types/game_manager'
import type { StoreManagers } from 'backend/services/types'

/** R1 slice: the per-runner managers and the auto-update queueing. */
export interface CheckGameUpdatesDeps {
  managers: Pick<StoreManagers, 'library' | 'autoUpdate'>
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

export async function checkGameUpdates(
  deps: CheckGameUpdatesDeps
): Promise<string[]> {
  const { library, autoUpdate } = deps.managers
  let oldGames: string[] = []
  const { autoUpdateGames } = deps.config.getSettings()
  for (const runner of Object.keys(library) as (keyof typeof library)[]) {
    // WR-05: per-runner isolation. This loop was extracted verbatim from main.ts,
    // where it was unguarded: ONE runner whose CLI or credentials are missing
    // rejected the whole call and discarded the results already collected from the
    // other five. D-12 keeps this runner-generic in both builds, which makes the
    // partial-failure case the normal case (a user signed into Steam only has no
    // legendary/gogdl/nile credentials at all), so the results of the runners that
    // DID answer must survive.
    try {
      const badge = await library[runner].listUpdateableGames()
      if (autoUpdateGames) {
        const manager: LibraryManager = library[runner]
        const autoSource = manager.listAutoUpdateableGames
          ? await manager.listAutoUpdateableGames()
          : badge
        // autoUpdate's return value is never observed (it forEach(async)s);
        // the badge list is always the full list.
        autoUpdate(
          runner,
          autoSource.filter((a) => badge.includes(a))
        )
      }
      oldGames = [...oldGames, ...badge]
    } catch (error) {
      logWarning(
        [`checkGameUpdates: ${runner} failed to list updateable games:`, error],
        LogPrefix.Backend
      )
    }
  }

  return oldGames
}

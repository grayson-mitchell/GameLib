/**
 * Runner-generic update-check (Phase 30 Plan 02, D-05b/D-12).
 *
 * Extracted verbatim from `backend/main.ts`'s inline `checkGameUpdates` invoke
 * handler body so both the Electron build and the Tauri sidecar's
 * `installFlowRegistration.ts` import ONE shared implementation, rather than
 * forking update-check behavior between the two builds.
 *
 * D-05b: `libraryManagerMap`'s import cost is already sunk in the sidecar —
 * `steamFlowRegistration.ts`'s load-bearing first `import '../storeManagers'`
 * (the 27-05 circular-init fix) already force-constructs all six
 * `libraryManagerMap` entries before any curated registration module (this
 * one included) is ever imported. A Steam-only reshape of this handler would
 * therefore buy zero import-graph savings and would only fork the Tauri
 * build's update-check behavior from Electron's for no benefit.
 *
 * D-12: consistent with D-05b, this stays runner-generic (iterates every
 * entry in `libraryManagerMap`) in both builds, not Steam-only.
 */

import { GlobalConfig } from 'backend/config'
import { logWarning, LogPrefix } from 'backend/logger'
import { autoUpdate, libraryManagerMap } from 'backend/storeManagers'

export async function checkGameUpdates(): Promise<string[]> {
  let oldGames: string[] = []
  const { autoUpdateGames } = GlobalConfig.get().getSettings()
  for (const runner of Object.keys(
    libraryManagerMap
  ) as (keyof typeof libraryManagerMap)[]) {
    // WR-05: per-runner isolation. This loop was extracted verbatim from main.ts,
    // where it was unguarded: ONE runner whose CLI or credentials are missing
    // rejected the whole call and discarded the results already collected from the
    // other five. D-12 keeps this runner-generic in both builds, which makes the
    // partial-failure case the normal case (a user signed into Steam only has no
    // legendary/gogdl/nile credentials at all), so the results of the runners that
    // DID answer must survive.
    try {
      let gamesToUpdate = await libraryManagerMap[runner].listUpdateableGames()
      if (autoUpdateGames) {
        gamesToUpdate = autoUpdate(runner, gamesToUpdate)
      }
      oldGames = [...oldGames, ...gamesToUpdate]
    } catch (error) {
      logWarning(
        [`checkGameUpdates: ${runner} failed to list updateable games:`, error],
        LogPrefix.Backend
      )
    }
  }

  return oldGames
}

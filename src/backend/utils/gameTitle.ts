/**
 * Quick task 260905-mv5 (D-02): the single title-fallback chain for every
 * backend consumer that reads a possibly-`{}` Steam `GameInfo` (D-01, the
 * cross-runner sentinel `getGameInfo()` can return on a double cache miss --
 * kept as-is, not relitigated here).
 *
 * Relocated out of `backend/downloadmanager/utils.ts` (where `resolveGameTitle`
 * originated, quick task 260905-luf) so `backend/utils.ts` can reach the same
 * fallback logic without importing `backend/downloadmanager/utils.ts` --
 * that module itself imports FROM `backend/utils.ts` (`downloadFile`,
 * `isEpicServiceOffline`, `sendGameStatusUpdate`), so a runtime import in the
 * other direction would close a cycle (HAZARD B, plan evidence).
 *
 * This module is deliberately ZERO-RUNTIME-IMPORT: every import below is
 * `import type`, erased entirely at compile time. That is what makes it
 * cycle-free to import from `backend/utils.ts` -- there is nothing here for
 * a bundler or the CommonJS loader to actually load at runtime, only type
 * information.
 */

import type { GameInfo, Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'

// Type-only reference, erased at compile time -- mirrors the identical
// pattern already established in downloadmanager/utils.ts to avoid a
// runtime import of backend/storeManagers here.
type LibraryManagerMap =
  typeof import('backend/storeManagers').libraryManagerMap

/**
 * The one fallback chain every title consumer in this file delegates to.
 * `live` wins when present (truthy); else `fallback`; else the raw
 * `appName`. Never returns an empty string when `appName` is non-empty: an
 * empty-string `live` (falsy) is treated as absent, same as `undefined`.
 */
function pickTitle(
  live: string | undefined,
  appName: string,
  fallback?: string
): string {
  return live || fallback || appName
}

/**
 * Quick task 260905-luf (D-01): the single fallback chain for every
 * DownloadManager title consumer that reads a possibly-`{}` Steam GameInfo.
 * Re-exported unchanged (same name, same signature, same behaviour) from
 * `backend/downloadmanager/utils.ts` so its 3 existing `jest.mock()` callers
 * (`downloadqueue.test.ts`, `downloadQueueFlows.test.ts`, `utils.test.ts`)
 * keep working without modification.
 */
export function resolveGameTitle(
  libraryManagerMap: LibraryManagerMap,
  runner: Runner,
  appName: string,
  fallback?: GameInfo
): string {
  const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()
  return pickTitle(title, appName, fallback?.title)
}

/**
 * Quick task 260905-mv5 (D-02/D-03, sites 1 and 2): the `Game`-instance
 * counterpart of `resolveGameTitle` above, for the two callers
 * (`askForceUninstall` in `backend/utils.ts`, `uninstallGameCallback` in
 * `backend/utils/uninstaller.ts`) that already hold a `Game` object and
 * only need its title for a user-facing DISPLAY STRING (a dialog title or
 * an OS notification title) -- never a filesystem path component. Sites 3
 * and 4 (`shortcutsExists`, both the Electron and sidecar handlers) do NOT
 * use this: a title feeding `shortcutFiles()` is a path-component contract,
 * not a display-string contract, and the two must not be conflated (a
 * synthesized fallback title becomes a plausible-looking but never-written
 * filesystem path -- see `shortcutsExistsFallback.test.ts`'s D-03 guard
 * instead).
 */
export function resolveTitleForGame(game: Game, appName: string): string {
  const { title } = game.getGameInfo()
  return pickTitle(title, appName)
}

/**
 * Curated settings-read channel registration (Phase 30 Plan 06, gap closure
 * for Gap 2 / UAT Test 8 — see `.planning/debug/settings-unreachable-tauri.md`).
 *
 * Registers exactly the two READ invoke handlers the Settings screen and
 * `useSettingsContext` need at mount, importing the REAL backend code paths
 * unchanged (mirrors `installFlowRegistration.ts`'s own objective — prove the
 * real logic runs behind the new transport, not a reimplementation):
 *
 *   - `requestAppSettings` -> `GlobalConfig.get().getSettings()` (identical to
 *     `main.ts:998`).
 *   - `requestGameSettings(appName)` -> the exact steam-routing-then-
 *     GameConfig-fallback logic from `main.ts:1012-1015`: if the in-memory
 *     Steam library Map (`storeManagers/steam/state.ts`, exported as
 *     `library`, aliased here as `steamLibrary`) has `appName`, route through
 *     `libraryManagerMap['steam'].getGame(appName).getSettings()`; otherwise
 *     fall back to `GameConfig.get(appName).getSettings()`.
 *
 * These were originally filed under 30-PORTED-CHANNELS.md's "Deliberately NOT
 * ported this phase" list as two of the six `DownloadDialog` channels — that
 * rationale ("DownloadDialog never mounts for runner === 'steam'") only
 * considered the `DownloadDialog` call site and missed that the Settings
 * screen (`frontend/screens/Settings/index.tsx`) AND `useSettingsContext`
 * BOTH call `requestAppSettings`/`requestGameSettings` at mount, independent
 * of `DownloadDialog` — leaving Settings permanently stuck on its loading
 * gate under Tauri (UAT Test 8, Gap 2). Porting these two bounded READ
 * handlers is what makes Settings reachable AND functional.
 *
 * Deliberately does NOT register `setSetting`/`writeConfig` (the WRITE side)
 * or any of the remaining four `DownloadDialog` channels (`checkDiskSpace`,
 * `getGameOverride`, `getGameSdl`, `getPrivateBranchPassword`) — those stay
 * Phase 31 and must keep rejecting non-fatally with `UNPORTED_CHANNEL_MARKER`
 * per SEAM.md Load-Bearing Invariant B.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors installFlowRegistration.ts's /
// steamAuthFlowRegistration.ts's Phase 27 Plan 05 circular-dep fix): force
// `storeManagers/index.ts` to be the INITIALIZATION ENTRY before the direct
// `steam/state` import below resolves. `storeManagers/index.ts` imports
// `steam/library` at its OWN top (which transitively pulls in the rest of
// steam/*) and only THEN constructs its eager `libraryManagerMap`
// (`new SteamLibraryManager()` ...), so entering through it lets every
// steam/* module finish defining its class export first. Entering through
// `steam/state` DIRECTLY (as this file's own import below does) risks the
// same re-entrant `index.ts` mid-evaluation crash `steamFlowRegistration.ts`'s
// docstring documents (`SteamLibraryManager is not a constructor`,
// esbuild-bundle-only, ts-jest's init order differs) — this fix is per-file,
// not "once is enough", because each curated registration module is its own
// independent entry point into the bundle's module graph.
import '../storeManagers'
import { GlobalConfig } from '../config'
import { GameConfig } from '../game_config'
import { libraryManagerMap } from '../storeManagers'
// NOTE: the export is `library`, not `steamLibrary` — there is no export
// named `steamLibrary` from this module. Aliased on import exactly as
// `main.ts:43` does.
import { library as steamLibrary } from '../storeManagers/steam/state'

/**
 * Registers the two settings-read invoke handlers. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
 */
export function registerSettingsFlows(): void {
  ipcMain.handle('requestAppSettings', async () =>
    GlobalConfig.get().getSettings()
  )

  ipcMain.handle(
    'requestGameSettings',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      if (steamLibrary.has(appName)) {
        return libraryManagerMap['steam'].getGame(appName).getSettings()
      }
      return GameConfig.get(appName).getSettings()
    }
  )
}

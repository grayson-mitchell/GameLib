/**
 * Curated runner-CLI-version + misc-tool + saves-sync + runtime-download + late-discovered channel
 * registration for the Tauri sidecar (Phase 34.5 Plans 34.5-07/34.5-12, REQ-34.5-06/REQ-34.5-07/
 * REQ-34.5-08/REQ-34.5-09; Phase 34.6 Plan 10, REQ-34.6-04/REQ-34.6-08/REQ-34.6-09).
 *
 * Plan 34.5-07 filled in 6 of this module's 11 declared channels: the four runner-CLI version
 * probes and the two Wine-runtime channels. Plan 34.5-12 Task 1 added the three "other" channels
 * (`callTool`, `egsSync`, `getGOGLinuxInstallersLangs`), bringing this module to 9/11; Task 2 added
 * the two saves-sync channels (`syncSaves`, `syncGOGSaves`) to complete it at 11/11. Phase 34.6
 * Plan 10 adds the last three of the phase's 24 late-discovered/deferred channels
 * (`getAchievements`, `getDefaultSavePath`, `getPlaytimeFromRunner`), bringing this module to
 * 14/14 — the phase's final port.
 *
 * D-14 ordering constraint (Phase 34.6 CONTEXT.md): `getDefaultSavePath` MUST be ported before the
 * inherited legendary save-sync live-verification leg runs (live-gate step 7), or path resolution
 * fails. This plan is where that constraint is satisfied — it lands before the phase's gate-run
 * plan. `save_sync.ts:146`'s `getDefaultGogSavePaths`'s `app.getPath('documents')` call (reached
 * only when `game.isNative()`, inside the GOG branch) is already covered by `pathShim.ts`'s
 * `documents` case (plan 34.5-01, REQ-34.5-01), so no new shim work is required here.
 *
 * D-04 correction, recorded here because this is where a future reader will actually find it:
 * `getCometVersion` is GOG's channel, not Zoom's. `comet` is the GOG Galaxy Communication
 * replacement, gated on `gameInfo.runner === 'gog'` at `launcher.ts:973`. An option label during
 * the 34.5 phase discussion wrongly bundled it with Zoom; Zoom is exactly three channels
 * (`authZoom`, `getZoomUserInfo`, `logoutZoom`), all DROPPED permanently by D-02 — `getCometVersion`
 * was never part of that drop.
 *
 * Declared channel list (14 total, all invoke — verified against `main.ts`,
 * `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, and `wine/runtimes/ipc_handler.ts` by
 * 34.5-RESEARCH.md and this plan's own `<interfaces>` block; no send-kind channels in this
 * cluster):
 *
 *   invoke (ipcMain.handle, 14):
 *     - `getLegendaryVersion`         -> utils/ipc_handler.ts:18 (DONE — plan 34.5-07)
 *     - `getGogdlVersion`             -> utils/ipc_handler.ts:19 (DONE — plan 34.5-07)
 *     - `getCometVersion`             -> utils/ipc_handler.ts:20 (DONE — plan 34.5-07; D-04's channel)
 *     - `getNileVersion`              -> utils/ipc_handler.ts:21 (DONE — plan 34.5-07)
 *     - `callTool`                    -> tools/ipc_handler.ts:25 (DONE — plan 34.5-12 Task 1)
 *     - `egsSync`                     -> main.ts:1251 (DONE — plan 34.5-12 Task 1)
 *     - `getGOGLinuxInstallersLangs`  -> main.ts:840 (DONE — plan 34.5-12 Task 1)
 *     - `syncSaves`                   -> main.ts:1263 (DONE — plan 34.5-12 Task 2)
 *     - `syncGOGSaves`                -> main.ts:1255 (DONE — plan 34.5-12 Task 2)
 *     - `downloadRuntime`             -> wine/runtimes/ipc_handler.ts:4 (DONE — plan 34.5-07)
 *     - `isRuntimeInstalled`          -> wine/runtimes/ipc_handler.ts:6 (DONE — plan 34.5-07)
 *     - `getAchievements`             -> main.ts:822-827 (DONE — Phase 34.6 Plan 10)
 *     - `getDefaultSavePath`          -> main.ts:1286-1290, delegates to save_sync.ts (DONE — Phase 34.6 Plan 10; D-14)
 *     - `getPlaytimeFromRunner`       -> main.ts:1495-1503 (DONE — Phase 34.6 Plan 10)
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`utils` runner-version getters, `tools/index.ts`, `wine/runtimes/runtimes.ts`, the
 * saves-sync module), and NEVER `main.ts`, `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, or
 * `wine/runtimes/ipc_handler.ts` — those double-register these same channels onto Electron's real
 * `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only path this sidecar's
 * curated import graph must never reach. `utils/ipc_handler.ts` in particular ALSO registers
 * `abort`, `getSystemInfo`, `copySystemInfoToClipboard` and `hasExecutable` — those already belong
 * to already-completed slices and must never be double-registered from here.
 *
 * `callTool` reassignment (REQ-34.1-10 / 34.1 D-14): this channel originally sat in Phase 34.1's
 * slice-4 inventory purely because the inventory grouped channels by the Electron file they lived
 * in (`tools/ipc_handler.ts`). It is Wine tooling (`winetricks`/`winecfg`/`runExe` dispatch) —
 * this phase's domain — and was reassigned here rather than ported in 34.1.
 *
 * `documents` gray area (research Pitfall 1 / D-09): `pathShim.ts`'s `documents` case (plan
 * 34.5-01, REQ-34.5-01) was added anticipating GOG saves-sync's need for it, and CONTEXT.md/
 * RESEARCH.md both file the single `save_sync.ts:146 getPath('documents')` call site as reached
 * "via `syncGOGSaves`". Direct verification for this plan (`storeManagers/gog/library.ts:94`'s
 * `getGame()` + `storeManagers/gog/games.ts`'s `syncSaves()` method, both read in full) shows this
 * is NOT quite right: `syncGOGSaves`'s handler chain (`getGame(appName).syncSaves(arg, '',
 * gogSaves)`) never calls `getDefaultGogSavePaths` — it iterates the already-resolved `gogSaves`
 * array it was given. The actual (and only) caller of `getDefaultGogSavePaths` is the separate
 * `getDefaultSavePath` channel (`save_sync.ts:17-27`), which the frontend
 * (`SyncSaves/gog.tsx`'s `getLocations()`) invokes BEFORE `syncGOGSaves`, in its own round trip.
 * `getDefaultSavePath` is not one of this slice's 38 channels and remains genuinely unported after
 * this plan (confirmed: no sidecar registration module references it). The Discretion question
 * research resolved — `documents` belongs to the saves-sync domain, not shortcuts — still holds;
 * only the specific claim that `syncGOGSaves` itself is the live call path is corrected here. See
 * the SUMMARY for this plan for the full trace.
 */

import { ipcMain } from '../platform'
import {
  getCometVersion,
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from '../utils/helperBinaries'
import { download, isInstalled } from '../wine/runtimes/runtimes'
import type { RuntimeName, Runner } from 'common/types'
import type { GOGCloudSavesLocation } from 'common/types/gog'
import path from 'path'
import { libraryManagerMap } from '../storeManagers'
import { Winetricks, runWineCommandOnGame } from '../tools'
import { isEpicServiceOffline, sendGameStatusUpdate, getGame } from '../utils'
import { isOnline } from '../online_monitor'
import { logInfo, logWarning, LogPrefix } from '../logger'
import { sendFrontendMessage } from '../ipc'
import { getDefaultSavePath } from '../save_sync'
import { GlobalConfig } from '../config'

/**
 * Registers this cluster's 14 invoke-kind channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time; the caller decides when registration onto the handler
 * registry happens.
 *
 * The module is now complete at 14/14: the four runner-CLI-version probes and two runtime
 * channels (plan 34.5-07), the three "other" channels and two saves-sync channels
 * (plan 34.5-12), plus the three late-discovered channels `getAchievements`,
 * `getDefaultSavePath` and `getPlaytimeFromRunner` (Phase 34.6 Plan 10, D-14).
 */
export function registerRunnerMiscFlows(): void {
  // ── Runner CLI version probes (main.ts / utils/ipc_handler.ts:18-21) ──────
  // Pure pass-through reads, exactly as the Electron source registers them — no caching, no
  // timeouts, no error wrapping the Electron path does not already have.
  ipcMain.handle('getLegendaryVersion', getLegendaryVersion)
  ipcMain.handle('getGogdlVersion', getGogdlVersion)
  // D-04: `comet` is GOG's Galaxy Communication replacement, gated on
  // `gameInfo.runner === 'gog'` at `launcher.ts:973`. An option label during the 34.5 phase
  // discussion wrongly bundled it with Zoom; Zoom is exactly three channels (`authZoom`,
  // `getZoomUserInfo`, `logoutZoom`), all DROPPED permanently by D-02 — `getCometVersion` was
  // never part of that drop and is ported here unchanged.
  ipcMain.handle('getCometVersion', getCometVersion)
  ipcMain.handle('getNileVersion', getNileVersion)

  // ── Wine runtime channels (wine/runtimes/ipc_handler.ts:4,6) ──────────────
  // No wave-1 precondition: `runtimePath` (`backend/constants/paths.ts`) resolves from
  // `toolsPath`, which in turn resolves through `pathShim`'s ALREADY-implemented `userData` case
  // — a reader should not add a spurious dependency on plan 34.5-01 for this cluster.
  ipcMain.handle(
    'downloadRuntime',
    async (_event: unknown, ...args: unknown[]) =>
      download(args[0] as RuntimeName)
  )
  ipcMain.handle(
    'isRuntimeInstalled',
    async (_event: unknown, ...args: unknown[]) =>
      isInstalled(args[0] as RuntimeName)
  )

  // ── "Other" channels (tools/ipc_handler.ts:25, main.ts:840,1251) ──────────
  // Plan 34.5-12. `callTool` reassigned here from Phase 34.1 by REQ-34.1-10 / 34.1 D-14 — it is
  // Wine tooling (winetricks/winecfg/runExe dispatch), not "misc" in domain, and only sat in
  // slice 4's original inventory because that inventory grouped channels by Electron file.
  ipcMain.handle('callTool', async (_event: unknown, ...args: unknown[]) => {
    const { tool, exe, appName, runner } = args[0] as {
      tool: 'winetricks' | 'winecfg' | 'runExe'
      exe?: string
      appName: string
      runner: Runner
    }

    const gameSettings = await libraryManagerMap[runner]
      .getGame(appName)
      .getSettings()

    switch (tool) {
      case 'winetricks':
        // Pitfall 4 (34.5-RESEARCH.md § Common Pitfalls): this branch calls
        // `Winetricks.run()` on the shared `tools/index.ts` object — pure Node, no Electron
        // dependency — and WORKS TODAY despite `winetricksAvailable`/`winetricksInstall`/
        // `winetricksInstalled` being deferred to Phase 34.6 (D-03). This is intentionally NOT
        // gated on that deferral, an early return, or a feature flag — flagged in
        // `34.5-PORTED-CHANNELS.md` so a reader does not mistake it for broken/blocked.
        await Winetricks.run(runner, appName)
        break
      case 'winecfg':
        await runWineCommandOnGame(runner, appName, {
          gameSettings,
          commandParts: ['winecfg'],
          wait: false
        })
        break
      case 'runExe':
        if (exe) {
          const workingDir = path.parse(exe).dir
          await runWineCommandOnGame(runner, appName, {
            gameSettings,
            commandParts: [exe],
            wait: false,
            startFolder: workingDir
          })
        }
        break
    }

    if (runner === 'gog') {
      // Check if game was modified by offline installer / wine uninstaller
      await libraryManagerMap['gog'].checkForOfflineInstallerChanges(appName)
      const maybeNewGameInfo = libraryManagerMap['gog'].getGameInfo(appName)
      if (maybeNewGameInfo) {
        sendFrontendMessage('pushGameToLibrary', maybeNewGameInfo)
      }
    }

    sendGameStatusUpdate({ appName, runner, status: 'done' })
  })

  ipcMain.handle('egsSync', async (_event: unknown, ...args: unknown[]) => {
    return libraryManagerMap['legendary'].toggleGamesSync(args[0] as string)
  })

  ipcMain.handle(
    'getGOGLinuxInstallersLangs',
    async (_event: unknown, ...args: unknown[]) =>
      libraryManagerMap['gog'].getLinuxInstallersLanguages(args[0] as string)
  )

  // ── Saves-sync channels (main.ts:1255,1263) ────────────────────────────────
  // Plan 34.5-12 Task 2.
  ipcMain.handle(
    'syncGOGSaves',
    async (_event: unknown, ...args: unknown[]) => {
      const gogSaves = args[0] as GOGCloudSavesLocation[]
      const appName = args[1] as string
      const arg = args[2] as string

      // Research Pitfall 1 / D-09 (see this module's header docstring for the full correction):
      // `pathShim`'s `documents` case exists for GOG saves-sync's sake — `save_sync.ts:146`
      // (`getDefaultGogSavePaths`) is the sole `getPath('documents')` call site, gated on
      // `game.isNative()`. Direct verification shows THIS handler's own call chain
      // (`getGame(appName).syncSaves(arg, '', gogSaves)` -> `storeManagers/gog/games.ts`'s
      // `syncSaves()`) does not itself reach that line — it consumes the already-resolved
      // `gogSaves` array. The actual caller is the separate `getDefaultSavePath` channel, which
      // the frontend invokes before this one and which remains unported after this plan. This
      // channel is still the correct domain owner for the `documents` case (CONTEXT.md D-09
      // wrongly filed it under shortcuts) — the correction is narrowly about which channel's
      // runtime call path reaches the line, not about which domain owns the dependency.
      return libraryManagerMap['gog']
        .getGame(appName)
        .syncSaves(arg, '', gogSaves)
    }
  )

  ipcMain.handle('syncSaves', async (_event: unknown, ...args: unknown[]) => {
    const {
      arg = '',
      path: savesPath,
      appName,
      runner
    } = args[0] as {
      arg?: string
      path: string
      appName: string
      runner: Runner
    }

    // Scope boundary: saves-sync CONFLICT BEHAVIOUR is explicitly out of scope for this phase.
    // Both runners' sync paths use non-interactive CLI flags — legendary's `sync-saves` always
    // sets `-y` (storeManagers/legendary/games.ts:843-873) and gog's `save-sync` loop
    // (storeManagers/gog/games.ts:850-910) never prompts either — so no dialog/prompt is
    // reachable from either path; D-15's fire-and-forget-rejection landmine does not apply
    // here. This is a byte-faithful port of inherited Electron behaviour, not a redesign.
    if (runner === 'legendary') {
      const epicOffline = await isEpicServiceOffline()
      if (epicOffline) {
        logWarning(
          'Epic is offline right now, cannot sync saves!',
          LogPrefix.Backend
        )
        return 'Epic is offline right now, cannot sync saves!'
      }
    }
    if (!isOnline()) {
      logWarning('App is offline, cannot sync saves!', LogPrefix.Backend)
      return 'App is offline, cannot sync saves!'
    }

    const output = await libraryManagerMap[runner]
      .getGame(appName)
      .syncSaves(arg, savesPath)
    logInfo(output, LogPrefix.Backend)
    return output
  })

  // ── Late-discovered channels (main.ts:822-827,1286-1290,1495-1503) ────────
  // Phase 34.6 Plan 10 (REQ-34.6-04/08/09). Byte-equivalent ports of the three remaining
  // 34.5-49-preload-surface-audit "Late-discovered — owner Phase 34.6" channels.
  ipcMain.handle(
    'getAchievements',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const lang = (args[2] as string | undefined) ?? 'en-US'
      return getGame(appName, runner).getAchievements?.(lang) ?? []
    }
  )

  // D-14: this port MUST land before the inherited legendary save-sync live-verification leg
  // runs (live-gate step 7), or that leg's path resolution fails. `save_sync.ts`'s pure
  // `getDefaultSavePath` function is imported directly (never `main.ts`) per this module's own
  // curated-import rule. `save_sync.ts:146`'s `getDefaultGogSavePaths`'s `app.getPath('documents')`
  // call (reached only inside the GOG branch, when `game.isNative()`) is already covered by
  // `pathShim.ts`'s `documents` case (plan 34.5-01, REQ-34.5-01) — no new shim work required.
  ipcMain.handle(
    'getDefaultSavePath',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const alreadyDefinedGogSaves = args[2] as GOGCloudSavesLocation[]
      return getDefaultSavePath(appName, runner, alreadyDefinedGogSaves)
    }
  )

  // Preserve the two bare `return` statements (resolving `undefined`, never `null`/`0`) exactly —
  // a caller distinguishing "sync disabled" from "zero playtime" would break silently otherwise.
  ipcMain.handle(
    'getPlaytimeFromRunner',
    async (
      _event: unknown,
      ...args: unknown[]
    ): Promise<number | undefined> => {
      const runner = args[0] as Runner
      const appName = args[1] as string
      const { disablePlaytimeSync } = GlobalConfig.get().getSettings()
      if (disablePlaytimeSync) {
        return
      }
      if (runner === 'gog') {
        return libraryManagerMap[runner].getGame(appName).getGOGPlaytime()
      }

      return
    }
  )
}

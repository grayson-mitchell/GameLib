/**
 * Curated runner-CLI-version + misc-tool + saves-sync + runtime-download channel registration for
 * the Tauri sidecar (Phase 34.5 Plans 34.5-07/34.5-12, REQ-34.5-06/REQ-34.5-07/REQ-34.5-08/
 * REQ-34.5-09).
 *
 * Plan 34.5-07 filled in 6 of this module's 11 declared channels: the four runner-CLI version
 * probes and the two Wine-runtime channels. Plan 34.5-12 Task 1 adds the three "other" channels
 * (`callTool`, `egsSync`, `getGOGLinuxInstallersLangs`), bringing this module to 9/11; Task 2 adds
 * the two saves-sync channels (`syncSaves`, `syncGOGSaves`) to complete it at 11/11.
 *
 * D-04 correction, recorded here because this is where a future reader will actually find it:
 * `getCometVersion` is GOG's channel, not Zoom's. `comet` is the GOG Galaxy Communication
 * replacement, gated on `gameInfo.runner === 'gog'` at `launcher.ts:973`. An option label during
 * the 34.5 phase discussion wrongly bundled it with Zoom; Zoom is exactly three channels
 * (`authZoom`, `getZoomUserInfo`, `logoutZoom`), all DROPPED permanently by D-02 — `getCometVersion`
 * was never part of that drop.
 *
 * Declared channel list (11 total, all invoke — verified against `main.ts`,
 * `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, and `wine/runtimes/ipc_handler.ts` by
 * 34.5-RESEARCH.md and this plan's own `<interfaces>` block; no send-kind channels in this
 * cluster):
 *
 *   invoke (ipcMain.handle, 11):
 *     - `getLegendaryVersion`         -> utils/ipc_handler.ts:18 (DONE — plan 34.5-07)
 *     - `getGogdlVersion`             -> utils/ipc_handler.ts:19 (DONE — plan 34.5-07)
 *     - `getCometVersion`             -> utils/ipc_handler.ts:20 (DONE — plan 34.5-07; D-04's channel)
 *     - `getNileVersion`              -> utils/ipc_handler.ts:21 (DONE — plan 34.5-07)
 *     - `callTool`                    -> tools/ipc_handler.ts:25 (DONE — plan 34.5-12 Task 1)
 *     - `egsSync`                     -> main.ts:1251 (DONE — plan 34.5-12 Task 1)
 *     - `getGOGLinuxInstallersLangs`  -> main.ts:840 (DONE — plan 34.5-12 Task 1)
 *     - `syncSaves`                   -> main.ts:1263 (plan 34.5-12 Task 2)
 *     - `syncGOGSaves`                -> main.ts:1255 (plan 34.5-12 Task 2)
 *     - `downloadRuntime`             -> wine/runtimes/ipc_handler.ts:4 (DONE — plan 34.5-07)
 *     - `isRuntimeInstalled`          -> wine/runtimes/ipc_handler.ts:6 (DONE — plan 34.5-07)
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
 */

import { ipcMain } from './electronStub'
import {
  getCometVersion,
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from '../utils/helperBinaries'
import { download, isInstalled } from '../wine/runtimes/runtimes'
import type { RuntimeName, Runner } from 'common/types'
import path from 'path'
import { libraryManagerMap } from '../storeManagers'
import { Winetricks, runWineCommandOnGame } from '../tools'
import { sendGameStatusUpdate } from '../utils'
import { sendFrontendMessage } from '../ipc'

/**
 * Registers this cluster's 11 invoke-kind channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time; the caller decides when registration onto the handler
 * registry happens.
 *
 * As of plan 34.5-12 Task 1, 9 of 11 are registered: the four runner-CLI-version probes and two
 * runtime channels (plan 34.5-07), plus the three "other" channels (this task). The two
 * saves-sync channels (`syncSaves`, `syncGOGSaves`) land in Task 2.
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
  ipcMain.handle(
    'callTool',
    async (_event: unknown, ...args: unknown[]) => {
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
        await libraryManagerMap['gog'].checkForOfflineInstallerChanges(
          appName
        )
        const maybeNewGameInfo = libraryManagerMap['gog'].getGameInfo(appName)
        if (maybeNewGameInfo) {
          sendFrontendMessage('pushGameToLibrary', maybeNewGameInfo)
        }
      }

      sendGameStatusUpdate({ appName, runner, status: 'done' })
    }
  )

  ipcMain.handle(
    'egsSync',
    async (_event: unknown, ...args: unknown[]) => {
      return libraryManagerMap['legendary'].toggleGamesSync(
        args[0] as string
      )
    }
  )

  ipcMain.handle(
    'getGOGLinuxInstallersLangs',
    async (_event: unknown, ...args: unknown[]) =>
      libraryManagerMap['gog'].getLinuxInstallersLanguages(args[0] as string)
  )
}

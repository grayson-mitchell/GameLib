/**
 * Curated install/uninstall/update-check channel registration (Phase 30 Plan
 * 02, D-05a/D-05b/D-07/D-08/D-12).
 *
 * Registers exactly five invoke handlers the Tauri build's install-slice
 * needs onto electronStub's `ipcMain` recorder, importing the REAL backend
 * code paths unchanged (mirrors `steamFlowRegistration.ts`'s own objective —
 * prove the real logic runs behind the new transport, not a
 * reimplementation):
 *
 *   - `install` -> a DIRECT `SteamGame.install()` bypass (D-05a), NOT a port
 *     of `downloadmanager`'s download-queue orchestrator module. That
 *     module's only Steam-relevant behavior the frontend depends on is a
 *     `sendGameStatusUpdate({status: 'queued'})` push before the real work
 *     starts — reproduced here as a single direct call. Everything else that
 *     module does (GOG-redist fan-out, legendary DLC fan-out,
 *     pause/resume/cancel, the Download Manager screen's own queue state) is
 *     runner-irrelevant to Steam or explicitly Phase 32's cluster; porting it
 *     would drag `initQueue`'s import-time side effects and the
 *     `downloadManager` store into the sidecar for zero behavioral gain on
 *     this slice. `SteamGame.install()`'s
 *     own branch dispatch reaches `installNative` -> `installDepotDownload`
 *     (D-07: the only in-scope branch) unmodified; the bottle/bridge branches
 *     stay reachable in the class but are non-fatal/unexercised here per SEAM
 *     Invariant B.
 *   - `updateGame` -> the same direct-bypass shape as `install`, calling
 *     `SteamGame.update()` (the exact method Electron's own
 *     `downloadmanager/utils.ts`'s `updateQueueElement` calls) with a matching
 *     `sendGameStatusUpdate` 'updating'/'done' transition. Note:
 *     `SteamGame.update()` itself is a pre-existing Phase-2 stub
 *     (`storeManagers/steam/games.ts:1719`) that always returns
 *     `{status:'error'}` on BOTH builds today — this is not a Phase 30
 *     regression, it is calling the identical unmodified method Electron
 *     calls.
 *   - `uninstall` -> `uninstallGameCallback` (`backend/utils/uninstaller.ts`)
 *     reused UNCHANGED (D-05b). It already emits its own
 *     `uninstalling`/`done` status updates and already suppresses the
 *     duplicate Steam toast (GAME-03) — no reshaping needed.
 *   - `checkGameUpdates` -> the shared `checkGameUpdates` function
 *     (`backend/utils/checkGameUpdates.ts`, Task 1 of this plan) reused
 *     UNCHANGED, all runners (D-12, follows D-05b).
 *   - `listSteamLibraryTargets` -> mirrors Electron's own gate
 *     (`main.ts`'s `isSteamNativeInstallEnabled() ? listSteamLibraryTargets()
 *     : []`) exactly. This is the ACTUAL minimum read-gate the install
 *     button depends on (30-RESEARCH Q6) — NOT any of `DownloadDialog`'s six
 *     channels, which never mount for `runner === 'steam'`
 *     (`frontend/state/InstallGameModal.ts`'s own code comment: "Steam
 *     installs are delegated to the Steam client via steam://install — they
 *     never use GamerLib's install modal..."). `startSteamInstall`
 *     (`InstallGameModal.ts`) awaits this UNCAUGHT before `installSteamGame()`
 *     — i.e. before `window.api.install(...)` — ever fires, so leaving this
 *     channel unported would make the Install button silently never install
 *     (Invariant B keeps the rejection non-fatal, but the flow never
 *     progresses).
 *
 * `uninstallGameCallback`/`checkGameUpdates` both "genuinely span multiple
 * store managers" (checklist step 2's own curated-import carve-out) via
 * `libraryManagerMap`, which each imports for itself — that import is
 * correct, not a discipline violation (RESEARCH Q2 confirmed the cost is
 * already sunk in the sidecar via `steamFlowRegistration.ts`'s load-bearing
 * first import below).
 *
 * Deliberately does NOT import `getSteamInstallSize` — the download-queue
 * orchestrator's only use of it (its `addToQueue` function) was to populate
 * `DMQueueElement.params.size` for the Download Manager screen's own queue
 * row display (Phase 32's cluster, not ported here); `GameStatus` (the
 * `sendGameStatusUpdate` payload this file pushes) carries no `size` field,
 * so there is no seam in this bypass for that value to flow through.
 *
 * Deliberately does NOT register any `DownloadDialog` channel
 * (`requestAppSettings`, `requestGameSettings`, `checkDiskSpace`,
 * `getGameOverride`, `getGameSdl`, `getPrivateBranchPassword`) or any queue
 * channel (`getDMQueueInformation`, `removeFromDMQueue`,
 * `pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload`) — all
 * confirmed unreachable on the Steam depot path or explicitly Phase 32's
 * cluster. They stay unregistered and keep rejecting non-fatally with
 * `UNPORTED_CHANNEL_MARKER` per SEAM.md Load-Bearing Invariant B.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) — no file under `src/backend/sidecar/` may import the real
 * `electron` module.
 */

import { logError, LogPrefix } from 'backend/logger'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors steamFlowRegistration.ts's / plan
// 30-01's steamAuthFlowRegistration.ts's Phase 27 Plan 05 circular-dep fix):
// force `storeManagers/index.ts` to be the INITIALIZATION ENTRY before the
// direct `steam/games`/`steam/installLocation` imports below resolve.
// `storeManagers/index.ts` imports `steam/library` at its OWN top (which
// transitively pulls in `steam/games`) and only THEN constructs its eager
// `libraryManagerMap` (`new SteamLibraryManager()` ...), so entering through
// it lets every steam/* module finish defining its class export first.
// Entering through `steam/games`/`steam/installLocation` DIRECTLY (as this
// file's own imports below do) risks the same re-entrant `index.ts`
// mid-evaluation crash `steamFlowRegistration.ts`'s docstring documents
// (`SteamLibraryManager is not a constructor`, esbuild-bundle-only, ts-jest's
// init order differs) — this fix is per-file, not "once is enough", because
// each curated registration module is its own independent entry point into
// the bundle's module graph.
import '../storeManagers'
import SteamGame from '../storeManagers/steam/games'
import { uninstallGameCallback } from '../utils/uninstaller'
import { checkGameUpdates } from '../utils/checkGameUpdates'
import { listSteamLibraryTargets } from '../storeManagers/steam/installLocation'
import { isSteamNativeInstallEnabled } from '../storeManagers/steam/nativeInstallSetting'
import { sendGameStatusUpdate } from '../utils'
import type { InstallParams, Runner, UpdateParams } from 'common/types'
import type { InstallResult } from 'common/types/game_manager'

/**
 * Registers the five install-slice invoke handlers. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
 */
export function registerInstallFlows(): void {
  ipcMain.handle(
    'install',
    async (
      _event: unknown,
      ...args: unknown[]
    ): Promise<{ status: InstallResult['status'] }> => {
      const params = (args[0] ?? {}) as InstallParams
      const { appName, runner, path } = params

      // CR-01: this bypass (D-05a) only ever constructs a SteamGame. `install`
      // is a runner-generic channel — frontend/helpers/library.ts calls it for
      // every runner. Reject non-steam runners honestly instead of silently
      // running the Steam depot installer against a foreign appName. Porting
      // full `libraryManagerMap[runner]` dispatch is Phase 32's cluster.
      if (runner !== 'steam') {
        throw new Error(
          `${UNPORTED_CHANNEL_MARKER} install: runner '${runner}' not ported`
        )
      }

      // The one thing addToQueue() did that the frontend's button state
      // depends on (D-05a) — reproduced as a single direct push, not a
      // queue port.
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'queued',
        folder: path
      })

      // CR-02: Electron's installQueueElement (downloadmanager/utils.ts)
      // pushes 'installing' before the real work starts, so the badge leaves
      // "queued" — reproduced here.
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'installing',
        folder: path
      })

      let deferredToSetup = false
      let wasAborted = false
      try {
        // SteamGame.install()'s own branch dispatch reaches installNative ->
        // installDepotDownload (D-07) unmodified. No depot logic reimplemented
        // here.
        const result = await new SteamGame(appName).install({
          // WR-06: Electron's installQueueElement normalizes both of these before
          // handing them to the store manager (downloadmanager/utils.ts) — the
          // apostrophe strip because the path is interpolated into shell-ish command
          // construction downstream, and the empty-entry filter because a blank
          // sdlList entry changes the SDL selection semantics. The bypass used to
          // forward both raw; it now applies the identical normalization so the two
          // builds cannot diverge on it.
          path: (path ?? '').replaceAll("'", ''),
          platformToInstall: params.platformToInstall,
          installDlcs: params.installDlcs,
          sdlList: (params.sdlList ?? []).filter((el) => el !== ''),
          installLanguage: params.installLanguage,
          branch: params.branch,
          build: params.build,
          dependencies: params.dependencies
        })

        // CR-02: SteamGame.install() resolves {status:'error'|'abort'|'done'}
        // WITHOUT throwing — the return value must be inspected, not discarded,
        // or a failed/aborted install resolves `ok: true` with the badge stuck
        // on "queued"/"installing" forever (same class as
        // debug/steam-cancel-abort-thread-a and the Phase 17 deferredToSetup fix).
        deferredToSetup = result.deferredToSetup ?? false
        wasAborted = result.status === 'abort'

        if (result.status === 'error') {
          logError(
            ['Installation of', appName, 'failed with:', result.error ?? ''],
            LogPrefix.Backend
          )
        }

        return { status: result.status }
      } catch (error) {
        // An unexpected throw also starts no ACF poller — clear the badge
        // before propagating so the caller's rejection doesn't also leave a
        // permanently stuck "installing" status.
        sendGameStatusUpdate({ appName, runner, status: 'done' })
        throw error
      } finally {
        // Steam: the ACF poller emits the real 'done' — suppress it here to
        // avoid the installing->done->installing flash (GAME-02). EXCEPTIONS
        // (Phase 17 deferredToSetup, debug/steam-cancel-abort-thread-a
        // wasAborted): no poller ever starts for those two cases, so nothing
        // else will clear the transient 'installing' badge.
        if (deferredToSetup || wasAborted) {
          sendGameStatusUpdate({ appName, runner, status: 'done' })
        }
      }
    }
  )

  // uninstallGameCallback's own signature types its first parameter as
  // the Event type Electron itself exports (uninstaller.ts sources it
  // directly out of that module) — no file under src/backend/sidecar/ may
  // import that module, even for a type-only
  // reference, so the substitution is wrapped in a same-body, widened-event
  // cast rather than changing uninstallGameCallback itself. The function
  // body reached at runtime is entirely unmodified; only the type of the
  // (always-unused, always-undefined-at-runtime, per sidecarRpc's
  // dispatchInvoke) event parameter is widened here.
  ipcMain.handle('uninstall', (event: unknown, ...args: unknown[]) =>
    (
      uninstallGameCallback as (
        event: unknown,
        appName: string,
        runner: Runner,
        shouldRemovePrefix: boolean,
        shouldRemoveSetting: boolean
      ) => Promise<void>
    )(
      event,
      args[0] as string,
      args[1] as Runner,
      args[2] as boolean,
      args[3] as boolean
    )
  )

  ipcMain.handle(
    'updateGame',
    async (_event: unknown, ...args: unknown[]): Promise<void> => {
      const params = (args[0] ?? {}) as UpdateParams
      const { appName, runner } = params

      // CR-01: identical defect to `install` above — reject non-steam
      // runners honestly instead of running `new SteamGame(appName).update()`
      // against a foreign appName.
      if (runner !== 'steam') {
        throw new Error(
          `${UNPORTED_CHANNEL_MARKER} updateGame: runner '${runner}' not ported`
        )
      }

      sendGameStatusUpdate({ appName, runner, status: 'updating' })
      try {
        // The same direct-bypass shape as `install` (D-05a) — calls the
        // exact method Electron's downloadmanager/utils.ts's
        // updateQueueElement calls, unmodified.
        await new SteamGame(appName).update()
      } finally {
        sendGameStatusUpdate({ appName, runner, status: 'done' })
      }
    }
  )

  ipcMain.handle('checkGameUpdates', checkGameUpdates)

  ipcMain.handle('listSteamLibraryTargets', async () =>
    isSteamNativeInstallEnabled() ? listSteamLibraryTargets() : []
  )
}

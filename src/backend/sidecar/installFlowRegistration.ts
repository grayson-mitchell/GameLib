/**
 * Curated install/uninstall/update-check channel registration (originally
 * Phase 30 Plan 02, D-05a/D-05b/D-07/D-08/D-12; `install`/`updateGame`
 * re-routed onto the real download queue in Phase 32 Plan 02, D-01).
 *
 * Registers exactly five invoke handlers the Tauri build's install-slice
 * needs onto electronStub's `ipcMain` recorder, importing the REAL backend
 * code paths unchanged (mirrors `steamFlowRegistration.ts`'s own objective —
 * prove the real logic runs behind the new transport, not a
 * reimplementation):
 *
 *   - `install` -> enqueues via the real `addToQueue()`
 *     (`downloadmanager/downloadqueue.ts`), matching Electron's own
 *     `downloadmanager/ipc_handler.ts` shape exactly (D-01, restoring
 *     Electron parity). Retires the Phase 30 D-05a direct
 *     `SteamGame.install()` bypass this file used to run — that bypass's
 *     hand-rolled `sendGameStatusUpdate('queued'/'installing')` pushes and
 *     the `deferredToSetup`/`wasAborted`/`hadError` try/catch/finally
 *     status-suppression logic are DELETED, not wrapped: `addToQueue()` ->
 *     `initQueue()` -> `installQueueElement()`
 *     (`downloadmanager/utils.ts`) already reproduces every one of those
 *     transitions unmodified, so hand-rolling a second copy here would be a
 *     duplicate implementation, not a port. Resolves `Promise<void>` once
 *     the element is QUEUED (`addToQueue()` has no return value) — NOT once
 *     the install finishes, and NOT a reconstructed `{status}` shape. The
 *     legendary DLC fan-out loop `ipc_handler.ts` also runs is omitted
 *     (not Steam-relevant to this slice); `downloadqueue.ts` itself stays
 *     runner-generic (D-02) — this file does not narrow it to Steam.
 *   - `updateGame` -> the identical re-route shape, deriving
 *     `params.path`/`platformToInstall` from `gameInfo.install` exactly like
 *     `ipc_handler.ts`'s own `updateGame` handler, then `addToQueue()`.
 *   - `uninstall` -> `uninstallGameCallback` (`backend/utils/uninstaller.ts`)
 *     reused UNCHANGED (D-05b). It already emits its own
 *     `uninstalling`/`done` status updates and already suppresses the
 *     duplicate Steam toast (GAME-03) — no reshaping needed.
 *   - `checkGameUpdates` -> the shared `checkGameUpdates` function
 *     (`backend/utils/checkGameUpdates.ts`) reused UNCHANGED, all runners
 *     (D-12, follows D-05b).
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
 * `uninstallGameCallback`/`checkGameUpdates`/`addToQueue` all "genuinely span
 * multiple store managers" (checklist step 2's own curated-import carve-out)
 * via `libraryManagerMap`, which each imports for itself — that import is
 * correct, not a discipline violation (RESEARCH Q2 confirmed the cost is
 * already sunk in the sidecar via `steamFlowRegistration.ts`'s load-bearing
 * first import below; RESEARCH D-01 confirms `downloadqueue.ts`'s own
 * import-time side effects are an accepted, already-prepared-for cost —
 * Phase 29 D-15 extracted `downloadManager`'s store declaration for exactly
 * this).
 *
 * Deliberately does NOT register any `DownloadDialog` channel
 * (`requestAppSettings`, `requestGameSettings`, `checkDiskSpace`,
 * `getGameOverride`, `getGameSdl`, `getPrivateBranchPassword`) — confirmed
 * unreachable on the Steam depot path. The five queue-management channels
 * (`getDMQueueInformation`, `removeFromDMQueue`, `pauseCurrentDownload`,
 * `resumeCurrentDownload`, `cancelDownload`) are registered by the separate
 * `downloadQueueFlowRegistration.ts` module (Phase 32 Plan 01, D-02) — not
 * this one, to keep queue-management and install-lifecycle apart. Any
 * `DownloadDialog` channel invoke still keeps rejecting non-fatally with
 * `UNPORTED_CHANNEL_MARKER` per SEAM.md Load-Bearing Invariant B.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) — no file under `src/backend/sidecar/` may import the real
 * `electron` module.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors steamFlowRegistration.ts's / plan
// 30-01's steamAuthFlowRegistration.ts's Phase 27 Plan 05 circular-dep fix):
// force `storeManagers/index.ts` to be the INITIALIZATION ENTRY before the
// direct `steam/installLocation` import below resolves.
// `storeManagers/index.ts` imports `steam/library` at its OWN top (which
// transitively pulls in `steam/games`) and only THEN constructs its eager
// `libraryManagerMap` (`new SteamLibraryManager()` ...), so entering through
// it lets every steam/* module finish defining its class export first.
// Entering through `steam/installLocation` DIRECTLY (as this file's own
// import below does) risks the same re-entrant `index.ts` mid-evaluation
// crash `steamFlowRegistration.ts`'s docstring documents
// (`SteamLibraryManager is not a constructor`, esbuild-bundle-only, ts-jest's
// init order differs) — this fix is per-file, not "once is enough", because
// each curated registration module is its own independent entry point into
// the bundle's module graph.
import '../storeManagers'
import { uninstallGameCallback } from '../utils/uninstaller'
import { checkGameUpdates } from '../utils/checkGameUpdates'
import { listSteamLibraryTargets } from '../storeManagers/steam/installLocation'
import { isSteamNativeInstallEnabled } from '../storeManagers/steam/nativeInstallSetting'
import { addToQueue } from '../downloadmanager/downloadqueue'
import type { DMQueueElement, InstallParams, Runner, UpdateParams } from 'common/types'

/**
 * Registers the five install-slice invoke handlers. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above; the caller decides when registration onto the handler
 * registry happens.
 */
export function registerInstallFlows(): void {
  ipcMain.handle(
    'install',
    async (_event: unknown, ...args: unknown[]): Promise<void> => {
      const params = (args[0] ?? {}) as InstallParams

      // Electron parity (D-01, ipc_handler.ts:13-22): build the
      // DMQueueElement and enqueue via the real addToQueue(). No runner
      // guard — downloadqueue.ts is runner-generic (D-02), and
      // installQueueElement/updateQueueElement (downloadmanager/utils.ts)
      // already reproduce every queued/installing/done status transition
      // and the deferredToSetup/wasAborted/error-surfacing behavior the
      // retired Phase 30 D-05a bypass used to hand-roll here. addToQueue()
      // has no return value — resolve void once QUEUED, not once installed.
      const dmQueueElement: DMQueueElement = {
        params,
        type: 'install',
        addToQueueTime: Date.now(),
        endTime: 0,
        startTime: 0
      }

      await addToQueue(dmQueueElement)
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
      const {
        gameInfo: {
          install: { platform, install_path }
        }
      } = params

      // Electron parity (D-01, ipc_handler.ts:46-62): identical re-route
      // shape to `install` above — derive path/platformToInstall from
      // gameInfo.install, then enqueue via addToQueue().
      const dmQueueElement: DMQueueElement = {
        params: { ...params, path: install_path!, platformToInstall: platform! },
        type: 'update',
        addToQueueTime: Date.now(),
        endTime: 0,
        startTime: 0
      }

      await addToQueue(dmQueueElement)
    }
  )

  ipcMain.handle('checkGameUpdates', checkGameUpdates)

  ipcMain.handle('listSteamLibraryTargets', async () =>
    isSteamNativeInstallEnabled() ? listSteamLibraryTargets() : []
  )
}

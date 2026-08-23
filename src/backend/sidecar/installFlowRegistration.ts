/**
 * Curated install/uninstall/update-check/move/import channel registration
 * (originally Phase 30 Plan 02, D-05a/D-05b/D-07/D-08/D-12; `install`/`updateGame`
 * re-routed onto the real download queue in Phase 32 Plan 02, D-01; `moveInstall`/
 * `importGame` added Phase 34.6 Plan 06, REQ-34.6-04/REQ-34.6-13, D-02).
 *
 * Registers exactly seven invoke handlers the Tauri build's install-slice
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
 *     channels, which never mount for `runner === 'steam'`. 34.13-08
 *     retired the auto-open trigger model this paragraph originally
 *     described: Steam installs now default to a one-click quick install
 *     (`startSteamQuickInstall`, `frontend/state/InstallGameModal.ts`) and
 *     reach GameLib's install modal only when the user explicitly asks for
 *     install options (or when the quick path's own local check degrades
 *     into it, D-24) — and even then the modal renders a dedicated Steam
 *     sibling dialog that calls none of `DownloadDialog`'s six channels.
 *     The porting decision this paragraph justifies is UNCHANGED and gets
 *     stronger. `startSteamQuickInstall` awaits this channel inside a
 *     `try`/`catch` and falls back to a delegated install on rejection, so
 *     it is no longer a single point of silent failure the way the retired
 *     quick-install predecessor was — but it IS still the read that
 *     decides whether GameLib has a local install target at all, so
 *     leaving it unported would degrade every Tauri Steam install to the
 *     delegated path. The minimum-read-gate conclusion stands.
 *   - `moveInstall` -> ported byte-equivalently from `main.ts:1112-1158`
 *     (Phase 34.6 Plan 06, D-02). Carries `T-34.5-C6-49-03` (renderer-supplied
 *     `path`, no containment check) — deliberately NOT hardened here; see the
 *     inline comment at its registration below and plan 34.6-11 (separately
 *     committed, this same phase), which owns the hardening.
 *   - `importGame` -> ported byte-equivalently from `main.ts:1160-1245`
 *     (Phase 34.6 Plan 06, D-02). Same `T-34.5-C6-49-03` finding, same
 *     deferral to plan 34.6-11.
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
 * Deliberately does NOT register five of `DownloadDialog`'s six channels
 * (`requestAppSettings`, `requestGameSettings`, `getGameOverride`,
 * `getGameSdl`, `getPrivateBranchPassword`) — confirmed unreachable on the
 * Steam depot path. The sixth, `checkDiskSpace`, IS now reachable on the
 * Steam quick-install path as 34.13-08's D-24 local validity probe — but it
 * needs no registration work here: it is already registered by a different
 * module, `sidecar/shellFilesFlowRegistration.ts:317`. The five queue-management channels
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
import { libraryManagerMap } from '../storeManagers'
import { uninstallGameCallback } from '../utils/uninstaller'
import { checkGameUpdates } from '../utils/checkGameUpdates'
import { listSteamLibraryTargets } from '../storeManagers/steam/installLocation'
import { isSteamNativeInstallEnabled } from '../storeManagers/steam/nativeInstallSetting'
import { addToQueue } from '../downloadmanager/downloadqueue'
// Plan 34.6-06 (REQ-34.6-04): byte-equivalent port of moveInstall/importGame
// (main.ts:1112-1245, D-02). getGame/isEpicServiceOffline/sendGameStatusUpdate/writeConfig are
// the same `backend/utils.ts` exports main.ts itself imports for these two handlers.
import {
  getGame,
  isEpicServiceOffline,
  sendGameStatusUpdate,
  writeConfig
} from '../utils'
import { notify, showDialogBoxModalAuto } from '../dialog/dialog'
import { logError, logInfo, LogPrefix } from '../logger'
import i18next from 'i18next'
import type {
  DMQueueElement,
  ImportGameArgs,
  InstallParams,
  MoveGameArgs,
  Runner,
  StatusPromise,
  UpdateParams
} from 'common/types'

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
        params: {
          ...params,
          path: install_path!,
          platformToInstall: platform!
        },
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

  // T-34.5-C6-49-03 (Tampering, mitigate — DEFERRED WITHIN THIS PHASE, D-02): `path` is
  // renderer-supplied and reaches a real filesystem move with NO containment check. Ported
  // byte-equivalently from `main.ts:1112-1158` on purpose — hardening is plan 34.6-11's job,
  // separately committed, so a live-gate FAIL here stays bisectable to "the port broke it" vs
  // "validation rejected it" (D-02). Do NOT add a path guard/normalisation/rejection here.
  ipcMain.handle(
    'moveInstall',
    async (_event: unknown, ...args: unknown[]): Promise<void> => {
      const { appName, path, runner } = (args[0] ?? {}) as MoveGameArgs

      sendGameStatusUpdate({
        appName,
        runner,
        status: 'moving'
      })

      const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()
      notify({ title, body: i18next.t('notify.moving', 'Moving Game') })

      const moveRes = await libraryManagerMap[runner]
        .getGame(appName)
        .moveInstall(path)
      if (moveRes.status === 'error') {
        notify({
          title,
          body: i18next.t('notify.error.move', 'Error Moving Game')
        })
        logError(
          `Error while moving ${appName} to ${path}: ${moveRes.error} `,
          LogPrefix.Backend
        )

        // No `event` property (sidecar invoke handlers never have a real one — this handler's
        // own `_event` is always `undefined` at runtime, per sidecarRpc.ts's dispatchInvoke,
        // exactly like the `uninstall` handler's cast above): takes
        // `showDialogBoxModalAuto`'s `sendFrontendMessage('showDialog', ...)` branch
        // (`dialog.ts:23-31`), which never throws. `main.ts`'s own `event` argument was always
        // the real invoke event; omitting it here is the same mechanical, non-semantic
        // adaptation `clearCache` already uses in `shellFilesFlowRegistration.ts`.
        showDialogBoxModalAuto({
          title: i18next.t('box.error.title', 'Error'),
          message: i18next.t(
            'box.error.moving',
            'Error Moving Game {{error}}',
            { error: moveRes.error }
          ),
          type: 'ERROR'
        })
      }

      if (moveRes.status === 'done') {
        notify({ title, body: i18next.t('notify.moved') })
        logInfo(`Finished moving ${appName} to ${path}.`, LogPrefix.Backend)
      }

      sendGameStatusUpdate({
        appName,
        runner,
        status: 'done'
      })
    }
  )

  // T-34.5-C6-49-03 (Tampering, mitigate — DEFERRED WITHIN THIS PHASE, D-02): `path` is
  // renderer-supplied and reaches a real filesystem import with NO containment check. Ported
  // byte-equivalently from `main.ts:1160-1245` on purpose — hardening is plan 34.6-11's job,
  // separately committed, so a live-gate FAIL here stays bisectable to "the port broke it" vs
  // "validation rejected it" (D-02). Do NOT add a path guard/normalisation/rejection here.
  ipcMain.handle(
    'importGame',
    async (_event: unknown, ...args: unknown[]): StatusPromise => {
      const {
        appName,
        path,
        runner,
        platform,
        winePrefix,
        wineVersion,
        wineCrossoverBottle
      } = (args[0] ?? {}) as ImportGameArgs

      if (runner === 'legendary') {
        const epicOffline = await isEpicServiceOffline()
        if (epicOffline) {
          // No `event` property — see the identical rationale on `moveInstall` above.
          showDialogBoxModalAuto({
            title: i18next.t('box.warning.title', 'Warning'),
            message: i18next.t(
              'box.warning.epic.import',
              'Epic Servers are having major outage right now, the game cannot be imported!'
            ),
            type: 'ERROR'
          })
          return { status: 'error' }
        }
      }

      const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'importing'
      })

      const abortMessage = () => {
        notify({
          title,
          body: i18next.t('notify.import.failed', 'Importing Failed')
        })
        sendGameStatusUpdate({
          appName,
          runner,
          status: 'done'
        })
      }

      try {
        const { abort, error } = await libraryManagerMap[runner]
          .getGame(appName)
          .importGame(path, platform)
        if (abort || error) {
          abortMessage()
          return { status: 'done' }
        }
      } catch (error) {
        abortMessage()
        logError(error, LogPrefix.Backend)
        return { status: 'error' }
      }

      if (winePrefix && wineVersion) {
        const gameSettings = await getGame(appName, runner).getSettings()
        writeConfig(appName, {
          ...gameSettings,
          winePrefix,
          wineVersion,
          wineCrossoverBottle
        })
      }

      notify({
        title,
        body: i18next.t('notify.install.imported', 'Game Imported')
      })
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'done'
      })
      logInfo(`imported ${title}`, LogPrefix.Backend)
      return { status: 'done' }
    }
  )
}

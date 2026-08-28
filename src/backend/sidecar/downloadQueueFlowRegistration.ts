/**
 * Curated download-queue channel registration (Phase 32 Plan 01,
 * REQ-32-02/REQ-32-03/REQ-32-04/REQ-32-05/REQ-32-08).
 *
 * Registers the five queue-management channels the Download Manager screen
 * and the Sidebar's queue badge depend on, onto electronStub's `ipcMain`
 * recorder, importing the REAL `downloadmanager/downloadqueue.ts` functions
 * unchanged (mirrors `installFlowRegistration.ts`'s / `settingsFlowRegistration.ts`'s
 * own objective — prove the real logic runs behind the new transport, not a
 * reimplementation):
 *
 *   - `removeFromDMQueue` (send/listener) -> `removeFromQueue(appName)`
 *   - `pauseCurrentDownload` (send/listener) -> `pauseCurrentDownload()`
 *   - `resumeCurrentDownload` (send/listener) -> `resumeCurrentDownload()`
 *   - `cancelDownload` (send/listener) -> `cancelCurrentDownload({ removeDownloaded })`
 *   - `getDMQueueInformation` (invoke) -> `getQueueInformation()`
 *
 * Copied character-for-character from the transport-kind split
 * `downloadmanager/ipc_handler.ts:64-70` already establishes (`addListener`
 * for the first four, `addHandler` for the last, the ONE invoke channel in
 * this module) — the single highest-risk detail in this plan (RESEARCH.md):
 * a `send` channel mistakenly registered with `ipcMain.handle` (or vice
 * versa) fails 100% silently at runtime (Phase 31 Pitfall 2 / `setSetting`).
 *
 * The queue stays runner-generic per D-01/D-02: `downloadqueue.ts` is
 * imported unmodified, so every runner it already supports (GOG/Legendary/
 * Nile/Zoom/Steam) is reachable through these five channels identically —
 * this module adds no Steam-specific branching of its own.
 *
 * D-05 (boot-time auto-resume): this module deliberately does NOT call the
 * main process's startup-flagged `initQueue` variant anywhere, and does not
 * schedule one via `setTimeout`.
 *
 * UPDATED, Phase 35 plan 11 — the reason changed, the rule did not. Until
 * plan 11 the boot-time auto-resume was SUPPRESSED sidecar-wide, and this
 * module's log line said so. It is no longer suppressed: it was ported to
 * `appShellFlowRegistration.ts`'s `frontendReady` handler, which is the
 * sidecar's equivalent of the `main.ts` call site it came from. This module
 * still does not schedule it, for the ordinary reason that boot-time work
 * does not belong in a channel-registration module — NOT because the
 * capability is disabled. The log line below was rewritten accordingly; a
 * log line claiming a suppression that no longer exists is worse than none.
 * Pre-`initQueue` cancelability is unaffected: it comes from
 * `downloadqueue.ts:49`'s own module-scope `currentElement` seed
 * (`getFirstQueueElement()` at import time), which this module does nothing
 * to suppress or delay.
 *
 * Push channels (`progressUpdate`, `changedDMQueueInformation`) are NOT
 * registered here — they need no `ipcMain` registration at all. Both already
 * flow through the existing, unmodified `sendFrontendMessage` ->
 * `getMainWindow().webContents.send` -> electronStub's `fakeWebContents.send`
 * -> `pushFrontendMessage` chain (`ipc.ts`, `electronStub.ts`,
 * `sidecarRpc.ts`) with zero `src-tauri` changes, and this module adds no
 * timer-based rate-limiting logic of its own on top of them — `depot.ts`'s
 * `emitProgress()` already rate-limits at the source (500ms/1%/1000ms
 * heartbeat, `depot.ts:811-818`) before `sendFrontendMessage('progressUpdate',
 * ...)` is ever called, and `changedDMQueueInformation`'s five
 * `downloadqueue.ts` call sites are unmodified.
 *
 * Deliberately does NOT register `install`/`updateGame` (the queue's
 * *enqueue* side) — that re-route from the Phase 30 D-05a direct-bypass onto
 * `addToQueue()` is Plan 32-02's own cluster (see `installFlowRegistration.ts`).
 * This module only owns the *pull* side (pause/resume/cancel/remove/inspect)
 * plus the push-relay proof.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`/`addListener`) — no file under `src/backend/sidecar/` may
 * import the real `electron` module (REQ-32-08).
 */

import { logInfo, LogPrefix } from 'backend/logger'

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors installFlowRegistration.ts's /
// settingsFlowRegistration.ts's Phase 27 Plan 05 circular-dep fix): force
// `storeManagers/index.ts` to be the INITIALIZATION ENTRY before any other
// module in this file's own import graph (transitively, `downloadqueue.ts`'s
// own `import { libraryManagerMap } from 'backend/storeManagers'`) resolves.
// Entering through a direct steam/* or downloadmanager/* import instead risks
// the same re-entrant `index.ts` mid-evaluation crash `steamFlowRegistration.ts`'s
// docstring documents (`SteamLibraryManager is not a constructor`,
// esbuild-bundle-only, ts-jest's init order differs) — this fix is per-file,
// not "once is enough", because each curated registration module is its own
// independent entry point into the bundle's module graph.
import '../storeManagers'
import {
  removeFromQueue,
  pauseCurrentDownload,
  resumeCurrentDownload,
  cancelCurrentDownload,
  getQueueInformation
} from '../downloadmanager/downloadqueue'

/**
 * Registers the five queue-management channels. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above and the D-05 log line below; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerDownloadQueueFlows(): void {
  // D-05: logged, never silent. Phase 35 plan 11 CHANGED WHAT THIS RECORDS.
  // The boot-time auto-resume is no longer suppressed under the sidecar — it
  // now runs from `appShellFlowRegistration.ts`'s `frontendReady` handler.
  // This module still schedules nothing itself; the line below points a
  // reader at the module that does, so the capability stays findable by grep
  // from the queue code that implements it. Pre-initQueue cancelability (the
  // module-scope `currentElement` seed, `downloadqueue.ts:49`) is preserved
  // regardless, exactly as before.
  //
  // Deferred via `setImmediate` (blocking fix, Rule 3): `handlers.ts` (and
  // therefore this function) runs synchronously at `bootstrap.ts`'s own
  // `import './handlers'` (Step 2), which happens BEFORE `bootstrap.ts`'s
  // exported `init()` ever runs `initLogger()` (Step 3) — logInfo's
  // `heroicLogWriter` is only assigned inside `initLogger()`, so calling
  // logInfo synchronously here throws `Cannot read properties of undefined
  // (reading 'logInfo')` before the sidecar ever reaches READY. The real
  // entry point (`src/sidecar/index.ts`'s `import { init } from
  // 'backend/sidecar/bootstrap'; init()`) and this plan's own
  // `downloadQueueFlows.test.ts` (`startSidecar()`) both call `init()`
  // synchronously, in the same script turn, immediately after this module
  // finishes evaluating — a `setImmediate`-deferred call is therefore
  // guaranteed to run after `initLogger()` has already assigned
  // `heroicLogWriter` in those two paths.
  //
  // The try/catch below additionally covers a THIRD path this codebase
  // already has (discovered by the full sidecar test-suite run, not just
  // this plan's own suite): a test file that imports `./handlers` directly
  // (e.g. `storeLayer.test.ts`) to exercise a different module's channels
  // WITHOUT ever calling `bootstrap.ts`'s `init()` — `heroicLogWriter` never
  // gets assigned there at all, so the deferred call would otherwise throw
  // asynchronously, outside any test's own try/catch, crashing the whole
  // Jest worker process. Falling back to `console.info` keeps the D-05
  // disablement observably logged (D-04's "never silent" house style)
  // without that crash, in every import path this module can be reached from.
  setImmediate(() => {
    try {
      logInfo(
        'sidecar: boot-time download-queue auto-resume (the startup-flagged initQueue call) is ENABLED as of Phase 35 plan 11 and runs from appShellFlowRegistration.ts frontendReady, not from this module — a persisted Steam queue head is still never auto-started, since the startup flag is itself the Steam suppression (downloadqueue.ts initQueue doc comment)',
        LogPrefix.DownloadManager
      )
    } catch {
      console.info(
        '[downloadQueueFlowRegistration] boot-time download-queue auto-resume is ENABLED (Phase 35 plan 11) and runs from appShellFlowRegistration.ts, not from this module — logger not yet initialized in this process, falling back to console'
      )
    }
  })

  // Transport-kind split copied character-for-character from
  // `downloadmanager/ipc_handler.ts:64-70` — four `ipcMain.on` (send/listener),
  // one `ipcMain.handle` (invoke). Getting this wrong is completely silent at
  // runtime (Phase 31 Pitfall 2).
  ipcMain.on('removeFromDMQueue', (_event: unknown, ...args: unknown[]) => {
    removeFromQueue(args[0] as string)
  })

  ipcMain.on('pauseCurrentDownload', () => {
    pauseCurrentDownload()
  })

  ipcMain.on('resumeCurrentDownload', () => {
    resumeCurrentDownload()
  })

  ipcMain.on('cancelDownload', (_event: unknown, ...args: unknown[]) => {
    cancelCurrentDownload({ removeDownloaded: args[0] as boolean })
  })

  ipcMain.handle('getDMQueueInformation', async () => getQueueInformation())
}

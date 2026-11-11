/**
 * Curated download-queue channel registration (Phase 32 Plan 01,
 * REQ-32-02/REQ-32-03/REQ-32-04/REQ-32-05/REQ-32-08).
 *
 * Registers the five queue-management channels the Download Manager screen
 * and the Sidebar's queue badge depend on, onto platformApi's `ipcMain`
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
 * Nile/Steam) is reachable through these five channels identically —
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
 * the removed main-window `webContents.send` -> platformApi's `fakeWebContents.send`
 * -> `pushFrontendMessage` chain (`ipc.ts`, `platform/index.ts`,
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
 * Uses platformApi's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`/`addListener`) — no file under `src/backend/sidecar/` may
 * import the real `electron` module (REQ-32-08).
 */

import type { LogSink } from '../process/types'

import type { IpcRegistry } from './ipcRegistry'
import type { DownloadQueue } from '../downloadmanager/downloadqueue'

/**
 * Registers the five queue-management channels. Called once from
 * `handlers.ts` — this module owns no side effects at import time beyond the
 * imports above and the D-05 log line below; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerDownloadQueueFlows(deps: {
  log: LogSink
  ipc: Pick<IpcRegistry, 'handle' | 'on'>
  downloadQueue: Pick<
    DownloadQueue,
    | 'removeFromQueue'
    | 'pauseCurrentDownload'
    | 'resumeCurrentDownload'
    | 'cancelCurrentDownload'
    | 'getQueueInformation'
  >
}): void {
  // D-05: logged, never silent. Phase 35 plan 11 CHANGED WHAT THIS RECORDS.
  // The boot-time auto-resume is no longer suppressed under the sidecar — it
  // now runs from `appShellFlowRegistration.ts`'s `frontendReady` handler.
  // This module still schedules nothing itself; the line below points a
  // reader at the module that does, so the capability stays findable by grep
  // from the queue code that implements it. Pre-initQueue cancelability (the
  // module-scope `currentElement` seed, `downloadqueue.ts:49`) is preserved
  // regardless, exactly as before.
  deps.log.info(
    'sidecar: boot-time download-queue auto-resume (the startup-flagged initQueue call) is ENABLED as of Phase 35 plan 11 and runs from appShellFlowRegistration.ts frontendReady, not from this module — a persisted Steam queue head is still never auto-started, since the startup flag is itself the Steam suppression (downloadqueue.ts initQueue doc comment)'
  )

  // Transport-kind split copied character-for-character from
  // `downloadmanager/ipc_handler.ts:64-70` — four `ipcMain.on` (send/listener),
  // one `ipcMain.handle` (invoke). Getting this wrong is completely silent at
  // runtime (Phase 31 Pitfall 2).
  deps.ipc.on('removeFromDMQueue', (_event: unknown, ...args: unknown[]) => {
    deps.downloadQueue.removeFromQueue(args[0] as string)
  })

  deps.ipc.on('pauseCurrentDownload', () => {
    deps.downloadQueue.pauseCurrentDownload()
  })

  deps.ipc.on('resumeCurrentDownload', () => {
    deps.downloadQueue.resumeCurrentDownload()
  })

  deps.ipc.on('cancelDownload', (_event: unknown, ...args: unknown[]) => {
    deps.downloadQueue.cancelCurrentDownload({
      removeDownloaded: args[0] as boolean
    })
  })

  deps.ipc.handle('getDMQueueInformation', async () =>
    deps.downloadQueue.getQueueInformation()
  )
}

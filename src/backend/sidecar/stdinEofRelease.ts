import type { Readable } from 'node:stream'
import type { AbortRegistry } from '../utils/aborthandler/aborthandler'
import type { DownloadQueue } from '../downloadmanager/downloadqueue'
import { LogPrefix, flushLogForwarder, logInfo, logWarning } from '../logger'
import type { OutboundHttpTracker } from './outboundHttpRegistry'

/** How long after EOF the sidecar waits before logging what is still holding the loop. */
export const RESIDUAL_HOLDER_DIAG_MS = 15_000

/**
 * Releases what keeps the sidecar's event loop referenced after the shell is gone, so the exit
 * contract ("exit by event-loop drain at stdin EOF") holds for a SIGNED-IN sidecar and for one
 * with a native download in flight. The Steam CM session is no longer one of them: the Rust shell's
 * EOF and exit hooks (steamcm_dispatch.rs) own its teardown, and no library-owned CM handle exists
 * in the sidecar any more.
 *
 * debug/sidecar-survives-force-quit: Force Quit SIGKILLs the shell, which skips
 * `RunEvent::Exit` -> `shutdown_child()`. stdin EOF is then the only signal the sidecar gets,
 * and neither handle below can be fixed by unref():
 *   1. in-flight depot downloads -- referenced by definition (contract half 2). The queue is
 *      PAUSED first (`pauseCurrentDownload()`), then any remaining controller is aborted
 *      (`deps.aborts.abortAll()`). The pause is load-bearing: initQueue keeps a stopped
 *      element in the persisted queue only when the queue is paused. A bare abort recorded
 *      the download as finished and dropped it from the queue (live gate 2026-10-26:
 *      Downloads showed it "Completed" and nothing was resumable on the next launch).
 *   2. in-flight outbound HTTP (contract half 2, not unref-able: an in-flight or unread
 *      response holds the loop). Destroyed agent-agnostically by `outboundHttpRegistry.ts`,
 *      which also refuses any follow-up request. A post-EOF diagnostic then names whatever
 *      still holds the loop. See todo 2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c /
 *      quick 261110-9w2.
 *
 * The nettop download monitor and the running-game poll are Rust since Phase 80: the shell owns
 * their teardown, so nothing for them is released here.
 *
 * This is a deliberate AMENDMENT of "no 'end' handler by design": it does not tear the process
 * down (no process.exit) -- it only drops references to handles that cannot be unref'd, and the
 * process still leaves by drain. It lives here, not in `startRpcServer()`.
 */
export function releaseOnStdinEof(
  input: Readable,
  deps: {
    /** The boot-owned outbound HTTP tracker: marked shutting down, then every live request destroyed. */
    outboundHttp: Pick<OutboundHttpTracker, 'markShuttingDown' | 'destroyAll'>
    downloadQueue: Pick<DownloadQueue, 'isRunning' | 'pauseCurrentDownload'>
    /** The boot-owned abort registry (66.4-13): aborted after the queue pause, so every in-flight job ends. */
    aborts: Pick<AbortRegistry, 'abortAll'>
  }
): void {
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    logInfo(
      '[sidecar] stdin closed: aborting in-flight downloads',
      LogPrefix.Backend
    )
    try {
      if (deps.downloadQueue.isRunning()) {
        deps.downloadQueue.pauseCurrentDownload()
      }
    } catch {
      // best-effort: still abort and release below
    }
    try {
      deps.aborts.abortAll()
    } catch {
      // best-effort: still release below
    }
    // No CM release here: the Rust shell's EOF / exit hook (steamcm_dispatch.rs) owns the CM
    // session teardown and any owed Mac Steam go-online. CM WebSocket upgrades are excluded from the
    // outbound registry anyway.
    try {
      deps.outboundHttp.markShuttingDown()
      const { destroyed, hosts } = deps.outboundHttp.destroyAll()
      logInfo(
        `[sidecar] stdin closed: destroyed ${destroyed} in-flight outbound HTTP request(s)${
          hosts.length ? ` (${hosts.join(', ')})` : ''
        }`,
        LogPrefix.Backend
      )
    } catch {
      // best-effort
    }
    // Residual-holder diagnostic. unref'd, so it never holds the loop; it only fires when
    // something else does -- the orphan case. The next live repro then names the holder in
    // gamelib.log without needing --report-on-signal.
    const t = setTimeout(() => {
      logWarning(
        `[sidecar] still alive ${RESIDUAL_HOLDER_DIAG_MS}ms after stdin EOF; active resources: ${process
          .getActiveResourcesInfo()
          .join(', ')}`,
        LogPrefix.Backend
      )
    }, RESIDUAL_HOLDER_DIAG_MS)
    t.unref?.()
    // LAST: hand every queued log line to stdout before the loop drains (Phase 84). The forwarder's
    // tick timer is unref'd, so without this the lines above would never leave. The flush adds no
    // referenced handle (its timeout timer is unref'd) and never rejects.
    void flushLogForwarder()
  }
  input.once('end', release)
  input.once('close', release)
}

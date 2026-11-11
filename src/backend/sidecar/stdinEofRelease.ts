import type { Readable } from 'node:stream'
import { callAllAbortControllers } from '../utils/aborthandler/aborthandler'
import type { DownloadQueue } from '../downloadmanager/downloadqueue'
import type { AnonymousClient } from '../storeManagers/steam/anonymousClient'
import { SteamUser } from '../storeManagers/steam/user'
import { LogPrefix, logInfo, logWarning } from '../logger'
import { destroyOutboundHttp } from './outboundHttpRegistry'

/** How long after EOF the sidecar waits before logging what is still holding the loop. */
export const RESIDUAL_HOLDER_DIAG_MS = 15_000

/**
 * Releases the three things that keep the sidecar's event loop referenced after the shell is
 * gone, so the exit contract ("exit by event-loop drain at stdin EOF") holds for a SIGNED-IN
 * sidecar and for one with a native download in flight.
 *
 * debug/sidecar-survives-force-quit: Force Quit SIGKILLs the shell, which skips
 * `RunEvent::Exit` -> `shutdown_child()`. stdin EOF is then the only signal the sidecar gets,
 * and neither handle below can be fixed by unref():
 *
 *   1. the steam-user CM connection -- a library-owned TCP socket plus heartbeat timer.
 *      Measured: a logged-on client alone keeps a bare node process alive past 60s;
 *      `logOff()` lets it drain in ~100ms. Released by `SteamUser.releaseForShutdown()`,
 *      which (unlike logout) clears no token -- the user stays signed in.
 *   2. in-flight depot downloads -- referenced by definition (contract half 2). The queue is
 *      PAUSED first (`pauseCurrentDownload()`), then any remaining controller is aborted
 *      (`callAllAbortControllers()`). The pause is load-bearing: initQueue keeps a stopped
 *      element in the persisted queue only when the queue is paused. A bare abort recorded
 *      the download as finished and dropped it from the queue (live gate 2026-10-26:
 *      Downloads showed it "Completed" and nothing was resumable on the next launch).
 *   3. in-flight outbound HTTP (contract half 2, not unref-able: an in-flight or unread
 *      response holds the loop). Destroyed agent-agnostically by `outboundHttpRegistry.ts`,
 *      which also refuses any follow-up request. A post-EOF diagnostic then names whatever
 *      still holds the loop. See todo 2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c /
 *      quick 261110-9w2.
 *
 * This is a deliberate AMENDMENT of "no 'end' handler by design": it does not tear the process
 * down (no process.exit) -- it only drops references to handles that cannot be unref'd, and the
 * process still leaves by drain. It lives here, not in `startRpcServer()`.
 */
export function releaseOnStdinEof(
  input: Readable,
  deps: {
    downloadQueue: Pick<DownloadQueue, 'isRunning' | 'pauseCurrentDownload'>
    /** The boot-owned anonymous CM client (D-66.3-14); its socket and heartbeat cannot be unref'd. */
    anonymousClient: Pick<AnonymousClient, 'releaseForShutdown'>
    /** Kills every nettop watchdog child (SteamProcesses.downloadMonitor.stopAll). */
    stopAllSteamDownloadMonitors: () => void
  }
): void {
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    logInfo(
      '[sidecar] stdin closed: releasing Steam CM session, paying any owed Mac Steam goonline, stopping nettop monitors and aborting in-flight downloads',
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
      callAllAbortControllers()
    } catch {
      // best-effort: still release the CM socket below
    }
    try {
      // quick 261029-sex: kill the nettop children (killable, not unref-able away).
      deps.stopAllSteamDownloadMonitors()
    } catch {
      // best-effort: still release the CM socket below
    }
    try {
      // The anonymous CM logon is a library-owned socket too (D-66.3-14). Released first, as
      // SteamUser.releaseForShutdown() did before it; the quit handler's releaseSteam does the same.
      deps.anonymousClient.releaseForShutdown()
    } catch {
      // best-effort: still release the authenticated session below
    }
    void SteamUser.releaseForShutdown()
    // After the CM release: its synchronous logOff has already started, and CM WebSocket
    // upgrades are excluded from the registry anyway.
    try {
      const { destroyed, hosts } = destroyOutboundHttp()
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
  }
  input.once('end', release)
  input.once('close', release)
}

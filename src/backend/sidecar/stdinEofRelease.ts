import type { Readable } from 'node:stream'
import { callAllAbortControllers } from '../utils/aborthandler/aborthandler'
import {
  isRunning,
  pauseCurrentDownload
} from '../downloadmanager/downloadqueue'
import { SteamUser } from '../storeManagers/steam/user'
import { LogPrefix, logInfo } from '../logger'

/**
 * Releases the two things that keep the sidecar's event loop referenced after the shell is
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
 *
 * This is a deliberate AMENDMENT of "no 'end' handler by design": it does not tear the process
 * down (no process.exit) -- it only drops references to handles that cannot be unref'd, and the
 * process still leaves by drain. It lives here, not in `startRpcServer()`.
 */
export function releaseOnStdinEof(input: Readable): void {
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    logInfo(
      '[sidecar] stdin closed: releasing Steam CM session and aborting in-flight downloads',
      LogPrefix.Backend
    )
    try {
      if (isRunning()) pauseCurrentDownload()
    } catch {
      // best-effort: still abort and release below
    }
    try {
      callAllAbortControllers()
    } catch {
      // best-effort: still release the CM socket below
    }
    SteamUser.releaseForShutdown()
  }
  input.once('end', release)
  input.once('close', release)
}

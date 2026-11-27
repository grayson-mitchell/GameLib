import { logWarning, LogPrefix } from 'backend/logger'

/**
 * The best-effort wrapper for a tracked kill (88.2-30, WR-05).
 *
 * The TS `killTracked` the managers' `stop()` used to call was synchronous and could not throw. The
 * Rust `trackedKill` is a round trip over an unordered transport, so it can reject (timeout, not-ready,
 * shutdown, a panic, a lost reply). A rejected kill must not skip what `stop()` does next: the wine
 * shutdown, and for sideload the second (`wine`) kill. This awaits the kill, logs a rejection as a
 * warning (fixed text plus the rejection, no filter, key or path) and resolves; it never rethrows.
 *
 * It lives here and not in `launchrust/` because the shim schedule's discovery
 * (engineWineShimSchedule.test.ts) requires every export of a launchrust file to be a one-call shim.
 */
export async function bestEffortTrackedKill(
  kill: Promise<unknown>,
  prefix: LogPrefix
): Promise<void> {
  try {
    await kill
  } catch (error) {
    logWarning(
      ['Ending the tracked run failed; stopping goes on:', error],
      prefix
    )
  }
}

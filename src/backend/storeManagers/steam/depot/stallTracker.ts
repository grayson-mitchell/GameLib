// Debug/steam-install-slow-start (cycle 7): completion robustness.
//
// ROOT CAUSE this closes (see .planning/debug/steam-install-slow-start.md,
// cycle-7 directive, Part 3): a single chunk exhausting fetchChunk's local
// CHUNK_FETCH_ATTEMPTS budget throws out of that chunk-fetch worker slot.
// Before this cycle, that throw propagated straight out of
// downloadFileChunks's `Promise.all` -- rejecting the WHOLE FILE the instant
// ANY one of its (possibly thousands of) chunks got unlucky, even though the
// file's OTHER concurrent chunk-workers may have already landed most of it
// successfully, and even though the other content-server hosts in the pool
// might be perfectly healthy. downloadSteamDepots then escalates that ONE
// file failure into a whole-install `status:'error'` (the misleading "Steam
// servers dropped the connection" copy) -- even on a run that was otherwise
// on track to complete.
//
// This module tracks whether the download run AS A WHOLE is still making
// forward progress (bytes landing on disk from ANY file/depot's chunk-fetch
// worker), so `downloadFileChunks` (depot.ts) can distinguish "one unlucky
// chunk on an otherwise-healthy run" (keep retrying -- re-queue it rather
// than aborting the file) from "the whole download is genuinely wedged"
// (give up honestly, rather than re-queuing forever). CRITICAL constraint
// from the directive: this must terminate on genuine total failure -- the
// give-up is based on a STALL condition (no bytes written anywhere for a
// sustained window), never on a single chunk's own attempt count, and never
// an unbounded/infinite retry.
//
// Deliberately per-download-run (constructed fresh in `downloadDepotFiles`),
// never a module-level singleton -- the same discipline already established
// by `HostHealthTracker`/`CdnAuthTokenCache`: a stall on one run must never
// bleed into another, and tests must never leak state into each other.

/**
 * How long the download run may go with ZERO forward progress (no bytes
 * written by ANY file/depot's chunk-fetch worker, anywhere in the run)
 * before a still-retrying chunk gives up and reports a genuine failure,
 * instead of being re-queued forever.
 *
 * Chosen well above the ~7min near-zero-throughput window the cycle-3
 * hardware diagnosis observed (workers starved in backoff sleep against
 * proven-bad hosts -- but real bytes WERE still trickling in from the
 * healthy hosts the whole time, so that run was slow, not stalled) so a
 * merely-slow run is never mistaken for a genuinely wedged one; only a run
 * with LITERALLY zero bytes written anywhere for this long -- e.g. every
 * content-server host has gone unreachable at once -- is treated as dead.
 */
export const STALL_TIMEOUT_MS = 3 * 60 * 1000

/**
 * Per-download-run forward-progress clock. `now` is accepted as an explicit
 * parameter (defaulting to `Date.now()`) on every method, rather than reading
 * the clock internally everywhere, so tests can exercise `hasStalled()`
 * deterministically without sleeping for real minutes.
 */
export class StallTracker {
  private lastProgressAt: number

  constructor(
    private readonly stallTimeoutMs: number = STALL_TIMEOUT_MS,
    now: number = Date.now()
  ) {
    this.lastProgressAt = now
  }

  /** Call whenever ANY bytes land on disk for ANY file in this download run
   *  -- resets the stall clock. Never scoped to a single file/chunk: host
   *  health is a property of the CDN edge, forward progress is a property
   *  of the WHOLE run (mirrors HostHealthTracker's own "one tracker per run,
   *  shared across every file/depot" discipline). */
  recordProgress(now: number = Date.now()): void {
    this.lastProgressAt = now
  }

  /** True once `stallTimeoutMs` has elapsed since the last recorded
   *  progress anywhere in the run -- the signal `downloadFileChunks` uses to
   *  stop re-queuing an exhausted chunk and report a genuine failure rather
   *  than looping forever. */
  hasStalled(now: number = Date.now()): boolean {
    return now - this.lastProgressAt > this.stallTimeoutMs
  }

  /** Milliseconds since the last recorded progress -- surfaced in the
   *  give-up error message for diagnostics (never logged/thrown on its own
   *  without context; purely descriptive). */
  msSinceProgress(now: number = Date.now()): number {
    return now - this.lastProgressAt
  }
}

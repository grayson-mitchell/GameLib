// Progress helpers shared by the legacy TS depot pipeline and the Rust-job listener.
// Moved out of depot/download.ts (73-11) so deleting depot/ later is mechanical; pure, no
// timers or handles.

/** Bytes per MiB — the DownloadManager UI renders `downSpeed` with a "MB/s" label
 *  and the gog/legendary runners emit MiB/s, so the native path must too (was
 *  raw bytes/sec, ~1e6× too large — UAT D-UAT-02). */
const BYTES_PER_MIB = 1024 * 1024

/** Formats an ETA in seconds as `HH:MM:SS` for the DownloadManager ETA field —
 *  matches the gog/legendary runners' formatted-string convention. Emitting raw
 *  `${sec}s` produced unreadable values like "1247s" (UAT D-UAT-02). */
export function formatEta(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
export const PROGRESS_THROTTLE_MS = 500
export const PROGRESS_THROTTLE_PERCENT = 1

/** Forces a progressUpdate at least once per second, independent of chunk
 *  completion. Without this, the DownloadManager ProgressHeader graph freezes
 *  for however long chunk completions bunch up (warm-up, large files, decode-
 *  pool backlog under load) -- observed gaps of ~30s in practice. */
export const PROGRESS_HEARTBEAT_MS = 1000

/** Minimum window (seconds) for a meaningful rolling-rate sample. A forced
 *  emit right after a throttled one can have a sub-millisecond delta; dividing
 *  by it yields a garbage spike, so below this we reuse the previous rate. */
const MIN_RATE_WINDOW_SEC = 0.05

/**
 * Rolling (instantaneous) transfer rate in MiB/s over the window since the last
 * emit — NOT a cumulative average since the download started, so the figure
 * tracks the CURRENT rate and drops promptly when the transfer slows or stalls.
 * Reuses `previousMiBs` when the window is too small to be meaningful (a forced
 * emit landing right on top of a throttled one). Pure + exported for testing.
 */
export function rollingRateMiBs(
  bytesDelta: number,
  msDelta: number,
  previousMiBs: number
): number {
  const secDelta = msDelta / 1000
  if (secDelta < MIN_RATE_WINDOW_SEC) return previousMiBs
  const rate = bytesDelta / secDelta / BYTES_PER_MIB
  return rate > 0 ? rate : 0
}

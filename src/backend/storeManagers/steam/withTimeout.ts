// Phase 30 gap closure (30-07, G-30-02): bounds a bare, un-timed steam-user CM
// promise/callback so a stale-but-present CM socket produces a settled
// REJECTION instead of parking the caller forever.
//
// Root cause (see .planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md):
// steam-user's getProductInfo/getDepotDecryptionKey/getRawManifest/getContentServers
// neither time out nor reject when the underlying CM socket is present but
// unresponsive — the Promise/callback simply never settles. Wrapping every
// pre-download CM call in withTimeout converts that hang into a bounded
// rejection that the EXISTING withPlanBuildRetry (depot.ts) retry-then-throw
// machinery already knows how to handle — no new terminal-status logic
// anywhere downstream.

/**
 * 25s — the per-call bound for a SINGLE-app PICS getProductInfo / a single
 * depot getDepotDecryptionKey|getRawManifest round-trip, where a healthy
 * round-trip is sub-second to low-single-digit seconds (see the
 * `[Timing] fetchInstalldir` / `buildDepotPlan/<label>` logs already in
 * depot.ts/installLocation.ts). `ensureConnected`'s own worst-case
 * cold-connect + grace window is ~35s (user.ts:70-144); 25s sits below that.
 *
 * WR-02: a `withTimeout` timeout is now marked `isTimeout` and treated as
 * NON-retryable by `withPlanBuildRetry` (it would re-hang identically against
 * the same stale fast-path socket every attempt — see depot.ts). So this bound
 * is the install's ACTUAL single pre-download deadline for a hung single-app
 * call, not ~3x it. Because CR-03/CR-04 removed the 60s outer sidecar-invoke
 * deadline, this per-call bound is the only pre-download deadline.
 *
 * WR-03: this single-app bound is NOT calibrated for the bulk/large-library
 * case (getProductInfo over every package license), which node-steam-user
 * issue #144 flags as legitimately slow — use STEAM_PICS_BULK_TIMEOUT_MS for
 * those many-appid fetches instead.
 */
export const STEAM_PICS_TIMEOUT_MS = 25000

/**
 * 90s — the dedicated bound for BULK / many-appid PICS fetches
 * (`getOwnedSets` over every package license, `fetchDlcInfos` over an app's
 * full DLC id list). node-steam-user issue #144 (called out in CLAUDE.md)
 * documents PICS cache population for large libraries as a known
 * legitimately-slow operation, so the single-app STEAM_PICS_TIMEOUT_MS would
 * false-trip a healthy-but-slow large-library user. This larger bound sits
 * well above realistic healthy large-library latency while still guaranteeing
 * a stale socket cannot park the install forever. Since WR-02 makes a timeout
 * single-attempt (non-retryable), this bound is not multiplied by retries.
 */
export const STEAM_PICS_BULK_TIMEOUT_MS = 90000

/** Marker property stamped on the Error `withTimeout` rejects with. The
 *  plan-build retry layer (withPlanBuildRetry, depot.ts) checks this to fail
 *  FAST on a timeout: a hung CM call re-hangs identically every attempt
 *  against the same stale fast-path socket, so retrying only multiplies the
 *  deadline (WR-02). */
export interface TimeoutError extends Error {
  isTimeout: true
}

export function isTimeoutError(err: unknown): err is TimeoutError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { isTimeout?: unknown }).isTimeout === true
  )
}

/**
 * Races `promise` against a `ms`-bounded timer. Resolves/rejects exactly as
 * `promise` would if it settles first (transparent pass-through — the
 * healthy/fast-CM path, e.g. Electron's install flow, is unaffected byte-for-
 * byte). If `promise` has not settled by `ms`, the race rejects with a
 * descriptive Error containing `label` and the bound instead of leaving the
 * caller waiting forever. The timer is always cleared once the race settles
 * (whichever branch wins), so a fast-resolving promise never leaves a
 * dangling `setTimeout` handle behind.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // WR-02: stamp `isTimeout` so withPlanBuildRetry (depot.ts) fails FAST
      // instead of burning PLAN_BUILD_MAX_ATTEMPTS on a hang that re-hangs
      // identically against the same stale fast-path socket every attempt.
      reject(
        Object.assign(new Error(`${label} timed out after ${ms}ms`), {
          isTimeout: true as const
        })
      )
    }, ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timer!)
  }
}

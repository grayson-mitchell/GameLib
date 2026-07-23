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
 * 25s — chosen because a healthy PICS getProductInfo round-trip is
 * sub-second to low-single-digit seconds (see the `[Timing] fetchInstalldir` /
 * `buildDepotPlan/<label>` logs already in depot.ts/installLocation.ts), while
 * `ensureConnected`'s own worst-case cold-connect + grace window is ~35s
 * (user.ts:70-144). 25s sits comfortably below that ~35s ceiling yet far
 * above any healthy call, so it cannot false-trip a legitimately
 * slow-but-progressing PICS fetch on a poor connection. Because CR-03/CR-04
 * removed the 60s outer sidecar-invoke deadline, this per-call bound is now
 * the install's only pre-download deadline.
 */
export const STEAM_PICS_TIMEOUT_MS = 25000

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
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timer!)
  }
}

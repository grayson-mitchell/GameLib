---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
reviewed: 2026-07-23T02:44:28Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/backend/storeManagers/steam/withTimeout.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/games.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 30: Code Review Report (30-07 gap closure, G-30-02)

**Reviewed:** 2026-07-23T02:44:28Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

> Note: this file supersedes the earlier 30-REVIEW.md (Tauri IPC file set). This
> is the focused re-review of gap-closure plan 30-07's `withTimeout` delta only,
> per the current review scope.

## Summary

Focused review of gap-closure plan 30-07 (G-30-02): a new `withTimeout` Promise.race
wrapper (`withTimeout.ts`) applied to bound every pre-download Steam CM primitive
(`getProductInfo` in depot.ts/installLocation.ts, `getDepotDecryptionKey`,
`getRawManifest`, `getContentServers` in depot.ts) plus the `resolveSteamInstallTarget`
pre-download phase in games.ts.

**The core mechanism is correct.** `withTimeout` itself is sound: the timer is always
cleared in `finally`, a fast-settling promise passes through transparently, and
`Promise.race` attaches reactions to both inputs so a late rejection of the original
(never-settling) promise does NOT surface as an unhandled rejection. Every bounded
reject was traced to a terminal state:

- depot.ts `getOwnedSets`/`fetchAppInfo`/`fetchDlcInfos`/`fetchDepotPlanEntry` rejects →
  `withPlanBuildRetry` → `buildDepotPlan` throw → `downloadSteamDepots` catch (L2292) →
  `finalize()` (fails CLOSED to the 1026 incomplete manifest) → `{status:'error'}`.
- depot.ts `getContentServerHosts` reject → `downloadSteamDepots` catch → same terminal error.
- games.ts `resolveSteamInstallTarget` reject → try/catch (L1206) → `{status:'error'}`.

No blockers, no data-loss paths, no unhandled-rejection escapes. The streaming download
phase is correctly left UNbounded (intended — a stall there renders visible 0% progress,
not a blank spinner).

Three WARNINGs concern the *tuning and layering* of the bound rather than its core
correctness: a nested equal-bound wrapper that defeats an inner no-hard-fail contract, a
retry-amplification that makes the real bound ~3× the documented one, and a possible
false-trip on large-library PICS fetches.

## Warnings

### WR-01: Nested `withTimeout` with an equal bound overrides `fetchInstalldir`'s explicit no-hard-fail contract

**File:** `src/backend/storeManagers/steam/games.ts:1201-1215` (with `src/backend/storeManagers/steam/installLocation.ts:139-188`)

**Issue:** `resolveSteamInstallTarget` is wrapped in a 25s `withTimeout` in games.ts.
Internally it calls `fetchInstalldir`, whose own `getProductInfo` is ALSO wrapped in a 25s
`withTimeout` and whose `catch` (installLocation.ts:177-187) is explicitly designed to turn
*any* reject into a benign `undefined` → safe fallback dir name, because — per its own
docstring (installLocation.ts:130-138) — "an install location lookup must not hard-fail the
whole install over a cosmetic directory-name mismatch."

The two timers use the SAME 25000ms bound, but the OUTER timer is armed first (in games.ts,
before `resolveSteamInstallTarget` runs its `await listSteamLibraryTargets()` and only then
arms the inner timer inside `fetchInstalldir`). Therefore, whenever `fetchInstalldir`'s
`getProductInfo` hangs, the outer timer ALWAYS elapses before the inner one. The outer race
rejects first → games.ts catch → `{status:'error', error:'Steam pre-download timed out'}` —
a HARD install failure — instead of the inner catch's intended "fall back to a safe dir name
and proceed." A transient CM hang on the installdir lookup that recovers a few seconds later
(the exact case the inner catch was built to survive, since `buildDepotPlan` would then read
the same appinfo successfully) is converted into a fatal install error.

The games.ts comment (L1194-1200) frames this wrapper as pure "belt-and-suspenders" for "a
future un-timed pre-download await that is NOT a CM primitive." But with an equal bound armed
earlier, it is not passive — it pre-empts and overrides the graceful degradation of an inner
CM primitive that is already individually bounded.

**Fix:** Give the outer wrapper a strictly larger bound so the inner graceful fallback always
wins its own race, or drop the outer wrapper entirely since every CM primitive it contains is
already individually bounded:
```ts
// Option A — larger outer bound so inner fallback always resolves first:
resolved = await withTimeout(
  resolveSteamInstallTarget(this.appId, args),
  STEAM_PICS_TIMEOUT_MS * 2, // strictly > any inner per-call bound
  'resolveSteamInstallTarget'
)
// Option B — remove the outer withTimeout; fetchInstalldir + getSteamLibraries
// are already bounded/synchronous, and fetchInstalldir never hard-fails by design.
```

### WR-02: Timeout errors are treated as retryable, so the real pre-download bound is ~3×25s, not the documented 25s — and the retry re-hits the same dead socket

**File:** `src/backend/storeManagers/steam/withTimeout.ts:14-25` (interacting with `src/backend/storeManagers/steam/depot.ts:357-397` and `src/backend/storeManagers/steam/user.ts:70-81`)

**Issue:** The `withTimeout.ts` doc asserts "this per-call bound is now the install's only
pre-download deadline." That understates the real worst case. A timeout `Error` carries no
`eresult`, so `isNonRetryableDepotError` returns `false` (depotErrors.ts:54-57) → a timed-out
plan-build step is classified retryable → `withPlanBuildRetry` retries it up to
`PLAN_BUILD_MAX_ATTEMPTS` (3) times. Worse, between attempts `withPlanBuildRetry` calls
`await SteamUser.ensureConnected()` (depot.ts:394), whose fast path returns `true` in 0ms
when `this.client?.steamID` is still populated (user.ts:71-81) — which is exactly true for a
stale-but-present socket. So the "reconnect and retry" is a no-op against the precise failure
mode this fix targets: each retry immediately re-issues `getProductInfo` against the same dead
socket and re-hangs a full 25s. Effective bound per plan-build step ≈ 3 × 25s = 75s.

Behavior is still bounded and terminal (G-30-02's "never settles forever" IS fixed), but the
badge can spin ~75s+ on the first failing step, and the documented/actual deadline diverge
materially.

**Fix:** Classify a `withTimeout` timeout as non-retryable (it will re-hang identically every
attempt against a stale fast-path socket), and correct the doc comment to state the real
worst-case bound:
```ts
// In withTimeout.ts — mark the timeout so the retry layer can fail fast:
reject(Object.assign(
  new Error(`${label} timed out after ${ms}ms`),
  { isTimeout: true }
))
// In withPlanBuildRetry (depot.ts) — do not burn 3 attempts on an unrecoverable timeout:
if (isNonRetryableDepotError(err) || (err as { isTimeout?: boolean }).isTimeout) {
  throw err
}
```

### WR-03: 25s bound may false-trip a healthy-but-slow large-library `getProductInfo`, contradicting CLAUDE.md's own known-issue note

**File:** `src/backend/storeManagers/steam/withTimeout.ts:14-25` (applied at `src/backend/storeManagers/steam/depot.ts:416-420`)

**Issue:** The doc claims 25s "cannot false-trip a legitimately slow-but-progressing PICS
fetch," premised on "a healthy PICS getProductInfo round-trip is sub-second to low-single-digit
seconds." That premise is not established for the bulk case: `getOwnedSets` calls
`client.getProductInfo([], packageIds, true)` over EVERY package license (depot.ts:409-420).
The project's own CLAUDE.md flags node-steam-user issue #144 — "PICS cache population time for
large libraries is a known open issue... needs timeout/caching strategy" — for exactly this
class of call. A user with a large library on a slow connection could legitimately exceed 25s,
then (per WR-02) get retried 3× — each also timing out — and surface a spurious terminal
"timed out" error for an install that would have succeeded given more time.

**Fix:** Use a larger, dedicated bound for the bulk `getOwnedSets`/many-appid fetches (or make
the bound configurable and derive it from license count), rather than the single per-call
`STEAM_PICS_TIMEOUT_MS` calibrated on the single-app path. At minimum, soften the doc's
"cannot false-trip" claim, which is not backed for the large-library case and contradicts #144.

## Info

### IN-01: Leftover temporary `[Timing]` diagnostics (including a full content-server directory dump) remain in the functions this plan touches

**File:** `src/backend/storeManagers/steam/installLocation.ts:150-186`, `src/backend/storeManagers/steam/depot.ts:2117-2131` (and the `[Timing]` calls in games.ts:1167-1234)

**Issue:** The wrapped functions still emit `[Timing]` `logInfo` instrumentation whose own
comments mark them "Temporary instrumentation, remove once root cause is confirmed." One
(depot.ts:2122-2125) does `JSON.stringify(servers)` — a full content-server directory dump —
on every install. Since plan 30-07 is closing the root cause (G-30-02) these functions were
instrumented for, the diagnostics are now candidates for removal. (Consistent with the
standing memory note that temp diagnostic logging must be reverted before merge.) Pre-existing,
not introduced by this plan — flagged only because the plan touches the same functions.

**Fix:** Remove or gate the `[Timing]` logs (and the per-install raw directory dump) behind a
debug flag before merge.

---

_Reviewed: 2026-07-23T02:44:28Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
fixed_at: 2026-07-23T03:14:19Z
review_path: .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 30: Code Review Fix Report (30-07 gap-closure re-review, G-30-02)

**Fixed at:** 2026-07-23T03:14:19Z
**Source review:** .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-REVIEW.md
**Iteration:** 1

> Note: this report is for the FOCUSED re-review of gap-closure plan 30-07's
> `withTimeout` delta (3 warnings, 1 info). It replaces the earlier REVIEW-FIX.md
> written for the now-superseded Tauri-IPC-file-set review (11 findings). Those
> earlier fixes remain in git history; only the report document was replaced.

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — critical_warning scope; IN-01 is Info, out of scope)
- Fixed: 3
- Skipped: 0

The three warnings all concern the tuning/layering of the single 25s pre-download
timeout bound and were applied as ONE coherent design (per the review's coherence
guidance), not in isolation. Because WR-02 and WR-03 are inseparable in the same two
files (`withTimeout.ts` + `depot.ts`) and share the same bound-design contract, they
were committed together; WR-01 (an independent games.ts layering change) was committed
separately. The streaming download phase remains UNBOUNDED (CR-03/CR-04 invariant
untouched). IN-01 (leftover `[Timing]` diagnostics) was deliberately left alone — Info
severity, out of the critical_warning scope.

## Fixed Issues

### WR-02: Timeout errors treated as retryable (real bound ~3x25s) + WR-03: 25s false-trips large-library PICS

**Files modified:** `src/backend/storeManagers/steam/withTimeout.ts`, `src/backend/storeManagers/steam/depot.ts`, `src/backend/storeManagers/steam/__tests__/withTimeout.test.ts`, `src/backend/storeManagers/steam/__tests__/depot.test.ts`
**Commit:** 8894e10e
**Applied fix:**

WR-02 (single-attempt on timeout):
- `withTimeout.ts` now stamps its timeout `Error` with `{ isTimeout: true }` and exports
  a `TimeoutError` type + `isTimeoutError()` type guard.
- `withPlanBuildRetry` (depot.ts) fail-fast condition extended to
  `isNonRetryableDepotError(err) || isTimeoutError(err)`, so a hung CM call rejects after
  ONE bound instead of burning `PLAN_BUILD_MAX_ATTEMPTS` (~3x) against the same stale
  fast-path socket. This restores the documented single-deadline behavior.
- The `STEAM_PICS_TIMEOUT_MS` doc comment was corrected to state the real single-attempt
  worst case (no longer ~3x).

WR-03 (dedicated bulk bound):
- Added `STEAM_PICS_BULK_TIMEOUT_MS = 90000` for the BULK/many-appid PICS fetches
  (`getOwnedSets` over every package license; `fetchDlcInfos` over the full DLC id list),
  which node-steam-user issue #144 (cited in CLAUDE.md) flags as legitimately slow. These
  two call sites now use the larger bound; the single-app paths (`fetchAppInfo`,
  `fetchInstalldir`, `getDepotDecryptionKey`, `getRawManifest`) keep the 25s
  `STEAM_PICS_TIMEOUT_MS`. The "cannot false-trip" doc claim was softened per the review.

Tests:
- `withTimeout.test.ts`: new cases assert the `isTimeout` marker + `isTimeoutError()`
  discrimination (does not over-broaden onto ECONNRESET/plain values), and that the bulk
  bound is strictly larger than the single-app bound.
- `depot.test.ts`: the two existing G-30-02 "never-settling" tests were updated from
  `toHaveBeenCalledTimes(PLAN_BUILD_MAX_ATTEMPTS)` to `toHaveBeenCalledTimes(1)` — this
  encodes and proves the WR-02 single-attempt behavior.

### WR-01: Nested equal-bound withTimeout overrides fetchInstalldir's no-hard-fail contract

**Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`, `src/backend/storeManagers/steam/__tests__/installLocation.test.ts`
**Commit:** aa5aba43
**Applied fix:**

Chose the review's Option A (strictly larger outer bound) over Option B (drop the wrapper),
preserving the belt-and-suspenders guard against a FUTURE un-timed non-CM await while
fixing the masking. The outer `withTimeout` around `resolveSteamInstallTarget` in games.ts
now uses `STEAM_PICS_TIMEOUT_MS * 2` (50s), strictly larger than the inner
`fetchInstalldir` per-call bound (25s). Because the outer timer is armed first, an equal
bound always elapsed before the inner one and converted `fetchInstalldir`'s DELIBERATE
no-hard-fail fallback (a hung installdir lookup must degrade to a safe fallback dir name,
never fail the install) into a fatal "Steam pre-download timed out". With a larger outer
bound the inner graceful fallback always wins its own race; the outer only trips on a
non-CM await (its intended belt-and-suspenders case).

Tests:
- `installLocation.test.ts`: new WR-01 case proves a never-settling installdir
  `getProductInfo` is bounded by `fetchInstalldir`'s inner timer and RESOLVES
  `resolveSteamInstallTarget` with a safe fallback dir (never rejects) — the inner
  non-masking contract the outer larger bound preserves.
- `games.test.ts`: the existing G-30-02 "never-settling resolveSteamInstallTarget" test
  advanced fake timers by a hardcoded 30000ms tied to the OLD 25s bound; with the doubled
  outer bound the outer timer no longer fired at 30s, so the test hung at jest's 5s
  timeout and leaked fake-timer state into 15 downstream tests (single-flight + bridge
  routing). Updated to advance by `STEAM_PICS_TIMEOUT_MS * 2 + 5000` (referencing the
  constant so it stays robust), which restored all 16 tests.

## Verification

- `npx tsc --noEmit`: clean (exit 0), full project.
- `npx jest src/backend/storeManagers/steam/ src/backend/sidecar/`: 37 suites / 1004 tests
  pass. (A `library.ts:1147` leaked-timer force-exit warning appears but is the KNOWN
  pre-existing install-poller teardown issue — `readAcfState` firing after the
  `getSteamLibraries` mock is torn down — unrelated to these files; all tests pass.)

## Notes for human / live retest

- The defect G-30-02 is LIVE-ONLY per the standing memory note (jest proves the mechanism,
  not the live closure). These fixes tighten the mechanism (single-attempt, correct
  layering, bulk headroom) but the real proof is a live Test1/Test4 retest of an install
  on Tauri — recommend running that before considering G-30-02 closed.
- The specific bound VALUES are tuning judgments worth confirming live: outer =
  `STEAM_PICS_TIMEOUT_MS * 2` (50s), bulk = 90s. They are safely above realistic healthy
  latency per the review, but a large-library user on a slow connection is the case #144
  warns about — worth a real-world sanity check.
- IN-01 (leftover `[Timing]` diagnostics incl. the per-install content-server directory
  dump at depot.ts:2122-2125) remains OUT of scope here but is still owed a removal/gating
  before merge, consistent with the standing memory note that temp diagnostic logging must
  be reverted before merge.

---

_Fixed: 2026-07-23T03:14:19Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

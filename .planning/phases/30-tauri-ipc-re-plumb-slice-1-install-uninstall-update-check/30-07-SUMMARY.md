---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
plan: 07
subsystem: steam-native-install
tags: [steam-user, cm-connection, timeout, promise-race, tauri, gap-closure]

# Dependency graph
requires:
  - phase: 30-05
    provides: installFlowRegistration.ts's finally(hadError)/catch terminal-'done' + showDialog ERROR machinery
provides:
  - withTimeout.ts — reusable Promise.race timeout wrapper (STEAM_PICS_TIMEOUT_MS = 25000)
  - Every known pre-download steam-user CM call bounded (getProductInfo x4 call sites, getDepotDecryptionKey, getRawManifest, getContentServers)
  - resolveSteamInstallTarget phase in runNativeDepotDownload bounded (belt-and-suspenders)
affects: [30-HUMAN-UAT, install-uninstall-update-check-live-retest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.race timeout wrapper with finally-cleared setTimeout — bounds a bare CM call/callback-Promise without altering its resolve/reject value on the happy path"
    - "Timeout rejections feed EXISTING retry/terminal-clear machinery (withPlanBuildRetry, 30-05's finally/catch) rather than duplicating it"

key-files:
  created:
    - src/backend/storeManagers/steam/withTimeout.ts
    - src/backend/storeManagers/steam/__tests__/withTimeout.test.ts
  modified:
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts

key-decisions:
  - "STEAM_PICS_TIMEOUT_MS = 25000: below ensureConnected's ~35s worst-case ceiling, far above any healthy PICS round-trip (sub-second to low-single-digit seconds per existing [Timing] logs) — cannot false-trip a slow-but-progressing fetch"
  - "Worst-case aggregate stated ACCURATELY: fetchInstalldir (25s, swallowed) + 3 sequential buildDepotPlan PICS calls each able to burn PLAN_BUILD_MAX_ATTEMPTS(3) x 25s = up to ~250s (~4.2 min) theoretical worst case; ~100s (~1.5 min) common case where fetchAppInfo short-circuits after its own ~75s. Badge ALWAYS clears — the point is bounded, not instant."
  - "Coverage EXTENDED (not narrowed) per checker finding #3: fetchDepotPlanEntry's getDepotDecryptionKey/getRawManifest AND getContentServerHosts's getContentServers are wrapped too, not just getProductInfo — a socket going stale MID-buildDepotPlan is bounded, not just at click"
  - "Streaming download phase (downloadDepotFiles, post-plan-build) deliberately NEVER bounded — CR-03/CR-04's long-install invariant preserved; only the pre-download PICS/plan-build/content-directory phase is bounded"
  - "ensureConnected fast-path hardening (revalidating a live socket) DEFERRED on its own technical merits (hot-path cost, no reliable cheap liveness check, hard to test deterministically) — NOT implemented here, NOT attributed to any source artifact labeling it optional"

requirements-completed: [REQ-30-04, REQ-30-05]

duration: 25min
completed: 2026-07-23
---

# Phase 30 Plan 07: G-30-02 Install-Spinner Hang Gap Closure Summary

**Wrapped every pre-download steam-user CM call (getProductInfo, getDepotDecryptionKey, getRawManifest, getContentServers) plus the resolveSteamInstallTarget resolution phase in a 25s `withTimeout` Promise.race, converting a stale-CM-socket hang into a bounded rejection that feeds 30-05's EXISTING terminal-clear machinery.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-23T02:29:33Z (per STATE.md `last_updated` at plan start)
- **Completed:** 2026-07-23
- **Tasks:** 2 completed
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Under Tauri, clicking Install on a Steam title whose steam-user CM socket is present-but-unresponsive now ALWAYS reaches a terminal state (badge clears + ERROR dialog) within a bounded time instead of spinning forever — G-30-02 closed.
- The COMPLETE known pre-download CM surface is bounded, not just the click-time `getProductInfo`: `getOwnedSets`/`fetchAppInfo`/`fetchDlcInfos` (all `getProductInfo`), `fetchDepotPlanEntry`'s `getDepotDecryptionKey`/`getRawManifest`, and `getContentServerHosts`'s `getContentServers`. A socket going stale mid-`buildDepotPlan` (after earlier PICS calls already succeeded) is now bounded too — this was the checker's finding #3 extension, not present in the original diagnosis.
- Belt-and-suspenders: `runNativeDepotDownload`'s `resolveSteamInstallTarget` phase is also directly bounded and converts a timeout to the returned `{status:'error'}` contract — guards against any future un-timed pre-download await that isn't a CM primitive.
- Zero new terminal-status/handler logic: every timeout rejection feeds the EXISTING `withPlanBuildRetry` retry-then-throw machinery (depot.ts) and 30-05's `finally(hadError)`/`catch` guard (installFlowRegistration.ts) — installFlows.test.ts locks that the timeout-origin error shape rides that exact path.
- The streaming download phase (`downloadDepotFiles`, post-plan-build) is deliberately left unbounded — CR-03/CR-04's long-install invariant is preserved; only the pre-download PICS/plan-build/content-directory phase is bounded.
- Happy-path (fast CM call / fast `resolveSteamInstallTarget`) behavior is unchanged on both builds — `withTimeout` is a transparent pass-through, protecting the Electron install path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add withTimeout and bound every pre-download CM call (getProductInfo, getDepotDecryptionKey/getRawManifest, getContentServers)** - `0aeb4205` (test, TDD RED→GREEN in one commit per task convention)
2. **Task 2: Bound runNativeDepotDownload's pre-download phase + full both-builds regression sweep** - `3d3a5887` (fix)

_Both tasks used `tdd="true"` — tests were written first (RED against HEAD, confirmed to fail for the right reason: a never-settling mock hangs past the jest test timeout without the wrapper) and the implementation made them pass (GREEN) within the same commit, following this plan's own convention of one commit per task rather than separate test/feat commits._

## Files Created/Modified

- `src/backend/storeManagers/steam/withTimeout.ts` - `withTimeout<T>(promise, ms, label)` Promise.race timeout wrapper + `STEAM_PICS_TIMEOUT_MS = 25000` constant
- `src/backend/storeManagers/steam/__tests__/withTimeout.test.ts` - happy-path pass-through, timeout rejection (label + bound in message), original-error-not-masked + no dangling timer
- `src/backend/storeManagers/steam/installLocation.ts` - `fetchInstalldir`'s `getProductInfo` await wrapped (existing try/catch already turns the reject into a benign `undefined`)
- `src/backend/storeManagers/steam/depot.ts` - `getOwnedSets`/`fetchAppInfo`/`fetchDlcInfos` `getProductInfo` calls, `fetchDepotPlanEntry`'s `getDepotDecryptionKey`/`getRawManifest`, and `getContentServerHosts`'s `getContentServers` all wrapped in `withTimeout`
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - new `G-30-02` describe block: never-settling `getProductInfo` rejects buildDepotPlan within the bound; never-settling `getDepotDecryptionKey` (extended coverage) likewise; real-timer happy-path proving transparency
- `src/backend/storeManagers/steam/games.ts` - `runNativeDepotDownload` wraps `resolveSteamInstallTarget` in `withTimeout`, catches a timeout/failure and returns `{status:'error', error:'Steam pre-download timed out: ...'}` instead of letting it propagate as an unhandled throw
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - new `G-30-02` describe block under the SNI-07 install harness: never-settling `resolveSteamInstallTarget` resolves `install()` to `{status:'error'}` within the bound; fast-resolving path unchanged
- `src/backend/sidecar/__tests__/installFlows.test.ts` - new test locking that the timeout-origin `{status:'error'}` shape reaches `['queued','installing','done']` + a `showDialog` ERROR frame via 30-05's existing guard, zero new handler code

## Decisions Made

- **25s timeout bound** (`STEAM_PICS_TIMEOUT_MS`): chosen below `ensureConnected`'s ~35s worst-case ceiling (15s cold-connect + 20s grace) and far above any healthy PICS round-trip (sub-second to low-single-digit seconds per existing `[Timing]` instrumentation). Kept, not reduced, to avoid false-tripping a slow-but-progressing fetch on a poor connection.
- **Worst-case aggregate stated accurately**: `fetchInstalldir` (25s, swallowed by its own try/catch to `undefined`) plus up to three sequential `buildDepotPlan` PICS calls, each able to burn `PLAN_BUILD_MAX_ATTEMPTS` (3) × 25s = 75s if the same stale socket hangs all three → theoretical worst case ≈ 250s (~4.2 min). Common case (`fetchAppInfo` throws after its own ~75s and short-circuits the rest) ≈ 100s (~1.5 min). The badge ALWAYS clears eventually — bounded, not instant.
- **Coverage extended, not narrowed** (checker finding #3): wrapping `getDepotDecryptionKey`/`getRawManifest`/`getContentServers` in addition to `getProductInfo` closes the gap where a socket goes stale mid-`buildDepotPlan` rather than only at click time — same bare callback-Promise CM call-class, same retry-then-throw recovery, low-risk and additive.
- **Streaming download phase never bounded**: `downloadDepotFiles`/the chunk-download loop inside `downloadSteamDepots` is explicitly untouched — a real depot install can legitimately run for hours after plan-build completes, and CR-03/CR-04 already removed the flat 60s sidecar-invoke deadline for exactly this reason.
- **`ensureConnected` fast-path hardening deferred**, on its own technical merits (hot path for every steam-user caller, no reliable cheap liveness check without a real CM round-trip, hard to test deterministically) — not implemented here, tracked as a follow-up.

## Deviations from Plan

None - plan executed exactly as written. The "RED test already committed" note in the plan's setup (commit `4fc54d57`) was itself a plan-text addition describing the extended-coverage test case to write, not a pre-existing failing test file — Task 1 wrote that test (and the others) fresh, confirmed each would hang/fail against the pre-wrap code (a mock that never calls its callback with no `withTimeout` in place has no bound and would exceed jest's default test timeout), then made it pass by wiring `withTimeout` into the call site.

## Issues Encountered

None. The known pre-existing `library.ts` leaked-timer jest exit warning (documented separately, unrelated to this plan) appeared during the full regression sweep but did not fail any test — all 37 suites / 1001 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-30-02 is code-complete and unit-test-verified. Per `30-HUMAN-UAT.md`'s "Gaps (retest cycle)" tracking, the next step is a LIVE retest of Test 1 (install spinner) and Test 4 (Install→Uninstall E2E) under the Tauri build — this defect was only ever observable live (a real stale CM socket), so jest proves the mechanism, not the live closure.
- No blockers. `npx tsc --noEmit` clean; both builds' Steam install behavior is unchanged on a healthy CM connection.
- Recommended next command: `/gsd-verify-work 30` (or the project's live-retest workflow) to confirm the badge now clears within the documented ~1.5-4.5 min bound on real hardware with a genuinely stale socket, or at minimum that a normal install still completes end-to-end unaffected.

---
*Phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check*
*Completed: 2026-07-23*

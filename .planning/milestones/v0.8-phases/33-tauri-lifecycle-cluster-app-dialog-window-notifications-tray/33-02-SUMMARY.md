---
phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
plan: 02
subsystem: steam-backend
tags: [steam, install-hang, cm-reconnect, relog, G-30-02, D-02, D-01a, regression-tests]

# Dependency graph
requires:
  - phase: 30-tauri-lifecycle (30-07 gap closure)
    provides: withTimeout/isTimeoutError helper + STEAM_PICS_TIMEOUT_MS/STEAM_PICS_BULK_TIMEOUT_MS bounds
provides:
  - ensureConnected() no longer trusts a populated client.steamID alone as proof
    of a live CM connection — a bounded canary getProductInfo probe
    (CANARY_TIMEOUT_MS ~5s) now revalidates it first
  - On canary failure, a guarded client.relog() call + bounded grace window
    (RELOG_GRACE_MS ~20s) self-heals a stale-but-rehydrated socket instead of
    merely failing fast, so the install actually proceeds
  - D-01a gap-audit confirming every install-path PICS await stays
    withTimeout-bounded, PLUS a fix for one newly-discovered bare call
affects: [33-05 (live-hardware proof of G-30-02, D-13), any future steam/user.ts
  or bridge/launchTarget.ts work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canary-probe-then-relog: race a cheap, already-bounded CM call before
      trusting local connection state; on failure call the library's own
      purpose-built relog() (not a hand-rolled reconnect) and await its
      loggedOn/error events with the same bounded-grace idiom already used
      for cold-connect"
    - "Guard a library call that can throw synchronously (relog()) in its own
      try/catch, falling through to an existing recovery path on throw rather
      than adding a second failure mode"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - src/backend/storeManagers/steam/bridge/launchTarget.ts

key-decisions:
  - "Used AppID 753 (Steam's own client AppID) as the canary probe target —
    universally owned, so the canary never fails for ownership reasons
    unrelated to CM socket health"
  - "CANARY_TIMEOUT_MS (5s) deliberately far below STEAM_PICS_TIMEOUT_MS (25s)
    since a healthy CM answers a single-app getProductInfo in well under a
    second — 5s already generously covers jitter before suspecting staleness"
  - "D-01a audit was NOT clean: found one new bare client.getProductInfo call
    in bridge/launchTarget.ts (resolveBridgeLaunchExe) reachable from the
    macOS bridge INSTALL path (games.ts installBridgeGame, not just
    launch/uninstall) — wrapped with the existing withTimeout/
    STEAM_PICS_TIMEOUT_MS convention rather than deferring, since the plan's
    own D-01a instructions explicitly authorize fixing install-path
    regressions found during this audit"

patterns-established:
  - "A withTimeout-wrapped canary immediately followed by a relog()+bounded-
    grace fallback is now the standard self-healing shape for any future
    'is this CM connection actually alive' check in this codebase"

requirements-completed: [REQ-33-01, REQ-33-11]

# Metrics
duration: ~25min
completed: 2026-07-24
---

# Phase 33 Plan 02: ensureConnected canary + relog CM revalidation (D-02) Summary

**Fixed the root cause behind G-30-02's rehydrated-install failure mode: `ensureConnected()` now races a bounded canary probe against the "already connected" fast path and, on failure, calls steam-user's own `client.relog()` with a bounded grace window — so a store-rehydrated library whose CM socket went stale by Install time reconnects and the install actually succeeds, instead of merely failing fast.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed (2 commits: feat, test — Task 2 is test-only per plan type)
- **Files modified:** 3 (2 planned + 1 D-01a gap fix)

## Accomplishments

- `ensureConnected()`'s blind `if (this.client?.steamID) return true` fast path is replaced with a bounded canary (`getProductInfo([753], [], true)`, `CANARY_TIMEOUT_MS` = 5s via the existing `withTimeout` helper) that preserves the near-instant healthy common case.
- On canary failure, `client.relog()` is called (guarded in try/catch — it throws synchronously if `steamID` is falsy or the login wasn't token-based) and a bounded `RELOG_GRACE_MS` (20s) grace window awaits `loggedOn`/`error`, mirroring the existing cold-connect grace idiom already in this same function.
- If `relog()` throws, execution falls through to the existing cold-connect path rather than crashing — verified by a dedicated test.
- Added 5 unit tests covering all 4 behaviors from the plan (healthy short-circuit, stale-canary self-heal, bounded-never-hangs grace timeout, error-during-relog) plus the relog-throws-synchronously fallback.
- Ran the D-01a gap-audit grep (`client.getProductInfo|getDepotDecryptionKey|getRawManifest|getProductAccessTokens`) across `src/backend/storeManagers/steam/`. Result: **NOT clean** — found one new bare, un-timed call in `bridge/launchTarget.ts`'s `resolveBridgeLaunchExe`, reachable from the macOS bridge install path (`games.ts` `installBridgeGame()`, used to place the launch shim post-download) as well as launch/uninstall. Wrapped it with the existing `withTimeout`/`STEAM_PICS_TIMEOUT_MS` convention (identical call shape to `installLocation.ts`'s already-bounded `fetchInstalldir`). All three sites named in the plan's `<interfaces>` (`depot.ts` L429-486, `depot.ts` L548-610, `installLocation.ts`'s `fetchInstalldir`) were confirmed already `withTimeout`-wrapped — no action needed there.

## Task Commits

1. **Task 1: Replace ensureConnected's blind fast-path with a bounded canary + client.relog() revalidation (D-02)**
   - `80232172` (feat) — canary probe + relog + bounded grace window, guarded relog() try/catch falling through to cold-connect on throw
2. **Task 2: Add ensureConnected unit tests + run the D-01a surgical-bound gap-audit (D-01a)**
   - `f5af6532` (test) — 5 new tests in `user.test.ts` for the canary/relog behaviors, plus the D-01a-discovered `withTimeout` fix in `bridge/launchTarget.ts`

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/backend/storeManagers/steam/user.ts` — `ensureConnected()`'s fast path now canary-probes before trusting `client.steamID`; on canary failure calls `client.relog()` (try/catch-guarded) and awaits a bounded grace window; new constants `CANARY_APP_ID` (753), `CANARY_TIMEOUT_MS` (5000), `RELOG_GRACE_MS` (20000); imports `withTimeout` from `./withTimeout`
- `src/backend/storeManagers/steam/__tests__/user.test.ts` — added `getProductInfo`/`relog` to the shared `mockSteamUserInstance` (re-armed to a healthy default in `beforeEach`, per the file's `resetMocks: true` convention); new `describe('ensureConnected() — canary + relog revalidation (D-02)')` block with 5 tests
- `src/backend/storeManagers/steam/bridge/launchTarget.ts` — D-01a gap fix: wrapped `resolveBridgeLaunchExe`'s bare `client.getProductInfo(...)` call in `withTimeout(..., STEAM_PICS_TIMEOUT_MS, 'resolveBridgeLaunchExe getProductInfo')`

## Decisions Made

- **AppID 753** (Steam's own client AppID) chosen as the canary probe target — universally owned by every Steam account, so the canary never fails for ownership reasons unrelated to CM socket health.
- **D-01a fix-in-place vs. defer:** the plan's own Task 2 action text explicitly instructs "If the audit finds any NEW bare steam-user CM await regressed since 30-07 on the install path, wrap it with `withTimeout` ... and note it in the SUMMARY" — this is a plan-authorized fix, not an out-of-scope deviation, so it was applied directly rather than deferred to `deferred-items.md`.
- Kept the relog grace window's `setTimeout`/`once('loggedOn'|'error')` shape byte-for-byte parallel to the existing cold-connect grace idiom a few lines below in the same function (per the plan's explicit instruction to mirror it), rather than inventing a new shape.

## Deviations from Plan

### Auto-fixed Issues (plan-authorized, D-01a)

**1. [D-01a gap-audit finding] Bare `client.getProductInfo` call in `bridge/launchTarget.ts` not `withTimeout`-wrapped**
- **Found during:** Task 2's D-01a gap-audit grep
- **Issue:** `resolveBridgeLaunchExe` (used to resolve the macOS bridge's Windows launch executable) called `client.getProductInfo([numericAppId], [], true)` with no timeout bound — reachable not just from the launch/uninstall paths but from `games.ts`'s `installBridgeGame()` (the bridge install flow's post-download shim-placement step), making this a genuine install-path regression of the same hang class 30-07 fixed elsewhere.
- **Fix:** Wrapped the call in `withTimeout(..., STEAM_PICS_TIMEOUT_MS, 'resolveBridgeLaunchExe getProductInfo')`, matching `installLocation.ts`'s `fetchInstalldir` (the identical call shape, already bounded).
- **Files modified:** `src/backend/storeManagers/steam/bridge/launchTarget.ts`
- **Commit:** `f5af6532`

No other deviations — Task 1 executed exactly per the plan's illustrative shape.

## Issues Encountered

None — implementation matched the plan's illustrative code shape closely; no debugging cycles were needed.

## User Setup Required

None — no external service configuration required.

## Threat Model Verification

All four `mitigate`-disposition threats from this plan's `<threat_model>` are addressed in the implementation:

- **T-33-04** (relog reconnect-loop DoS): a single `relog()` call per `ensureConnected()` invocation; the bounded grace window resolves `false` rather than retrying — steam-user's own internal exponential backoff governs any further reconnect attempt.
- **T-33-05** (token leaking into logs): verified — every `logInfo`/`logWarning` call in the modified region logs only timing/status/error-object breadcrumbs, never a token value.
- **T-33-06** (unbounded canary hang, the original bug class): the canary is `withTimeout`-wrapped (~5s); the relog grace is `setTimeout`-bounded (~20s); both paths always settle.
- **T-33-SC** (package installs): N/A — no package installs in this plan.

## Next Phase Readiness

- This plan's fix is code-complete and unit-verified; live hardware proof of the G-30-02 install-hang closure (the rehydrated-install-actually-succeeds behavior) is explicitly gated to Plan 33-05 (D-13) per this plan's own `<objective>` — do not consider G-30-02 closed until that live retest passes.
- No blockers for the remaining Phase 33 plans (33-01's dialog/watchdog work and this plan's `ensureConnected`/`launchTarget.ts` changes touch disjoint files, confirmed no merge conflicts on this branch).

---
*Phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/user.ts
- FOUND: src/backend/storeManagers/steam/__tests__/user.test.ts
- FOUND: src/backend/storeManagers/steam/bridge/launchTarget.ts
- FOUND: 80232172 (feat — Task 1)
- FOUND: f5af6532 (test — Task 2)

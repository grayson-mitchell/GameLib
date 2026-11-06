---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
fixed_at: 2026-11-04T00:00:00Z
review_path: .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 59: Code Review Fix Report

**Fixed at:** 2026-11-04
**Source review:** .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-REVIEW.md (round 6, commit 6f1484ebb)
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02; fix scope critical_warning)
- Fixed: 2. Both were fixed by quick tasks committed after the review, so this run made no new commits.
- Skipped: 0
- Out of scope: IN-01, IN-02 (Info)

## Fixed Issues

### WR-01: Strict DXVK restore reads "unable to find" from output that `resolveOnExit` may have cut short

**Files modified:** `src/backend/tools/index.ts` (plus tests `src/backend/tools/__tests__/dxvkInstallRemove.test.ts`, `src/backend/__tests__/launcher_runWineCommandResolveOnExit.test.ts`)
**Commit:** e3852a220 (failing tests), 1249a076f (fix). Both are from quick task 261104-9ou and are on main.
**Applied fix:** `restoreDxvkStrict` removes the overrides with a single `reg import` of `"<dll>"=-` entries. If the import exits 0, it checks each override with `reg query KEY /v <dll>`. The result comes from `result.code` only: 0 means the override is still there (recorded in `overrides left`), 1 means it is gone, and any other code is a failure. Code 1 is only trusted after a successful import. No stdout or stderr text is read when deciding the result, so output that `resolveOnExit` cuts short can no longer mark a restore as failed.
**Verification (this run):** Read the current `restoreDxvkStrict` in `src/backend/tools/index.ts`, around lines 610-730. Nothing in the result logic matches output text any more. `dxvkInstallRemove.test.ts` and `launcher_runWineCommandResolveOnExit.test.ts` pass. The second file covers the case the review asked for: stderr that arrives after `exit` is lost, but the exit code is still there. I found no remaining gap.

### WR-02: WR-03 from round 5 (joined second Play re-runs the launcher-level sequence) remains open

**Files modified:** `src/backend/launchSingleFlight.ts` (new), `src/backend/storeManagers/steam/launchDispatch.ts`, `src/backend/launcher.ts` (plus tests `src/backend/__tests__/launchSingleFlight.test.ts`, `src/backend/__tests__/launcher_launchSingleFlight.test.ts`, `src/backend/storeManagers/steam/__tests__/launchDispatch.test.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`)
**Commit:** 9f13a302b (Steam single-flight at `dispatchSteamLaunch`), 9856a1f8e (single-flight in `launchEventCallback` for non-Steam runners), 4daa26b34 (IN-04 test through the public `launch()` entry). These are from quick task 261103-x6m (docs f165329d8). All three come after the round-6 review commit 6f1484ebb and are on main.
**Applied fix:** This is the first fix option from round 5. The single-flight check now sits at the launch entry points, keyed by `runner:appName`. `singleFlightLaunch` checks and sets the key synchronously, hands the joiner the owner's promise, and releases the key only when the owner settles. All Steam launches go through `dispatchSteamLaunch`, both the sidecar `launch` IPC and the `gamelib://launch` deep link in `protocol.ts`. Every other runner goes through `launchEventCallback`, a plain arrow function, so the check runs before the first `await` in `runLaunchEventCallback`. Either way, a second Play for the same app joins the first one before any launcher-level work: the log writer, wine checks, before/after launch scripts, `launching`/`done` status updates and `addRecentGame`. A Steam joiner gets one "already starting" notification. The G26 `bridgeLaunchesInFlight` guard in `games.ts` is still there as a second layer of protection for the bridge body.
**Verification (this run):** Read `launchSingleFlight.ts`, `launchDispatch.ts`, and `launcher.ts` around lines 238-400 to confirm Steam never reaches `launchEventCallback`. Tests pass: `launchSingleFlight.test.ts`, `launcher_launchSingleFlight.test.ts`, `launchDispatch.test.ts`. I found no remaining gap.

## Out of Scope (Info, not fixed)

### IN-01: Launch-option picker resolves `{ status: 'done' }` before the chosen launch result, discarding it

**File:** `src/frontend/helpers/library.ts:407-415` and `:425-455`
**Reason:** Info finding. The fix scope is critical_warning.

### IN-02: Retry detail text mislabels a mixed-kind failure

**File:** `src/backend/storeManagers/steam/engine/engineDecision.ts:296-303`
**Reason:** Info finding. The fix scope is critical_warning.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

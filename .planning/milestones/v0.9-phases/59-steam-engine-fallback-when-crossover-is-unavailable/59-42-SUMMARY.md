---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 42
subsystem: steam-engine
tags: [G25, offline-at-play, launch-target, offline-refusal]
requires: [59-40, 59-41]
provides:
  - resolveBridgeLaunchExe(appId, opts?: { offline?: boolean }) offline short-circuit to the stored launch target
  - one fresh checkConnectivityNow per TCP bridge launch, threaded into selectLaunchEngine
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/launchTarget.ts
    - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - Skip (not reorder) the launch-target CM read when offline with a stored target; keeps DRM-mode routing order
  - Early refusal now driven by offlineLaunchCertainlyBlocked, with the arm appended to the existing warning text
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-03
requirements-completed: [G25]
---

# Phase 59 Plan 42: Wire fresh connectivity into Play Summary

Play now takes one fresh connectivity check, skips the ~9 s anonymous CM logon when offline with a stored launch target, and refuses at once (including CrossOver missing with the DXVK copy present) via the 59-41 predicate.

## Commits

- 327ba8586: Task 1, offline short-circuit in resolveBridgeLaunchExe (3 new G25 tests, 29 pass)
- Task 2 feature commit: games.ts wiring plus 5 new G25 tests and G22 helper moved to the checkConnectivityNow mock
- Follow-up fix commit: restored an `activate: false` on the second `openExternal` site (see Deviations)

## Deviations from Plan

**1. [Process slip, corrected] Second openExternal site.** While isolating the foreign `activate: false` hunk at ~line 2035 with a blanket sed, I also stripped an already-committed `activate: false` at ~line 4017 in the Task 2 commit. Caught on the post-commit check and restored in a follow-up fix commit; net HEAD~2..HEAD has no `activate` change, and the working tree shows exactly the foreign 2035 hunk.

**2. [Rule 1] Existing assertion updated.** The allowlisted-launch test asserted `resolveBridgeLaunchExe` was called with only `APP_ID`; updated to include `{ offline: false }`.

## Known issue (not mine)

12 `SteamGame.install()` tests in games.test.ts fail because the foreign uncommitted `openExternal(url, { activate: false })` hunk changes the call signature they assert. They pass without that hunk; left alone per instructions.

## Verification

prettier --check clean on the four paths; launchTarget (29), bridge dir, connectivityNow, onlineMonitor and engine/ suites pass (1734 tests); games.test.ts 621 pass, 12 failing are the foreign-hunk install tests; `pnpm codecheck` and `pnpm smoke:sidecar` pass; eslint 0 errors.

## Self-Check: PASSED

---
phase: 74-steam-game-updates
plan: 34
subsystem: steam
tags: [steam, update-poll, installapp, gap-closure]
requirements: [STEAM-01]
key-files:
  modified:
    - src/backend/storeManagers/steam/library/updatePollOnce.ts
    - src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 74 Plan 34: UAT 25 InstallApp retry Summary

The InstallApp retry now disarms only on real download activity, not on Steam's pending-but-idle ACF rewrite (StateFlags 6, TargetBuildID=target, 0 bytes). Completion is also guarded against logging `finished` at the stale starting build.

## Commits
- 5e55d2e36 test(74-34): RED tests (A, B, E failed on old code: 3 failed / 20 passed; C, D, F passed)
- fix(74-34): removed `awaiting.sawPending` from the `retryInstallApp` guard; added `atStaleStart` guard to the non-quiet completion condition; updated doc comments (see `git log`)

## Verification
- steam jest: 167 suites pass, 4517 tests pass; library.updatePollOnce all green.
- tsc --noEmit clean, steam-line-ceiling PASS, eslint clean on both files, prettier clean.
- Not run: `pnpm find-deadcode`.

## Deviations from Plan
None to the plan's logic.

## Deferred Issues
Two pre-existing failures in `bridge/__tests__/shimCoverage.test.ts` and `shimGenerate.test.ts` (committed `steam_api.def` generated file missing in the fresh worktree); out of scope.

## Self-Check: PASSED

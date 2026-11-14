---
phase: 74-steam-game-updates
plan: 35
subsystem: steam-updates
tags: [logging, uat-28, auto-update]
requirements: [STEAM-02]
key-files:
  modified:
    - src/backend/utils/checkGameUpdates.ts
    - src/backend/utils/__tests__/checkGameUpdates.test.ts
    - src/backend/storeManagers/steam/library/index.ts
    - src/backend/storeManagers/steam/__tests__/library.updates.test.ts
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 74 Plan 35: Auto-update diagnostic logging Summary

Two log lines make the boot auto-update self-diagnosing: `checkGameUpdates: auto-update skipped: autoUpdateGames off` (once per check when the setting is off) and `Steam: auto-update candidates=<n>` (per successful `listAutoUpdateableGames`). No behaviour change.

## Confirmed setting source

`GlobalConfig.getSettings()` in `src/backend/config.ts` reads `paths.configPath` and spreads `defaultSettings`. `store/config.json` is a mirror and is not read by the update check.

## Tasks

1. Off-branch log in `checkGameUpdates` (commit 5bfce41a8). RED run: the new `toHaveBeenCalledTimes(1)` assertion on logInfo failed (0 calls) before the change; green after.
2. Candidate-count log in `SteamLibraryManager.listAutoUpdateableGames` (second commit, `feat(74-35): log Steam auto-update candidate count`), placed after the loop and outside the catch. RED run: 1 of 6 failed before the change; 12/12 green across both suites after.

## Verification

jest (both suites) green, `tsc --noEmit` clean, `pnpm steam-line-ceiling` PASS, prettier --check clean on all four paths. `pnpm lint` and `pnpm find-deadcode` were not run.

## Deviations from Plan

- The worktree had no phase 70 uncommitted hunks in `library/index.ts` (it is a clean checkout), so the staging caveat did not apply; the commit contains only the new log line.
- Worktree base was reset to 61fd8e699 per the branch check (it started on a different base).

## Threat flags

None. Lines carry only a setting name and a count (T-74-130 mitigated).

## Self-Check: PASSED

---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 04
subsystem: steam-engine
tags: [launch-deadline, bottle-process-monitor]
requires: []
provides:
  - "onFirstMatch hook on startBottleProcessMonitor"
  - "engine/launchDeadline.ts (armLaunchDeadline, cancelLaunchDeadline, LAUNCH_DEADLINE_MS)"
affects: [59-10]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/launchDeadline.ts
    - src/backend/storeManagers/steam/engine/__tests__/launchDeadline.test.ts
  modified:
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
decisions:
  - "Launch deadline default 180_000 ms; separate from the monitor (LD-4 intact)"
requirements-completed: [D-10, D-11]
duration: 10min
completed: 2026-11-01
---

# Phase 59 Plan 04: Launch deadline building blocks Summary

Once-only, failure-isolated `onFirstMatch` signal on the bottle process monitor plus a standalone unref'd per-appId launch deadline (180 s) for 59-10 to arm and cancel.

## Tasks
1. onFirstMatch on bottleProcessMonitor (fires from both recordFirstMatch sites, guarded by `firstMatchFired`, try/catch) - commit see git log `feat(59-04): onFirstMatch signal`.
2. engine/launchDeadline.ts with supersede/cancel reasons, numeric appId guard, unref'd timer, map empty at load - commit `feat(59-04): per-appId launch deadline module`.

## Verification
Both jest suites pass (56 tests), `pnpm codecheck` clean, prettier clean.

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED

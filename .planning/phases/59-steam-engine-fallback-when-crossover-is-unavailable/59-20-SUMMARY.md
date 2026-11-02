---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 20
subsystem: backend
tags: [steam, engine-fallback, gap-closure, launch-deadline]
requires: [59-14, 59-15, 59-17]
provides:
  - bindDeadlineToMonitor (launch deadline stands down when no monitor starts)
  - In-app dialogs for download failure, rejected selection, shared-bottle refusal
  - crossoverHealthy passed to prepareBottleForEngine
  - writeBridgeModeVerdict writer at bridge launch
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/launchDeadline.ts
    - src/backend/storeManagers/steam/engine/__tests__/launchDeadline.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "STAGING_MONITOR_MATCH and its dead branch removed; the deadline is only armed with an install root and is cancelled via bindDeadlineToMonitor if the monitor returns null"
metrics:
  completed: 2026-11-02
  tasks: 2
requirements: [D-06, D-09, D-10, D-11]
---

# Phase 59 Plan 20: Monitor-bound launch deadline and surfaced engine failures Summary

A launch deadline can no longer outlive the absence of a process monitor (CR-01), and every launch-engine failure that stops Play now shows an in-app dialog.

## Commits
- da4d6f341: bindDeadlineToMonitor helper, use in fireBridgeWineLaunch, STAGING_MONITOR_MATCH removed (CR-01, IN-01)
- 2f64c102d: showEngineDialog for download failure / rejected selection / shared-bottle (WR-08, WR-06); `crossoverHealthy: decision.preflight?.kind === 'healthy'` (G10); CrossOver-target dxvk-failed warning mentions the retry; `writeBridgeModeVerdict(appId, wantsDrm ? 'steamclient-layer' : 'tcp')` (WR-04 writer)

## Deviations from Plan
None. Tests drive `SteamGame.launch()` through the existing engine-selection harness, so no private-method access was needed. The rejected-selection test spies on the real engineRegistry `setEngineSelection`.

## Verification
launchDeadline tests 13 pass, games.test.ts 541 pass, `pnpm codecheck` clean, eslint 0 errors on touched files, prettier applied.

## Known Stubs
None.

## Self-Check: PASSED

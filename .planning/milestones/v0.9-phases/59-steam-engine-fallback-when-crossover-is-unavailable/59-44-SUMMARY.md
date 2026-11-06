---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 44
subsystem: backend-connectivity
tags: [connectivity, dns, offline-refusal, gap-closure]
requires: []
provides:
  - getConnectivityStatus() three-state accessor
  - checkConnectivityNow short-circuits only on monitor 'offline'
  - two-host DNS race, isolated fresh-offline hook
  - offlineLaunchCertainlyBlocked covers CrossOver override
affects: [steam launch engine selection]
tech-stack:
  added: []
  patterns: [three-state status instead of boolean isOnline for action-time checks]
key-files:
  created: []
  modified:
    - src/backend/online_monitor.ts
    - src/backend/connectivityNow.ts
    - src/backend/storeManagers/steam/engine/offlineRefusal.ts
    - src/backend/__tests__/onlineMonitor.test.ts
    - src/backend/__tests__/connectivityNow.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/offlineRefusal.test.ts
key-decisions:
  - "Lookup hosts github.com + gog.com (cloudflare-dns.com avoided: DoH-blocking resolvers block it)"
  - "WR-02 applied: restore-needs-pin refuses under override crossover even with the current pin installed"
requirements-completed: [CR-01, G25]
duration: 15min
completed: 2026-11-03
---

# Phase 59 Plan 44: CR-01 connectivity short-circuit Summary

Unknown monitor state ('check-online') now falls through to the OS check instead of reading as offline, so an online Play is no longer refused; plus WR-01/02/03 and IN-01/02/03 in the same files.

## Task commits
1. Task 1 (CR-01, WR-01, WR-03): 9047f0d46
2. Task 2 (WR-02, IN-03): e0a950661

## WR-02
Confirmed in engineSwitch.ts `prepareBottleForEngine`: for next.kind 'crossover' with a restore needed, `resolveRestoreSource` runs before anything else in both the healthy and the unhealthy (G10) branch, and returns null / downloads the marker's pin when it is absent and no surviving DXVK copy exists. `restoreNeedsAbsentPin` is true exactly in that case, so the launch cannot start offline in either branch. The installed current pin is irrelevant under override 'crossover' (the marker's own pin is needed). The blanket `currentPinInstalled` early return was therefore removed; 'automatic' + installed pin still never refuses.

## Deviations from Plan
None. Test typing fix (ConnectivityStatus-typed mocks) was needed for codecheck.

## Verification
connectivityNow, onlineMonitor, offlineRefusal suites (59 tests) pass; games.test.ts G25 tests pass; prettier, eslint, codecheck, smoke:sidecar green.

## Self-Check: PASSED

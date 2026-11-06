---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 04
subsystem: steam-bridge-overlay
tags: [overlay, diagnostics, watcher, wine-log]
requires: []
provides:
  - watchOverlayAttach / findOverlayAttach / macSteamConsoleLogPath (D-11)
  - openOverlayWineLog / createShimLineForwarder (D-15 evidence)
affects: [60-09]
tech-stack:
  added: []
  patterns: [unref'd tracked timers + abort controller, O_EXCL 0600 bounded log sink]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/overlay/overlayAttachWatch.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayWineLog.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayAttachWatch.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayWineLog.test.ts
  modified:
    - src/backend/storeManagers/steam/bottleLaunchSignals.ts
decisions:
  - "Exports awaiting plan 09 carry ts-prune-ignore-next"
metrics:
  tasks: 2
  completed: 2026-11-02
requirements-completed: [D-11, D-15]
---

# Phase 60 Plan 04: Overlay attach watcher and wine-log sink Summary

A bounded 10 s console_log watcher (D-11, diagnostic only) and a symlink-safe overlay wine-log sink with a capped shim-line forwarder (D-15), both standalone for plan 09 to wire in.

## Tasks

1. overlayAttachWatch.ts, with parseTimestampedLine and ParsedLine exported from bottleLaunchSignals.ts: f6b984162, lint fix 960cb861b.
2. overlayWineLog.ts: fc649ebd7.

11 attach-watch tests and 8 wine-log tests pass, along with the existing bottleLaunchSignals suite. eslint and prettier are clean.

## Deviations from Plan

**[Rule 1 - Lint]** The first task commit had two lint errors (`prefer-const`, `no-control-regex` in a test). Fixed in a follow-up commit 960cb861b.

The full `pnpm codecheck && pnpm lint` run was not done. I ran targeted tsc, eslint and prettier on the touched files.

## Known Stubs

None.

## Self-Check: PASSED

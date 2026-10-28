---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 29
subsystem: steam-bridge-drm
tags: [drm, steamstub, symlink, gap-closure]
requires: []
provides: [symlink-safe detectLaunchDrmWrapper]
affects: [drmLaunchSetup, stageDrmBottle]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmScanExe.test.ts
decisions:
  - "Containment on realpath of both bottle root and candidate; drmExe stays lexical resolve(candidate)"
metrics:
  tasks: 1
  files: 2
  completed: 2026-10-29
---

# Phase 56 Plan 29: Symlink-safe Shipping-exe containment Summary

detectLaunchDrmWrapper now realpaths both the bottle root and each Shipping candidate for containment, returns the lexical `resolve(candidate)` as drmExe, and logs every rejected candidate by basename.

## What changed
- Root realpathed once (fallback `resolve(bottleDir)`); candidates iterated from a sorted copy (deterministic).
- Rejections log `skipped <basename> (realpath failed | escapes bottle | scan threw)` with LogPrefix.Steam; detect() runs in a per-candidate try/catch (WR-06).
- Tests added: A (symlinked bottle root, lexical drmExe), B (symlinked game dir inside bottle), D (throwing detector, second candidate wins); existing escape test (C) extended to assert the `escapes bottle` warning. All 9 tests pass; the stageDrmBottle and drmLaunchSetup suites pass (104 total); tsc and prettier clean.

## Deviations from Plan
None. Test A/B/D inject `findUnreal` to control candidate paths.

## Self-Check: PASSED

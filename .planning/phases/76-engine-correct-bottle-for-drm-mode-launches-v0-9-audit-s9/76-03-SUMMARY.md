---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
plan: 03
subsystem: engine
tags: [engine-switch, crossover, wine-staging, marker, drm-mode]
requires: []
provides:
  - hardened inferMarker (DXVK-macOS beats Timestamp)
  - contradicted-crossover-marker distrust in prepareBottleForEngine
  - reconcileBottleEngineMarker, recordPinnedBottleEngine, recordCrossoverBottleEngine exports (wired by 76-04)
affects: [76-04]
key-files:
  modified:
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/__tests__/engineSwitch.test.ts
key-decisions:
  - "DXVK-macOS in a bottle is positive evidence of a non-CrossOver engine and outranks a conf Timestamp"
  - "Timestamp-less, DXVK-less marker-less bottle infers pinned (CrossOver create() always writes Timestamp)"
requirements-completed: [DEBT-01]
duration: 25min
completed: 2026-11-17
---

# Phase 76 Plan 03: Engine-layer CR-01 fix Summary

A Staging-initialised bottle can no longer be inferred or trusted as CrossOver: DXVK-macOS now beats a CrossOver-probe Timestamp, contradicted crossover markers are distrusted, and reconcile/record exports exist for 76-04.

## Commits
- aa4f95deb test(76-03): failing CR-01 regression on the real engine switch (RED)
- 51861c8dc fix(76-03): never mislabel a Staging bottle as CrossOver; reconcile and record engine markers (GREEN)

## Base and counts
- Base SHA: cca9701f48a2b7173cb9f8de4f828537d1853993
- `jest.mock(` count in engineSwitch.test.ts: 2 before, 2 after.

## CrossOver create Timestamp
`grep -n '"Timestamp"' CXBT_win10_64.pm` hits L196 (inside `sub create`, which starts L186) and L308 (upgrade_cxbottle). An existing CrossOver-created bottle's cxbottle.conf has 2 Timestamp matches. The pinned inference for the Timestamp-less, DXVK-less case is therefore sound.

## Deviations from Plan

**1. [Rule 1 - Bug] Marker read-only guard before migration**
- `isEngineMarkerReadOnly` returns false until `ensureEngineMarkerMigrated` has run, so record/reconcile overwrote a newer-build marker in tests. Both now call `ensureEngineMarkerMigrated` first.
- Tests assert log text via mock call strings because the mocked `LogPrefix` has no `Backend` (second arg undefined).

## Verification
engineSwitch tests (76), offlineRefusal, backendDiCeilings, boundaryGates: 250 pass. `pnpm codecheck` green, eslint 0 errors, prettier clean, `graphify update .` run.

## Known Stubs
None.

## Self-Check: PASSED

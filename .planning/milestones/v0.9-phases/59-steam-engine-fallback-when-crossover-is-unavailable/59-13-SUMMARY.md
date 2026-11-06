---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 13
subsystem: uat
tags: [steam, engine-fallback, uat, crossover, sandbox-exec]
requires: [59-10, 59-11, 59-12]
provides:
  - 59-UAT.md live results (10 pass, 1 issue, 1 skipped)
  - wave0/no-crossover.sb sandbox profile hiding CrossOver.app
affects: [phase 59 gap closure]
key-files:
  created:
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-UAT.md
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb
  modified:
    - .planning/IPC-PORT-INVENTORY.md
    - src/backend/storeManagers/steam/engine/ (dead-export cleanup)
decisions:
  - "G9 (operator, 2026-11-02): an explicit CrossOver override is supported; only non-CrossOver overrides are unsupported (fix open)"
  - "Proceeded to live UAT despite non-phase-59 gate failures (operator accepted)"
requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-10, D-11, D-13, D-14, D-15]
open-gaps: [G1, G2, G6, G9, G10, G12]
duration: live session
completed: 2026-11-02
---

# Phase 59 Plan 13: Live UAT Summary

Twelve live UAT items were run on real hardware with CrossOver hidden by a read-deny sandbox profile: 10 pass, 1 issue (item 2), 1 skipped (item 11, no second Wine-Staging build installed). The live run found and fixed six defects in-session. Six gaps stay open for `/gsd-plan-phase 59 --gaps`.

## Tasks

1. Gate battery, sandbox profile and UAT script: 4fa34eb25 (gate fixes), af9bcf4c4 (UAT + profile)
2. Operator ran the UAT items (checkpoint, resolved)
3. Results recorded in 59-UAT.md (status: complete)

## Gate battery (before live session)

- `pnpm codecheck` 0, `pnpm smoke:sidecar` 0, `pnpm planning-gates` 1 then 12/12 after fix.
- `pnpm test:ci` 1 and `pnpm lint` 1: failures not from this phase (known pre-existing at c9b31401d, or from the other session's native/gen_vtables/gamepad work). The operator accepted proceeding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Phase-59 gate failures** - preload-surface-gate (3 engine channels missing from IPC-PORT-INVENTORY) and findDeadcode (unused/in-module exports). Fixed in 4fa34eb25.

Fixes made by the orchestrator during UAT (committed):

- **9e2509cf2 (G3/G4/G5):** deadline stands down when the process monitor gives up (onUnavailable); pgrep fallback when `ps` cannot spawn under sandbox; deadline log uses the engine selected at arm time.
- **5a6f4f877 (G7):** DXVK restore on a move back to CrossOver used the global winePrefix; now pinned to the bottle, and a surviving `current_dxvk-macOS` counts as failure.
- **1a5b750bb (G8):** monitor also matches the install root's host path (Wine-Staging shows host paths, not `C:\`).
- **c6b2779ca + 5cc3007a3 (G11):** override read back via `readStoredEngineOverride` (sync read of `GamesConfig/<appId>.json`) because `GameConfig.get().config` is filled asynchronously; the game page refetches engine state on settings modal open/close. 5cc3007a3 also fixed `steamEngineFlows.test` (mock bridge/inviteBridge, broken by 58-31 / 0a627de67).
- Docs commits: d781789e3, a54bbaeb6, e2519c3ab, 6fb5112b6, c836b49b2, a865f8bd5.

## Open Gaps (not fixed; see 59-UAT.md Gaps)

- **G1:** engine-download label stuck at 0%, never shows extract/setup stages.
- **G2:** Steam auth check runs after the engine download and bottle creation.
- **G6:** engine reason only in a tooltip or OS notification; dev builds never deliver notifications.
- **G9:** operator decision: an explicit CrossOver override is supported, no Unsupported warning or badge.
- **G10:** expired bottle: the DXVK restore runs via CrossOver, so CodeWeavers' expired dialog appears once per step.
- **G12:** badge waits on the ~5 s preflight; the dropdown shows Automatic until options load, so choosing Automatic does nothing.

## Safety

Nothing touched /Applications/CrossOver.app or the licence file. Trial backdating was limited to the operator-approved throwaway bottle GameLibSteamBridge-38400.

## Known Stubs

None.

## Self-Check: PASSED

59-UAT.md, no-crossover.sb committed (af9bcf4c4); fix commit 4fa34eb25 present.

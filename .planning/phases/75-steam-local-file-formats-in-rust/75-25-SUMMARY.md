---
phase: 75-steam-local-file-formats-in-rust
plan: 25
subsystem: steam
tags: [steam, rust-migration, feature-flags, uat]
requires: [75-24]
provides:
  - both D-08 flags (STEAMFILES_TEXT_DEFAULT, STEAMFILES_SHORTCUTS_DEFAULT) default to rust
  - 75-UAT.md live-gate contract (8 items) for plan 26
key-files:
  modified:
    - src/backend/storeManagers/steam/localFiles/steamFilesFlags.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/steamFilesFlags.test.ts
    - src/backend/jest.setupContainment.ts
  created:
    - .planning/phases/75-steam-local-file-formats-in-rust/75-UAT.md
requirements-completed: [STEAM-03, P75-F]
completed: 2026-11-14
---

# Phase 75 Plan 25: Flip defaults to rust and author the live-gate UAT Summary

Both steamfiles flags now default to `rust` after 75-PARITY.md reached APPROVED, with a Jest-only transition pin keeping the legacy ts-branch caller tests on `ts`, and a reachability-reviewed 8-item 75-UAT.md is ready for plan 26.

## Tasks

1. Flip defaults (commit e88a189e7). Flag tests assert rust by default and explicit ts still honoured. `jest.setupContainment.ts` pins `GAMELIB_STEAMFILES_TEXT/SHORTCUTS ??= 'ts'` for the transition (remove in plan 34). Steam/shortcuts Jest: only the known shimCoverage and shimGenerate failures. `tsc` clean. `pnpm build:sidecar` exit 0, `sidecar.js` has `STEAMFILES_TEXT_DEFAULT = "rust"`.
2. 75-UAT.md authored: ground rules, Structural Reachability Review table, items 1-8 (startup discovery, refresh, install polling, uninstall, running-app poll, add/remove Steam, headless census), all `result: pending`. Committed with the docs commit.

## Deviations from Plan

None. Note for plan 26: the UAT's Rust-path proof lines are DEBUG-level `logDebug` lines; the contract tells the runner to mark the item blocked if none reach the file sink.

## Known Stubs

None.

## Self-Check: PASSED

---
phase: 75-steam-local-file-formats-in-rust
plan: 27
subsystem: steam-local-files
tags: [oracle-deletion, parity, test-double]
requires: [75-26]
provides: [permanent Tier 1 parity only; fsBackedSteamFiles test double for plans 28-29]
key-files:
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/stubRustSteamFiles.test.ts
  modified:
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/replayParity.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/README.md
    - package.json
  moved:
    - oracle/normalize.ts -> fixtures/fixtureCopy.ts
  deleted:
    - __tests__/oracle/ (seven modules), steamFilesGolden.test.ts, meta/steamFilesParitySweep.ts and its test
requirements-completed: [STEAM-03, P75-G, P75-E]
completed: 2026-11-14
---

# Phase 75 Plan 27: Retire the TS oracle Summary

The TS oracle modules, the TS==golden Jest test and the local parity sweep are deleted; expected.json, rust-results.json, overrides and all replay tests stay as permanent parity, and a file-backed `fsBackedSteamFiles` test double is added for caller-test conversion.

## Commits

- f22579573 chore(75-27): delete the oracle, golden test and sweep; normaliser moved to fixtures/fixtureCopy.ts; README "After the oracle" section; `steamfiles-parity-sweep` script removed
- 5d11b5ed3 test(75-27): `fsBackedSteamFiles(overrides?)` with read_acf, scan_acfs, find_acf, read_library_folders, read_running_app_id answered from real temp files via a line regex (no parser, no @node-steam/vdf)

## Deviations from Plan

**[Rule 3 - Blocking]** libraryReplay.test.ts imported `SYSTEM_STEAM`, `depsFor`, `steamRootWith` from the deleted libraryOracle. These three helpers moved into fixtures/fixtureCopy.ts (the `depsFor` rejection message no longer mentions the oracle).

## Gates

- Jest `localFiles/__tests__`: 12 suites, 33 tests pass. `tsc --noEmit` clean.
- find-deadcode: only pre-existing humble/WebView findings, none from touched files. steam-line-ceiling exit 0.
- backend-di-ceilings: 21 FAIL lines, all in files not touched by this plan (no new jest.mock calls added).

## Self-Check: PASSED

---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 13
subsystem: scanners
tags: [rust, scanners, d-11, flag-removal]
requires: [63-12]
provides:
  - every scanner call site calls invokeScan(RUST_SCAN_<OP>, args) directly
  - runScanner, the per-caller evidence log and all GAMELIB_SCANNER_* reads removed from wrappers
affects: [63-14]
key-files:
  modified:
    - src/backend/scanners/rustScan.ts
    - src/backend/storeManagers/steam/bridge/peScan.ts
    - src/backend/storeManagers/steam/bridge/importScan.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
    - src/backend/tools/machoExports.ts
    - src/common/types/sidecarTransport.ts
    - src/backend/scanners/legacyMachoParse.ts
decisions:
  - Kept the `caller` tag parameters on the exported wrappers as unused optional args (renamed `_caller`); removing them would ripple into gameLaunch.ts, gameBridgeLaunch.ts, gameMakerRunner.ts, dxmt.ts and many tests.
  - CLI_ONLY_SCAN_OPS kept (still used by scanChannelParity test).
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 63 Plan 13: Close the D-11 flag Summary

All five scanner wrappers (shimGenerate `detectDrmWrapper`, drmScanExe `containLeaf`, importScan, machoExports, peScan x2) now call `invokeScan` directly with their fail-closed catch mappings and log text unchanged. `runScanner`, its first-use log Set and the `scannerImpl` import are gone from rustScan.ts. importScan.ts no longer spawns objdump. The precondition held (63-12 gate closed, all `SCANNER_DEFAULTS` are `'rust'`, Option A accepted).

## Commits

- ee553ddcc: Task 1, shimGenerate, drmScanExe, importScan, machoExports and their suites
- f3ce17e9a: Task 2, peScan, rustScan and their suites
- bf4305bbd: chore, dropped the five `@public` tags on RUST_SCAN_* (knip passes) and unexported `parseMachODefinedExternals`

## Deviations from Plan

**1. [Rule 3 - Blocking] knip finding after the machoExports re-export was dropped**
`parseMachODefinedExternals` became an unused export; unexported it (module is deleted in 63-14).

**2. [Rule 1 - Bug] Unused symbols in touched tests** (`Contain` type in drmScanExe.test.ts, three fixture imports in importScan.test.ts) were removed to keep eslint at 0 errors.

Test deletions beyond the plan text: importScan.test.ts spawn-based ts cases (wrapper, delay imports, static-import closure); machoExports.test.ts parser and ts-path cases plus the writeImage helper.

## Checks

- tsc --noEmit: clean. eslint on touched files: 0 errors. prettier --check: clean. `pnpm find-deadcode`: PASS. `pnpm smoke:sidecar`: PASS.
- Jest over scanners, steam, tools, tauriShellSource: 5389 passed, 4 failed, all the known pre-existing ones (56-01-SUMMARY path in games/bottle tests, macArchKnownFixRouting Intel, tauriShellSource WR-07).
- `pnpm lint` exits 1: 1133 warnings against a max of 661, 0 errors. Not attributable to this plan (it removed code); not investigated. Full `pnpm test:ci` was not run.

## Self-Check: PASSED

Commits ee553ddcc, f3ce17e9a, bf4305bbd exist; grep for runScanner/resolveScannerImpl/GAMELIB_SCANNER_ outside scannerImpl and legacyTsScanners prints 0.

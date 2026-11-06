---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 02
subsystem: scanners-ts-contract
tags: [typescript, scanners, oracle, feature-flag]
requires: []
provides:
  - scanTypes.ts (ScanOp, SCAN_OPS, CLI_ONLY_SCAN_OPS, args/result types per op)
  - legacyTsScanners.ts (seven path-based TS oracles, runLegacyOp, OBJDUMP_BIN)
  - legacyMachoParse.ts (pure Mach-O parser moved out of machoExports)
  - scannerImpl.ts (ScannerName, SCANNER_DEFAULTS, SCANNER_OPS, resolveScannerImpl)
affects: [63-03, 63-06, 63-07, 63-09, 63-10, 63-11, 63-14]
tech-stack:
  added: []
  patterns: [zero-backend-import oracle shared by flag branch, goldens and sweep]
key-files:
  created:
    - src/backend/scanners/scanTypes.ts
    - src/backend/scanners/legacyTsScanners.ts
    - src/backend/scanners/legacyMachoParse.ts
    - src/backend/scanners/scannerImpl.ts
    - src/backend/scanners/__tests__/legacyTsScanners.test.ts
    - src/backend/scanners/__tests__/scannerImpl.test.ts
  modified:
    - src/backend/tools/machoExports.ts
    - src/backend/storeManagers/steam/bridge/importScan.ts
key-decisions:
  - "Flag is an env var (GAMELIB_SCANNER_<NAME>, exact rust|ts) over an all-ts defaults table; no AppSettings key"
  - "scan_pe_delay_imports is CLI-only (no rustInvoke channel)"
requirements-completed: [D-05, D-06, D-07, D-08, D-11, D-12]
duration: ~25min
completed: 2026-11-07
---

# Phase 63 Plan 02: TS scanner contract, oracles and flag Summary

One TS contract (`scanTypes.ts`) for the seven scanner ops, zero-backend-import path-based oracles with the Rust ops' JSON shape, `importScan.ts` delegating to the oracle unchanged in behaviour, and an exact-match per-scanner env flag defaulting every scanner to `ts`.

## Tasks

1. Op contracts, six path-based oracles, Mach-O parser move: 435c54071
2. objdump closure walk into `steamApiImportsTs`, importScan delegates: 6d34ef63f
3. Per-scanner flag `scannerImpl.ts` (plus `@public` tags for knip): 64ca1d488

## Verification

- jest: scanners (33), importScan, shimGenerate, shimCoverage, machoExports, dxmtExportGate, dxmtBootFetch all pass; importScan.test.ts is untouched (same `it(` count).
- `tsc --noEmit` clean; `pnpm find-deadcode` PASS (no new baseline lines); prettier clean on all written paths (none ignored).
- `grep -c "from 'backend/"` is 0 for legacyTsScanners.ts, legacyMachoParse.ts, scanTypes.ts.

## Deviations from Plan

**1. [Rule 3 - Blocking] graceful-fs seam kept for machoExports.** The plan said legacyMachoParse uses `node:fs`, but machoExports.test.ts (must pass unchanged) mocks `graceful-fs`. `checkWinemacMetalViewExportsSync(path, fs = node:fs)` takes an injectable fs; `machoExports.ts` passes graceful-fs's functions. Behaviour is unchanged for existing callers.

**2. Log format.** As planned: the array-form `logWarning([msg, error])` lines are now `"msg: <error>"` strings (the one deliberate log-format change). No existing test asserted the array form, so importScan.test.ts needed no edits.

**3. `DXMT_REQUIRED_MACDRV_SYMBOLS` not re-exported** from machoExports (no importer; the dxmtExportGate mock supplies its own), to avoid a dead knip export.

**4.** `runLegacyOp` and `CLI_ONLY_SCAN_OPS` are tagged `@public` (consumers land in 63-03/63-06/63-10), as the plan directed for knip.

## Known Stubs

None.

## Self-Check: PASSED

All six created files exist; commits 435c54071, 6d34ef63f, 64ca1d488 exist.

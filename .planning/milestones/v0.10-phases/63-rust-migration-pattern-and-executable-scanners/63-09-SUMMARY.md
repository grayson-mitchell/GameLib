---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 09
subsystem: steam-bridge-dxmt
tags: [rust-migration, scanners, import-scan, dxmt]
requires: [63-06, 63-07]
provides:
  - flag-switched async scanSteamApiImports over scan_steam_api_imports
  - async path-based checkWinemacMetalViewExports; dxmt.ts call sites await
affects: [63-13, 63-14]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/importScan.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/tools/machoExports.ts
    - src/backend/tools/dxmt.ts
    - src/backend/scanners/scanTypes.ts
    - src/backend/scanners/legacyMachoParse.ts
decisions:
  - "machoExports does not re-export parseMachODefinedExternals / DXMT_REQUIRED_MACDRV_SYMBOLS: knip ratchet flagged them as dead; tests import from legacyMachoParse / scanTypes"
metrics:
  tasks: 2
  completed: 2026-11-07
requirements: [D-05, D-06, D-08, D-09, D-11]
---

# Phase 63 Plan 09: Import scan and Metal export check behind the scanner boundary

`scanSteamApiImports(appId, exePath, caller)` keeps the numeric-appId pre-check first, then runs `runScanner('importScan', ...)` with the objdump path as the ts fallback; Rust diagnostics are forwarded to the Steam log and stripped, and a rejection resolves `{status:'error', error:'Rust scan failed: ...'}`. `checkWinemacMetalViewExports(path, caller)` is async over `scan_winemac_metal_exports`; a rejection resolves `ok:false` with all four symbols missing (fail closed). Both dxmt.ts sites await it and the boot census is a sequential `for...of`, with the exit-contract comment extended.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 importScan wrapper | 1c567f9a4 | rust-path tests (one round-trip, no spawn, diagnostics, bad appId, rejection); shimGenerate passes `bridgeScan` / `placeShimForGame` |
| 2 async Metal export check | 428f0b4ea | `DXMT_REQUIRED_MACDRV_SYMBOLS` and `winemacPathFor` moved to scanTypes; machoExports wrapper; dxmt awaits; tests converted |

## Deviations from Plan

- [Rule 3] shimGenerate.test.ts asserted the old two-argument `scanSteamApiImports` call; updated to expect the `'bridgeScan'` tag.
- [Rule 3] Dropped the `parseMachODefinedExternals` and `DXMT_REQUIRED_MACDRV_SYMBOLS` re-exports from machoExports.ts (new knip findings); the plan said to keep them.
- dxmtExportGate's per-path mock now returns `Promise.resolve(...)` to satisfy `require-await`.

## Verification

- jest over steam/bridge, tools and scanners: 62 suites pass, 2050 tests; tsc clean; `pnpm smoke:sidecar` PASS; `pnpm find-deadcode` PASS; prettier clean on touched files; eslint no errors (remaining warnings are pre-existing in dxmt.ts).
- Not run: full `pnpm lint`.

## Known Stubs

None.

## Self-Check: PASSED

Commits 1c567f9a4 and 428f0b4ea exist; all modified files committed.

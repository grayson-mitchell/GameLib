---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 14
subsystem: scanners
tags: [rust, scanners, d-13, deletion, migration-pattern]
requires: [63-13]
provides:
  - the TS scanners, oracle, generator and sweep are deleted; Rust is the only implementation
  - scannerPortComplete.test.ts D-13 deletion gate
  - src-tauri/crates/README.md migration pattern write-up
affects: []
key-files:
  created:
    - src/backend/__tests__/scannerPortComplete.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/stubRustScan.ts
    - src-tauri/crates/README.md
  modified:
    - meta/bridgeCensus.ts
    - meta/gamelibScanCli.ts
    - src/backend/scanners/scanTypes.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/gameMakerRunner.test.ts
    - package.json
    - knip.jsonc
    - src-tauri/crates/gamelib-scan/tests/golden.rs
  deleted:
    - src/backend/scanners/{scannerImpl,legacyTsScanners,legacyMachoParse,scanNormalize}.ts
    - src/backend/scanners/__tests__/{scannerImpl,legacyTsScanners,goldenParity}.test.ts
    - src/backend/storeManagers/steam/bridge/{peSections,peSteamDrm}.ts and their tests
    - meta/{genScanFixtures,scannerParitySweep}.ts, meta/__tests__/scannerParitySweep.test.ts
    - fixtures drmPe.ts, importSymbolsPe.ts, delayImportPe.ts, tools machoFixtures.ts
decisions:
  - Caller tests that used the TS oracle as the rustInvoke backend (shimGenerate, gameMakerRunner) now use a small test double (stubRustScan) rather than a parser; real parsing is covered by the Rust tests and goldens.
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 63 Plan 14: Delete the TS scanners and write up the pattern Summary

D-13 is finished: only the Rust scanners remain, a static gate keeps it that way, and the migration pattern for the depot port is written next to the crates.

Precondition held: every 63-UAT item is pass except item 6 (accepted blocked), all defaults were `'rust'`, Option A accepted.

## Commits

- 5f009a126: Task 1, deletions, deletion gate, stub double, knip/package.json cleanup
- 21f33ef31: Task 2, src-tauri/crates/README.md

## Deviations from Plan

**1. [Rule 3 - Blocking] Two caller suites depended on the deleted oracle.** `shimGenerate.test.ts` and `gameMakerRunner.test.ts` used `runLegacyOp` as the `requestRustInvoke` backend. Added `fixtures/stubRustScan.ts` (real realpath containment; substring-based `.bind` and CEG detection on the fixture PEs) and per-test canned results in gameMakerRunner. All 1475 steam bridge tests pass.

**2. [Rule 3 - Blocking] knip findings after the deletions.** Unexported eight types in `scanTypes.ts` and removed the sweep-only `runScanCliBatch` (and its `spawn` import) from `meta/gamelibScanCli.ts`; un-exported the four census helpers. `meta/knip-baseline.txt` untouched (no lines added).

**3. Additional dead fixtures deleted** after verifying no importers: `drmPe.ts`, `importSymbolsPe.ts`, `delayImportPe.ts`, `machoFixtures.ts`. Kept `importPe`, `managedPe`, `objdumpImports`.

## Checks

- `pnpm find-deadcode` PASS; `tsc --noEmit` and `tsc -p tsconfig.meta.json` clean; eslint on touched files clean; prettier --check clean; `pnpm smoke:sidecar` PASS; `cargo test -p gamelib-scan -p gamelib-scan-cli` all pass (golden included).
- Jest over scanners, steam, tools, meta/__tests__, src/backend/__tests__: 8669 passed, 6 failed, all known pre-existing (56-01-SUMMARY path in bottle/games tests, genI18nGateScope A-17, macArchKnownFixRouting Intel, x86CallbackWineHarness, tauriShellSource).
- `pnpm lint` exits 1: 1121 warnings against a max of 661, 0 errors (was 1133 after 63-13; pre-existing, not attributable to this plan).
- Not run: full `pnpm test:ci`, `cargo test --bin gamelib-shell`, clippy ratchet.

## Self-Check: PASSED

Both commits exist; scannerPortComplete.test.ts, stubRustScan.ts and src-tauri/crates/README.md exist; all deleted paths are absent.

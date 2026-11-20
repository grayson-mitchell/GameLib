---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 11
subsystem: scanners
tags: [rust, scanners, parity-sweep, flag-flip, uat]
requires: [63-10]
provides:
  - 63-PARITY.md (tier-2 sweep record, D-07 investigation)
  - SCANNER_DEFAULTS all five scanners rust
  - 63-UAT.md (D-13 live-smoke contract, consumed by 63-12)
affects: [63-12]
key-files:
  created:
    - .planning/phases/63-rust-migration-pattern-and-executable-scanners/63-PARITY.md
    - .planning/phases/63-rust-migration-pattern-and-executable-scanners/63-UAT.md
  modified:
    - src/backend/scanners/scannerImpl.ts
    - src/backend/scanners/__tests__/scannerImpl.test.ts
    - src-tauri/crates/gamelib-scan/src/pe/imports.rs
decisions:
  - importScan divergence (4 Fallout 1/2 Watcom PEs, all-zero VirtualSize; objdump errors, Rust follows the loader rule) accepted by user 2026-11-07; shim decision identical.
  - Option A: drmScanExe.ts stays a ~40-line TS orchestrator and findUnrealLayout stays TS; "TS scanners deleted" means byte-parsing and containment code.
  - Flag storage is env var GAMELIB_SCANNER_<NAME> over a defaults table, no AppSettings key.
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 63 Plan 11: Parity sweep, default flip and live-smoke contract Summary

Tier-2 sweep run and recorded, the D-07 zero-VirtualSize divergence investigated and pinned by a Rust unit test, all five scanners now default to Rust, and the D-13 live-smoke contract authored for 63-12.

## Checkpoint resolution

Task 3 (checkpoint:human-verify) user reply, verbatim: "approved"

Covered: importScan divergence accepted (option a), 63-UAT.md approved as authored (item 6 CONDITIONAL, item 3 needs CrossOver engine for Mining Mechs, prefetchBridgeDrmDownloads withdrawn, 6-7 launch plan), Option A for drmScanExe, env-var flag storage.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Sweep, D-07, 63-PARITY.md | 8fc495b02 | imports.rs test `zero_virtual_size_section_spans_raw_size` |
| 2a Flip clean scanners | fee47f8bf | peSections, peSteamDrm, drmScanExe, machoExports to rust; importScan held |
| 2b 63-UAT.md | 3d2b12d19 | D-13 contract |
| 3 Apply approval | 5335888f0 | importScan to rust, test table, PARITY accepted, UAT evidence `impl=rust` |
| (orchestrator) | 12a24794f | tauriShellSource.test.ts allowlist admits six scan_* arms (phase-63 regression from 63-06) |

## Deviations from Plan

None beyond the orchestrator allowlist fix above. In scannerImpl.test.ts the "ignores invalid values" case now expects `rust` because invalid env values fall back to the default.

## Verification

- `jest src/backend/scanners src/backend/storeManagers/steam/bridge`: all pass after the flip (scanners: 282/282).
- `tsc --noEmit` clean; eslint and prettier --check clean on touched TS; `pnpm run find-deadcode` PASS (404 baselined).
- No Rust touched in the final task; `cargo test -p gamelib-scan` not re-run.

## Pre-existing failures (verified at the pre-phase commit, not caused by phase 63)

- steam games/bottle tests reading the archived 56-01-SUMMARY path
- macArchKnownFixRouting Intel case
- genI18nGateScope A-17
- x86CallbackWineHarness slot-15 frame
- tauriShellSource WR-07 `.title(format!` check

## Known Stubs

None.

## Self-Check: PASSED

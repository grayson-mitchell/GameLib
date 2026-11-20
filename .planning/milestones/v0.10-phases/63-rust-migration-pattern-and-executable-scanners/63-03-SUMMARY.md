---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 03
subsystem: scanners-parity-harness
tags: [fixtures, goldens, parity, jest]
requires: [63-02]
provides:
  - fixtures/drmPe.ts, fixtures/importSymbolsPe.ts, fixtures/machoFixtures.ts (shared synthetic builders)
  - scanNormalize.ts (normalizeScanResult, the one definition of what parity ignores)
  - meta/genScanFixtures.ts + pnpm gen-scan-fixtures
  - 55 committed synthetic cases + expected.json under src-tauri/crates/gamelib-scan/tests/fixtures/
  - goldenParity.test.ts (TS oracle == goldens, no objdump/Rust)
affects: [63-05, 63-10, 63-11]
key-files:
  created:
    - meta/genScanFixtures.ts
    - src/backend/scanners/scanNormalize.ts
    - src/backend/scanners/__tests__/goldenParity.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/drmPe.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/importSymbolsPe.ts
    - src/backend/tools/__tests__/fixtures/machoFixtures.ts
    - src-tauri/crates/gamelib-scan/tests/fixtures/expected.json
  modified:
    - src/backend/storeManagers/steam/bridge/__tests__/peSteamDrm.test.ts
    - src/backend/tools/__tests__/machoExports.test.ts
    - package.json
    - knip.jsonc
    - .gitattributes
key-decisions:
  - "TS builders stay the source; generator commits their output as .bin files for the Rust tests"
  - "objdumpCaptures are trimmed to the first line plus the Import Tables section (expected.json under 64 KiB); the replay test proves the trim is lossless"
requirements-completed: [D-07, D-12]
completed: 2026-11-07
---

# Phase 63 Plan 03: Parity harness tier 1 Summary

55 synthetic fixture cases (41 PE, 4 multi-file import closures, 10 Mach-O) with TS-derived goldens in `expected.json`, a deterministic generator, one shared normaliser, and a Jest test proving the TS oracle equals the goldens using replayed Apple-objdump output.

## Tasks

1. Extract `buildPe` and Mach-O builders into fixture modules, add `buildImportSymbolsPe` and `scanNormalize.ts`: 5bb16a1c2
2. Generator, fixtures, expected.json, golden test, script/knip/gitattributes: 3ed984506

## Verification

- jest over scanners, steam bridge tests, tools tests and fakeHomeIsolation: 41 suites, 1549 tests pass.
- Re-running `pnpm gen-scan-fixtures` produces no diff (deterministic).
- `tsc --noEmit` clean; `pnpm find-deadcode` PASS; prettier clean (`.gitattributes` has no parser).
- objdump exit 0 on every well-formed import-symbol fixture; error goldens exist only for truncated/malformed files.
- All fixtures under 64 KiB (expected.json is 51 KB).

## Deviations from Plan

**1. [Rule 3 - Blocking] Captured objdump stdout trimmed.** Full header dumps made expected.json 133 KB, over the plan's 64 KiB per-file cap. Captures keep line 1 plus everything from `The Import Tables:`; parsers read nothing earlier, and goldenParity replays the trimmed text against results generated from the full text.

**2. Section-count cases** (`sections-96`, `sections-97`) use a small local builder in the generator because `buildPe` overlaps its section table with section data past a few sections.

## Known Stubs

None. No `rustOverride`/`divergenceNote` exists yet (only a human-reviewed 63-05/63-11 investigation adds one).

## Self-Check: PASSED

Created files exist; commits 5bb16a1c2 and 3ed984506 exist.

---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 05
subsystem: gamelib-scan-closure-macho-golden
tags: [rust, pe, macho, import-closure, golden-parity]
requires: [63-03, 63-04]
provides:
  - pe/imports.rs steam_api_import_table, all_import_dll_names (native import symbol enumeration)
  - closure.rs scan_steam_api_imports (closure + delay merge + conflict errors, one call)
  - macho.rs parse_defined_externals, check_winemac_metal_view_exports
  - tests/golden.rs (Rust == expected.json, tier-1 parity)
  - all seven ops registered (OPS and CLI --list)
affects: [63-06, 63-10, 63-11]
key-files:
  created:
    - src-tauri/crates/gamelib-scan/src/closure.rs
    - src-tauri/crates/gamelib-scan/src/macho.rs
    - src-tauri/crates/gamelib-scan/tests/golden.rs
  modified:
    - src-tauri/crates/gamelib-scan/src/lib.rs
    - src-tauri/crates/gamelib-scan/src/pe/imports.rs
    - src-tauri/crates/gamelib-scan-cli/tests/cli.rs
key-decisions:
  - "A5: ordinal-only static thunks are skipped (matches objdump TRAILING_IDENTIFIER); 63-11 sweep confirms on real games"
  - "Closure containment is lexical: a followed name must be exactly one Normal path component, on top of the TS no-slash/no-.. rule"
  - "Followed DLL is opened twice (table + name list) rather than threading one reader, to keep both helpers independent"
requirements-completed: [D-05, D-06, D-07, D-10, D-12]
completed: 2026-11-07
---

# Phase 63 Plan 05: Import closure, Mach-O reader and golden harness Summary

`scan_steam_api_imports` now runs the whole TS closure (static symbols, depth <= 2 / 32 DLL same-directory walk, delay merge, T-51-06 conflict errors) natively in one call, `scan_winemac_metal_exports` ports the Mach-O reader, and `tests/golden.rs` shows Rust equal to the TS goldens on all 55 cases with zero overrides.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Import symbol enumeration + closure op | 6584cf08c | 20 `closure*` tests, plus symbol-table and 4096-thunk-cap tests in imports.rs |
| 2 Mach-O reader + winemac op | bdfc862af | 9 `macho*` tests, Mach-O added to truncation sweep |
| 3 Golden harness | dc9dfbdeb | 55 cases, 0 mismatches, 0 overrides |

## Verification

- `cargo test -p gamelib-scan -p gamelib-scan-cli`: 90 unit + 1 golden + 5 CLI pass.
- `cargo test -p gamelib-scan closure`: 20 pass. `macho`: 9 pass.
- clippy `-D warnings` and `cargo fmt --check` clean.
- `pnpm exec jest src/backend/scanners`: 270 pass (TS values untouched).
- `npx prettier --check` on expected.json: clean (not modified).
- `gamelib-scan-cli --list` prints all seven ops, sorted.
- Golden is non-vacuous: mutating one golden symbol produced exactly one reported mismatch (reverted with `git checkout`).
- Backslash normalisation in golden.rs: `golden.rs:21: return Some(format!("{TOKEN}{rest}").replace('\\', "/"));` and `golden.rs:77: return json!(s.replace('\\', "/"));`. The root is matched in raw, forward and back-slash forms. The closure-* cases pass here; the Windows leg is not run locally.
- `grep objdump|process::Command` over the crate: 2 hits, both comments in `pe/imports.rs` (lines 73 and 95, describing the text parser being replaced / the A5 note). No spawning.

## D-07 divergences

None. No `rustOverride` entries; Rust equals the TS goldens everywhere, including the import-ordinal-mixed and import-steam-api-repeated cases (so A5 holds on the synthetic corpus; real-game confirmation stays with 63-11).

## Deviations from Plan

**1. [Rule 3 - Blocking] CLI list test updated.** `gamelib-scan-cli/tests/cli.rs` `list_prints_ops` hardcodes the op list; updated it in tasks 1 and 2 as ops were registered. Task 1's commit was amended once to include it (a first sed attempt failed on BSD sed, so the file was initially missing from the commit).

**2.** Three tasks, three separate commits (the 63-04 bundling was avoided).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-63-19..23 mitigations each have a named test (`closure_dotdot_and_separator_names_refused`, `closure_depth3_is_not_followed`, `closure_33rd_dll_is_not_examined`, `closure_invalid_app_id_rejected_before_open`, `closure_conflict_*`, `macho_out_of_range_tables_are_none` and the truncation sweep).

## Self-Check: PASSED

closure.rs, macho.rs, tests/golden.rs exist; commits 6584cf08c, bdfc862af, dc9dfbdeb exist.

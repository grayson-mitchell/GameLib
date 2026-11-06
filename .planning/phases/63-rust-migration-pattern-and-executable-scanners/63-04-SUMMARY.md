---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 04
subsystem: gamelib-scan-pe
tags: [rust, pe, steam-drm, security-caps]
requires: [63-01, 63-02]
provides:
  - pe/{mod,sections,drm,imports,delay}.rs in gamelib-scan
  - ops scan_steamstub_section, scan_steam_drm, scan_pe_imported_dlls, scan_pe_delay_imports (CLI-only)
  - PeInfo / Section / rva_to_offset / walk_import_descriptors for 63-05
affects: [63-05, 63-10, 63-11]
key-files:
  created:
    - src-tauri/crates/gamelib-scan/src/pe/mod.rs
    - src-tauri/crates/gamelib-scan/src/pe/sections.rs
    - src-tauri/crates/gamelib-scan/src/pe/drm.rs
    - src-tauri/crates/gamelib-scan/src/pe/imports.rs
    - src-tauri/crates/gamelib-scan/src/pe/delay.rs
  modified:
    - src-tauri/crates/gamelib-scan/src/lib.rs
    - src-tauri/crates/gamelib-scan-cli/src/main.rs
    - src-tauri/crates/gamelib-scan-cli/tests/cli.rs
key-decisions:
  - "Hand-rolled readers over RangeRead; no object/goblin/pelite; readPeMachineArch not ported"
  - "PeInfo::parse covers the shared prologue; sections are read lazily (read_sections) so each op keeps the TS read order, e.g. delay returns parsed:true without touching a cut section table"
  - "All offset arithmetic saturates; delay RVAs use i128 so VA-minus-ImageBase can go negative and fail like TS"
requirements-completed: [D-05, D-08, D-10]
completed: 2026-11-07
---

# Phase 63 Plan 04: Native PE scanners Summary

Four PE ops (steamstub section, Steam CEG/.bind, imported DLL names, steam_api delay imports) ported to Rust with every TS cap (96 sections, 4096 dir entries, 256 name units/bytes, 256 delay descriptors, 4096 thunks, 1024 import descriptors), and no objdump or process spawning in the crate.

## Tasks

1 and 2 landed in one commit, d8e6131b6, because `lib.rs` OPS, dispatch and the shared `pe/mod.rs` builder serve both and were not worth splitting artificially.

## Verification

- `cargo test -p gamelib-scan -p gamelib-scan-cli`: 56 + 5 pass.
- `cargo test -p gamelib-scan security`: 12 tests pass (96 sections, 4096 entries, 256 name units, 256 bytes, self-referencing directory, RVA outside every section, unpaired surrogate, 256 descriptors, 4096 thunks, 1024 import descriptors, truncation sweep).
- `security_truncation_never_panics` runs every prefix length of 7 PEs through all four parsers in the test thread.
- clippy `-D warnings` and `cargo fmt --check` clean; `gamelib-scan-cli --list` prints exactly the 5 expected ops; `grep objdump|process::Command` over the crate prints nothing.
- `unwrap()`/`expect(` in pe/mod.rs, sections.rs and drm.rs: 5 occurrences, all inside `#[cfg(test)]`.

## Deviations from Plan

**1. [Rule 1 - Bug] CLI `--list` duplicated `scan_pe_delay_imports`.** The CLI chained OPS and CLI_ONLY_OPS, and the plan puts the op in both. Fixed by sort+dedup in `gamelib-scan-cli/src/main.rs`; updated `tests/cli.rs` list expectation.

**2.** One commit for both tasks (see above). The delay.rs doc comment avoids the word objdump so the acceptance grep is clean.

## Known Stubs

None. Not yet checked against 63-03's `expected.json` fixtures; that parity runner is later-plan work.

## Self-Check: PASSED

All pe/*.rs files exist; commit d8e6131b6 exists.

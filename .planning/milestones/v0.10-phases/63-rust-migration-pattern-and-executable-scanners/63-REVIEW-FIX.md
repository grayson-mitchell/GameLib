---
phase: 63-rust-migration-pattern-and-executable-scanners
fixed_at: 2026-11-07T00:00:00Z
review_path: .planning/phases/63-rust-migration-pattern-and-executable-scanners/63-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 63: Code Review Fix Report

**Fixed at:** 2026-11-07
**Source review:** .planning/phases/63-rust-migration-pattern-and-executable-scanners/63-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03; Info findings out of scope)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Native steam_api import reader is all-or-nothing, and an unreadable exe now fails shim placement where objdump succeeded

**Files modified:** `src-tauri/crates/gamelib-scan/src/pe/mod.rs`, `src-tauri/crates/gamelib-scan/src/pe/imports.rs`
**Commit:** 0eb0c108a
**Status:** fixed: requires human verification (behaviour change on the shim-placement path)
**Applied fix:**
- `PeInfo` now reads SizeOfHeaders, at optional header +60 in both PE32 and PE32+.
- New `rva_to_offset_or_header`: it tries the sections first, then maps RVAs below SizeOfHeaders to file offset == RVA. It is used only by the import-table readers. `rva_to_offset` itself is unchanged, so the delay and DRM readers keep their TS parity.
- `walk_import_descriptors` takes a `NameFailure` mode:
  - `steam_api_import_table` and `all_import_dll_names` (both replaced objdump) use `Skip`. A descriptor whose name RVA is unmapped, or whose name is too long or unterminated, is skipped.
  - `imported_dll_names` (`readPeImportedDllNames` parity) stays strict (`Fail`).
- A steam_api descriptor whose thunk array or hint/name entries cannot be read still fails the whole table.
- Four new or extended unit tests: lenient skip, the strict path still failing, a steam_api thunk failure still failing, and a header-region name resolving.
- `cargo test -p gamelib-scan`: 95 pass after all three fixes. `cargo clippy --all-targets` is clean.
- Not verified: the real-game sweep was not re-run. Exes that the native reader used to reject now produce a symbol list.

### WR-02: bridgeCensus treats a missing or failed `gamelib-scan-cli` as "no delay evidence" and "not CEG"

**Files modified:** `meta/gamelibScanCli.ts`, `meta/bridgeCensus.ts`, `meta/__tests__/gamelibScanCli.test.ts`
**Commit:** a66b5eee7
**Applied fix:**
- Added the exported `assertScanCliPresent()`, which `runScanCliSync` now uses as well.
- `runCensus` calls it before doing anything else, so a missing binary aborts the run with the message that names the build command.
- `readDelayImports` and `scanExeSteamDrm` still return null when the result itself reports a read error.
- A transport or CLI failure (spawn error, non-zero exit, unparseable output) is now logged to stderr and counted in the footer's `Scan warnings`, not swallowed silently. I chose to log rather than rethrow so that one bad exe does not abort the whole census.
- Added a unit test for the missing-binary error.
- Results: Meta jest (`gamelibScanCli` and `bridgeCensus`) 150 pass, `scannerPortComplete` 12 pass, `tsc -p tsconfig.meta.json --noEmit` clean, prettier check clean on all three files (none are prettier-ignored).

### WR-03: `contained_real` returns a relative path for UNC paths on Windows

**Files modified:** `src-tauri/crates/gamelib-scan/src/contain.rs`
**Commit:** c0e6bd746
**Applied fix:**
- Added the pure helper `strip_verbatim_prefix`:
  - `\\?\UNC\server\share\x` becomes `\\server\share\x`
  - `\\?\C:\x` becomes `C:\x`
  - any other path is unchanged
- `display_path` uses the helper on Windows.
- A unit test of the helper runs on every platform.
- A `#[cfg(windows)]` test asserts that the UNC display path stays absolute. It was **not compiled or run locally**: only the `aarch64-apple-darwin` target is installed, so it is first exercised by the CI Windows leg.

---

_Fixed: 2026-11-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

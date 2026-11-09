---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 01
subsystem: infra
tags: [rust, cargo, steam-depot, ci, wire-contract]
requires: []
provides:
  - gamelib-depot and gamelib-depot-cli workspace crates (Tauri-free)
  - DepotJob / JobEvent / Outcome / ErrorKind wire contracts and ERROR_KINDS
  - JobHost trait, JobContext, cancel registry, dispatch with catch_unwind
  - CI legs and static-codec-linkage check for the depot CLI
affects: [73-02, 73-03, 73-04, 73-05, 73-06, 73-09, 73-11, 73-12]
tech-stack:
  added: [aes 0.9, cbc 0.2, sha1 0.11, prost 0.14, xz2 0.1 (static), zstd 0.14]
  patterns: [gamelib-scan crate pattern, deny_unknown_fields wire structs, redacting Debug]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/Cargo.toml
    - src-tauri/crates/gamelib-depot/src/lib.rs
    - src-tauri/crates/gamelib-depot/src/job.rs
    - src-tauri/crates/gamelib-depot/src/outcome.rs
    - src-tauri/crates/gamelib-depot/src/registry.rs
    - src-tauri/crates/gamelib-depot/src/model.rs
    - src-tauri/crates/gamelib-depot-cli/Cargo.toml
    - src-tauri/crates/gamelib-depot-cli/src/main.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/crates/README.md
    - src/backend/__tests__/cargoFeatures.test.ts
    - .github/workflows/rust-test.yml
key-decisions:
  - "rust-version 1.89 for both new crates (operator option-a), README exception line added"
  - "No --cfg aes_armv8 rustflags and no src-tauri/.cargo/config.toml (aes 0.9 enables ARMv8 by default)"
  - "ErrorKind adds not_signed_in beyond the plan's starting set, from classifyDepotError's signIn branch"
requirements-completed: [P73-E, D-05, D-09, D-15]
duration: 35min
completed: 2026-11-09
---

# Phase 73 Plan 01: Depot crates, contracts and CI Summary

Two Tauri-free crates (`gamelib-depot`, `gamelib-depot-cli`) with all phase dependencies resolved and pinned, CI legs with a static-codec-linkage check, and unit-tested wire contracts (job, event, outcome, 16 error kinds, `JobHost`, cancel registry).

## Operator-resolved checkpoints

- **Task 1 (crate legitimacy):** operator replied "approved" for all six crates: aes, cbc, sha1, prost, xz2, zstd. None rejected, no substitutes.
- **Task 2 (rust-version):** operator chose option-a: `rust-version = "1.89"` for both crates, plus a one-line exception in `src-tauri/crates/README.md`.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1, 2 | (operator) | Recorded above |
| 3 | cc951ac35 | Crates, workspace, lockfile pin, CI, README |
| 4 | 19a25bf88 | Wire contracts, JobHost, registry, module tree |

## Verification

- `cargo test -p gamelib-depot -p gamelib-depot-cli`: 13 tests pass (the six named plus validation, primary-failure, dispatch tests).
- `cargo +1.99.1 clippy -p gamelib-depot -p gamelib-depot-cli --all-targets -- -D warnings`: clean.
- `cargoFeatures.test.ts`: 12 pass; prettier check passes on the test, workflow and README.
- `otool -L` on the debug CLI shows no lzma/zstd/libz link. `gamelib-depot-cli --bogus` exits 64.
- Workspace clippy ratchet reports 1 new `needless_range_loop` in `src/main.rs:2066`, not in the new crates (zero compiler messages from `crates/gamelib-depot*`). Pre-existing, out of scope.

## Deviations from Plan

**1. [Process] Tasks 3 and 4 were committed as two commits that do not each build alone.** Task 3's CLI references `dispatch`/`JobHost` from Task 4's `lib.rs`, so the first commit (cc951ac35) does not compile in isolation; the pair does. Chosen over a throwaway stub lib.rs.

**2. [Rule 2 - Missing] Added `not_signed_in` error kind.** `classifyDepotError` has a distinct "no authenticated Steam CM connection" branch with the `signIn` action; the plan's starting list had no kind for it. Documented in the outcome.rs mapping table.

**3. Research correction recorded:** CONTEXT's `--cfg aes_armv8` flag (from spike 067b on aes 0.8.4) was not applied; aes 0.9 enables the ARMv8 backend by default. No rustflags anywhere.

**4. Windows linkage check** invokes `gamelib-scan-cli scan_pe_imported_dlls` with `{"exePath": ...}` (verified key on macOS against a Mach-O only; the Windows leg is unexercised until CI runs).

## Known Stubs

The module files `acf`, `container`, `download`, `events`, `fetch`, `host_health`, `inflight`, `manifest`, `post`, `reconcile`, `stall` hold only ownership headers by design; plans 02-09 fill them. `OPS` lists only `depot_job_cancel` until plans 09/10 add the others.

## Self-Check: PASSED

Commits cc951ac35 and 19a25bf88 exist; all listed files present.

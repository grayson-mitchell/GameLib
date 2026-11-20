---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 06
subsystem: infra
tags: [rust, steam-depot, prost, manifest, cache]
requires: [73-02, 73-03]
provides:
  - parse_manifest (raw CDN bytes + optional depot key -> model::DepotManifest)
  - ManifestStore (load: cache-or-fetch, prune: keep newest 2 GIDs)
  - prost ContentManifest message structs (no build.rs, no protoc)
affects: [73-07, 73-08, 73-09]
tech-stack:
  added: []
  patterns: [filename/linktarget as prost bytes decoded lossily, raw-CDN-bytes cache with atomic tmp+rename]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/manifest.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/manifest.rs
key-decisions:
  - "Cache holds the raw wrapped CDN bytes; the depot key is applied on every load and never persisted"
  - "Signature and sha_filename are not verified, matching TS"
requirements-completed: [P73-A, D-01]
duration: 20min
completed: 2026-11-09
---

# Phase 73 Plan 06: Manifest fetch, parse and cache Summary

Rust now parses ContentManifest sections with hand-derived prost structs and serves manifests from a numeric-id-validated on-disk cache or the CDN through the Fetcher.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 + 2 | 962542bd1 | prost structs, section framing (bounded by remaining buffer), filename decrypt, `ManifestStore` load/prune |
| fix | 864856372 | clippy `sort_by_key` in prune |

Both tasks touch the same two files and were committed together.

## Verification

- `cargo test -p gamelib-depot`: all suites green; `--test manifest` 9 tests (the required parse and cache tests, plus unknown-magic and plain round trip).
- `cargo +1.99.1 clippy -p gamelib-depot --all-targets -- -D warnings`: clean. `cargo fmt --check` clean. No `build.rs`.

## Deviations from Plan

**1. [Rule 3] `load` returns `Result<Arc<DepotManifest>, FetchError>`, not `Failure`.** Plan 03 established `FetchError::{Cancelled, Failed}` so cancellation is never reported as a failure; `load` propagates it.

**2. Tasks 1 and 2 committed as one commit** (shared files, written together).

**3. Commit 962542bd1 landed with one clippy error** (`unnecessary_sort_by`) because a BSD `sed` failure did not stop the chained commit; fixed in 864856372.

## Known Stubs

None.

## Threat Flags

None. T-73-22 (section length bounded, errors not panics), T-73-23 (numeric-only path components, tested), T-73-24 (raw CDN bytes cached, asserted byte-equal to served) mitigated. T-73-25 accepted.

## Self-Check: PASSED

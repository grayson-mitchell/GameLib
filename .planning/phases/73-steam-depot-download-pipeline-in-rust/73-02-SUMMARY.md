---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 02
subsystem: infra
tags: [rust, steam-depot, aes, lzma, zstd, zip]
requires: [73-01]
provides:
  - steam_decrypt, decrypt_filename, decode_chunk, unzip_manifest, ContainerKind, DecodeError
  - test-only encoders in tests/support/encode.rs (reused by plan 07)
affects: [73-03, 73-07]
tech-stack:
  added: []
  patterns: [bounded Write sink for every decoder, declared-size check before allocation]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/container.rs
    - src-tauri/crates/gamelib-depot/tests/support/encode.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/container.rs
key-decisions:
  - "Hand-rolled lenient base64 decoder (Node semantics) rather than a new dependency"
  - "Test VZ encoder is a literal-only LZMA encoder: liblzma's encoder always writes an end marker, which its decoder rejects when the size is known (Valve streams have none)"
requirements-completed: [P73-A, D-01, D-14]
duration: 25min
completed: 2026-11-09
---

# Phase 73 Plan 02: Container decode and Steam crypto Summary

Byte-exact Rust port of `crypto.ts`, `chunkDecode.ts` and steam-user's manifest unzip, with every decoder writing through a capped sink.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | e9b0a8fee | steam_decrypt (NoPadding + manual lenient strip), decrypt_filename, VZ/VSZa/PK decode, size-then-SHA1 gate, encoders and tests |
| 2 | c5c8c41b0 | unzip_manifest for VSZa, VZa and real zip via central directory, MAX_MANIFEST_BYTES cap |

## Verification

- `cargo test -p gamelib-depot`: 15 unit + 21 integration tests pass.
- `cargo +1.99.1 clippy -p gamelib-depot --all-targets -- -D warnings`: clean.
- Cargo.toml untouched (no new dependencies).

## Deviations from Plan

**1. [Rule 3 - Blocking] Test VZ encoder is hand-written.** `xz2`'s lzma_alone encoder always appends an end-of-payload marker, and liblzma's decoder returns a data error for a known-size stream carrying one, so a round trip through it failed. A small literal-only LZMA encoder in `encode.rs` produces Valve-shaped streams (size in footer, no marker). Decoder code unchanged.

**2. cipher 0.5 API.** `decrypt_padded_vec`/`encrypt_padded_vec` are unavailable without `alloc`; used `decrypt_padded::<NoPadding>` / `encrypt_padded::<NoPadding>` on a copied buffer.

**3. Not ported:** the footer CRC32 checks in steam-user's manifest unwrap are skipped (the manifest's own protobuf and chunk SHA1 gates cover integrity); chunk path never checked them in TS either.

## Known Stubs

None.

## Threat Flags

None. T-73-05..08 mitigations are implemented and tested (bomb guard, size-then-SHA1, bounds-checked zip, preview capped at 16 bytes).

## Self-Check: PASSED

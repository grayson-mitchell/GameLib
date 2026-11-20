---
phase: 75-steam-local-file-formats-in-rust
plan: 06
subsystem: steam-local-files
tags: [rust, binary-vdf, shortcuts, roundtrip]
requires: [75-01, 75-02]
provides:
  - gamelib-steamfiles kv_bin (BinDoc, BinNode, BinLimits, parse_bin, serialize_bin)
affects: [75-09]
key-files:
  created:
    - src-tauri/crates/gamelib-steamfiles/tests/roundtrip.rs
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/kv_bin.rs
decisions:
  - Fixed-size payloads stored as raw LE bytes; keys and strings as raw bytes (no UTF-8 check)
  - Unknown tag, truncation, depth over 64 and input over 16 MiB are whole-file typed errors
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 06: Lossless binary KV codec Summary

Lossless binary KV parser/serializer for shortcuts.vdf: every committed fixture (10 built plus 7 upstream) round-trips byte for byte, including unknown-type, sparse, lexical-order, non-UTF-8, negative-appid and trailing-bytes cases; bad input is a typed error, never a panic or partial tree.

## Commits
- 86bf59b24: test(75-06) failing round-trip and failure-mode tests (RED)
- feat(75-06) lossless binary KV parse and serialize (GREEN)

## Deviations from Plan
None. Type 0x0A (int64) remains assumption A1; plan 23's real-file round trip is the proof.

## Known Stubs
None.

## Self-Check: PASSED
10 roundtrip tests green, clippy -D warnings and rustfmt clean.

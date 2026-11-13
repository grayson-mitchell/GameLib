---
phase: 75-steam-local-file-formats-in-rust
plan: 04
subsystem: steam-local-files
tags: [rust, vdf, kv1, parser]
requires: [75-01]
provides:
  - kv_text::parse lossless ordered KV1 tree with Limits (64 MiB, depth 64)
  - kv_text::merged (case-insensitive re-open/last-wins) and kv_text::find (ordered view)
  - RawStr::decoded, Pair.cond conditionals, typed KvError
affects: [75-07, 75-08, 75-10]
key-files:
  created:
    - src-tauri/crates/gamelib-steamfiles/tests/kv_text.rs
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/kv_text.rs
decisions:
  - Explicit stack with depth checked before descent; no recursion in parser
  - Key-position `}` inside a block is MissingValue; `}` at root is Unbalanced
  - Merge/lookup are ASCII-case-insensitive keeping first-seen spelling
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 04: Text KV1 parser Summary

Single Rust text VDF/KV1 parser: byte tokenizer producing a lossless ordered tree, with merged and ordered views and bounded resource use (depth 64, 64 MiB).

## Commits
- 0b6c15ad7: test(75-04) failing parser tests (RED, compile failure)
- b19a17a6a: feat(75-04) parser, merged/ordered views, limits (GREEN)

## Notes
- Truncated/malformed fixtures (acf/truncated, installscript/malformed, scan/lib1 appmanifest_30) return typed errors; the oracle hung on them (phase finding from plan 03).
- Oracle differences are documented in the module doc for 75-PARITY.md.
- 20 integration tests including a prefix-truncation totality sweep over every text fixture and a 100k-nesting test; clippy -D warnings and fmt clean.

## Deviations from Plan
None.

## Self-Check: PASSED

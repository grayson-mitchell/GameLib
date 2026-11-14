---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 28
subsystem: steam-cm
tags: [rust, pics, refresh, capture]
requires: [79-06, 79-07, 79-08, 79-29]
provides:
  - refresh::capture (parsers, scope, merge, capture_platforms_and_metacritic)
affects: [79-31]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/refresh/capture.rs
decisions:
  - "Single PICS read, no batching (platformCapture.ts's documented zero-chunking, 90 s bound)"
metrics:
  tasks: 3
  completed: 2026-11-15
---

# Phase 79 Plan 28: Platform and metacritic capture in Rust Summary

Refresh's PICS capture (oslist platforms and metacritic score) now runs in Rust: scope, anonymous-first read with held-lease fallback, parse, and merge into `SteamMetadataEntry` via `resolve_platform_write` (source pics). Fail-soft, returns updated entries for the TS call site to persist (79-31).

## Commits
- Tasks 1-3 (one file, one commit): see git log, `feat(79-28): platform and metacritic capture in Rust`

## Behavior notes
- One read serves both kinds over the union of scopes. Anonymous entries that are missingToken/public_only still yield metacritic but not platforms; those ids, unknown ids and anonymous read failures form the remainder re-read through the held lease. Without a lease (Mac) they stay uncaptured, no failure.
- Held-read success clears an earlier anonymous failure flag; `failed` is set only when no source answered.
- Parsed-but-declined (precedence) platform merges are counted as skipped, as in TS.
- 17 tests: ported TS oslist/metacritic/isPublicOnlyEntry/merge cases plus capture flow tests. Clippy `-D warnings --all-targets` and fmt clean.

## Deviations from Plan
- `parse_oslist_platforms` returns `Option<CapturedPlatforms>` (None = TS null, write nothing); the plan's non-Option signature cannot express that.
- No batch size: platformCapture.ts does not chunk (one call, tested with 500 ids), so Rust issues one read per source pass. Verify lines use `cargo test -p gamelib-steamcm --lib -- refresh::capture::`.
- Three tasks landed as one commit since all live in one new file.
- An app whose appinfo has `common` but no score still counts as metacritic-captured (TS rule); parsed-declined platform writes mark the app done so the held lease does not re-read it.

## Known Stubs
None.

## Self-Check: PASSED

---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 09
subsystem: steam-polling
tags: [rust, tokio, outbox, effects, ack]
requires: [80-01]
provides:
  - Outbox { new, is_ready, enqueue, mark_ready, flush, queued_len, logs } and apply_effects(host, hold, outbox, effects, title_cache)
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/outbox.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/outbox.rs
decisions:
  - "mark_ready and flush are async: they await each replay ack (5 s bound each) so entries are removed only when applied"
  - "Post-ack effects are spliced in place (work deque) rather than recursing, so list order is exact"
  - "Outbox keeps an in-memory log buffer (logs()) besides eprintln so tests can assert the ack-timeout line"
  - "WriteHoldRecord stamps recordedAt from SystemTime (HoldSink has no clock)"
metrics:
  tasks: 1
  files: 2
  completed: 2026-11-16
---

# Phase 80 Plan 09: outbox and effect applier Summary

One tested applier for every machine: transition sends the state event first, then runs the continuation's frontend and notify effects after the ack or after a 5 s timeout (logged with appId and kind); not-ready queues per (appId, kind) latest-seq-wins, capped at 256 appIds, and replays in ascending seq on `mark_ready`.

## Commits

- c13e463f8: outbox and apply_effects with 8 paused-time tests

## Verification

`cargo test -p gamelib-steampoll --test outbox` (8 green), clippy `-D warnings`, `cargo fmt --check` clean. No `spawn_blocking`/`block_on` in outbox.rs.

## Deviations from Plan

None. An older-seq enqueue for a key already holding a newer seq is ignored (consistent with latest-seq-wins).

## Known Stubs

None.

## Self-Check: PASSED

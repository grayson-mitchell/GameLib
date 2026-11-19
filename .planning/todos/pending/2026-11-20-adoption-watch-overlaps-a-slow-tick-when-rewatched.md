---
created: 2026-11-20T00:00:00.000Z
title: 'Adoption watch runs two evaluations at once when it is unwatched and re-watched during a slow tick'
area: steam-adoption
severity: medium
platform: any
ready: code
files:
  - src-tauri/crates/gamelib-steampoll/src/adoption.rs
  - src-tauri/crates/gamelib-steampoll/src/running.rs
  - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
---

## Problem

Found while closing Phase 81 truth 15 (quick 261120-96e). Truth 15 says the adoption watch never
overlaps a slow tick: a slow helper or pgrep probe delays the next tick instead of running two
evaluations at once (Phase 80 D-10 poll contract). The steady-state half holds and is now tested
(commit `11e3c4308`, three tests in `tests/adoption.rs`: a slow `pgrep` on Linux, a slow helper on
macOS, and a negative control showing the counter sees an overlap). The re-watch half does not.

Real code, confirmed by reading it: `unwatch` (`adoption.rs:401-413`) cancels the task's token and
bumps `gen` without waiting for the tick that is running. That tick runs to completion, because it
is awaited inside the `tokio::select!` tick arm (`adoption.rs:382-389`) and the token is not raced
against the tick body. `watch` (`adoption.rs:356-396`) then spawns a second task whose first tick
probes while the old slow call is still out. The running poll guards this exact case with an
`in_flight` flag (`running.rs:336-341`, `poll_once`); the adoption watch has none.

The executor's failing test (not committed; the full source and cargo output are in the quick
task's SUMMARY under `## Defect found`) unwatched the last entry and re-watched at 6000 ms with an
8 s `pgrep` already in flight from 5000 ms: the new task's first tick probed at 11000 ms and
finished at 11000 ms while the old call finished at 13000 ms, so two evaluations were nested and
`max_in_flight` was 2, not 1.

Real-world reach is not measured: it needs an unwatch and a re-watch inside one slow probe window
(for example a restart-on-Play unwatch followed by a new install's watch). The worst effect that
was reasoned about, and not observed, is a duplicate adoption emit from the two evaluations.

## Direction

Either share an `in_flight` guard across the old and the new task (the `running.rs` shape, reset on
drop), or race the tick body against the cancel token so a cancelled tick stops probing. Prefer the
guard: it also covers a probe that ignores cancellation. Bring back the executor's re-watch test as
the regression test (it is in the quick task's SUMMARY); it should go green with the fix and its
assertions must not count ticks after the old one ends, because the `select!` is not `biased`.
Re-run the 10-run flakiness loop used for `tests/adoption.rs`.

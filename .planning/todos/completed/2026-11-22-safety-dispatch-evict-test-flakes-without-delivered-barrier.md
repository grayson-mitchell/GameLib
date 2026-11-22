---
created: 2026-11-22T12:00:00.000Z
title: "safety_dispatch evict test flakes: it reads events without the delivered(&host) barrier"
area: rust-shell-tests
files:
  - src-tauri/src/safety_dispatch.rs (~230, safety_a_removed_app_data_target_evicts_open_and_queued_stores_and_nothing_is_recreated)
  - src-tauri/src/store_dispatch.rs (~418 on_any_change registration; delivered/settle helpers in its tests module)
severity: minor
platform: any
ready: code
---

## Problem

`safety_dispatch::tests::safety_a_removed_app_data_target_evicts_open_and_queued_stores_and_nothing_is_recreated`
fails intermittently with this assertion at `safety_dispatch.rs:230`:
`left: [(1, applied), (2, refused/evicted)]`, `right: [... (3, applied)]`. The last event is missing.

Measured during the Phase 85 round-2 review (2026-11-22): 15 rounds of 24 concurrent runs of that one test
gave 4 failures. It also failed once in a full `cargo test -p gamelib-shell` run during the first fix pass.

The flake predates the Phase 85 review fixes. B-WR-04 and B-WR-05 changed only `rpc_safety_remove_tree` and
its helpers. This test does not call that function, and its body is byte-identical across the range.

## Cause

`Dispatcher::new` registers `host.on_any_change` (`store_dispatch.rs:418`). Because of that,
`Dispatcher::reply` goes through `host.post` onto the host's `store-events` thread. The test calls
`dispatcher.wait_idle` and then reads its `events` sink straight away. It does not use the `delivered(&host)`
barrier that the store_dispatch tests use (`settle`), so the last event can still be in flight.

## Fix

Before reading `events`, post to `host` and wait for that post to run. Either make the `delivered` helper in
`store_dispatch::tests` `pub(crate)`, or inline its three lines. Check for other tests that read an events
sink straight after `wait_idle` and fix them the same way.

To verify, build the test binary once (`cargo test -p gamelib-shell --no-run` from `src-tauri/`). Then run
15 rounds, each starting 24 copies of that one test in parallel as separate processes. The fix holds when
there are zero failures. `--test-threads` will not do this, because it runs one copy of a filtered test.

## Resolution

Closed by `/gsd-fast` (2026-11-23), `fde29c560`. Nothing pushed.

- The three-line `delivered(&host)` barrier is inlined in `safety_dispatch::tests` (the `store_native` and `store_dispatch` test modules each keep their own copy). It now runs before `events` is read in `safety_a_removed_app_data_target_evicts_open_and_queued_stores_and_nothing_is_recreated`, and in `safety_a_refused_removal_evicts_nothing`, which read `events.last()` straight after `wait_idle` and had the same race.
- Sweep for other tests that read an events sink after `wait_idle`: `wait_idle` is called only in `safety_dispatch.rs`, `store_dispatch.rs`, `store_boot.rs` and `gamelib-store/src/host.rs`. Every `store_dispatch` test read goes through `settle` (`wait_idle` + `delivered`) or `delivered`; `store_boot.rs:292` is the production drain, not a test read. No other site needed the fix.
- Verification, as specified above (test binary built once, 15 rounds of 24 parallel processes of the one test): **0 / 360 failures** with the fix. Control run with the evict test's barrier removed, same load: **1 / 360** failures, so the harness still detects the race (the original measurement was 4 / 360).

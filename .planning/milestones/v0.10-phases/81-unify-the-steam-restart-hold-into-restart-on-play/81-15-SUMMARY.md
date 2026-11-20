---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 15
subsystem: steam-polling
status: complete
tags: [steam, effects, restart-hold-removal, hold-sink, rust]
requires: [81-14]
provides:
  - apply_effects / apply_effects_with without a hold parameter
  - InstallPolls::new and start_uninstall without a sink
  - facade::install and install_for_test taking (host, runner, clock, profile)
  - install_steampoll_host building no HoldStore
affects: [81-16, 81-17, 81-18]
tech-stack:
  added: []
  patterns: [compiler-led argument removal, deletion with no fixture edit]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steampoll/src/effects.rs
    - src-tauri/crates/gamelib-steampoll/src/outbox.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/src/uninstall.rs
    - src-tauri/crates/gamelib-steampoll/src/adoption.rs
    - src-tauri/crates/gamelib-steampoll/src/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/src/constants.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/crates/gamelib-steampoll-cli/src/replay.rs
    - src-tauri/crates/gamelib-steampoll/tests/outbox.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/uninstall.rs
    - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/contracts.rs
  deleted: []
decisions:
  - "The HoldSink trait, its HoldStore / RecordingHost / ReplayHost impls and hold.rs stay for 81-16; after this plan they have no consumer on the effect path"
  - "tests/hold.rs needed no edit: none of its cases drove HoldStore through apply_effects, so the read cases stay as they were"
  - "The test effect_order_and_side_records_are_preserved became effect_order_is_preserved: the hold effects and their file:record / file:clear stream entries are gone, the ordering of the remaining effects is still asserted"
metrics:
  tasks: 2
  files: 14
  completed: 2026-11-18
commits: 2
plan_head_before: c65a4f5efaf24a4ae15f67a5831e3a56352dbb75
plan_head_after: f774ac51c47474b131a6f14fedd70c650cd1a3f0
actuals:
  tokens: 6000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 15: Effects run with no hold sink Summary

No effect, loop, facade or shell path can write or clear a hold record any more: `Effect::WriteHoldRecord` / `ClearHoldRecord`, the hold parameter of `apply_effects`, `InstallPolls`' sink, the facade's sink and the shell's `HoldStore` are gone, along with the dead hold-probe interval constant.

## What changed

- **Task 1 (tracer, 8a0cb23d8):** deleted the two hold effect variants and their outbox arms, the `hold` parameter of `apply_effects` / `apply_effects_with`, `InstallPolls.hold` and its constructor parameter, `start_uninstall`'s hold parameter, adoption's `NoHoldSink`, the facade's `hold` field and parameter, and the shell's `HoldStore` construction in `install_steampoll_host`. The replay CLI builds `InstallPolls` and calls `start_uninstall` with no sink. `outbox::now_ms` lost its only caller and went too. frozen_parity stayed green with no fixture edit.
- **Task 2 (f774ac51c):** deleted `STEAM_HOLD_PROBE_MIN_INTERVAL_MS` and its pin in `tests/contracts.rs`.

Net diff across both commits: 14 files, deletions only apart from re-wrapped call sites.

## Verification

- `cargo test -p gamelib-steampoll` and `-p gamelib-steampoll-cli` (whole crates): all green, frozen parity included.
- `cargo test --bin gamelib-shell steampoll`: 17 passed.
- `cargo clippy -p gamelib-steampoll -p gamelib-steampoll-cli --all-targets -- -D warnings`, `cargo fmt --check` on both crates, `rustfmt --check` on `src/steampoll_dispatch.rs`: clean.
- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__ src/common`: 2 failed suites, both the logged reds (`storeKinds.test.ts`, `acfUpdateReplay.test.ts`); 10295 tests passed.
- `pnpm codecheck`: green.
- `pnpm -s backend-di-ceilings` and `pnpm -s find-deadcode`: only the logged reds (launchWithoutSteam / NoticeStack / NativePortInfo / LaunchWithoutSteam tests; NativePortDataStyle, NativePortMac). This plan touched no TS file, so none are new.
- Acceptance greps: no `WriteHoldRecord|ClearHoldRecord|NoHoldSink` anywhere in the crate, CLI or shell; `HoldStore` count in `steampoll_dispatch.rs` is 0; `HoldSink` count is 0 in install_loop, outbox, uninstall and dispatch; `steampoll_running_hold` still appears 2 times in dispatch.rs (T-81-51); no `STEAM_HOLD_PROBE_MIN_INTERVAL_MS` left in the crate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Call sites outside `files_modified` that the compiler led to**
- **Found during:** Task 1
- **Issue:** `tests/uninstall.rs` passed the host as `start_uninstall`'s sink in two places, and `tests/install_loop.rs` and `adoption.rs` carried imports and a local that the removal left unused (`HoldSink`, `serde_json::Value`, a `host` clone), which `-D warnings` rejects.
- **Fix:** removed the argument, the imports and the clone.
- **Files modified:** `src-tauri/crates/gamelib-steampoll/tests/uninstall.rs`, `tests/install_loop.rs`, `src/adoption.rs`
- **Commit:** 8a0cb23d8

**2. [Rule 1 - Bug] Dead `outbox::now_ms`**
- **Found during:** Task 1
- **Issue:** its only caller was the `WriteHoldRecord` arm.
- **Fix:** deleted it.
- **Commit:** 8a0cb23d8

## Known Stubs

None.

## Threat Flags

None. Deletion only; T-81-51 (name confusion) held: `steampoll_running_hold`, `RunningPoll::hold` and `running.hold(id)` are untouched.

## Out-of-scope reds (already logged, not fixed)

`storeKinds.test.ts`, `acfUpdateReplay.test.ts`, `backend-di-ceilings`, `find-deadcode` as listed in `deferred-items.md`.

## Self-Check: PASSED

- FOUND: 8a0cb23d8, f774ac51c (both ancestors of HEAD)
- All 14 modified files present; no unexpected deletions in either commit.

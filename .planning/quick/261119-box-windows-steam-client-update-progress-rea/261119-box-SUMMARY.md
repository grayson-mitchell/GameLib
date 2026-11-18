---
phase: quick-261119-box
plan: 01
subsystem: steam
tags: [rust, gamelib-steampoll, windows, progress, update]
status: complete
requires: [fd97af7c5]
provides:
  - Windows update polls read steam.exe's write counter over the update ACF's BytesToStage
affects: [gamelib-steampoll]
key-files:
  modified:
    - src-tauri/crates/gamelib-steampoll/src/acf_state.rs
    - src-tauri/crates/gamelib-steampoll/src/update.rs
    - src-tauri/crates/gamelib-steampoll/src/install_once.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/src/win_live.rs
    - src-tauri/crates/gamelib-steampoll/src/monitor.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/update.rs
    - src-tauri/crates/gamelib-steampoll/tests/acf_update.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs
    - .planning/todos/completed/2026-11-19-windows-steam-update-poll-progress-acf-only.md
decisions:
  - "Denominator is the update ACF's BytesToStage, falling back to BytesToDownload (reading_from_write_delta reused unchanged)"
  - "Baseline is the first tick the update ACF carries UpdateRunning/UpdateStarted, not the hand-off"
  - "AcfUpdateFields.bytes_to_stage is serde-skipped so the IPC reply and TS types are untouched"
metrics:
  tasks: 3
  completed: 2026-11-19
actuals:
  tokens: 30000
  tasks: 3
  commits: 3
plan_head_before: fd97af7c5a742e5bdefc1c3d855a75158c733406
plan_head_after: 7c01b89ef2fd5543117657dde84769f589619da1
---

# Quick 261119-box: Windows Steam-client update progress

**Windows update polls now show live progress: steam.exe's write-counter delta over the update ACF's BytesToStage, baselined when Steam starts the update, instead of sitting at 0 on the frozen ACF byte fields.**

## What changed

- `acf_state.rs`: `AcfUpdateFields.bytes_to_stage` (read from BytesToStage, `#[serde(skip)]`).
- `update.rs`: `pub fn is_update_running` (0x100 | 0x400); `UpdateObservation.windows_live`; the step's live gate is now `Native && (is_mac || windows_live)` (macOS condition unchanged).
- `install_once.rs`: `update_tick` passes `windows_live_applies(platform, poll)` into the observation.
- `install_loop.rs`: `windows_update_live_active`; Phase B update arm calls `read_windows(app_id, bytes_to_stage, bytes_to_download)` only while `is_update_running`; `upgrade()` keeps the baseline across a repeat start of an update poll (`was_update`) but drops it when an install poll is upgraded into an update.
- `win_live.rs` / `monitor.rs` docs describe the update arm. The todo is in `completed/` with a Resolution and the operator's live check.

## Commits

- e34be6485 Task 1 (tracer): end-to-end update arm
- 67fa393f5 Task 2: baseline rule in `upgrade()` plus the gating/step/reader tests
- 7c01b89ef Task 3: docs and todo closed

## Red results

- Task 1 climb test `a_windows_update_poll_climbs_with_the_write_counter_then_completes` was red at HEAD with `[0, 0, 0, 0]` (ACF-only path), green after the change (`[0, 25, 50, 99]`, completes on build "8").
- Task 2: `the_windows_update_baseline_survives_a_repeat_start_of_the_same_update_poll` was red (`[0, 50, 0]`) before the `upgrade()` change and green after. The other new tests (baseline at first running tick, gating negatives, install-to-update fresh baseline, step-level and reader-level tests) pin behaviour Task 1 already delivered and passed on first run as guards.

## Mutants (manual; Stryker is JS-only), each restored

1. Dropped `was_update &&` in `upgrade()`: killed by `an_install_poll_upgraded_to_an_update_takes_a_fresh_baseline`.
2. Replaced the `is_update_running(f)` guard in Phase B with `true`: killed by `the_windows_update_baseline_is_the_first_running_tick_not_the_hand_off`.

## Removed test case

The `"awaiting update"` case was removed from `only_a_windows_delegated_native_install_poll_reads_the_counter`. Its 1026 fixture carries UpdateStarted, so a delegated Win32 update poll now correctly reads the counter. This is an intended behaviour change, not a weakened test; the update arm's own negatives live in `only_a_windows_delegated_native_update_poll_reads_the_counter`.

## Verification

- `cargo test -p gamelib-steampoll --no-fail-fast -- --skip on_windows_a_changed_steam_pid_is_never_adopted`: all green (install_loop 48, update 36, install_once_complete 25, acf_update 10, win_live 26, monitor 15). `live_progress_on_mac_native_uses_monitor_reading` unchanged and green.
- `cargo clippy -p gamelib-steampoll --all-targets -- -D warnings` clean; `cargo fmt -- --check` clean; `pnpm planning-gates` 12/12.
- No Cargo.toml/Cargo.lock change, no TS change (no jest run).
- Pre-existing red skipped by name: `adoption::on_windows_a_changed_steam_pid_is_never_adopted`.

## Deviations from Plan

None - plan executed exactly as written. (Mid-task slip: the first Task 3 commit staged only the todo rename because a `git add` of the already-moved pending path failed; fixed by staging the remaining files and amending that unpushed commit.)

## Pending operator live check

Windows with a Steam game that has a pending update: start the update from GameLib and watch the Updating percent climb from 0. The terminal logs `windows live progress started for appId <id> (steam.exe write counter)` once Steam starts the update. If it stays at 0, check for `windows live progress unavailable`, then the update ACF's StateFlags and BytesToStage. What Windows Steam writes to an update ACF is unmeasured.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files and commits e34be6485, 67fa393f5, 7c01b89ef exist; `git rev-list --count` over the ledger base gives 3.

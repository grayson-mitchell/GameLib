---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 06
subsystem: steam-polling
tags: [rust, steam, nettop, download-progress, watchdog]
requires: [80-01]
provides:
  - gamelib_steampoll::progress (pure live-progress maths, formatEta, rolling rate)
  - gamelib_steampoll::monitor (DownloadMonitor, read_content_log_tail, WATCHDOG_SH, build_watchdog_spawn)
affects: [80-07, 80-09, 80-21, 80-29, 80-31]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/progress.rs
    - src-tauri/crates/gamelib-steampoll/tests/monitor.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/progress.rs
    - src-tauri/crates/gamelib-steampoll/src/monitor.rs
decisions:
  - "Parsing is hand-rolled (no regex dependency) and mirrors the TS regexes, including greedy-backtrack on the nettop flow"
  - "DownloadMonitor::start takes &PollRoots (content_log path = steam_root minus quotes / logs / content_log.txt)"
  - "pgrep -x steam_osx for the Steam pid is private to monitor.rs; a shared lister from plan 07 can replace it"
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-16
---

# Phase 80 Plan 06: Progress maths and download monitor Summary

`progress.rs` is a pure Rust port of steamDownloadProgress.ts plus formatEta and rollingRateMiBs; `monitor.rs` runs the per-appId nettop monitor with the child owned by Rust, anchored on `PollHost::shell_pid`, argv only, no env, killed by `stop`/`stop_all` (token cancel, `kill_on_drop` behind it).

## Commits

- f1619e066: progress maths
- 378a392dd: download monitor

## Function pairs (steamDownloadProgress.ts / depotRust/progress.ts to progress.rs)

| TS | Rust |
| --- | --- |
| parseContentLogLine | parse_content_log_line (ContentLogEvent) |
| parseNettopRow | parse_nettop_row (NettopRow) |
| createFlowAccumulator / FlowAccumulator | FlowAccumulator::new |
| applyNettopRow | apply_nettop_row |
| createUpdateTracker / UpdateTracker | UpdateTracker::new |
| applyContentLogEvent | apply_content_log_event |
| activeCount | active_count |
| liveProgress | live_progress (LiveProgressInput, LiveProgress) |
| windowRate | window_rate (3000 ms) and window_rate_in |
| formatEta | format_eta |
| rollingRateMiBs | rolling_rate_mib_s |

## steamDownloadMonitor.test.ts mapping

| TS case | cargo test (tests/monitor.rs) |
| --- | --- |
| spawns the watchdog ... lowest pid ... no env | spawns_the_watchdog_around_script_nettop_for_the_lowest_pid_with_shell_pid_anchor (no-env is structural: `spawn_streaming(program, argv)` has no env parameter; grep `.env(` = 0) |
| is idempotent per appId | start_is_idempotent_per_app_id |
| does not spawn: non-darwin / no pids / unknown pids | does_not_spawn_non_darwin_no_pids_unknown_pids |
| reads bytes and speed from two blocks | reads_bytes_and_speed_from_two_blocks_plus_the_log_anchor |
| no active update / two active updates | none_with_no_active_update_or_two_active_updates |
| ghost update before client start | ignores_a_ghost_update_from_before_the_last_client_start |
| anchor predating the monitor | keeps_this_app_anchor_that_predates_the_monitor |
| genuine concurrent pair | falls_back_for_a_genuine_concurrent_pair_in_the_same_session |
| falls back after child exits | falls_back_after_the_child_exits |
| stop SIGTERM / stopAll | stop_kills_the_child_and_stop_all_stops_every_live_monitor, plus stop_kills_a_real_child (macOS, real `sh`/`sleep` via TokioRunner, pid gone within 2 s) |
| stop during pid lookup prevents spawn | stop_during_pid_lookup_prevents_the_spawn |

Added: watchdog_literal_matches_childwatchdog_ts (equality against the TS literal; plan 29 drops this case, plan 31 deletes the TS file), content_log_tail_first_read_incremental_and_rotation, content_log_tail_is_bounded_and_drops_the_partial_first_line.

Stays TS: the `listPids`/`readTail` dependency injection of the TS monitor (replaced by the runner's pgrep call and the file read in Rust).

## Verification

`cargo test -p gamelib-steampoll --test progress --test monitor` (16 + 15 green), clippy `-D warnings` clean, `cargo fmt --check` clean. Acceptance greps: `shell_pid` present, `process::id|getppid` 0, `.env(` 0.

## Deviations from Plan

None - plan executed as written. Notes: the TS kill is `SIGTERM` on the child handle; the Rust `StreamingChild` kill is a token whose cancel drops the child (SIGKILL by `kill_on_drop`), so the watchdog's TERM trap cleanup does not run on a clean `stop`. The watchdog still reaps the script/nettop children when the parent/Steam pid dies. If plan 21's live check finds an orphaned nettop after `stop`, the runner needs a SIGTERM-then-kill step. `format_eta` does not reproduce JS `NaN` output for NaN input (unreachable from the poll).

## Known Stubs

None.

## Threat Flags

None. T-80-15 (fixed script literal, integer pids as positional args), T-80-17 (256 KiB tail bound), T-80-18 (no env, temp dirs only) mitigated; T-80-16 mitigated by the watchdog, `kill_on_drop` and `stop_all` (live check remains in smoke 1).

## Self-Check: PASSED

Files and commits f1619e066, 378a392dd verified present.

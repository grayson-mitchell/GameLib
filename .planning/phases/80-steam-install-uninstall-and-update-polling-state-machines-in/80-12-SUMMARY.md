---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 12
subsystem: steam-polling
tags: [rust, steam, update-poll, installapp, d-11]
requires: [80-04, 80-06]
provides:
  - "update::update_step: pure Phase 74 D-11 update tick (AwaitingUpdate, UpdateObservation, UpdateStep)"
  - "update::request_steam_install_app: bridge-helper InstallApp request with the TS outcome mapping"
  - "update::format_file_size: filesize base-2 formatting for progress payloads"
affects: [80-13 .. 80-33 (install loop drives update_step)]
tech-stack:
  added: []
  patterns: [pure step returning effects plus a request intent; async result fed into the next observation]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steampoll/src/update.rs
    - src-tauri/crates/gamelib-steampoll/tests/update.rs
decisions:
  - "AwaitingUpdate also owns delegated_since_tick and last_bytes_downloaded (poll scalars update_step mutates), so update.rs never depends on install_once.rs; the loop initialises them"
  - "The InstallApp outcome is applied at the start of the next step against the requesting tick (request_tick); equivalent to TS awaiting inside one tick for every reachable cadence"
  - "Quiet end sends Transition(updateDone completed:false, Continuation::None) then a separate gameStatusUpdate done effect; Continuation::UpdateDone (updating then done) is used only for completion"
  - "seq and is_mac are passed in via UpdateObservation"
metrics:
  tasks: 2
  files: 2
  completed: 2026-11-16
---

# Phase 80 Plan 12: update poll and InstallApp request Summary

`update_step` ports `updatePollOnce.ts` with Phase 74 D-11 intact (bit 4 alone never completes, a build change or the target completes, no activity ends quietly), and `request_steam_install_app` runs `steam-bridge-helper --steam-installapp <appId> [--library <path>]` from Rust with the TS outcome mapping.

## Commits

- ea9277146: update.rs plus tests/update.rs (both tasks share the two files, committed together)

## Verification

`cargo test -p gamelib-steampoll --test update` 34 passed; clippy `-D warnings` clean; `cargo fmt --check` clean (rustfmt is the formatter, no prettier parser for `.rs`). Named tests `bit4_alone_never_completes`, `build_change_completes`, `abandoned_after_settled_ticks`, `quiet_end_on_no_activity`, `installapp_retry_cadence` exist.

## Contract for the install loop (plan 13+)

Per tick: read `read_acf_update_state` + monitor reading, build `UpdateObservation { fields, monitor, install_app_outcome, seq, is_mac }`, call `update_step(&mut awaiting, ticks, source, app_id, &obs)`, apply `effects`; if `stop` stop the poll; if `request_install_app = Some(lib)` await `request_steam_install_app` (no overlap: `in_flight` is set by the step) and pass the outcome in the next observation.

## Mapping: library.updatePollOnce.test.ts

| TS case | Rust test |
| --- | --- |
| pending (StateFlags 6) reports updating, managed by Steam | pending_reports_updating_managed_by_steam |
| derives percent from the ACF byte counters | derives_percent_from_acf_byte_counters |
| completes when no longer pending and bit 4 set | completes_when_no_longer_pending_and_bit4_set |
| bit 4 alone with a different target build is not completion | bit4_alone_never_completes |
| completes on the target build, updating before done | build_change_completes |
| quiet end completes when ACF already current | quiet_end_completes_when_acf_already_current |
| quiet end with an unmet target build does not complete | quiet_end_with_unmet_target_does_not_complete |
| UAT 19 live replay (stale 40 ticks) | uat19_stale_acf_for_40_ticks_ends_quietly |
| UAT 19 reaching the PICS target | uat19_reaching_pics_target_logs_finished |
| quiet end, no known target | quiet_end_no_known_target_completes_when_current |
| quiet end at the target build | quiet_end_at_target_build_completes |
| WR-01 ends quietly after STEAM_UPDATE_ABANDONED_TICKS | abandoned_after_settled_ticks |
| WR-01 settled read restarts the count | settled_read_between_active_ticks_restarts_count |
| WR-01 reaching the target after a settled spell | reaching_target_after_settled_spell_still_finishes |
| ends quietly after the no-activity window | quiet_end_on_no_activity |
| retry: ok | installapp_ok_logs_disarms_and_restarts_quiet_window |
| retry: unavailable counts, gives up at max | installapp_unavailable_counts_attempts_and_gives_up_at_max |
| retry: error disarms | installapp_error_disarms_and_logs_code |
| no second call while in flight | installapp_retry_cadence (first loop) |
| UAT 25 retries on pending-but-idle ACF | uat25_retries_on_pending_but_idle_acf_same_tick |
| UAT 25 retries on a due tick after sawPending | uat25_retries_on_due_tick_after_earlier_saw_pending |
| never retries once activity seen | never_retries_once_real_activity_seen |
| UAT 25 growing bytes disarms | uat25_growing_bytes_under_update_required_disarms_retry |
| UAT 25 never finished at stale build | uat25_never_logs_finished_at_stale_starting_build |
| UAT 25 finishes at target | uat25_finishes_once_target_build_reached |
| startInstallPolling awaitingUpdate (describe) | not ported here: install-loop/registry behaviour (poll entry reuse), plan 13+ |

Added beyond TS: `live_progress_on_mac_native_uses_monitor_reading`, `file_size_matches_filesize_base2`, `installapp_retry_cadence` second loop (3,6,9,12).

## Mapping: steamInstallApp.test.ts

| TS case | Rust test |
| --- | --- |
| InstallApp: maps an ok line | installapp_maps_an_ok_line_with_library |
| omits --library when undefined | installapp_omits_library_when_none |
| maps an unavailable / error line | installapp_maps_unavailable_and_error_lines |
| uses the last non-empty stdout line | installapp_uses_last_non_empty_stdout_line |
| no JSON, timeout, rejected run -> helper-failed | installapp_maps_no_json_timeout_and_junk_to_helper_failed |
| missing helper -> helper-missing without spawning | installapp_missing_helper_does_not_spawn |
| non-digit appId never spawns | installapp_bad_appid_does_not_spawn |

Stays TS: the whole UninstallApp half (`requestSteamUninstallApp`, its 9 tests) because `gameUninstall.ts` calls it; also `createSteamInstallAppRun` (the TS runner seam), replaced in Rust by `ProcessRunner::run`.

## Deviations from Plan

None in behaviour. Notes:
- The plan's artifact line says `update_step(&mut ActiveInstall, Observation)`; the action text (and R-design) say `AwaitingUpdate` plus scalars, which is what was built.
- `request_steam_install_app` logs nothing (TS `warn` lines): the crate's log channel is `Effect::Log` from steps; helper-side warnings are not state-machine effects. The step logs the retry outcome lines.
- Helper stdout truncation (64 KiB cap in the TS runner) is modelled as `stdout.len() > 64 KiB` => helper-failed, since `RunOutput` carries no truncated flag.

## Threat mitigations

T-80-37: helper path only from `host.bridge_helper_path()`. T-80-38: appId `^\d{1,10}$` checked before spawn; library path is one argv element. T-80-39: 30 s timeout (TS `HELPER_TIMEOUT_MS`); `in_flight` prevents overlapping requests.

## Known Stubs

None.

## Self-Check: PASSED

update.rs and tests/update.rs exist; commit ea9277146 exists.

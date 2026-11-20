---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 14
subsystem: steam-polling
tags: [rust, steam, install-poll, step-machine]
requires: [80-04, 80-06, 80-07, 80-09, 80-10, 80-12]
provides:
  - "install_once::install_step: pure per-tick install machine (ActiveInstall, InstallObservation, InstallStep)"
  - "install_once::{wants_mac_arch_probe, run_mac_arch_followup, mac_arch_verdict_effect}: off-tick Mac arch follow-up (R6)"
affects: [80-15 .. 80-33 (install loop drives install_step)]
tech-stack:
  added: []
  patterns: ["pure step returning effects plus loop requests (hold_probe, update, mac_arch); re-entry for the async hold decision"]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/install_once_progress.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/install_once.rs
decisions:
  - "Hold decision is a re-entrant handshake: first call returns hold_probe and mutates nothing; the loop runs hold::should_hold on poll.hold and calls install_step again with obs.hold = Some(HoldOutcome). A supplied outcome is honoured even when the probe released the hold (poll then ineligible), so the record-clear and log effects are not lost."
  - "ActiveInstall embeds hold::HoldPoll (steam_hold, is_native_handoff, mac_native_route, skipped_depots, seen_downloading, absent_ticks_since_seen) instead of duplicating those fields"
  - "Mac arch follow-up needs the ack reply (macArchCheck), which Continuation/apply_effects do not expose; the step returns a MacArchFollowUp and the loop runs run_mac_arch_followup only if wants_mac_arch_probe(reply). The loop plan must get the reply out of the Installed transition (apply_effects currently discards it)."
  - "native_in_flight was left off InstallObservation: pollInstallOnce never reads it (only the start/grace loop does)"
  - "bridge_finalized is read when the step runs, not after the ack (TS read it synchronously at the send site, which is after the awaited pushGameToLibrary)"
metrics:
  tasks: 2
  files: 3
  completed: 2026-11-16
---

# Phase 80 Plan 14: install poll step Summary

`install_step` ports `installPollOnce.ts`: every ACF state (absent, unknown, downloading with progress, stall and notice rules, bottle 1026 incomplete, installed with the restart hold, bridge finishing, completion, depot-skipped notice, Mac arch follow-up) plus delegation to `update_step` when `awaiting_update` is set. Progress payloads (percent, bytes, eta, downSpeed) use `progress.rs` and the macOS monitor reading exactly as the TS.

## Commits

- 474f5488c: install_once.rs plus both test files. Task 1 and Task 2 share one file and the crate's step function is a single match, so the two tasks were committed together (the plan allowed this).

## Verification

`cargo test -p gamelib-steampoll` green (install_once_progress 38, install_once_complete 27); `cargo clippy -p gamelib-steampoll --all-targets -- -D warnings` clean; `cargo fmt -p gamelib-steampoll --check` clean (rustfmt is the formatter; no prettier parser for `.rs`).

## Contract for the install loop (plan 15+)

Per tick: build `InstallObservation` (ACF via `read_acf_state`, `update_fields` via `read_acf_update_state` only when `awaiting_update`, monitor reading, `now_ms`, platform, `bridge_finalized`, `seq`), set `poll.ticks`, call `install_step(app_id, &mut poll, &obs)`.
- `hold_probe = Some`: run `hold::should_hold(.., &mut poll.hold, source, still_current)`, then call `install_step` again with `obs.hold = Some(HoldOutcome { holding, effects })`. Do not apply effects from the first call (it has none).
- apply `effects` through `outbox::apply_effects`; if `stop`, stop the poll (and the monitor).
- `update = Some(req)`: await `update::request_steam_install_app` and pass the outcome as `install_app_outcome` next tick.
- `mac_arch = Some(f)`: after the `installed` ack, if `wants_mac_arch_probe(&reply)` spawn `run_mac_arch_followup(runner, platform, &f, seq)` off-tick and apply the returned `Transition(macArchVerdict)`. This needs the ack reply, which `apply_effects` does not return today.

## Mapping: library.installPollOnce.test.ts (57 cases)

| TS case (line) | Rust test |
| --- | --- |
| 294 sends gameStatusUpdate installing when downloading | install_once_progress::sends_installing_when_downloading |
| 316 progressUpdate percent 50 mid-download | progress_percent_50_for_mid_download |
| 338 staged fallback when BytesToDownload 0 | staged_fallback_when_bytes_to_download_is_zero |
| 362 no progressUpdate when both totals 0 | no_progress_when_both_totals_are_zero |
| 390 no downSpeed, eta "" with no active poll | first_tick_has_no_down_speed_and_empty_eta (a poll always exists in Rust; first tick = no baseline) |
| 410 finite downSpeed and eta on second tick | rising_download_second_tick_has_speed_and_eta |
| 458 back-to-back zero elapsed guard | back_to_back_ticks_never_emit_a_non_finite_speed |
| 500 staged-fallback still emits percent, no speed/eta | staged_fallback_has_no_speed_or_eta |
| 531 steam-paused after STALLED_TICKS_THRESHOLD | paused_after_stalled_ticks_threshold_on_a_real_in_flight_download (+ not_paused_one_tick_before_the_threshold) |
| 554 never paused while bytes rise | never_paused_while_bytes_keep_rising |
| 610 frozen 1026 native handoff keeps waiting | frozen_1026_native_handoff_keeps_waiting_never_paused |
| 641 staged-fallback frozen not paused | staged_fallback_frozen_is_never_paused |
| 668 installed: push + done | install_once_complete::installed_sends_the_state_event_then_done_after_the_ack (push is the handler's job, R2) |
| 700 GAME-02 Installation Finished toast | installed_fires_installation_finished_once_with_the_ack_title |
| 752 starts the monitor for native non-handoff polls, stops on stop | stays TS / loop plan: monitor lifecycle is `startInstallPolling`, not the step |
| 759 upgrading a poll to delegated starts the monitor | stays TS / loop plan (registry reuse) |
| 777 never starts the monitor off macOS | stays TS / loop plan; step-level: the_monitor_is_ignored_off_macos |
| 783 live percent, speed, eta while ACF frozen | live_percent_speed_and_eta_while_the_acf_is_frozen_at_zero |
| 795 caps live overshoot at 99 | live_overshoot_is_capped_at_99 |
| 802 never paused while the live counter advances | never_paused_while_the_live_counter_advances |
| 814 still paused when the live counter freezes | paused_when_the_live_counter_freezes |
| 825 falls back to ACF when monitor undefined | falls_back_to_the_acf_when_the_monitor_has_no_reading |
| 834 ignores the monitor on a bottle poll | the_monitor_is_ignored_on_a_bottle_poll |
| 876 bridge: flips installed, reports finishing not done | install_once_complete::bridge_reports_finishing_not_done |
| 891 bridge: neither toast | bridge_fires_neither_toast |
| 897 261031-ihs installer finalized first: no status | bridge_finalized_installer_sends_no_status_but_still_flips |
| 913 261031-ihs poller first still finishing | bridge_marker_unset_or_cleared_shows_finishing |
| 924 261031-ihs cleared marker shows finishing | bridge_marker_unset_or_cleared_shows_finishing (the marker itself is a loop/registry flag, passed in as `bridge_finalized`) |
| 934 261031-ihs marker per appId | stays TS / loop plan: marker storage is registry state, not the step |
| 949 GAME-02 no notify on downloading | install_once_progress::sends_installing_when_downloading (asserts 0 notifies) |
| 964 1026 emits steam-waiting-for-restart on native handoff | native_handoff_at_1026_emits_waiting_context_and_the_native_notify |
| 1031 bottle 1026 -> incomplete, stop, no context/notify | bottle_1026_marks_incomplete_before_done_and_stops |
| 1064 bottle at StateFlags 4 installed first tick | install_once_complete::bottle_install_event_carries_the_bottle_source_for_the_windows_platform |
| 1077 native handoff at 1026 waiting + native notify | install_once_progress::native_handoff_at_1026_emits_waiting_context_and_the_native_notify |
| 1096 bridge 1026 not converted to incomplete | bridge_1026_is_not_converted_to_incomplete |
| 1122 restart-Steam notify on installed fast path | install_once_complete::native_handoff_fast_path_fires_the_restart_steam_notice |
| 1150 macNativeRoute StateFlags 4: finished, not restart | mac_native_route_fires_finished_and_not_restart_steam |
| 1175 second startInstallPolling carrying macNativeRoute upgrades the poll | stays TS / loop plan (registry reuse) |
| 1198 macNativeRoute at 1026 keeps waiting and hint | install_once_progress::mac_native_route_at_1026_keeps_waiting_and_the_restart_hint |
| 1220 no restart notify for an OFF-path poll | install_once_complete::off_path_poll_fires_no_restart_steam_notice |
| 1246 skip notice names the depot via the options object | skipped_depot_notice_names_the_depot_in_the_params_without_a_count_key |
| 1276 interpolation options never carry `count` | skipped_depot_notice_names_the_depot_in_the_params_without_a_count_key |
| 1300 several depots joined comma-separated | several_skipped_depots_join_into_one_comma_separated_value |
| 1323 all three notices in one tick | all_three_notices_fire_in_one_confirmed_installed_tick |
| 1354 skip notice at most once | skip_notice_fires_at_most_once_per_poll |
| 1384 silent when no depot skipped | no_skip_notice_when_nothing_was_skipped |
| 1411 silent on an OFF-path poll | skip_notice_independent_of_the_restart_flag + off_path_poll_fires_no_restart_steam_notice |
| 1438 OFF-path 1026 advancing bytes: normal progress | install_once_progress::no_waiting_notice_for_an_off_path_poll_at_1026 |
| 1497 cold-start tick of OFF-path 1026 never flashes waiting | cold_start_tick_of_an_off_path_1026_poll_never_flashes_waiting |
| 1517 StateFlags 1042 normal progress | state_flags_1042_is_an_ordinary_download_regardless_of_handoff |
| 1542 no context on plain active download | plain_active_download_sets_no_context |
| 1558 restart notification exactly once at 1026 | waiting_notice_fires_exactly_once_across_ticks |
| 1583 no waiting notification for an OFF-path poll at 1026 | no_waiting_notice_for_an_off_path_poll_at_1026 |
| 1601 no waiting notification for a non-1026 download | a_non_1026_active_download_fires_no_waiting_notice |
| 1618 bottle install platform Windows even when isMac | install_once_complete::bottle_install_event_carries_the_bottle_source_for_the_windows_platform (the event carries `source`; the handler derives the platform) |
| 1655 win32-layout bottle still Windows | same test (the root layout is irrelevant to the event; the layout is `read_acf_state` territory, plan 04) |
| 1687 D-15 hand-written 1026 bottle manifest reads installing | install_once_progress::hand_written_1026_bottle_manifest_reads_as_installing_via_the_bottle_poller |

Also not a table row (not matched by the `it(` count): the `it.each` at 769 (never starts the monitor for bottle / native handoff polls) stays TS / loop plan; step-level the_monitor_is_ignored_on_a_bottle_poll covers the read side.

Added beyond the TS: hold handshake (`eligible_poll_asks_the_loop_for_the_hold_probe_without_side_effects`, `ineligible_polls_never_ask_for_the_probe`, `holding_keeps_the_poll_waiting_and_notifies_once`, `a_release_completes_with_the_hold_effects_first`), hold release on rewrite (`rewritten_manifest_releases_a_holding_poll`), manifest-gone (`manifest_gone_while_holding_ends_the_hold_after_the_tolerance`, `absent_*`, `unknown_state_skips_the_tick`), update delegation (3), Mac arch follow-up (4), `delegated_download_carries_managed_by_steam`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hold effects lost when the probe released the hold**
- **Found during:** Task 2 test run (`a_release_completes_with_the_hold_effects_first`)
- **Issue:** `should_hold` sets the poll to Released on a release; the re-entered step then judged the poll ineligible and dropped `obs.hold.effects` (the record clear and log).
- **Fix:** the installed arm honours a supplied `obs.hold` regardless of current eligibility.
- **Files modified:** src/install_once.rs
- **Commit:** 474f5488c

### Notes

- `InstallObservation` has no `native_in_flight` (see decisions) and carries `update_fields`, `install_app_outcome` and `seq` (needed for delegation and the state events).
- Manifest-gone-while-holding also emits `ClearHoldRecord`, standing in for `stopInstallPolling`'s clear of a holding poll's persisted record.

## Threat mitigations

T-80-43: `size_on_disk` and `buildid` pass through as strings in the `installed` event. T-80-44: the Mac arch probe is a separate off-tick future bounded by plan 10's `PROBE_TIMEOUT`. T-80-45: completion is a `Transition`, queued by the outbox until acked or replayed.

## Known Stubs

None.

## Self-Check: PASSED

install_once.rs, tests/install_once_progress.rs and tests/install_once_complete.rs exist; commit 474f5488c exists.

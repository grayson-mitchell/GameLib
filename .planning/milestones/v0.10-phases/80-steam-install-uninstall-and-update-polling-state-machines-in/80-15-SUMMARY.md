---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 15
subsystem: steam-polling
tags: [rust, steam, install-poll, loop]
requires: [80-06, 80-07, 80-09, 80-12, 80-14]
provides:
  - "install_loop::InstallPolls: start_install, stop_install, cancel_delegated, status, holding_app_ids, set_native_in_flight, set_bridge_finalized, set_pending_rearm, reconcile_ran_during_rearm, snapshot_poll"
  - "outbox::apply_effects now returns the ack reply of every Transition"
  - "Registry::active_app_ids(kind)"
affects: [80-16 (rearm uses set_pending_rearm / set_reconcile_ran_during_rearm / start_install restored hold), 80-17 (dispatch arms)]
tech-stack:
  added: []
  patterns: ["generation-tagged poll slots so a stopped task never touches a newer poll", "poll map locked only for sync work, never across an await"]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/src/outbox.rs
    - src-tauri/crates/gamelib-steampoll/src/registry.rs
decisions:
  - "State owner: a new Clone struct InstallPolls (Registry + Outbox + HoldSink + DownloadMonitor + Platform + shared state) rather than state inside Registry or a OnceLock. The API is methods on it (plan wrote free functions taking Registry; the extra collaborators made methods the honest shape)."
  - "ActiveInstall of an appId lives in InstallPolls.polls with a generation; the Registry keeps the task token and guard. stop_install removes the slot, clears the hold record if holding, stops the monitor, cancels the token."
  - "apply_effects returns Vec<AckReply> (one per Transition) so the loop can read macArchCheck (carry-forward 2). Existing callers ignore it."
  - "InstallApp outcome (carry-forward 3) is awaited inside the update tick after effects are applied and fed to the next tick as install_app_outcome; HELPER_TIMEOUT bounds it and Delay prevents overlap."
  - "Hold handshake (carry-forward 1): the loop runs should_hold on a clone of poll.hold, writes back only the five fields should_hold owns, then re-calls install_step with obs.hold."
  - "A poll cancelled mid-tick (stop, cancel_delegated, shutdown) applies no further effects; a shutdown cancel leaves a holding poll's record on disk so boot re-arm still finds it."
  - "Title for steamRequestNotice and notifications comes from ActiveInstall.title, refreshed from every ack (R2)."
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-16
---

# Phase 80 Plan 15: install loop Summary

`InstallPolls` ports `installPolling.ts` and `installStop.ts`: one tokio task per appId on a 3 s interval with `MissedTickBehavior::Delay`, the TS start / upgrade rules field by field, the MAX_TICKS (holding-release and awaitingUpdate terminal done), GRACE_TICKS, MANIFEST_GONE_TICKS and STEAM_REQUEST_NO_ACTIVITY_TICKS rules, and the query surface TS used to read from `activePolls`.

## Commits

- 9f1b8fe73: install_loop.rs, tests/install_loop.rs, outbox.rs (reply return), registry.rs (active_app_ids). Tasks 1 and 2 share one file and were committed together (the plan allowed this).

## Verification

`cargo test -p gamelib-steampoll` green (install_loop 42); `cargo clippy -p gamelib-steampoll --all-targets -- -D warnings` clean; `cargo fmt -p gamelib-steampoll --check` clean (rustfmt is the formatter; no prettier parser for `.rs`). A 7200-tick test runs under paused time and asserts the MAX_TICKS stop (install silent, update sends one terminal done); a second one starts a hold at MAX_TICKS-1 and asserts the release-then-installed order.

## Carry-forward from 80-14 / 80-06

1. hold_probe re-entry: done in `tick` (tests: `the_hold_probe_is_re_entered_...`, `a_running_steam_holds_the_poll_and_persists_the_record`).
2. Ack reply of the Installed transition: `apply_effects` returns it; `spawn_mac_arch` runs `run_mac_arch_followup` off-tick only when `wants_mac_arch_probe` (test `the_mac_arch_probe_runs_off_tick_only_when_the_ack_asks_for_it`).
3. InstallApp outcome fed back as `install_app_outcome` (test `the_install_app_outcome_feeds_back_into_the_next_update_tick`).
4. Monitor start/stop and poll upgrade cases (80-06): start on register and on upgrade when eligible (macOS, native, not handoff), stop on stop and when an upgrade ends eligibility. The monitor tests assert the pgrep spawn (start) for each eligibility case; the nettop child kill on stop is covered by `monitor.rs` tests (plan 06), not re-driven here.

## Mapping: library.installPolling.test.ts (28 cases)

| TS case (line) | Rust test |
| --- | --- |
| 262 twice creates one interval | start_twice_registers_one_poll |
| 270 stop clears the entry, new start registers | stop_clears_the_entry_so_a_new_start_registers_again |
| 283 CR-01 done after grace | cr01_done_after_the_grace_window_when_no_manifest_appears |
| 307 fresh poll keeps installAppRetry | fresh_poll_keeps_install_app_retry_on_awaiting_update |
| 320 upgrade keeps installAppRetry | upgrade_keeps_install_app_retry_on_awaiting_update |
| 337 no installAppRetry key | options_without_install_app_retry_leave_none |
| 371 update poll sends done at the cap | an_update_poll_sends_done_when_the_cap_stops_it |
| 384 install poll at the cap stays silent | an_install_poll_at_the_cap_stays_silent_and_stops_after_7200_ticks |
| 406 Test A live download survives grace | test_a_live_native_download_survives_the_grace_window |
| 443 Test B no live download stops | cr01_... + the tail of test_a (mirror cleared, next tick stops) |
| 474 Test C handoff upgrades | test_c_handoff_start_upgrades_the_poll_and_keeps_one_task |
| 522 Test D bare call keeps the flag | test_d_a_bare_call_never_clears_the_handoff_flag |
| 617 Test E bottle retarget reaches installed | test_e_bare_native_poll_upgraded_by_the_bottle_handoff_reaches_installed + retarget_resets_the_per_root_baselines |
| 641 Test F source without handoff | test_f_source_without_handoff_never_retargets |
| 665 Test G handoff without source | test_g_handoff_without_source_never_resets_a_bottle_poll |
| 704 D1 delegated survives grace, notice after 40 | d1_a_delegated_poll_survives_grace_then_stops_with_an_in_app_notice |
| 761 D2 manifest gone | d2_stops_after_manifest_gone_ticks_but_not_after_one_absent_tick |
| 793 D3 absent, downloading, installed | d3_absent_then_downloading_then_installed_stops_via_the_installed_branch |
| 830 VFQ-1 downloading disarms the timeout | vfq1_a_manifest_that_stays_downloading_disarms_the_no_activity_timeout |
| 856 VFQ-2 managedBySteam at registration | vfq2_a_delegated_poll_flags_managed_by_steam_at_registration |
| 871 VFQ-3 upgrade counts from the upgrade | vfq3_upgrading_a_bare_poll_to_delegated_counts_the_window_from_the_upgrade |
| 907 VFQ-4 cancelDelegatedInstall | vfq4_cancel_delegated_stops_a_delegated_poll_with_one_done_and_false_otherwise |
| 940 PVK-3 increasing seq | pvk3_two_give_ups_carry_strictly_increasing_seq |
| 962 PVK-4 isDelegatedInstallPolling | pvk4_status_reports_delegated_only_for_a_live_delegated_poll |
| 983 D4 percent + managedBySteam | d4_d5_only_a_delegated_download_flags_managed_by_steam (the percent is install_once_progress territory, plan 14) |
| 1028 D5 non-delegated never flags | d4_d5_only_a_delegated_download_flags_managed_by_steam |
| 1054 source bottle polls the bottle root | bottle_source_polls_the_bottle_root_not_the_native_one |

Added beyond the TS: bad appId rejection, adopted-by-Steam upgrade releasing the hold, the cap releasing a holding poll, stop clearing a holding poll's record (and not a non-holding one), hold probe re-entry both ways, bridge-finalized mirror, Mac arch gating, monitor eligibility (4 platforms/sources), the no-overlap Delay test (slow runner, one in-flight probe), pending-rearm / reconcile flag, uninstall appIds in status. Monitor tests from installPollOnce.test.ts that 80-14 deferred here (752, 759, 777, 769 `it.each`, 1175) are covered by the monitor and upgrade tests above.

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

- `start_install` returns `Result<(), String>` (Err only for a bad appId, T-80-46) and is a method; the plan sketched a free function over `Registry`.
- `PollOptions` carries `intervalMs` (default 3000, clamped to >= 1 ms) and every other TS field as `Option` so "absent" and "false" stay distinguishable for the upgrade rules.
- The retarget race (a tick that read the old root while an upgrade retargeted) is handled by skipping that tick when the source changed between observe and step.

## Threat mitigations

T-80-46: appId must be 1 to 10 ASCII digits; roots are only read. T-80-47: one task per appId (a second start is an upgrade) and the MAX_TICKS cap. T-80-48: Delay missed-tick behaviour, tested with a 10 s probe against a 3 s period.

## Known Stubs

None.

## Self-Check: PASSED

install_loop.rs, tests/install_loop.rs exist; commit 9f1b8fe73 exists.

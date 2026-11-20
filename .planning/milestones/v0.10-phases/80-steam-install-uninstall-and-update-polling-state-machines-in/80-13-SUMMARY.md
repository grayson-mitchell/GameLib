---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 13
subsystem: steam-polling
tags: [rust, steam, uninstall-poll, d-11]
requires: [80-04, 80-05, 80-09]
provides:
  - "uninstall::uninstall_step: pure uninstall tick (UninstallPoll, UninstallObservation)"
  - "uninstall::start_uninstall / stop_uninstall: one 3 s Delay task per appId"
  - "Registry::next_event_seq, effects::copy_source_label"
affects: [80-14 .. 80-33]
tech-stack:
  added: []
  patterns: [pure step plus observation-gathering loop; probe results pre-read and filtered in the step]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steampoll/src/uninstall.rs
    - src-tauri/crates/gamelib-steampoll/tests/uninstall.rs
    - src-tauri/crates/gamelib-steampoll/src/effects.rs
    - src-tauri/crates/gamelib-steampoll/src/registry.rs
decisions:
  - "The step owns the tick counter, MAX_TICKS cap and the no-activity give-up (TS order: cap, poll once, give-up), so the loop only gathers observations and applies effects"
  - "Survivor roots are pre-read for all other roots and filtered in the step in probe order (native, bottle, bridge); the first Unknown before a survivor defers, as the lazy TS loop does. An unprovisioned bottle/bridge root reads as Absent (TS caught the resolve error as no survivor)"
  - "bridgeUninstalled is emitted when a bridge-source uninstall completes with no survivor (the TS poller itself never called markBridgeGameUninstalled); order is forcedWindowsViaBottleCleared, bridgeUninstalled, uninstalled"
  - "bridgeAuthoritative is a start arg (not re-read per tick); the ack's value is not visible to the loop through apply_effects"
  - "Survivor notice labels come from copy_source_label (English fallbacks); NotifyText params are plain strings so the per-source i18n key is not looked up"
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-16
---

# Phase 80 Plan 13: uninstall poll Summary

`uninstall_step` ports `pollUninstallOnce` and the `setInterval` body of `startUninstallPolling`; `start_uninstall` runs it on a 3 s `MissedTickBehavior::Delay` interval (first tick one period out, as `setInterval`), one task per appId.

## Commits

- b843403b2: uninstall.rs, tests/uninstall.rs, plus `copy_source_label` (effects.rs) and `next_event_seq` (registry.rs). Both tasks share the two files and were committed together.

## Verification

`cargo test -p gamelib-steampoll` all green (28 tests in `--test uninstall`); `cargo clippy --all-targets -D warnings` clean; `cargo fmt --check` clean (rustfmt is the formatter; no prettier parser for `.rs`).

## Mapping: library.uninstallPolling.test.ts

| TS case | Rust test |
| --- | --- |
| flips the badge + done when manifest absent | absent_native_completes_with_uninstalled_event_and_done_continuation, absent_manifest_completes_state_event_then_done_then_notify |
| 0x800 reports uninstalling | present_with_0x800_reports_uninstalling_and_marks_seen |
| A-10 downloading manifest reports uninstalling | downloading_manifest_also_reports_uninstalling |
| does not flip while fully installed | fully_installed_without_bit_does_not_flip_or_report |
| GAME-03 notify on absent / not while present | absent_native_completes_... (notify.uninstalled), fully_installed_without_bit_... |
| rejected manifest read is not an absence | unknown_read_is_not_a_confirmed_absence |
| survivor root read failure defers (WR-01) | survivor_root_unknown_defers_completion |
| R1 bottle absent clears forced verdict | bottle_absent_full_uninstall_orders_cleared_then_uninstalled |
| R1b bridge absent clears forced verdict | bridge_absent_clears_verdict_and_emits_bridge_uninstalled_before_uninstalled |
| R2 native absent does not clear | native_absent_does_not_clear_forced_verdict |
| R3 cancelled bottle uninstall does not clear | bottle_still_present_does_not_clear_forced_verdict |
| R4 clear survives a library miss | bottle_absent_clears_forced_verdict_first_even_when_deferring (clear is independent of the entry; entry-miss is sidecar-side) |
| bottle removed, native survives | bottle_removed_native_survives, bottle_removed_with_native_survivor_reports_survivor_event |
| native removed, bottle survives (notice labels) | survivor_notice_names_both_copies_with_labels |
| native removed, only bridge survives | native_removed_only_bridge_survives_uses_probe_order |
| bridge removed, native survives | bridge_removed_native_survives_no_bridge_uninstalled_event |
| bridge-authoritative: native not a survivor | bridge_authoritative_title_ignores_native_copy |
| neither root survives (regression guard) | absent_native_completes_... |
| start twice creates one interval | start_twice_registers_one_poll_and_stop_is_idempotent |
| stop clears the entry, new interval can register | start_twice_registers_one_poll_and_stop_is_idempotent |
| no-activity window notifies, badge unflipped | no_activity_for_window_gives_up_with_done_and_notice, no_activity_window_gives_up_with_shared_notice_seq |
| VFQ-5 active uninstalling disarms the window | active_uninstall_disarms_the_no_activity_window, active_uninstalling_disarms_the_loop_give_up |
| VFQ-6 absent never fires the notice | absent_tick_completes_and_never_fires_the_no_activity_notice |

Added beyond TS: safety_cap_stops_with_no_state_change, first_survivor_wins_by_probe_order, rejects_a_non_numeric_app_id, uninstalling_then_absent_over_ticks.

## Deviations from Plan

**1. [Rule 3 - Blocking] Registry::next_event_seq added.** State events need a monotonic per-process seq and the registry only had the notice counter. Added a separate counter (registry.rs). Not in the plan's files_modified.

**2. [Rule 1 - Bug] Continuation::Uninstalled passed raw source names as notice params.** The TS uses `copySourceLabel`. Added `effects::copy_source_label` and mapped both params (effects.rs). The existing outbox test only checks ordering and still passes.

**3. [Rule 1 - Bug] Unprovisioned bottle/bridge root read as Unknown deferred completion forever.** Loop now reads an unprovisioned candidate root as Absent (TS caught the resolve error and treated it as no survivor).

Also noted: the no-activity give-up applies to every uninstall poll (the TS has no steam-requested guard), so it was ported unconditionally; the plan text says "Steam-requested only".

## Known Stubs

None.

## Self-Check: PASSED

uninstall.rs, tests/uninstall.rs exist; commit b843403b2 exists.

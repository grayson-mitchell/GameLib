---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 16
subsystem: steam-polling
tags: [rust, steam, boot-rearm, restart-hold]
requires: [80-07, 80-15]
provides:
  - "rearm::rearm_persisted_holds(&InstallPolls, &SidecarProfile) -> RearmOutcome { dropped, armed }"
  - "InstallPolls accessors: native_in_flight, platform, registry, outbox"
affects: [80-21 (shell spawns the rearm at boot), 80-17 (dispatch)]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/rearm.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/rearm.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
decisions:
  - "Signature takes &InstallPolls (not Registry) because the rearm needs the pending set, the in-flight mirror, start_install and the outbox; the Registry, runner and clock are reached through it."
  - "rearmSettled goes through apply_effects (a Transition), so it is sent when READY and queued otherwise (D-09)."
metrics:
  tasks: 1
  files: 3
  completed: 2026-11-16
---

# Phase 80 Plan 16: boot rearm Summary

`rearm_persisted_holds` ports `rearmPersistedSteamRestartHolds`: records are read from the profile's hold store, all marked pending before any await, live Steam pids and start tokens probed once, `decide_rearm` arms, drops or keeps each, and an armed record starts a native-handoff install poll with `restoredSteamHold {pids, startTicks = floor((now - recordedAt)/3000)}` and an empty title. Steam root is `defaultSteamPath` from the profile, else `discover_default()`. No sidecar is needed. When records dropped and a status query consulted the pending set, `rearmSettled{needsReconcile:true}` is sent.

Commit: 60fae89b1.

## Verification

`cargo test -p gamelib-steampoll` green (rearm 13); clippy `-D warnings` clean; `cargo fmt --check` clean (rustfmt is the formatter; no prettier parser for `.rs`).

## Mapping: library.resume.test.ts

| TS case (line) | Rust test |
| --- | --- |
| 412 re-arms for the same Steam process | re_arms_for_the_same_steam_process_with_the_restored_hold (the later poll-release half is hold/install_loop territory, plans 07 and 15) |
| 460 differing start token | drops_on_a_differing_start_token_pid_reuse |
| 470 Steam not running | drops_when_steam_is_not_running |
| 477 record older than cap | drops_a_record_older_than_the_safety_cap |
| 487 it.each downloading / absent | drops_when_the_native_manifest_is_downloading, drops_when_the_native_manifest_is_absent |
| 504 KEEPS on unknown manifest (WR-01) | keeps_the_record_when_the_manifest_state_is_unknown |
| 523 native install in flight | drops_when_a_native_install_is_already_in_flight |
| 543 inconclusive probe keeps record | an_inconclusive_probe_arms_nothing_and_keeps_the_record |
| 558 zero records, no probe | zero_records_spawn_no_probe_at_all (asserts no ProcessRunner call) |
| 564 fails closed while pending, reconcile once on drop | fails_closed_while_pending_then_sends_rearm_settled_once_on_drop |
| 313-410 persist + clear (7 cases) | not this plan: poll-side, covered by tests/hold.rs and tests/install_loop.rs |
| 231/312 resumeInterruptedSteamInstall | stays TS (user-triggered, plan 22) |

Added: an already-active install poll drops the record; rearmSettled queues until READY and is not sent when no status query consulted the pending set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Accessors on InstallPolls** - the rearm needs the in-flight mirror, platform, registry and outbox, which were private. Added four read-only accessors in install_loop.rs (not in the plan's file list).

## Threat mitigations

T-80-49: records come through `parse_record` and are armed only when pid and start token match the live process. T-80-50: probes are bounded by the hold module's timeouts; the function is async and spawned by the shell, never blocking setup.

## Known Stubs

None.

## Self-Check: PASSED

rearm.rs, tests/rearm.rs exist; commit 60fae89b1 exists.

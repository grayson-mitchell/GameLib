---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 08
subsystem: steam-polling
tags: [rust, steam, running-poll, windows-registry]
requires: [80-01]
provides:
  - gamelib_steamfiles::readers::{read_windows_running_app_id, RegistryDword, RealRegistry, running_app_id_from}
  - gamelib_steampoll::running::{read_running_app_id, RunningPoll, ClaimId, Probe}
affects: [80-17, 80-22]
key-files:
  created:
    - src-tauri/crates/gamelib-steamfiles/tests/running_app_id_registry.rs
    - src-tauri/crates/gamelib-steampoll/tests/running.rs
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/readers.rs
    - src-tauri/crates/gamelib-steampoll/src/running.rs
decisions:
  - "The registry seam trait is pub, not pub(crate): the plan's test file is an integration test, which cannot see crate-private items"
  - "strict has no transport to reject in Rust; it errors only when the profile home is unknown (empty), otherwise a registry.vdf read keeps the 0-on-failure result"
  - "RunningPoll takes a Probe closure (RunningPoll::for_platform builds the production one) so tests script the reads"
  - "Claim drain deadlines use Registry::clock().now_ms() (FakeClock in tests); ticks use tokio time (paused in tests)"
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-16
---

# Phase 80 Plan 08: Running-app poll in Rust Summary

RunningAppID is read natively on Windows (`RegGetValueW`, `RRF_RT_REG_DWORD`, no reg.exe) with the old 0-on-missing / 0-on-error mapping, and the 5 s running poll with launch-watch claims, the 20 s drain and the handed-back republish now lives in `gamelib-steampoll::running`.

## Commits

- 73599c80b: native Windows RunningAppID read and seam tests
- 2390eb2e7: doc comment wording (acceptance grep for `reg.exe` is 0)
- 7dc85394f: running poll and probes

## Verification

`cargo test -p gamelib-steamfiles` and `-p gamelib-steampoll` green (running: 24, registry: 4), clippy `-D warnings` and `cargo fmt --check` clean for both crates. The Windows leg was checked directly: `cargo check` and `cargo clippy --all-targets --target x86_64-pc-windows-msvc` pass for steamfiles, and `cargo check` for steampoll, so the cfg(windows) registry test compiles. Its execution is on the Windows CI leg only (it writes and deletes `HKCU\Software\GameLibTest`).

## Test mapping

### library.runningPoll.test.ts (tests/running.rs, plus the steamfiles registry test)

| TS case | Rust test |
| --- | --- |
| win32: parses REG_DWORD 0x1b58 via reg.exe with the 2000 ms bound | a_present_value_is_returned (seam), win32_reads_natively_and_spawns_nothing, cfg(windows) a_dword_written_to_a_test_subkey_reads_back (reg.exe and its bound no longer exist) |
| win32: 0 when reg.exe cannot be spawned | a_missing_value_is_zero, an_error_is_zero, cfg(windows) a_value_missing_under_the_steam_key_reads_zero_through_the_real_api |
| darwin: parses registry.vdf, no runner call | darwin_parses_registry_vdf_and_makes_no_runner_call |
| darwin: 0 for absent / unparsable / keyless | darwin_is_zero_for_absent_unparsable_or_keyless_registry |
| linux: VDF value, no spawn | linux_returns_the_vdf_value_without_spawning |
| linux: reaper scan (ps, 1000 ms) only when VDF is 0 | linux_falls_back_to_the_reaper_scan_only_when_the_vdf_is_zero (+ linux_reaper_scan_is_zero_on_no_match_timeout_or_nonzero_exit) |
| readRunningAppIdOrThrow answers like readRunningAppId on success | strict_propagates_an_unattemptable_read_and_matches_non_strict_otherwise |
| (OrThrow rejects when the read rejects) | same test (the unattemptable-read arm; see decisions) |
| createRunningPoll: 0 to X playing, no done | playing_when_zero_to_x_and_no_done_without_a_prior_game |
| X to 0 done | done_when_x_to_zero |
| unchanged: nothing | nothing_when_unchanged |
| X to Y: done then playing | done_for_the_old_id_then_playing_for_the_new_on_x_to_y |
| start schedules one interval, idempotent, stop clears and resets | start_is_idempotent_one_task_and_stop_resets_last_id, the_interval_is_five_seconds_and_does_not_fire_at_start |
| default unref clock timer (no keepAlive) | n/a in Rust: the task runs on the registry runtime and the guard drops it on cancel; no keepAlive concept |
| never overlaps (Pitfall 7) | a_tick_while_the_probe_is_pending_is_skipped (plus Delay tick behavior in start) |
| H1 hold silent, lastAppId tracks | h1_hold_sends_nothing_while_held_and_last_id_still_tracks |
| H2 release(true) after seen | h2_release_true_after_the_poller_saw_x_is_silent_then_playing_again |
| H3 release(true) before seen | h3_release_true_before_the_poller_saw_x_lagging_reads_are_silent |
| H4 drain deadline | h4_drain_deadline_sends_one_playing_then_done_at_x_to_zero |
| H5 release(false) | h5_release_false_sends_playing_now_when_the_poller_already_reads_x |
| H6 replace claim, stale release no-op, stop clears | h6_a_second_hold_replaces_the_claim_and_a_stale_release_is_a_noop |
| C1 poller first [playing, done] | c1_poller_first_one_playing_and_one_done_for_a_launch (D-15 smoke 4: exactly one of each) |
| C2 watch first | c2_watch_first_the_watch_owns_the_frames_and_the_poller_adds_none (poller side only) |
| C3, C4, C6, C8, C9 (win32 launch-watch scenarios) | stay TS: they exercise the launch watch (not ported here); the poller-side behavior they rely on is H1-H6 and C7 |
| C7 self-heal after drain | c7_self_heal_a_premature_watch_done_is_repaired_after_the_drain |
| registry.vdf on the rust flag: macOS / Linux read through steamfiles, 0 on transport reject | darwin_ and linux_ tests above call steamfiles directly; no transport remains. The TS-side rustInvoke wrappers stay with the TS wrapper plan (22) |
| inFlight guard while the read is pending | a_tick_while_the_probe_is_pending_is_skipped |

Added: release_true_twice_does_not_extend_the_drain.

### runningFromFolder.test.ts

Every `it` (folder-match, ps/PowerShell parsers, `isAnyProcessRunningFromFolder` and its argv/timeout/rejection cases, the real-process finds) stays TS: it tests `runningFromFolder.ts`, a TS caller that is not part of the read and is not moved by this plan. None needs a Rust port here.

## Deviations from Plan

**1. [Rule 3 - Blocking] Registry seam trait is `pub`** The plan said `pub(crate)`, but its own test file is an integration test; added `#[doc(hidden)] real_hkcu_dword` for the Windows test too. Clippy `result_unit_err` allowed on the `Result<_, ()>` seam the plan specified.

**2. Windows test uses `RegCreateKeyW`** (`RegCreateKeyExW` is behind a windows-sys feature that is not enabled; the plan said no new dependency or features).

**3. strict semantics** See decisions: Rust has no rejecting transport, so strict errors on an unknown profile home only.

## Known Stubs

None. `running.rs` is not yet called by the shell or dispatch (plan 17/22 wire ops), which is per the plan.

## Threat Flags

None. T-80-23 (only a number is shown), T-80-24 (no child process on Windows, grep clean), T-80-25 (one registry task, Delay ticks, in-flight guard that resets on cancel) mitigated.

## Self-Check: PASSED

Files and commits 73599c80b, 2390eb2e7, 7dc85394f verified present.

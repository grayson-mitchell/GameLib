---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 07
subsystem: steam-polling
tags: [rust, steam, restart-hold, profile, cachestore]
requires: [80-01]
provides:
  - gamelib_steampoll::profile (Platform, SidecarProfile: user_data, config_path, restart_hold_store_path, language(), default_steam_path())
  - gamelib_steampoll::hold (RestartHoldRecord, parse_record, HoldStore + HoldSink impl, decide_rearm, HoldState/HoldPoll, should_hold, release_hold, list_steam_client_pids, read_steam_process_start_tokens, restart_to_finish_notification)
affects: [80-09, 80-11, 80-16, 80-17, 80-22]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/tests/profile.rs
    - src-tauri/crates/gamelib-steampoll/tests/hold.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/profile/app-paths.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/restart_hold/ts-written.json
    - src/backend/__tests__/steamPollProfileFixtures.test.ts
  modified:
    - src-tauri/crates/gamelib-steampoll/src/profile.rs
    - src-tauri/crates/gamelib-steampoll/src/hold.rs
decisions:
  - "language and defaultSteamPath are read from config.json's defaultSettings object at call time (where GlobalConfig writes them), never cached"
  - "On disk the CacheStore nests timestamps as {\"__timestamp\": {appId: text}} (dot-notation), plus an __internal__ version envelope; Rust writes that layout, also reads and removes a flat __timestamp.<appId> key, and preserves every unrelated key"
  - "A store file Rust cannot parse is never overwritten (record/clear skip and log appId + op); TS would reset it, Rust refuses to destroy user state"
  - "should_hold returns (bool, Vec<Effect>) and takes a still_current closure for the 'poll stopped during the probe' check, since Rust has no activePolls map to compare against"
  - "HoldPoll (the poll-side fields) is defined in hold.rs for the install loop to embed"
metrics:
  tasks: 2
  files: 7
  completed: 2026-11-16
---

# Phase 80 Plan 07: Sidecar profile and restart hold Summary

Rust now locates the sidecar's userData, config.json and `steam_restart_hold` store before the sidecar exists (proven against TS-generated fixtures for darwin, win32 and linux), and owns the restart hold: record parsing, the persisted store in the shared CacheStore layout, the re-arm decision, the hold/release decision with its 10 s probe gap and fail-open rules, and the pgrep/tasklist/ps/PowerShell probes.

## Commits

- 909434907: SidecarProfile and TS-generated fixtures
- ee02ca57b: restart hold store, decisions and probes

## Verification

`cargo test -p gamelib-steampoll` green (profile 4, hold 35; whole crate passes), clippy `-D warnings` clean, `cargo fmt --check` clean, Jest fixture test green (2), prettier clean on the test and both fixtures (none are prettier-ignored). Acceptance greps: 5 hold functions, `STEAM_HOLD_PROBE_MIN_INTERVAL_MS` used, `pub fn language` and `pub fn default_steam_path` present.

The Jest test compares parsed JSON (not text), so prettier may reformat the checked-in fixtures. Regenerate with `UPDATE_STEAMPOLL_GOLDENS=1`, then `prettier --write` the two fixture files.

## Test mapping

### steamRestartHold.test.ts (tests/hold.rs)

| TS case | cargo test |
| --- | --- |
| round-trips a record and clears it | round_trips_a_record_and_clears_it |
| read returns undefined for non-object / missing pids / empty pids / non-integer pid / non-string token / non-finite recordedAt / non-string depots | read_rejects_invalid_records (plus zero, negative, empty token, non-number recordedAt; the non-finite case arrives as JSON null) |
| list returns only valid pairs | list_returns_only_valid_pairs |
| decide: unknown when livePids undefined | decide_unknown_when_live_pids_is_none |
| decide: drops when expired | decide_drops_when_expired |
| decide: drops when no recorded pid is live | decide_drops_when_no_recorded_pid_is_live |
| decide: unknown when tokens unavailable | decide_unknown_when_tokens_unavailable |
| decide: drops on differing token | decide_drops_on_a_differing_token_pid_reuse |
| decide: arms with only the matching pids | decide_arms_with_only_the_matching_pids |

### library.restartHold.test.ts (decision-level cases in tests/hold.rs)

| TS case (line) | cargo test or owner |
| --- | --- |
| holds a native handoff ... (292) | holds_a_native_handoff_and_records_pids_with_tokens (hold decision, record effect, no clear); "no is_installed push / no done / no toast / poll alive" assertions belong to plans 09/11 (install loop) |
| keeps holding while the SAME process is alive (317) | keeps_holding_while_the_same_pid_is_alive_and_does_not_rewrite (the per-tick waiting-context re-emit is plans 09/11) |
| re-probes at most once per probe gap (337) | reprobes_no_more_often_than_the_probe_gap |
| releases once the recorded process is gone (355) | releases_and_clears_the_record_once_the_recorded_pid_is_gone (the "no repeated toast" assertion: plans 09/11) |
| releases when Steam was RESTARTED (386) | releases_when_steam_was_restarted_a_different_pid |
| inconclusive re-probe keeps holding (402) | an_inconclusive_reprobe_keeps_holding |
| fail-open: Steam NOT running at finalize (418) | fail_open_when_steam_is_not_running_at_finalize |
| adoptedBySteamClient never probes/holds (437) | an_off_path_poll_never_probes_and_never_holds covers the never-probe rule; setting `is_native_handoff` false on adoption is the install loop (plans 09/11) |
| adoptedBySteamClient on an in-flight poll releases (461) | `release_hold` is tested (release_hold_is_the_one_place_a_hold_ends); the upgrade-branch call site is plans 09/11 |
| fail-open: inconclusive FIRST probe (482) | fail_open_when_the_first_probe_is_inconclusive |
| OFF-path poll never probes (495) | an_off_path_poll_never_probes_and_never_holds |
| bottle-source handoff never holds (506) | bottle_and_bridge_sources_never_probe_and_never_hold |
| released because Steam rewrote the manifest never re-enters (524) | releases_and_clears_... (second call on a Released poll makes no spawn); the "Steam rewrote the manifest" trigger is plans 09/11 |
| 1026 -> 4 adoption not re-armed as a hold (548) | plans 09/11 (poll flow decides when `should_hold` is called) |
| resumed install with pre-existing 1026 manifest still holds (582) | plans 09/11 (sets `is_native_handoff`) |
| held poll survives the GRACE_TICKS window (614) | plans 09/11 (`seen_downloading` is set here, the grace window is the loop) |
| ends the hold when the manifest vanishes (MANIFEST_GONE_TICKS) (636) | plans 09/11 (`absent_ticks_since_seen` is reset here, counted by the loop) |
| hold reaching MAX_TICKS reports installed (656) | plans 09/11 |
| ordinary poll still stops at MAX_TICKS (674) | plans 09/11 |
| (restartHold.ts) `withoutSteamRestartHolds`, `isHoldingForSteamRestart`, `pendingSteamHoldRearm`, reconcile-ran flag | plan 16's status op, plan 22's TS wrapper (the reconcile window map stays on the TS side per R5) |

Added beyond the TS files: a_poll_stopped_during_the_probe_changes_nothing, unreadable_start_tokens_hold_without_a_record_and_warn, release_hold, restart_to_finish_notification, steamClientProcess parser and probe cases (tasklist rows, pgrep, pid-token lines, pgrep exit codes, ps/PowerShell start-token probe by platform), and the shared-file cases (reads_both_records_the_real_ts_store_wrote, record_and_clear_keep_other_keys_and_the_layout, a_new_file_carries_the_version_envelope..., a_flat_timestamp_key_is_removed..., an_unparseable_store_is_never_overwritten, the_store_file_is_private, hold_sink_records_a_valid_value...).

## Deviations from Plan

None in scope. Notes:

- The plan says "__timestamp.<appId> keys"; the real file nests them under `__timestamp` (the Jest-generated fixture shows it). Rust follows the real layout and still tolerates the flat spelling.
- `HoldPoll` and `DropReason`/`RearmDecision` names are new; the plan left the poll-side field container open.
- The pgrep lookup private to `monitor.rs` (plan 06) was not rewired to `list_steam_client_pids`: it is a darwin-only duplicate with the same argv and timeout, and touching plan 06's file was outside this plan's file list. Plan 09/21 can swap it.
- `restart_to_finish_notification` returns a `Notification` (as specified); `effects::restart_steam_notice` already builds the equivalent `Effect`.

## Known Stubs

None.

## Threat Flags

None. T-80-19 (parse_record safe-parse, invalid ignored), T-80-20 (atomic temp+rename, 0600, unparseable file never overwritten), T-80-21 (`default_steam_path` returns a string only; no deletion path here), T-80-22 (fixed programs, argv arrays, integer pids only) mitigated.

## Self-Check: PASSED

Files and commits 909434907, ee02ca57b verified present.

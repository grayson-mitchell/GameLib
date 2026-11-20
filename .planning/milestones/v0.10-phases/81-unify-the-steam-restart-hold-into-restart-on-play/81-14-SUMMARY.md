---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 14
subsystem: steam-polling
status: complete
tags: [steam, install-poll, restart-hold-removal, start-contract, frozen-parity]
requires: [81-13]
provides:
  - HandoffPoll and ActiveInstall.handoff in install_once.rs (replacing HoldPoll / .hold)
  - restart_to_finish_notification now in install_once.rs
  - install-poll start contract with no hold field on either side of the wire
  - D-14 invariant describe.each over darwin, win32, linux in games.test.ts
affects: [81-15, 81-16, 81-17]
tech-stack:
  added: []
  patterns: [deny_unknown_fields as the removal guard, wire shape kept constant until the readers go]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steampoll/src/hold.rs
    - src-tauri/crates/gamelib-steampoll/src/install_once.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/hold.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_once_progress.rs
    - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/install-handoff-1026-waiting.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/install-bottle-handoff-1026-incomplete.json
    - src/backend/storeManagers/steam/library/installRoot.ts
    - src/backend/storeManagers/steam/gameInstallDepot.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
  deleted:
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/rearm-drop-expired.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/rearm-drop-pid-reused.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/rearm-unknown-probe.json
decisions:
  - "The wire status keeps its shape until 81-17: PollStatus.holding is always empty and every install reports steamHold \"unprobed\" (the value a never-held poll reported before; the old adopted-poll value \"released\" is gone with the adopted option)"
  - "absent() in install_once.rs now only counts ticks since the manifest was seen; the manifest-gone-while-holding stop is gone, and the loop's own delegated manifest-gone rule (Phase D) is unchanged"
  - "InstallPolls.finish_slot no longer takes the poll: with no hold there is no record to clear on stop"
metrics:
  tasks: 2
  files: 16
  completed: 2026-11-18
commits: 2
plan_head_before: deb54c0207b7f4b6161c8ef8413d4b337ad56fed
plan_head_after: a2045090441af8b9a0c3da99359c7ed26e86ebe2
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 14: install poll without a hold, start contract without a hold field Summary

A native handoff install poll now runs start -> downloading -> Installed with no hold state machine, and the install-poll start options carry no hold field in Rust or TypeScript; the D-14 invariant is pinned on darwin, win32 and linux.

## Commits

- 6060f1204: feat(81-14) the install poll has no hold state machine (tracer)
- a20450904: refactor(81-14) the install-poll start contract has no hold field, pinned on every OS

## What was built

- **Task 1 (tracer).** `HandoffPoll { is_native_handoff, skipped_depots, seen_downloading, absent_ticks_since_seen }` replaces `HoldPoll`; `ActiveInstall.hold` is now `.handoff`. Deleted: `HoldState`, `HoldPoll`, `should_hold`, `release_hold` (hold.rs), `HoldOutcome`, `HoldProbeRequest`, `InstallStep.hold_probe`, `InstallObservation.hold`, every `release_hold` call (the 1026 branch, the seen-downloading release), the manifest-gone-while-holding stop, the loop's Phase C hold handshake, the MAX_TICKS hold release, the `adoptedBySteamClient` hold release and `stop()`'s record clear. `restart_to_finish_notification` moved into install_once.rs. `holding_app_ids` returns an empty Vec and each install's `steamHold` answers the constant `"unprobed"` until 81-17 removes both wire fields. hold.rs keeps the probes, `parse_record` and `HoldStore` (with its `HoldSink` impl) for 81-16; `STEAM_HOLD_PROBE_MIN_INTERVAL_MS` itself stays for 81-15. tests/hold.rs lost its `should_hold`/`release_hold` cases and keeps the probe, parse_record, decide_rearm and HoldStore cases; the notification test moved to install_once_progress.rs.
- **Task 2.** `mac_native_route`, `adopted_by_steam_client` and `restored_steam_hold` are gone from Rust `PollOptions`; `macNativeRoute`, `adoptedBySteamClient` and `restoredSteamHold` from the TS `PollOptions`; `gameInstallDepot` starts the poll with `{isNativeHandoff: true, skippedDepots}` on every OS, including after an InstallApp ok (the `isMac` import went with it). Tests: each removed key fails `PollOptions` deserialisation and answers `steampoll_install_start:bad-args` through dispatch; `describe.each(['darwin','win32','linux'])` "D-14 invariant" in games.test.ts asserts exactly one `recordAndWatchPendingAdoption` and one pending record for an unadopted install (InstallApp unused on every OS, plus non-ok outcomes on darwin), a poll whose options equal `{isNativeHandoff: true, skippedDepots: []}` and contain none of the three keys, and that InstallApp ok on darwin writes no record. Mutation check: re-adding `macNativeRoute: true` to the poll call turns all six invariant cases red.

## Frozen-stream edits (T-81-50)

With `release_hold` gone nothing emits `Effect::ClearHoldRecord`, so the Rust replays have no `file` records. Edits, all pure deletions (verified with `git diff`; prettier-clean, none prettier-ignored):

| File | Edit |
| ---- | ---- |
| `expected-ts/install-handoff-1026-waiting.json` | removed the three `{"file": {"op": "clear", "appId": "1000", "record": null}}` records (indexes 0, 3, 5); the three `steam-waiting-for-restart` status records and the one restart toast are unchanged |
| `expected-ts/install-bottle-handoff-1026-incomplete.json` | removed the one `file` clear record (index 0); the `installIncomplete` state and the `done` status are unchanged |
| `expected-ts/install-depot-skipped.json` | none needed: 81-10 left no `file` record in it |

`divergences.json` and frozen_parity.rs were not touched; frozen_parity passes with an empty diff for every shipped timeline (31, floor unchanged).

## Deviations from Plan

**1. [Rule 3 - Blocking] Three orphaned `rearm-*` expected-ts streams deleted.** The plan's acceptance grep (`"file"` in no `expected-ts/*.json`) failed on `rearm-drop-expired.json` and `rearm-drop-pid-reused.json` (one `file` record each). 81-11 (b712d819a) deleted the `rearm-*` timelines but left their frozen streams; no timeline, test or ledger entry references them (frozen_parity iterates `timelines/`, and the ledger names no rearm scenario). I removed those two and the third orphan `rearm-unknown-probe.json` (a one-line empty stream, same dead scenario) with `git rm`; shipped-timeline count stays 31. **Commit:** 6060f1204.

**2. [Plan latitude] Mac-native-route tests deleted rather than ported.** `mac_native_route_fires_finished_and_not_restart_steam` (install_once_complete) and `mac_native_route_at_1026_keeps_waiting_and_the_restart_hint` (install_once_progress) existed to show a flag that no longer exists; the same outcomes stay covered by the existing handoff tests (native source never gets the Finished-with-restart toast; the 1026 wait fires one toast). Likewise `rewritten_manifest_releases_a_holding_poll` and `manifest_gone_while_holding_ends_the_hold_after_the_tolerance` went with the hold. `absent_without_a_hold_never_stops` was renamed `absent_never_stops_the_step_itself`.

## Pre-existing reds, unchanged

`pnpm -s backend-di-ceilings` (launchWithoutSteam, NoticeStack, NativePortInfo, LaunchWithoutSteam tests), `pnpm -s find-deadcode` (NativePortDataStyle, NativePortMac), `gameinfo-narrowing-ceiling` (NativePortInfo.tsx), jest `acfUpdateReplay` and `storeKinds`: all logged in deferred-items.md, nothing from this plan. Everything else green: `cargo test -p gamelib-steampoll` (every binary), `cargo test -p gamelib-steampoll-cli` (cli 9, frozen_parity 1), `cargo test --bin gamelib-shell steampoll` (17), clippy `-D warnings` and `cargo fmt --check` clean, `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__ src/common` (10295 passed, only the two logged reds failing), `pnpm codecheck` clean, prettier clean, ESLint 0 errors.

Acceptance greps: the six removed identifiers appear in no file under `gamelib-steampoll/src`, `gamelib-steampoll-cli/src` or `src-tauri/src`; `pub struct HandoffPoll` 1; `"file"` in no `expected-ts` file; `steampoll_running_hold` in dispatch.rs 2 (the running-poll claim is untouched); the three TS option names 0 in installRoot.ts and gameInstallDepot.ts; the three snake_case names 0 in install_loop.rs. TDD: Task 1 was a deletion and rename driven by the compiler plus the frozen-parity diff as the red signal (it failed on the `file` records before the stream edit); Task 2 tests were observed to detect the regression by mutation.

## Known Stubs

None. `holding_app_ids` returning an empty Vec and the constant `steamHold` are the intentional, documented wire shape that 81-17 removes with its TS readers.

## Threat Flags

None. T-81-40: `steampoll_running_hold` and the running poll's claims are untouched (acceptance grep). T-81-41: the three fields are gone on both sides and `deny_unknown_fields` rejects them (unit and dispatch tests). T-81-50: only `file` records left the frozen streams, each edit listed above; no other record changed.

## Self-Check: PASSED

Commits 6060f1204 and a20450904 are ancestors of HEAD; `HandoffPoll` is in install_once.rs; the three deleted rearm streams are gone and the two edited streams exist.

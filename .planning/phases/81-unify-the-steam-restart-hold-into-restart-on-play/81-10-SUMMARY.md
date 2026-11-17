---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 10
subsystem: steam-install-poll
status: complete
tags: [rust, steampoll, install-poll, frozen-parity]
requires: [81-05, 81-09]
provides:
  - install poll reports Installed on the first fully-installed tick on every OS (no hold block, no hold_eligible)
  - notify_restart_steam is bottle-only; the 1026 wait and its toast are unchanged
affects: [81-11, 81-14]
requirements-completed: [D-11, D-14]
key-files:
  modified:
    - src-tauri/crates/gamelib-steampoll/src/install_once.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/install-depot-skipped.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/install-depot-skipped.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/rearm-arm.json
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/rearm-arm.json
    - src-tauri/crates/gamelib-steampoll-cli/tests/cli.rs
  deleted:
    - four hold scenarios, timeline + expected-ts each (8 fixture files)
decisions:
  - "The Phase C hold handshake in install_loop.rs stays dormant (no hold probe is ever requested); 81-14 deletes it"
  - "rearm-arm's frozen stream is edited here (not in the plan's list) because the re-armed poll runs through installed(); 81-11 deletes the scenario"
metrics:
  tasks: 2
  files: 21
  completed: 2026-11-18
commits: 3
plan_head_before: 7316809bb60fdc4aad48272c6a6cb90753107e7d
plan_head_after: e3140f976
actuals:
  tokens: 14000
  tasks: 2
  commits: 3
---

# Phase 81 Plan 10: Installed as soon as the ACF says so Summary

A finished GameLib depot install now reads Installed (with Play) on the first tick on macOS, Windows and Linux: `installed()` has no D-UAT-13 hold block and `hold_eligible` is gone. The "Restart Steam to finish installing" toast at a StateFlags 4 handoff now fires only for the bottle source; the GameLib 1026 wait and its one toast are untouched.

Note on `commits:` — the measured range `plan_head_before..HEAD` is 6 because the phase-64 session committed three of its own commits on main in between; the three 81-10 commits are listed below.

## Commits

| Hash | Message |
| --- | --- |
| 9a3b6056d | feat(81-10): report Installed on the first tick; the restart hold never arms |
| 567d6582b | fix(81-10): lower the shipped-timeline floor after deleting four hold scenarios |
| e3140f976 | feat(81-10): the restart-Steam toast at a StateFlags 4 handoff is bottle-only |

## What changed

- `install_once.rs`: deleted `hold_eligible` and the `if obs.hold.is_some() || hold_eligible(poll)` block in `installed()`. `notify_restart_steam` is now `is_native_handoff && source == AcfSource::Bottle && !installer_owns_completion && !notified_waiting` with a rewritten comment. The 1026 `is_waiting` branch, its `release_hold` call and its toast are unchanged.
- `install_once_complete.rs`: deleted the "restart hold" section (4 tests); added `a_native_handoff_reports_installed_on_the_first_tick_on_every_platform` (Darwin, Win32, Linux: no hold probe, Installed on the tick, no `steam-waiting-for-restart`). Split `native_handoff_fast_path_fires_the_restart_steam_notice` into `a_native_handoff_fires_finished_and_never_the_restart_steam_notice` (three platforms) and `a_bottle_handoff_still_fires_the_restart_steam_notice`; `mac_native_route_fires_finished_and_not_restart_steam` kept on the new rule; `all_three_notices_fire_in_one_confirmed_installed_tick` re-aimed at a bottle handoff (the only source that still gets all three notices).
- `install_loop.rs`: deleted the eight hold tests named in the plan plus `a_slow_tick_delays_the_next_one_instead_of_overlapping` and its `SlowRunner`, `SlowSteamRunner` and `slow_probe_rig` helpers (see Deviations), and the imports they alone used.

## Frozen-stream edits (T-81-33)

Scenario files deleted (timeline + expected-ts each, `git rm`; directories, `divergences.json` and `frozen_parity.rs` untouched):

- `install-restart-hold-release`
- `install-restart-hold-steam-not-running`
- `install-restart-hold-unprobed-steam-absent`
- `install-max-ticks-holding-release`

Frozen streams edited:

| Stream | Records removed / changed | Timeline description |
| --- | --- | --- |
| `expected-ts/install-depot-skipped.json` | removed record 0 (`file clear` appId 1000, the hold block's release effect) and the last record (the `steam.waitingForSteam.notify` restart toast); 6 records -> 4 | changed to "A native handoff completion with skipped depots fires Installation Finished and the depot-skipped notice." |
| `expected-ts/rearm-arm.json` | removed the three `installing` / `steam-waiting-for-restart` status records; the trailing record-clear `file clear` moved from before the `installed` state record to after the `Installation Finished` notice (the restored hold's record is now cleared when the poll stops, after completion); 7 records -> 4 | changed to say the re-armed hold no longer holds the install: it completes on the first tick and the restored record is cleared |

`install-handoff-1026-waiting.json` and `divergences.json` are byte-identical to HEAD.

## Deviations from Plan

**1. [Rule 3 - Blocking] rearm-arm frozen stream changed (the plan's "stop and report" trigger)**
- **Found during:** Task 1, running frozen_parity.
- **Issue:** The plan expected only install-depot-skipped to change and said to stop if another surviving stream did. `rearm-arm` also changed: its re-armed poll runs through `installed()`, so it no longer holds. It is the hold itself (a restored hold), not a change that "reached past the hold". Removing records alone could not make the stream match, because the record clear now trails completion rather than leading it, so a ledger entry or a pure removal was impossible. The other three rearm scenarios (`rearm-drop-expired`, `rearm-drop-pid-reused`, `rearm-unknown-probe`) are unchanged. Deleting the scenario would have pre-empted 81-11's `git rm` of it, so the stream and description were edited and 81-11 deletes it as planned. No operator checkpoint was taken (the operator's 2026-11-17 decision removes checkpoints for this plan).
- **Files modified:** expected-ts/rearm-arm.json, timelines/rearm-arm.json
- **Commit:** 9a3b6056d

**2. [Rule 1 - Bug] `a_slow_tick_delays_the_next_one_instead_of_overlapping` (+ its helpers) removed**
- **Issue:** The test (and the "state moved while the hold probe ran" section above it) drove a native handoff through the 10-second hold probe. With no probe requested the test failed (`calls` 0, expected 1). It exercised only the removed behaviour. This drops the loop's only no-overlap tick test; the loop awaits each tick sequentially and nothing in a tick is slow any more.
- **Commit:** 9a3b6056d

**3. [Rule 1 - Bug] `cli.rs` `every_shipped_timeline_replays` floor lowered 39 -> 35**
- **Issue:** The floor pinned the shipped timeline count; deleting four hold timelines left 35.
- **Commit:** 567d6582b
- **Note for 81-11:** 81-11 deletes four more timelines (31 left), so its edit must also lower this floor and `frozen_parity.rs`'s `names.len() >= 34` assertion (frozen_parity.rs is off limits to this plan; 81-11 is the plan that hits it).

## Verification

- `cargo test -p gamelib-steampoll`: all suites pass (install_once_complete 25, install_once_progress 38, install_loop 38).
- `cargo test -p gamelib-steampoll-cli`: frozen_parity passes; `list_prints_every_op_one_per_line` fails (27 ops vs 24 pinned; pre-existing, logged by 81-04, untouched).
- `cargo clippy -p gamelib-steampoll -p gamelib-steampoll-cli --all-targets -- -D warnings` and `cargo fmt --check`: clean.
- `pnpm exec jest src/backend/__tests__/steamPollsPortComplete.test.ts`: 21 pass. `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar`: only `acfUpdateReplay.test.ts` fails (pre-existing). `pnpm codecheck`: clean.
- `pnpm -s backend-di-ceilings` and `pnpm -s gameinfo-narrowing-ceiling`: only the pre-existing logged violations (launchWithoutSteam.test.ts, NativePortInfo.test.tsx, LaunchWithoutSteam.test.tsx, NativePortInfo.tsx). No new failure.
- Prettier `--check` over the three edited expected-ts / timeline JSON files that are prettier-visible: clean.
- Acceptance: no `fn hold_eligible`; 0 `restart-hold|holding-release` timelines; fixture directories and `divergences.json` present; `AcfSource::Bottle` x2 and `steam-waiting-for-restart` x2 in install_once.rs; no `Restart Steam` in install-depot-skipped's stream.

## Known Stubs

None.

## Threat Flags

None. Release coupling (T-81-48): 81-10..81-13 must ship in one release; nothing was tagged or published.

## Self-Check: PASSED

Commits 9a3b6056d, 567d6582b and e3140f976 are ancestors of HEAD; the eight deleted fixture files are absent and the edited files exist.

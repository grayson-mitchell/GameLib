---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 11
subsystem: steam-install-poll
status: complete
tags: [rust, steampoll, boot, rearm-removal, frozen-parity]
requires: [81-10]
provides:
  - steampoll_boot only starts the running poll; nothing re-arms steam_restart_hold.json at boot
  - the install loop keeps no re-arm state (RestoredSteamHold, pending_rearm, reconcile_ran_during_rearm gone)
affects: [81-12, 81-13, 81-14]
requirements-completed: [D-11, D-13]
key-files:
  modified:
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/crates/gamelib-steampoll/src/lib.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/README.md
    - src-tauri/crates/gamelib-steampoll-cli/src/replay.rs
    - src-tauri/crates/gamelib-steampoll-cli/tests/cli.rs
    - src-tauri/crates/gamelib-steampoll-cli/tests/frozen_parity.rs
  deleted:
    - src-tauri/crates/gamelib-steampoll/src/rearm.rs
    - src-tauri/crates/gamelib-steampoll/tests/rearm.rs
    - four timelines/rearm-*.json and expected-ts/rearm-arm.json
decisions:
  - "PollOptions.restored_steam_hold is kept as an accepted-and-ignored Option<serde_json::Value> (not a typed struct) until 81-14 removes the TS sender"
  - "StateEvent::RearmSettled and its TS handler are left in place: removing the wire variant spans files outside this plan; 81-14 (TS cleanup) should drop it"
metrics:
  tasks: 2
  files: 16
  completed: 2026-11-18
commits: 3
plan_head_before: d5a20eb66d198693044d5c466041efd1672100f2
plan_head_after: 51e62299ca24d13ee36a0cfbf5f8d607920170b7
actuals:
  tokens: 14800
  tasks: 2
  commits: 3
---

# Phase 81 Plan 11: Delete the boot re-arm Summary

Restarting GameLib no longer re-reads `steam_restart_hold.json` to put a game back into "Restart Steam to finish": the boot re-arm module, its spawn, its CLI replay verb and the install loop's restored-hold state are all gone, and an older sidecar's `restoredSteamHold` start option is still accepted and ignored.

## Commits

| Hash | Message |
| --- | --- |
| b712d819a | feat(81-11): delete the boot re-arm of persisted restart holds |
| 1983a7b23 | test(81-11): a start carrying restoredSteamHold behaves like one without it (RED) |
| 51e62299c | feat(81-11): the install loop keeps no re-arm state (GREEN) |

## What changed

- **Task 1 (tracer):** `steampoll_boot` only starts the running poll (first probe after 5 s) and its doc comment says so. `git rm` of `rearm.rs`, `tests/rearm.rs`, the four `timelines/rearm-*.json` and `expected-ts/rearm-arm.json`; `pub mod rearm;` removed from `lib.rs` and its R5 doc note rewritten. The replay CLI lost the `rearm` verb and, because no remaining timeline uses `store.restartHold`, its scratch profile, `HoldStore` and restartHold seeding (and the `BTreeSet`/`SidecarProfile`/`HoldStore`/`parse_record` imports). The timelines README lost the `rearm` machine, the restartHold store field and the re-arm paragraph (prettier reflowed the tables). The `main.rs` comment above the `steampoll_boot()` call was updated.
- **Task 2 (TDD):** RED: `a_start_carrying_restored_steam_hold_behaves_like_one_without_it` failed with `steam_hold == "holding"`. GREEN: deleted `RestoredSteamHold`, the restored-hold start path (ticks/notified_waiting/hold state/pids/probe time/seen_downloading now take their non-restored values), `pending_rearm`, `reconcile_ran_during_rearm` and their setters/getters; `holding_app_ids` reports only live holding polls. `PollOptions.restored_steam_hold` is `Option<serde_json::Value>` with a doc comment saying it is accepted and ignored until 81-14. The rearm-only test `pending_rearm_counts_as_holding_and_sets_the_reconcile_flag` was replaced by the new test.

## D-13: the absorbed todo's debug questions

The two open questions (missing init logs; a re-arm that reads as "not installed") each required a boot re-arm path to occur on. That path no longer exists: there is no `rearm_persisted_holds`, no `pending_rearm` fail-closed set and no restored-hold poll start, so nothing re-arms a hold anywhere and neither symptom has a code path left.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug caused by this plan] Shipped-timeline floors lowered**
- **Found during:** Task 1
- **Issue:** deleting four more timelines leaves 31 (was 35), below the `cli.rs` `every_shipped_timeline_replays` floor (35) and the `frozen_parity.rs` `names.len() >= 34` assertion (flagged in the dispatch notes).
- **Fix:** both lowered to 31, the actual shipped count.
- **Files modified:** `crates/gamelib-steampoll-cli/tests/cli.rs`, `crates/gamelib-steampoll-cli/tests/frozen_parity.rs`
- **Commit:** b712d819a

**2. [Rule 3 - Blocking] Replay CLI scratch profile removed, not just the verb**
- **Found during:** Task 1
- **Issue:** after the `rearm` verb went, the scratch `SidecarProfile` was an unused variable (warning) and `store.restartHold` seeding was used by no timeline.
- **Fix:** removed the profile, `HoldStore` and restartHold seeding (the plan names "its scratch HoldStore/profile setup"), plus the README rows that described them.
- **Commit:** b712d819a

**3. [Scope note] README edited again in Task 2**
- `restoredSteamHold` row in the timelines README now says "accepted and ignored since Phase 81 D-11". README is not in Task 2's file list; it keeps the doc accurate.

## Release coupling

Per the operator decision (2026-11-17), 81-10..81-13 ship in one release. From this plan until 81-13's boot drain, a hold persisted by an older build is neither re-armed nor migrated (T-81-54). Nothing was tagged or published.

## Verification

- `cargo test -p gamelib-steampoll` and `-p gamelib-steampoll-cli` (whole crates): green; clippy `-D warnings` and `cargo fmt --check` clean; `rustfmt --check src/steampoll_dispatch.rs` clean; `cargo test --bin gamelib-shell steampoll`: 16 passed.
- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__`: 2 failures, both logged pre-existing (`storeKinds.test.ts`, `acfUpdateReplay.test.ts`). `steamPollsPortComplete` 21 passed; tauriShellSource `steampoll lifecycle` 3 passed.
- `pnpm codecheck`: green.
- `pnpm -s backend-di-ceilings`: the three logged failures plus one not on the log, `NoticeStack.test.tsx` 5 > baseline 4 (jestMock), introduced by phase 64's `ab124b14a` (not this plan, which touched no TS). `pnpm -s gameinfo-narrowing-ceiling`: the logged NativePortInfo.tsx. `pnpm -s find-deadcode`: the logged NativePortDataStyle and NativePortMac.

## Known Stubs

None.

## Deferred / Notes for later plans

- `StateEvent::RearmSettled` (Rust), its TS handler in `steamPollEventRegistration.ts` and the parity/contract tests are now dead: nothing emits the event after this plan. Left for 81-14's TS cleanup because removing a wire variant spans files outside this plan. The README row says it is no longer produced.
- `NoticeStack.test.tsx` backend-di ceiling growth (phase 64-09) is not in the phase's deferred-items.md yet.

## Threat Flags

None. No new surface; T-81-32 is mitigated (the store is no longer read at boot). T-81-54 is mitigated by the release-coupling rule above.

## Self-Check: PASSED

- rearm.rs, tests/rearm.rs, four rearm timelines and expected-ts/rearm-arm.json: absent.
- Commits b712d819a, 1983a7b23, 51e62299c: present in HEAD history.
- `grep pending_rearm|RestoredSteamHold` over `gamelib-steampoll/src`: no matches; `restored_steam_hold` present in `install_loop.rs`.

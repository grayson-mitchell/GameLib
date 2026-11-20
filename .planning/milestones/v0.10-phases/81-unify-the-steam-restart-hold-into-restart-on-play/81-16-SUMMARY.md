---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 16
subsystem: steam-polling
status: complete
tags: [steam, restart-hold-removal, hold-migration, steam-process, rust]
requires: [81-15]
provides:
  - gamelib-steampoll steam_process module (Steam pid and start-token probes and parsers)
  - hold_migration owns PidToken, RestartHoldRecord, parse_record, DropReason, RearmDecision, decide_rearm, read_hold_store
affects: [81-17, 81-18]
tech-stack:
  added: []
  patterns: [verbatim move then delete, read-only migration reader]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/src/steam_process.rs
    - src-tauri/crates/gamelib-steampoll/tests/steam_process.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/hold_migration.rs
    - src-tauri/crates/gamelib-steampoll/src/lib.rs
    - src-tauri/crates/gamelib-steampoll/src/adoption.rs
    - src-tauri/crates/gamelib-steampoll/src/host.rs
    - src-tauri/crates/gamelib-steampoll/src/testing.rs
    - src-tauri/crates/gamelib-steampoll-cli/src/replay.rs
    - src-tauri/crates/gamelib-steampoll/tests/hold_migration.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/outbox.rs
    - src-tauri/crates/gamelib-steampoll/tests/uninstall.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/README.md
  deleted:
    - src-tauri/crates/gamelib-steampoll/src/hold.rs
    - src-tauri/crates/gamelib-steampoll/tests/hold.rs
decisions:
  - "read_hold_store is a plain lenient file read (missing, unreadable or non-object file reads empty; skips __internal__, __timestamp and __timestamp.* keys; parse_record validates each record); it never writes"
  - "The timeline README's file record row and its restart-hold set/delete normalisation row were removed with StreamRecord::File: no driver (Rust or TS) emits a file record any more"
metrics:
  tasks: 3
  files: 13
  completed: 2026-11-18
commits: 3
plan_head_before: 5750e1ae626a7260cfa65984f843083d823855f0
plan_head_after: b8e1527b96f25dc1c922d53e7f53b122e58a81d8
actuals:
  tokens: 30000
  tasks: 3
  commits: 3
---

# Phase 81 Plan 16: Delete hold.rs Summary

hold.rs is gone: the Steam process probes live in `steam_process.rs`, the migration's record types, decision and a read-only store reader live in `hold_migration.rs`, and `HoldStore`, the `HoldSink` trait with both impls and `StreamRecord::File` are deleted.

## What was built

1. **Task 1 (1e35b41f5), tracer.** `steam_process.rs` holds `PROBE_TIMEOUT`, `START_TOKEN_TIMEOUT`, `positive_pid`, `parse_tasklist_steam_pids`, `parse_pgrep_pids`, `parse_pid_token_lines`, `system_root`, `win_join`, `list_steam_client_pids` and `read_steam_process_start_tokens`, cut verbatim from hold.rs (T-80-22 injection guard and doc comments intact). adoption.rs (two call sites) and hold_migration.rs now call `crate::steam_process`. The probe and parser cases moved to `tests/steam_process.rs` unchanged apart from `use` paths. Importer grep found only adoption.rs and hold_migration.rs (plus the tests), as expected.
2. **Task 2 (947c234a1).** `PidToken`, `RestartHoldRecord` (without `to_value`), `parse_record`, `DropReason`, `RearmDecision` and `decide_rearm` moved into hold_migration.rs, plus new `read_hold_store(path)`; `drain_hold_records` uses it and is otherwise unchanged. `HoldSink` (host.rs), `RecordingHost`'s impl (testing.rs) and `ReplayHost`'s impl (replay.rs) are deleted; `git rm` of `src/hold.rs`, `tests/hold.rs`, and `pub mod hold;`. The parse, decide and TS-written-fixture read cases moved to `tests/hold_migration.rs` (rewritten against JSON literals, since `to_value` is gone); the HoldStore write cases (round trip, concurrent writers, layout-preserving record/clear, 0600 mode, unparseable-never-overwritten, HoldSink) were deleted with the store.
3. **Task 3 (b8e1527b9).** The grep confirmed only the deleted HoldSink impl constructed `StreamRecord::File`; the variant and the `file:` formatter arm in tests/install_loop.rs, tests/outbox.rs and tests/uninstall.rs are removed, along with the stale doc mentions in testing.rs and the CLI's replay.rs.

## D-11 / D-13

No store writer, no re-arm and no hold module remain. The only code that touches `steam_restart_hold.json` is `hold_migration.rs` (read-and-delete migration, 81-12/81-13) and the profile path field. The absorbed todo's re-arm debug questions therefore have no remaining code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/housekeeping] Timeline README rows for the file record**
- **Found during:** Task 3
- **Issue:** `tests/fixtures/timelines/README.md` documented a `{file: ...}` record and a "restart-hold store set / delete" normalisation row; both described output that no longer exists.
- **Fix:** removed both table rows; `prettier --check` passes on the file.
- **Files modified:** tests/fixtures/timelines/README.md
- **Commit:** b8e1527b9

Otherwise: plan executed as written. TDD note: this plan is moves and deletions with the existing tests carried over unchanged, so there is no new failing behavior to pin; the tests were moved first and run green after each move rather than committed red.

## Verification

- `cargo test -p gamelib-steampoll` and `-p gamelib-steampoll-cli` green (whole crates); `cargo test --bin gamelib-shell steampoll` 17 passed; clippy `-D warnings` and `cargo fmt --check` clean on both crates.
- `grep -rE 'HoldSink|HoldStore|crate::hold::|gamelib_steampoll::hold::'` over the crate, CLI and shell: no matches. `steampoll_running_hold` and the launch-watch `RunningPoll::hold` untouched (T-81-52).
- `pnpm codecheck` clean. jest `src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__ src/common`: only the two logged failures (`storeKinds.test.ts`, `acfUpdateReplay.test.ts`). `pnpm -s backend-di-ceilings` and `pnpm -s find-deadcode`: only the logged findings (launchWithoutSteam / NoticeStack / NativePortInfo / LaunchWithoutSteam test ceilings; `NativePortDataStyle`, `NativePortMac`).

## Known Stubs

None.

## Threat Flags

None. T-81-38 (probes moved verbatim, tests unchanged) and T-81-49 (same bookkeeping-key skips and `parse_record`, TS-written fixture case kept) mitigated; T-81-52 mitigated (no launch-watch symbol touched).

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-steampoll/src/steam_process.rs, tests/steam_process.rs
- ABSENT (intended): src/hold.rs, tests/hold.rs
- FOUND commits: 1e35b41f5, 947c234a1, b8e1527b9

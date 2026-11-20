---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 12
subsystem: steam-polling
status: complete
tags: [rust, rustinvoke, steam, hold-migration, ipc-contract]
requires: [81-11]
provides:
  - steampoll_hold_drain and steampoll_hold_discard on all four layers (crate, shell, TS transport, TS mirror)
  - gamelib-steampoll hold_migration module (DrainedHold, drain_hold_records, discard_hold_store)
  - RUST_STEAMPOLL_HOLD_DRAIN, RUST_STEAMPOLL_HOLD_DISCARD, DrainedHold type
affects: [81-13]
tech-stack:
  added: []
  patterns: [no-arg op whose path comes only from the facade profile, async op via block_on with wrong-thread string]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/src/hold_migration.rs
    - src-tauri/crates/gamelib-steampoll/tests/hold_migration.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/lib.rs
    - src-tauri/crates/gamelib-steampoll/src/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/contracts.rs
    - src-tauri/crates/gamelib-steampoll-cli/tests/cli.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/storeManagers/steam/pollRust/steamPollTypes.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/steamPollChannelParity.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/mockedFsSteamFiles.ts
decisions:
  - "drain_hold_records filters to numeric appIds (1 to 10 digits) on top of HoldStore::list, because the id later reaches a watch op and a path; the plan's behavior list named non-numeric keys as skipped but HoldStore::list only skips bookkeeping keys"
  - "the drain op takes no args and reads its clock from SystemTime in the crate; the facade keeps no clock and max age is disabled anyway, so now_ms never changes a decision"
metrics:
  tasks: 2
  files: 17
  completed: 2026-11-18
commits: 2
plan_head_before: 612974e662c5eb2e5ac18b380c7f3c561ccd9432
plan_head_after: 79776e9f5b5e3e0c1996fa04606883fead004324
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 12: hold drain and discard ops Summary

The sidecar can now read an older build's `steam_restart_hold.json` through Rust, already validated and filtered (`steampoll_hold_drain`), and later delete exactly that file (`steampoll_hold_discard`); neither op takes args, so the store path can only be the facade profile's.

## Commits

- 48b9b688d: feat(81-12) steampoll_hold_drain reads and validates the old restart-hold store in Rust (tracer)
- 79776e9f5: feat(81-12) steampoll_hold_discard deletes the old restart-hold store file

## What was built

- **`hold_migration.rs`.** `drain_hold_records(runner, platform, store_path, now_ms)` lists the store with `HoldStore::list`, probes live Steam pids once and start tokens once for the union of recorded pids, then runs `decide_rearm` with the max age disabled (`u64::MAX`). Arm keeps the record with the smallest matching pid; Unknown keeps it with the smallest recorded pid; Drop(Expired) keeps it (an aged hold is still unadopted); Drop(SteamExited | PidReused) drops it, because that Steam adopted the install at its own restart. A missing, unreadable or non-object store answers an empty list and the file is left byte for byte. Nothing is written. `discard_hold_store(path)` removes the file: true when removed or already missing, false on any other I/O error (logged by op name only).
- **Crate op table.** `steampoll_hold_discard` and `steampoll_hold_drain` in sorted order after `steampoll_bridge_finalized`. Drain is the fourth async op (`block_on`, `wrong-thread` inside a runtime). Both ignore their args and use `facade.profile.restart_hold_store_path`.
- **Shell and TS.** `rpc_steampoll_hold_{drain,discard}` with the generated empty-args structs, router arms, `RUST_STEAMPOLL_HOLD_DRAIN|DISCARD` in both lists, `empty` zod schemas, `STEAMPOLL_OPS` entries, the `DrainedHold` type, the `mockedFsSteamFiles` entries, and `ipc_contract.rs` regenerated with `pnpm gen:ipc-contract` (`check:ipc-contract` fresh).
- **Pins moved.** Crate `ops_sorted_and_unique` 27 to 29, CLI `list_prints_every_op_one_per_line` 27 to 29, `steamPollChannelParity` OPS 27 to 29, `rustInvokeSchemas` channels 115 to 117, tauriShellSource arm count 115 to 117 plus two `preExistingArms` entries, `steampoll_dispatch.rs` header count.

## Verification

`cargo test -p gamelib-steampoll` (499 tests, 0 failed, whole crate), `cargo test -p gamelib-steampoll-cli` (9 + 1 passed), `cargo test --bin gamelib-shell steampoll` (17 passed), `cargo clippy -p gamelib-steampoll --all-targets -D warnings` clean, `cargo fmt -p gamelib-steampoll --check` and `rustfmt --check src/steampoll_dispatch.rs` clean. `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__`: 9691 passed, 2 failed, both the logged pre-existing reds (`acfUpdateReplay`, `storeKinds`). `pnpm codecheck` clean, prettier clean on all seven touched TS files (none prettier-ignored). `pnpm -s backend-di-ceilings` and `pnpm -s find-deadcode` show only the logged reds (4 and 2 FAIL lines), nothing from this plan (`DrainedHold` carries `@public`, as `AdoptionReading` does).

TDD note: the module and its drain tests were written together, so the drain tests were never observed red; the dispatch-level assertions (OPS membership, args ignored, wrong-thread, not-configured) and the op-count pins were the failing side before the arms existed. The discard tests were added with the discard function and passed on first run.

## Deviations from Plan

**1. [Rule 2 - Correctness] numeric appId filter.** The behavior list says non-numeric keys are skipped, but `HoldStore::list` only filters bookkeeping keys, so an `abc`, empty or 11-digit key would have flowed through to 81-13 (where the id reaches a watch op and a manifest path). The drain now keeps only 1 to 10 digit ids, with a test.
- **Files:** src-tauri/crates/gamelib-steampoll/src/hold_migration.rs, tests/hold_migration.rs
- **Commit:** 48b9b688d

**2. [Rule 3 - Blocking] `bad_args_are_named_per_op` skip list.** The existing test asserts every op rejects `{"__nope": true}`; the two new ops ignore args by design (like `steampoll_status`), so they joined its skip list.
- **Files:** src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
- **Commits:** 48b9b688d, 79776e9f5

**3. [Pins] op-count literals.** The plan text said the pins were "now 27"; they were, and are 29 after this plan. Moved as listed above, as the operator instruction required.

## Deferred / pre-existing

None new. The reds already logged in `deferred-items.md` (`acfUpdateReplay`, `storeKinds`, backend-di-ceilings files, find-deadcode NativePort entries) are unchanged.

## Known Stubs

None.

## Threat Flags

None. T-81-35 (path injection) is mitigated by construction: both ops ignore their args and take the path from the facade profile, with tests that pass a `path` arg and confirm it is never read or deleted. T-81-37 rests on `decide_rearm`'s start-token comparison, exercised by the reused-pid test. T-81-55 (release coupling with 81-10, 81-11, 81-13) stands as an operator decision; nothing was tagged or published.

## Self-Check: PASSED

Both task commits (48b9b688d, 79776e9f5) are ancestors of HEAD; `hold_migration.rs` and `tests/hold_migration.rs` exist; acceptance greps: `"steampoll_hold_` in dispatch.rs >= 4, `RUST_STEAMPOLL_HOLD_` in sidecarTransport.ts >= 6, no `steam_pending_adoption` outside comments in `hold_migration.rs`.

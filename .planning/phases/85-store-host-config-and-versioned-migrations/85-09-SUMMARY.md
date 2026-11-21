---
phase: 85-store-host-config-and-versioned-migrations
plan: 09
subsystem: infra
tags: [rust, store, gamelib-store, store-host, boot-sweep, shutdown-drain, uploadedLogs, tauri-shell]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-04 spike constants (BOOT_SWEEP_MAX_FILES/MS, sync_all cost); 85-06..85-08 ordered Json, ops, envelope, engine, table and the migration chains"
  - phase: 84-logger
    provides: "the minimal StoreHost in gamelib-core and the native uploadedLogs handlers this plan moves and fixes"
provides:
  - "gamelib-store::host: StoreHost/Store over the ordered Json, decided on open by the engine, written as tab + envelope (settings 2-space), with apply/rev/Origin/StoreChange, one ordered dispatcher, kind-based durability, evict_path, in-flight tracking and read-only state"
  - "uploadedLogs served from the widened host in v0.10's exact format (tab + __internal__ envelope, name/token/uploadedAt key order, no fake __internal__ entry, Phase 84 file adopted without a write)"
  - "store_boot: GAMELIB_STORE mode, storeOwnership.json flags, bounded open_all, GAMELIB_STORE_BOOT hand-off on both sidecar spawn paths, the `store` exit drain"
affects: [85-10, 85-11, 85-12, 85-17, 85-19]

plan_head_before: e381d63aa80783aafadb7c34e05796d11876f173
plan_head_after: 6183e62deeb673c4171dee7073ad12b14b1339a6
commits: 3

actuals:
  tokens: 33169
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "rev assigned and the change queued while holding the store lock; one dispatcher thread delivers in queue order with no lock held"
    - "write seam (Writer) injected into the host so durability, failure and a blocked write are observable in tests"
    - "boot sweep bounded by file count, milliseconds and the shutdown token; the remainder is counted and opens lazily"

key-files:
  created:
    - src-tauri/crates/gamelib-store/src/host.rs
    - src-tauri/src/store_boot.rs
    - src/common/types/ipc/storeOwnership.json
  modified:
    - src-tauri/crates/gamelib-store/src/json.rs
    - src-tauri/crates/gamelib-store/src/lib.rs
    - src-tauri/crates/gamelib-core/src/lib.rs
    - src-tauri/crates/gamelib-core/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/native_router.rs
    - src-tauri/src/log_upload.rs
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src/backend/__tests__/tauriShellSource.test.ts
  deleted:
    - src-tauri/crates/gamelib-core/src/store.rs

key-decisions:
  - "open_cache (the Phase 84 entry) keeps Phase 84's contract: a file that is not a readable store is InvalidData and is never overwritten, also when the boot sweep opened it first; open_row (boot and the family plans) takes whatever the engine decides"
  - "A store's own ownership flag wins over its family's (so a store can be moved ahead of, or held behind, its family); native is always owned and excluded never"
  - "set/remove on an unchanged value write nothing and queue no event (the plan's apply rule); the in-memory view becomes the stamped document only after the bytes are on disk"
  - "StoreChange events are queued only once a listener exists (the dispatcher starts with the first one); nothing could hear earlier changes"

patterns-established:
  - "Store events: {store key, rev, OpSummary (kind + key, never the value), Origin} delivered in rev order"
  - "A second GameLib instance never reaches store_boot::open_all: it runs only in run_setup, pinned by a source test against the single-instance guard ordering"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "StoreHost moved to gamelib-store::host with the Phase 84 method shapes, rollback, 0600/0700 and atomic write, over the ordered Json; gamelib-core holds traits only"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-store host:: (26+1 tests incl. a_failed_persist_*, the_file_is_0600_*, the_same_dir_and_name_*)"
        status: pass
      - kind: unit
        ref: "test ! -e src-tauri/crates/gamelib-core/src/store.rs; grep gamelib_core::store src-tauri/src == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "uploadedLogs read and written in v0.10's format: tab + envelope, no __internal__ in the list or the prune, Phase 84 file adopted without a write, re-save equals the 85-01 golden, record keys in uploader order"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/src/log_upload.rs#log_upload_v010_file_lists_without_internal, log_upload_prune_ignores_internal, log_upload_phase84_file_adopted_without_write, log_upload_resave_matches_golden, log_upload_a_new_record_is_written_in_the_v010_uploader_key_order"
        status: pass
    human_judgment: false
  - id: D3
    description: "rev under the lock and one ordered dispatcher; kind-based durability; read-only and evicted stores refuse writes; failed persist restores the view and fires nothing; in-flight tracking for the drain"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "gamelib-store host::tests::eight_writer_threads_see_strictly_increasing_revs_in_delivery_order, durability_follows_the_store_kind, an_evicted_store_refuses_apply_and_creates_no_file, in_flight_is_zero_when_idle_and_wait_idle_gives_up_while_an_apply_is_blocked"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bounded boot open, GAMELIB_STORE mode and ownership file (nothing flipped), GAMELIB_STORE_BOOT on both sidecar spawn paths, the `store` exit drain"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot (14 tests incl. store_boot_never_opens_migrations_json)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/tauriShellSource.test.ts (Phase 85 plan 09: store boot wiring; handle_exit drains ... store)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Exit behaviour of the `store` drain under a real quit with a write in flight"
    verification: []
    human_judgment: true
    rationale: "The drain mechanism and its wiring are tested (wait_idle bound, drain tuple, hold_exit_drain_open), but a real quit during a slow write is not exercised end to end here"

duration: ~90min (start time not recorded; estimated)
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 09: StoreHost widened into gamelib-store, uploadedLogs fixed, bounded boot open and exit drain Summary

**Ordered, durable-by-kind StoreHost in gamelib-store (rev and event queued under the store lock, one rev-ordered dispatcher, read-only/evicted refusal), uploadedLogs served from it in v0.10's tab+envelope bytes, plus a bounded boot open behind GAMELIB_STORE and storeOwnership.json, the GAMELIB_STORE_BOOT sidecar hand-off and a `store` exit drain.**

## Performance

- **Duration:** about 90 min (start time was not recorded; estimated)
- **Completed:** 2026-11-22
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Files modified:** 14 (3 created, 1 deleted)

## Accomplishments

- The Phase 84 `StoreHost` moved from `gamelib-core::store` into `gamelib-store::host` keeping `open_cache/get/set/remove/snapshot/on_change`, the rollback, 0600/0700 and the atomic write with fallback; values are the ordered `Json`; `gamelib-core` holds traits only (its `indexmap` dependency and `store.rs` are gone).
- uploadedLogs is now correct against a real v0.10 file: tab-indented with the `__internal__` envelope, no `__internal__` leaking into the list or reaching `prune_expired`, a Phase 84 2-space file adopted with zero bytes written, records built with `Obj` in v0.10's `name, token, uploadedAt` order, and the re-save equal to the 85-01 golden.
- `Store::apply(op, origin)`: refuses read-only and evicted stores, persists with `sync_all` for every kind but a cache (D-21), assigns `rev` and queues the `StoreChange` while holding the lock; one `store-events` dispatcher delivers in rev order with no lock held (an 8 thread x 200 write test sees revs 1..1600 in order).
- `StoreHost::{evict_path, in_flight, wait_idle, read_only_entries, on_any_change, with_writer}` added.
- `store_boot`: `GAMELIB_STORE` parsed once, `storeOwnership.json` (every flag false), `open_all` bounded by BOOT_SWEEP_MAX_FILES 10000 / BOOT_SWEEP_MAX_MS 2000 (from 85-SPIKES.md) and the shutdown token, one counts-only summary line, `boot_env_value`, the `store` drain.
- `run_setup` opens the host before the sidecar is spawned; both sidecar spawn paths set `GAMELIB_STORE_BOOT`; `handle_exit` gained the `store` drain.

## Task Commits

1. **Task 1: Tracer - move StoreHost into gamelib-store, serve uploadedLogs from it** - `e13bb2657` (feat)
2. **Task 2: Widen the host (rev, dispatcher, durability, read-only, eviction, in-flight)** - `0bcae7be8` (feat)
3. **Task 3: Bounded boot open, mode and ownership file, boot hand-off, `store` drain** - `6183e62de` (feat)

**Plan metadata:** recorded in the docs(85-09) commit that follows this file.

## Files Created/Modified

- `src-tauri/crates/gamelib-store/src/host.rs` - the widened store host and its tests
- `src-tauri/crates/gamelib-store/src/json.rs` - `From<serde_json::Value> for Json`, `Json::to_value`, `Json::as_f64`
- `src-tauri/crates/gamelib-core/src/store.rs` - deleted (core holds traits only); `lib.rs` and `Cargo.toml` (indexmap) updated, `Cargo.lock` loses one dependency edge
- `src-tauri/src/log_upload.rs` - records built with `Obj`, prune over `Json`, four regression tests plus a key-order test
- `src-tauri/src/native_router.rs`, `src-tauri/src/main.rs` - import and construction updated; main.rs also gains the boot open, the `store` drain and the source-file lists
- `src-tauri/src/store_boot.rs` - mode, ownership, `open_all`, `boot_env_value`, `host()`, `drain`
- `src-tauri/src/sidecar.rs` - `GAMELIB_STORE_BOOT` on both spawn paths
- `src/common/types/ipc/storeOwnership.json` - per-family and per-store Rust ownership flags (nothing flipped)
- `src/backend/__tests__/tauriShellSource.test.ts` - the `store` drain, the new spawn call, the single-instance ordering pin, the ownership file

## Decisions Made

- `open_cache` keeps Phase 84's "a corrupt store is never overwritten" contract (InvalidData), including for a file the boot sweep already opened as unreadable; `open_row` is the engine-decides entry. This keeps the existing corrupt-store tests and the error log line meaningful for uploadedLogs.
- Ownership: a store's own flag wins over its family's; `native` always owned, `excluded` never.
- An unchanged `set` writes nothing and queues nothing.
- `GAMELIB_STORE_BOOT` is passed as a parameter through `spawn_sidecar_state` and `spawn_sidecar` (no global), and the literal name sits in both spawn builders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's `rustfmt --edition 2021 --check src/main.rs` cannot pass at baseline**
- **Found during:** Task 1 and Task 3 verify
- **Issue:** rustfmt follows `mod` declarations, so checking `main.rs` also checks the generated `ipc_contract.rs` (105 diffs) and `store_embed/controls.rs` (1 diff), which already fail on `main`. Running it without `--check` also rewrote those two files.
- **Fix:** restored both files from a backup after each formatting run and verified only my files: the diff list from `rustfmt --check` names only `ipc_contract.rs` and `controls.rs`, never `main.rs`, `native_router.rs`, `log_upload.rs`, `store_boot.rs` or `sidecar.rs`. `cargo fmt -p gamelib-store -p gamelib-core --check` is clean.
- **Files modified:** none left changed
- **Committed in:** n/a

**2. [Rule 3 - Blocking] main.rs's own test lists of shell source files**
- **Found during:** Task 3 (`cargo test --bin gamelib-shell`)
- **Issue:** `shell_source_files_names_every_shell_module_file` failed because `store_boot.rs` was missing from the parallel `SHELL_SOURCE_FILES` and `SHELL_SOURCE_PARTS` lists.
- **Fix:** added `store_boot.rs` to both, at the same index.
- **Files modified:** `src-tauri/src/main.rs`
- **Committed in:** `6183e62de`

**3. [Rule 1 - Bug] A boot-opened corrupt uploadedLogs would have become writable**
- **Found during:** Task 3 (boot sweep over a native row, shared `open` map)
- **Issue:** the sweep opens uploadedLogs with `open_row`; a later `open_cache` hit the cached store and skipped the strict check, so a corrupt file would have started empty and been overwritten by the next upload, against Phase 84's explicit guarantee.
- **Fix:** the strict entry re-checks the cached store's open outcome; test `a_corrupt_file_the_boot_sweep_opened_is_still_invalid_data_to_open_cache`.
- **Files modified:** `src-tauri/crates/gamelib-store/src/host.rs`
- **Committed in:** `6183e62de`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** no scope change. Plan-text differences that are not deviations: `open_all` also takes the `Ownership` and the user-data directory (and `open_all_with` exposes the cancellation check for tests); a `Writer` seam and `StoreHost::on_any_change` were added to the host for the plan's own tests; the Phase 84 `StoreChange` enum became the `{store, rev, op, origin}` struct in Task 2 as the plan specifies.

## Issues Encountered

- The earlier plan assumption "5 `gamelib_core::store` imports in src-tauri/src" held up: the move left 0, in `native_router.rs`, `log_upload.rs` (twice) and `main.rs`.
- `src/backend/__tests__/cargoFeatures.test.ts` passes (the jiff/portable-atomic crates from 8fcadab94 are in its pin); the only Cargo.lock change here removes `indexmap` from `gamelib-core`'s dependency list.
- A git checkout of two files triggered the repo's post-checkout hook (a pnpm install); it left the tree intact and all jest suites still pass.
- Verification beyond the plan: `src/backend/__tests__` (102 suites, 2232 tests) and the repo-wide `jest meta` (92 suites, 2861 tests) pass.

## Known Stubs

None. The ownership file's all-false flags are the plan's stated state ("nothing flipped"); each family plan flips its own.

## Threat Flags

None. `GAMELIB_STORE_BOOT` (T-85-22) carries store keys and reason words only; the boot sweep and the `store` drain are bounded (T-85-20, T-85-21). The `store-events` dispatcher thread holds no registrant (idle, not in-flight work).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 85-10 can build the frame/mirror protocol on `Store::apply` with `Origin::Sidecar{seq}`, `StoreChange{rev}`, `StoreHost::on_any_change` and extend `store_boot::drain` with the frame queue.
- The family plans (85-11 and later) flip their flag in `storeOwnership.json`; `settings/game` events share one table key across game files, so they need a per-file identity when that family moves.
- Unchanged-value writes are no-ops, which differs from conf (it rewrote the file every time); revisit only if a family golden requires a rewrite.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-store/src/host.rs, src-tauri/src/store_boot.rs, src/common/types/ipc/storeOwnership.json
- MISSING (intended): src-tauri/crates/gamelib-core/src/store.rs
- FOUND commits: e13bb2657, 0bcae7be8, 6183e62de

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*

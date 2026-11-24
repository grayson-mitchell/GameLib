---
phase: 94-humble-bundle-and-shortcuts
plan: 19
subsystem: backend
tags: [rust, humble, store-host, d-07, byte-roundtrip, copy-aside, disconnect, fnd-06, golden]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-08 the state goldens (all-eleven, the two no-op syncs, the legacy backfill, the Rust-only corrupt case); 94-09 the disconnect golden (stateBefore/stateAfter); 94-17 detect_and_notify_expiration_transitions and the legacy backfill; 94-15 HumbleStore and the app-id entry read/write
provides:
  - gamelib_humble::stores typed read and write for all eleven Humble files (load_config/set_config_flag/set_username, load_library/put_library_entry, load_sync_state/patch_sync_state, load_stamps/put_stamp over four stores, load_local_redeemed/put_local_redeemed, load_notified_expirations/put_notified_expiration, load_audit/append_audit/put_audit, load_app_ids/put_app_id)
  - StoreRead (Ok / Unreadable / Unavailable), WriteError, UnreadableStore, HumbleStore::open_checked, Entry (an ordered record that keeps fields it does not know)
  - clear_on_disconnect, CLEAR_ON_DISCONNECT, ClearReport
  - tests/state_roundtrip.rs (11 tests over the recorded TS bytes)
affects: [94-20, 94-21, 94-22, 94-25, 94-26, 94-30]

requirements-completed: []

actuals:
  tokens: 16000
  tasks: 2
  commits: 2

plan_head_before: 40c706a06ccbfff2785b46488ec0acd57d775004
plan_head_after: bf1eac2373fb56888d4e7d3d8d61539bb82e2481

tech-stack:
  added: []
  patterns:
    - "a keyed Humble store is written as the CacheStore wrote it: the record through put_cache_value (set key, then set __timestamp.<key> with the JS Date() text), a record update as {...existing, ...fields} so an unknown field keeps its place"
    - "an unreadable file is its own answer (StoreRead::Unreadable / WriteError::Unreadable), never an empty store and never a reset; the host has already copied the bytes aside"
    - "the byte proof is write-change-restore: a no-op write-back leaves the file, a write at a clock a minute on must move the bytes (so the write really persisted), a write back at the recorded clock must equal the TS bytes again"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/tests/state_roundtrip.rs
  modified:
    - src-tauri/crates/gamelib-humble/src/stores.rs

key-decisions:
  - "A corrupt file is Unreadable when the host opened it read-only because it could not read it (every user-state and account file); a rebuildable cache the host restarted empty (humble_sync, humble_steam_appid, StartEmpty) is usable, with the aside copy holding the original bytes. The plan says a corrupt file is 'never reset'; for the two caches that would leave the sync timestamp unwritable for good and re-copy the file at every open, so they follow the host's cache rule (85 D-05) and the nine files that cannot be refetched follow the plan."
  - "clear_on_disconnect attempts config, library and sync in the TypeScript order and returns a ClearReport instead of stopping at the first failure: the TS clear threw before the later wipes, but a failed config clear is the caller's to surface (it is first in the report), and an unreadable library must not stop the credential file and sync state from being cleared. An unreadable file is reported, never overwritten."
  - "A record update patches the fields it owns over the existing record (Entry::with, JS spread semantics) rather than rebuilding it, so a field a later writer adds survives a Rust write; the SyncPatch applies in the order the fields were named, over the {syncedAt: null, syncError: 'none'} default before the first sync."
  - "The typed write for the audit trail refuses (InvalidData) an existing value that is not an array instead of replacing it."

patterns-established:
  - "the recorded TS bytes are the only expected values: the sync timestamp, the library rewrite and the clear set take their inputs (syncedAt, syncError, classifierVersion, the legacy keys) from the golden's own events and their expected bytes from its after files"

requirements: [SVC-04]
duration: 75min
completed: 2026-11-24
---

# Phase 94 Plan 19: The Humble store layer and the D-07 byte round trip Summary

**All eleven Humble files are read and written through the Rust StoreHost by typed views that keep unknown fields, replay byte for byte against the TypeScript's recorded files, copy a corrupt file aside without ever resetting it, and disconnect clears exactly the config, library and sync files.**

## What was built

- **Task 1 (tracer): the typed layer in `stores.rs` and `tests/state_roundtrip.rs`.** A typed read and a typed write per store, all over the host's ordered `Json` and its dot-path `set` (never `serde_json::to_string_pretty`, `grep -c` is 0): the config flags and username; the library entries; the sync state (`SyncPatch`, `{...current, ...patch}` over the first-sync default); the four timestamp records (`StampStore`: revealed, ownership override, gifted-at, settle-declined); local redeemed (an absent `source` stays absent and reads as `user` through `origin()`); the notified expiration; the audit trail (`append_audit`, `put_audit`); and the Steam app-id cache. A keyed write is the `CacheStore.set` pair, the record then `__timestamp.<key>` with the JS `Date()` text. `put_app_id_entry` now goes through the same helper.
- **The byte round trip over the 94-08 files.** `every_humble_file_written_back_through_the_host_is_byte_identical` seeds the eleven `all-eleven-files-populated-by-real-flows` files one at a time, reads each through its typed view and writes it back (the file is untouched), writes it again a minute later (the bytes must move, so the write really persisted), and writes it back at the recorded clock (the bytes equal the TS file: key order, tab layout, number text, `__timestamp`). The config has no timestamps, so a flag flip stands in. 11 of 11 identical.
- **The sync and the backfill.** `noop-sync-within-a-second` replays the sync timestamp (syncedAt, syncError and classifierVersion taken from the golden's own `humbleSyncStateChanged` event) over the `before` files and the result equals every `after` file with only `humble_sync` changed; `noop-sync-a-minute-later` adds the library rewrite and changes exactly `humble_library` and `humble_sync`; the legacy golden runs `detect_and_notify_expiration_transitions` over the legacy bytes and equals the after-backfill file. The manifest set (9 files, floor 6) is asserted against the directory.
- **Task 2: corrupt files and the disconnect clear set.** `HumbleStore::open_checked` turns the host's read-only-failed outcome into `StoreRead::Unreadable`, and every typed read and write goes through it, so no read answers "empty" for a corrupt file and no write replaces one. The golden's two corrupt inputs (the library and the config), and `humble_revealed` and `humble_audit` fed the corrupt library bytes, are each checked: the read is unreadable, every typed write is refused as unreadable, the file on disk equals the corrupt input, and exactly one `.corrupt.` aside copy holds the same bytes. `clear_on_disconnect` clears the three files with `Op::Clear` and the test compares all eleven files with 94-09's `disconnect-wipes-credentials-and-keeps-the-user-state` after-bytes: three moved (config, library, sync), the seven user-state files and the Steam app-id cache are byte-identical. A second case seeds a corrupt library and shows the report names it as unreadable, the file is kept, and the config and sync are still cleared.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's "never reset" does not hold for the two rebuildable caches**
- **Found during:** Task 2 design (the host's engine, `open_file`)
- **Issue:** the host starts a corrupt cache (`humble_sync`, `humble_steam_appid`) empty and copies the bytes aside (`StartEmpty`); only user-state and account files open read-only. Refusing every write to a corrupt cache would leave `humble_sync` unwritable for good and re-copy it on every open.
- **Fix:** the cache follows the host rule (copy aside, restart, writable), the nine non-refetchable files are `Unreadable`. Both are tested (`a_corrupt_cache_is_copied_aside_and_restarts_empty`, `a_corrupt_user_state_file_is_copied_aside_and_never_reset`), and the aside copy keeps the original bytes in both.
- **Files modified:** `stores.rs`, `state_roundtrip.rs`
- **Commit:** bf1eac237

### Choices where the plan was silent or loose

- **Task 2's TDD order.** The plan marks Task 2 `tdd="true"`. The unreadable handling and the typed layer had to exist together (every typed read returns `StoreRead`), so the Task 1 commit carries the `StoreRead`/`WriteError` types and the Task 2 commit adds `clear_on_disconnect` and the corrupt and disconnect tests; there is no separate RED commit.
- **"A corrupt `humble_revealed`".** The golden's corrupt inputs are the library and the config, not the revealed file. Both are used, and `humble_revealed` and `humble_audit` are fed the library's corrupt bytes so the plan's named case is covered.
- **`lib.rs` was not changed.** It was in the plan's file list; `pub mod stores` was already there and no op is added (nothing reaches these functions before 94-25).
- **"Run `detect_and_notify_expiration_transitions` over the legacy case"** is replayed here from the same golden 94-17 uses in `golden_alerts.rs` (the digest's own notification text is that test's concern; here only the store bytes are compared).
- **Minute-later sync.** Beyond the plan's within-a-second case, the minute-later golden is replayed too (library timestamps), because it is the case where the writer's `__timestamp` and entry text are all exercised.

## Verification

- `cargo test -p gamelib-humble --test state_roundtrip`: 11 passed. `cargo test -p gamelib-humble`: every suite passes (244 lib tests, golden_alerts, golden_app_id_resolver, golden_reads, vectors).
- `cargo clippy -p gamelib-humble --all-targets -- -D warnings` and `cargo fmt -p gamelib-humble --check`: clean.
- `grep -c "to_string_pretty" stores.rs` is 0; `grep -c "pub fn clear_on_disconnect" stores.rs` is 1.
- `pnpm planning-gates` 12/12, `pnpm find-deadcode` (310 baselined, unchanged), `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean, `testContainment`, `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule` and `storeMirrorSchedule` all pass.
- The tracer gate: the `<verify>` command was re-run on the committed Task 1 slice (7 tests) before Task 2 began, and passed.

## Not verified locally

- macOS and Linux CI legs were not run; nothing here is platform-specific (the corrupt-file test uses file bytes only, the clock is pinned).

## Windows-only failures

None.

## Known Stubs

None. The typed functions have no caller until the library sync and the user flows are ported (94-25 and later); nothing is wired to a renderer or an op yet, and `OPS` is unchanged.

## Threat Flags

None. T-94-34 (the eleven files): every write goes through the host's ops, the round trip and the clear set are proved over the TS-written bytes, and a corrupt file is kept. T-94-35: the only new copy is the host's aside copy beside the original, which the host already makes.

## Self-Check: PASSED

- `src-tauri/crates/gamelib-humble/src/stores.rs` and `src-tauri/crates/gamelib-humble/tests/state_roundtrip.rs` exist.
- Commits 7b21e1fa9 and bf1eac237 are on `gsd/phase-94-humble-bundle-and-shortcuts`.

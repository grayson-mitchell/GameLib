---
phase: 85-store-host-config-and-versioned-migrations
fixed_at: 2026-11-22T00:00:00Z
review_path: /Users/graysonmitchell/Projects/GameLib/.planning/phases/85-store-host-config-and-versioned-migrations/85-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 85: Code Review Fix Report (round 2)

**Fixed at:** 2026-11-22
**Source review:** `.planning/phases/85-store-host-config-and-versioned-migrations/85-REVIEW.md` (round 2)
**Iteration:** 2 (overwrites the round-1 report, committed at 3a6d303ef)

**Summary:**
- Findings in scope: 3 (D-WR-01, D-WR-02, D-WR-03; the D-IN findings were left alone as instructed)
- Fixed: 3
- Skipped: 0

**Verification ran in the main checkout** (`workflow.use_worktrees` is `false`), so the numbers reproduce from this tree. Each fix staged only the exact paths it edited; none of the protected files carrying unrelated uncommitted work was touched.

## Fixed Issues

### D-WR-01: The post-children store wait does not wait for the sidecar's reader

**Files modified:** `src-tauri/src/main.rs`, `src-tauri/src/shell_state.rs`, `src-tauri/src/sidecar.rs`
**Commit:** f7f154b01
**Status:** fixed: requires human verification (exit ordering, logic bug class)
**Applied fix:** `SidecarState` gained a `ReaderDone` signal (a flag plus a condvar). The stdout reader thread sets it the moment `reader.lines()` ends, before the EOF teardown that can take seconds, and store frames are enqueued inline on that thread, so the signal means every frame the pipe carried is queued. `handle_exit`'s children stage now waits for it, then samples `store_boot::drain`, with both waits spending `grace.saturating_sub(stage.elapsed())` (the stage's own share of the one `ExitBudget::DEFAULT`; no budget of its own, no hand-rolled kill, no new registrant needed since no new in-flight work is added). A reader still open at the sample is logged ("sidecar stdout still open at the store frame sample"). `Option::is_none_or` was avoided for the crate's 1.77.2 MSRV.
**Limit kept honest in the comment:** if `shutdown_child` and `terminate_all` already used the whole grace, the wait is a bare sample. That is the budget's own limit and was not widened. If a panic ever killed the reader thread the flag would not be set, and the wait simply times out at its bound.
**Tests:** two new unit tests (`shell_state::tests`: timeout and zero-bound sample; wake on mark and latch). Test-mod name is `tests` because `tauriShellSource.test.ts` pins the set of non-`tests` mod names.

### D-WR-02: The capped `GAMELIB_STORE_BOOT` drops the core stores first, and `truncated` has no reader

**Files modified:** `src-tauri/src/store_boot.rs`, `src/backend/stores/storeRoot.ts`, `src/backend/stores/mirrorCell.ts`, `src/backend/stores/__tests__/storeRoot.test.ts`, `src/backend/stores/__tests__/mirrorCell.test.ts`
**Commit:** 4c27efe9d
**Applied fix:**
1. `boot_env_value` now spends the 16 KiB budget by importance: non-`GamesConfig/*` read-only stores first, then every start-empty cache, then `GamesConfig/*` documents last, so a cut only loses per-game documents. An entry that does not fit is skipped and marks the cut (no longer sticky), so `startEmpty` is no longer refused wholesale. New test `a_truncated_report_keeps_the_core_stores_and_the_caches_and_cuts_per_game_documents` (10,000 per-game documents plus `steam_store/config`, `store/config`, `store/timestamp` and a start-empty cache; all of the latter are kept).
2. `readStoreBootEnv` surfaces `truncated` (only a literal `true`; the field is optional so existing `StoreBootEnv` literals still compile). `MirrorRegistry.cellFor` logs once, naming only the store key, when a store in neither list is opened under a truncated report.
**Deliberate deviation from the review text:** the review offered "treat an unlisted store as read-only until its first `changed` event, or at least log once". I took "log once". The host sends no initial event for a healthy store, so read-only-until-changed would have blocked writes to ordinary stores indefinitely. The unlisted store stays writable, and a refused write still reverts through the shell's event. This is a weaker disposition than the review's preferred one: for an omitted read-only store the optimistic apply-then-revert still happens.

### D-WR-03: `hydrateStoreSnapshot` returns before the re-fetch it defers to has landed

**Files modified:** `src/preload/tauriTransport.ts`, `src/preload/__tests__/tauriTransport.test.ts`
**Commit:** efe601a78
**Applied fix:** `hydrateStoreSnapshot` records each store it skips for a raced `invalidated` push and, at the end, awaits `settleRefetches`. That follows each store's `inflight` task until none remains (an invalidation arriving while a fetch runs queues another behind it, so one `await` was not enough), raced against a `BOOT_REFETCH_WAIT_MS` (5 s) timer that is cleared on settle, so boot cannot hang if the re-fetch never answers. A rejected fetch is already caught inside `hydrateStore`, so the wait cannot throw. Doc comment updated.
**Tests:** two new tests: the order the review named (snapshot lands first while the re-fetch is pending; the function must not return until it lands, the store ends populated and a synchronous read does not warn), and the bound (a never-answering re-fetch releases boot after 5 s, using fake timers). Both fail with the `await` removed.

---

## Test results

- `cargo test -p gamelib-shell`: 695 passed, 0 failed (2 ignored). The known `safety_a_removed_app_data_target_evicts...` flake did not fail.
- `cargo test -p gamelib-store`: all suites passed (149, 8, 2, ...).
- `pnpm jest src/backend/stores src/backend/__tests__/storeReadOnly.test.ts`: 445 passed.
- `pnpm jest src/preload`: 216 passed.
- `pnpm jest` of `tauriShellSource`, `quitTeardownWiring` and `sidecarShutdownFlagSource`: passed (after renaming the new test mod to `tests`).
- `npx prettier --check` over every changed TS path: clean. `rustfmt --check` over the changed Rust files: clean for the lines I added (the repo has unrelated pre-existing fmt drift in `ipc_contract.rs`, left alone).
- `tsc --noEmit` reports no errors in the changed TS files.

---

_Fixed: 2026-11-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_

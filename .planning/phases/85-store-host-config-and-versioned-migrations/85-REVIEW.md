---
phase: 85-store-host-config-and-versioned-migrations
reviewed: 2026-11-22T00:00:00Z
depth: standard
round: 2
round_1_commit: 5714cafea
files_reviewed: 27
files_reviewed_list:
  - meta/__tests__/storeCorpus.test.ts
  - meta/harvestStoreCorpus.ts
  - src-tauri/crates/gamelib-store-cli/src/main.rs
  - src-tauri/crates/gamelib-store/src/atomic.rs
  - src-tauri/crates/gamelib-store/src/dotpath.rs
  - src-tauri/crates/gamelib-store/src/envelope.rs
  - src-tauri/crates/gamelib-store/src/host.rs
  - src-tauri/src/log_upload.rs
  - src-tauri/src/main.rs
  - src-tauri/src/native_router.rs
  - src-tauri/src/safety_dispatch.rs
  - src-tauri/src/store_boot.rs
  - src-tauri/src/store_dispatch.rs
  - src-tauri/src/store_native.rs
  - src/backend/__tests__/storeMirrorSchedule.test.ts
  - src/backend/game_config.ts
  - src/backend/sidecar/gameSettingWrite.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/stores/__tests__/settingsDocs.test.ts
  - src/backend/stores/__tests__/storeWritePath.test.ts
  - src/backend/stores/mirrorCell.ts
  - src/backend/stores/storeFrames.ts
  - src/backend/testUtils/testConfig.ts
  - src/backend/utils/uninstaller.ts
  - src/preload/__tests__/tauriTransport.test.ts
  - src/preload/tauriTransport.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 85: Code Review Report (round 2)

**Reviewed:** 2026-11-22
**Depth:** standard
**Round:** 2 (round 1 was committed at 5714cafea; the fixer landed 19 fixes, one commit each)
**Files Reviewed:** 27
**Status:** issues_found

## Round-1 fix verdicts

| Round-1 id | Commit | Verdict |
|---|---|---|
| A-WR-01 | 58dbcb8c5 | verified |
| A-WR-02 | fe76120d1 | verified |
| A-WR-04 | 8861f6f3d | verified |
| A-WR-05 | 8805d74cd | verified |
| A-WR-06 | bfd28ae47 | verified (test is weak, D-IN-03) |
| B-WR-01 | 4a743b730 | verified (side effect noted in D-IN-01) |
| B-WR-02 | 1b23669f1 | incomplete (D-WR-01) |
| B-WR-03 | 2ff2aa7b7 | incomplete (D-WR-02) |
| B-WR-04 | 7cddb57f9 | verified |
| B-WR-05 | 66cc1deb5 | verified (the two parts the fixer left open stay open, not re-raised) |
| B-WR-06 | 6951c3392 | verified (renderer-side gap in D-IN-04) |
| B-WR-07 | feae34d50 | verified (TS drift in D-IN-02) |
| B-WR-08 | a8fcd4a2b | verified (side effect noted in D-IN-01) |
| B-WR-09 | bc1a7ece6 | verified |
| C-WR-02 | 97aed9670 | verified |
| C-WR-03 | ff0988f17 | verified |
| C-WR-04 | e3b769703 | verified |
| C-WR-05 | abf1d82da | verified |
| C-WR-06 | b6f1d968d | incomplete (D-WR-03) |

Totals: 16 verified, 3 incomplete (B-WR-02, B-WR-03, C-WR-06), 0 regressed.

How it was checked. Every diff `5714cafea..HEAD` was read against the full file and the round-1 finding text. The new tests were run: the gamelib-shell tests `a_durable_slice_runs...`, `store_native_a_confirmed_write...`, `store_frame_a_panic...`, `a_huge_downgrade_report...` and `safety_only_a_request...` pass (the first two also 8 times in a row); `jest` over `meta/__tests__/storeCorpus.test.ts`, `src/preload/__tests__/tauriTransport.test.ts` and `src/backend/stores/__tests__` passes (432 tests). No Rust shutdown or spawn convention is broken: B-WR-01 holds a `Shutdown` registrant for exactly as long as the job is queued or running, B-WR-02 spends no budget of its own, and no new spawn was added.

## The `safety_a_removed_app_data_target_evicts...` flake

The flake predates the fixes. I reproduced it: 15 rounds of 24 concurrent runs of that one test on the pre-built binary gave 4 failures, each with the same assertion at `safety_dispatch.rs:230`, `left: [(1, applied), (2, refused/evicted)]`, `right: [... (3, applied)]`. Cause: `Dispatcher::new` registers `host.on_any_change` (`store_dispatch.rs:418`), so the host has a listener and `Dispatcher::reply` goes through `host.post` onto the `store-events` thread. The test calls `dispatcher.wait_idle` and then reads the `events` sink without the `delivered(&host)` barrier the other store_dispatch tests use (`settle`). The last event can still be in flight. B-WR-04 and B-WR-05 only changed `rpc_safety_remove_tree`, `removed_app_data_targets` and the `has_app_data_target` helper. This test does not call `rpc_safety_remove_tree`, and its body and the dispatcher flow it exercises are byte-identical across the range, so the fixes cannot have introduced it. The fixer's diagnosis was right. Fix: call a `delivered(&host)`-style post-and-wait on `host` before reading `events` (the helper is private to `store_dispatch::tests`, so expose it `pub(crate)` or inline the three lines). No finding id is spent on it because it is a test-only race that predates the phase's fixes; the orchestrator can file it as a todo.

## Warnings

### D-WR-01: The post-children store wait does not wait for the sidecar's reader, so late frames are still missed (reopens B-WR-02)

**File:** `src-tauri/src/main.rs:965-978`, `src-tauri/src/store_dispatch.rs:647-662`
**Issue:** B-WR-02 said the correct wait point is after the sidecar has stopped, "reader EOF". The fix calls `store_boot::drain(grace - stage.elapsed())` after `shutdown_child` and `terminate_all`. `drain` is `store_dispatch::wait_idle`, which returns `true` the instant `queue.items` is empty and no frame is `busy`. Nothing observes whether the stdout reader thread (`sidecar.rs:428-576`) has read the sidecar's last bytes yet. When the child exits, its final frames can still sit in the pipe buffer. The reader has not enqueued them, the queue looks idle, and `wait_idle` returns at once. The frames are then lost when `finish` runs. Second gap: `shutdown_child(grace)` and `terminate_all(grace)` can each use the whole `grace`, so a slow sidecar (the case that produces late frames) leaves `grace.saturating_sub(stage.elapsed())` at zero and `wait_idle(0)` is a bare sample. The registrant that the worker takes on enqueue does not help, because `shutdown.drain` has already returned by the children stage. The new log line "store frames still pending after the sidecar stopped" only fires for frames already queued.
**Fix:** Give `SidecarState` an "stdout reader finished" signal (an `AtomicBool` plus the existing condvar pattern, set when `reader.lines()` ends) and have the post-children step wait for it, bounded by what is left of the grace, before sampling `store_boot::drain`. Keep the bound inside the one budget as now. If the reader signal is not wanted, say in the comment that the step is a best-effort second sample and weaken the B-WR-02 disposition accordingly.

### D-WR-02: The capped `GAMELIB_STORE_BOOT` drops the core stores first, and the `truncated` marker has no reader (reopens B-WR-03)

**File:** `src-tauri/src/store_boot.rs:219-262`, `src/backend/stores/storeRoot.ts:92-136`
**Issue:** The spawn failure is fixed: the value is bounded at 16 KiB. Two things in the follow-on behaviour are not right.
1. Entries are kept in report order, and the report follows table order, which is sorted by key (`src/common/types/ipc/storeTable.json`): `gog_store/*`, `humble_store`, `legendary_store`, `nile_store`, then `settings/game` (every `GamesConfig/<app>` document, sorted by name), `settings/global`, `sideload_apps/library`, `steam_store/config`, `store/config` and the rest of `store/*`, then `store_cache/*`. After a downgrade each document is `ReadOnly { Newer }`, and at about 46 bytes per entry roughly 350 `GamesConfig/*` documents fill the cap. The entries that fall off are `steam_store/config`, `store/config`, `store/timestamp`, the other `store/*` user-state stores, and every `startEmpty` entry (once `truncated` is set, `take` refuses all further entries, including `startEmpty`). So the most important stores are the ones the sidecar mirror is not told about.
2. `"truncated":true` is write-only. `readStoreBootEnv` ignores unknown keys (the fix report says so deliberately), so nothing treats an unlisted store as read-only until the host's `changed`/`refused` events arrive, which is what B-WR-03's fix text asked for. For an omitted read-only store the mirror therefore applies writes to its view, the shell refuses them, and the view reverts after the nack. For an omitted `startEmpty` cache the mirror loads the corrupt file itself.
**Fix:** Order what is kept by importance: non-`GamesConfig` stores first, then `GamesConfig/*` last (or interleave by family), so a cut only loses per-game documents. Have `readStoreBootEnv` surface `truncated`, and have the mirror treat a store absent from both lists as read-only until its first `changed` event, or at least log once. Add a test that a truncated report keeps `store/config`.

### D-WR-03: `hydrateStoreSnapshot` now returns before the re-fetch it defers to has landed (reopens C-WR-06)

**File:** `src/preload/tauriTransport.ts:375-380`, doc comment at `:360-366`
**Issue:** The fix skips a store whose snapshot raced an `invalidated` push, leaving it to the re-fetch that the push started. The function's own contract is that it "must be awaited before React mounts", because the Steam login gate and the library store read `snapshotGet` synchronously during `initStateSubscriptions`. The skipped store is neither written nor `hydrated`, and `hydrateStoreSnapshot` does not wait for the re-fetch, which was only started and is held in `inflight`. Boot then proceeds, and a synchronous read of that store sees `{}` or `undefined`, takes the lazy-miss path (`reportLazyMiss`, default value) and is not reactive. For an eager store such as `steamConfigStore` the first render can show the logged-out state, and the first paint is the very read C-WR-06's boot ordering was built to get right. The regression test passes only because it resolves the re-fetch before the snapshot and then awaits `hydrating`; it never checks the order where the re-fetch is still pending.
**Fix:** After the `continue`, collect `inflight.get(storeName)` for each skipped store and `await Promise.all(...)` them at the end of `hydrateStoreSnapshot` (a rejected fetch is already caught inside `hydrateStore`, so the await cannot throw). Add a test where the re-fetch resolves after `await hydrating` is requested and assert the store is populated when the function returns.

## Info

### D-IN-01: The store slice's queue is now owned by the context its own worker holds, so the worker thread can never end

**File:** `src-tauri/src/native_router.rs:75-77, 128, 467-480`
**Issue:** B-WR-08 stores a clone of the store `SliceQueue` (a `Sender` plus a `Shutdown` clone) in `NativeCtx.store_queue`. The slice worker's handler closure owns `Arc<NativeCtx>`, so the channel's last `Sender` is owned by something the worker owns, and `for (job, queued) in rx` never ends. Dropping the `NativeRouter` used to end every slice worker; it no longer ends the store one. In production the router lives for the process, so nothing visible changes. In tests every `NativeRouter` built with a store slice leaks one parked thread. It also contradicts the module's own claim that the worker ends when the queue is dropped.
**Fix:** Store a `Weak`-style handle, or keep the sender out of `NativeCtx` and give `store_set_checked` a way to reach the queue through the router (for example pass the queue into the invoke handler's closure at registration). If the cycle is accepted, note it next to `store_queue`.

### D-IN-02: The Rust game-config name rule is now closed, and the TS rule is still the old deny list

**File:** `src-tauri/crates/gamelib-store/src/host.rs:527-580`, `src/backend/stores/storeFrames.ts:56-65`
**Issue:** B-WR-07's `plain_segment` accepts only ASCII letters, digits, `-`, `_`, `.` and space, and refuses device names. TS `isPlainAppName` (and so `isStoreKey` / `GameConfig.writeToFile`) still accepts anything without `/`, `\`, NUL or `..`. A name only TS accepts (a `:`, `*`, a non-ASCII letter, `NUL`) therefore passes the sidecar's own gate, is sent as a `replace` frame, is nacked by the shell, and the mirror drops it with no error. The boot sweep silently skips an existing document of such a name. The doc comments on both sides still say they are one rule ("`isPlainAppName` on the TS side"). The real name sources I checked are fine (Steam and GOG numeric ids, Epic and Amazon ids, short-uuid base58 for sideloads, `SideloadDialog` line 162); a hand-typed sideload name in edit mode was not traced.
**Fix:** Port the same closed class and device-name check to `isPlainAppName`, and add a shared vector (`storePolicyVectors.json`) with `C:foo`, `name:stream`, `NUL`, `con.txt`, a trailing dot and a trailing space so the two cannot drift again.

### D-IN-03: The temp-collision test can pass without colliding

**File:** `src-tauri/crates/gamelib-store/src/atomic.rs:248-260`
**Issue:** `a_leftover_temp_with_the_next_name_is_skipped_not_fatal` reads `TMP_SEQ` and squats the next three names. `TMP_SEQ` is process-global and other tests in the same binary call `write_atomic` concurrently, so by the time this test writes, the counter can already be past the squatted range. Then no name collides and the test passes without exercising the retry. It cannot fail spuriously, but it can prove nothing.
**Fix:** Squat a wider window (say the next 64 names) or make the sequence injectable (`write_atomic_with` already takes a writer parameter; a `seq` hook would do), then assert the final file content and that the orphans are untouched.

### D-IN-04: The renderer still applies an empty-segment key to its own snapshot optimistically

**File:** `src/preload/tauriTransport.ts:620-627`, `src/common/types/storePolicy.ts:85-89`
**Issue:** B-WR-06 is fixed on the shell, which now refuses `a..b`, `.x` and `x.` as `KeyPath`. The renderer's `isSafeKeyPath` (and so `snapshotSet`) still lets them through, and `snapshotSet` writes the local snapshot before the shell refuses, so the renderer snapshot holds a key that no process persisted until the window reloads. The B-WR-06 text suggested making `is_safe_key_path` itself reject empty segments plus a vector row so both sides agree; the fix put the check in `check_write_policy` only. Low reachability (no caller builds such keys).
**Fix:** Reject empty segments in `isSafeKeyPath` and `is_safe_key_path` together and add the vector row, so the rule has one definition on each side.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

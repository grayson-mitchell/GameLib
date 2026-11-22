---
phase: 85-store-host-config-and-versioned-migrations
fixed_at: 2026-11-22T00:00:00Z
review_path: .planning/phases/85-store-host-config-and-versioned-migrations/85-REVIEW.md
iteration: 1
findings_in_scope: 21
fixed: 19
skipped: 2
status: partial
---

# Phase 85: Code Review Fix Report

**Fixed at:** 2026-11-22
**Source review:** .planning/phases/85-store-host-config-and-versioned-migrations/85-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 21 (the 22 warnings minus B-WR-10, which carries `**Category:** necessity` and is out of scope for `critical_warning`)
- Fixed: 19
- Skipped: 2 (A-WR-03, C-WR-01)
- Out of scope, untouched: B-WR-10 (necessity finding; removing code is the human's scope decision)

Where verification ran: the main checkout (`workflow.use_worktrees` is `false`), not an isolated worktree. The numbers below are reproducible from the tree as committed.

Verification run per fix: `cargo test -p gamelib-store` (and `-p gamelib-store-cli`) for the store crates; `cargo test -p gamelib-shell` filtered to the touched modules for the shell, then the whole `gamelib-shell` suite at the end; `npx jest <paths>` for TypeScript (the project uses jest, not vitest); `npx prettier --check` over the exact TS paths; `npx tsc --noEmit` (main) and `tsc -p tsconfig.meta.json` after the type-touching fixes.

Test failure observed: in one of four full `cargo test -p gamelib-shell` runs, `safety_dispatch::tests::safety_a_removed_app_data_target_evicts_open_and_queued_stores_and_nothing_is_recreated` failed once. It passed on three immediate re-runs, in isolation and in the full suite. The test reads its `events` sink right after `wait_idle` without waiting for the host's event thread to deliver (`delivered(&host)` is not called), so it is a pre-existing timing flake in the test and not something these fixes introduced. Left alone, out of scope.

The unrelated uncommitted work in `src/backend/cache.ts`, `cache.test.ts`, `sidecar/handlers.ts`, `sidecar/shellFilesFlowRegistration.ts`, `sidecar/__tests__/shellFilesFlows.test.ts`, `storeManagers/gog/library.ts`, `gog/__tests__/library.test.ts` and the dirty `.planning/` files was never staged, edited, reverted or stashed. Every commit named its paths explicitly.

## Fixed Issues

### A-WR-01: `Synced` writes never fsync the parent directory
**Files modified:** `src-tauri/crates/gamelib-store/src/atomic.rs`
**Commit:** 58dbcb8c5
**Applied fix:** After a successful rename of a `Synced` write, the parent directory is opened and `sync_all`-ed (Unix only, best effort). The `Durability::Synced` doc now states what it covers.

### A-WR-02: Refuse-newer fails open for absurd stamped versions in the engine
**Files modified:** `src-tauri/crates/gamelib-store/src/envelope.rs`
**Commit:** fe76120d1
**Status:** fixed: requires human verification (logic change to a version-gate decision)
**Applied fix:** `store_version` and `settings_version` clamp a version beyond `u32` to `u32::MAX` (so the file reads as newer and is refused), matching `version_gate::codec_version`. The test that pinned `99999999999 -> 0` was replaced by one expecting `u32::MAX`, including the `1e20` float and `"v99999999999..."` settings forms.

### A-WR-04: `dotpath::set` has no bound on array index or path depth
**Files modified:** `src-tauri/crates/gamelib-store/src/dotpath.rs`
**Commit:** 8861f6f3d
**Status:** fixed: requires human verification (new limits)
**Applied fix:** `set` returns false (so `ops::apply` maps it to `KeyPath` and the host rolls back) for more than `MAX_SET_DEPTH` (64) segments, or an array index more than `MAX_SET_HOLE` (1024) past the array's end. Test covers `list.4294967290` and a 100,000-segment path.

### A-WR-05: `gamelib-store-cli open --dry-run` leaves token stores in the temp dir on error
**Files modified:** `src-tauri/crates/gamelib-store-cli/src/main.rs`
**Commit:** 8805d74cd
**Applied fix:** A `Scratch` drop guard removes the scratch tree on every normal exit and on a panic; the copy-error arm removes it explicitly before `exit(2)` because `exit` skips destructors.

### A-WR-06: A leftover temp file collision fails the write instead of retrying
**Files modified:** `src-tauri/crates/gamelib-store/src/atomic.rs`
**Commit:** bfd28ae47
**Applied fix:** The `create_new` temp open retries with the next sequence number on `AlreadyExists`, up to 8 attempts. Added a test that squats on the next three names. The optional sweep of old `*.tmp` orphans was not added.

### B-WR-01: Queued renderer store writes are dropped at exit and nothing drains them
**Files modified:** `src-tauri/src/native_router.rs`
**Commit:** 4a743b730
**Status:** fixed: requires human verification (exit-path behaviour)
**Applied fix:** `spawn_slice_worker_with(..., durable, ...)`. For the `store` slice each enqueue holds a `Registrant` until its job has run, so the exit drain waits for the whole backlog, and a job queued before the drain still runs after the token is cancelled. Other slices keep D-14 drop-on-cancel (`spawn_slice_worker` is a wrapper). Test added.

### B-WR-02: The `store` drain runs while the sidecar is alive, and no wait follows the child stage
**Files modified:** `src-tauri/src/main.rs`
**Commit:** 1b23669f1
**Status:** fixed: requires human verification (exit-path behaviour)
**Applied fix:** In the children stage of `handle_exit`, after `shutdown_child` and `terminate_all`, `store_boot::drain` runs once more, bounded by what is left of that stage's grace (no new budget). A frame still pending is named in one log line. The source-text gates `quitTeardownWiring` and `tauriShellSource` still pass.

### B-WR-03: `GAMELIB_STORE_BOOT` has no size bound
**Files modified:** `src-tauri/src/store_boot.rs`
**Commit:** 2ff2aa7b7
**Applied fix:** `boot_env_value` caps its entries at `BOOT_ENV_MAX_BYTES` (16 KiB) and appends `"truncated":true` when it left some out. A write to an omitted read-only store is refused by the shell and dropped by the mirror, and the host's own events carry the rest. The TS parser ignores unknown keys, so it needed no change and was not touched.

### B-WR-04: `safety_remove_tree` pauses the whole frame worker for the whole delete
**Files modified:** `src-tauri/src/safety_dispatch.rs`
**Commit:** 7cddb57f9
**Applied fix:** The pause is taken only when the request holds an `app-data` target (`has_app_data_target`). Test added.

### B-WR-05: Eviction runs only on a fully `removed` outcome
**Files modified:** `src-tauri/src/safety_dispatch.rs`
**Commit:** 66cc1deb5
**Status:** fixed: requires human verification (partial: see below)
**Applied fix:** `app-data` targets are evicted for `removed` and `failed` outcomes; only `refused` evicts nothing. Module doc and test updated. Not done, and left for a human decision: (a) pausing renderer store writes (`storeSet`, `storeDelete`, `store-set-checked`) while a removal pause is held, and (b) building the eviction path from the reply's canonical paths instead of the raw request string. Both were phrased as "consider" in the review and need a design choice.

### B-WR-06: The renderer write policy accepts keys the sidecar mirror then drops
**Files modified:** `src-tauri/src/store_native.rs`
**Commit:** 6951c3392
**Applied fix:** `check_write_policy` refuses any key with an empty segment (`a..b`, `.x`, `x.`) as `KeyPath`. Test cases added. `is_safe_key_path` and `storePolicyVectors.json` were not changed.

### B-WR-07: `plain_name` accepts `:`, so a `GamesConfig/<app>` name can escape its directory on Windows
**Files modified:** `src-tauri/crates/gamelib-store/src/host.rs`, `src-tauri/src/store_dispatch.rs`
**Commit:** feae34d50
**Status:** fixed: requires human verification (the character class now narrows what an app name may be)
**Applied fix:** `host::plain_segment` is now `pub` and a closed class (ASCII letters, digits, `-`, `_`, `.`, space; no trailing dot or space; no Windows device names `CON`, `NUL`, `COM1`...). `store_dispatch::plain_name` delegates to it, so there is one definition. Tests extended with `C:foo`, `name:stream`, `NUL`, `con.txt`, `COM1`, trailing dot or space, `*`, `?`. TS `isPlainAppName` is unchanged and still looser; a name only TS accepts is refused by the shell and nacked.

### B-WR-08: Confirmed writes are not ordered against fire-and-forget writes
**Files modified:** `src-tauri/src/native_router.rs`, `src-tauri/src/store_native.rs`, `src-tauri/src/main.rs`, `src-tauri/src/log_upload.rs`
**Commit:** a8fcd4a2b
**Status:** fixed: requires human verification (concurrency)
**Applied fix:** `sidecar:store-set-checked` is queued on the same `store` slice worker as `storeSet`/`storeDelete` (a new `SendPayload::StoreChecked` carrying a reply channel, `NativeCtx.store_queue` set by the router) and answered through that channel. With no slice queue (bare test context) it falls back to the old blocking-thread path. `main.rs` and `log_upload.rs` only gained the new `store_queue: Default::default()` field. Test added that alternates a send and a confirmed write on one key for 25 rounds and checks the confirmed value always wins.

### B-WR-09: A panic while handling a frame leaves it unanswered forever
**Files modified:** `src-tauri/src/store_dispatch.rs`
**Commit:** bc1a7ece6
**Applied fix:** `(seq, store)` is captured before `handle`; on a caught panic the worker replies `refused` with reason `rejected`. Test uses a writer that panics once, then checks the panicked frame is answered and the next one applied.

### C-WR-02: Uninstall's "remove settings" leaves the cached `GameConfig` instance serving
**Files modified:** `src/backend/game_config.ts`, `src/backend/utils/uninstaller.ts`, `src/backend/sidecar/installFlowRegistration.ts`, `src/backend/testUtils/testConfig.ts`, `src/backend/sidecar/gameSettingWrite.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`, `src/backend/stores/__tests__/settingsDocs.test.ts`
**Commit:** 97aed9670
**Applied fix:** `GameConfigs.forget(appName)` drops the cached instance. `removeSettingsAndLogs` calls it (optional `gameConfigs` dep) when the removal reports `removed`, and `installFlowRegistration` passes `deps.gameConfigs`. `gameSettingWrite.ts` was narrowed to `Pick<GameConfigs, 'get'>` and the test fakes gained `forget` so `tsc` stays clean. `macArch/recovery.ts` passes no `gameConfigs`, as it passes no `storeRoot`, so that path is unchanged. The review's note that the global config has the same property after a reset is not addressed.

### C-WR-03: `validateStoreFrame` measures frame size in UTF-16 code units
**Files modified:** `src/backend/stores/storeFrames.ts`, `src/backend/stores/mirrorCell.ts`, `src/backend/stores/__tests__/storeWritePath.test.ts`
**Commit:** ff0988f17
**Applied fix:** The default size is `Buffer.byteLength(JSON.stringify(frame), 'utf8')`, and `MirrorCell.write` passes the serialized line's byte length. Test: a 4M-CJK-character value (under the cap in UTF-16 units, over it in bytes) is refused `too-large`.

### C-WR-04: Corpus harvester denylist does not cover the secret key names this codebase documents
**Files modified:** `meta/harvestStoreCorpus.ts`, `meta/__tests__/storeCorpus.test.ts`
**Commit:** e3b769703
**Applied fix:** `DENY_KEY_PATTERNS` gained `/token/i`, `/cookie/i`, `/csrf/i`, `/session/i`, `/auth(?!or)/i`, `/bearer/i`. `redactString` and `redactKey` now also replace SteamID64, email and JWT shapes embedded anywhere in the text (same shapes the independent scan uses). The committed corpus still passes the scan under the wider denylist. Corpus files were not re-harvested.

### C-WR-05: Redaction silently drops a `__proto__` key
**Files modified:** `meta/harvestStoreCorpus.ts`, `meta/__tests__/storeCorpus.test.ts`
**Commit:** abf1d82da
**Applied fix:** A `setOwn` helper (`Object.defineProperty`) builds the redacted object in both `placeholderOf` and `redactValue`. Test with a parsed `{"__proto__":...}`.

### C-WR-06: Boot snapshot overwrite can clobber a newer re-fetch started by an `invalidated` push
**Files modified:** `src/preload/tauriTransport.ts`, `src/preload/__tests__/tauriTransport.test.ts`
**Commit:** b6f1d968d
**Status:** fixed: requires human verification (race handling)
**Applied fix:** In `hydrateStoreSnapshot`, a store with a buffered `invalidated` push newer than the rev the snapshot read at is skipped: the snapshot neither overwrites the store nor marks it hydrated, so the re-fetch it started owns it. Regression test races a boot snapshot against an invalidation.

## Skipped Issues

### A-WR-03: A lone-surrogate escape in a TS-written file locks a user-state, account or settings store read-only
**File:** `src-tauri/crates/gamelib-store/src/json.rs:294-296`
**Reason:** needs a product decision, not a patch. The review's first option changes `json::parse` to accept lone surrogates and rewrite them to U+FFFD, which silently alters the user's bytes. The rejection is a recorded, tested decision: `tests/fixtures/corpus/MANIFEST.json` pins `edge_lone_surrogate.json` to `readOnly-failed` (sha256 and all), the corpus NOTES and golden NOTES call it a deliberate D-18 divergence, `tests/fixtures/vectors/numbers.json` carries `rustParse: "reject"` for it, and the engine test `CORRUPT` list includes it. Implementing either option means revising that decision and every fixture and test that pins it. Not attempted so as not to force a change to a documented contract. The review's minimum ask, surfacing the read-only reason to the user, was not done either.
**Original issue:** serde_json rejects `"\ud800"` while `JSON.parse` accepts it, so a valid TS-written store file opens `ReadOnly(Failed)` for the life of the file.

### C-WR-01: `resetHeroic` deletes the settings documents but never drops their mirror cells
**File:** `src/backend/utils.ts:392-435`, `src/backend/stores/settingsDocs.ts:125`, `src/backend/stores/mirrorCell.ts:355-366`
**Reason:** file carries unrelated uncommitted WIP. `resetHeroic` has no store root: its only caller wires `{ appState, paths, config, libraryManagers, requestRustInvoke, sendFrontendMessage }` in `src/backend/sidecar/shellFilesFlowRegistration.ts` (itself dirty) from `registerHandlers` in `src/backend/sidecar/handlers.ts` (also dirty), and neither passes `storeRoot` to `registerShellFilesFlows`. Dropping the settings cells on a `removed` reset therefore needs edits to both protected files. The review's alternative (the shell sending a `reset` event or rev epoch on eviction) is a cross-layer protocol change that was not attempted. The shape of the fix once those files are free: add `storeRoot` to `registerShellFilesFlows`' deps and to `resetHeroic`'s, add a `MirrorRegistry` method that drops every cell whose path `docKeyOf` recognises, and call it after `removed.outcome === 'removed'`.
**Original issue:** until the 1 s relaunch fires, `settingsDocExists`/`readSettingsDoc` serve the deleted documents from the cell, and a write after the reset lands at shell rev 1, which the surviving cell's `baseRev` N treats as a no-op ack, so the write is on disk and invisible to readers.

## Out of scope (not attempted)

### B-WR-10: Runtime-cache allow-list `RUNTIME_CACHE_NAMES` owns nothing the table does not already own
**Category:** necessity. A WR-prefixed finding carrying `**Category:** necessity` is excluded under `fix_scope: critical_warning`, because removing code is a scope decision for the human. No edit was made. It stays open in REVIEW.md; a run with `fix_scope: all` would pick it up as `fixed: requires human verification`.

---

_Fixed: 2026-11-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

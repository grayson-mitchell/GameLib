---
phase: 86-pure-leaf-services
plan: 08
subsystem: rust-services
tags: [gamelib-info, recent-games, store-host, native-router, rustinvoke, tray, d-08, d-17, d-18, d-20]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-03's InfoCtx, dispatch/guarded and CacheView seams; 86-04's recent_games TS goldens; 86-05's delete-gate machinery"
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "the StoreHost, the store/config row (flavour store, dot paths) and the native router"
provides:
  - "gamelib-info recent module: RecentSink, list, add, remove under one Mutex, ops info_recent_add and info_recent_remove"
  - "golden_recent: every 86-04 recent golden replayed against Rust, plus idempotency, bad-args and two concurrency tests"
  - "shell info_dispatch: install (one Arc<InfoCtx> at run_setup), info_ctx, rpc_info_recent_add/remove, remove_recent (native), TrayRecentSink"
  - "the first rustInvoke info channels (RUST_INFO_RECENT_ADD/REMOVE) and the first native info channel (removeRecent, slice info), the TS registration and zod key deleted in the same commit"
  - "the tray's boot seed reads games.recent through the StoreHost"
affects: [86-09, 86-10, 86-12, 86-14, 86-15, 86-16]

actuals:
  tokens: 15000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A shell slice dispatcher builds one Arc<InfoCtx> in a OnceLock after the host opens; a handler takes the context by parameter in a `*_with` function so tests inject a FakeHome one and never install the global"
    - "A native invoke handler that does file I/O validates first (so a bad call is rejected the same before and after install), then runs the crate's async dispatch via block_on inside spawn_blocking (never dispatch_sync, which refuses a thread inside a runtime)"
    - "A RecentSink-style trait keeps the crate Tauri-free; the shell's implementation takes its emitter, tray update and menu limit as injected closures so a unit test needs no AppHandle and never reads the operator's tray settings"

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/recent.rs
    - src-tauri/crates/gamelib-info/tests/golden_recent.rs
    - src-tauri/src/info_dispatch.rs
    - .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md
    - .planning/todos/pending/2026-11-22-recent-games-drops-entries-with-empty-appname.md
  modified:
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/crates/gamelib-info/src/cache_view.rs
    - src-tauri/src/main.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/tray.rs
    - src-tauri/src/tray/recent.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/enrichment.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/enrichmentFlowRegistration.ts

key-decisions:
  - "The StoreHost never rewrites a `set` of the value a key already holds, while the 86-04 oracle's store sink rewrites it (and stamps `__internal__.gamelib.schemaVersion` onto an unstamped before-file). The one golden this touches, remove-absent-game, is asserted as: Rust leaves the before-file byte for byte, and the TS golden equals that file plus nothing but the stamp. The list, the sink payloads and the write count still match exactly"
  - "removeRecent runs the crate's async dispatch with block_on inside spawn_blocking, not dispatch_sync: a spawn_blocking thread has a runtime handle, so dispatch_sync would answer `<op>:wrong-thread`"
  - "INFO_SLICE is a named constant with no send queue: the info slice is invoke-only, so spawning a worker thread for it would be dead weight. native_manifest_info_channels_are_registered_in_the_info_slice pins that"
  - "The generator takes no length keywords, so the 1..1024 UTF-16 appName bound lives in the crate (recent::add/remove) and the native decode, not in the zod schema or the generated struct; nativeChannels.json carries it as maxLength with maxLengthUnit utf16 and the empty string in `invalid`"
  - "The sink is called under the crate's RMW Mutex, after the write, so changes reach it in write order; a sink must not block or re-enter recent. The production sink only enqueues an emit and a run_on_main_thread"

patterns-established:
  - "A guard against losing a concurrent update is proven necessary: with the Mutex replaced by a per-call mutex both concurrency tests fail on round 0 (an effect lost), with it they pass 100 rounds"

requirements-completed: []

plan_head_before: 0eb4fdc550ceef5d8c9d5c2adfbd582528e7ba2f
plan_head_after: b7dd418c6954274ec0bf0316a7daaf27faa64238

duration: 95min
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 08: Recent games in Rust and the shell's info wiring Summary

**Recent games run entirely in Rust over the StoreHost, byte-identical to the TS goldens, with the first `info` rustInvoke and native channels, a Rust-side `recentGamesChanged` emit plus tray rebuild, and the tray's boot seed read through the host.**

## Performance

- **Duration:** about 95 min
- **Completed:** 2026-11-22
- **Tasks:** 3 of 3 (1 tracer, 1 TDD, 1 auto)
- **Files:** 5 created, 16 modified

## Accomplishments

- **Tracer (Task 1).** `gamelib_info::recent` reads and writes `games.recent` through the host's `store/config` row (opened by path, deduped with the boot sweep's handle). Entries are built in the order appName, title, runner; add and remove keep the TS filter `a.appName && a.appName !== appName` (so a falsy appName is dropped, by JS truthiness), remove writes only on a non-empty list, the list is unbounded, every read-modify-write runs under one module Mutex, and the `RecentSink` is told after each write. `golden_recent.rs` replays all 11 86-04 cases over a FakeHome copy of each before-state and compares the bytes of every file left behind, the sink payloads against `events.json`, the returned list and the write count; the manifest floor (9) is carried in code and an empty case list fails the guard. The shell side: `info_dispatch::install` builds the one `Arc<InfoCtx>` right after the host opens, `rpc_info_recent_add/remove` validate with the generated args structs then call `dispatch_sync`, and `TrayRecentSink` emits `recentGamesChanged` through the shell's emitter and rebuilds the tray on the main thread with the user's `maxRecentGames`. The tracer gate (the whole verify block, re-run end to end) passed before Task 2.
- **`removeRecent` (Task 2).** `nativeChannels.json` gains `removeRecent` (slice `info`, valid `["abc"]`, invalid `[]`, `[1]`, `["a","b"]`, `[""]`); the router registers `info_dispatch::remove_recent`; in the same commit the sidecar's `ipc.handle('removeRecent')`, its import, its docstring bullet and the `enrichment.ts` zod key and return type are deleted and `NativeAsync` gains the typing (D-17: exactly one owner at every commit, `nativeChannelOwnership` green). Rejections are fixed literals via `invalid_args` and never echo the argument (a 1280-character secret probe is absent from the error). Concurrency: an add and a remove on two threads (100 rounds in the crate, 30 through the shell handlers) and 16 concurrent adds all keep every effect. The Mutex was proven necessary: replacing it with a per-call mutex fails both tests on round 0.
- **Tray seed (Task 3).** `load_recent_games_from_disk` now reads `gamelib_info::recent::list` on the installed context; with no context it seeds an empty list and logs one `shell_log` line (no file fallback). `run_setup` already seeds after the host opens and the info context is installed, so the order is safe. Four tray tests seed from a FakeHome host (populated with a legacy and a runner entry, after a host write, empty, no context). Two D-03 todos record the copied quirks.

## Task Commits

1. **Task 1 (tracer): `info_recent_add` end to end** - `604e8f425` (feat)
2. **Task 2: `removeRecent` as a native `info` channel with one owner** - `b4f5278bc` (feat)
3. **Task 3: tray boot seed through the StoreHost, copied-quirk todos** - `b7dd418c6` (feat)

**Plan metadata:** the SUMMARY commit follows this file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the plan's spec] The remove-absent-game golden cannot match byte for byte through the StoreHost**
- **Found during:** Task 1 (`golden_recent`)
- **Issue:** The plan says every recent golden's after-bytes equal the TS bytes. The 86-04 oracle's store sink applies every frame as a write, so removing a game that is not in the list rewrote the file and stamped `__internal__.gamelib.schemaVersion` onto the unstamped synthetic before-file. The StoreHost (the writer in the app since Phase 85, `Store::set`: "setting a key to the value it already holds writes nothing") does not rewrite an unchanged key. Production TS goes through the same host, so the stamp is an artefact of the oracle's emulation, not of the app.
- **Fix:** `NO_OP_REWRITES = ["remove-absent-game"]`: for that case the test asserts the Rust file is the before-file byte for byte and the TS golden equals the before-file plus only the `__internal__` stamp. The list, the sink payloads (the sink is still told, as TS emitted) and the write count match the golden exactly. The golden fixtures were not changed (86-04's).
- **Files modified:** `src-tauri/crates/gamelib-info/tests/golden_recent.rs`
- **Commit:** `604e8f425`

**2. [Rule 1 - Bug in the plan's gate] The Task 3 `config.json` grep cannot reach zero without touching the tray settings read**
- **Found during:** Task 3
- **Issue:** The verify (`grep -c 'store/config.json\|"config.json"'` and the acceptance `grep -c 'config.json'` equal to 0) also matches `read_json_file(&folder.join("config.json"))` in `tray_settings_from_disk`, which reads the global settings document, not the recent list. HEAD had two non-comment hits (the settings read and the recent read); only the recent read is this plan's.
- **Fix:** The recent read is gone; I checked `grep -v '^\s*//' tray/recent.rs | grep -c 'store/config.json\|join("store")'` is 0, and left the settings read alone (it is the `settings/global` document, owned by another change). Moving it through the host would be a different scope.
- **Files modified:** none beyond the plan's
- **Commit:** `b7dd418c6`

**3. [Rule 3 - Blocking] Pin tests outside the plan's file list moved with the new channels**
- **Found during:** Tasks 1 and 2 (full jest runs)
- **Issue:** Existing census tests pin the channel and registration counts. They are exactly the tests that should move when a channel is added or deleted: `tauriShellSource.test.ts` (router arm count 123 to 125, and the new-arms list), `rustInvokeSchemas.test.ts` (123 to 125), `flowRegistrationCensus.test.ts` (enrichment invoke 19 to 18), `ipcSchemas/enrichment.test.ts` (fixture row and count 19 to 18), `runnerSliceRegistration.test.ts` (72 to 71 handle channels, enrichment 19 to 18, total 71 to 70) and `enrichmentFlows.test.ts` (the sidecar `removeRecent` positive test and its entry in the "not UNPORTED" table, now covered by Rust tests and `nativeChannelOwnership`). `enrichmentFlowRegistration.ts`'s two "Registers the 19" docstrings became 18.
- **Fix:** Updated each pin with a Phase 86 comment naming the change.
- **Files modified:** the six test files and `enrichmentFlowRegistration.ts`
- **Commit:** `604e8f425`, `b4f5278bc`

### Additions beyond the plan's named surface

- `cache_view::is_falsy` became `pub(crate)` so `recent::keeps` reuses the JS-truthiness rule instead of a second copy.
- `info_dispatch::test_ctx` (cfg(test), `pub(crate)`) builds an InfoCtx on a FakeHome seeded from a golden state folder; the tray tests use it.

### Documented risk (not a deviation, the plan directs it)

D-29 row 7 says a Rust op that writes `games.recent` must not be reachable while the TS writer is a whole-key read-modify-write from the mirror. `info_recent_add` and `info_recent_remove` have no TS caller until 86-09, so they are unreachable. The native `removeRecent` is reachable by the renderer by the plan's design, while TS `addRecentGame` (launch) and `removeRecentGame` (sideload uninstall) still exist until 86-09. A lost update needs a TS add to compute its list from a mirror view that has not yet received the Rust remove's `changed` event (a window of milliseconds) and a second launch in that window; the mirror is brought current by the host's ordered dispatcher. Accepted as the plan specifies; 86-09 closes it.

## Issues Encountered

- `cargo fmt -p gamelib-shell` was run once by mistake. It reformatted the generated `src-tauri/src/ipc_contract.rs` (restored by `pnpm gen:ipc-contract`) and the foreign file `src-tauri/src/store_embed/controls.rs` (a 3-line format change). A `git checkout` of that file was denied by the permission system, so it is left modified and **unstaged**: it was clean at the start and is not part of any commit here. It is a pre-existing HEAD format defect, not a behaviour change.
- The plan's `rustfmt --edition 2021 --check src/main.rs ...` follows `mod` declarations into the generated, deliberately unformatted `ipc_contract.rs` (110 diffs, and `controls.rs` at HEAD), so it cannot pass as written. The files this plan authors (`info_dispatch.rs`, `native_router.rs`, `tray.rs`, `tray/recent.rs`, `main.rs`, `rust_dispatch.rs`) have no diffs of their own; `cargo fmt -p gamelib-info --check` is clean.
- A full `jest src meta` run had one failure, `steamLoginPollLifecycle.test.tsx` (14 tests), which passes alone (23/23): load-induced timing, not related to this plan. Not touched.

## Known Stubs

None.

## Threat Flags

None. The new surface is the `removeRecent` renderer argument and the `info_recent_add` sidecar argument, both in the plan's threat model (T-86-15, T-86-17): `deny_unknown_fields` decode, the 1024 UTF-16 bound, fixed-literal rejections (a probe string is absent from the error), valid and invalid vectors in the manifest. T-86-16 (lost update) is mitigated by the Mutex and proven by the concurrency tests.

## Next Phase Readiness

- 86-09 turns the TS `addRecentGame`/`removeRecentGame` into forwarding shims that call `RUST_INFO_RECENT_ADD`/`REMOVE` and deletes the sidecar's `recentGamesChanged` tray sniff (`sidecar.rs`) and the TS module; until then the sniff and the Rust sink both exist, and only one writer is active per call.
- `info_dispatch` is the home for the later slices' arms and native handlers; `InfoCtx.secrets` stays `None` until 86-14.

## Self-Check: PASSED

- Files: `recent.rs`, `golden_recent.rs`, `info_dispatch.rs` and both todos exist.
- Commits: `604e8f425`, `b4f5278bc`, `b7dd418c6` are ancestors of HEAD; `git rev-list --count` from `plan_head_before` is 3.
- Verify: `golden_recent` 8/8, `recent::` unit 3/3, `info_dispatch` 9/9, `tray::` 31/31, `native_manifest_vectors`, full `gamelib-shell` 709 passed, clippy `-D warnings` on `gamelib-info` (with and without `testing`), `cargo fmt -p gamelib-info --check`, `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm planning-gates` 12/12, prettier over every changed TS/JSON path, jest over `src/backend`, `src/common` and `src/preload` all green (one load flake in an unrelated frontend suite re-run green).

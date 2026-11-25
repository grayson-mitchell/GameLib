---
phase: 94-humble-bundle-and-shortcuts
plan: 13
subsystem: backend
tags: [rust, humble, tracer, native-channel, store-host, golden-replay, d-16, d-19, d-20]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-02 gamelib-humble crate skeleton and dispatch contract; 94-08 library and state goldens (the recorded reads and the exact store bytes); 94-11 the shortcuts tracer (the same shape); 94-12 the classifier crate
provides:
  - gamelib_humble::stores::{HumbleStore, gifted_at, ownership_overrides} and the ops humble_get_gifted_at and humble_get_ownership_overrides
  - gamelib_humble::ctx::{HumbleLog, HumbleUi, NullEmitter}; HumbleCtx fields user_data, emitter, log, ui, catalog and the with_emitter, with_log, with_ui, with_catalog, info, warn, error helpers
  - src-tauri/src/humble_dispatch.rs (install, humble_ctx, get_gifted_at, get_ownership_overrides, ShellHumbleUi, load_catalog, build_ctx)
  - the native slice humble (HUMBLE_SLICE) and the native channels humbleGetGiftedAt and humbleGetOwnershipOverrides, with manifest vectors
  - tests/golden_reads.rs (replays the eight recorded library reads against the stateAfter bytes)
affects: [94-14, 94-15, 94-23, 94-29]

requirements-completed: []

actuals:
  tokens: 13000
  tasks: 2
  commits: 2

plan_head_before: 56ed071049d17034ad02b27ac95d98889be1b597
plan_head_after: 422182ef9b8ffa527a6e022b26487ebb4c7128bb

tech-stack:
  added: []
  patterns:
    - "a native read-only tracer: the crate reads the store files through the StoreHost (open_row over the shared store table), the shell handler validates first and then runs the op on the blocking pool, and the TS handle and zod entry go in the same commit"
    - "a golden replay of a read seeds a FakeHome from the recorded stateAfter bytes and refuses a case whose read is followed by a call that could move the files"
    - "the Humble log is fixed text: guarded writes only the op name and a category (panicked, stopped by shutdown), and a test feeds a URL, a cookie and a key as arguments and asserts none reaches a line"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/src/stores.rs
    - src-tauri/crates/gamelib-humble/tests/golden_reads.rs
    - src-tauri/src/humble_dispatch.rs
  modified:
    - src-tauri/crates/gamelib-humble/src/{lib,ctx}.rs
    - src-tauri/src/{main,native_router,ipc_contract,engine_dispatch,steampoll_dispatch}.rs
    - src/common/types/ipc/{nativeChannels.json,native.ts,humble.ts,ipcSchemaSnapshot.json}
    - src/backend/sidecar/humbleFlowRegistration.ts
    - src/backend/sidecar/__tests__/{flowRegistrationCensus,humbleFlows,testContainment}.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/humble.test.ts

key-decisions:
  - "The stores' two reads return a string-keyed map of the stored values (BTreeMap of serde_json Value), not BTreeMap<String, f64>: converting a stored integer through f64 would print 1795521600000.0 and fail the golden's value equality, and the stored value is passed through as the TS did. Key order is moot because serde_json (preserve_order is off by design in gamelib-store) orders keys and the renderer reads by key."
  - "HumbleCtx takes the user-data folder as a fifth constructor argument. The crate has no path of its own and open_row needs the file path, so the read cannot be built from the host alone."
  - "The context's catalog is loaded from the same locales folder and user language the steampoll host renders from (steampoll_dispatch::app_root_and_asset_dir, public in dev and build packaged), not info_dispatch::bundled_public_dir, which hard-codes public. A packaged build's locales are under build."
  - "guarded writes a warning for a panic and a shutdown stop so there is an op-produced line to test. The line is the op name and a category only."
  - "An entry that is not an object or has no giftedAt (or overriddenAt) contributes nothing, as undefined does not survive the JSON the renderer receives; the TS would throw on a null entry, which Rust does not copy."

patterns-established:
  - "the footprint of a native read channel: nativeChannels.json (2), native.ts, ipc_contract.rs, the IPC snapshot, flowRegistrationCensus (invoke 15 to 13), humbleFlows.test.ts (a not-registered assertion in place of each round trip, 10 channels to 9, 15 to 13 registered), ipcSchemas/humble.test.ts (21 to 19 keys)"

requirements: [SVC-04]
duration: 95min
completed: 2026-11-24
---

# Phase 94 Plan 13: Humble native read tracer Summary

**`humbleGetGiftedAt` and `humbleGetOwnershipOverrides` are native `humble` channels answered by Rust from the StoreHost, matching the eight recorded TypeScript reads, with the sidecar handles gone in the same commit and the Humble context carrying its emitter, log, UI and catalog seams.**

## What was built

- **Task 1 (tracer).** `stores.rs` names all eleven stores as `stores.ts` does (the config store under `humble_store`, the ten caches under `store_cache`), opens each through `row_for_key` and `host.open_row` (every row exists in the shared store table, a test pins it) and reads the two timestamp maps the way `CacheStore.entries()` did: the version envelope and the `__timestamp` bookkeeping are never entries, and an entry without the field contributes nothing. `humble_get_gifted_at` and `humble_get_ownership_overrides` take `[]` only (`<op>:bad-args` otherwise, never echoing the input). `humble_dispatch.rs` builds one `Arc<HumbleCtx>` in `run_setup` right after the StoreHost opens (`SystemClock`, `gamelib_core::shutdown::global()`, the shell's `TauriFrontendEmitter`, a fixed-text log sink); the native handlers validate their arguments first, then answer `<op>:not-ready` before install, then run the op on the blocking pool. `native_router.rs` gains `HUMBLE_SLICE` and the two inserts; `nativeChannels.json` has both channels with `[[]]` valid and `[[1]]`, `[["x"]]` invalid; `native.ts` types them; the two `ipc.handle` calls and their zod entries are deleted, the IPC contract and snapshot regenerated, and every census that counted them moved down.
- **Task 2.** `HumbleLog`, `HumbleUi` (`notify`, `send_to_sidecar`), `emitter`, `ui` and `catalog` on the context, with a `NullEmitter` default, and headless tests (a context with a null emitter and a recording log builds without creating its path; a context with no log or UI is silent). `ShellHumbleUi` reuses `notification_show::show_notification` and `send_frame_to_sidecar`. `guarded` writes a fixed warning for a panic and a shutdown stop, and a test passes a URL, a cookie and a key as arguments and asserts no recorded line contains any of them.

## Evidence

- `golden_reads.rs` replays all eight library goldens that call the two reads (4 gifted-at, 4 override), each seeded from the recorded `stateAfter` bytes in a FakeHome, with a manifest count and floor, a minimum of two non-empty answers, and a refusal of any case whose read is followed by a mutating call. Mutating the field name (`giftedAt` to `giftedAtX`) turned the replay red with `want {"cactus_steam":1795521600000}, got Ok(Object {})`, then restored.
- `cargo test -p gamelib-humble`: 145 unit, 3 golden reads, 1 classify replay, all green. `cargo test --bin gamelib-shell`: 819 passed (seven new `humble_dispatch` tests and the new manifest-slice test).
- `cargo clippy -p gamelib-humble --all-targets -D warnings` clean; `cargo fmt -p gamelib-humble --check` clean; the shell has no clippy or fmt finding in any file this plan touched.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode` (310 baselined), `pnpm planning-gates` (12/12), scoped prettier over every TS and JSON file written, and the jest suites `nativeChannelOwnership`, `rendererAllowList`, `ipcDomainCensus`, `ipcSchemaCoverage`, `humbleFlows`, `flowRegistrationCensus`, `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule` (36), `tauriShellSource` and `shortcutsChannelParity` are green.
- Tracer feedback gate (interactive, `end-of-phase`, automated-only `<verify>`): re-ran the plan's verify end to end after the Task 1 commit before expanding.

## Counts that moved

| Pin | Before | After |
|---|---|---|
| flowRegistrationCensus `humbleFlowRegistration.ts` invoke | 15 | 13 |
| `registerHumbleFlows` docstring total | 16 | 14 |
| humbleFlows registered `ipcMain.handle` | 15 | 13 |
| ipcSchemas/humble key count | 21 | 19 |
| native manifest channels | 42 | 44 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's `cargo test --bin gamelib-shell native_manifest humble` is not valid cargo syntax**
- **Found during:** Task 1 verify
- **Fix:** ran the two filters separately (`native_manifest`, then `humble`); both pass.

**2. [Rule 3 - Blocking] `testContainment.test.ts` was red at the branch HEAD (94-11)**
- **Found during:** the wider backend jest run
- **Issue:** `shortcutsResolvers.test.ts` (added by 94-11) was in neither declared list, so the set-equality gate failed on every OS.
- **Fix:** classified it as structurally contained (it drives the resolver over fakes and an in-memory registry) with its prose entry. Not caused by this plan, fixed because it is a branch-own defect that fails on every OS.
- **Files modified:** src/backend/sidecar/__tests__/testContainment.test.ts
- **Commit:** 366b4cc90

**3. [Rule 2 - missing coverage] Extra files outside `files_modified`**
- `humbleFlows.test.ts` and `ipcSchemas/humble.test.ts` (the deleted handles' round trips and zod fixtures), `engine_dispatch.rs` and `steampoll_dispatch.rs` (one keyword each: `send_frame_to_sidecar` and `app_root_and_asset_dir` became `pub(crate)`), plus the `HumbleCtx` user-data argument (see decisions).

### Plan text followed differently

- `gifted_at(host) -> BTreeMap<String, f64>` became `gifted_at(ctx) -> BTreeMap<String, Value>` (see decisions).
- The catalog's folder is steampoll's, not `info_dispatch::bundled_public_dir` (see decisions). `bundled_public_dir` joins `public` in a packaged build too; the sidecar's `publicDir` is `build` there. That mismatch affects the info crate's CrossOver snapshot lookup and is outside this plan; recorded in deferred-items.md.

## Windows-only failures (not caused by this plan)

The wider backend/common/preload jest run on this Windows host has 21 red suites besides the two this plan fixed, all in files this plan does not touch and unrelated to Humble: `cache`, `getShellPath`, `jestGlobalSetup`, `knownFixesRegistry`, `knownFixOverlayInstall`, `knownFixOverlays`, `loggerPortComplete` (its log-source walk scans 0 files on a Windows path), `moveOnUnix`, `protocol`, `signMachOResources`, `steamBridgeKnownFixes`, `utils`, `utilsRunner`, `appRootResolution`, `bootSourceShape` (CRLF in the top-level-let scan), `bootstrap`, `devSecretVault` (0600 file mode), `installFlows`, `shortcutsFlows` (the known `knownFolder(desktop)` containment case), `structuralContainment`. A baseline checkout could not be made here (the repository holds paths over the Windows length limit), so this is by inspection of the failure messages, which are path-separator, CRLF, file-mode and home-redirection assertions. CI is ubuntu.

## Known Stubs

None.

## Threat Flags

None. The two channels are read-only, take no arguments and add no new trust boundary beyond the manifest-validated native channel (T-94-23: fixed `invalid_args` literals and `<op>:bad-args`; T-94-24: fixed-text log lines, tested).

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-humble/src/stores.rs, src-tauri/crates/gamelib-humble/tests/golden_reads.rs, src-tauri/src/humble_dispatch.rs
- FOUND: 366b4cc90, 422182ef9
- `grep -o '"slice": "humble"' nativeChannels.json | wc -l` is 2; `grep -c "'humbleGetGiftedAt'" humbleFlowRegistration.ts` is 0; `grep -c "'humbleFlowRegistration.ts': { invoke: 15"` is 0; `grep -c "pub trait HumbleUi" ctx.rs` is 1.

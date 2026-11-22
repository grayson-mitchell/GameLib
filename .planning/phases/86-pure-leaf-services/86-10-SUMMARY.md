---
phase: 86-pure-leaf-services
plan: 10
subsystem: rust-info-overrides
tags: [overrides, gamelib-info, storehost, native-channels, rustinvoke, image-cleanup, d-17, d-18, d-29]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-03 InfoCtx and dispatch, 86-04 overrides goldens and before-states, 86-08 info_dispatch native-channel pattern, 86-09 recent shims"
provides:
  - "gamelib-info `overrides` module: get, get_all, set (one Mutex, confined image cleanup), attach"
  - "OPS info_overrides_get, info_overrides_get_all, info_overrides_set, info_overrides_attach"
  - "native invoke channels getAllGameOverrides and getGameMetadataOverride in slice info, one owner each"
  - "RUST_INFO_OVERRIDES_GET / _GET_ALL / _SET / _ATTACH with strict schemas and rust_dispatch arms, ready for 86-11's shims"
affects: [86-11]

actuals:
  tokens: 22900
  tasks: 2
  commits: 2

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/overrides.rs
    - src-tauri/crates/gamelib-info/tests/golden_overrides.rs
  modified:
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/gameDetails.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/gameDetailsFlowRegistration.ts
    - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/info/__tests__/recentGames.test.ts

key-decisions:
  - "The set op's wire field is `overrideData`, not `override`: `override` is a reserved word in Rust and the IPC generator emits the field name unescaped, so a field named `override` would not compile. The crate struct is `SetArgs { app_name, override_data }`."
  - "set answers the boolean TS returned (`false` for an unreadable map, an unlistable images folder or a failed write) and writes no log line: the crate has no logger and gamelib-log has no GameOverrides prefix. The 86-11 shim must write the TS `Saved overrides for` / `Failed to save overrides for` lines from the boolean."
  - "A stored `overrides` value that is not an object makes set answer false and write nothing (the TS write would throw on null and build on a string or array unpredictably). The reads answer what TS answered: the stored value from get_all, null from get."
  - "attach returns the game object through a serde_json::Value, so its keys come back sorted (preserve_order is off crate-wide); the object is equal as JSON, and the renderer and TS callers do not depend on gameInfo key order."
  - "getGameMetadataOverride accepts 1 to 256 UTF-16 units as the plan says (the old zod key allowed 4096); the crate's set bounds appName at 1024 like recent."

patterns-established:
  - "A native channel handler and a rustInvoke arm share one crate op: the handler runs it through `run_info_op` on the blocking pool (block_on of the async `dispatch`), the rustInvoke arm through `dispatch_sync`."
  - "A golden replay marks the cases where the TS oracle's store sink stamped `__internal__` on an unchanged file (NO_OP_REWRITES) and asserts the Rust file is the before-file and the golden differs by the stamp alone."

requirements-completed: []

plan_head_before: 9e3dd761e105f79c717f418350078491d15f22bf
plan_head_after: e91d169778a04098180fa810fabdc1ffb7ec7b81
commits: 2
status: complete
---

# Phase 86 Plan 10: Overrides in Rust Summary

**Per-game overrides run in Rust over the StoreHost: the two renderer read channels are native `info` channels, set and attach exist as unreachable-for-now rustInvoke ops, and the image cleanup is pinned against a sibling, an unrelated file, an exact-name file and symlinks.**

## Accomplishments

- `overrides::get_all` and `overrides::get` read the `overrides` key of `store/game-overrides` through `StoreHost::open_row` (D-18). A missing file or key gives `{}` / `null`, a falsy entry reads as `null`, and an unopenable store gives `{}` / `null` like the TS catch.
- `overrides::set` runs its read, cleanup and write under one crate Mutex. Empty (every field falsy or absent) removes the entry and the game's images; otherwise the whole entry is replaced, with `title`, `art_cover`, `art_square` in the TS literal's order and empty strings kept when another field is set.
- The cleanup (T-86-19) reads names only from `read_dir(<user_data>/game_overrides_images)`, matches `<appName>-` on the entry's encoded bytes, and calls `remove_file` (which removes a symlink, never its target). A missing folder is a no-op, a folder that cannot be listed fails the set before anything is written (the TS `readdirSync` threw into its catch), and an entry that cannot be removed is skipped. An empty `appName` is rejected up front, so the prefix can never be a bare `-`.
- `attach` returns the game object with `overrides` added (an existing `overrides` key replaced in place, as the spread does), and any object without a string `app_name`, or with no stored override, comes back unchanged.
- `getAllGameOverrides` (Task 1) and `getGameMetadataOverride` (Task 2) are native invoke channels in slice `info` (`nativeChannels.json` vectors, `NativeAsync` typing, handlers in `info_dispatch.rs` that validate before looking at the context and never echo an argument). Each one's `ipc.handle` and zod args/returns key were deleted in the same commit as its registration (D-17); the two unused imports went with them.
- Four rustInvoke ops: `RUST_INFO_OVERRIDES_GET`, `_GET_ALL`, `_SET`, `_ATTACH` (strict schemas, `gameInfo` as an `x-rust-value` opaque arg, generated `InfoOverrides*Args`, four `rust_dispatch.rs` arms). No non-test TS file references them, so the D-29 row 7 precondition holds: the Rust write op is unreachable from TS callers until 86-11 turns the TS writer into a forwarding shim. `RUST_INFO_CHANNELS` lists all six info ops and `recentGames.test.ts` consumes the list (knip stays at 312).

## Task Commits

1. Task 1 (tracer): `d069e1a10` feat(86-10): getAllGameOverrides native end to end over the StoreHost
2. Task 2: `e91d16977` feat(86-10): getGameMetadataOverride native, overrides set and attach ops with confined image cleanup

Tracer gate: the Task 1 verify (golden_overrides, native_manifest_vectors, info_dispatch, clippy, fmt, check:ipc-contract, the four IPC census/ownership suites, codecheck, prettier) all passed before Task 2 expanded.

## Verification

- All 14 86-04 overrides cases (results, image listings, whole-file store bytes) match the TS goldens on the first replay. 16 tests in `golden_overrides`, 8 unit tests in `overrides::`, 16 `info_dispatch` tests, the whole `gamelib-shell` bin suite (716 passed) and both `gamelib-info` crates pass.
- The Mutex is proven necessary: with `lock()` commented out, `two_concurrent_sets_for_different_games_both_persist` (round 0) and `many_concurrent_sets_all_land` fail; restored.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm boundaries`, `pnpm find-deadcode` (312 baselined) pass. `backend/sidecar`, `backend/gamedetails`, `backend/__tests__`, `backend/info` and `common` jest (4220+ tests) pass, apart from the foreign flake below.
- Clippy (`-p gamelib-info --all-targets -D warnings`), `cargo fmt -p gamelib-info --check`, `rustfmt --check` on the three shell files, and prettier on every changed TS path pass.
- `grep -v` of comment lines in gameDetailsFlowRegistration.ts for either channel name: 0.

## Quirks (D-03)

No quirk found while matching the goldens: every case equals the TS bytes and results. One oracle-sink difference is handled, not a divergence: for `set-empty-for-absent-entry-still-removes-images` the TS sink stamped `__internal__` on an unchanged file while the StoreHost writes nothing for a no-op set (the same case 86-08 hit); the test asserts the Rust file is the before-file and the golden differs by the stamp alone. The design choices in key-decisions (corrupt map, log lines, attach key order, the 256 bound) are not golden-visible, so no todo was filed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `override` is a Rust keyword**
- **Found during:** Task 2 (the generator wrote `pub(crate) override: ...`)
- **Fix:** wire field `overrideData` in rustInvoke.ts and the crate's `SetArgs.override_data`; the plan's `override: OverrideArgs` name is kept for the nested type's role only.
- **Commit:** e91d16977

**2. [Rule 1 - Bug] Tests that read through the deleted TS channels**
- **Found during:** Task 1 and Task 2
- **Issue:** gameDetailsFlows.test.ts drove `getAllGameOverrides` / `getGameMetadataOverride` through the sidecar, the census and schema-fixture pins counted them, and the arm-count, schema-count and channel-list pins (125 to 129) and the sorted-arm allow-list moved with the four ops.
- **Fix:** the round-trip, push and delete tests read `gameOverridesStore` directly; one test asserts the sidecar registers neither channel; census 16 to 14 invoke; fixtures and pins updated.
- **Commits:** d069e1a10, e91d16977

**3. [Plan note] set and attach TS log lines** are not written in Rust (see key-decisions); the plan's "same log lines as TS" is met by the 86-11 shim writing them from the boolean.

## Known Stubs

None. The four `RUST_INFO_OVERRIDES_*` constants have no non-test caller by design until 86-11 (D-29 row 7); they are not stubs, the ops are fully implemented and golden-tested.

## Threat Flags

None. T-86-19 (image cleanup) is mitigated and pinned by sibling, unrelated, exact-name, symlink and path-shaped-appName tests; T-86-20 by `deny_unknown_fields`, the 256/1024 bounds, manifest invalid vectors and fixed-literal rejections.

## Foreign state

`pnpm exec jest` of Backend showed `outboundHttpRegistry.test.ts` "does not track or destroy WebSocket upgrade requests" failing once in the large run (foreign flake, passes alone). None of the foreign dirty files were staged.

## Self-Check: PASSED

- overrides.rs, golden_overrides.rs and this SUMMARY exist; commits d069e1a10 and e91d16977 are ancestors of HEAD.

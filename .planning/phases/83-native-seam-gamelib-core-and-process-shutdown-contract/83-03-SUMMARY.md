---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 03
subsystem: infra
tags: [rust, tauri, native-router, ipc-contract, manifest, getHeroicVersion]
status: complete

requires:
  - phase: 67-rust-ipc-contract
    provides: relay_channel_verdict allow-list, IPC_INVALID_ARGS marker/payload shape, genIpcContract generator
provides:
  - src/common/types/ipc/nativeChannels.json, the native channel manifest (kind, slice, args, returns, valid/invalid vectors)
  - genIpcContract parseNativeManifest + ContractInput.native; emitted NATIVE_INVOKE_CHANNELS, NATIVE_SEND_CHANNELS, is_native_*_channel, IPC_INVALID_ARGS_MARKER, IPC_INVALID_ARGS
  - src-tauri NativeRouter / NativeKind / InvokeHandler / invalid_args and native_handlers (app_version, get_heroic_version)
  - sidecar_invoke consults the router after the allow-list verdict (no fallback, D-04)
  - typing-only NativeAsync in src/common/types/ipc/native.ts
affects: [83-04, 83-05 (ownership census, two-owner refusal, version parity gate), later native slices]

actuals:
  tokens: 40000
  tasks: 3
  commits: 5
plan_head_before: 636fb4925fee78d2e4d952eac1e829543d4185ca
plan_head_after: 60e65225a3073c9fe201539203b274a552ab5168

tech-stack:
  added: []
  patterns:
    - "One JSON manifest drives the generator, the allow-list union and the Rust data-driven negative tests"
    - "Native handlers are pure fns over &[Value] with a serde positional args type as the schema authority; the router is glue"
    - "Native rejection reuses the existing INVALID_CHANNEL / INVALID_ARGS markers so the renderer never sees an unclassifiable error"

key-files:
  created:
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src-tauri/src/native_router.rs
    - src-tauri/src/native_handlers.rs
  modified:
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/relay_commands.rs
    - src-tauri/src/main.rs
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/appShell.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/testUtils/ipcDomainParse.ts
    - src/common/types/ipc/appShell.ts
    - src/common/types/ipc/index.ts

key-decisions:
  - "Native router test module is named `tests` (not `native_router_tests`): the tauriShellSource D-10 census allows only `relay_allow_list_tests`, `shell_open_tests`, `terminate_reply_tests` as topic-named test mods, so a new topic-named mod would turn it red on Linux CI"
  - "nativeChannelNames() lives in backend/testUtils/ipcDomainParse.ts and is shared by ipcDomainCensus and ipcSchemaCoverage, so neither carries a hand list of native channels"
  - "NativeChannelSpec is not exported (knip: no external consumer); NativeManifest and parseNativeManifest are"
  - "invalid_args sanitises each `.`-separated path segment like TS sanitisePath and keeps `(args)` verbatim; the JSON tail's key order is alphabetical (serde_json map), which the renderer's JSON.parse does not depend on"

patterns-established:
  - "Ownership is exclusive: a channel is native (manifest + router + generated NATIVE_* sets) or sidecar (zod), never both; the shell test proves router keys equal the generated sets"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "getHeroicVersion is answered by Rust: sidecar_invoke consults NativeRouter right after relay_channel_verdict, the handler's Err is the invoke's Err, no relay on any outcome"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "src-tauri/src/native_router.rs#tests (native_router_invoke_keys_equal_generated_native_invoke_set, the_router_does_not_claim_sidecar_channels, get_heroic_version_answers_cargo_pkg_version); cargo test --bin gamelib-shell native_ (20 passed)"
        status: pass
    human_judgment: true
    rationale: "The relay branch in the async tauri command (spawn_blocking of the handler, no fallback) is asserted by reading, not by a test that constructs an AppHandle; no test drives a real renderer invoke"
  - id: D2
    description: "Negative test per migrated channel: manifest valid vectors accepted, invalid vectors rejected with the INVALID_ARGS marker and exactly code/channel/paths/codes; an empty invalid list fails; a sentinel argument never appears in the error"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "src-tauri/src/native_router.rs#tests (native_manifest_vectors_valid_accept_invalid_reject, native_manifest_every_channel_has_an_invalid_vector, native_rejection_never_echoes_an_argument, get_heroic_version_extra_element_is_too_big_at_the_root)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Generator unions manifest names into RENDERER_CHANNELS, emits sorted NATIVE_INVOKE/SEND sets and the INVALID_ARGS constants, and refuses a malformed manifest naming the channel"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "meta/__tests__/genIpcContract.test.ts#native channel manifest (Phase 83) (7 tests); pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D4
    description: "TS registration, zod entry and appInfo plumbing deleted; window.api.getHeroicVersion stays typed via NativeAsync; censuses learn the native owner with exact re-measured counts"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "ipcDomainCensus (d near-miss, e), flowRegistrationCensus (app-shell invoke 6), ipcSchemaCoverage (near-miss); pnpm codecheck; pnpm find-deadcode; pnpm backend-di-ceilings"
        status: pass
    human_judgment: false
---

# Phase 83 Plan 03: Native router seam, getHeroicVersion Summary

**`getHeroicVersion` is served in Rust by a manifest-driven native router (nativeChannels.json drives the generator, the renderer allow-list and the Rust negative tests), with its sidecar registration, zod entry and appInfo plumbing deleted and a typing-only `NativeAsync` keeping the renderer's type.**

## Performance

- **Duration:** about 30 min (start time was not captured at launch; estimate)
- **Completed:** 2026-11-20
- **Tasks:** 3 (task 1 tracer)
- **Files:** 4 created, 16 modified

## Accomplishments

- `nativeChannels.json` plus `parseNativeManifest` in `meta/genIpcContract.ts`: refuses a bad kind, non-kebab slice, non-array args, non-array-of-array vectors, an empty `invalid` list, and any name outside `[A-Za-z0-9:_-]` (so JS sort order equals Rust's `binary_search` byte order). Emits sorted `NATIVE_INVOKE_CHANNELS` / `NATIVE_SEND_CHANNELS`, `is_native_*_channel`, and `IPC_INVALID_ARGS_MARKER` / `IPC_INVALID_ARGS` into `ipc_contract.rs` (no hand-copied marker literal in Rust).
- `NativeRouter` + `get_heroic_version`: a zero-field tuple-struct serde type reads only `[]`; any extra element yields `[GAMELIB_IPC_INVALID_ARGS] {"channel":"getHeroicVersion","code":"IPC_INVALID_ARGS","codes":["too_big"],"paths":["(args)"]}`, the same shape the sidecar's `formatIpcInvalidArgsError` emits, never an argument value. `app_version()` is `env!("CARGO_PKG_VERSION")` (0.8.0).
- `sidecar_invoke` takes `State<NativeRouter>`; after `relay_channel_verdict` a native hit runs the handler in `spawn_blocking` and returns its result. `NativeRouter` is managed before `spawn_sidecar_state` so a native hit never needs the sidecar.
- Deleted: the `getHeroicVersion` `ipc.handle`, `appInfo` from `AppShellFlowDeps` and the app-shell deps blocks (handlers.ts, appShellFlows.test.ts, runnerSliceRegistration.test.ts), and the zod entry. The other seven `appInfo` deps lines in handlers.ts stay.
- Censuses, re-measured at execution: app-shell registration 7 invoke + 13 send = 20 became 6 + 13 = 19 (both docstrings re-counted); `ipcDomainCensus` (d) excludes manifest-owned channels through a pure `ownerlessChannels()` with a live near-miss test, the owner-less ledger stays 61, total declarations stay 289 (a move, dated comment); new test (e) asserts `native.ts` declares exactly the manifest by kind and that no other domain file declares a manifest channel; `ipcSchemaCoverage` accepts the manifest as the second schema source with no exemption list and a near-miss test.

## Task Commits

1. **Task 1 (tracer): manifest, generator, router, handler, relay insertion** - `9b39da7c0` (feat)
2. **Task 2: delete the TS registration and appInfo plumbing; censuses learn the native owner** - `9e6d59730` (refactor)
3. **Task 3: delete the zod entry; typing-only native.ts** - `d27b314fa` (refactor)
4. **Source-text census fix (deviation 2)** - `60e65225a` (fix)

`plan_head_before..HEAD` measures 5 commits: these four plus `9cd67c0a6 test(82): complete UAT` made by the orchestrator between my commits 1 and 2. `actuals.commits: 5` is the measured count; the plan's own commits are 4.

Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the tracer's cargo, check:ipc-contract, jest, codecheck and prettier checks were re-run before expansion and passed; no checkpoint.

## Decisions Made

See `key-decisions`. Notably the Rust test module is `tests`, not `native_router_tests`, to stay inside the D-10 census's allowed topic-named mods.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ipcSchemaCoverage was red after Task 2, not green**
- **Found during:** Task 2
- **Issue:** the plan says the zod entry stays until Task 3 "so ipcSchemaCoverage stays green after this task". Deleting the registration makes `getHeroicVersion` declared-but-unregistered, which lands it in the `local` bucket, and that bucket demands a `caller: 'local'` schema.
- **Fix:** pulled the manifest-as-second-schema-source change forward into Task 2 (`schemaMisses()` + near-miss test). Task 3 kept the zod-entry deletion, `native.ts`, index and census (e).
- **Files modified:** src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts, src/backend/testUtils/ipcDomainParse.ts (shared `nativeChannelNames()`, not in the plan's file list)
- **Commit:** 9e6d59730

**2. [Rule 1 - Bug] shell source-text census did not know the two new files**
- **Found during:** plan-level verification (`cargo test --bin gamelib-shell`)
- **Issue:** `shell_source_files_names_every_shell_module_file` failed: `native_handlers.rs` / `native_router.rs` were missing from `SHELL_SOURCE_FILES` / `SHELL_SOURCE_PARTS` in main.rs.
- **Fix:** added both to the two parallel lists.
- **Files modified:** src-tauri/src/main.rs
- **Commit:** 60e65225a

**3. [Rule 3 - Blocking] knip flagged `NativeChannelSpec`**
- **Found during:** Task 3 (`pnpm find-deadcode`)
- **Fix:** un-exported it (no consumer outside the module).
- **Files modified:** meta/genIpcContract.ts
- **Commit:** d27b314fa

**4. [Rule 3 - Blocking] A second caller of `registerAppShellFlows` passed `appInfo`**
- **Found during:** Task 2 (`pnpm codecheck`)
- **Fix:** removed the line from runnerSliceRegistration.test.ts (not in the plan's file list).
- **Commit:** 9e6d59730

**5. [Naming] Rust test module renamed to `tests`**
- The plan names `#[cfg(test)] mod tests`; my first draft used `native_router_tests`, which the D-10 census (`EXPECTED_TEST_MOD_NAMES`) would reject on a platform where it runs green. Fixed before the first commit.

**Total deviations:** 5 (3 blocking, 1 bug, 1 naming). **Impact:** none on scope or behaviour.

## Issues Encountered

Pre-existing failures on this Windows box, none caused by this plan (compared against runs with my new files moved aside, and against HEAD before the edits):

- `src/backend/__tests__/tauriShellSource.test.ts`: 3 tests (`per file: strip removes exactly the enumerated test-mod line ranges`, `terminate_reply_tests is cut from production text`, `main.rs: stripped text equals the old slice`) and the Rust twins `tests::shell_production_source_main_part_equals_pre_test_slice` / `tests::cut_test_modules_cuts_cfg_all_and_stacked_test_mods`. The working-tree `src-tauri/src/main.rs` is CRLF here, so the test-module opener is not found. Identical failures with my files absent.
- `src/backend/sidecar/__tests__/appShellFlows.test.ts`: a timing-flaky set of 3 to 9 failures per run (a different subset each run, none touching version or appInfo) both before and after my edits. 7 failed on the unedited file at the start of Task 2.
- The pinned clippy toolchain (1.99.1) and the darwin ratchet baseline are not available locally, so `meta/clippyRatchet.cjs` was not run; `cargo clippy --bin gamelib-shell --all-targets` reports nothing in the three Rust files this plan touches. Confirm the ratchet on CI or the Mac.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-83-06 (manifest widens the allow-list): `parseNativeManifest` refusals plus the router-keys-equal-generated-sets test. T-83-07 (args tampering): serde length rejection plus data-driven invalid vectors. T-83-08 (disclosure): payload carries only the echo_channel-cut name, sanitised paths and zod-vocabulary codes; sentinel test. T-83-09 (DoS): handler runs in `spawn_blocking`. No dependency added.

Prohibition checks: no sidecar fallback code exists for a native-owned channel (the router returns before the relay path); every native invoke rejection carries the INVALID_CHANNEL (verdict) or INVALID_ARGS (handler) marker, asserted by the manifest-vector test.

## Next Phase Readiness

Ready for 83-05: the version parity gate (three version files all read 0.8.0 today), the TS ownership census and the generator's two-owner refusal. The send kind of the router (`NativeKind::Send`, `send_channels()`) is declared but empty; its `#[allow(dead_code)]` comments say a later slice wires it.

## Self-Check: PASSED

- Created files present: nativeChannels.json, native.ts, native_router.rs, native_handlers.rs.
- Commits found: 9b39da7c0, 9e6d59730, d27b314fa, 60e65225a.
- Acceptance re-run: `NATIVE_INVOKE_CHANNELS` 2 and `IPC_INVALID_ARGS_MARKER` 1 in ipc_contract.rs; `invoke_handler(&channel)` 1 in relay_commands.rs; hand-copied marker literal 0 in native_router.rs; `nativeChannels.json` 3 in genIpcContract.ts; `ipc.handle('getHeroicVersion'` 0; `83-03` 1 in flowRegistrationCensus; `appInfo` 7 in handlers.ts; `getHeroicVersion` 0 in appShell.ts; `export interface NativeAsync` 1; `NativeAsync` 2 in index.ts; `"getHeroicVersion",` 2 in ipc_contract.rs.
- Plan verification: `cargo test --bin gamelib-shell` 494 passed, 2 failed (pre-existing CRLF); `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode`, `pnpm backend-di-ceilings`, rustfmt on the three Rust files, and prettier on every written path (all confirmed not ignored) pass; the five named jest suites pass apart from the pre-existing tauriShellSource and flaky appShellFlows failures above.

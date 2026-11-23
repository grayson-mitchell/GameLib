---
phase: 87-engine-wine-and-tools
plan: 18
subsystem: infra
tags: [rust, tauri, native-channel, rustinvoke, engine-ui, shims, port-complete, runtimes]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the runtimes crate download and the shell engine and wine contexts (87-17), the delete gate and shim schedule (87-03), the EngineUi seam (87-06)
provides:
  - downloadRuntime as a native wine channel (enum-only decode, valid and invalid vectors), one owner
  - ShellEngineUi in engine_dispatch.rs, installed as EngineCtx.ui (notify, showDialog frame, raise, sidecar send)
  - RUST_WINE_RUNTIME_IS_INSTALLED and RUST_WINE_RUNTIME_DOWNLOAD rustInvoke channels with Rust arms, and the launcher shims src/backend/enginewine/runtimes.ts (deletedBy 88)
  - describe('runtimesPortComplete') green, and src/backend/wine/runtimes (TS) deleted
affects: [87-19, 87-20, every later Phase 87 slice that notifies, shows a dialog or raises, 88]

actuals:
  tokens: 8300
  tasks: 3
  commits: 3

plan_head_before: b9ea6f605f974325ce29a029dcafd14ddb7ed46a
plan_head_after: c782ee7fb40d9d7072ff4f208a7757860f000865

tech-stack:
  added: []
  patterns:
    - "one shared runtime_channel body for a native handler: validate with a fixed-literal decode before the context is looked at, then run the crate op on the blocking pool; the rustInvoke arms use the generated Args decode and the crate's own exactly-one-string check"
    - "a shell UI sink holds its three window-facing actions as plain function sinks (ShellEngineUi::for_app builds the production ones over the AppHandle and the sidecar state), so a test records what it did without an AppHandle"
    - "a sub-slice delete gate is added red (the files still exist, 6 failures) in the same plan that deletes the TS, then run green"

key-files:
  created:
    - src/backend/enginewine/runtimes.ts
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/store_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/runnerMisc.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/common/types.ts
    - src/backend/launcher.ts
    - src/backend/sidecar/runnerMiscFlowRegistration.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/testUtils/portSliceGate.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - meta/backendDiCeilings/wine.json
  deleted:
    - src/backend/wine/runtimes/runtimes.ts
    - src/backend/wine/runtimes/util.ts
    - src/backend/wine/runtimes/__tests__/runtimes/utils.test.ts
    - src/backend/wine/__tests__/oracle/runtimes.oracle.test.ts
    - src/backend/wine/runtimes/__tests__/runtimes/test_data/TestArchive.tar.xz
    - src/backend/wine/runtimes/__tests__/runtimes/test_data/github-api-heroic-test-data.json

key-decisions:
  - "The launcher's runtime shims return Promise<unknown> like the 86 recentGames shims (requestRustInvoke resolves unknown); the launcher only negates the install check and ignores the download result, so no cast is needed"
  - "wine_runtime_download is unbounded in the sidecar's rustInvoke (UNBOUNDED_RUST_CHANNELS), moved from the 60 s invoke bound the TS download ran under; wine_runtime_is_installed stays bounded"
  - "ShellEngineUi.show_dialog pushes the frame only (title, message, type, null buttons, ack id); raising a window GameLib itself hid for the dialog stays the caller's, through raise_main_window, because the TS raise is a separate appState call, not part of the frame"
  - "No RUST_WINE_CHANNELS domain list was added: it would have no consumer and knip rejects an unused export; the definition and RUST_INVOKE_CHANNELS carry the two constants"
  - "The wine-manager oracle still reads test_data/ArchiveWithSubfolder.tar.xz from the runtimes folder, so that one archive stays (listed in kept); the other two fixtures there only served the deleted unit test and went with it"

patterns-established:
  - "native + rustInvoke twin for one crate op: the renderer's channel and the launcher's shim share one decode helper and one crate op, so the ops have one writer"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "downloadRuntime runs natively in Rust as a wine channel: enum-only decode with fixed-literal rejections that never echo input, valid and invalid manifest vectors, its ipc.handle and zod key deleted in the same commit, contract and snapshot regenerated"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_manifest wine_dispatch (full shell suite 778 passed)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts, ipcSchemaCoverage.test.ts, runnerSliceRegistration.test.ts, flowRegistrationCensus.test.ts, invokeReturnValueSweep.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "ShellEngineUi is installed as EngineCtx.ui: notify carries title and body unchanged, show_dialog is the TS showDialog frame with the ack id through the emitter, raise and send_to_sidecar reach their sinks, and a context built over a FakeHome carries it"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell engine_dispatch (8 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The launcher reaches runtimes only through two typed shims over new rustInvoke arms; the shims are scheduled (deletedBy 88); the TS runtimes slice is deleted and runtimesPortComplete is green after running red"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWinePortComplete.test.ts and engineWineShimSchedule.test.ts (49 passed)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (rpc arms validate first, answer not-ready, run the crate op)"
        status: pass
    human_judgment: false
  - id: D4
    description: "In a running app, the EAC and BattlEye Settings toggles download through the native channel, a launch downloads a missing runtime through the shim, and a Rust-issued dialog or notification actually appears"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No automated test drives window.api.downloadRuntime or a launch into the packaged shell, and nothing yet calls ShellEngineUi in a live app (the wine manager, 87-20, is its first caller); the paths are proven by manifest vectors, handler tests, the 87-17 golden replay and the recording-sink tests, not by a live app"

duration: 28 min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 18: Runtimes flip and the shell EngineUi Summary

**Every runtime caller now reaches Rust: the renderer's `downloadRuntime` is a native `wine` channel, the launcher's two runtime calls go through scheduled `requestRustInvoke` shims, the TS runtimes slice is gone, and the shell has its `ShellEngineUi` sink installed as the engine context's `ui`.**

## Performance

- **Duration:** 28 min (start not recorded at the first call; read back from the 87-17 close-out commit at 17:09 and this plan's last commit at 17:27, with the plan read before it)
- **Tasks:** 3 of 3 (one tracer, one TDD-marked auto, one auto)
- **Files:** 1 created, 20 modified, 6 deleted

## Accomplishments

- **Native channel.** `downloadRuntime` is `kind invoke`, `slice wine`, one enum arg, returns `boolean`, with three valid and eight invalid vectors. `wine_dispatch` has one `runtime_channel` body for it and `isRuntimeInstalled`: decode first (fixed literals that never echo the value), then `not ready` before install, then the crate op on the blocking pool. Its `ipc.handle` and zod key are deleted in the same commit, the contract and snapshot regenerated, and the census pins follow (57 handle channels, `runnerMisc` 12, sweep 43).
- **ShellEngineUi.** `notify` goes through `notification_show::show_notification` unchanged; `show_dialog` pushes the TS `showDialog` frame (title, message, type, null buttons, ack id) through the `FrontendEmitter`; `raise_main_window` calls `app_lifecycle::rpc_main_window_raise`, the function the `RUST_MAIN_WINDOW_RAISE` arm calls; `send_to_sidecar` writes a `kind: "send"` frame to the sidecar's state (`store_dispatch::sidecar_state`, new accessor; a missing sidecar drops it as a dead pipe does). `build_ctx` now takes the `ui`, and `install` passes it, so `ctx.ui` is `Some` from boot.
- **Launcher and rustInvoke.** `RUST_WINE_RUNTIME_IS_INSTALLED` and `RUST_WINE_RUNTIME_DOWNLOAD` with strict zod tuples, `RustInvokeChannel` arms into `wine_dispatch` (generated enum decode, then the crate's exactly-one-string check, both fixed `<op>:bad-args`), and `src/backend/enginewine/runtimes.ts` with `isRuntimeInstalled` and `downloadRuntime`, one typed call each. `launcher.ts` imports only those (three call pairs: EAC, BattlEye, umu). Two schedule rows, shape shim, `deletedBy` 88.
- **Deletion.** `describe('runtimesPortComplete')` was added first and ran red (6 failures: four files present, two identifiers named), then `runtimes.ts`, `util.ts`, the utils test, the runtimes oracle and the two fixtures only that test read were deleted and it ran green. The goldens, the recordings and `ArchiveWithSubfolder.tar.xz` (still read by the wine-manager oracle) are kept and asserted kept.

## Task Commits

1. **Task 1 (tracer): `downloadRuntime` native end to end** - `57ff481a3` (feat)
2. **Task 2: ShellEngineUi installed into the EngineCtx** - `873415b7b` (feat)
3. **Task 3: launcher shims, schedule rows, runtimes slice deleted** - `c782ee7fb` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end (`native_manifest_vectors`, `wine_dispatch`, rustfmt, `check:ipc-contract`, ownership and schema jest, codecheck, prettier) after the commit's changes and passed; the full shell and sidecar suites passed again after Tasks 2 and 3. Tracer verified end-to-end, expansion followed.

TDD (Task 2, `tdd="true"` inside a plan of type `execute`): the four behaviours from the plan are four tests (plus the FakeHome install test), and all pass. The tests and the implementation went into one commit; there is no separate RED commit, so no RED evidence was recorded for this task. Task 3's gate is the one that ran red first.

## Verification

- `cargo test --bin gamelib-shell`: 778 passed, 2 ignored (includes `engine_dispatch` 8, `wine_dispatch` 6, `native_manifest_*`). `cargo clippy --bin gamelib-shell --all-targets`: no finding in the changed files. `rustfmt --edition 2021 --check` over the hand-written files: clean (only the generated `ipc_contract.rs` differs, as logged in 87-17).
- `pnpm check:ipc-contract`: both files current. `pnpm codecheck`: clean. `pnpm find-deadcode`: PASS (310 baselined). `pnpm backend-di-ceilings`: PASS. `npx prettier --check` over every TS and JSON path written: clean (`ipc_contract.rs` and the snapshot are generated). `npx eslint` over the changed TS: 0 errors (12 warnings, all in untouched lines of `launcher.ts`).
- jest `src/backend src/common src/preload meta/__tests__`: 743 suites passed; the only failure left is the known `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT. The regression set named in the plan (`infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule`) passes, including the rollback-flag checks that 87-17 saw fail before `b9ea6f605`.
- Acceptance: non-comment `'downloadRuntime'` in `runnerMiscFlowRegistration.ts` count 0; `grep -c "struct ShellEngineUi" engine_dispatch.rs` 1; `test ! -e src/backend/wine/runtimes/runtimes.ts` true; `grep -c "enginewine/runtimes" launcher.ts` 1; two schedule rows with `deletedBy` 88.

## Decisions Made

See `key-decisions`. The one later plans lean on: `ShellEngineUi` is how every Rust slice notifies, shows a dialog, raises or sends to the sidecar, and `engine_dispatch::build_ctx` now takes the `ui` (a test uses `ShellEngineUi::silent` or `with_sinks`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `wine_runtime_download` would have been cut at the sidecar's 60 s rustInvoke bound**
- **Found during:** Task 3
- **Issue:** the launcher's download moves from a TS call with no deadline to a `requestRustInvoke`, which rejects after 60 s unless the channel is in `UNBOUNDED_RUST_CHANNELS`. A slow link would report the runtime failed while Rust kept extracting.
- **Fix:** `RUST_WINE_RUNTIME_DOWNLOAD` joins `UNBOUNDED_RUST_CHANNELS` with a documented "Fifth" paragraph; the read-only check stays bounded; the two census tests that pin that list follow.
- **Files modified:** `src/backend/sidecar/sidecarRpc.ts`, `src/backend/__tests__/dialogOptionForwarding.test.ts`
- **Commit:** `c782ee7fb`

**2. [Rule 3 - Blocking] Census pins that count the new channels and the removed handle**
- **Found during:** Task 1 (`runnerMiscEngine` fixtures, `runnerSliceRegistration`, `runnerMiscFlows`, `flowRegistrationCensus`, `invokeReturnValueSweep`) and Task 3 (`rustInvokeSchemas` 137 to 139, `tauriShellSource` arm count 137 to 139 and its pre-existing-arms list, `dialogOptionForwarding`)
- **Fix:** counts and fixtures follow, each with the Phase 87 Plan 18 note in the file's own history style. None of these files is in the plan's `<files>`.
- **Files modified:** `src/backend/sidecar/__tests__/{ipcSchemas/runnerMiscEngine,runnerSliceRegistration,runnerMiscFlows,flowRegistrationCensus,invokeReturnValueSweep,rustInvokeSchemas}.test.ts`, `src/backend/__tests__/{tauriShellSource,dialogOptionForwarding}.test.ts`
- **Commits:** `57ff481a3`, `c782ee7fb`

**3. [Rule 3 - Blocking] knip ratchet: the deleted TS left a dead type, and a Phase 87 export was already dead**
- **Found during:** Task 3 (`pnpm find-deadcode`)
- **Issue:** the `Runtime` interface in `common/types.ts` was used only by the deleted `runtimes.ts`; `manifest` exported from `portSliceGate.ts` is the finding 87-05 logged to `deferred-items.md` (used only inside its own file). A `RUST_WINE_CHANNELS` list I had added had no consumer.
- **Fix:** removed `Runtime`, un-exported `manifest`, dropped `RUST_WINE_CHANNELS`. The ratchet passes at 310 baselined findings, so the 87-05 deferred item is now resolved.
- **Files modified:** `src/common/types.ts`, `src/backend/testUtils/portSliceGate.ts`, `src/common/types/sidecarTransport.ts`
- **Commit:** `c782ee7fb`

**4. [Rule 3 - Blocking] `store_dispatch.rs` gained a one-line accessor**
- **Found during:** Task 2
- **Issue:** `send_to_sidecar` needs the sidecar's state, which `store_dispatch` holds in a private `OnceLock`; the file is not in the plan's `<files>`.
- **Fix:** `pub(crate) fn sidecar_state()` returning that state.
- **Files modified:** `src-tauri/src/store_dispatch.rs`
- **Commit:** `873415b7b`

**5. [Rule 3 - Blocking] The generator needs a title on a positional rustInvoke arg**
- **Found during:** Task 3 (`pnpm gen:ipc-contract`)
- **Fix:** the shared `runtimeName` enum carries `.meta({ title: 'name' })`.
- **Files modified:** `src/common/types/ipc/rustInvoke.ts`
- **Commit:** `c782ee7fb`

**Total deviations:** 5 auto-fixed (1 bug, 4 blocking). **Impact:** the unbounded-channel entry is a behaviour the tests did not cover before; everything else is bookkeeping that follows the new channels and files.

### Plan details that did not apply literally

- **"the three runtimes files" in `deleted`:** the folder held two source files (`runtimes.ts`, `util.ts`); the list is those two, the utils test and the oracle test (four paths).
- **`getRuntimes` in `forbiddenIdentifiers`:** no such identifier ever existed, so it would pass vacuously. The list is `getAssetDataFromDownload` and `RuntimePaths`, which the deleted files held and nothing else names.
- **"both lists" for the two constants:** the constants are in the definition block and `RUST_INVOKE_CHANNELS`; the domain list the Info constants have was not added (see deviation 3).
- **`cargo test --bin gamelib-shell rust_dispatch`:** matches no test name (0 run); the router's arm count and exhaustiveness are covered by `tauriShellSource.test.ts` and the compile-time exhaustive `match`, and the new arms by the `wine_dispatch` tests.

## Known Stubs

None.

## Deferred Issues

- `src-tauri/src/main.rs` still lists `downloadRuntime` in the sidecar's long-running invoke list (and `longRunningChannels.test.ts` pins it). The renderer channel is native now and the sidecar no longer registers it, so the entry is dead but harmless; removing it is a main.rs and test edit outside this plan, left for a plan that owns that list.
- `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails as before (known, not touched).

## Threat Flags

None. The two rustInvoke arms and the native channel take one string from a closed set of three, decoded at the shell with fixed-literal rejections (T-87-65 holds: enum-only native decode, strict zod tuple on the shim, generated enum decode on the arm). `ShellEngineUi` takes its ack id from the caller and only pushes it; it logs no title, body or argument (T-87-66). No new crate.

## Next Phase Readiness

Ready for 87-19 and 87-20: `ctx.ui` is live for the wine manager's notifications, dialogs and raises, and the runtimes slice has no TS left. 87-29 still owns the DXVK installer on the engine context, and Phase 88 deletes the two launcher shims.

## Self-Check: PASSED

- Created and deleted files verified: `src/backend/enginewine/runtimes.ts` exists; `src/backend/wine/runtimes/runtimes.ts`, `util.ts`, the utils test and the runtimes oracle are absent.
- Commits exist on `main`: `57ff481a3`, `873415b7b`, `c782ee7fb` (3 measured from `plan_head_before`).
- Acceptance criteria re-run and passing (see Verification).

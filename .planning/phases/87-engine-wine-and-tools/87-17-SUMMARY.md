---
phase: 87-engine-wine-and-tools
plan: 17
subsystem: infra
tags: [rust, tauri, native-channel, golden, replay, tar, gamelib-safety, gamelib-wine, runtimes]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the delete gate and shim schedule (87-03), the oracle harness and the runtimes goldens (87-05), the Fetch/Replay seam and the full EngineCtx/WineCtx (87-06)
provides:
  - gamelib_wine::runtimes (RuntimeName, list, is_installed, download, DownloadError, archive_file_name) and gamelib_wine::extract (extract_tar, ensure_contained), ops wine_runtime_is_installed and wine_runtime_download
  - golden_runtimes.rs replaying all 9 runtimes goldens (5 is-installed, 4 download) over Replay with a traced real tar, against result, requests, spawns, events and tree
  - shell engine_dispatch.rs (one Arc<EngineCtx>) and wine_dispatch.rs (one Arc<WineCtx>), both built in run_setup after the store host opens
  - isRuntimeInstalled as the first native channel of slice wine, with its sidecar handle and zod key deleted in the same commit
affects: [87-18, 87-19, every later Phase 87 wine port, 87-29, the downloadRuntime and launcher flip in 87-18]

actuals:
  tokens: 24877
  tasks: 2
  commits: 3

plan_head_before: 96a62bb328b283f537a88ab0dd6c042d899c4ec6
plan_head_after: 6b06b323c2a0025e76836ae47c34c73035aa1ad2

tech-stack:
  added: []
  patterns:
    - "a crate op takes any plain-component runtime name and the shell enforces the closed RuntimeName set, so a golden can replay the TS cases for a name the list does not hold while the renderer can never name a path"
    - "a replacing delete goes through gamelib_safety remove_tree with the data directory as the trust root and an empty (known, not unreadable) known-installs list; a refusal stops the operation"
    - "archive extraction is spawn, then a walk of the destination that never follows a link and judges each symlink by where its whole chain really ends (canonicalize), falling back to a lexical check only for a dangling link"
    - "a golden replay drives the real tar through a tracing SpecRunner over the fake profile's environment, so the spawn trace and the tree are the oracle's, not a scripted answer"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/runtimes.rs
    - src-tauri/crates/gamelib-wine/src/extract.rs
    - src-tauri/crates/gamelib-wine/tests/golden_runtimes.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/wine_dispatch.rs
  modified:
    - src-tauri/crates/gamelib-wine/Cargo.toml
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine-cli/src/main.rs
    - src-tauri/crates/gamelib-wine-cli/tests/cli.rs
    - src-tauri/src/main.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/Cargo.lock
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/runnerMisc.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/runnerMiscFlowRegistration.ts

key-decisions:
  - "The crate ops take any plain-component runtime name (letters, digits, _ and -, at most 64) and only the shell restricts to eac_runtime, battleye_runtime and umu: the 87-05 goldens include `not-a-runtime`, which the enum cannot hold, and a name is joined onto a path so it is validated at both layers"
  - "The shell's wine context reads runtimes from <tools>/runtimes (appPaths runtimePath); gamelib-wine-cli now does the same instead of <tools>/runtime"
  - "downloadRuntime stays with the sidecar and the launcher keeps its TS read of current_version until 87-18, so a runtime download never has a TS and a Rust writer at once (D-06); the crate op wine_runtime_download exists but no channel, rustInvoke constant or caller reaches it"
  - "A failed tar, an archive name that is not a plain file name, and an archive that makes a link out of its folder each stop the download with false (the folder is removed again); the TS carried on after a failed tar and wrote current_version over an empty folder"
  - "The guarded replace passes known_installs as an empty known list and protected roots of the home, app folder and tools directory; no golden case is refused, so no deltas.json was written"

patterns-established:
  - "native channel of a new slice: WINE_SLICE in native_router.rs, a manifest entry with an enum arg and invalid vectors for every wrong shape, a handler that validates before it looks at the context and answers `<channel>: not-ready` before install"
  - "a shell dispatch module builds its context in a pub(crate) build_ctx so a unit test needs no AppHandle, and tests its handler through run_*_op on a context pointed at a directory that does not exist"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "isRuntimeInstalled runs natively in Rust through the new shell contexts: enum-only decode with fixed-literal rejections, valid and invalid manifest vectors, one owner (the sidecar handle and zod key deleted in the same commit), IPC contract regenerated"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch native_manifest (772 passed)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts, rendererAllowList.test.ts, flowRegistrationCensus.test.ts, ipcDomainCensus.test.ts, ipcSchemaCoverage.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The runtimes list and is_installed replay all 5 TS is-installed goldens (and the list-only case) with the same result, requests, tree and current_version bytes, every request pinned to its recording"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_runtimes (5 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Runtime download in the crate: contained tar extraction through the SpecRunner as a Helper, removal of the old folder only through gamelib-safety with trust root <tools>/runtimes, current_version written, every download golden matched including the traced tar spawn and the tree"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_runtimes every_download"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-wine extract:: (15 passed) and runtimes::tests (download, guarded remove)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Settings EAC and BattlEye runtime toggles read their installed state through the native channel in a running app"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No automated test drives the renderer's window.api.isRuntimeInstalled call into the packaged shell; the channel is proven by the manifest vectors, the handler tests and the golden replay, not by a live app"

duration: 22 min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 17: Runtimes tracer Summary

**The Wine runtimes slice runs in Rust end to end: `isRuntimeInstalled` is a native `wine` channel over the new shell engine and wine contexts with one owner, and the crate downloads a runtime through contained tar extraction and a `gamelib-safety` guarded replace, every one of the nine TS goldens replayed byte for byte.**

## Performance

- **Duration:** 22 min (about 16:47 to 17:09 NZDT; the start time was not recorded at the first call, so this is read back from the commit times)
- **Tasks:** 2 of 2 (Task 2 as RED and GREEN commits)
- **Files:** 5 created, 13 modified in the plan commits, plus five census and schema tests

## Accomplishments

- **Crate.** `runtimes.rs` holds `RuntimeName`, `list` (creates `<runtimes>`, one GET with the axios `Accept` and the GameLib agent, an empty body or `null` is `[]`), `is_installed` (no directory is `false` with no request; an unreachable list or a name the list lacks is `true`; otherwise `current_version` equals `created_at` byte for byte) and `download`. `extract.rs` has `extract_tar` (`tar -xf <archive> -C <dest> --strip-components=<n>` as the `wine-tar` helper, no timeout, the Shutdown token as its cancel) and `ensure_contained`.
- **Goldens.** `golden_runtimes.rs` builds the oracle's profile layout on a `FakeHome`, seeds each case, replays its recording through a request-tapping `Replay`, runs the real `tar` through a tracing `SpecProcRunner` over the fake profile's environment, and compares result, requests, spawns, event count and the tree (sha256 per file, modes with group and other write cleared) to `expected/<case>`. It also holds the MANIFEST floor and the empty-cases negative. 5 tests, 9 cases. Mutating the version comparison and the strip count each failed it.
- **Shell.** `engine_dispatch.rs` builds one `Arc<EngineCtx>` and `wine_dispatch.rs` one `Arc<WineCtx>` in `run_setup` right after the host opens: `SystemClock`, `gamelib_core::shutdown::global()`, `SpecProcRunner`, `ReqwestFetch`, the shell's `FrontendEmitter`, the app folder, user data, `<appFolder>/tools`, the home and temp directories, `NoDxvk`, `ui: None`. Nothing spawns, connects or waits at build time; an op before install answers `isRuntimeInstalled: not ready`.
- **Channel.** `isRuntimeInstalled` is `kind invoke`, `slice wine`, an `enum` arg, returns `boolean`, with three valid vectors and eight invalid ones. Rejections are `invalid_type` or `invalid_value` literals that never echo the input. Its `ipc.handle` and zod key are deleted in the same commit as the registration, the snapshot and `ipc_contract.rs` are regenerated, and the sidecar census pins follow (59 to 58 handle channels, `runnerMisc` 14 to 13).
- **Guarded replace.** The old extracted folder is removed through `remove_tree` with trust root `<tools>/runtimes`: the root itself, anything outside it, the home directory and a protected root are refused; a link is unlinked and its referent left. No golden case is refused, so there is no `deltas.json`.

## Task Commits

1. **Task 1 (tracer): `isRuntimeInstalled` native end to end** - `7111b097e` (feat)
2. **Task 2 RED: the failing download golden replay** - `da21b63f4` (test); the target test failed on `unknown op: wine_runtime_download`, the planned reason
3. **Task 2 GREEN: download, contained extraction, guarded replace** - `6b06b323c` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit and again after Task 2, and passed. Tracer verified end-to-end, expansion followed.

TDD (Task 2, `tdd="true"` inside a plan of type `execute`): RED target `every_download_case_matches_the_ts_result_requests_spawns_and_tree`, which compiled and failed on its assertion for the missing op, not on a build or fixture fault. It was not submitted to the strict RED classifier because the plan is not `type: tdd`. GREEN made it and the 15 `extract::` tests plus the runtimes unit tests pass; there was no refactor commit.

## Verification

- `cargo test -p gamelib-wine --features testing`: 42 unit tests and 5 golden tests passed. `cargo test -p gamelib-wine extract::`: 15 passed. `cargo test -p gamelib-wine-cli -p gamelib-engine --features gamelib-engine/testing`: 25 + 14 + 5 passed.
- `cargo test --bin gamelib-shell`: 772 passed, 2 ignored (including `wine_dispatch`, `engine_dispatch`, `native_manifest_*` and the shell source guards).
- `cargo clippy -p gamelib-wine -p gamelib-wine-cli --all-targets --features gamelib-wine/testing -- -D warnings`, `cargo clippy --bin gamelib-shell --all-targets` (no finding in the new files) and `cargo fmt` over the crates: clean.
- `pnpm check:ipc-contract`: both generated files current. `pnpm codecheck`: clean. `npx prettier --check` over every TS and JSON path written: clean (the snapshot and `ipc_contract.rs` are generated; the snapshot is prettier-ignored). `npx eslint` over the TS files written: clean.
- jest: the eight suites of the plan's verify plus `runnerSliceRegistration`, `runnerMiscFlows`, `runnerMiscEngine` and `invokeReturnValueSweep`: pass. `jest src/backend/sidecar src/preload src/common`: 150 suites, 3938 tests, all green after the sweep fix.
- Acceptance: `"slice": "wine"` count 1; non-comment `'isRuntimeInstalled'` in `runnerMiscFlowRegistration.ts` count 0; `remove_tree|check_removal` in `runtimes.rs` 2; `remove_dir_all` in `runtimes.rs` and `extract.rs` 0.

## Decisions Made

See `key-decisions` above. The two that later plans lean on: the crate ops accept any plain-component name while the shell enforces the closed set, and the guarded replace is the pattern for every later wine delete (wine-manager remove, bottle removal): trust root as a parameter, an empty known list, refusal stops the op.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The TS ignored a failed `tar` and reported the runtime installed**
- **Found during:** Task 2 (porting `download`)
- **Issue:** `runtimes.ts` `download` calls `extractTarFile` but never reads its `{status: 'error'}`, then writes `current_version` into the (empty) folder and returns `true`; `isInstalled` then reads that runtime as current.
- **Fix:** a non-zero `tar` is `ExtractError::TarFailed`, the download answers `false`, the folder is removed again and no `current_version` is written. No golden covers a failed tar, so the 87-05 cases are unaffected; it is covered by a unit test.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/runtimes.rs`, `extract.rs`
- **Commit:** `6b06b323c`

**2. [Rule 2 - Missing critical] Containment and name checks for untrusted list and archive content (T-87-17, T-87-18)**
- **Found during:** Task 2
- **Issue:** the list's `url` is joined onto `<runtimes>` as a file name and the runtime name onto a path, and an archive can make a symlink to anywhere; the TS checked none of it.
- **Fix:** `valid_name` (at most 64 of letters, digits, `_`, `-`) in every op and in `is_installed` and `download`; `archive_file_name` refuses an empty name, `.`, `..`, a separator, a colon or a NUL; `ensure_contained` after `tar`, with the destination removed through `gamelib-safety` when an entry escapes; an entry with no `created_at` or `url` is refused before the download, not after. The archive is removed after any failure past its download.
- **Files modified:** `runtimes.rs`, `extract.rs`
- **Commit:** `6b06b323c`

**3. [Rule 3 - Blocking] `gamelib-wine-cli` listed no ops and used `<tools>/runtime`**
- **Found during:** Task 1 (a test asserted an empty op table)
- **Issue:** `ops_prints_an_empty_list_and_exits_zero` was true only until the first op landed, and the CLI built its `WineCtx` over `<tools>/runtime`, not the `<tools>/runtimes` the TS and the shell use.
- **Fix:** the test now compares the printed list to `gamelib_wine::OPS`; the CLI's runtimes directory is `<tools>/runtimes` and its header comment says so.
- **Files modified:** `src-tauri/crates/gamelib-wine-cli/src/main.rs`, `tests/cli.rs`
- **Commit:** `7111b097e`

**4. [Rule 3 - Blocking] Census pins that count the removed handle**
- **Found during:** Task 1 (`runnerSliceRegistration`, `runnerMiscFlows`, `flowRegistrationCensus`, `runnerMiscEngine`) and on a wider jest run (`invokeReturnValueSweep`)
- **Issue:** each pins the sidecar's channel count (59 handle channels, `runnerMisc` 14, sweep 45) or carries a fixture for `isRuntimeInstalled`; deleting the handle in the same commit, as D-14 requires, moves them.
- **Fix:** counts and fixtures follow (58, 13, 44), each with the Phase 87 Plan 17 note in the existing history style. `invokeReturnValueSweep.test.ts` is not in the plan's `<files>` or `<verify>`; it was found only by running `jest src/backend/sidecar` in full.
- **Files modified:** `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`, `runnerSliceRegistration.test.ts`, `runnerMiscFlows.test.ts`, `ipcSchemas/runnerMiscEngine.test.ts`, `invokeReturnValueSweep.test.ts`
- **Commit:** `7111b097e`

**5. [Rule 3 - Blocking] `sha2` as a dev-dependency of `gamelib-wine`**
- **Found during:** Task 1
- **Issue:** the oracle's `tree.json` carries a sha256 per file, so the replay test has to hash.
- **Fix:** `sha2 = "0.10"` under `[dev-dependencies]` only. It is already locked for `gamelib-engine`, so `Cargo.lock` gains one line and no new crate enters the tree (T-87-SC holds).
- **Files modified:** `src-tauri/crates/gamelib-wine/Cargo.toml`, `src-tauri/Cargo.lock`
- **Commit:** `7111b097e`

**Total deviations:** 5 auto-fixed (1 bug, 1 missing-critical, 3 blocking). **Impact:** the TS bug fix and the hardening are behaviors the goldens do not exercise, so byte parity on the recorded cases is unchanged; each is covered by its own unit test.

### Plan details that did not apply literally

- **`rustfmt --edition 2021 --check src/engine_dispatch.rs src/wine_dispatch.rs src/main.rs src/native_router.rs`** in Task 1's `<verify>` also formats the generated `src/ipc_contract.rs` (rustfmt follows `mod` declarations from `main.rs`), and the generator's output is not rustfmt-clean (121 diffs at HEAD, none in lines this plan touched). The two checks cannot both be green for that file, and `pnpm check:ipc-contract` is the one that guards it. The four hand-written files were formatted and verified clean by listing the `Diff in` paths: only `ipc_contract.rs` appears.
- **"rpc arms" in `wine_dispatch.rs`:** none were added. The plan adds no rustInvoke channel (D-06), so there is no arm to write; the native handler is the only entry. The artifact's `WINE_SLICE` lives in `native_router.rs` next to `INFO_SLICE` and `wine_dispatch.rs` asserts it equals `wine`.
- **`is_installed` and `download` take a `&str`, not a `RuntimeName`,** so the golden cases for `not-a-runtime` replay through the real op; the shell decodes the enum (decision above).

## Known Stubs

None.

## Deferred Issues

Logged to `deferred-items.md` (not caused by this plan): `infoPortComplete.test.ts` (oracle names in the 87-05 harness), `engineWinePortComplete.test.ts` (rollback flag text in the same harness files) and `meta/__tests__/genI18nGateScope.test.ts` (committed fork-touched list differs from the live git derivation) fail on a wider `jest meta src/backend/__tests__` run. The first two name only `src/backend/testUtils/engineWineOracle/` (87-05); the third reads git history. None touches a file this plan changed.

## Next Phase Readiness

Ready for 87-18: the contexts exist, the crate download is proven against every golden, and the TS download and the launcher's TS `current_version` read are both still in place for 87-18 to flip together with the TS deletion. 87-18 also owns `ui` on the engine context and 87-29 the DXVK installer.

## Self-Check: PASSED

- Created files exist: `src-tauri/crates/gamelib-wine/src/runtimes.rs`, `src-tauri/crates/gamelib-wine/src/extract.rs`, `src-tauri/crates/gamelib-wine/tests/golden_runtimes.rs`, `src-tauri/src/engine_dispatch.rs`, `src-tauri/src/wine_dispatch.rs`.
- Commits exist on `main`: `7111b097e`, `da21b63f4`, `6b06b323c` (3 measured from `plan_head_before`).
- Acceptance criteria re-run and passing (see Verification).

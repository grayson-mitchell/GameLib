---
phase: 87-engine-wine-and-tools
plan: 20
subsystem: infra
tags: [rust, tauri, native-channel, rustinvoke, wine-manager, shims, cancel, dxmt-gap]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the wine-manager crate ops wine_manager_refresh, _install, _remove, _list and wine_releases_info_ready with their 19 goldens (87-19), ShellEngineUi and the native + rustInvoke twin pattern (87-18), the WineCtx and the wine slice (87-17), the delete gate and shim schedule (87-03)
provides:
  - refreshWineVersionInfo, installWineVersion and removeWineVersion as native wine channels (strict decodes, valid and invalid vectors), one owner for the wine-downloader-info store and <tools>/wine
  - the renderer's abort(version) mapped to the Rust install's CancellationToken in wine_dispatch (offered first by sidecar_send)
  - RUST_WINE_MANAGER_REFRESH, RUST_WINE_MANAGER_INSTALL, RUST_WINE_MANAGER_LIST and RUST_WINE_RELEASES_INFO_READY rustInvoke channels with Rust arms, and the shims src/backend/enginewine/wineManager.ts (updateWineVersionInfos, installWineVersion, listWineReleases, wineReleasesInfoReady) that utils.ts, config.ts and the releasesInfoReady listener use
  - the TS wine-manager modules with no live caller, ready for 87-22 to delete
affects: [87-22, 87-31, 87-58, 88, 98]

actuals:
  tokens: 36500
  tasks: 3
  commits: 4

plan_head_before: fea7d1a9eaed7c195fcaaa1143743e8552521e24
plan_head_after: 2782da4f8063a2c5a483c9d3e8ca922f4e0a2748

tech-stack:
  added: []
  patterns:
    - "a native handler whose body is one function over Option<Arc<WineCtx>> (install_channel, remove_channel), so a test drives it over a real context built on a FakeHome while the production handler passes wine_ctx().cloned()"
    - "one install core (install_blocking) serving both the native handler (on the blocking pool) and the rustInvoke arm (on the dispatcher thread), so both register the same cancel and read the same settings"
    - "a cancel map of generation-tagged entries behind a Mutex: a second install under the same id replaces the first, and the first's guard going away leaves the second's entry alone"
    - "a strict hand decode of an eleven-key object from a field table (RELEASE_FIELDS) with fixed paths and zod-vocabulary codes, never echoing the renderer's key or value"

key-files:
  created:
    - src/backend/enginewine/wineManager.ts
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/relay_commands.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/wineTools.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/utils.ts
    - src/backend/config.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/nile/setup.ts
    - src/backend/storeManagers/steam/provisionBottle.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "A cancelled install is reached through the renderer's existing abort(version): the shell's sidecar_send offers the id to wine_dispatch::cancel_install_for_abort first and, when Rust owns an install under that id, does not forward the send (the sidecar has nothing registered under it and would log a failed abort). Any other id goes to the sidecar as before. The plan named wine_dispatch only; relay_commands.rs is the one line that makes the Cancel button work"
  - "The install settings (downloadProtonToSteam, defaultSteamPath) are read by the shell from <userData>/config.json at install time, never sent by the sidecar: a stored Steam path wins, otherwise the discovered Steam root (what the sidecar's config defaults to) stands in, asked only when the setting is on. The rustInvoke shim therefore takes no settings argument"
  - "wine_manager_refresh and wine_releases_info_ready join wine_manager_install in the sidecar's UNBOUNDED_RUST_CHANNELS (the plan named only the install): each walks up to seven GitHub feeds with a 60 s limit apiece, and the TS refresh they replace swallowed a slow feed, so the 60 s sidecar bound would have turned a slow network into a rejected getAlternativeWine. wine_manager_list stays bounded"
  - "The renderer's WineVersionInfo is decoded strictly (the eleven keys, an unknown key rejects), as the plan's T-87-67 says. This is stricter than the TS zod it replaces, which was loose and had a vector for older cache entries carrying an extra key; the store this code writes carries exactly the eleven keys, so a current list passes, but a hand-edited or very old wine-downloader-info entry with another key would now be refused at install and remove"
  - "The rustInvoke zod tuple for the release is opaque (x-rust-value): the generator renders a single object argument field by field and has no length bounds, so the strict decode lives in wine_dispatch::parse_wine_version, which the native handlers and the install arm share"
  - "The default-wine download reads the release list from Rust (wine_manager_list) rather than the sidecar's mirror of the store, which may not have caught up with Rust's write when the refresh returns. getAlternativeWine, which still reads the mirror after its refresh, is the open question for the live gate"

patterns-established:
  - "an op whose caller owns a cancel is run directly (install(ctx, release, settings, cancel)) rather than through dispatch, with the cancel registry kept in the shell"
  - "a send channel the sidecar owns can be tapped by the shell before relay (abort), returning early only when Rust owns the id"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "refreshWineVersionInfo is a native wine channel: nothing, null or one boolean decodes, anything else rejects with a fixed literal before the context is looked at, it runs wine_manager_refresh on the blocking pool and answers undefined on every path, its handle and zod key are deleted in the same commit"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_manifest_vectors and wine_dispatch (the_refresh_fetch_is_nothing_null_or_one_boolean, the_refresh_handler_validates_first_and_answers_not_ready_before_install)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts, ipcSchemaCoverage.test.ts, ipcDomainCensus.test.ts, flowRegistrationCensus.test.ts, runnerSliceRegistration.test.ts, invokeReturnValueSweep.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "installWineVersion and removeWineVersion are native wine channels over a strict eleven-key WineVersionInfo decode; a release with an unknown key is rejected with a fixed literal and nothing is installed or removed; remove hands the crate the version only, so the stored installDir is the one removed and the renderer's is never used"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (a_wine_version_info_is_its_eleven_keys_and_nothing_else, a_rejected_release_is_a_fixed_literal_before_the_context_is_looked_at, remove_passes_the_crate_the_version_and_never_the_renderers_directory, an_unknown_key_removes_nothing_and_a_missing_version_removes_nothing)"
        status: pass
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_manager (7 tests, the 19 goldens including remove-stored-installdir where the renderer's installDir differs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An install's cancel id maps to one CancellationToken held by wine_dispatch, and the renderer's abort(version) cancels it: the install ends as the aborted result (idle pushed last, no directory left, unregistered), and a stale guard never removes a newer install's cancel"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (a_cancel_id_maps_to_one_token_and_ends_with_its_install, the_renderers_abort_cancels_a_running_install_with_the_aborted_result, the_abort_hook_ignores_anything_but_one_string)"
        status: pass
    human_judgment: false
  - id: D4
    description: "utils.ts, config.ts and the releasesInfoReady listener reach the wine manager only through enginewine/wineManager.ts (four scheduled shims over four rustInvoke channels with strict zod tuples and Rust arms); no live TS path runs the TS wine manager"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (30), src/backend/__tests__/utils.test.ts, rustInvokeSchemas.test.ts, tauriShellSource.test.ts, dialogOptionForwarding.test.ts"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (the_manager_rpc_arms_validate_first_and_answer_not_ready_before_install)"
        status: pass
    human_judgment: false
  - id: D5
    description: "In a running app: the Wine Manager screen lists, installs (with progress and notifications), cancels and removes a version through the native channels; the default-wine download works on first launch; the Settings 'download Proton to Steam' toggle still routes a Proton install to compatibilitytools.d"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No automated test drives window.api into the packaged shell. The paths are proven by manifest vectors, handler tests over a real context and the 87-19 goldens, not by a live app; 87-58's live gate owns it, together with re-checking that the DXMT gap below is closed"

duration: 33min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 20: Wine-manager caller flip Summary

**Every wine-manager caller now reaches Rust: the renderer's refresh, install and removal are native `wine` channels (a cancel is the renderer's `abort(version)`, mapped to the install's token), and the default-wine download, `getAlternativeWine` and the releases listener go through four scheduled `rustInvoke` shims, so the wine-downloader-info store and `<tools>/wine` have one writer.**

## Performance

- **Duration:** 33 min (start 04:52Z, read from the plan-head ledger; end 05:26Z)
- **Tasks:** 3 of 3 (one tracer, one TDD-marked auto as RED and GREEN commits, one auto)
- **Files:** 1 created, 30 modified, none deleted (31 changed in the plan's commits)

## Accomplishments

- **Refresh (Task 1, the tracer).** `refreshWineVersionInfo` is a native `wine` channel: `[]`, `[null]` or one boolean decodes; anything else is a fixed-literal rejection that never echoes the value. It runs `wine_manager_refresh` on the blocking pool and answers `undefined` on every path, as the TS handler did, logging a fixed line when the crate op fails. Its `ipc.handle` and zod key are deleted in the same commit; the contract regenerated; the census pins followed.
- **Install and remove (Task 2).** Both take one `WineVersionInfo` decoded by `parse_wine_version`, a field table of the eleven keys with the TS bounds, an unknown key rejected as `unrecognized_keys`. `install_channel` registers a token under the version, reads the install settings from the global config, and drives the crate's `install` on the blocking pool; the crate owns the notifications, progress and store. `remove_channel` passes the crate the version only (`remove_op_args`), so the directory removed is the stored one. RED was seven failing assertions against stubs; GREEN made them pass.
- **Cancel.** `register_install` keeps generation-tagged entries so a second install of the same id replaces the first and a stale guard leaves the newer cancel alone. `sidecar_send` offers `abort(id)` to `cancel_install_for_abort` first; the end-to-end test installs over a download that waits for its cancel, aborts through the hook, and sees `idle` pushed last, no directory left and the id unregistered.
- **Shims (Task 3).** `src/backend/enginewine/wineManager.ts` has `updateWineVersionInfos`, `installWineVersion`, `listWineReleases` and `wineReleasesInfoReady`, one returned typed call each over `RUST_WINE_MANAGER_REFRESH`, `_INSTALL`, `_LIST` and `RUST_WINE_RELEASES_INFO_READY`. `utils.ts`'s `onProgress` closure is gone (Rust pushes the identical `progressOfWineManager`), its store read is `listWineReleases`, `config.ts` calls `updateWineVersionInfos(this.deps, true)`, and the listener calls `wineReleasesInfoReady(...).catch(logError)`. Four schedule rows (the install, list and info-ready shims deletedBy 88, the refresh shim 98, which `config.ts` outlives 88 with).
- **Rust arms.** `rpc_wine_manager_refresh`, `_list`, `rpc_wine_releases_info_ready` and `rpc_wine_manager_install` validate with the generated decode and an arity check before the context is looked at; the install arm strict-decodes with the same `parse_wine_version`, registers its cancel, and answers `'success' | 'abort' | 'error'`.

## Task Commits

1. **Task 1 (tracer): `refreshWineVersionInfo` native end to end** - `63a33db8d` (feat)
2. **Task 2 RED: the failing install and remove handler tests, cancel map and settings** - `169fcc50c` (test); seven tests failed on their assertions against stubs
3. **Task 2 GREEN: `installWineVersion` and `removeWineVersion` native, with the abort mapped to the cancel** - `409463f5e` (feat)
4. **Task 3: wine-manager shims and the four rustInvoke ops** - `2782da4f8` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit (`native_manifest_vectors`, `wine_dispatch`, rustfmt, `check:ipc-contract`, ownership and schema jest, codecheck, prettier) and passed. Tracer verified end-to-end, expansion followed.

TDD (Task 2, `tdd="true"` inside a plan of type `execute`): the three plan behaviours are tests, RED committed separately and failing on assertions, not on a build fault. It was not submitted to the strict RED classifier because the plan is not `type: tdd`.

## Verification

- `cargo test --bin gamelib-shell`: 789 passed, 2 ignored (`wine_dispatch` 17, `native_manifest_*`). `cargo test -p gamelib-wine --features testing`: 76 unit, 5 `golden_runtimes`, 7 `golden_wine_manager` passed. `cargo clippy --bin gamelib-shell --all-targets` shows nothing in the changed files; `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` clean. `rustfmt --edition 2021 --check` over the four hand-written shell files: clean.
- `pnpm check:ipc-contract`: both files current. `pnpm codecheck`: clean. `pnpm find-deadcode`: PASS at 310 baselined findings (no rise). `npx prettier --check` and `npx eslint` over every TS path written: clean (eslint warnings only in untouched lines of `utils.ts`).
- jest `src/backend src/common src/preload meta/__tests__`: 746 suites passed; the one failure is the known `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT. The regression set (`infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule`) passes, including the TS wine-manager oracle (21) kept runnable.
- Acceptance: non-comment `'refreshWineVersionInfo'`, `'installWineVersion'` and `'removeWineVersion'` in `wineToolsFlowRegistration.ts` count 0; `grep -c "enginewine/wineManager"` is 1 in `utils.ts` and 1 in `config.ts`.

## Decisions Made

See `key-decisions`. The ones later plans lean on: an install is cancelled by `abort(version)` through `wine_dispatch::cancel_install_for_abort`; the shell reads the two install settings itself; and `wine_dispatch::parse_wine_version` is the one strict decode for a release, shared by the native handlers and the rustInvoke install arm.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The renderer's cancel had no path to the Rust install**
- **Found during:** Task 2
- **Issue:** the plan says a cancel id maps to a token held by `wine_dispatch`, but the Cancel button is `window.api.abort(version)`, a send the sidecar owns; with the TS handler deleted, nothing would have cancelled an install.
- **Fix:** `sidecar_send` offers `abort` to `wine_dispatch::cancel_install_for_abort` before relaying; a hit returns without forwarding. Tested end to end over a download that waits for its cancel.
- **Files modified:** `src-tauri/src/relay_commands.rs`, `src-tauri/src/wine_dispatch.rs`
- **Commit:** `409463f5e`

**2. [Rule 2 - Missing critical] The install needs the two Settings the TS read from `getSettings()`**
- **Found during:** Task 2 (87-19's handoff note)
- **Issue:** the crate reads no settings file; without them a Proton install ignores "download Proton to Steam".
- **Fix:** `read_install_settings` reads `defaultSettings.downloadProtonToSteam` and `.defaultSteamPath` from `<userData>/config.json` at install time (off on an unreadable file; the discovered Steam root when no path is stored and the setting is on). Tested over five shapes of config.
- **Files modified:** `src-tauri/src/wine_dispatch.rs`
- **Commit:** `409463f5e`

**3. [Rule 3 - Blocking] The shell has no `tokio-util`, and the install takes a `CancellationToken`**
- **Fix:** `gamelib-wine` re-exports `tokio_util::sync::CancellationToken`; no Cargo.toml or lockfile change.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/lib.rs`
- **Commit:** `169fcc50c`

**4. [Rule 1 - Bug] A 60 s sidecar bound would reject a slow refresh**
- **Found during:** Task 3
- **Issue:** the refresh and the releases-info check each walk up to seven feeds at 60 s a request; the TS refresh swallowed a slow feed, so the sidecar's rustInvoke bound would have turned a slow network into a rejected `getAlternativeWine` or an unhandled listener rejection.
- **Fix:** both join `UNBOUNDED_RUST_CHANNELS` with the install (the plan named only the install); the listener also `.catch`es to the log. The census test for that list follows.
- **Files modified:** `src/backend/sidecar/sidecarRpc.ts`, `src/common/types/sidecarTransport.ts`, `src/backend/__tests__/dialogOptionForwarding.test.ts`
- **Commit:** `2782da4f8`

**5. [Rule 3 - Blocking] The IPC generator renders a single object argument field by field**
- **Issue:** a strict zod object for the release hit "unsupported keyword minLength"; an `x-rust-value` on the object does not stop the field walk.
- **Fix:** the release and the releases-info argument are opaque (`z.unknown().meta({ x-rust-value })`), and the strict decode is the shell's `parse_wine_version`.
- **Files modified:** `src/common/types/ipc/rustInvoke.ts`
- **Commit:** `2782da4f8`

**6. [Rule 3 - Blocking] Files and tests outside the plan's list that follow the change**
- Census pins and fixtures: `flowRegistrationCensus`, `invokeReturnValueSweep` (its void-parity list), `runnerSliceRegistration`, `wineToolsFlows`, `ipcSchemas/wineTools`, `rustInvokeSchemas` (139 to 143), `tauriShellSource` (arm count and the pre-existing-arms list), `dialogOptionForwarding`. `wineManager.oracle.test.ts` called the deleted handlers; the removed handler bodies now live in the oracle, verbatim, so the 87-07 goldens stay runnable until 87-22.
- Dependency types: `handlers.ts` passes `requestRustInvoke` to `registerWineToolsFlows`; `WineToolsFlowDeps`, `checkWineBeforeLaunch`, `downloadDefaultWine`, `provisionBottle` and the GOG and Nile `setup` deps types gain `RustInvokeDeps` (their callers already held it).
- **Commits:** `63a33db8d`, `409463f5e`, `2782da4f8`

**Total deviations:** 6 auto-fixed (1 bug, 2 missing-critical, 3 blocking). **Impact:** the cancel path and the settings read are behaviour the plan left to the next reader and the goldens do not cover; the rest is bookkeeping that follows the new channels.

## Intra-phase DXMT gap (opened here, owed to 87-31)

From `409463f5e` a wine-manager install or remove runs in Rust and emits no TS `wineVersionInstalled` or `wineVersionUninstalled`, so the still-TS DXMT listener (`registerDxmtListeners`) neither installs DXMT into a newly installed wine-manager version nor cleans one out of a removed version. 87-31 Task 2 closes it; no push, release build or live gate runs before 87-58, which re-checks it.

## Issues Encountered

- A first RED run hung: the cancel test looped forever against the stub that never cancelled. The test's canceller is now bounded (1000 tries of 5 ms) so a missing registration fails the assertion instead of hanging.
- A stray `pkill` of the hung test binary was refused by the permission classifier; the one process was stopped by its PID.

## Known Stubs

None.

## Deferred Issues

- `src-tauri/src/main.rs` still lists `installWineVersion` in the sidecar's long-running invoke list (and `longRunningChannels.test.ts` pins it), dead but harmless now that the channel is native; the same item 87-18 recorded for `downloadRuntime`. Left for the plan that owns that list.
- `getAlternativeWine` (`config.ts`) still reads `wineDownloaderInfoStore`, the sidecar's mirror of the store, right after the awaited Rust refresh. If the mirror's change event has not arrived by then the first call can see the old list. The default-wine download avoids this by reading the list from Rust. 87-58's live gate should check a first launch with an empty store.
- `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails as before (known, not touched).

## Threat Flags

None new. T-87-67 holds: both renderer channels reject an unknown key or a bad field with a fixed literal before the context is looked at, remove passes the version only, and cancel ids are mapped inside `wine_dispatch`. T-87-68 holds: the shim arms validate with a generated decode and an arity check and the install arm re-runs the strict decode; the shims carry values the caller already trusted. `sidecar_send` now reads the first argument of an `abort` send; it takes a mutex and cancels a token, nothing else, and logs nothing.

## Next Phase Readiness

Ready for 87-22: no live TS path runs the TS wine manager (`wine/manager/utils.ts`, its downloader and the oracle's inlined handler bodies are the survivors it deletes). 87-31 Task 2 closes the DXMT gap above; 87-58 owns the live gate for the Wine Manager screen, the cancel, the "download Proton to Steam" route and the first-launch default wine.

## Self-Check: PASSED

- Created file exists: `src/backend/enginewine/wineManager.ts`.
- Commits exist on `main`: `63a33db8d`, `169fcc50c`, `409463f5e`, `2782da4f8` (4 measured from `plan_head_before`, all this plan's).
- Acceptance criteria re-run and passing (see Verification).

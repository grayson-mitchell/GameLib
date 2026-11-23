---
phase: 87-engine-wine-and-tools
plan: 26
subsystem: infra
tags: [rust, tauri, native-channel, rustinvoke, wine-discovery, get-alternative-wine, shims, twins, d-22]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the crate discovery ops wine_discover_alternatives, wine_discover_crossover and wine_default_wine with their goldens and default_wine.json vectors (87-23), the native + rustInvoke + shim-schedule caller-flip pattern (87-20, 87-24), the delete gate (87-03)
provides:
  - getAlternativeWine as a native wine channel (no argument), the shell building the crate's whole DiscoveryHost from its own roots, PATH, settings and the libraryfolders.vdf read; its sidecar handle and zod key deleted
  - RUST_WINE_DISCOVER_ALTERNATIVES (unbounded, one boolean) and RUST_WINE_DISCOVER_CROSSOVER (bounded, no argument) rustInvoke channels with zod tuples, contract arms and rust_dispatch arms
  - src/backend/enginewine/wineDiscovery.ts discoverAlternativeWine and src/backend/enginewine/intraPhase.ts discoverCrossover; config.ts's getAlternativeWine is one call of the first, crossoverLocation.ts calls the second
  - getLinuxWineSet, getWineOnMac, getWineskinWine, getCrossover, getGamePortingToolkitWine, getSystemGamePortingToolkitWine, getWhisky, getCustomWinePaths, getWineLibs and config's getMacOsWineSet deleted, with the discovery oracle test
  - getDefaultWineBinary kept as a scheduled twin pinned to default_wine.json by enginewine/__tests__/defaultWineTwin.test.ts
  - schedule rows discoverAlternativeWine (shim, 98), discoverCrossover (shim, 87), getDefaultWineBinary (twin, 98) and describe('wineDiscoveryPortComplete')
affects: [87-27, 87-31, 87-56, 87-58, Phase 98]

actuals:
  tokens: 31600
  tasks: 2
  commits: 2

plan_head_before: 48836e3b58ec65185e1bbcf65ec3c39b5b3a4c00
plan_head_after: 7b4b981a366e9ac3d9c42591b1525d3afca218dc

tech-stack:
  added: []
  patterns:
    - "a native channel whose handler builds the crate's strict host object itself (the shell's roots, the process PATH, the two settings read through the engine's global_settings, and the vdf read) so the renderer and the sidecar can send no path; the pure builder is split from the blocking channel body so a test drives both over a real context with an explicit PATH"
    - "a locator that used a dynamic import of a deleted TS module now takes the boot's rustInvoke transport at construction (createCrossoverLocator), so its many async callers keep their signature"
    - "a port gate run red against the restored TS (12 failures) and green against the deleted state"

key-files:
  created:
    - src/backend/enginewine/wineDiscovery.ts
    - src/backend/enginewine/intraPhase.ts
    - src/backend/enginewine/__tests__/defaultWineTwin.test.ts
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/wineTools.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/config.ts
    - src/backend/utils/compatibility_layers.ts
    - src/backend/engine/crossoverLocation.ts
    - src/backend/engine/engineRuntime.ts
    - src/backend/tools/index.ts
    - src/backend/enginewine/wineManager.ts
    - src/backend/testUtils/testConfig.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
  deleted:
    - src/backend/wine/__tests__/oracle/wineDiscovery.oracle.test.ts

key-decisions:
  - "The discovery host's settings come from gamelib_engine::config::global_settings (the shell's own read of config.json through the store host), not from anything the sidecar sends: customWinePaths (text entries only), showValveProton and defaultSteamPath (the discovered Steam root when the setting is empty, as 87-20's install settings do). The sidecar's rustInvoke arm takes one boolean, scanCustom, and nothing else, so T-87-71 holds for both entry points"
  - "wine_discover_alternatives is in UNBOUNDED_RUST_CHANNELS: with no wine release list stored it refreshes first (up to seven feeds in turn), exactly the reason wine_manager_refresh is unbounded; wine_discover_crossover is one mdfind with its own 10 s limit and stays bounded"
  - "scanCustom is kept as the shim's one argument (getAlternativeWine's second parameter, default true) so the TS behaviour is preserved, rather than dropping it to an argument-less call"
  - "The shim types its answer Promise<unknown> like every other enginewine shim (a cast around the call breaks checkShimShape); config.ts's getAlternativeWine names the list"
  - "createCrossoverLocator takes the boot's rustInvoke transport (EngineRuntimeDeps already carried it), so resolveCrossoverBinDirAsync keeps its {runner} first parameter and its roughly thirteen callers do not change; the runner is now unused there"
  - "config.ts no longer imports enginewine/wineManager: the empty-list refresh inside getAlternativeWine is Rust's own (refresh_when_empty), so the four wineManager schedule rows drop config.ts from their callers"
  - "getAlternativeWine left the Pick slices of WineToolsFlowDeps and ToolsDeps (neither calls it any more); this is what makes the plan's acceptance count of the quoted channel name in wineToolsFlowRegistration.ts reach 0"

patterns-established:
  - "a deleted TS function whose last caller is a still-TS module is reached through an intra-phase shim whose schedule row is deletedBy 87, so 87-56's noIntraPhaseRowsLeft removes it with the engine TS"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "getAlternativeWine is a native wine channel: no argument (an extra, null or object argument rejects with a fixed literal before the context is looked at), answered by the crate's wine_discover_alternatives over a DiscoveryHost the shell builds itself; its handle and zod key are deleted in the same commit"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_manifest_vectors and wine_dispatch (get_alternative_wine_takes_no_argument_and_answers_not_ready_before_install, the_discovery_host_is_the_shells_own_roots_path_and_settings, get_alternative_wine_lists_the_tools_wines_over_a_real_context)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts, ipcSchemaCoverage.test.ts, flowRegistrationCensus.test.ts, runnerSliceRegistration.test.ts, invokeReturnValueSweep.test.ts, wineToolsFlows.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "config.ts's getAlternativeWine is one call of discoverAlternativeWine over RUST_WINE_DISCOVER_ALTERNATIVES; the still-TS crossoverLocation reaches wine_discover_crossover through discoverCrossover; the rustInvoke arms take one boolean or nothing and answer not-ready before install"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (shim shape and channel of both rows), src/backend/engine/__tests__/crossoverLocation.test.ts, cargo test --bin gamelib-shell wine_dispatch (the_discovery_arms_take_a_boolean_or_nothing_and_answer_not_ready_before_install)"
        status: pass
    human_judgment: false
  - id: D3
    description: "getDefaultWineBinary stays as a sync twin and replays all 8 default_wine.json vectors (found, no wineserver, PATH order, first match, symlink as the link, not executable, PATH unset); a mutation of the name fails 5 of 9 cases"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/defaultWineTwin.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The TS discovery functions and the discovery oracle are gone and cannot return: describe('wineDiscoveryPortComplete') run red (12 failures over the restored TS) then green"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWinePortComplete.test.ts -t wineDiscoveryPortComplete"
        status: pass
    human_judgment: false
  - id: D5
    description: "In a running app: the Settings wine-version selector, the Install modal's engine list, the Steam bottle setup and the console-mode install overlay list the wines installed on this machine through the native channel, and a first-ever call with no release list stored refreshes the list and pushes wineVersionsUpdated"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No automated test drives window.api into the packaged shell with a real wine installed; the channel is proven by manifest vectors, a handler test over a real context and the 87-23 goldens. 87-58's live gate owns it"
---

# Phase 87 Plan 26: Wine discovery's callers switched to the Rust ops Summary

**`getAlternativeWine` is a native `wine` channel over the crate's `wine_discover_alternatives` with a `DiscoveryHost` the shell builds from its own roots, `PATH`, settings and `libraryfolders.vdf` read; `config.ts`'s method, the still-TS CrossOver locator and the sync default-wine reader reach Rust through one shim, one intra-phase shim and one pinned twin, and every TS discovery function and the discovery oracle are deleted.**

## Performance

- **Duration:** about 35 min (plan-head ledger written 19:46 local after the first reads; SUMMARY at 20:12)
- **Tasks:** 2 of 2 (one tracer, one auto)
- **Files:** 3 created, 21 modified, 1 deleted (36 files changed across the plan's two commits, 813 insertions, 1390 deletions)

## Accomplishments

- **Tracer (Task 1): `getAlternativeWine` native end to end.** `get_alternative_wine` decodes no argument (the renderer names no path, T-87-71) and runs `wine_discover_alternatives` on the blocking pool. `discovery_host` builds the crate's strict host object itself: `roots` (the engine context's home, `<appFolder>/config.json`, `/usr/share/steam`), the process `PATH`, `customWinePaths` (text entries only) and `showValveProton` through `gamelib_engine::config::global_settings`, and, on Linux, the `libraryfolders.vdf` under the quote-stripped `defaultSteamPath` read with `gamelib-steamfiles` (the discovered Steam root stands in for an empty setting). The sidecar's `ipc.handle` and zod key are gone; contract, snapshot and census pins follow (52 handle channels, wineTools 10, sweep 38).
- **The two rustInvoke ops.** `RUST_WINE_DISCOVER_ALTERNATIVES` (one boolean, `scanCustom`; unbounded because an empty release list is refreshed first) and `RUST_WINE_DISCOVER_CROSSOVER` (no argument; one `mdfind` with its own 10 s limit) with opaque-free zod tuples, generated contract arms and `rust_dispatch` arms. Both arms refuse extra arguments with fixed `<op>:bad-args` literals and answer `<op>:not-ready` before install.
- **The shims.** `enginewine/wineDiscovery.ts` `discoverAlternativeWine(deps, scanCustom)` is one returned typed call; `config.ts`'s `getAlternativeWine` body is one return of it (its deps parameter stays so `utils.ts` and `installFormIpc.ts` do not change) and `getMacOsWineSet` is removed from the class, the slice and the test config. `enginewine/intraPhase.ts` `discoverCrossover(deps)` replaces the dynamic import of `getCrossover` in `crossoverLocation.ts`; the locator now holds the boot's `requestRustInvoke` (one line in `engineRuntime.ts`).
- **The deletions.** `getLinuxWineSet`, `getWineOnMac`, `getWineskinWine`, `getCrossover`, `getGamePortingToolkitWine`, `getSystemGamePortingToolkitWine`, `getWhisky`, `getCustomWinePaths`, `getWineLibs`, `mdfind` and the two discovery dep types are out of `compatibility_layers.ts` (673 to 215 lines), along with `wineDiscovery.oracle.test.ts` and the discovery cases of `compatibility_layers.test.ts`; the goldens and vectors stay for the Rust replay. `getDefaultWineBinary`, `getWineExecs`, `getWineFlags`, `getWineFlagsArray`, `getUmuPath` and `isUmuSupported` stay.
- **The twin and the gate.** `defaultWineTwin.test.ts` replays the same 8 `default_wine.json` vectors `golden_discovery.rs` replays against Rust, over a scripted `PATH` in a temp tree (an anti-vacuity floor of 8, found and not-found both present; a mutation of the name failed 5 of 9). The schedule gains `discoverAlternativeWine` (shim, 98), `discoverCrossover` (shim, 87, removed with the engine TS in 87-56) and `getDefaultWineBinary` (twin, 98). `describe('wineDiscoveryPortComplete')` forbids the deleted identifiers in non-test `src/backend`, keeps the goldens, vectors and twin test, asserts the shims and the surviving twin exist and that the sidecar registers no `getAlternativeWine` handle; it ran red (12 failures) with the TS and the oracle restored, then green.

## Task Commits

1. **Task 1 (tracer): `getAlternativeWine` native end to end over the crate discovery with the shell's real roots** - `aa234533d` (feat)
2. **Task 2: discovery shims, the default-wine twin and the TS discovery functions deleted** - `7b4b981a3` (feat)

Tracer gate: auto mode off (`workflow.auto_advance` false), `HUMAN_VERIFY_MODE` end-of-phase, and the tracer's `<verify>` is automated only, so it was run end to end (`native_manifest_vectors`, `wine_dispatch`, rustfmt, `check:ipc-contract`, the ownership and schema jest, codecheck, prettier) and again inside the full jest run. Tracer verified end to end, expansion followed.

## Verification

- `cargo test --bin gamelib-shell`: `wine_dispatch` 29 passed (6 new), `native_manifest_*` 5 passed; `rust_dispatch` matches no test name (the arms are covered by `wine_dispatch::tests` and the arm-count pin in `tauriShellSource.test.ts`, 145 to 147). `rustfmt --edition 2021 --check` over `wine_dispatch.rs`, `native_router.rs` and `rust_dispatch.rs`: clean.
- `pnpm check:ipc-contract`: both files current. `pnpm codecheck`: clean. `pnpm find-deadcode`: PASS at 310 baselined findings (no rise). `npx prettier --check` over every TS path written: clean. `npx eslint` over the touched TS: no errors (warnings only on untouched lines of `tools/index.ts`).
- jest `src/backend src/common src/preload meta/__tests__`: 740 suites passed; the one failure is the known `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT. The regression set (`infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule`) passes. A first full run also failed `nativeSeamPortComplete` ("no rollback flag text survives" for five slices), which passes alone and in a second full run; it read the tree while this plan was rewriting files, so it was a transient, not a regression.
- Acceptance: non-comment `'getAlternativeWine'` in `wineToolsFlowRegistration.ts` count 0 (was 1); `getCrossover`, `getWhisky` and `getLinuxWineSet` exports in `compatibility_layers.ts` count 0 (was 3); `export function getDefaultWineBinary` count 1 (preservation guard holds).

## Decisions Made

See `key-decisions`. The ones later plans lean on: the shell, not the sidecar, supplies every discovery input; `wine_discover_alternatives` is unbounded in the sidecar; and the CrossOver locator holds the rustInvoke transport.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getMacOsWineSet` and the `getAlternativeWine` Pick entries had to go with the functions**
- **Found during:** Task 2
- **Issue:** `config.ts`'s `getMacOsWineSet` called the deleted mac finders and had no other caller; the plan names only `getAlternativeWine`'s body. Separately, the plan's acceptance count of the quoted channel name in `wineToolsFlowRegistration.ts` stayed at 1 because the registration deps' `config` Pick still named it.
- **Fix:** `getMacOsWineSet` is removed from the class, `GlobalConfigSlice` and `testConfig.ts`; `getAlternativeWine` is dropped from the Pick of `WineToolsFlowDeps` and of `ToolsDeps` in `tools/index.ts` (neither calls it).
- **Files modified:** `src/backend/config.ts`, `src/backend/testUtils/testConfig.ts`, `src/backend/sidecar/wineToolsFlowRegistration.ts`, `src/backend/tools/index.ts`
- **Commit:** `aa234533d`, `7b4b981a3`

**2. [Rule 3 - Blocking] The locator needed the rustInvoke transport**
- **Issue:** `discoverCrossover(deps)` needs `requestRustInvoke`, but `createCrossoverLocator` took only `paths` and its async resolver is called with `{ runner }` from about thirteen sites.
- **Fix:** `createCrossoverLocator` takes `paths` plus `RustInvokeDeps`; `createEngineRuntime` passes the transport it already held; `resolveCrossoverBinDirAsync` keeps its signature. `crossoverLocation.test.ts` scripts the transport and asserts the channel and empty argument list; `engineDecision.oracle.test.ts` (sync resolver only) passes a stub transport.
- **Files modified:** `src/backend/engine/crossoverLocation.ts`, `src/backend/engine/engineRuntime.ts`, `src/backend/engine/__tests__/crossoverLocation.test.ts`, `src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts`
- **Commit:** `7b4b981a3`

**3. [Rule 3 - Blocking] Files and pins outside the plan's list that follow the change**
- `compatibility_layers.test.ts` tested the deleted functions (trimmed to `getDefaultWineBinary` and `getWineExecs`); `config.ts` no longer imports `enginewine/wineManager`, so the four wineManager schedule rows drop `config.ts` from `callers`; census pins: `flowRegistrationCensus`, `invokeReturnValueSweep`, `runnerSliceRegistration`, `wineToolsFlows`, `ipcSchemas/wineTools`, `rustInvokeSchemas` (145 to 147), `tauriShellSource` (arm count and the new-arms list), `dialogOptionForwarding` (the unbounded list), `sidecarRpc.ts` (`UNBOUNDED_RUST_CHANNELS`).
- **Commits:** `aa234533d`, `7b4b981a3`

**Total deviations:** 3 (all blocking, none a bug). **Impact:** none on scope; each is the mechanical consequence of a deletion the plan asked for.

### Behaviour changes worth knowing

- **Windows answers an empty list from `getAlternativeWine`.** The TS ran the Linux set on Windows (and created `<tools>/wine` and `<tools>/proton`); the Rust discovery answers empty (a D-19 delta recorded in 87-23's `deltas.json`). `getFactoryDefaults` still gives Windows an empty wine.
- **The settings come from the shell's read of `config.json`, not the sidecar's in-memory copy.** A `customWinePaths` or `showValveProton` change is seen once the shell has applied the write, which is the same store the sidecar's own cell is committed to; a call in the instant between is a stale read of one setting.
- **The "Unable to load Steam Libraries" debug line is gone from this path.** The Rust read logs nothing for a missing vdf.
- **A failing release refresh no longer rejects `getAlternativeWine`.** It is logged in Rust and discovery of what is on disk goes on (also a 87-23 delta).

## Issues Encountered

One transient `nativeSeamPortComplete` failure in a full run that overlapped file edits (see Verification); a husky pre-commit prettier check on `testConfig.ts` (a one-line removal left a formatting difference), fixed with `prettier --write` and re-staged.

## Known Stubs

None.

## Deferred Issues

- `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails as before (known, not touched).
- A live call of `getAlternativeWine` against a real wine install and a first-ever empty release list is not exercised by any test; 87-58's live gate owns it.

## Threat Flags

None new. T-87-71 holds: the native `getAlternativeWine` rejects any argument with a fixed literal and the rustInvoke arm decodes exactly one boolean, so no path the renderer or the sidecar holds reaches the crate; every root, the `PATH`, the settings and the Steam libraries are read by the shell. The only new file read in the shell is `libraryfolders.vdf` under the Steam root the settings name, through `gamelib-steamfiles`' bounded reader. Discovery executes nothing it finds except `<wine> --version` through the crate's labelled spawn (87-23). T-87-SC: no new crate.

## Next Phase Readiness

Ready for 87-27: wine discovery's TS reach is one shim, one intra-phase shim and one pinned twin. `discoverCrossover` (`deletedBy 87`) must be gone by 87-56 with the engine TS; `discoverAlternativeWine` and the `getDefaultWineBinary` twin fall in Phase 98 with the config. 87-31 and 87-58 still own the DXMT gap and the live gate for the wine selectors.

## Self-Check: PASSED

- Created files exist: `src/backend/enginewine/wineDiscovery.ts`, `src/backend/enginewine/intraPhase.ts`, `src/backend/enginewine/__tests__/defaultWineTwin.test.ts`; `src/backend/wine/__tests__/oracle/wineDiscovery.oracle.test.ts` is deleted.
- Commits exist on `main`: `aa234533d` and `7b4b981a3` (2 measured from `plan_head_before`, both this plan's).
- Acceptance criteria and the plan-level verification re-run and passing (see Verification).

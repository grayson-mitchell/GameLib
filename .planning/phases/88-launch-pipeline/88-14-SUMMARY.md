---
phase: 88-launch-pipeline
plan: 14
subsystem: known-fix-bridge-shims
tags: [knownfix, rustinvoke, shim, twin, schedule, overlay-env, registry, steam-bridge, app-runtime, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 13
    provides: the launchrust/knownFixes.ts shim file, the settle helpers, KNOWN_FIX_OVERLAY_BASE_ENV_KEYS, knownFixTwins.ts with its golden-pinned vectors test, KNOWN_FIX_SHIM_IMPORTERS and KNOWN_FIX_TWIN_IMPORTERS
  - phase: 88-launch-pipeline
    plan: 09
    provides: the knownfix_apply_registry op (apply_bridge_registry_fixes) in gamelib-knownfix
  - phase: 88-launch-pipeline
    plan: 10
    provides: the knownfix_resolve_overlay_env op and the overlay archive in gamelib-knownfix
  - phase: 88-launch-pipeline
    plan: 05
    provides: the golden/reader, launch_overrides, overlay_install and overlay_archive recordings the twins are pinned to
provides:
  - rustInvoke channels RUST_KNOWNFIX_APPLY_REGISTRY and RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV, both in UNBOUNDED_RUST_CHANNELS, with strict zod args, generated serde decode, rust_dispatch arms and knownfix_dispatch rpc arms
  - shims applyRegistryFixes and resolveKnownFixOverlayEnv in launchrust/knownFixes.ts (deletedBy 97)
  - twins readKnownFixProfile, readKnownFixLaunchOverridesSync, lastEnvOption, readOverlayTarGz and buildOverlayTarGz in launchrust/knownFixTwins.ts, each pinned to a golden slice (deletedBy 97)
  - bridgeKnownFixes.ts and steamclientLayerInstall.ts with no import of a known-fix TS module
  - appRuntime.ts without overlayInstalls
affects: [88.1, 97, 88-16]

actuals:
  tokens: 23400
  tasks: 3
  commits: 4
commits: 4
plan_head_before: 65879a0d04cf1c208c19607d05c97262594e75fd
plan_head_after: c77a201bc596dcf3358b1e4f75e245a0233e38b6

tech-stack:
  added: []
  patterns:
    - "a Rust op that reads its own profile (the bridge's registry and overlay ops) is called only when the TS twin read says the profile carries something for it, so a profile-less launch adds no channel traffic and the old no-op behaviour is kept"
    - "a vectors test replays a golden slice whose steps the twin cannot take directly by routing them through the twin's public entry (a `resolve` step of golden/launch_overrides runs as a tier-1 fix carrying that exeOverride), so a private helper copy is pinned without a schedule row of its own"

key-files:
  created: []
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/knownfix_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/launchrust/knownFixes.ts
    - src/backend/launchrust/__tests__/knownFixes.shims.test.ts
    - src/backend/launchrust/knownFixTwins.ts
    - src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts
    - src/backend/storeManagers/steam/bridgeKnownFixes.ts
    - src/backend/__tests__/steamBridgeKnownFixes.test.ts
    - src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/steamclientLayerInstall.test.ts
    - src/backend/appRuntime.ts
    - src/backend/knownFixOverlays.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/appRuntime.test.ts
    - src/backend/testUtils/testAppRuntime.ts

key-decisions:
  - "Both new channels are in UNBOUNDED_RUST_CHANNELS (a 'Nineteenth (Phase 88, 88-14)' doc entry, and dialogOptionForwarding's EXPECTED): the bridge's registry step runs the same chain of 15 s `reg add` helpers and its overlay step the same on-demand 120 s download"
  - "The bridge sends Rust only appId, label, settings and the bottle folder (registry) and appId, label, wineType and baseValues (overlay): the Steam tier-2 profile is read in Rust, so a caller-supplied profile or overlays list is refused by the strict args (T-88-35)"
  - "baseValues holds only KNOWN_FIX_OVERLAY_BASE_ENV_KEYS that have a value, each computed as the merged env's last entry first and process.env second, which is the old baseValue callback evaluated for the keys the resolver asks about (T-88-33)"
  - "The twins are verbatim copies; none differed from a golden on first run (266 vectors passed)"
  - "knownFixOverlays.ts names its own overlayInstalls slice type, because the boot's app runtime no longer carries one and the TS module lives until 88-16"

patterns-established:
  - "A bridge shim is awaited through a settle helper, never directly, so a rejected call is a warning and the launch goes on"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The Steam bridge's registry fixes and overlay env are computed by Rust through two unbounded scheduled shims; a rejected or odd call never fails a launch"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixes.shims.test.ts#applyRegistryFixes (the Steam bridge, 88-14) and resolveKnownFixOverlayEnv (the Steam bridge, 88-14)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/steamBridgeKnownFixes.test.ts#registry fixes through Rust and applySteamBridgeKnownFixes overlays"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/dialogOptionForwarding.test.ts#contains exactly the dialog, depot, Rust CM, safety remove, wine runtime download and wine manager channels"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts#every shim and resolver row has the shape it claims and sends its row channel"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shell answers knownfix_apply_registry and knownfix_resolve_overlay_env: decode first with a fixed-literal rejection that never echoes input, not-ready before install, the crate's strict decode behind it"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell (886 passed): apply_registry_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, resolve_overlay_env_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, resolve_overlay_env_answers_an_empty_env_for_a_game_without_a_steam_profile"
        status: pass
      - kind: integration
        ref: "pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "The bridge's synchronous reads (tier-2 profile, launch overrides, env lookup, overlay archive reader and writer) are verbatim twins that match the Rust goldens, and neither the bridge nor the steamclient layer install imports a known-fix TS module"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts (266 passed: golden/reader tier-2, golden/launch_overrides 19 cases, golden/overlay_install lastEnvOption, golden/overlay_archive 25 cases, planted-mismatch self-tests)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/drm/__tests__/steamclientLayerInstall.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The overlay single flight leaves the TS app runtime"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "pnpm codecheck and src/backend/__tests__/appRuntime.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "A Steam bridge game launched in the running app gets its registry fixes applied and its overlay env merged from Rust"
    verification: []
    human_judgment: true
    rationale: "No test starts the shell with the sidecar and launches a bridged Steam game with a seeded tier-2 profile; the dispatch is covered at each seam (shim, schema, shell arm, crate, golden) but not end to end in a live app"

duration: 16min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 14: Steam bridge known-fix shims and twins Summary

**The Steam bridge's registry fixes and overlay env now come from Rust through two unbounded channels and scheduled shims (Rust reads the Steam tier-2 profile itself), its synchronous profile, launch-override, env-lookup and overlay-archive reads are five verbatim twins replayed against the goldens the Rust crate replays, and the TS overlay single flight is gone from the app runtime**

## Performance

- **Duration:** about 16 min by the clock
- **Completed:** 2026-11-25
- **Tasks:** 3 (tracer, a TDD task with a separate RED commit, and the app runtime removal)
- **Files modified:** 22 (0 created, 22 modified)

## Accomplishments

- `applyRegistryFixes(deps, appId, label, gameSettings, bottleDir)` and `resolveKnownFixOverlayEnv(deps, appId, label, wineType, baseValues)` are shims over `RUST_KNOWNFIX_APPLY_REGISTRY` and `RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV`. `applySteamBridgeKnownFixes` awaits each through a settle helper inside its existing async body; the bridge no longer imports `knownFixesRegistry`, `knownFixOverlays`' resolver or the registry re-exports.
- Both channels are unbounded on the sidecar (the same 15 s `reg add` chain and 120 s download), with the numbered doc entry and `dialogOptionForwarding`'s set equality updated in the same commit. Shell arms decode first with a fixed `<op>:bad-args` literal that never echoes input, then answer `<op>:not-ready` before install; the overlay arm checks `baseValues` is a string map itself, because the generated decode keeps it opaque.
- `baseValues` carries only the overlay env keys that have a value (the merged env's last entry first, `process.env` second), pinned by three cases including one that proves `HOME`-like secrets never cross.
- `knownFixTwins.ts` gained `readKnownFixProfile`, `readKnownFixLaunchOverridesSync`, `lastEnvOption`, `readOverlayTarGz` and `buildOverlayTarGz`, copied verbatim with their private helpers. The vectors test now replays `golden/reader` (tier-2 cases), `golden/launch_overrides` (all 19 cases, the `resolve` steps through the twin as a tier-1 fix), `golden/overlay_install` (`lastEnvOption`) and `golden/overlay_archive` (all 25 cases, every step kind), each with a planted-mismatch self-test.
- `bridgeKnownFixes.ts` and `steamclientLayerInstall.ts` (and its test) import the twins file; seven schedule rows were added (two shims and five twins, all deletedBy 97) and every shim and twin row's callers list now names the bridge.
- `overlayInstalls` left `appRuntime.ts` and `BridgeKnownFixDeps`.

## Task Commits

1. **Task 1: Tracer, registry fixes and overlay env through two unbounded shims to Rust** - `b95ec64fd` (feat)
2. **Task 2 RED: bridge twin vectors against four golden slices, null-stub twins** - `5b9a03863` (test; 86 of 266 tests failing on their comparisons)
3. **Task 2 GREEN: verbatim twins, bridge and steamclient-layer flip, five twin rows** - `1b3fbb398` (feat)
4. **Task 3: Remove the TS overlay single flight from the app runtime** - `c77a201bc` (refactor)

The tracer gate ran in auto mode with `human_verify_mode` `end-of-phase` and an automated-only `<verify>`: the tracer's verify was re-run end to end (the whole shell binary, `check:ipc-contract`, the steam, common, sidecar and launchrust jest trees, `codecheck`, prettier) and passed before the expansion task started. Tracer verified end-to-end, expanding.

## Files Created/Modified

- `src/common/types/sidecarTransport.ts`, `src/common/types/ipc/rustInvoke.ts` - the two channels and their strict args
- `src-tauri/src/knownfix_dispatch.rs`, `rust_dispatch.rs`, `ipc_contract.rs` - the arms (with 3 new shell tests) and regenerated contract
- `src/backend/sidecar/sidecarRpc.ts`, `src/backend/__tests__/dialogOptionForwarding.test.ts` - the unbounded entries
- `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts` - census counts 193 to 195 and the arm list
- `src/backend/launchrust/knownFixes.ts` and its shims test - the two shims
- `src/backend/launchrust/knownFixTwins.ts` and its vectors test - the five twins and their four golden replays
- `src/backend/storeManagers/steam/bridgeKnownFixes.ts` and `steamBridgeKnownFixes.test.ts` - the flip
- `src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts` and its test - the archive twin import
- `src/backend/appRuntime.ts`, `knownFixOverlays.ts`, `__tests__/appRuntime.test.ts`, `testUtils/testAppRuntime.ts` - the slice removal
- `src/backend/__tests__/engineWineShimSchedule.test.ts` - seven rows and the two importer lists

## Removed bridge test titles and their covering golden cases

D-15: each of these is a port, not a loss. Golden cases are under `src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/registry/` and replayed by `tests/golden_registry.rs`; `golden/reader` cases by `golden_reader.rs`.

| Removed `steamBridgeKnownFixes.test.ts` title | Covered by |
| --- | --- |
| `buildRegistryFixCommandParts` builds the exact argv for view 32 | `command-parts-for-each-type-and-view` |
| `buildRegistryFixCommandParts` ends /reg:64 /f for view 64 | `command-parts-for-each-type-and-view` |
| registry fixes application: bundled profile without views applies 32 then 64 | `bridge-both-views-run-in-the-bottle` |
| registry fixes application: skips reg add for values already in the bottle system.reg | `bridge-skips-a-view-already-set-in-the-bottle` |
| registry fixes application: dllOverrides-only profile writes the AppDefaults value | `knownFixesRegistry--applyknownfixprofileregistry-applies-a-dlloverrides-only-profile-as-an-appdefaults-reg-add`, `knownFixesRegistry--dlloverridestoregistryfixes-compiles-dlls-to-reg-sz-appdefaults-entries-disabled-as-empty` |
| registry fixes application: skips a dllOverrides value already in the bottle user.reg | `knownFixesRegistry--wineregistryvalueisset-handles-hkcu-view-64-and-doubts-hkcu-view-32`, `knownFixesRegistry--applyregistryfixes-skip-and-kill-spawns-nothing-and-logs-per-view-when-both-views-are-set` |
| registry fixes application: views [64] applies once | `knownFixesRegistry--applyregistryfixes-skip-and-kill-runs-only-the-missing-view`, `validate-every-reject-reason` |
| registry fixes application: local overrides bundled | `golden/reader` pairwise local-over-bundled cases (also replayed in TS by `knownFixTwins.vectors.test.ts` for `readKnownFixProfile`), `knownFixesRegistry--applyknownfixprofileregistry-applies-via-the-local-layer-for-legendary-file-suffix-is-epic` |
| failures never reject and env still applies: non-zero code | `knownFixesRegistry--applyregistryfixes-warns-never-rejects-on-non-zero-code-undefined-and-rejection`, `launcher-path-reg-add-exiting-non-zero-is-a-warning` |
| failures never reject and env still applies: undefined code | `knownFixesRegistry--applyregistryfixes-warns-never-rejects-on-non-zero-code-undefined-and-rejection` |
| failures never reject and env still applies: rejection | same golden; the bridge-side behaviour is `a rejected registry call warns and the env still applies` |
| times out a never-settling call after 15s and warns | `bridge-timeout-kills-the-reg-add`, `knownFixesRegistry--applyregistryfixes-skip-and-kill-sigkills-the-captured-child-on-timeout-and-warns-killed`, `knownFixesRegistry--applyregistryfixes-skip-and-kill-keeps-the-15-s-timeout` |
| times out a never-settling call after 15s even when the prefix .reg read is slow | the same three; the slow-read race was a TS artifact of the turn-counted wait (G-82-2-r3), and the 15 s limit is a Rust timer |
| `validateRegistryFixes` skips %s with a warning and keeps the valid sibling (24 cases: root HKCR, root HKU, no root, empty path after root, empty segment, trailing backslash, quote in key, CR in key, LF in name, NUL in name, quote in value, NUL in value, empty name, slash name, REG_BINARY, dword float, dword negative, dword too big, dword string, sz number, views empty, views 16, views not array, not an object) | `validate-every-reject-reason`, `knownFixesRegistry--validateregistryfixes-keeps-a-valid-entry-and-warns-on-a-bad-sibling-with-ctx-label-prefix`, `knownFixesRegistry--validateregistryfixes-rejects-a-name-starting-with-and-a-quote-in-a-reg-sz-value` |
| `validateRegistryFixes` warns on a non-array registry | `knownFixesRegistry--validateregistryfixes-warns-and-returns-for-a-non-array` |
| `validateRegistryFixes` dedupes and orders views | `validate-every-reject-reason` |
| `validateRegistryFixes` stringifies REG_DWORD data and defaults to both views | `knownFixesRegistry--validateregistryfixes-keeps-a-valid-entry-and-warns-on-a-bad-sibling-with-ctx-label-prefix` (answers `data: "1"`, `views: [32, 64]`) |

Kept but rewritten to assert the channels: the two overlay application cases, `ignores a .profile.json that sits only in the remote directory`, the three `ignores registry placed in a tier-1 .json (%s) and warns` cases, and `applies remote tier-1 envVariables and the bundled tier-2 registry in the same launch` (each now asserts the call or its absence on `knownfix_apply_registry`). `bundled 284100 profile` lost its `validateRegistryFixes` call and asserts the profile data the Rust validator takes (one entry, no `views`, the evidence cite, no tier-1 file). The file went from 47 titles to 58 tests (the `it.each` expansions included in the second figure).

## Decisions Made

See `key-decisions` above.

## TDD Gate Compliance

| Plan | RED | GREEN | REFACTOR | Status |
| ---- | --- | ----- | -------- | ------ |
| 88-14 Task 2 | `5b9a03863` test(88-14) | `1b3fbb398` feat(88-14) | none needed | RED then GREEN in order |

RED evidence: `pnpm exec jest --runTestsByPath src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts` against null-stub twins: 86 failed, 180 passed. The target tests failed on the planned assertion (for example `lastEnvOption`: expected `"2"`, received `"stub"`; a `resolve` step expected `"<HOME>/games/install/bin/game.exe"`, received `null`), not on a load or syntax fault; the cases that passed against the stubs are those whose golden answer is itself `null` or empty. The RED record was not run through `gsd_run check tdd-red-evidence`; the semantic assessment above is the manual check. The stubs were needed because a test whose import of a missing export fails is a load failure, which the RED rules refuse. Task 1 is a tracer and Task 3 a removal, neither flagged `tdd="true"`, so each is a single commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The bridge awaits both shims through the settle helpers, not directly**
- **Found during:** Task 1
- **Issue:** The plan has the bridge await `applyRegistryFixes` and `resolveKnownFixOverlayEnv` directly. A rejected transport call (shell not ready, a refused argument) would reject inside `applySteamBridgeKnownFixes`' outer `try`, which returns the unmodified settings and drops the tier-1 env, winetricks and runInPrefix steps. The TS it replaces never failed that way (a failed `reg add` was a warning and a failed overlay was `{}`).
- **Fix:** `settleKnownFixRegistry` and `settleKnownFixOverlayEnv` (88-13) wrap the two calls. The key link's literal `await resolveKnownFixOverlayEnv` therefore reads `await settleKnownFixOverlayEnv(label, resolveKnownFixOverlayEnv(...))`.
- **Files modified:** `src/backend/storeManagers/steam/bridgeKnownFixes.ts`
- **Verification:** `rejects`, `answers a value that is not a string map`, `answers null` overlay cases and `a rejected registry call warns and the env still applies`
- **Commit:** `b95ec64fd`

**2. [Plan deviation] The registry and overlay calls are gated on the TS profile read**
- **Issue:** The plan replaces the registry block with one `applyRegistryFixes` call. The Rust op is a no-op without a profile, but a call per launch for every bridge game, profile or not, is a round trip and a log line for nothing, and would add a second `requestRustInvoke` to the winetricks-only cases.
- **Fix:** the registry call is made only when the (twin-read) profile has `registry` or `dllOverrides`, which is exactly the old `registryRaw !== undefined`, and the overlay call only when it has `overlays`.
- **Files modified:** `src/backend/storeManagers/steam/bridgeKnownFixes.ts`
- **Verification:** `sends no call for a profile with neither registry nor dllOverrides`, `sends no call without a profile`, `leaves settings untouched and asks Rust nothing when a profile has no overlays`
- **Commit:** `b95ec64fd`

**3. [Rule 3 - Blocking] Two censuses pinned counts this plan changes**
- **Found during:** Task 1 (jest)
- **Issue:** `tauriShellSource.test.ts` pins the `rust_dispatch.rs` arm count (193) and the list of arms new since 34.1, and `rustInvokeSchemas.test.ts` pins `RUST_INVOKE_CHANNELS` at 193.
- **Fix:** Counts to 195 with the per-plan comment line, and the two new arm names added to the arm list with a PROVEN note.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts`
- **Commit:** `b95ec64fd`

**4. [Rule 3 - Blocking] The plan's cargo verify command cannot print a passing count for `rust_dispatch`**
- **Found during:** Task 1
- **Issue:** `cargo test --bin gamelib-shell rust_dispatch` matches no test (`rust_dispatch.rs` has no test module), as 88-12 and 88-13 found.
- **Fix:** Ran the whole shell binary (886 passed, 0 failed, 2 ignored) plus `cargo test --bin gamelib-shell knownfix` (16 passed).

**5. [Rule 3 - Blocking] `knownFixOverlays.ts` still named the slice the app runtime no longer has**
- **Found during:** Task 3
- **Issue:** The plan expects `overlayInstalls` to remain only in the TS known-fix modules, but `knownFixOverlays.ts` typed it as `AppRuntimeSlice<'overlayInstalls'>`, which is a type error once `AppRuntime` loses the key.
- **Fix:** an internal `OverlayInstallsSlice` (`{ appRuntime: { overlayInstalls: KnownFixOverlayInstalls } }`) in that module; 88-16 deletes it with the module.
- **Files modified:** `src/backend/knownFixOverlays.ts`
- **Verification:** `pnpm codecheck`; `knownFixOverlays.test.ts` and the overlay oracle still build their own deps with the slice
- **Commit:** `c77a201bc`

**6. [Plan deviation] The settle helpers are imported by a relative path**
- **Issue:** Task 2's acceptance greps `from 'backend/knownFix` and expects 0; `backend/knownFixLaunchReply` is a surviving module (not one of the TS known-fix modules 88-16 deletes) and would count as 1.
- **Fix:** `bridgeKnownFixes.ts` imports it as `../../knownFixLaunchReply`, as it already imports `../../host/rustInvokeDeps`.
- **Commit:** `1b3fbb398`

**7. [Plan deviation] No test fixture needed the `overlayInstalls` slice removed**
- **Issue:** Task 3 asks for the slice to leave every fixture that builds an app runtime with it. None builds one: `createAppRuntime` was the only constructor, and the three remaining matches (`knownFixOverlays.test.ts`, `knownFixOverlayInstall.test.ts`, the overlay oracle) build their own deps for the TS overlay modules, which are still valid against the module-local slice type.

---

**Total deviations:** 7 (1 Rule 2, 3 Rule 3, 3 plan-level)
**Impact on plan:** one extra pair of settle-helper calls and two gates in the bridge, otherwise the plan's shape. No scope creep.

## Issues Encountered

- `cargo clippy -p gamelib-shell --all-targets` has no finding in `knownfix_dispatch.rs` or `rust_dispatch.rs`; `ipc_contract.rs` stays rustfmt-unclean as at HEAD. `knownfix_dispatch.rs` is rustfmt-clean.
- `ipcSchemaSnapshot.json` is regenerated alongside `ipc_contract.rs` by `gen:ipc-contract` and shows no tracked change.
- A wrong-case spelling of an existing exe override is not in `golden/launch_overrides` (it is accepted on a case-insensitive volume and rejected on a case-sensitive one), as that slice's `deltas.json` documents, so the twin is not pinned for it.

## Known Stubs

None.

## Threat Flags

None. T-88-35 (tampering through the bridge's registry args) is mitigated: the strict zod args and `deny_unknown_fields` refuse a caller-supplied profile or overlays list, and the shell test pins the fixed `bad-args` literal. T-88-36 (twin drift) is mitigated by the four golden replays with planted-mismatch self-tests; no twin differed from a golden. T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-16 can delete the TS known-fix modules (`knownFixes.ts`, `knownFixLaunch.ts`, `knownFixOverlays.ts`, `knownFixOverlayInstall.ts`, `knownFixOverlayArchive.ts`, `knownFixesRegistry.ts`) once their own tests and oracles are retired: no non-test importer remains in the bridge, the launcher or the common store manager. `knownFixOverlays.ts` is the only non-test file that still names `overlayInstalls`.
- 97 deletes the seven rows added here with the bridge's TS known-fix application.
- `BridgeKnownFixDeps` still lists `aborts`, which the bridge no longer reads (the overlay resolver was its only user); dropping it is a follow-up for whoever next touches the callers.
- A live-app check of a bridged Steam game with a seeded tier-2 registry fix and overlay has not been done (D5 above).

## Self-Check: PASSED

- Modified files present: all 22 listed above exist on disk.
- Commits `b95ec64fd`, `5b9a03863`, `1b3fbb398` and `c77a201bc` are ancestors of HEAD; `git rev-list --count` from the recorded base is 4.
- Acceptance, Task 1: `grep -c "backend/knownFixesRegistry" bridgeKnownFixes.ts` = 0.
- Acceptance, Task 2: `grep -c "from 'backend/knownFix" bridgeKnownFixes.ts` = 0; `grep -c "backend/knownFixOverlayArchive" steamclientLayerInstall.ts` = 0.
- Acceptance, Task 3: `grep -c overlayInstalls appRuntime.ts` = 0; the remaining matches under `src/backend` are `knownFixOverlays.ts` and three test files for the TS overlay modules.
- Plan verification: `cargo test --bin gamelib-shell` 886 passed; `pnpm check:ipc-contract` up to date; `pnpm exec jest src/backend src/common` 15020 passed (624 suites); `pnpm codecheck` clean; prettier clean over every touched file.

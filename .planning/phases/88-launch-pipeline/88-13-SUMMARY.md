---
phase: 88-launch-pipeline
plan: 13
subsystem: known-fix-launcher-shims
tags: [knownfix, rustinvoke, shim, twin, schedule, overlay-env, registry, launcher, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 12
    provides: the launchrust/knownFixes.ts shim file, the strict one-element-tuple zod args, the fixed bad-args and not-ready literals, the settle-helper pattern, KNOWN_FIX_SHIM_IMPORTERS
  - phase: 88-launch-pipeline
    plan: 09
    provides: the knownfix_apply_profile_registry op in gamelib-knownfix
  - phase: 88-launch-pipeline
    plan: 10
    provides: the knownfix_profile_overlay_env op in gamelib-knownfix
  - phase: 88-launch-pipeline
    plan: 05
    provides: the golden/reader and golden/overlay_install recordings the twins are pinned to
provides:
  - rustInvoke channels RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY and RUST_KNOWNFIX_PROFILE_OVERLAY_ENV, both in UNBOUNDED_RUST_CHANNELS, with zod args, generated serde decode, rust_dispatch arms and knownfix_dispatch rpc arms
  - shims applyKnownFixProfileRegistry and knownFixProfileOverlayEnv in launchrust/knownFixes.ts, and settleKnownFixRegistry and settleKnownFixOverlayEnv in knownFixLaunchReply.ts
  - KNOWN_FIX_OVERLAY_BASE_ENV_KEYS and overlayBaseEnv in common/knownFixOverlayCatalogue.ts
  - launchrust/knownFixTwins.ts (readKnownFixes, formatKnownFixEnvLine, logKnownFixEnv, withKnownFixEnv) and its golden-pinned vectors test
  - the launcher and storeManagerCommon with no import of a known-fix TS module
affects: [88.1, 91, 92, 97]

actuals:
  tokens: 13772
  tasks: 2
  commits: 3
commits: 3
plan_head_before: b0ffe10414a9ecc0e00f78023912b98542931486
plan_head_after: 714be07d68b3c8da47c1ae4f1592fc11e0b22e61

tech-stack:
  added: []
  patterns:
    - "a string-to-string env map or an opaque settings object crosses rustInvoke as `z.record(...)` / `z.unknown().refine(isObject)` with `.meta({'x-rust-value': true})`: the TS side is strict, the generated Rust decode keeps a `Value`, and the shell arm checks the string-map shape itself before the not-ready check so a bad call is the same fixed literal before and after install"
    - "a twin whose Rust owner already has a golden is pinned by replaying that golden (the twin run on the recorded seeds, answers and log lines compared), with a planted-mismatch self-test, rather than by a new vectors file"
    - "RED for a twin file that does not exist yet is a null stub committed with the test, so the target comparisons fail on assertions and not on a missing module"

key-files:
  created:
    - src/backend/launchrust/knownFixTwins.ts
    - src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/knownfix_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - src/common/knownFixOverlayCatalogue.ts
    - src/backend/launchrust/knownFixes.ts
    - src/backend/launchrust/__tests__/knownFixes.shims.test.ts
    - src/backend/knownFixLaunchReply.ts
    - src/backend/__tests__/knownFixLaunchReply.test.ts
    - src/backend/launcher.ts
    - src/backend/storeManagers/storeManagerCommon/games.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts

key-decisions:
  - "Both new channels are in UNBOUNDED_RUST_CHANNELS (an 'Eighteenth (Phase 88, 88-13)' doc entry, and dialogOptionForwarding's EXPECTED): the registry step can run several 15 s `reg add` commands and the overlay env can run the 120 s download, either of which passes the 60 s cap"
  - "Only KNOWN_FIX_OVERLAY_BASE_ENV_KEYS (GST_PLUGIN_PATH and GST_PLUGIN_PATH_1_0) cross as processEnvBase, never the whole env (T-88-33); the game environment is computed in Rust from the same values the TS callback read"
  - "A rejected registry or overlay call never fails a launch: settleKnownFixRegistry logs a warning and carries on, settleKnownFixOverlayEnv answers {} with a warning, which is what the TS functions did on any failure"
  - "The twins are verbatim copies; a twin that differs from a golden is a todo, not an edit (D-20). None differed: all 108 reader cases that ask for readKnownFixes and the pure overlay cases matched on first run"
  - "isRoutingOnlyTier1Fix and the routing-key list were not copied into the twins file: nothing synchronous calls them and readKnownFixes does not use them, so copying them would be dead code"

patterns-established:
  - "The shim schedule's importer lists are per file: launcher.ts joined KNOWN_FIX_SHIM_IMPORTERS, and the twins file has its own KNOWN_FIX_TWIN_IMPORTERS (launcher.ts and storeManagerCommon/games.ts)"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The launcher's per-launch tier-2 registry fixes and overlay env are computed by Rust through two unbounded scheduled shims; a rejected call never fails a launch"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixes.shims.test.ts#applyKnownFixProfileRegistry"
        status: pass
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixes.shims.test.ts#knownFixProfileOverlayEnv"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/knownFixLaunchReply.test.ts#settleKnownFixRegistry / settleKnownFixOverlayEnv"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/dialogOptionForwarding.test.ts#contains exactly the dialog, depot, Rust CM, safety remove, wine runtime download and wine manager channels"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts#every shim and resolver row has the shape it claims and sends its row channel"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shell answers knownfix_apply_profile_registry and knownfix_profile_overlay_env: decode first with a fixed-literal rejection that never echoes input, not-ready before install, the crate's strict decode behind it"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell (883 passed): apply_profile_registry_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, profile_overlay_env_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, profile_overlay_env_answers_an_empty_env_for_a_game_without_overlays"
        status: pass
      - kind: integration
        ref: "pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "The synchronous known-fix twins match the Rust goldens, and neither the launcher nor storeManagerCommon imports a known-fix TS module"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts (110 passed: 108 golden/reader cases that ask for readKnownFixes, the pure overlay env cases, two planted-mismatch self-tests)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts#every twin and view row exists, exports its name and is pinned by a vectors test that imports it"
        status: pass
    human_judgment: false
  - id: D4
    description: "A managed game launched in the running app gets its registry fixes applied and its overlay env merged from Rust"
    verification: []
    human_judgment: true
    rationale: "No test starts the shell with the sidecar and launches a managed game with a seeded tier-2 profile; the dispatch is covered at each seam (shim, schema, shell arm, crate, golden) but not end to end in a live app"

duration: 10min
completed: 2026-11-24
status: complete
---

# Phase 88 Plan 13: Launcher known-fix shims and twins Summary

**The launcher's tier-2 registry fixes and overlay env now come from Rust through two unbounded channels and scheduled shims (base env passed as data, T-88-33), and its synchronous known-fix reads are verbatim twins replayed against the same goldens the Rust crate replays**

## Performance

- **Duration:** about 10 min by the clock
- **Completed:** 2026-11-24
- **Tasks:** 2 (tracer, then a TDD task with a separate RED commit)
- **Files modified:** 19 (2 created, 17 modified)

## Accomplishments

- `applyKnownFixProfileRegistry(deps, appName, runner, gameSettings)` and `knownFixProfileOverlayEnv(deps, appName, runner, gameSettings, tier1Env, processEnvBase)` are shims over `RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY` and `RUST_KNOWNFIX_PROFILE_OVERLAY_ENV`; `prepareWineLaunch` awaits both, passing `overlayBaseEnv(process.env)`. The launcher no longer imports `knownFixesRegistry` and no longer carries the overlay single-flight (`overlayInstalls`) in its deps slice.
- Both channels are unbounded on the sidecar (15 s per `reg add`, 120 s download), with the numbered doc entry and `dialogOptionForwarding`'s set equality updated in the same commit.
- Shell arms decode first with a fixed `<op>:bad-args` literal that never echoes input, then answer `<op>:not-ready` before install; the env-map shape is checked in the arm because the generated decode keeps the two maps opaque.
- `knownFixTwins.ts` holds `readKnownFixes`, `formatKnownFixEnvLine`, `logKnownFixEnv` and `withKnownFixEnv`, copied verbatim with their private helpers. The vectors test replays `golden/reader` (answers and log lines per case) and the pure `golden/overlay_install` helper cases, with planted-mismatch self-tests.
- The launcher and storeManagerCommon import the twins; six schedule rows added (two shims at deletedBy 88.1, four twins at 97, 97, 97, 92), so `launchrust/knownFixes.ts` now has four rows as the plan requires.

## Task Commits

1. **Task 1: Tracer, registry fixes and overlay env through two unbounded shims to Rust** - `b647a745b` (feat)
2. **Task 2 RED: twin vectors against the goldens, null-stub twins file** - `71f8ed3c6` (test; 90 of 110 tests failing on their comparisons)
3. **Task 2 GREEN: verbatim twins, launcher and storeManagerCommon flip, four twin rows** - `714be07d6` (feat)

The tracer gate ran in auto mode: the tracer's `<verify>` was re-run end to end (shell tests, `check:ipc-contract`, the whole `src/backend` and `src/common` jest tree, `codecheck`, prettier, eslint on touched files) and passed before the expansion task started.

## Files Created/Modified

- `src/backend/launchrust/knownFixes.ts` - the two new shims
- `src/backend/knownFixLaunchReply.ts` - `settleKnownFixRegistry`, `settleKnownFixOverlayEnv`
- `src/common/knownFixOverlayCatalogue.ts` - `KNOWN_FIX_OVERLAY_BASE_ENV_KEYS`, `overlayBaseEnv`
- `src/common/types/sidecarTransport.ts`, `src/common/types/ipc/rustInvoke.ts` - the two channels and their strict args
- `src-tauri/src/knownfix_dispatch.rs`, `rust_dispatch.rs`, `ipc_contract.rs` - the arms (with 3 new shell tests) and regenerated contract
- `src/backend/sidecar/sidecarRpc.ts`, `src/backend/__tests__/dialogOptionForwarding.test.ts` - the unbounded entries
- `src/backend/launcher.ts`, `src/backend/storeManagers/storeManagerCommon/games.ts` - the flips
- `src/backend/launchrust/knownFixTwins.ts` and its `__tests__/knownFixTwins.vectors.test.ts` - the twins and their vectors
- `src/backend/__tests__/engineWineShimSchedule.test.ts` - six rows and the importer lists

## Decisions Made

See `key-decisions` above.

## TDD Gate Compliance

| Plan | RED | GREEN | REFACTOR | Status |
| ---- | --- | ----- | -------- | ------ |
| 88-13 Task 2 | `71f8ed3c6` test(88-13) | `714be07d6` feat(88-13) | none needed | RED then GREEN in order |

RED evidence: `pnpm exec jest --runTestsByPath src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts` against a null-stub `knownFixTwins.ts`: 90 failed, 20 passed. The target tests failed on the planned assertion (for `pairwise-002`: expected `{launchNotice: "local notice", title: "local fix", winetricks: ["local-vcrun"]}`, received `null`), not on a load or syntax fault. The RED record was not run through `gsd_run check tdd-red-evidence`; the semantic assessment above is the manual check. The stub was needed because a test whose import of a missing module fails is a load failure, which the RED rules refuse.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Settle helpers so a failed registry or overlay call never fails a launch**
- **Found during:** Task 1
- **Issue:** The plan has the launcher await the shim results directly. `requestRustInvoke` resolves `unknown` and rejects on a not-ready shell, a refused argument or a timeout; the TS functions it replaces never threw (`applyKnownFixProfileRegistry` swallowed each failure into a warning, `resolveKnownFixOverlayEnv` answered `{}` on any error), so an unguarded `await` would turn a known-fix hiccup into a failed launch. The overlay env also needed narrowing from `unknown` to a string map.
- **Fix:** `settleKnownFixRegistry` and `settleKnownFixOverlayEnv` in `knownFixLaunchReply.ts` (outside the shim directory, so not schedule rows), as 88-12 did for launch overrides. The launcher wraps each shim call in one.
- **Files modified:** `src/backend/knownFixLaunchReply.ts`, `src/backend/__tests__/knownFixLaunchReply.test.ts`, `src/backend/launcher.ts`
- **Verification:** `knownFixLaunchReply.test.ts` (rejection and odd-reply cases)
- **Commit:** `b647a745b`

**2. [Rule 1 - Bug] The shell arm for the overlay env let a non-string env value reach the not-ready check**
- **Found during:** Task 1 (the new shell test failed)
- **Issue:** The generated decode keeps `tier1Env` and `processEnvBase` as opaque `Value` (the generator has no record type), so `{"A": 1}` passed the decode and was answered `not-ready` before install but `bad-args` after, breaking the "same fixed literal before and after install" rule 88-12 set.
- **Fix:** `profile_overlay_env_over` checks both maps are objects of strings after the generated decode and before the context is looked at.
- **Files modified:** `src-tauri/src/knownfix_dispatch.rs`
- **Verification:** `profile_overlay_env_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal`
- **Commit:** `b647a745b`

**3. [Rule 3 - Blocking] Two censuses pinned counts this plan changes**
- **Found during:** Task 1 (jest)
- **Issue:** `tauriShellSource.test.ts` pins the `rust_dispatch.rs` arm count (191) and the list of arms new since 34.1, and `rustInvokeSchemas.test.ts` pins `RUST_INVOKE_CHANNELS` at 191.
- **Fix:** Counts to 193 with the per-plan comment line, and the two new arm names added to the arm list with a PROVEN note.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts`
- **Commit:** `b647a745b`

**4. [Rule 3 - Blocking] The plan's cargo verify command cannot print a passing count for `rust_dispatch`**
- **Found during:** Task 1
- **Issue:** `cargo test --bin gamelib-shell rust_dispatch` matches no test (`rust_dispatch.rs` has no test module), as 88-12 found.
- **Fix:** Ran the whole shell binary (883 passed, 0 failed, 2 ignored) plus `cargo test --bin gamelib-shell knownfix` (13 passed).

**5. [Rule 3 - Blocking] A `Record<string, unknown>` zod type refused `GameSettings`**
- **Found during:** Task 1 (`codecheck`)
- **Issue:** `GameSettings` is an interface with no index signature, so `z.record(z.string(), z.unknown())` as the `gameSettings` arg type did not accept it.
- **Fix:** `z.unknown().refine(isObject).meta({'x-rust-value': true})`: still a strict object test on the sidecar side, still a `Value` in the generated decode, with the crate checking it is an object again.
- **Files modified:** `src/common/types/ipc/rustInvoke.ts`
- **Commit:** `b647a745b`

**6. [Plan deviation] `isRoutingOnlyTier1Fix` not copied into the twins file**
- **Issue:** The plan lists it among the private helpers. Neither `readKnownFixes` nor `filterTier1KnownFixes` calls it, so a copy would be unused code (and a lint and `noUnused` hit).
- **Fix:** Left out, with `TIER1_ROUTING_KEYS`; the twins file header records what was and was not copied.

---

**Total deviations:** 6 (1 Rule 2, 1 Rule 1, 3 Rule 3, 1 plan-level omission)
**Impact on plan:** One extra pair of helpers in an existing file and their tests, otherwise the plan's shape. No scope creep.

## Issues Encountered

- `cargo clippy -p gamelib-shell -D warnings` and `cargo fmt` on `ipc_contract.rs` are dirty at HEAD for unrelated files, as the repo notes say; `knownfix_dispatch.rs` is rustfmt-clean and has no new clippy finding.
- `eslint` on `launcher.ts` reports 11 warnings and no errors, all on lines this plan did not write.
- `ipcSchemaSnapshot.json` is regenerated alongside `ipc_contract.rs` by `gen:ipc-contract` and was already up to date in the check; no tracked change from it.

## Known Stubs

None.

## Threat Flags

None. T-88-33 (information disclosure through the base env) is mitigated: only `KNOWN_FIX_OVERLAY_BASE_ENV_KEYS` cross, and `knownFixes.shims.test.ts` pins that `HOME`, `STEAM_API_KEY` and similar are dropped. T-88-34 (twin drift) is mitigated by the golden replay with planted-mismatch self-tests; no twin differed from a golden. T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88.1 can delete the two shims (deletedBy 88.1) when `prepare_wine_launch` calls the registry and overlay ops in-process; the twins stay until 92 (`withKnownFixEnv`) and 97 (the reader and the two log formatters).
- The Steam bridge still imports the TS known-fix modules (`bridgeKnownFixes.ts`, `knownFixOverlays.ts`'s overlay single-flight through `appRuntime`); only the non-Steam launcher and the common store manager were flipped here.
- A live-app check of a managed game launching with a seeded tier-2 registry fix and overlay has not been done (D4 above).

## Self-Check: PASSED

- Created files present: `src/backend/launchrust/knownFixTwins.ts`, `src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts`.
- Commits `b647a745b`, `71f8ed3c6` and `714be07d6` are ancestors of HEAD; `git rev-list --count` from the recorded base is 3.
- Acceptance, Task 1: `grep -c knownFixesRegistry launcher.ts` = 0; `grep -c RUST_KNOWNFIX_PROFILE_OVERLAY_ENV sidecarRpc.ts` = 2; four schedule rows for `launchrust/knownFixes.ts`.
- Acceptance, Task 2: `grep -c "from './knownFixes'\|from './knownFixOverlays'" launcher.ts` = 0; `grep -c backend/knownFixOverlays storeManagerCommon/games.ts` = 0; the vectors test compares 108 `golden/reader` cases against a MANIFEST count of 125 visited.
- Plan verification: `cargo test --bin gamelib-shell` 883 passed; `pnpm check:ipc-contract` up to date; `pnpm exec jest src/backend src/common` 624 suites passed, 14880 tests; `pnpm codecheck` clean; prettier clean on every written path; eslint clean on `src/backend/launchrust`.

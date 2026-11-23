---
phase: 87-engine-wine-and-tools
plan: 24
subsystem: infra
tags: [rust, tauri, native-channel, rustinvoke, wine-core, valid-wine, shims, twins, d-22]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the wine core ops wine_valid and wine_run_command with their goldens (87-21), the native + rustInvoke + shim-schedule caller-flip pattern (87-20), the delete gate (87-03), the TS wine-manager deletion (87-22)
provides:
  - wine.isValidVersion as a native wine channel (strict six-key WineInstallation decode, valid and invalid vectors), its sidecar handle and zod key deleted
  - RUST_WINE_VALID and RUST_WINE_RUN_COMMAND rustInvoke channels with zod tuples, contract arms and rust_dispatch arms (wine_run_command unbounded in the sidecar)
  - src/backend/enginewine/wineCore.ts validWine(deps, wineVersion), one typed call; launcher.ts no longer defines validWine
  - schedule rows: the validWine shim and the setupEnvVars, setupWineEnvVars and createCommandRunner twins, all deletedBy 88, pinned by the wineCore oracle goldens
  - describe('wineCorePortComplete') in engineWinePortComplete.test.ts
affects: [87-25, 87-31, 87-58, Phase 88]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

plan_head_before: 50b0a4bb53f3939aad976986225eca2c8638718d
plan_head_after: ebdc4f2a998856c1380198fb81d3ec24006931c7

tech-stack:
  added: []
  patterns:
    - "a rustInvoke arm that projects a persisted value onto its declared keys before the crate sees it, so a legacy key or the Windows factory {} answers as the TS did (false) instead of rejecting"
    - "a native handler split into a pure channel function over Option<Arc<WineCtx>> (wine_valid_channel) so a test drives it over a real context while the production handler passes wine_ctx().cloned()"
    - "an oracle test that keeps a removed TS body verbatim (validWine) and answers the shim's rustInvoke leg with it, so verifyWinePrefix and the commandRunner binding replay the 87-08 goldens unchanged"

key-files:
  created:
    - src/backend/enginewine/wineCore.ts
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
    - src/backend/sidecar/bootstrap.ts
    - src/backend/launcher.ts
    - src/backend/utils.ts
    - src/backend/commandRunner.ts
    - src/backend/testUtils/portSliceGate.ts
    - src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "The wine_valid rustInvoke arm keeps only the six declared installation keys (bin, name, type, lib, lib32, wineserver, each of the declared type) and answers false for anything that is no installation (null, {}, a missing bin, an unknown type). The plan's strict deny_unknown_fields would reject a persisted wine carrying a legacy key and the Windows factory default {}, where the TS validWine answered false; a rejected promise would break a launch. The renderer's native channel stays strict, as the plan says"
  - "The rustInvoke zod argument for both new channels is opaque (x-rust-value), as 87-20 did for the release: the generator cannot render a bounded object, so the shell's arm owns the decode"
  - "The Launcher type keeps a validWine member bound to its deps ((...a) => validWine(deps, ...a)) instead of dropping it, because tools/index.ts, engineServices and the tool tests read launcher.validWine; launcher.ts still exports no validWine and defines none"
  - "wine_run_command's arm takes one WineCommandArgs and adds the shell's own process environment and Darwin release as the WineHost; the sidecar is the shell's child so the environments agree. A Flatpak user_home that differs from the shell's is not handled yet (no caller until Phase 88)"
  - "The shim returns Promise<unknown> like every other enginewine shim; commandRunner's wine.validWine type widens from Promise<boolean> to Promise<unknown> to match"

patterns-established:
  - "runSlice skips its empty-table it.each for a sub-slice that deletes no file or forbids no identifier, and that sub-slice states what it removed by an explicit assertion"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "wine.isValidVersion is a native wine channel: one strict six-key WineInstallation (an unknown key, a bad type, an oversize or non-text field rejects with a fixed literal before the context is looked at), answered by the crate's wine_valid on the blocking pool; its handle and zod key are deleted in the same commit"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_manifest_vectors and wine_dispatch (a_wine_installation_is_its_six_keys_and_nothing_else, the_valid_version_handler_validates_first_and_answers_not_ready_before_install, the_valid_version_handler_answers_the_crates_wine_valid_over_a_real_context)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts, ipcSchemaCoverage.test.ts, ipcDomainCensus.test.ts, flowRegistrationCensus.test.ts, runnerSliceRegistration.test.ts, invokeReturnValueSweep.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "validWine is one async shim over RUST_WINE_VALID; launcher.ts, utils.ts, verifyWinePrefix and the commandRunner binding pass deps to it; a persisted wine with a legacy key or no wine at all answers false, never a rejection"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (30), engineWinePortComplete.test.ts (wineCorePortComplete), utils.test.ts, launcher.engineStep.test.ts"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (a_persisted_wine_keeps_its_six_keys_and_a_non_wine_is_nothing, the_valid_arm_answers_false_for_no_wine_and_not_ready_for_a_wine_before_install)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The three sync/async-callback twins (setupEnvVars, setupWineEnvVars, createCommandRunner) are scheduled rows pinned to the wine_env and wine_command goldens, and the wineCore oracle still passes in compare mode"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (every twin row exists, exports its name, is pinned by a vectors test that imports it), src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "In a running app: the Settings wine-version selector's validity check (the (i) warning when the selected wine is missing) answers through the native channel, and a Linux/macOS wine game still launches through prepareWineLaunch and checkWineBeforeLaunch with the Rust validWine"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No automated test drives window.api or a real launch into the packaged shell; the paths are proven by manifest vectors, handler tests over a real context and the 87-21 goldens. 87-58's live gate owns it"
---

# Phase 87 Plan 24: The wine core's callers switched to the Rust ops Summary

**`wine.isValidVersion` is a native `wine` channel, `validWine` is one scheduled shim over the crate's `wine_valid` (launcher, utils and the command runner binding all call it with their deps), and the three TS copies that cannot become async (`setupEnvVars`, `setupWineEnvVars`, `createCommandRunner`) are scheduled twins pinned to the same goldens.**

## Performance

- **Duration:** about 30 min (plan-head ledger written 06:13Z after the tracer was built; SUMMARY at 06:26Z)
- **Tasks:** 2 of 2 (one tracer, one auto)
- **Files:** 1 created, 20 modified, none deleted (29 files changed across the plan's two commits, 912 insertions, 192 deletions)

## Accomplishments

- **Tracer (Task 1): `wine.isValidVersion` native end to end.** `parse_wine_installation` decodes one strict object of the six keys the renderer's settings hold (`bin` non-empty to 4096, `name` to 1024, `type` one of four, `lib`, `lib32` and `wineserver` absent, null or text to 4096); an unknown key rejects as `unrecognized_keys`, every rejection is a fixed path and code and never the renderer's value (T-87-22). `wine_valid_channel` runs the crate's `wine_valid` on the blocking pool, passing the Darwin release the shell reads with `libc::uname` (a toolkit's Darwin >= 14 check). The sidecar's `ipc.handle` and zod key are gone; the contract, snapshot and census pins follow (53 handle channels, wineTools 11, sweep 39).
- **The shim and its caller ripple (Task 2).** `src/backend/enginewine/wineCore.ts` holds `validWine(deps, wineVersion)`: one returned `requestRustInvoke(RUST_WINE_VALID, [wineVersion])`. `launcher.ts` lost its `validWine`; its two `prepareWineLaunch` calls and `verifyWinePrefix` (whose deps gain `RustInvokeDeps`) pass deps; `utils.ts`'s three `checkWineBeforeLaunch` calls pass deps; `bootstrap.ts`'s commandRunner binding builds `{ requestRustInvoke }` from the host lazily and its `verifyWinePrefix` call gains it too.
- **Two rustInvoke ops.** `RUST_WINE_VALID` (bounded) and `RUST_WINE_RUN_COMMAND` (in `UNBOUNDED_RUST_CHANNELS`: a wine command has no clock) with opaque zod tuples, generated contract arms and `rust_dispatch` arms. The `wine_run_command` arm takes one `WineCommandArgs` and adds the shell's process environment and Darwin release as the `WineHost`; it has no TS caller until Phase 88.
- **The twins and the gate.** The schedule gains the `validWine` shim row and the `setupEnvVars`, `setupWineEnvVars` (launcher.ts) and `createCommandRunner` (commandRunner.ts) twin rows, all `deletedBy: 88`, `vectors` naming the wineCore oracle, with a one-sentence D-22 deviation comment. `describe('wineCorePortComplete')` keeps the `wine_env`, `valid_wine` and `wine_command` fixtures and the oracle, asserts launcher.ts exports no `validWine` and the shim does, and asserts the sidecar registers no `wine.isValidVersion` handle.
- **The oracle stays runnable.** `wineCore.oracle.test.ts` keeps the removed TS `validWine` body verbatim (reading `isMac` through the environment module at call time so `mockPlatform` still reaches it) and answers the shim's `rustInvoke` leg with it, so the 19 `valid_wine` vectors, `verifyWinePrefix` and the commandRunner binding replay unchanged.

## Task Commits

1. **Task 1 (tracer): `wine.isValidVersion` native end to end over the crate's `wine_valid`** - `eeb9a7993` (feat)
2. **Task 2: the `validWine` shim, the wine core ops, the twin rows and the wine-core gate** - `ebdc4f2a9` (feat)

Tracer gate: auto mode off (`workflow.auto_advance` false, `_auto_chain_active` false), `HUMAN_VERIFY_MODE` end-of-phase, and the tracer's `<verify>` is automated only, so it was run end to end (native_manifest_vectors, wine_dispatch, rustfmt, `check:ipc-contract`, the ownership, schema and census jest, codecheck, prettier) before the commit and again as part of the full jest run afterwards. Tracer verified end-to-end, expansion followed.

## Verification

- `cargo test --bin gamelib-shell`: 796 passed, 2 ignored (`wine_dispatch` 24, `native_manifest_*` 5). `rustfmt --edition 2021 --check` over `wine_dispatch.rs`, `native_router.rs` and `rust_dispatch.rs`: clean. `cargo test --bin gamelib-shell rust_dispatch` matches no test name (the arms are covered by `wine_dispatch::tests` and the arm-count pin in `tauriShellSource.test.ts`).
- `pnpm check:ipc-contract`: both files current. `pnpm codecheck`: clean. `pnpm find-deadcode`: PASS at 310 baselined findings (no rise). `npx prettier --check` and `npx eslint` over every TS path written: clean (eslint warnings only in untouched lines).
- jest `src/backend src/common src/preload meta/__tests__`: 740 suites passed; the one failure is the known `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT. The regression set (`infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule`) passes, including the wineCore oracle in compare mode.
- Acceptance: non-comment `'wine.isValidVersion'` in `wineToolsFlowRegistration.ts` count 0; `grep -c "export async function validWine" src/backend/launcher.ts` is 0; the schedule holds 1 shim row and 3 twin rows from this plan, all `deletedBy` 88.

## Decisions Made

See `key-decisions`. The ones later plans lean on: the `wine_valid` arm is tolerant of persisted shapes (false, never a rejection) while the renderer's channel is strict; the shell supplies the `WineHost` itself (its process env, `uname` release); and the shim returns `Promise<unknown>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A strict `wine_valid` decode would reject what the TS `validWine` answered `false` for**
- **Found during:** Task 2
- **Issue:** the plan asks for a deny_unknown_fields WineInstallation in Rust and a strict zod tuple on the shim. The sidecar's callers send persisted values: the per-game and global `wineVersion` may carry legacy keys (`settingsSchema.ts` says so) and the Windows factory default is `{}`. The TS `validWine` read three fields and answered `false`; a strict decode would turn those into `wine_valid:bad-args` rejections that break a launch or a settings read.
- **Fix:** the `rustInvoke` argument is opaque and the shell's `rpc_wine_valid` runs `persisted_wine`: it keeps the six declared keys of the declared types and answers `false` for anything that is no installation, without asking the crate. The crate's own `WineInstallation` (deny_unknown_fields) still sees only the projected object. The renderer-facing native channel stays strict, as T-87-22 says.
- **Files modified:** `src-tauri/src/wine_dispatch.rs`, `src/common/types/ipc/rustInvoke.ts`
- **Commit:** `ebdc4f2a9`

**2. [Rule 3 - Blocking] The `Launcher` type keeps a `validWine` member**
- **Issue:** the plan says delete `validWine` from the Launcher type, but `tools/index.ts` (`deps.launcher.validWine`), `engineServices.ts`, `wineToolsFlowRegistration.ts`'s deps and about eight tool tests read it; removing it would rewrite all of them for no gain.
- **Fix:** the member stays as a deps-bound adapter (`(...a) => validWine(deps, ...a)`, `DropFirst` like its neighbours) and the tools binding in `engineSource` is `(wineVersion) => validWine(deps, wineVersion)`. `launcher.ts` defines and exports no `validWine` (acceptance holds, and the port gate asserts it).
- **Files modified:** `src/backend/launcher.ts`
- **Commit:** `ebdc4f2a9`

**3. [Rule 3 - Blocking] `runSlice` refused an empty table**
- **Issue:** the plan's `deleted: []` and `forbiddenIdentifiers: []` make `it.each([])` throw (jest refuses an empty table).
- **Fix:** `runSlice` guards the two lists that may be empty; `wineCorePortComplete` states what it removed by explicit assertions (launcher.ts exports no `validWine`, the shim does, the sidecar registers no handle). Nothing was widened or lowered: no floor or allow-list changed, and the other two sub-slices run exactly as before.
- **Files modified:** `src/backend/testUtils/portSliceGate.ts`
- **Commit:** `ebdc4f2a9`

**4. [Rule 3 - Blocking] Files and pins outside the plan's list that follow the change**
- The oracle test (`wineCore.oracle.test.ts`) called the removed launcher export; it keeps the TS body inline (see Accomplishments). `commandRunner.ts`'s `wine.validWine` type widens to `Promise<unknown>`. Census pins: `flowRegistrationCensus`, `invokeReturnValueSweep`, `runnerSliceRegistration`, `wineToolsFlows`, `ipcSchemas/wineTools`, `rustInvokeSchemas` (143 to 145), `tauriShellSource` (arm count and the pre-existing-arms list), `dialogOptionForwarding` (the unbounded list). `sidecarRpc.ts` lists `wine_run_command` as unbounded.
- **Commits:** `eeb9a7993`, `ebdc4f2a9`

**Total deviations:** 4 (1 bug, 3 blocking). **Impact:** deviation 1 is the one that matters: it trades the plan's strict shim-side decode for parity with the TS on persisted shapes. Existence checks only, nothing spawned, only six keys reach the crate.

### Behaviour changes worth knowing

- **The renderer's `wine.isValidVersion` is stricter than the zod it replaces.** The old schema was loose (an extra key was valid, by 67 review WR-04); the native decode rejects an unknown key with the invalid-args marker. `WineVersionSelector.tsx` passes the settings' own installation objects, which carry only the six keys, so a current list passes; a hand-edited settings file with another key in a wine entry would now be refused at that check (the sidecar callers are unaffected, deviation 1).
- **The `Checking if wine version exists: <name>` log line is gone.** The Rust op logs nothing (87-21: no profile text in the engine log), so each `validWine` call no longer writes that line to the backend log.
- **`wine_run_command`'s host env is the shell's.** The sidecar is the shell's child so they agree today; a Flatpak `user_home` that differs from the shell's (87-21's note) is not wired because the op has no caller before Phase 88.

## Issues Encountered

None beyond the deviations. One BSD `sed -i` slip (a one-line edit run without the backup-suffix argument) changed nothing and was redone with a script.

## Known Stubs

None. `RUST_WINE_RUN_COMMAND` and its arm have no TS caller by design (the plan adds them for Phase 88); they are not a stub, the arm is complete and unit-tested.

## Deferred Issues

- `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails as before (known, not touched).
- `wine_run_command` is proven only by the arm's validation tests and the crate's goldens; a live call has to wait for the Phase 88 launch port or 87-58's gate.

## Threat Flags

None new. T-87-22 holds: the native channel strict-decodes with fixed-literal rejections, existence checks only, no spawn. T-87-70 holds as deviation 1 records: the shim's `rustInvoke` argument is projected to six declared keys of declared types in the shell, and the crate's WineInstallation (deny_unknown_fields) decodes the result; nothing is spawned. The `wine_run_command` arm spawns only through the crate's labelled, capped, shutdown-registered Helper child (87-21, T-87-23) and takes its argv from the sidecar, which already runs wine commands. T-87-SC: no new crate (`libc` was already a unix dependency of the shell).

## Next Phase Readiness

Ready for 87-25: the wine core's TS reach is one shim and three scheduled twins pinned by the shared goldens; the twins and the shim all fall in Phase 88's launch port. 87-31 and 87-58 still own the DXMT gap and the live gate for the wine-version selector and a real wine launch.

## Self-Check: PASSED

- Created file exists: `src/backend/enginewine/wineCore.ts`.
- Commits exist on `main`: `eeb9a7993` and `ebdc4f2a9` (2 measured from `plan_head_before`, both this plan's).
- Acceptance criteria re-run and passing (see Verification).

---
phase: 87-engine-wine-and-tools
plan: 34
subsystem: wine
tags: [dxvk, resolvers, d-23, d-15, d-06, shim, rustinvoke, tools-host, sidecar]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the DXVK family in gamelib-wine and the wine_dxvk_install_remove op (87-27); ToolsState and the tools host (87-30); the engine online flag (87-31); the wine context in the shell (87-18 to 87-26)
provides:
  - RUST_WINE_DXVK_INSTALL_REMOVE (unbounded) with zod, generated contract and rust_dispatch arm; the shell builds the whole ToolsHost (environment, Darwin release, bundled public directory, online answer)
  - src/backend/sidecar/engineWineResolvers.ts, the first D-23 resolvers (toggleDXVK, toggleDXVKNVAPI, toggleVKD3D) and registerEngineWineResolvers
  - src/backend/enginewine/tools.ts, the dxvkInstallRemove shim used by the launcher's DXVK step and the still-TS engine's installRemove
  - src/backend/services/toolsFrom.ts, toolsFrom moved out of engineServices.ts, which no longer value-imports backend/tools
affects: [87-35, 87-36, 87-37, 87-56]

actuals:
  tokens: 13300
  tasks: 2
  commits: 2

plan_head_before: 9d9d46579a68c9e482fae87dd8ef730e85f5fcde
plan_head_after: a62e2a6acd0037986ce3ccae26146ed4affada0d

tech-stack:
  added: []
  patterns:
    - "a scheduled resolver gathers the TS-only input as a const (the game's merged settings) and makes exactly one typed call; every resolver of a family is registered by one register* helper named in its row's wiring"
    - "host facts a tool needs (process environment, Darwin release, public directory, online) are built once in the shell (wine_dispatch::tools_host) and added to the op's arguments; the sidecar's tuple carries none of them"
    - "a family flips in one commit: the new handle and the removal of the old one land together, so a channel is never registered twice"

key-files:
  created:
    - src/backend/sidecar/engineWineResolvers.ts
    - src/backend/sidecar/__tests__/engineWineResolvers.test.ts
    - src/backend/enginewine/tools.ts
    - src/backend/enginewine/__tests__/dxvkShim.test.ts
    - src/backend/services/toolsFrom.ts
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/main.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/launcher.ts
    - src/backend/services/engineServices.ts
    - src/backend/storeManagers/steam/bridgeKnownFixes.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "The shell, not the sidecar, supplies every host fact to wine_dxvk_install_remove; the zod tuple is exactly one request object, so a path or an online claim the sidecar sent cannot reach a tool, and a test pins a second tuple element as bad-args"
  - "wine_dispatch::tools_host is the one builder of those facts and the engine's ShellDxvk uses it too, so the renderer's toggles, the launcher's DXVK step and the engine run a tool under the same public directory and online answer (87-29 had left both at defaults for this plan)"
  - "toolsFrom moved to services/toolsFrom.ts instead of being deleted: the launcher's Winetricks and wine-command uses and the Steam bridge's known fixes still build TS tools until 87-35 and 87-36"
  - "installRemove of the still-TS engine resolves a boolean by comparing the op's answer to true, so any answer that is not true is a failed install, as the TS boolean was"

patterns-established:
  - "a resolver row lists its inputs ['gameSettings'], its channel and its caller handlers.ts; the register helper is named once, in the first row of the file, as wiring"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "A renderer DXVK toggle (toggleDXVK) runs through one TS resolver into the Rust wine_dxvk_install_remove op, and the renderer gets the op's answer or its refusal"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/engineWineResolvers.test.ts"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (the_dxvk_arm_takes_one_object_and_the_host_facts_are_the_shells_own)"
        status: pass
    human_judgment: false
  - id: D2
    description: "toggleDXVKNVAPI and toggleVKD3D are resolvers that send their own tool literal (dxvk-nvapi, vkd3d), and every DXVK channel is registered once, through engineWineResolvers.ts"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/engineWineResolvers.test.ts, registrationOncePerBoot.test.ts, runnerSliceRegistration.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The launcher's DXVK step and the still-TS engine's installRemove call the dxvkInstallRemove shim with the settings, tool, action and pinned source they hold; engineServices.ts names no createTools and has no from 'backend/tools' import"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/dxvkShim.test.ts, launcher.engineStep.test.ts, launcher_launchSingleFlight.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The schedule lists the three resolvers (deletedBy 98) and the shim (deletedBy 88) in both directions, and the census pins follow the moved channels"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts, flowRegistrationCensus.test.ts, ipcDomainCensus.test.ts, invokeReturnValueSweep.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "A DXVK toggle from a real renderer on a real prefix installs or removes the DLLs and writes the registry keys, with the Vulkan helper found in the bundled public directory and the download gated by the real online monitor"
    verification: []
    human_judgment: true
    rationale: "No test here starts the app, a sidecar and a Wine prefix together; the op is proven by the crate's goldens and the arm by unit tests, but the wiring of the shell's public directory and the sidecar's online flag to a live install needs one run on a Mac or Linux machine"

duration: 11min
completed: 2026-11-23
---

# Phase 87 Plan 34: The DXVK family flips to Rust Summary

**The three renderer DXVK toggles became the first D-23 resolvers over one `wine_dxvk_install_remove` call, and the launcher's DXVK step and the still-TS engine's `installRemove` reach the same op through a `dxvkInstallRemove` shim, so a bottle's DXVK DLLs have one writer and the shell, not the sidecar, supplies the tool's host facts.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-23T10:37:47Z
- **Completed:** 2026-11-23T10:49Z
- **Tasks:** 2 of 2
- **Files:** 5 created, 17 modified (production), plus census tests

## Accomplishments

- **Tracer (Task 1):** `toggleDXVK` end to end. `RUST_WINE_DXVK_INSTALL_REMOVE` (unbounded in `sidecarRpc.ts`) with its zod entry (one opaque request object), the generated contract and the `rust_dispatch` arm. The arm adds the shell's host facts and calls the 87-27 op. `engineWineResolvers.ts` gathers the game's merged settings and makes the one typed call; `handlers.ts` calls `registerEngineWineResolvers`, and the old handle left `wineToolsFlowRegistration.ts` in the same commit. The tracer gate (automated-only verify) was re-run and passed before Task 2.
- **The full host (D-17):** `wine_dispatch::tools_host_value` builds `{ publicDir, online, wine: { env, darwinRelease } }`: the bundled `public` directory (passed to `wine_dispatch::install` from `info_dispatch::bundled_public_dir`) holding the Vulkan helper, the online answer the sidecar reports through `engine_set_online`, the process environment and the Darwin release. The engine's `ShellDxvk` uses the same builder, which closes the "defaults until 87-34" note 87-29 left.
- **The other two toggles and the shim (Task 2):** `toggleDXVKNVAPI` and `toggleVKD3D` send `dxvk-nvapi` and `vkd3d` (each proven not to send a neighbour's literal). `enginewine/tools.ts` `dxvkInstallRemove(deps, {settings, tool, action, source})` is one returned typed call. The launcher's three DXVK installs and `engineServicesFrom().installRemove` call it; the engine's version resolves `=== true`.
- **Schedule and census:** rows `toggleDXVK` (with `registerEngineWineResolvers` as wiring), `toggleDXVKNVAPI`, `toggleVKD3D` (resolvers, deletedBy 98) and `dxvkInstallRemove` (shim, callers launcher.ts and services/engineServices.ts, deletedBy 88). The registration, return-value, domain and runner-slice censuses follow the moved channels; the registration-once test now lists `registerEngineWineResolvers`.

## Task Commits

1. **Task 1 (tracer): toggleDXVK as the first D-23 resolver, one typed call into the Rust DXVK op with the shell's own host facts** - `9f10df6de` (feat)
2. **Task 2: toggleDXVKNVAPI and toggleVKD3D resolvers and the dxvkInstallRemove shim for the launcher and the engine services** - `a62e2a6ac` (feat)

## Verification

- Task 1 chain: `cargo test --bin gamelib-shell` (821 passed), `rustfmt --edition 2021 --check src/rust_dispatch.rs src/wine_dispatch.rs`, `pnpm check:ipc-contract`, `pnpm codecheck`, the plan's jest list, and prettier over the written paths (none ignored).
- Task 2 chain: the `engineServices.ts` `from 'backend/tools'` count is 0, the plan's jest list including `launcher.engineStep` and `launcher_launchSingleFlight`, `pnpm codecheck`, prettier over the written paths. The whole `src/backend` and `src/common` jest tree passes (645 suites, 15409 tests).
- Acceptance: `grep -c registerEngineWineResolvers handlers.ts` is 2 (import and call, at least 1); `grep -c createTools engineServices.ts` is 0; `grep -c dxvkInstallRemove launcher.ts` is 4; the non-comment count of `'toggleVKD3D'` in `wineToolsFlowRegistration.ts` is 0; `registrationOncePerBoot` passes with `registerEngineWineResolvers` added to its list.
- Not run: a live toggle on a real prefix (see coverage D5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `toolsFrom` could not be dropped, it moved**
- **Found during:** Task 2
- **Issue:** the plan has engineServices.ts drop `toolsFrom` and `createTools`, but the launcher still builds Winetricks (known-fix install, the installed-packages log line) and `runWineCommandOnGame` through `toolsFrom`, and `steam/bridgeKnownFixes.ts` builds Winetricks through it; those flip in 87-35 and 87-36. Deleting it would have broken the launch path.
- **Fix:** `toolsFrom` now lives in `src/backend/services/toolsFrom.ts` (same body, same behaviour); the launcher and `bridgeKnownFixes.ts` import it from there, and the Steam known-fix test spies the new module. `engineServices.ts` no longer names `createTools` and has no `from 'backend/tools'` import (its remaining `ToolsDeps` type is imported from `'../tools'`, erased at compile time; the slice type needs it). 87-36 still drives the launcher's `toolsFrom` count to 0 as planned.
- **Files modified:** `src/backend/services/toolsFrom.ts` (new), `src/backend/services/engineServices.ts`, `src/backend/launcher.ts`, `src/backend/storeManagers/steam/bridgeKnownFixes.ts`, `src/backend/__tests__/steamBridgeKnownFixes.test.ts`
- **Commit:** `a62e2a6ac`

**2. [Rule 3 - Blocking] Files outside the plan's list**
- **Found during:** Task 1
- **Issue:** the unbounded channel needs `sidecarRpc.ts` (and the `dialogOptionForwarding` set pin); the shell needs the bundled public directory (`main.rs`, `info_dispatch.rs` exposing `bundled_public_dir`) and the engine's DXVK seam should use the same host (`engine_dispatch.rs`); the moved channels moved census pins (`flowRegistrationCensus`, `ipcDomainCensus`, `invokeReturnValueSweep`, `runnerSliceRegistration`, `testContainment`, `rustInvokeSchemas`, `tauriShellSource`).
- **Fix:** each edited in the same commit as the change that needs it, none changes behaviour beyond the plan.
- **Commit:** `9f10df6de`, `a62e2a6ac`

**3. [Rule 2 - Missing critical] The host facts are the shell's own**
- **Found during:** Task 1
- **Issue:** the plan's call is `[{ settings, tool, action }]`; the op needs a public directory and an online answer, and taking them from the sidecar would be a path and a claim an untrusted caller could set (T-87-34).
- **Fix:** the tuple is exactly one object; the shell adds `tools_host_value()`; a unit test pins a second tuple element as `bad-args` and the host's keys.
- **Files modified:** `src-tauri/src/wine_dispatch.rs`
- **Commit:** `9f10df6de`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** one new small module (`toolsFrom.ts`) and extra census pins; no change to the plan's channel set, rows or ordering. Winetricks and the wine commands remain TS until 87-35 and 87-36.

## Issues Encountered

- A scratch run of `rustfmt` on `main.rs` follows `mod` declarations into the generated `ipc_contract.rs`, which is not rustfmt-formatted; the plan's own check (`rust_dispatch.rs`, `wine_dispatch.rs`) is clean.

## Known Stubs

None.

## Threat Flags

None. T-87-34 is mitigated as planned: the zod entries for the three toggles stay (`{ appName, action }` is validated before the resolver reads it), the new channel's tuple is one opaque object that the crate decodes strictly (`deny_unknown_fields`), and the shell alone supplies the host facts. No new endpoint, path or trust boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-35 adds the Winetricks resolvers and shims beside these in `engineWineResolvers.ts` and `enginewine/tools.ts`, and takes the launcher's Winetricks `toolsFrom` uses; 87-36 does the wine-command family and removes the last `toolsFrom` use from `launcher.ts`. `bridgeKnownFixes.ts` also builds Winetricks through `toolsFrom` and is not named by those plans: 87-35 or 87-37 must route it to the new shims before `services/toolsFrom.ts` can go.
- 87-37 deletes the TS tools; `services/toolsFrom.ts` goes with them, and 87-56 deletes `engineServicesFrom` with the engine TS (its `installRemove` row is `dxvkInstallRemove`'s second caller).
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `src/backend/sidecar/engineWineResolvers.ts`, `src/backend/sidecar/__tests__/engineWineResolvers.test.ts`, `src/backend/enginewine/tools.ts`, `src/backend/enginewine/__tests__/dxvkShim.test.ts`, `src/backend/services/toolsFrom.ts`
- FOUND: `9f10df6de`, `a62e2a6ac` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*

---
phase: 85-store-host-config-and-versioned-migrations
plan: 22
subsystem: infra
tags: [typescript, engine, store, versioning, deletion, di]

requires:
  - phase: 85-21
    provides: the TS migration system, the store flag and the TS owner path deleted; every store a mirror over Rust StoreHost, so the boot sweep is unconditional
  - phase: 85-15
    provides: Rust's boot sweep of every GamesConfig document through settings/game (research A4) and the optional storeRoot threaded through EngineServices and the flow deps
  - phase: 85-18
    provides: the bridge runtime and shared-redist installer no longer read the versioning engine
provides:
  - "readStoredGameConfig without a TS migrate step: the document is read as it stands, through the root's mirror when the shell owns the settings family, from the file otherwise; containment checks (T-68-19) unchanged"
  - "EngineServices, EngineConfigDeps, ConfigPathDeps, EngineServicesSource, ToolsDeps, LauncherDeps, the engine and wine-tools flow deps, RunnerDeps and the bridge runtime deps have no versioning member; no engine-side code reads one"
affects: [85-23, 85-24, 85-25]

actuals:
  tokens: 9033     # chars/4 over the realized diff (git diff 820b67224..b8bccd130: 36132 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count plan_head_before..HEAD (before this docs commit)
plan_head_before: 820b6722454150fd9c1f76cac4d1b6f2b8f41cf8
plan_head_after: b8bccd130de3abec0be4ee4f6d1d1d4f97985889

tech-stack:
  added: []
  patterns:
    - "A reader whose input a boot step already migrated drops its migrate call and its engine dependency together; the settingsDocs seam with an empty root is the file-read path"

key-files:
  created: []
  modified:
    - src/backend/engine/engineConfig.ts
    - src/backend/engine/engineState.ts
    - src/backend/engine/engineDecision.ts
    - src/backend/engine/gameEngineState.ts
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/toolSettings.ts
    - src/backend/engine/engineServices.ts
    - src/backend/services/engineServices.ts
    - src/backend/tools/index.ts
    - src/backend/launcher.ts
    - src/backend/sidecar/engineFlowRegistration.ts
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/index.ts
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/storeManagers/steam/bridge/bridgeRuntime.ts
    - src/backend/testUtils/testBridgeRuntime.ts
    - src/backend/testUtils/testServices.ts

key-decisions:
  - "ManagerDeps, StoreRoot, the config factories and createTestManagerDeps keep their versioning member through this plan, as the plan scopes (85-23 removes them, 85-24 deletes storeVersioning/*)"
  - "settingsVersioning.test's 'readStoredGameConfig migrates once with one backup' case became 'returns the entry and leaves the file alone (the shell migrated it at boot)': the migration it asserted is no longer the engine read's job"

patterns-established: []

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "D-03 / SC5: readStoredGameConfig no longer migrates in TS and the engine readers (engineState, engineDecision, gameEngineState, launchEngine, toolSettings, steamEngineDeps) carry no versioning engine"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/engineConfig.test.ts#returns a current (v2) document as it stands, with no versioning engine; pnpm exec jest src/backend/engine (54 suites with stores, 1036 tests)"
        status: pass
      - kind: other
        ref: "comment-filtered grep for versioning members over the twelve task-1 files == 0; grep -c ensureSettingsMigrated src/backend/engine/engineConfig.ts == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "EngineServices and every type that fed it (ToolsDeps, LauncherDeps, EngineServicesSource, the flow deps, the bridge runtime deps) lose the member; boot, handler and launcher wiring and the test builders stop passing it"
    requirement: FND-06
    verification:
      - kind: other
        ref: "comment-filtered grep over the engine-side path set == 0; grep -c StoreVersioning src/backend/engine/engineServices.ts == 0; pnpm codecheck (0 errors)"
        status: pass
      - kind: unit
        ref: "pnpm test (1145 suites passed, 24387 tests); engineFlows, bridgeBottleLifecycle, bridgeRuntime, launchEngine.deadline suites; storeHostPortComplete and storeMirrorSchedule stay green"
        status: pass
      - kind: other
        ref: "pnpm smoke:sidecar PASS; pnpm lint 0 errors; pnpm find-deadcode PASS (311 baselined, none added); pnpm backend-di-ceilings PASS (jestMock=1802); pnpm planning-gates 12/12"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 22: Unthread the TS versioning engine from the engine side Summary

**The engine's stored game-config read no longer migrates in TS (Rust's boot sweep already did), and EngineServices plus every engine, tools, launcher, flow and bridge-runtime type that carried the versioning engine lost the member.**

## Accomplishments

- `readStoredGameConfig` drops its migrate-before-read call and reads through the root's mirror, or the file with an empty root; the T-68-19 containment checks are untouched. A new engineConfig case reads a current v2 document unchanged with no versioning engine in its deps.
- Engine readers (engineState, engineDecision, gameEngineState, launchEngine, toolSettings, steamEngineDeps) stop reading or passing `versioning`.
- EngineServices, EngineServicesSource, ToolsDeps, LauncherDeps, the engine and wine-tools flow deps, RunnerDeps and `createBridgeRuntime`'s deps lose the member. `handlers`, `bootstrap` and `storeManagers/index.ts` stop passing it to them; test builders and suites follow.
- No engine-side code reads a versioning engine any more. `StoreRoot`, `ManagerDeps` and the config factories keep theirs for 85-23; `storeVersioning/*` and `storeMigrations/*` still exist for 85-24.

## Task Commits

1. Task 1 (tracer): `a2086a2f1` feat(85-22): read the stored game config without the TS versioning engine
2. Task 2: `b8bccd130` feat(85-22): drop the versioning engine from EngineServices and everything that fed it

The tracer's end-to-end verify (engine jest, codecheck, prettier) passed before Task 2 began.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two tests outside the plan's file list passed `versioning` to readStoredGameConfig**
- **Found during:** Task 1 (codecheck)
- **Issue:** `src/backend/__tests__/settingsVersioning.test.ts` and `src/backend/stores/__tests__/settingsFamily.test.ts` passed the removed member, so codecheck failed.
- **Fix:** settingsFamily drops the argument (and a now-unused `build()` result). settingsVersioning drops it and its "migrates once with one backup" case now asserts the file is left alone, since the migration is the shell's boot step.
- **Files modified:** the two test files
- **Commit:** a2086a2f1 (the unused `existsSync` import this left behind was caught by lint and removed in b8bccd130)

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** test-only; no behaviour change beyond the removed TS migrate step the plan specified.

## Issues Encountered

None. `outboundHttpRegistry` did not flake in the full run.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary file access; T-85-56 and T-85-57 are mitigated as planned (containment unchanged and tested, comment-filtered reference count 0, codecheck clean).

## Next Phase Readiness

85-23 removes the config, manager and store-root halves (`ManagerDeps.versioning`, `StoreRoot.versioning`, `createTestManagerDeps`, the config factories); 85-24 then deletes `storeVersioning/*` and `storeMigrations/*`. `SettingsDocRoot` still carries an optional `versioning` and the TS-read write path still needs it (settingsDocs.ts), which is 85-23/85-24's to remove.

## Self-Check: PASSED

- Commits a2086a2f1 and b8bccd130 are ancestors of HEAD.
- Key files modified exist; the plan's acceptance greps and plan-end gates (pnpm test, smoke:sidecar, codecheck, lint, find-deadcode, backend-di-ceilings, planning-gates, prettier) all passed at b8bccd130.

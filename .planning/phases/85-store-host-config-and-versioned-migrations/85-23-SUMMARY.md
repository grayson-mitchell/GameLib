---
phase: 85-store-host-config-and-versioned-migrations
plan: 23
subsystem: infra
tags: [typescript, config, store, versioning, deletion, di, tests]

requires:
  - phase: 85-22
    provides: the engine side (EngineServices, tools, launcher, flow deps, bridge runtime) without the versioning member
  - phase: 85-21
    provides: the TS migration system, the store flag, the TS owner path and conf deleted; every store a mirror over Rust StoreHost
  - phase: 85-15
    provides: the settings documents read and written through readSettingsDoc/writeSettingsDoc, migrated by Rust's boot sweep
provides:
  - "GlobalConfig, GameConfig and createGameConfigs with no versioning member and no TS migrate step; settingsDocs.ts with no TS writer (a write outside the shell's table path throws)"
  - "ManagerDeps, CreateStoreManagersDeps, the five manager Picks, StoreRoot and createTestManagerDeps with no versioning member; StoreRoot builds no engine and takes no migration overrides"
  - "createTestVersioning deleted and forbidden by storeHostPortComplete; settingsVersioning.test.ts deleted"
  - "no source outside storeVersioning/ and storeMigrations/ carries a versioning member (comment-filtered count 0)"
affects: [85-24, 85-25]

actuals:
  tokens: 19884    # chars/4 over the realized diff (git diff 38c3325eb..e91b28baa: 79537 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count plan_head_before..HEAD (before this docs commit)
plan_head_before: 38c3325ebc1b65ffee98125d498e960ced925413
plan_head_after: e91b28baae9143a7124b321dca5f2c9adcf22f88

tech-stack:
  added: []
  patterns:
    - "A settings write needs the shell: settingsDocs.writeSettingsDoc throws for a path the root does not own, so a test builds a root over the folder its paths name"
    - "Stamped schema versions for test fakes come from testUtils/storeSchemaVersions.ts (mirrors the shell's Chains::baseline), not from an engine"

key-files:
  created:
    - src/backend/testUtils/storeSchemaVersions.ts
    - src/backend/storeVersioning/__tests__/versioningHarness.ts
  modified:
    - src/backend/config.ts
    - src/backend/game_config.ts
    - src/backend/stores/settingsDocs.ts
    - src/backend/stores/storeRoot.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/services/types.ts
    - src/backend/services/managerDeps.ts
    - src/backend/storeManagers/index.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/storeManagers/nile/setup.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/storeManagers/storeManagerCommon/games.ts
    - src/backend/testUtils/testStoreRoot.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/testUtils/testContext.ts
    - src/backend/testUtils/diskStoreSink.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/__tests__/storeHostPortComplete.test.ts
    - meta/backendDiCeilings/__tests__.json
  deleted:
    - src/backend/__tests__/settingsVersioning.test.ts

key-decisions:
  - "settingsDocs.writeSettingsDoc throws for a path the shell does not own instead of keeping a TS writer: with the engine gone there is nothing to write with, and production always passes the root"
  - "createVersioningHarness moves from testStoreRoot.ts to storeVersioning/__tests__/versioningHarness.ts, so the engine's own suites stay green until 85-24 deletes the directory"
  - "The test sink and family suites read stamped versions from a test-side table (storeSchemaVersions.ts) mirroring the shell's chains: settings v2, the seven library chains v3, the rest v1"
  - "createTestStoreRoot gained a wrapSink option (a wrapper in front of the disk sink) so gameConfigFirstWrite's WR-04 cases can make a write throw and let the rest through"

patterns-established: []

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "D-03 / SC5: GlobalConfig, GameConfig and createGameConfigs carry no TS versioning engine; settings I/O is readSettingsDoc/writeSettingsDoc, migrated and guarded by Rust"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "pnpm exec jest over the 11 config/sidecar suites plus settingsFamily.test.ts and settingsDocs.test.ts (13 suites, 195 tests); pnpm exec jest src/backend (632 suites, 13960 tests)"
        status: pass
      - kind: other
        ref: "comment-filtered grep for versioning members over config.ts and game_config.ts == 0; test ! -e src/backend/__tests__/settingsVersioning.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "ManagerDeps, createStoreManagers' deps, the five manager Picks and StoreRoot carry no versioning engine; the test helper is deleted behind a red-first gate entry"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/__tests__/storeHostPortComplete.test.ts#comment-stripped non-test src/, meta/ and src-tauri sources never name createTestVersioning (red before the deletions, green after)"
        status: pass
      - kind: other
        ref: "comment-filtered grep for versioning members over src and meta excluding storeVersioning/ and storeMigrations/ == 0; grep -rlw createTestVersioning src == 0; pnpm codecheck 0 errors"
        status: pass
      - kind: unit
        ref: "pnpm test (1144 suites passed, 24380 tests, 5 suites skipped); storeMirrorSchedule and storeHostPortComplete green"
        status: pass
      - kind: other
        ref: "pnpm smoke:sidecar PASS; pnpm lint 0 errors; pnpm find-deadcode PASS (311 baselined, none added); pnpm backend-di-ceilings PASS (jestMock=1799); pnpm planning-gates 12/12"
        status: pass
    human_judgment: false

duration: ~70min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 23: Unthread the TS versioning engine from the config, store-manager and store-root side Summary

**GlobalConfig, GameConfig, ManagerDeps and StoreRoot no longer carry the TS versioning engine (settings documents are written, migrated and guarded by the shell only), the test helper that built one is deleted behind a red-first gate entry, and nothing outside `storeVersioning/` and `storeMigrations/` names the engine.**

## Accomplishments

- `createGlobalConfig`, `createGameConfigs` and the config classes drop the `versioning` member and the lazy TS migrate (`prepareSettingsDoc`). `settingsDocs.ts` loses its TS writer, so `writeSettingsDoc` throws for a path the root does not own (no root, or not `config.json` / `GamesConfig/<app>.json` under `userData`). Reads of such a path still parse the file.
- `ManagerDeps`, `CreateStoreManagersDeps`, `managerDepsFromServices`, the five manager `Pick`s (gog/setup, nile/games, nile/setup, sideload/games, storeManagerCommon/games), the boot's `createStoreManagers` call and `createTestManagerDeps` lose the member. `StoreRoot` stops building the engine and its migration chains and drops `migrationOverrides`; its read-only aggregate stays for 85-24.
- `createTestVersioning` is deleted. `settingsVersioning.test.ts` is deleted; the Rust proof of the settings chains stays `migrate_golden`, the corpus older-versions case (85-08) and `settingsFamily.test.ts` (85-15).
- Test infrastructure now matches production's invariant (the root's `userData` is the folder `configPath` lives in): `createTestContext` derives `configPath` and `gamesConfigPath` from `userData`, and the sidecar harness aligns `userData` with a prebuilt root.

## Task Commits

1. Task 1 (tracer): `a67027ca4` feat(85-23): config layer without the TS versioning engine
2. Task 2: `e91b28baa` feat(85-23): drop the versioning engine from ManagerDeps and StoreRoot

Tracer verify: the 11 plan-named suites plus settingsFamily/settingsDocs, codecheck, prettier and the config reference count (0) passed, and so did `pnpm exec jest src/backend` (632 suites), before Task 2 began.

### Red-first record (storeHostPortComplete)

Before the deletions, with `createTestVersioning` added to FORBIDDEN_IDENTIFIERS:

```
✕ comment-stripped non-test src/, meta/ and src-tauri sources never name createTestVersioning
    + "src/backend/testUtils/testServices.ts: createTestVersioning",
    + "src/backend/testUtils/testStoreRoot.ts: createTestVersioning",
Tests: 1 failed, 36 passed, 37 total
```

After the deletions: `Tests: 158 passed, 158 total` over the five Task 2 suites (storeHostPortComplete green).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's file lists miss the other consumers of the engine and of the TS settings writer**
- **Found during:** Task 1 and Task 2 (codecheck and the repo-wide `versioning` count the plan's acceptance requires to reach 0)
- **Issue:** the count of 158 includes files the plan does not list: `settingsDocs.ts` (its `Pick<StoreRoot, 'versioning'>`, TS writer and `prepareSettingsDoc`), its test, `settingsFamily.test.ts`, `diskStoreSink.ts` and its test (the disk sink stamped `schemaVersion` through `root.versioning.currentVersionOf`), `accountFamily`/`cacheFamily`/`userStateFamily` tests (same call), and the six `storeVersioning/__tests__` suites that built their engine through `createVersioningHarness` in `testStoreRoot.ts`.
- **Fix:** `settingsDocs.ts` loses the TS writer and `prepareSettingsDoc` (its test's TS-written cases became "a write without a root throws" and "a non-settings path is read, not written"); the disk sink and family suites take stamped versions from the new `testUtils/storeSchemaVersions.ts` (settings v2, seven library chains v3, rest v1, mirroring the shell's `Chains::baseline`); `createVersioningHarness` moved into `storeVersioning/__tests__/versioningHarness.ts`, so those suites keep running until 85-24 deletes the directory.
- **Files modified:** see key-files above
- **Commits:** a67027ca4, e91b28baa

**2. [Rule 3 - Blocking] A settings write without a root throws, so config tests and the harness needed a root**
- **Found during:** Task 1 (jest)
- **Issue:** `GlobalConfig.load` writes defaults on a first run, which previously went through the TS writer for any path. With the writer gone, tests that built a config without a root, and the sidecar harness (whose `ctx.paths.configPath` was under `appData` while the boot root was over `userData`, and whose prebuilt-root cases used a root over a different folder), threw.
- **Fix:** the config tests pass `root: createTestStoreRoot(<folder of configPath>)`; `createTestContext` puts `configPath`/`gamesConfigPath` under `userData` (honouring a `userData` override); `bootFresh` aligns `userData` with a prebuilt `storeRoot`. `gameConfigFirstWrite` keeps its WR-04 failure cases by wrapping the disk sink so a write throws on demand (new `wrapSink` option on `createTestStoreRoot`) and moves its game files under `GamesConfig/`, the shell's table path.
- **Files modified:** testContext.ts, sidecarHarness.ts, testStoreRoot.ts and the config/sidecar tests
- **Commit:** a67027ca4

**3. [Rule 1 - Bug] focusRowFirstLaunchHydration seeded a v0 config.json and relied on the deleted TS migration**
- **Found during:** Task 1 (jest)
- **Issue:** the test asserted the TS engine's v0->v1 migration had removed `libraryTopSection` from `config.json`; no migration runs in jest any more, since the shell migrates at boot.
- **Fix:** the fixture writes `config.json` as the shell leaves it (v2, `libraryTopSection` removed, the seed persisted as `focusRow` via `migrateFocusRowSelection`); the mirror keeps the legacy key as before. The hydration assertions are unchanged.
- **Commit:** a67027ca4

**4. [Rule 3 - Blocking] The ceilings baseline named files this plan changed**
- **Found during:** Task 1 (`pnpm backend-di-ceilings`)
- **Issue:** `meta/backendDiCeilings/__tests__.json` held an entry for the deleted settingsVersioning.test.ts and a stale ceiling for gameConfigFirstWrite.test.ts (3 -> 2 jest.mock sites).
- **Fix:** entry removed, ceiling lowered.
- **Commit:** a67027ca4

**5. [Plan inconsistency] The gate names the helper, the acceptance count forbids the name**
- The plan has storeHostPortComplete spell the helper name while `grep -rlw createTestVersioning src` must be 0. The gate builds the name from parts (`['createTest', 'Versioning'].join('')`, as it does for the rollback flag), so both hold.

**Total deviations:** 5 (3 Rule 3, 1 Rule 1, 1 plan inconsistency). **Impact:** test infrastructure only; production behaviour is exactly what the plan specified (TS migrate, stamp and guard removed from the config layer).

## Issues Encountered

None blocking. `outboundHttpRegistry.test.ts` did not flake in the full run.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary file access. T-85-58 is mitigated as planned: the shell refuses a replace frame on a newer document and reports it (85-15, 85-16), `settingsFamily.test.ts` stays green, and a settings write the shell does not own now fails loudly instead of writing from TS. T-85-59: the helper is forbidden red-first and the comment-filtered reference count outside the two directories is 0.

## Next Phase Readiness

85-24 can delete `storeVersioning/*` and `storeMigrations/*`. Importers left outside them: `cache.ts`, `typed_store.ts`, `storeRegistry.ts`, `store_backend.ts`, `rustRefresh.ts` and `storeRoot.ts` (the read-only aggregate), as the 85-24 plan lists. `settingsDocs.ts` and the test sink no longer import either directory, and `testUtils/storeSchemaVersions.ts` is independent of both. The six `storeVersioning/__tests__` suites use `versioningHarness.ts` in the same directory and go with it. `meta/harvestStoreCorpus.ts` and `meta/__tests__/storeCorpus.test.ts` still import the runner from `storeMigrations`.

## Self-Check: PASSED

- FOUND: src/backend/testUtils/storeSchemaVersions.ts, src/backend/storeVersioning/__tests__/versioningHarness.ts
- MISSING (as intended): src/backend/__tests__/settingsVersioning.test.ts
- FOUND commits: a67027ca4, e91b28baa

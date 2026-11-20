---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 16
subsystem: infra
tags: [e2e-surface, sidecar, boot, gate, census-floor, dead-code]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-10 and 82-15 removed the gogdl, legendary and nile e2e stubs, onTestOnly and RunnerCommandStub; 82-02 assertAtOrAboveFloor; 82-07 guarded resetHeroic"
provides:
  - "Every remaining CI === 'e2e' branch in the shipped sidecar is gone: resolveAppPaths (temp config root, build asset dir), appFolderStep, online_monitor, anticheat, releases, getCurrentChangelog"
  - "src/backend/__tests__/e2eSurfaceGone.test.ts: a floor-guarded zero-hit gate (floor 500, empty-dir case that throws)"
affects: [83, 85]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: fee7bbbf1820b0b06059dfa17d1f4dae574968a7
plan_head_after: 2301e4475b25fe1fa6786a85895ff6389ee4f021

tech-stack:
  added: []
  patterns:
    - "Two-tier source gate: shipped source forbids any quoted e2e literal; test source forbids only the stub-surface symbols, so a legitimate Rust-shell guard test is not a hit"

key-files:
  created:
    - src/backend/__tests__/e2eSurfaceGone.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/appFolderStep.ts
    - src/backend/sidecar/processGuards.ts
    - src/backend/process/appPaths.ts
    - src/backend/process/README.md
    - src/backend/utils.ts
    - src/backend/online_monitor.ts
    - src/backend/anticheat/utils.ts
    - src/backend/utils/releases.ts
    - src/backend/sidecar/__tests__/appFolderStep.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/pathsBootOrder.test.ts
    - src/backend/sidecar/__tests__/resolveAppPaths.test.ts
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
    - src/backend/__tests__/utils.test.ts

key-decisions:
  - "appFolderStep's dependency bag shrank to what production uses (fs.existsSync, fs.renameSync, logError): the env, dirSync, mkdirSync and log members existed only for the e2e branch"
  - "e2eSurfaceGone is two-tier rather than one flat scan: tauriShellSource.test.ts legitimately names the Rust shell's own CI=e2e guard (it keeps a test run from rewriting the host's gamelib:// registration), which is not a mock backend and lives in src-tauri, so it is not a hit and is not skipped by file"

patterns-established:
  - "A deletion gate walks the whole of src/, requires a floor on files scanned, and proves its matcher with seeded sources plus an empty-dir case"

requirements-completed: [FND-01]

duration: 30min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 16: Remove the remaining CI=e2e branches and gate the surface Summary

**Every remaining `CI === 'e2e'` branch is deleted from the shipped sidecar with the production branch kept verbatim, the production bundle still builds and exits, and a floor-guarded gate keeps the whole e2e surface gone.**

## Performance

- **Duration:** about 30 min
- **Tasks:** 2
- **Files modified:** 15 modified, 1 created

## Accomplishments

- `resolveAppPaths` now returns `configRoot: appData` and `assetDir: isPackagedSidecar() ? 'build' : 'public'`; the `tmp` imports left bootstrap.
- `prepareAppFolder` is only the heroic -> GameLib rename; the temp-folder branch and its four dependency members are gone.
- `pingSites`, the offline-watch interval, `downloadAntiCheatData`, `fetchLastestReleases` and `getCurrentChangelog` no longer branch on the environment. `resetHeroic` (82-07) is untouched.
- Comment and doc mentions in `appPaths.ts`, `processGuards.ts`, `bootstrap.ts` and `process/README.md` removed or reworded.
- Tests now assert production behaviour only: the e2e cases in `appFolderStep`, `resolveAppPaths` and `utils.test.ts` were dropped (the production cases are kept), the CI-scrubbing hooks in `bootstrapWirings` and `sidecarRejectionGuard` were removed, and `resolveAppPaths` gained a production appFolder-under-appData case.
- `e2eSurfaceGone.test.ts` (15 cases): a real scan of src/ (about 2,280 files against a floor of 500), an empty-dir case that throws through `assertAtOrAboveFloor`, and seeded sources proving each pattern, comment-stripping and the test tier.

## Task Commits

1. **Task 1: Tracer, remove the remaining CI=e2e branches** - `eed98e6bb` (feat)
2. **Task 2: Add the floor-guarded e2eSurfaceGone gate** - `2301e4475` (test)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Decisions Made

See key-decisions above. `meta/backendDiCeilings/sidecar.json` needed no change: `pnpm backend-di-ceilings` passes at jestMock=1865, since no `jest.mock` call was removed or added. No floors were lowered.

## Deviations from Plan

### Already done by 82-15 (no change needed)

- The `ipcRegistry.ts` e2e gate (`onTestOnly`'s `env.CI === 'e2e'` check) and the `RunnerCommandStub` mention in `src/common/types.ts` were deleted by 82-15; `ipcRegistry.ts` and `types.ts` are therefore not modified here and those acceptance checks were already satisfied.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A test outside the plan's file list asserted the e2e behaviour**
- **Found during:** Task 1
- **Issue:** `src/backend/__tests__/utils.test.ts` had a `getCurrentChangelog` case "returns null in e2e CI mode", which fails once the guard is gone.
- **Fix:** Removed that case; the "reads Release from local bundled file" production case stays.
- **Files modified:** src/backend/__tests__/utils.test.ts
- **Committed in:** eed98e6bb

**2. [Rule 1 - Cleanup] Dead dependency members and imports orphaned by the branch removal**
- **Found during:** Task 1
- **Issue:** With the branch gone, `AppFolderDeps.env/dirSync/mkdirSync/log`, bootstrap's `dirSync`/`tmpNameSync`/`mkdirSync` imports and an empty `beforeAll` in `bootstrapWirings.test.ts` had no remaining use.
- **Fix:** Removed them; `pnpm codecheck` and the touched suites confirm nothing else read them.
- **Files modified:** appFolderStep.ts, bootstrap.ts, appFolderStep.test.ts, bootstrapWirings.test.ts
- **Committed in:** eed98e6bb

**3. [Rule 4-adjacent, resolved inline] The gate cannot be a flat scan of all of src/**
- **Found during:** Task 2
- **Issue:** `tauriShellSource.test.ts` names the Rust shell's own `CI=e2e` guard in test names and string literals. It is a protocol-registration guard in `src-tauri`, not a mock backend, so it cannot be deleted by cause, and the plan forbids a skip list.
- **Fix:** A two-tier matcher instead of a per-file exclusion: shipped source (outside `__tests__`) forbids any quoted e2e literal plus the named patterns; test source forbids the stub symbols and `CI === 'e2e'`. No file is skipped except the gate itself. Recorded here because it narrows the plan's literal "no file contains `CI=e2e`" for test files only.
- **Files modified:** src/backend/__tests__/e2eSurfaceGone.test.ts
- **Committed in:** 2301e4475

---

**Total deviations:** 3 (1 blocking, 1 cleanup, 1 gate-scope decision); 1 handoff item already done by 82-15.
**Impact on plan:** None on runtime behaviour.

## Issues Encountered

`moduleStateCensus.test.ts` stays red on `shimCoverage.ts:515 X86_NULL_OBJECT_VERSION_SET`, the known pre-existing failure from another session's `a94108e3e`; left untouched. The sidecar-guard suites print expected `[sidecar] unhandled promise rejection` lines by design and pass.

## Verification

- Jest: appFolderStep, bootstrapWirings, pathsBootOrder, resolveAppPaths, sidecarRejectionGuard, utils (115 tests), onlineMonitor (29) and e2eSurfaceGone (15) all pass; fakeHomeIsolation passes.
- `pnpm codecheck` clean; `pnpm backend-di-ceilings` PASS (jestMock=1865); `pnpm find-deadcode` PASS (312 baselined).
- `pnpm build:sidecar` succeeds and `pnpm smoke:sidecar` prints PASS and exits 0 on stdin EOF.
- `npx prettier --check` over every edited and created file passes (each confirmed not ignored via `--file-info`); eslint 0 errors.
- Acceptance: `grep -rnE "CI === 'e2e'|e2eMock|StubListeners|CommandStub" src | grep -v __tests__` returns 0 (was 58 at plan time).

## Threat Surface

T-82-43 mitigated: no CI=e2e branch remains in the shipped sidecar, and `e2eSurfaceGone.test.ts` keeps it that way with a floor and an empty-scan case. T-82-44 mitigated: tests assert production behaviour, and codecheck, build:sidecar and smoke:sidecar prove the production path. No new surface, no new dependencies. Exit contract: the removed branches held no handles; `prepareAppFolder` stays synchronous and bounded (two existsSync, one renameSync).

## Known Stubs

None.

## Next Phase Readiness

Criterion 5 (the CI=e2e surface) is complete across 82-10, 82-15 and 82-16. Phase 85+ boot ports have one fewer branch in `resolveAppPaths` and the `app-folder` step.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*

## Self-Check: PASSED

- `src/backend/__tests__/e2eSurfaceGone.test.ts` present; commits `eed98e6bb` and `2301e4475` are ancestors of HEAD.

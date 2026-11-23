---
phase: 87-engine-wine-and-tools
plan: 57
subsystem: engine
tags: [survivor-schedule, d-21, d-22, d-23, d-24, sc4, census-sweep, oracle-harness, knip]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-56c the engine directory deleted, SCHEDULE exported and noIntraPhaseRowsLeft green; 87-56a/b the five extra schedule rows
provides:
  - describe('engineWineSurvivors') with the hand-written EXPECTED_SURVIVORS table (77 rows, three wiring helpers) compared with SCHEDULE by (file, name, shape, wiring) in both directions
  - the D-22 / D-23 / D-24 sub-list checks, the deletedBy 88..98 range check, the absent-directory check and the only-survivor-files-name-a-channel-constant check, each with planted self-tests
  - the oracle harness trimmed to what wineCore.oracle.test.ts imports; the dead tool-oracle helper deleted
  - the stale engine-is-store-agnostic boundary rule removed
affects: [87-58, 87-59, 88, 96, 98]

actuals:
  tokens: 8500
  tasks: 2
  commits: 2

plan_head_before: 06b4eb069880f8ca5949584428ccad859158a2bb
plan_head_after: f720c6690762cba6dd3a5e3754590021cfc2acdd

tech-stack:
  added: []
  patterns:
    - "a survivor allowlist is a hand-written table compared with the schedule in both directions, never a pattern or a derivation"

key-files:
  created: []
  modified:
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/testUtils/engineWineOracle/harness.ts
    - src/backend/testUtils/engineWineOracle/__tests__/harness.test.ts
    - src/backend/testUtils/testEngineTransport.ts
    - .dependency-cruiser.cjs
  deleted:
    - src/backend/testUtils/engineWineOracle/toolsOracleSupport.ts

key-decisions:
  - "EXPECTED_SURVIVORS holds 77 rows, not the plan's 70: the schedule is the truth, and the seven rows beyond the plan's table each have a creating plan's comment (see Deviations); the (file, name, shape, wiring) set matches exactly"
  - "deletedBy is held to 88..98 for every row but is not part of the comparison key, as the plan states; no row's deletedBy was changed"
  - "src/backend/testUtils files are test support and are not walked by the channel-constant check; sidecar/sidecarRpc.ts (the sidecar's one typed channel list) is the single named non-survivor allowance"

requirements-completed: [SVC-02]

duration: not recorded (no start stamp was taken)
completed: 2026-11-24
---

# Phase 87 Plan 57: The survivor and census sweep Summary

**The final schedule now equals a hand-written 77-row survivor table by (file, name, shape, wiring) in both directions, with the D-22, D-23 and D-24 sub-lists checked separately; the oracle harness is trimmed to its one remaining consumer; and the census, ratchet and knip gates needed no floor moved.**

## Accomplishments

- **Task 1 (tracer).** `describe('engineWineSurvivors')` was added to `engineWinePortComplete.test.ts`. `EXPECTED_SURVIVORS` is written out name by name (a `rowsOf(file, shape, names)` helper only repeats the file and shape; nothing is derived from `SCHEDULE`). It asserts: SCHEDULE equals the table in both directions with no duplicates; every survivor file exists; every `deletedBy` is in 88..98; the resolver rows are exactly the ten D-23 names, all in `engineWineResolvers.ts`; the twins outside `enginewine/twin.ts` are exactly the four D-22 names; the `twin.ts` rows plus the view rows are exactly the D-24 bridge helpers, the two views and the flagged extensions; `src/backend/engine`, `src/backend/tools` and `src/backend/wine/manager` do not exist; only survivor files and `sidecar/sidecarRpc.ts` name a `RUST_ENGINE_` or `RUST_WINE_` constant; every `requestRustInvoke` call on those channels sits in a survivor file. Five planted self-tests (extra row, missing row, changed shape / changed wiring / duplicate, a stray channel-naming file, an empty walk) prove the detectors. A mutation check (one table name renamed) turned the comparison red and restored green.
- **Task 2.** `harness.ts` lost `pinClock`, `loadDeltas` and `assertLiveRecorded` (no importer left; their `harness.test.ts` cases went too, and a "never writes deltas.json" case replaced the read-and-never-write one). `toolsOracleSupport.ts` (no importer, a new knip finding after 87-56c) was deleted. `createTestCrossoverLocator` (the other new knip finding: its one caller reaches it through a lazy `require` knip does not follow) is tagged `@public` with that reason. The `engine-is-store-agnostic` rule over the absent `src/backend/engine` was removed from `.dependency-cruiser.cjs`; `boundaryGates.test.ts` never named it and needed no change. The note that the harness goes with the D-22 twins in Phase 88 sits on the twin rows in `engineWineShimSchedule.test.ts`. Five comments that named deleted TS paths (`types.ts`, `types/engine.ts`, `sidecarInternal.ts`, `enginePins.test.ts`, `visibility.ts`) now name the live owner.

## Task Commits

1. **Task 1 (tracer): engineWineSurvivors** - `bdab49dbb` (test)
2. **Task 2: harness trim, boundary rule, stale paths** - `f720c6690` (chore)

`commits: 2` is the measured `git rev-list --count 06b4eb069..HEAD` at the SUMMARY write.

## Census and ratchet gates (no floor lowered, none needed to move)

`diPhaseGates`, `moduleStateCensus`, `storeKinds`, `bootSourceShape`, `registrationOncePerBoot`, `createStores`, `testServices`, `nativeChannelOwnership`, `meta/backendDiCeilings` (jestMock 1,637, 385 files, exact) and the knip baseline (310 findings, file unchanged) already agreed with the deleted tree after 87-56c, which updated each by exactly the files it deleted. This plan re-ran all of them and changed none. The only gate-shaped change is the removed boundary rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's survivor table named 70 rows; the real schedule has 77**
- **Found during:** Task 1
- **Issue:** the table was written before 87-56a/b. The handoff named five added rows (`resolveEngineToolSettings`, `resolveNonCrossoverEngine`, `ensureFallbackEngine`, `crossoverBinDirSync`, `parseEngineOverride`); two more were created by earlier plans and omitted from the table: `cancelFallbackBottle` (a bottles shim, channel `RUST_ENGINE_BOTTLE_CANCEL_CREATE`) and `bridgeDeadlines` (the D-24 view over the bridge deadline callbacks, 87-54). The plan's twin.ts list also named four D-24-extended twins, not three.
- **Fix:** the table has all 77, each of which has a creating plan's comment in the schedule. No row was added to the schedule and none removed. The plan allows exactly this reconciliation; the premise (every survivor is a D-22/D-23/D-24 row) holds.
- **Committed in:** `bdab49dbb`

**2. [Rule 3 - Blocking] Two knip findings from 87-56c blocked `pnpm find-deadcode`**
- **Found during:** Task 2
- **Issue:** `toolsOracleSupport.ts` (unreferenced) and `createTestCrossoverLocator` (reached by `require`). The plan expects the knip baseline file to change; it did not need to, because both were fixed in code (a baseline line must never be added to pass a finding).
- **Fix:** delete the file; tag the export `@public`.
- **Committed in:** `f720c6690`

**3. [Scope] Files outside `files_modified`**
- `engineWineShimSchedule.test.ts` (a comment), `harness.test.ts`, `testEngineTransport.ts`, `.dependency-cruiser.cjs`, `toolsOracleSupport.ts` (deleted) and the five comment-only files above. `diPhaseGates.test.ts`, `moduleStateCensus.test.ts`, `meta/backendDiCeilings` and `meta/knip-baseline.txt` from the plan's list needed no edit. The harness trim removed only the three exports with no importer (the plan says "to what wineCore.oracle.test.ts imports"); `goldenDir` and `GoldenCapture` stay because `writeOrCompareGolden`, `loadCases` and the manifest guards use them, and `recorder.ts` is unchanged (it is the oracle's own mode and fixtures-root module, and its tests use the rest).

---

**Total deviations:** 3 (two blocking, one scope note). **Impact on plan:** no gate loosened, no allow-list widened, no floor lowered.

## Authentication Gates

None.

## Known Stubs

None (the created and modified files hold no hardcoded empty values or placeholder text).

## Threat Flags

None. T-87-88 (survivor allowlist as a pattern): an explicit table compared in both directions, with planted extra, missing, shape, wiring, duplicate and stray-file self-tests. T-87-SC: no package was added.

## Notes for later plans

- The one channel-naming allowance outside the survivor files is `sidecar/sidecarRpc.ts`; a plan that moves the channel list adds nothing here, it just updates `CHANNEL_NAMING_ALLOWED`.
- When Phase 88 deletes the four D-22 twins in `launcher.ts`, `commandRunner.ts` and their vector test, the harness directory (`testUtils/engineWineOracle/`), `wine/__tests__/oracle/wineCore.oracle.test.ts` and `engineWineFixtureRedaction.test.ts` go with them.
- The table's `D24_EXTENSIONS` and `D24_BRIDGE_HELPERS` lists are a second, independent pin on the twin rows; deleting a twin in Phase 96 means removing it from `EXPECTED_SURVIVORS` and from the matching list in the same commit.
- `fakeHomeIsolation` and `helperIntegration` did not fail in this plan's full run (87-56c saw both fail only under load).

## Verification

- `pnpm exec jest src/backend src/common meta`: 699 suites passed, 5 skipped, 17,067 tests passed, 0 failed.
- Task 1 and Task 2 automated verify blocks: engineWinePortComplete, engineWineShimSchedule, diPhaseGates, moduleStateCensus, wineCore.oracle, fakeHomeIsolation (plus harness.test and enginePins.test) pass; `pnpm codecheck` clean; `pnpm lint` 0 errors (828 warnings, none new); `pnpm backend-di-ceilings` PASS; `pnpm find-deadcode` PASS (310 baselined); `pnpm check:ipc-contract` up to date; `pnpm boundaries` clean (1,323 modules); `meta/__tests__/boundaryGates.test.ts` 21/21.
- Scoped `npx prettier --check` over every written path is clean (`.dependency-cruiser.cjs` checked with `--file-info` first: not ignored).
- Truths: `src/backend/engine`, `src/backend/tools` and `src/backend/wine/manager` do not exist; the only non-test production TS naming a `RUST_ENGINE_` or `RUST_WINE_` constant is the table's files and `sidecar/sidecarRpc.ts`.

## Self-Check

- Files exist: `engineWinePortComplete.test.ts`, `harness.ts`, `harness.test.ts`, this SUMMARY; `toolsOracleSupport.ts` is absent.
- Commits `bdab49dbb` and `f720c6690` are on HEAD's ancestry.

*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*

## Self-Check: PASSED

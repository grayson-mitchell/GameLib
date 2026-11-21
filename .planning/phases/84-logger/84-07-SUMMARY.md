---
phase: 84-logger
plan: 07
subsystem: infra
tags: [logger, deletion-gate, test-containment, census-deletion, forwarder]

requires:
  - phase: 84-logger
    provides: "the TS logger as a forwarder (84-03), the Rust writer and golden (84-01/84-04), logger channels served by Rust and the sidecar's logger registration deleted (84-05, 84-06)"
provides:
  - "loggerPortComplete.test.ts: the TS half of the logger slice's deletion gate (DELETED/KEPT lists, comment-stripped FORBIDDEN scans, floors, self-tests)"
  - "src/backend/logger holds only index.ts, constants.ts, types.ts, forwarder.ts, stringifyLogValue.ts and targetWriter.ts: the TS process writes no log file and computes no log path"
  - "the TS golden oracle deleted; the golden fixtures stay and the Rust golden keeps asserting against them"
affects: [84-08, 84-09, 84-10]

actuals:
  tokens: 34000
  tasks: 2
  commits: 3
plan_head_before: 42aaea648e69306f0ac161d0bc5f2c7d5ad7e0d3
plan_head_after: f18c19724ce05b077c295b1a4580241478133f22

tech-stack:
  added: []
  patterns:
    - "a *PortComplete gate for a slice whose TS half is a deletion: DELETED/KEPT lists plus comment-stripped identifier and file-write scans, each with a planted-occurrence self-test"
    - "a containment kit element is retired with the module it pointed at, by a dated note in the gate that required it, never by weakening a remaining check"

key-files:
  created:
    - src/backend/__tests__/loggerPortComplete.test.ts
  modified:
    - src/backend/logger/index.ts
    - src/backend/logger/targetWriter.ts
    - src/backend/logger/stringifyLogValue.ts
    - src/backend/jest.setupContainment.ts
    - src-tauri/crates/gamelib-log/tests/fixtures/golden/NOTES.md
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/sidecar/__tests__/structuralContainment.test.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/engineOverrideWriteGuard.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
    - src/backend/sidecar/__tests__/rustInvokeChannel.test.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - meta/backendDiCeilings/sidecar-tests-flows-1.json
    - meta/backendDiCeilings/sidecar-tests-flows-2.json
    - meta/backendDiCeilings/sidecar.json
  deleted:
    - src/backend/logger/log_writer.ts
    - src/backend/logger/formatter.ts
    - src/backend/logger/paths.ts
    - src/backend/logger/sanitizeRendererLogMessage.ts
    - src/backend/logger/__tests__/logWriter.test.ts
    - src/backend/logger/__tests__/sanitizeRendererLogMessage.test.ts
    - src/backend/logger/__tests__/logGolden.test.ts
    - src/backend/testUtils/settleLogFile.ts
    - meta/backendDiCeilings/logger.json

key-decisions:
  - "The testContainment `backend/constants/environment` pin was removed with the logger/paths mock: its own comment said it existed only to make that mock's red proof non-vacuous (it steered getBaseLogPath to the XDG branch), and nothing else in the file reads it. Keeping it would leave a dead mock under a comment that calls it load-bearing"
  - "Where a containment tripwire proved only the TS log path (bootstrap.test.ts's tripwire, bootstrapWirings's Test A negative control, structuralContainment Test 2) it was deleted; where it also guarded a remaining path (structuralContainment Test 6) it was repointed at resolveAppPaths().userData with the same contained-in-root and outside-real-home teeth"
  - "testContainment's two retired per-suite gates were replaced by a dated 84-07 note rather than inverted into 'must not mock logger/paths' gates: loggerPortComplete already forbids the getLogFilePath identifier in non-test source and file writes in the TS logger"
  - "logger.json (jestMock shard) was git rm'd, not emptied: both its entries named deleted suites"

patterns-established:
  - "A gate's red run is recorded before the deletion it gates, in the SUMMARY, per task"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "The TS logger is reduced to a forwarder: log_writer.ts, formatter.ts, paths.ts, sanitizeRendererLogMessage.ts and their tests are deleted, getLogFilePath is gone from logger/index.ts, and what remains under src/backend/logger is exactly index, constants, types, forwarder, stringifyLogValue and targetWriter"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/__tests__/loggerPortComplete.test.ts (DELETED and KEPT cases; 42 tests); ls src/backend/logger/*.ts lists 6 files"
        status: pass
    human_judgment: false
  - id: D2
    description: "A revived TS file write, deleted identifier, logger-slice sidecar registration or GAMELIB_LOGGER flag fails the gate, and each scan is proven able to fail"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "loggerPortComplete.test.ts: file-write, forbidden-identifier x5, 7 logger-channel ipc.on/ipc.handle scans, flag scan, floors (500 files, 7 channels), and four self-tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "The TS oracle is deleted, the golden fixtures stay, and the Rust golden still passes against them; NOTES.md records the deletion"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-log --test golden (2 passed); loggerPortComplete KEPT cases for cases.json, entries.json, NOTES.md, expected/"
        status: pass
    human_judgment: false
  - id: D4
    description: "No test depends on a module that no longer exists, and every remaining containment check (appFolder, userData, fixesPath, derivePaths, resolveAppDataDir, HOME/os.homedir redirection) still guards the real HOME"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "13 containment suites (367 tests) plus jest over src/backend/sidecar, src/backend/logger, src/backend/__tests__ and meta/__tests__: 312 suites passed, 8370 tests passed; pnpm check:ipc-contract, codecheck, lint, find-deadcode; backend-di-ceilings clean for every shard this plan touches"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 07: TS logger reduced to a forwarder; paths.ts, the oracle and the containment kit's log-path element deleted

**`loggerPortComplete` (written red first, twice) gates the deletion of the TS writer, formatter, sanitiser, `paths.ts` and the TS golden oracle; `src/backend/logger` is now index, constants, types, forwarder, stringifyLogValue and targetWriter, and the test containment kit lost only its log-path element.**

## Performance

- **Duration:** about 45 min (end 2026-11-21T07:38Z)
- **Tasks:** 2 (one tracer, one auto)
- **Files:** 31 changed under src, meta and src-tauri across the two code commits (9 deleted, 1 created)

## Accomplishments

- **Tracer (Task 1):** `loggerPortComplete.test.ts` first, then `git rm` of `log_writer.ts`, `formatter.ts`, `sanitizeRendererLogMessage.ts` and the three tests (`logWriter`, `sanitizeRendererLogMessage`, `logGolden`). `getLogFilePath` and its `./paths` import left `logger/index.ts`'s exports. `meta/backendDiCeilings/logger.json` (both entries named deleted suites) was `git rm`'d. `NOTES.md` records the oracle's deletion and that new cases are hand-written with a Rust-verified value and a note.
- **Task 2:** `paths.ts` and `settleLogFile.ts` deleted. The gate gained both paths and the `getLogFilePath` identifier. Per-suite log-path elements removed from eleven suites (table below); `testContainment`'s two per-suite gates retired with a dated 84-07 note; five jestMock shard entries lowered to re-counted values.

## Red-first gate runs (acceptance record)

| Run | When | Result |
| --- | --- | --- |
| 1 (Task 1) | gate written, tree untouched | 8 failed, 31 passed of 39: `log_writer.ts`, `formatter.ts`, `sanitizeRendererLogMessage.ts`, `logWriter.test.ts`, `sanitizeRendererLogMessage.test.ts`, `logGolden.test.ts` still exist; the file-write scan and the `sanitizeRendererLogMessage` identifier scan hit the old writer and the oracle's imports |
| 1 green | after the Task 1 deletions | 39 passed |
| 2 (Task 2) | gate extended with `paths.ts`, `settleLogFile.ts`, `getLogFilePath`, tree untouched | 3 failed, 39 passed of 42: both files exist; `getLogFilePath` named in non-test source (`paths.ts` itself) |
| 2 green | after the deletions and containment edits | 42 passed |

## Containment suites: the element removed from each

| Suite | Removed | Kept |
| --- | --- | --- |
| `testContainment.test.ts` | `jest.mock('backend/logger/paths')` block; the `backend/constants/environment` pin that only served it; Block A's `getLogFilePath({})` test and RED-PROOF 2; the two Block B gates (mock present, tripwire present) retired with a dated note; `'backend/logger/paths'` dropped from `CONTAINMENT_MODULE_SPECIFIERS`; the relative-form self-test now uses `backend/constants/paths` | `os` and `store_backend` mocks, Block A's derivePaths and resolveAppDataDir tests with their control, the pathShim-absent gate, Blocks C, D and E |
| `structuralContainment.test.ts` | Test 2 (real `getLogFilePath` in tmpdir), now a numbering-keeping note | Tests 1, 3-9; Test 6 repointed at `resolveAppPaths().userData` with the same inside-root and outside-real-home assertions |
| `bootstrap.test.ts` | the log-path tripwire, its import and three unused `path` imports | the setupContainment reference in the header |
| `bootstrapWirings.test.ts` | `logFilePath` handle and Test A negative control | the appFolder-in-tmpdir assertion |
| `engineOverrideWriteGuard.test.ts` | `jest.mock('../../logger/paths')` | gameSettingWrite, utils, systeminfo, os/path mocks |
| `enrichmentFlows.test.ts`, `gameDetailsFlows.test.ts`, `sidecarRejectionGuard.test.ts` | the `backend/logger/paths` mock block, the import, and `getLogFilePath({})` from the `beforeAll` candidates | appFolder, userDataPath, fixesPath candidates with the REFUSING TO RUN throw |
| `shellFilesFlows.test.ts`, `rustInvokeChannel.test.ts` | the `settleLogFile(getLogFilePath({}))` `beforeEach` and both imports | everything else |
| `devSecretVault.test.ts` | stale `getLogFilePath` in a comment on the logger export list | n/a |
| `sidecarStdoutFramesOnly.test.ts` | nothing: the plan named a `getLogFilePath` mock key there, but none exists at this head | n/a |
| `jest.setupContainment.ts` | comments only: it now says the TS logger writes no file since Phase 84 | the HOME / `os.homedir()` redirection, unchanged |

jestMock shard entries lowered: `sidecarRejectionGuard` 7 -> 6 and `testContainment` 4 -> 2 (flows-1); `enrichmentFlows` 13 -> 12 and `gameDetailsFlows` 11 -> 10 (flows-2); `engineOverrideWriteGuard` 7 -> 6 (sidecar). `sidecar-tests-boot.json` needed no change.

## Task Commits

1. **Task 1: tracer, TS logger reduced to a forwarder, gate written first** - `5bfda67eb` (refactor)
2. **Task 2: paths.ts deleted, containment kit's log-path element retired** - `f18c19724` (refactor)

`commits: 3` is the measured `rev-list` count over base `42aaea648`; one of the three (`bd9a1eb61`, a steam-bridge fix) is another session's commit that landed on `main` during the run. Mine are the two above.

## Verification

- `cargo test -p gamelib-log --test golden`: 2 passed (oracle gone, fixtures kept).
- Task 1 set (loggerPortComplete, nativeSeamPortComplete, forwarder, forwarderGolden, targetWriter, logPrefixParity, logSecretGate): 7 suites, 225 tests passed.
- Task 2 set (loggerPortComplete plus the 12 containment suites): 13 suites, 367 tests passed. Wider run over `src/backend/sidecar`, `src/backend/logger`, `src/backend/__tests__` and `meta/__tests__`: 312 suites passed, 2 skipped, 8370 tests passed.
- `pnpm check:ipc-contract` up to date; `pnpm codecheck` clean; `pnpm lint` 0 errors, `production: PASS | tests: PASS`; `pnpm find-deadcode` PASS (312 baselined findings, none new).
- `npx prettier --check` over every touched path prettier sees (`--file-info` confirmed none ignored; `NOTES.md` sits in the ignored golden tree and the deleted files need none): clean.
- `ls src/backend/logger/*.ts` lists exactly constants, forwarder, index, stringifyLogValue, targetWriter, types; `grep -c "backend/logger/paths" testContainment.test.ts` is 1 (the dated note).
- Darwin clippy ratchet and `planning-gates` not re-run: no Rust source and no planning-gates input changed (plan instruction).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Removed the `backend/constants/environment` mock from testContainment**
- **Found during:** Task 2. Not named in the plan.
- **Issue:** its comment documented it as load-bearing only for the retired `logger/paths` red proof; leaving it would keep a dead mock under a false comment.
- **Fix:** removed it with the logger/paths mock (this is why the shard falls 4 -> 2 rather than 4 -> 3).
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`, `meta/backendDiCeilings/sidecar-tests-flows-1.json`

**2. [Rule 3 - Blocking] Containment tripwires beyond the ones the plan named**
- **Found during:** Task 2 grep re-measure. `bootstrapWirings.test.ts` (Test A negative control and the `logFilePath` handle) and `structuralContainment.test.ts` Test 6 (a log-path assertion that doubled as the real-home teeth) also had the TS log path as a subject. Test 6 was repointed at `resolveAppPaths().userData` rather than dropped, so the real-home teeth stay.

**3. [Rule 1 - Stale reference] Comment sweeps inside files this plan edits**
- `logger/index.ts` (named `loggerFlowRegistration.ts`), `logger/targetWriter.ts` and `logger/stringifyLogValue.ts` (named `log_writer.ts` and `formatter.ts`), `jest.setupContainment.ts` and `testContainment.test.ts` (named `loggerFlows.test.ts`), `bootstrap.test.ts`, `bootstrapWirings.test.ts` and the `devSecretVault`/`sidecarRejectionGuard` header notes were reworded to say the module is gone.

**Total deviations:** 3 (1 missing-critical, 1 blocking, 1 stale reference), 0 architectural. **Impact:** none on scope.

## Issues Encountered / Pre-existing

- `pnpm backend-di-ceilings` still fails on two entries that are not this plan's (the 84-06 summary recorded the same): `steam/__tests__/games.test.ts` `jestMock` 46 > baseline 45 and `steam/bridge/__tests__/steamOfflineMode.test.ts` with no baseline, from another session's uncommitted work. Every shard this plan touches is clean. The plan's "backend-di-ceilings exit 0" criterion is therefore not met on this tree, for that reason only. Recorded, not fixed.
- Stale prose references to deleted files remain, by design, in files this plan does not own (history notes dated 84-06 in `electronReachLedger`, `ipcDomainCensus`, `flowRegistrationCensus`, `diPhaseGates` and others are accurate as written). Genuinely stale ones, listed for a later sweep: `src/frontend/screens/Game/GameSubMenu/repairFailure.ts:27` (loggerFlowRegistration), `src/backend/typed_store.ts:153` and `src/backend/storeVersioning/backup.ts:5` (uploader.ts, logger/stores.ts), `src/backend/sidecar/outboundHttpRegistry.ts:19` and `shellFilesFlowRegistration.ts:83`, `src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts:210` (log_writer.ts), `src/backend/storeManagers/gog/__tests__/user.test.ts:579`, `meta/logSecretGate.ts:11`, `meta/__tests__/electronAbsence.test.ts:28-34`, the `deleteButtonReachability.test.tsx` header, `meta/captureShellScrollback.ts:628` and `meta/bridgeCensus.ts:1335` (84-09 rewrites the former), and `src/common/types/sidecarTransport.ts:148` ("Moved here from `backend/logger/paths.ts`", still true as history).
- A stray `/tmp` lint capture was written and removed mid-run; no artefact remains.

## Known Stubs

None. This plan deletes code and adds a test gate.

## Threat Flags

None. No new endpoint, auth path or file-access surface; T-84-29 (a revived second writer) is mitigated by `loggerPortComplete`.

## Next Phase Readiness

Ready for 84-08: the gate's Rust half (shell_diag, `gamelib-shell.log`, the steamcm forwarder) lands there, red first, alongside this file.

## Self-Check: PASSED

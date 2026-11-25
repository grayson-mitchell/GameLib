---
phase: 88-launch-pipeline
plan: 16
subsystem: known-fix-delete-gate
tags: [knownfix, delete-gate, survivors, schedule, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 12
    provides: the launchrust/knownFixes.ts shims and the settle helpers (knownFixLaunchReply.ts)
  - phase: 88-launch-pipeline
    plan: 13
    provides: the launchrust/knownFixTwins.ts twins and their vectors test
  - phase: 88-launch-pipeline
    plan: 15
    provides: every caller outside the TS known-fix modules on a scheduled shim or twin
provides:
  - describe('knownFixPortComplete') over a KNOWN_FIX SliceSpec in launchPortComplete.test.ts (32 deleted paths, 16 kept paths, 29 forbidden identifiers, knownfix manifest slice with channelsFloor 2, no GAMELIB_KNOWNFIX)
  - describe('knownFixSurvivors') in the same file: shim and twin exports against SCHEDULE in both directions, rowsDueIn(SCHEDULE, 88) empty, deletedBy in 88.1, 92, 93 or 97, with planted self-tests
  - the eight src/backend/knownFix* TS modules, their 18 unit tests and their five oracle tests deleted
affects: [88.1, 92, 93, 97]

actuals:
  tokens: 3100
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 0fad173036ad6c3dc1f27e44c150a9cc8d0e0e2a
plan_head_after: 31dc81758db771da68c931f1539e8090658cc066

tech-stack:
  added: []
  patterns:
    - "a delete gate lists its own exclusions: every export of a deleted module that a shim, a twin or a kept shared file also names is left out of forbiddenIdentifiers, each checked with git grep -w, and the reasons sit in the SliceSpec comment"
    - "a survivors describe over files that a SCHEDULE row names compares exports and rows both ways and fails on a survivor file the walk did not read, rather than passing on an empty set"

key-files:
  created: []
  modified:
    - src/backend/__tests__/launchPortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
    - src/backend/testUtils/launchOracle/__tests__/census.test.ts
    - meta/backendDiCeilings/__tests__.json
    - meta/buildOverlayArchive.ts
    - meta/buildSteamClientLayerArchive.ts
    - meta/__tests__/steamclientLayerNotice.test.ts
    - src-tauri/crates/gamelib-knownfix/tests/golden_report.rs
    - src/common/knownFixReport.ts
    - src/common/types.ts

key-decisions:
  - "The two overlay archive build scripts and the steamclient layer notice test read and write archives through the vector-pinned twins (launchrust/knownFixTwins.ts) and are listed as importers of that file in KNOWN_FIX_TWIN_IMPORTERS; the twins' bundle stays a plain node bundle (pnpm build:overlay-archive still prints its usage and exits 2)"
  - "golden_report.rs stops reading the deleted TS report client: the client's relay URL, pending sentinel and 8 s timeout are pinned by the recorded constants case and the Rust values, and the shared-schema assertions on src/common/knownFixReport.ts are unchanged"
  - "The 66.4 owned list in diPhaseGates lost two entries (knownFixOverlayInstall.ts, knownFixesFetcher.ts) and its floor went 54 to 52 with a dated note, the same deliberate-deletion pattern the earlier plans used; no floor was lowered to turn a red run green"
  - "knownFixLaunchReply.ts (the 88-12 settle helpers) and the oracle cases files the twins' vectors test imports (knownFixReader.cases.ts, knownFixOverlay.cases.ts) stay"

patterns-established: []

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The known-fix TypeScript (eight modules, 18 unit tests, five oracle tests) is gone and a gate fails if any of it, a forbidden identifier, a TS knownfix channel registration or a GAMELIB_KNOWNFIX flag comes back; the goldens and recordings the Rust replays read are kept"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/launchPortComplete.test.ts#knownFixPortComplete"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-knownfix (all golden replays, including golden_report the_constants_equal_the_shared_schema_source)"
        status: pass
      - kind: integration
        ref: "pnpm test:ci (1101 suites, 24405 tests passed), pnpm codecheck, pnpm lint, pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every export of launchrust/knownFixes.ts and knownFixTwins.ts is a schedule row and every row is exported, nothing is due in 88, and each row is deleted by 88.1, 92, 93 or 97"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/launchPortComplete.test.ts#knownFixSurvivors"
        status: pass
      - kind: integration
        ref: "pnpm find-deadcode (PASS, 310 baselined findings, unchanged)"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 16: Known-fix TS deletion and delete gate Summary

**The eight TypeScript known-fix modules, their 18 unit tests, their five oracle tests and the fetch oracle's cases file are deleted behind a `knownFixPortComplete` gate that went RED first, and a `knownFixSurvivors` check pins the remaining 16 shims and twins to the schedule in both directions**

## Performance

- **Duration:** about 50 min
- **Completed:** 2026-11-25
- **Tasks:** 2 (a tracer and an auto task)
- **Commits:** 2 (`df37a5534`, `31dc81758`)
- **Files:** 43 changed, 282 insertions, 10159 deletions (32 deletions, 11 modifications, 0 creations)

## Accomplishments

- **Lane check first.** `main` was 0 behind and 85 ahead of `origin/main`, and `pnpm check:ipc-contract` passed on the tip before any deletion.
- **Tracer, RED then GREEN.** `describe('knownFixPortComplete', () => runSlice(KNOWN_FIX))` was added with the files present. The recorded RED run (`-t knownFixPortComplete`) failed 32 `is deleted` assertions, each `expected deleted, still on disk: <path>` (for example `src/backend/__tests__/knownFixLaunch.test.ts`), plus the forbidden-identifier checks that named the deleted modules' exports. The 16 `is kept` assertions passed. After `git rm` of the 32 files the same describe is green, with the full backend suite.
- **Survivor check.** `knownFixSurvivors` has four assertions (anti-vacuity floor of 16 rows, exports against `SCHEDULE` in both directions, `rowsDueIn(SCHEDULE, 88)` empty, `deletedBy` in 88.1, 92, 93 or 97) and four planted self-tests (an unscheduled export, an orphaned row with a type export ignored, an unread survivor file throwing, the due-in-88 and out-of-set phase filters).
- **Gate content.** `KNOWN_FIX.forbiddenIdentifiers` holds 29 names; the excluded candidates and why (shim and twin names, the four helpers the twins file carries privately, `validateOverlayEntries` which the kept `common/knownFixOverlayCatalogue.ts` defines for itself) are in the SliceSpec comment, each checked with `git grep -w`.
- **Kept.** The golden directories `reader`, `registry`, `overlay_archive`, `overlay_install`, `launch_overrides`, `fetcher`, `report` and the recorded `fetcher`, `report` directories, `src/common/knownFixReport.ts`, `src/common/knownFixOverlayCatalogue.{ts,json}`, and the two `launchrust` files.

## Task Commits

1. **Task 1: tracer, sync with main, RED gate, delete the slice, GREEN** - `df37a5534` (refactor)
2. **Task 2: the known-fix survivor check and the dead-code ratchet** - `31dc81758` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Overlay archive build scripts imported a deleted module**
- **Found during:** Task 1 (importer sweep before deleting)
- **Issue:** `meta/buildOverlayArchive.ts`, `meta/buildSteamClientLayerArchive.ts` and `meta/__tests__/steamclientLayerNotice.test.ts` imported `backend/knownFixOverlayArchive` (88-15's note that nothing outside `launchrust/` imports a `backend/knownFix*` module did not cover `meta/`).
- **Fix:** Moved the three imports to `backend/launchrust/knownFixTwins` (`buildOverlayTarGz` and `readOverlayTarGz` are its vector-pinned copies, pinned to `golden/overlay_archive`), and added the two scripts to `KNOWN_FIX_TWIN_IMPORTERS` so the schedule's importer check stays exact. The twins file pulls in `backend/logger`; the bundle still builds (`pnpm build:overlay-archive` prints its usage and exits 2 as before) and the notice test passes.
- **Files modified:** meta/buildOverlayArchive.ts, meta/buildSteamClientLayerArchive.ts, meta/__tests__/steamclientLayerNotice.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts
- **Verification:** codecheck (main and meta projects), engineWineShimSchedule, the notice test, test:ci
- **Commit:** df37a5534

**2. [Rule 3 - Blocking] A Rust golden test read the deleted TS report client**
- **Found during:** Task 1
- **Issue:** `golden_report.rs` `the_constants_equal_the_shared_schema_source` read `src/backend/knownFixReport.ts` and asserted six substrings of it.
- **Fix:** Dropped the client read and its assertions; the relay URL, sentinel and timeout stay pinned by the recorded `constants` case (which carries `relayUrl`, `pendingSentinel`, `relayTimeoutMs`) and the `RELAY_TIMEOUT` assert; the shared-schema assertions are unchanged.
- **Files modified:** src-tauri/crates/gamelib-knownfix/tests/golden_report.rs
- **Verification:** `cargo test -p gamelib-knownfix` (all pass)
- **Commit:** df37a5534

**3. [Rule 3 - Blocking] The fetch oracle's cases file imported a deleted module**
- **Found during:** Task 1
- **Issue:** `oracle/knownFixFetch.cases.ts` imported the two feed base URLs from the deleted fetcher and had no other importer.
- **Fix:** Deleted it with the fetch oracle and listed it in `KNOWN_FIX.deleted` (32 paths, not the plan's 31). `knownFixRegistry.cases.ts` and `oracle/oracleCommon.ts` lost their only importers (their oracle tests) but import nothing deleted and knip does not flag them, so they stay for the later launch oracles.
- **Files modified:** src/backend/__tests__/oracle/knownFixFetch.cases.ts (deleted)
- **Commit:** df37a5534

**4. [Rule 3 - Blocking] Stale references to the deleted files in three gates**
- **Found during:** Task 1
- **Issue:** `meta/backendDiCeilings/__tests__.json` held 16 jest-mock ceilings for deleted tests; `diPhaseGates.test.ts` listed two deleted modules in its 66.4 owned list (floor 54); `census.test.ts` had a case reading `knownFixesRegistry.test.ts`.
- **Fix:** Removed the 16 ceilings; removed the two owned-list entries and moved the floor 54 to 52 with a dated note (a deliberate deletion, not a lowered floor); removed the one census case whose subject file is gone (the census helpers keep their other cases).
- **Files modified:** meta/backendDiCeilings/__tests__.json, src/backend/__tests__/diPhaseGates.test.ts, src/backend/testUtils/launchOracle/__tests__/census.test.ts
- **Commit:** df37a5534

**5. [Rule 1 - Dead code] Two exports lost their last user, so the knip ratchet rose**
- **Found during:** Task 1 (find-deadcode)
- **Issue:** `KNOWN_FIX_REPORT_VERSION` (src/common/knownFixReport.ts) and `KnownFixRegistryView` (src/common/types.ts) were exported only for the deleted modules.
- **Fix:** Dropped the `export` keyword from each (the shared schema and the `KnownFixRegistryEntry` type still use them; the Rust test's substring check on `KNOWN_FIX_REPORT_VERSION = 1` still holds). `pnpm find-deadcode` passes at the unchanged 310 baselined findings.
- **Files modified:** src/common/knownFixReport.ts, src/common/types.ts
- **Commit:** df37a5534

**6. [Plan acceptance literal] `ls src/backend/knownFix*.ts | wc -l` is 1, not 0**
- The remaining match is `src/backend/knownFixLaunchReply.ts`, the 88-12 settle helpers the launcher, the three managers and the Steam bridge use; it did not exist when the plan's HEAD=8 was measured and the required reading names it as kept. All eight modules the plan names are absent.

**Total deviations:** 5 auto-fixed (4 Rule 3, 1 Rule 1) plus one acceptance-literal note. **Impact:** none on scope or behaviour; every change is the removal or re-pointing of a reference to a file this plan deletes. Nothing was fixed in the product (D-20).

## Issues Encountered

None open. `src-tauri/src/ipc_contract.rs` regeneration was not needed (`pnpm check:ipc-contract` passes before and after).

## Known Stubs

None. This plan adds test gates and deletes files.

## Threat Flags

None. No network, auth, file-access or schema surface was added; `meta/` build scripts now import a file that also imports `backend/logger`, which adds no new trust boundary.

## Next Phase Readiness

Sub-phase 88's known-fix slice is done: the only TS left for it is the seven shim rows and nine twin rows (deletedBy 88.1, 92, 93 and 97). The launch sub-phases 88.1 to 88.3 add their own `PortComplete` describes to `launchPortComplete.test.ts` and delete their own rows.

## Self-Check: PASSED

- Files found: launchPortComplete.test.ts, launchrust/knownFixes.ts, launchrust/knownFixTwins.ts, common/knownFixReport.ts, common/knownFixOverlayCatalogue.{ts,json}, golden/{reader,registry,overlay_archive,overlay_install,launch_overrides,fetcher,report}
- Commits found on HEAD: df37a5534, 31dc81758
- `describe('knownFixSurvivors'` occurs once; `rowsDueIn(SCHEDULE, 88)` is `[]`
- Plan verification: check:ipc-contract, launchPortComplete (130 tests), engineWineShimSchedule, knownFixTwins.vectors, test:ci (1101 suites passed, 5 skipped), codecheck, lint, find-deadcode, prettier on the touched test files, cargo test -p gamelib-knownfix all pass

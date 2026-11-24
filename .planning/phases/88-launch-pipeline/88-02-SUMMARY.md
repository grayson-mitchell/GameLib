---
phase: 88-launch-pipeline
plan: 02
subsystem: test-gates
tags: [shim-schedule, delete-gate, no-rollback, roadmap-derived-deletedby, svc-03]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the shim schedule with 13 rows left at deletedBy 88 (68 code plans, all with SUMMARY at execution time)
  - phase: 88-launch-pipeline
    plan: 01
    provides: 88-HUMAN-UAT.md and the 82 amendments (D-25 order: contract before code)
provides:
  - the D-30 deletedBy rule in engineWineShimSchedule.test.ts, derived from the ROADMAP.md `### Phase N.M:` headings in 87..99
  - twelve re-targeted rows plus armEngineLaunchDeadline, no row at 88
  - SHIM_DIRS discovery over src/backend/launchrust and the RUST_KNOWNFIX_, RUST_LAUNCH_, RUST_RUNNER_ channel prefixes
  - rowsDueIn(schedule, phase), exported
  - launchPortComplete.test.ts, the Phase 88 delete gate with its no-rollback scan
affects: [88-03, 88.1, 88.2, 88.3, 97, 98]

actuals:
  tokens: 6200
  tasks: 3
  commits: 3
plan_head_before: b424430ea0192b3bf058352e38944cbf214024a4
plan_head_after: 8274ec0e4e5b6558510ef51b1103c2d196774534

tech-stack:
  added: []
  patterns:
    - "the allowed deletedBy set is read from the roadmap's phase headings, so an inserted phase needs no test edit and a typo (88.4) fails"
    - "per-sub-slice PortComplete describes are added RED-first by the plan that deletes the slice; the no-rollback scan exists before the first port commit"

key-files:
  created:
    - src/backend/__tests__/launchPortComplete.test.ts
  modified:
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "Rows are re-targeted by last call site, not by file: of the three enginewine/tools.ts rows only winetricksInstallVerbs has a bridge caller (bridgeKnownFixes.ts:290), so only it goes to 97; dxvkInstallRemove and winetricksListInstalled have launcher-only callers and go to 88.1"
  - "wineReleasesInfoReady goes to 98, not an 88.x phase: its only caller is the releasesInfoReady listener in engineWineResolvers.ts, which is not a launch path"
  - "The crate walk floor is 300 under 410 non-test .rs files measured on 2026-11-25; a crate's own tests/ directory is read too, so a flag named in an integration test is caught"
  - "The decimal allow-set is built once at module load; a missing ROADMAP.md yields only the integers, so the test fails closed rather than accepting any decimal"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "Phase 87 code is proven landed: every 87 plan whose files_modified reaches outside .planning/ has its SUMMARY (68 parsed, floor 60)"
    requirement: SVC-03
    verification:
      - kind: other
        ref: "the bash loop at the head of Task 1's verify: '87 code plans with SUMMARY: 68', exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "The schedule accepts roadmap-declared decimal phases and rejects 88.4, 88.15, 86, 100 and NaN"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts#deletedBy (three tests: rejection, roadmap-only acceptance with a planted fixture, the five real decimal phases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No schedule row says deletedBy 88; 10 rows say 88.1, 2 say 88.2, winetricksInstallVerbs says 97, wineReleasesInfoReady says 98; launchrust and the three new channel prefixes are discovered; rowsDueIn is exported"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "engineWineShimSchedule.test.ts and engineWinePortComplete.test.ts, 377 passed (survivors comparison unchanged)"
        status: pass
    human_judgment: false
  - id: D4
    description: "launchPortComplete.test.ts forbids GAMELIB_LAUNCH and GAMELIB_KNOWNFIX under src, src-tauri/src and src-tauri/crates with floors on every walk and planted self-tests"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/launchPortComplete.test.ts, 6 passed"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 02: Launch scaffolding and known fixes Summary

**Roadmap-derived `deletedBy` rule (88.1, 88.2, 88.3, 90.1, 90.2 accepted, 88.4 rejected) with all 13 "88" schedule rows re-targeted by last call site, launchrust and three new Rust channel prefixes in discovery, `rowsDueIn`, and a floored, self-tested `GAMELIB_LAUNCH` / `GAMELIB_KNOWNFIX` no-rollback gate**

## Performance

- **Duration:** about 3 min of tool time (measured from the plan ledger; jest runs of the 377-test pair take about 26 s each)
- **Completed:** 2026-11-25
- **Tasks:** 3 (one tracer, two auto)
- **Files:** 2 (one created, one modified)

## Accomplishments

- Prerequisite check: 68 Phase 87 plans with code outside `.planning/` all have a SUMMARY (floor 60), so D-30's gate held and coding proceeded.
- `deletedByProblems` now takes its allowed set from the integers 87..99 plus every `### Phase N.M:` roadmap heading with N in 87..99. Measured against the real roadmap that is exactly 88.1, 88.2, 88.3, 90.1 and 90.2; 34.7 and 999.2 are outside the window and stay rejected.
- The 13 rows: `isRuntimeInstalled`, `downloadRuntime`, `installWineVersion`, `listWineReleases`, `dxvkInstallRemove`, `winetricksListInstalled`, `setupEnvVars`, `setupWineEnvVars` and (Task 1) `armEngineLaunchDeadline` to 88.1; `validWine` and `createCommandRunner` to 88.2; `winetricksInstallVerbs` to 97; `wineReleasesInfoReady` to 98. Each carries a one-line comment naming the last call site.
- Discovery: `SHIM_DIRS = [enginewine, launchrust]` (a missing directory contributes nothing), `CHANNEL_PREFIXES` plus `RUST_KNOWNFIX_`, `RUST_LAUNCH_`, `RUST_RUNNER_`, and a self-test that a launchrust export and an outside call on each new prefix is discovered and must be a row.
- `rowsDueIn(schedule, phase)` exported beside `noIntraPhaseRowsLeft` with a self-test, including the real schedule (nothing due in 88, at least 9 in 88.1, at least 2 in 88.2).
- `launchPortComplete.test.ts`: `noRollbackFlag` over the src/meta, src-tauri/src and src-tauri/crates walks, five floors, and three planted self-tests (flag in code, in a comment and as a longer name; a planted temp tree including a crate file; an empty tree that must fail both floors).

## Task Commits

1. **Task 1: Tracer, 87 prerequisite check, roadmap-derived deletedBy, armEngineLaunchDeadline** - `d48414e47` (test)
2. **Task 2: Re-target twelve rows, launchrust discovery, rowsDueIn** - `73e42e144` (test)
3. **Task 3: launchPortComplete.test.ts with the no-rollback scan** - `8274ec0e4` (test)

**Plan metadata:** the final docs commit carrying this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Files Created/Modified

- `src/backend/__tests__/engineWineShimSchedule.test.ts` - roadmap-derived deletedBy rule, 13 re-targeted rows, SHIM_DIRS, extended CHANNEL_PREFIXES, `rowsDueIn`, new self-tests
- `src/backend/__tests__/launchPortComplete.test.ts` - the Phase 88 delete gate (new)

## Decisions Made

See `key-decisions` above. Recorded with the grep evidence the plan asked for: the call sites read were launcher.ts 859-862, 966, 1117-1131, 1142-1161, 1198; utils.ts 1107, 1131; storeManagers/steam/bridgeKnownFixes.ts 290; sidecar/engineWineResolvers.ts 426; commandRunner.ts 302; sidecar/bootstrap.ts 1893.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A self-test pinned the old prefix list in its expected message**
- **Found during:** Task 2
- **Issue:** `a planted call to an info channel or an unrelated channel fails for the engine prefixes` asserted the message "must be a RUST_ENGINE_* or RUST_WINE_* constant"; `checkShimShape` builds that text from `CHANNEL_PREFIXES`, so extending the list changed it. The failure also showed in the `engineWinePortComplete.test.ts` run because it imports the schedule test.
- **Fix:** the assertion now expects the five-prefix text.
- **Files modified:** `src/backend/__tests__/engineWineShimSchedule.test.ts`
- **Verification:** both test files green, 377 tests
- **Commit:** `73e42e144`

### Deviation from the discussion-log shorthand (recorded by the plan itself)

`dxvkInstallRemove` and `winetricksListInstalled` go to 88.1, not 97 ("the three tools.ts rows go to 97" in the discussion log): only `winetricksInstallVerbs` has a bridge caller.

---

**Total deviations:** 1 auto-fixed (1 Rule 1)
**Impact on plan:** none beyond the one assertion; `engineWinePortComplete.test.ts` needed no edit (it compares names and holds `deletedBy` to 88..98, which 88.1 and 88.2 satisfy).

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. Test files only; no endpoint, auth path, file access pattern or schema was added. T-88-03, T-88-04 and T-88-05 are mitigated as the plan's threat model specifies.

## User Setup Required

None.

## Next Phase Readiness

- The next 88 plans can add `launchrust` shims and twins as rows and each 88.x sub-phase finds its rows with `rowsDueIn`.
- Sub-phase 88's known-fix plan adds `knownFixPortComplete` to `launchPortComplete.test.ts` RED-first.
- Note for later plans: when a row is re-targeted to a decimal phase, `engineWinePortComplete.test.ts` line ~960 still holds `deletedBy` to 88..98, which is satisfied by 88.1 and 88.2 but would reject a future 90.x row; widen it only when a row actually moves there.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*

## Self-Check: PASSED

- FOUND: `src/backend/__tests__/launchPortComplete.test.ts`, `src/backend/__tests__/engineWineShimSchedule.test.ts`
- FOUND commits: `d48414e47`, `73e42e144`, `8274ec0e4` (ancestors of HEAD)
- Acceptance: `deletedBy: 88$` count 0; `deletedBy: 88.1$` count 10 (>= 9); `deletedBy: 88.2$` count 2; `'RUST_KNOWNFIX_'` present; `rowsDueIn` exported with a self-test; `describe('noRollbackFlag'` present; 6 passing tests in launchPortComplete
- Plan verification: 87 prerequisite 68 (>= 60); schedule and port-complete suites 377 passed; prettier check clean on both files; eslint clean

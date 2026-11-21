---
phase: 100-game-page-without-the-menu
plan: 13
subsystem: ui
tags: [react, typescript, install-tab, row-action, location-row, gap-closure]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "100-11 LONG_RUNNING_CHANNELS for the shell; 100-12 RowFailure retryDisabled and the installTabRows.test.tsx harness"
provides:
  - "isInvokeTimeout, the 'release' row event and runRowAction/useRowAction stillRunning hand-off"
  - "Location row: no Move failure while moving, gate-aware Retry, non-sticky failures, no row without a folder"
  - "open gate on isInstalled alone (Open for installed third-party-managed games)"
affects: [100-14, 100-verification, game-page]

actuals:
  tokens: 7900
  tasks: 3
  commits: 6
plan_head_before: 489160dcd4b0a5b4a2744f98552f7d64b3f09b08
plan_head_after: deea8de90a50ddc8ce4e1acbcaff29601f8e95fb

tech-stack:
  added: []
  patterns:
    - "Hand-off over failure: a rejection that is only the transport giving up, while the game status still says the action runs, releases the row (busy -> idle) and logs at info level"
    - "Status read at rejection time via useLibraryState.getState(), not a render-time selector"

key-files:
  created: []
  modified:
    - src/frontend/screens/Game/GamePage/actions/rowAction.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/rowAction.test.ts
    - src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts
    - src/frontend/screens/Game/GamePage/actions/installActionGates.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx

key-decisions:
  - "Hand-off only when isInvokeTimeout(error) AND libraryStatus reads 'moving' for the appName at rejection time; every other rejection still fails the row (D-18, T-100-34)"
  - "Location row clears failures when either of its own actions starts and when install_path changes; a successful Verify does not clear a Move failure because that failure is still true (WR-04)"
  - "Open gate is isInstalled alone, restoring the deleted Browse Files; the browser-game input flag was removed rather than left dead (WR-02, D-14)"

requirements-completed: [D-01, D-10, D-11, D-12, D-14, D-18]

coverage:
  - id: D1
    description: "A move whose invoke times out while the game still reads moving is handed to the game status, with no Move failed text; a real rejection or a timeout after moving ended still fails with Retry"
    requirement: "D-18"
    verification:
      - kind: unit
        ref: "installTabRows.test.tsx#Location row (CR-02) hands a timeout over..., reports the same timeout..., reports a real rejection..."
        status: pass
      - kind: unit
        ref: "rowAction.test.ts#isInvokeTimeout, release reducer rows, runRowAction stillRunning"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Move failure is hidden while is.moving, and Retry is inert (aria-disabled plus gate reason) whenever the repeated action's gate is disabled"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "installTabRows.test.tsx#shows no Move failure while the game is moving...; makes the Move failure Retry inert...; carries the setFolder gate..."
        status: pass
    human_judgment: false
  - id: D3
    description: "Location failures are not sticky: starting one action clears the other's failure and a path change clears both"
    requirement: "D-12"
    verification:
      - kind: unit
        ref: "installTabRows.test.tsx#shows a Set-folder failure right after a Move failure; clears a Set-folder failure when a Move starts; clears a Move failure when the install path changes"
        status: pass
    human_judgment: false
  - id: D4
    description: "Installed third-party-managed (EA, Ubisoft) games keep a Location row with Open when they have a folder; no folder means no row"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "installActionGates.test.ts#Open shows for every installed game; installTabRows.test.tsx#keeps Open, without Move or Wrong folder...; renders no Location row..."
        status: pass
    human_judgment: false
  - id: D5
    description: "Observed behaviour in the running app (a real long move over the Rust shell, the Retry tooltip, Open on an EA game)"
    verification: []
    human_judgment: true
    rationale: "No jsdom and no live shell in unit tests; the real timeout path and the visual Retry state need a person in the app (covered by UAT items owned by 100-14)"

duration: 18min
completed: 2026-11-22
status: complete
---

# Phase 100 Plan 13: Location row truthful and safe Summary

**A move whose invoke times out while the game still reads "moving" is handed to the game status instead of reported as failed, the Location row's Retry obeys the gate of the action it repeats, failures clear when they stop being true, and Open returns for installed EA/Ubisoft games.**

## Performance

- **Duration:** about 18 min
- **Started:** 2026-11-21T18:12Z (approx.)
- **Completed:** 2026-11-21T18:31Z (2026-11-22 local)
- **Tasks:** 3 (1 tracer, 2 auto), all TDD
- **Files modified:** 8 (0 created)

## Accomplishments

- **Tracer (CR-02, D-18):** `isInvokeTimeout` accepts both the plain shell string `sidecar invoke timed out: <channel>` and an Error wrapping it. `rowActionReducer` gained `release` (busy to idle only). `runRowAction`/`useRowAction.run` take a `stillRunning` predicate; when it holds, a never-throwing `window.api.logInfo` line is written and the row is released. `useInstallLocationActions` passes `isInvokeTimeout(error) && isStatusMoving(appName)`, reading `useLibraryState.getState().libraryStatus` at rejection time. `LocationRow` shows no Move failure (message or Retry) while `is.moving`.
- **Retry gate and non-sticky failures (CR-02 Retry, WR-04, D-11, D-12):** both Location failure objects carry `retryDisabled`/`retryDisabledReason` from `gates.move` / `gates.setFolder`, so RowFailure's early return makes a Retry that the button itself would refuse inert. Starting Move dismisses the set-folder row and vice versa; a `useEffect` on `install.install_path` dismisses both.
- **Open for third-party-managed games (WR-02, D-14):** the gate is `open: unaffected(isInstalled)`; `isBrowserGame` was deleted from `InstallActionGateInput` and its one caller (it was read nowhere else). `LocationRow` computes the location first and returns null when the open gate is hidden or there is no folder.

## Task Commits

1. **Task 1 (tracer)** RED `d91a67d66` test, GREEN `e879ad70c` feat
2. **Task 2** RED `d0b6c700d` test, GREEN `a792981ce` feat
3. **Task 3** RED `01fc3f4a3` test, GREEN `deea8de90` feat

No REFACTOR commits were needed.

## TDD Gate Compliance

Each task has its `test(100-13)` commit before its `feat(100-13)` commit.

- **RED, Task 1:** 12 targeted failures across rowAction.test.ts and installTabRows.test.tsx. The reducer `release` rows and the "timeout handed off" / "failure hidden while moving" assertions failed on their planned `Expected/Received`; the `isInvokeTimeout` cases failed with "is not a function" because the export did not exist yet. Semantic assessment: every failing test is a target test failing for the planned reason (missing behaviour), not a syntax, fixture or zero-test fault; the three cases that describe unchanged behaviour (real rejection, timeout after moving ended, other-phase reducer rows) correctly passed.
- **RED, Task 2:** 5 targeted failures (retryDisabled "Expected: true, Received: undefined", sibling failure "Expected: false, Received: true", path change "Expected: false, Received: true"). Same assessment.
- **RED, Task 3:** 4 targeted failures (open gate "Expected: true, Received: false"; Location row "Received: null" for a managed game; a folderless game rendered a row instead of null).
- The RED evidence was inspected by hand from the jest output; `gsd_run check tdd-red-evidence` was not run (jest's default reporter is not one of its supported formats).
- **GREEN:** all targeted tests pass after each feat commit.

## Verification

- `pnpm exec jest --selectProjects Frontend --testPathPattern 'screens/Game'`: 53 suites, 821 tests pass.
- `pnpm codecheck`, `pnpm lint`: exit 0 (lint warnings are the existing baseline, 0 errors).
- `pnpm gameinfo-narrowing-ceiling`: PASS.
- `pnpm backend-di-ceilings --shard frontend-screens-game`: PASS (jestMock=87 across 22 files). No `jest.mock` was added to installTabRows.test.tsx (it keeps the three from 100-12). `node meta/backendDiCeilings.cjs` prints zero `FAIL:` lines for `src/frontend/`.
- `pnpm find-deadcode`: one finding, `meta/genStoreSchemas.ts` (types, Member). Pre-existing, from the other session's 85-08; not touched here and deferred.
- `npx prettier --check` over every written path per task: pass (each confirmed non-ignored with `--file-info` first).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test harness `useCallback` was a pass-through, which made the path-change effect fire on every render**
- **Found during:** Task 2 (GREEN)
- **Issue:** `withStoreHooks` returns `fn` from `useCallback` unmemoised, so the dismiss callbacks in the effect's deps changed each render and the recorded effect re-ran, clearing the failure the test was asserting on. Production `useCallback` is stable, so the hook is correct.
- **Fix:** gave the react mock in installTabRows.test.tsx a slot-based `useCallback` memoised per deps (no `jest.mock` added).
- **Files modified:** installTabRows.test.tsx
- **Commit:** a792981ce

**2. [Rule 1 - Bug] The first draft of the path-change test flushed the mount effect after the failure existed**
- **Found during:** Task 2 (GREEN)
- **Issue:** the queued first-render effect ran after the move had already failed and dismissed it.
- **Fix:** flush the mount effect before the failure is created, then assert the failure survives a no-op flush and clears only on a changed `install_path`.
- **Commit:** a792981ce

**Total deviations:** 2 auto-fixed (1 blocking harness, 1 test bug). **Impact:** test-only, no production change from the plan.

Note: the plan's convention says installTabRows.test.tsx keeps exactly two `jest.mock(` calls; per the 100-12 hand-off it has three (a WhatsNewLink stub), and that count is unchanged by this plan.

## Authentication Gates

None.

## Issues Encountered

- `pnpm find-deadcode` reports the known knip finding in `meta/genStoreSchemas.ts` (pre-existing, other session's 85-08). Deferred, not fixed.
- Jest prints `[tauriWindowChrome]` warnings from the shared window shim while running the Install-tab suite. Pre-existing noise, tests pass.

## Known Stubs

None.

## Threat Flags

None. T-100-33 (duplicate move via Retry) and T-100-34 (hand-off hiding a real failure) are mitigated as planned; T-100-35 (Open) is accepted: it restores what the deleted Browse Files did with no new input.

## State tracking

Per the run's sequential-execution instructions, `.planning/STATE.md`, `.planning/state.json` and `.planning/ROADMAP.md` were not touched and no `state.*` / `roadmap.*` verbs were run; the orchestrator owns tracking writes for this out-of-band phase. REQUIREMENTS.md was not modified.

## Self-Check: PASSED

- All eight modified files exist and every task commit is an ancestor of HEAD (checked below at write time).
- `commits: 6` measured with `git rev-list --count 489160dcd..HEAD` against the ledger base.

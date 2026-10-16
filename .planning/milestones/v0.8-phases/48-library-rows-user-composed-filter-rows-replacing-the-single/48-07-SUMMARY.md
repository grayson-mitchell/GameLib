---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 07
subsystem: ui
tags: [react, focus-row, migration, config-store, jest, gap-closure]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: "focusRow state, migrateFocusRowSelection, handleFocusRow, the FocusRowStrip selectors (48-02, 48-05)"
provides:
  - "seedFocusRowFromMirror + hydrateFocusRowSelection: the migrated legacy focusRow reaches the renderer on first launch and is persisted so the seed runs once"
  - "WR-01 four-view whitelist and WR-02 present-key-is-authoritative rule"
  - "CR-01 regression test over the real GlobalConfigV0 / configStore / requestAppSettings / setSetting path"
  - "recently_played_installed operator ruling recorded as a verification override"
affects: [48-08 live gates, phase 48 re-verification]

actuals:
  tokens: 14000
  tasks: 3
  commits: 6
plan_head_before: 752b510f8640986f9ba690c957b4ad5bb4a9d7ea
plan_head_after: 025f3a94db127537e97c87575b428705e7a90496

tech-stack:
  added: []
  patterns:
    - "Renderer seeds synchronously from the store mirror, then fetches the backend-derived value once while the mirror lacks the key and writes it back through the one setter"
    - "Real-read-path regression test: jest.isolateModules per launch, disk as the only carried state, no mock of config/configStore/store_backend/settingsFlowRegistration/platform"

key-files:
  created:
    - src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts
    - src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/deferred-items.md
  modified:
    - src/common/focusRowMigration.ts
    - src/frontend/state/GlobalState.tsx
    - src/common/__tests__/focusRowMigration.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-VERIFICATION.md
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-REVIEW-DISPOSITION.md

key-decisions:
  - "Option (a) from the verifier: hydrate in the renderer from requestAppSettings and persist through the existing setSetting path, rather than having the backend write into the mirror (boot ordering unproven)"
  - "A present focusRow key is authoritative on both sides (backend migrate and renderer seed), valid or not; invalid becomes null and never reaches the libraryTopSection switch"
  - "FOCUS_ROW_VIEW_VALUES duplicated in src/common on purpose (cannot import LibraryView); anti-drift is a compile-time satisfies Record<LibraryView, true> in the selector test"

patterns-established:
  - "hydrateFocusRowSelection never rejects, so the caller may void it; hasUserPicked is checked after the await"

requirements-completed: [R7, R1]

duration: 21min
completed: 2026-10-07
status: complete
---

# Phase 48 Plan 07: First-launch focusRow hydration (CR-01, WR-01, WR-02) Summary

**The legacy libraryTopSection seed now reaches the renderer on the first upgraded launch via a one-time hydrate-and-persist from requestAppSettings, with a present focusRow key authoritative and only the four real views valid.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-07T04:25:55Z
- **Completed:** 2026-10-07T04:47:15Z
- **Tasks:** 3 (tracer, auto, auto)
- **Files modified:** 10 (7 source/test, 2 planning records, 1 new deferred-items file)

## Accomplishments

- CR-01 closed at the desk. `seedFocusRowFromMirror` returns `{ focusRow: null, needsMigratedValue: true }` for a mirror with no `focusRow` key, and `GlobalState.componentDidMount` then runs `hydrateFocusRowSelection`, which applies the backend-migrated value and writes it (null included) through the real `setSetting` listener. That write lands the key in BOTH `store/config.json` `settings` and `config.json` `defaultSettings`, so launch 2 seeds synchronously and the legacy field is never read again.
- The regression test drives the REAL `GlobalConfigV0.getSettings`, `configStore`, `requestAppSettings` handler and `setSetting` listener over a legacy fixture, one fresh module graph per launch. Cases: `recently_played` (recentlyPlayed view), `favourites` (favourites view), `disabled` (null), clear-then-relaunch stays cleared, R1 collection pick round-trips, plus the CR-01 control that reproduces the pre-fix outcome. Prohibitions asserted: `games.customCategories` and `games.recent` deep-equal after hydration.
- WR-02: a present `focusRow` key, valid or not, never consults `libraryTopSection`. WR-01: `{ kind: 'view', value }` validates only for `all | installed | recentlyPlayed | favourites`, so an unknown view renders no strip instead of all games.
- The `recently_played_installed` operator ruling is recorded as an `overrides:` entry in `48-VERIFICATION.md`; CR-01/WR-01/WR-02 are `fixed` in `48-REVIEW-DISPOSITION.md` (`open: 4`).

## Task Commits

1. **Task 1 (tracer, TDD): legacy profile to renderer focusRow on first launch**
   - RED `c67afd200` (test): failing real-read-path test, with pre-fix skeleton exports so it fails on assertions
   - GREEN `d7d27c89b` (fix): seed + hydrate implemented, GlobalState wired, source-text gate with anti-vacuity self-test
2. **Task 2 (TDD): WR-02 present key never re-seeds, WR-01 four-view whitelist**
   - RED `d04553113` (test): 8 failing assertions across Common and Frontend
   - GREEN `013984a9d` (fix): `FOCUS_ROW_VIEW_VALUES` + present-key rule
3. **Task 3: override, disposition, regression battery**
   - `025f3a94d` (docs): override entry, dispositions
   - `83c9f6761` (fix): battery fallout, see Deviations

**Plan metadata:** the commit carrying this SUMMARY, STATE.md, ROADMAP.md and `deferred-items.md`.

The tracer gate: tracer `<verify>` is automated-only and re-ran green (Backend 6/6, Frontend gate 3/3, Common, codecheck, prettier) before Task 2 started; logged `Tracer verified end-to-end, expanding`.

## Files Created/Modified

- `src/common/focusRowMigration.ts` - seed, hydrate, whitelist, present-key rule, two-store-hazard docstring
- `src/frontend/state/GlobalState.tsx` - module-scope `focusRowMirrorSeed`, `focusRowPickedThisSession`, guarded hydrate call in `componentDidMount`
- `src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts` - CR-01 regression over the real read path (first assertion is a tmpdir containment guard)
- `src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts` - wiring gate plus negative and positive self-tests
- `src/common/__tests__/focusRowMigration.test.ts`, `.../FocusRowStrip/__tests__/focusRowSelectors.test.ts` - inverted WR-02 case, seed and hydrate edge cases, `satisfies Record<LibraryView, true>` anti-drift
- `src/backend/sidecar/__tests__/testContainment.test.ts` - classify the new suite
- `48-VERIFICATION.md`, `48-REVIEW-DISPOSITION.md` - planning records (prettier-ignored, confirmed with `--file-info`, so no `--check`)

## Decisions Made

See `key-decisions`. The one-time visible cost is accepted per the plan: on the single first upgraded launch the strip appears after one IPC round trip instead of on first paint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Classify the new suite in testContainment Block C**
- **Found during:** Task 3 (regression battery)
- **Issue:** `testContainment.test.ts` T-34.2-83 requires every `*.test.ts` in `src/backend/sidecar/__tests__` to be named in one of two lists; the new suite was unclassified. Red when re-run alone, so this plan's defect, not a flake.
- **Fix:** added `focusRowFirstLaunchHydration.test.ts` to `STRUCTURALLY_CONTAINED_SUITES` with a docstring paragraph recording the different basis (it writes files, but only inside the Backend containment redirection plus its own tmpdir guard).
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts` (not in the plan's `files_modified`)
- **Committed in:** `83c9f6761`

**2. [Rule 1 - Bug] Unused `join` import in the new test (lint error, tests-scope ceiling)**
- **Found during:** Task 3 (`pnpm lint`)
- **Fix:** removed the import.
- **Committed in:** `83c9f6761`

**3. [Rule 1 - Bug] `FocusRowMirrorSeed` exported but only used in-module (find-deadcode ledger change)**
- **Found during:** Task 3 (`pnpm find-deadcode`)
- **Issue:** the plan's artifact table lists it as an exported interface, but nothing imports it; the gate forbids a new used-in-module finding.
- **Fix:** dropped the `export` keyword (option (b) in the gate's own guidance). The function's return type is still structurally visible to callers.
- **Committed in:** `83c9f6761`

**4. [Rule 3 - Blocking] Extractor bracket handling in the new source gate**
- **Found during:** Task 1 GREEN
- **Issue:** `extractBalanced(..., 'hydrateFocusRowSelection(', '(', ')')` skipped the marker's own `(` and mis-measured. Fixed to treat a marker ending in the open bracket as owning it. Same file, same commit as Task 1 GREEN.

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bug). **Impact:** none on behaviour; all are gate fallout from adding a suite and an export.

## Issues Encountered

- **Pre-existing red, out of scope:** `src/frontend/screens/Login/__tests__/overlayDismiss.test.ts` fails alone (`Login/index.tsx:310` renders `dismiss={dismissLoginOverlay}`; last touched by quick task 261003-u48, before the dispatch base). 48-07 touches nothing under `Login`. Logged in `deferred-items.md`, not fixed.
- **Parallel-load flakes, each re-run alone and green:** across three full Backend runs a different single suite went red each time (`appShellFlows`, `sidecarRejectionGuard`); both pass alone (47/47, 41/41). The first Backend run's red was `testContainment` (real, fixed above).

## Regression battery (final state)

- Common: 7 suites, 151 tests, 0 failed.
- Backend: 234 suites, 5284 passed, 3 skipped, 1 failed (parallel-load flake `sidecarRejectionGuard`, 41/41 alone). Touched suites alone: `focusRowFirstLaunchHydration` 6/6, `testContainment` + `fakeHomeIsolation` 68/68 combined.
- Frontend: 197 suites, 3408 passed, 1 failed (`overlayDismiss`, pre-existing, see above). `GlobalStateFocusRowHydration` 3/3, `focusRowSelectors` 31/31.
- Meta: 46 suites, 1357 passed, 1 skipped, 0 failed (after the dead-export fix; the first Meta run was red on `findDeadcode`).
- `pnpm codecheck`, `pnpm lint` (production PASS, tests PASS), `pnpm find-deadcode` (46 OK / 0 OK), `pnpm planning-gates` (12/12): all exit 0.
- Scoped `npx prettier --check` over every `src/` path written: clean.

## Known Stubs

None.

## Threat Flags

None. T-48-20..24 are mitigated as planned: every persisted or IPC value passes `isValidFocusRowSelection`, `hydrateFocusRowSelection` never rejects, `hasUserPicked` is checked after the await, and the new test asserts `configPath`/mirror path resolve under `os.tmpdir()` before any write.

## Live gate owed

Unit and desk proof only. The live round trips through the running app (R7 migration with `favourites`, `recently_played`, `disabled`; R1 collection pick through quit and relaunch; the one-IPC-round-trip pop-in on the first upgraded launch) are planned in **48-08**, which depends on this plan. The commits the disposition record cites: CR-01 `d7d27c89b`, WR-01 and WR-02 `013984a9d`.

## Next Phase Readiness

Ready for 48-08 (live gates) against a build carrying commits `c67afd200..025f3a94d` plus this metadata commit. Re-verification will read the override and should score the `recently_played_installed` criterion PASSED (override).

## Self-Check: PASSED

- Created files exist: both new test files, `deferred-items.md`.
- Commits `c67afd200`, `d7d27c89b`, `d04553113`, `013984a9d`, `83c9f6761`, `025f3a94d` present in `git log`.
- All Task 1/2/3 acceptance criteria re-run green (the `overlayDismiss` and parallel-load reds are outside them and documented).

---
*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Completed: 2026-10-07*

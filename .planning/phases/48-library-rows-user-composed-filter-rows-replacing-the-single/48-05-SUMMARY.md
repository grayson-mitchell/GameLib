---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 05
subsystem: config
tags: [migration, settings, typescript, focus-row, config]

requires:
  - phase: 48-02
    provides: "`FocusRowSelection`, `isValidFocusRowSelection`, the `focusRow` GlobalConfig key and `handleFocusRow`"
provides:
  - "`migrateFocusRowSelection`: a pure, total, idempotent, presence-guarded seed from the retired `libraryTopSection`"
  - "`isValidFocusRowSelection` with exactly one definition (`src/common/focusRowMigration.ts`), re-exported from `focusRowSelectors.ts`"
  - "The Settings `Library Top Section` dropdown and all frontend state behind it removed"
affects: [48-06]

actuals:
  tokens: 6282 # chars/4 over `git diff 0586d626e..HEAD -- src meta` (25127 bytes)
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 0586d626e6e4ae64bc15df285d0917f361a87991
plan_head_after: be449311b030d1f4f8748acd35b41259a311b298

tech-stack:
  added: []
  patterns:
    - "Presence-guarded legacy seed: `'focusRow' in stored` (not a value comparison) so a present `null` is a deliberate clear that permanently disarms the seed."
    - "Raw-object derivation as the LAST property of the `getSettings()` merge, extending the existing `trayIconVariant` precedent comment instead of adding a second one."

key-files:
  created:
    - src/common/focusRowMigration.ts
    - src/common/__tests__/focusRowMigration.test.ts
    - .planning/todos/pending/2026-10-05-orphaned-library-top-section-locale-keys-removal-needs-a-decision.md
  modified:
    - src/backend/config.ts
    - src/common/types.ts
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts
    - src/frontend/screens/Library/engineWiring.ts
    - src/frontend/screens/Library/__tests__/engineWiring.test.ts
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/types.ts
  deleted:
    - src/frontend/screens/Settings/components/LibraryTopSection.tsx

key-decisions:
  - "Task 1 operator ruling: `recency`. `recently_played_installed` migrates to `{ kind: 'view', value: 'recentlyPlayed' }` (recency kept, the installed-only qualifier dropped). Reason, as given by the plan and accepted by the operator: the pick's defining character is recency and that survives; the migration table stays total and the persisted shape stays clean (no modifier field on `FocusRowSelection`); installed-only content remains reachable through the grid's own `Installed` view. Seed table confirmed as written: `recently_played` -> recentlyPlayed view; `favourites` -> favourites view; `disabled` / absent / unrecognised -> `null`."
  - "A present-but-invalid `focusRow` falls through to the legacy derivation instead of being returned, so an invalid value can never reach the renderer."
  - "`LibraryTopSectionOptions` is no longer exported from `common/types.ts`; it stays declared only so `AppSettings.libraryTopSection` types the legacy on-disk value."

requirements-completed: [R7]

duration: 9min
completed: 2026-10-05
status: complete
---

# Phase 48 Plan 05: Retire Library Top Section and seed the focus row once Summary

**The `Library Top Section` dropdown and its frontend state are gone, and a presence-guarded pure `migrateFocusRowSelection` seeds `focusRow` from the legacy value as the last property of the raw-object `getSettings()` merge, so a user who clears the row is never re-seeded.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 3/3 completed (Task 1 resolved by the orchestrator-relayed operator ruling, not executed)
- **Files:** 10 modified, 3 created, 1 deleted

## Accomplishments

- `migrateFocusRowSelection(stored)`: a present `focusRow: null` wins over any legacy value (the suite's first test); a present valid selection is returned unchanged; a present-but-invalid one falls through to the legacy derivation; `recently_played` and `recently_played_installed` -> recentlyPlayed view, `favourites` -> favourites view, everything else (including non-strings, `null`, `undefined`, `{}`) -> `null`, never a throw. Idempotent for all five legacy inputs. Carries an all-caps `ORDERING TRAP` note that names the factory `focusRow: null` as the reason the merged object is unusable as input, and why that is a sharper trap than the tray-icon one (the default is indistinguishable from a deliberate clear).
- `config.ts`: `focusRow: migrateFocusRowSelection(defaultSettings)` is the last property of the merge, after `trayIconVariant`, reading the raw on-disk object. The existing ordering comment was extended into one note covering both derivations. `libraryTopSection: 'disabled'` stays in `getFactoryDefaults()`.
- `isValidFocusRowSelection` moved into `src/common/focusRowMigration.ts` (a `src/common` module cannot import `src/frontend`) and re-exported from `focusRowSelectors.ts`: one definition in the tree.
- `LibraryTopSection.tsx` deleted with its barrel export and render site; `MaxRecentGames` lines untouched for 48-06 (barrel 1 hit, `GeneralSettings` 2 hits).
- `engineWiring.ts`'s `buildEngineDeps` comment now cites `focusRow: null` (no focus row) as the default-install evidence, keeping the `must not be derived from the display memo` reasoning; the test comment and the stale test name were updated the same way.
- A `ready: human` todo records the orphaned-locale-key removal decision (and 48-06's `setting.maxRecentGames`) with the three measured traps. The 47 catalogues still carry `library_top_section`.

## Task Commits

1. **Task 1:** no commit. `checkpoint:decision` resolved by the operator ruling above.
2. **Task 2 RED:** `a7d77753a` (test) - 21 cases against a stub returning `null` / `false`; 6 failed on assertions, 15 passed against the stub for coincidental reasons (the `null`-expecting cases)
3. **Task 2 GREEN:** `8af7225b3` (feat) - implementation, guard move, merge wiring; 21/21
4. **Task 3:** `be449311b` (feat) - dropdown retirement, comment correction, deadcode fix, todo

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dead `libraryTopSection` context plumbing survived the plan's file list**
- **Found during:** Task 3 (legacy-key census gate)
- **Issue:** The plan said 48-02 "handled" `GlobalState.tsx`, `ContextProvider.tsx` and `frontend/types.ts` by adding the `focusRow` pair alongside, but the legacy `libraryTopSection` state, `handleLibraryTopSection` handler and context entries were still there, read by nothing once the dropdown is deleted. The plan's own census gate allows `libraryTopSection` hits only in four migration-only files, so it would fail with `STRAY REFERENCE`.
- **Fix:** Removed the state field, initialiser, handler, context value and `LibraryTopSectionOptions` imports from those three files. Reworded the `handleFocusRow` comment, which compared itself to the deleted handler.
- **Files modified:** `src/frontend/state/GlobalState.tsx`, `src/frontend/state/ContextProvider.tsx`, `src/frontend/types.ts`
- **Commit:** `be449311b`

**2. [Rule 3 - Blocking] `findDeadcode` Meta test went red on `LibraryTopSectionOptions`**
- **Found during:** Task 3 (explicit Meta run)
- **Issue:** With its only importer gone, `LibraryTopSectionOptions` became a `used-in-module` finding (`1 FAIL`, `NEW ... src/common/types.ts LibraryTopSectionOptions`).
- **Fix:** Dropped the `export` keyword (the remedy the baseline file itself names) and left a comment saying why the type is still declared. Chosen over a baseline entry because the baseline is for deliberate ledgering and the export is unnecessary.
- **Files modified:** `src/common/types.ts`
- **Commit:** `be449311b`

**3. [Rule 1 - Bug] The plan's inverted locale-key gate pattern cannot match nested JSON**
- **Found during:** Task 3
- **Issue:** The gate greps for the literal `setting.library_top_section`, but the catalogues nest it (`"setting": { "library_top_section": ... }`), so the dotted form matches nothing and the gate reads `0` and would report the keys as removed when they are intact.
- **Fix:** Verified the intent with `git grep -l '"library_top_section"' -- public/locales` instead: 47 catalogues still carry the key. No locale file was touched.
- **Commit:** none (verification-only)

**4. [Rule 1 - Bug] Plan-step mismatch: `Library/index.tsx:101` destructure was already gone**
- **Found during:** Task 3
- **Issue:** `libraryTopSection` had no remaining hit in `Library/index.tsx`, so there was nothing to remove there. The `KNOWN NUANCE` block is intact (1 hit).
- **Fix:** None needed.

**Total deviations:** 4 (2 x Rule 3, 2 x Rule 1 including one no-op). No scope creep: every removal is a consumer of the retired setting.

## TDD Gate Compliance

`workflow.tdd_mode` is not enabled, but Task 2 was run RED then GREEN as separate `test(48-05)` and `feat(48-05)` commits. The RED commit also carries a stub `focusRowMigration.ts` that returns `null` / `false` so the suite failed on assertions rather than module resolution; 6 of 21 failed and the other 15 passed against the stub for coincidental reasons (the `null`-expecting cases, including the headline presence-guard case, which a stub returning `null` also satisfies). That is weaker evidence than a fully failing RED and is stated here rather than implied away. The presence-guard test is therefore protected against a `??` implementation by the `present valid focusRow is returned unchanged` and `present but invalid focusRow falls through` cases rather than by its own RED. No `tdd-red-evidence` record was persisted.

## Live gate owed

Unit-proven only; the round trip through a real `config.json` is not:

1. A real pre-upgrade profile with `libraryTopSection: favourites` and no `focusRow` key actually shows a Favourites focus row on first launch.
2. Clearing the row and relaunching leaves it off (the cleared `focusRow: null` reaches disk through `setSetting` and is then present on the next read).
3. A `recently_played_installed` profile shows an unfiltered recently-played row, per the ruling.

One mechanism worth confirming live: until a `focusRow` key is first written, the seed is re-derived on every launch (it is "once" in effect, not in a persisted flag). That is harmless for the four legacy values because the output is stable, and the first user pick or clear writes the key and ends it.

## Known Stubs

None.

## Threat Flags

None. No network, auth or new persisted surface beyond the one `focusRow` key plan 48-02 already introduced. T-48-13 (total, five degenerate inputs tested), T-48-14 (comment-filtered merge-order gate prints `MERGE ORDER OK`), T-48-15 (`in` guard, first test) and T-48-16 (locale keys left in place, todo filed) are handled as planned.

## Verification

- `npx jest --selectProjects Common --testPathPattern "focusRowMigration|trayIconVariant"`: 2 suites, 35 tests, 0 failed.
- `npx jest --selectProjects Backend --testPathPattern config`: 2 suites, 54 tests, 0 failed.
- `npx jest --selectProjects Frontend`: 188 suites, 3293 tests, 0 failed.
- `npx jest --selectProjects Meta` (explicit): 46 suites, 1347 passed, 1 skipped, 0 failed (after the `findDeadcode` fix above).
- Merge-order gate: `MERGE ORDER OK`. Legacy-key census: 0 stray references. Locale keys: 47 catalogues intact.
- `pnpm planning-gates`: 12/12 passed, including the todo-frontmatter gate over the new todo.
- `pnpm codecheck`: exit 0. `pnpm lint`: exit 0, `production: PASS | tests: PASS`.
- `npx prettier --check` over the exact `src/**` paths written: clean. Not run over the new `.planning/todos/pending/*.md` (prettier-ignored, would be a vacuous pass).

## Next Phase Readiness

Ready for 48-06, which owns the `MaxRecentGames` lines in the Settings barrel and `GeneralSettings`; both are untouched here.

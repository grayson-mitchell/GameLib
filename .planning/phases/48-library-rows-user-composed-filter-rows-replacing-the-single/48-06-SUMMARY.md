---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 06
subsystem: settings
tags: [settings, dead-code, recent-games, typescript, removal]

requires:
  - phase: 48-02
    provides: "FOCUS_ROW_MAX_CARDS display cap and the deletion of RecentlyPlayed/index.tsx, the only requestAppSettings() reader of the removed setting"
  - phase: 48-05
    provides: "LibraryTopSection lines already removed from the Settings barrel and GeneralSettings, so this plan touches those two files without overlap"
provides:
  - "No `Recent Games to Show` control in Settings and no `maxRecentGames` token anywhere in src/ or meta/"
  - "getRecentGames() takes no parameters and returns the full stored list; setRecentGames is its unchanged sole writer"
affects: []

actuals:
  tokens: 1987 # chars/4 over `git diff 63efb666d..HEAD -- src meta` (7947 bytes)
  tasks: 1
  commits: 1
commits: 1
plan_head_before: 63efb666dd46a4e18178261378e2034721830815
plan_head_after: 9699642563a5cbb8338d116ab097c91d35eb186a

tech-stack:
  added: []
  patterns:
    - "Source-gate comment-stripping: a gate that names a token must run over comment-stripped source, and a comment recording a removal must avoid the token itself when a raw `git grep` census also gates the tree."

key-files:
  created: []
  modified:
    - src/backend/recent_games/recent_games.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/common/types.ts
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  deleted:
    - src/frontend/screens/Settings/components/MaxRecentGames.tsx

key-decisions:
  - "No storage bound on games.recent: the operator ruling on R6 stands. The stored list was unbounded before and is unbounded now, and setRecentGames is byte-unchanged."
  - "The stored maxRecentGames key in existing config.json files is left in place as an inert unread property; nothing writes to user config."
  - "The orphaned setting.maxRecentGames locale key is left in all 47 catalogues, same as the library_top_section keys; the ready: human todo from 48-05 already covers it."

requirements-completed: [R6]

duration: 5min
completed: 2026-10-05
status: complete
---

# Phase 48 Plan 06: Remove the Recent Games to Show control Summary

**The `Recent Games to Show` Settings control, the dead limit helper, the dead `limited` branch, the dead parameter and `AppSettings.maxRecentGames` are removed; `games.recent` is still written by one unchanged, unbounded function.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-05T04:43:19Z
- **Completed:** 2026-10-05T04:47:11Z
- **Tasks:** 1/1
- **Files:** 6 modified, 1 deleted

## Accomplishments

- `MaxRecentGames.tsx` deleted, with its barrel export and its `GeneralSettings` import and render site.
- `recent_games.ts`: the `maxRecentGames()` helper, the `if (options?.limited)` branch, the `options?` parameter and the then-unused `GlobalConfig` import are gone. `getRecentGames` is now `async () => configStore.get('games.recent', [])`. Zero-caller census recorded in the commit body and in the file: `git grep -nE 'getRecentGames\(\s*\{' -- src/` and `git grep -nE '\blimited\s*:' -- src/` both returned 0 hits.
- The old ts-prune comment, which described a binding that no longer exists, is replaced by a note recording what was removed, that the stored list was never bounded by it, and that a storage cap was considered and declined by operator ruling. It points a reader at `FOCUS_ROW_MAX_CARDS` as the only surviving cap, a display cap.
- `AppSettings.maxRecentGames` removed from `src/common/types.ts`.
- The two stale comments in `enrichmentFlowRegistration.ts` now list the real export surface (`getRecentGames`, `addRecentGame`, `removeRecentGame`) and keep the D-04 curated-import discipline.
- Byte identity: a sha256 of the `setRecentGames`, `addRecentGame` and `removeRecentGame` bodies, taken before the first edit and again after, is identical. `public/locales/en/translation.json` digest unchanged.

## Task Commits

1. **Task 1: Remove the control, the dead helper, the dead branch, the dead parameter and the dead type field** - `969964256` (feat)

**Plan metadata:** the docs commit following this summary.

## Decisions Made

- No bound is introduced on the stored list, per the operator ruling in the plan. `grep` for `.slice(`, `.splice(`, `FOCUS_ROW_MAX_CARDS` and `RECENT_GAMES_LIMIT` over the comment-stripped file finds nothing, and the file still has exactly one `configStore.set(`.
- The inert `maxRecentGames` key in existing users' `config.json` is deliberately not deleted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A stale comment in `focusRowSelectors.ts` still named the removed setting**
- **Found during:** Task 1 (the `maxRecentGames` census)
- **Issue:** `focusRowSelectors.ts:27`, written by plan 48-02, said the cap was "independent of the user's `maxRecentGames` setting". That file is not in this plan's `files_modified`, but the plan's headline gate requires zero `maxRecentGames` hits across all of `src` and `meta` (raw `git grep`, not comment-stripped), so it would have failed.
- **Fix:** Reworded the two comment lines to say the cap is independent of any user setting and that the old lane's user-chosen count was not carried forward and has since been removed. No code changed.
- **Files modified:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts`
- **Commit:** `969964256`

**2. [Rule 1 - Bug] Plan text miscounted `curated-import`**
- **Found during:** Task 1 (acceptance criteria)
- **Issue:** The criterion says `grep -c 'curated-import'` in `enrichmentFlowRegistration.ts` is "still 2". It was 3 at HEAD (a third mention at line 138 mirrors the discipline in an unrelated block), and is 3 now.
- **Fix:** None needed. The intent, that the discipline survives, holds: the count is unchanged from before the edit.
- **Commit:** none (verification-only)

**Total deviations:** 2 (1 x Rule 3, 1 x Rule 1 no-op). No scope creep: the one edit outside the plan's file list is a comment naming the removed setting.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. No network, auth or persisted surface. T-48-17 is discharged by the comment-stripped source gate (`RECENT GAMES FILE CONTRACT OK`) and the unchanged function-body digest; T-48-18 and T-48-19 are accepted as planned.

## Open observations

- **Live gate owed, not claimed here:** that Settings -> General renders correctly with both the `Library Top Section` and `Recent Games to Show` controls gone and no visible gap where they sat. Two deletions from a render block read fine in source and can still leave a hole.
- The orphaned `setting.maxRecentGames` key remains in 47 catalogues (and `public/locales/en/translation.json:958`). Its removal is covered by the existing `ready: human` todo filed in plan 48-05.

## Verification

- `git grep -n maxRecentGames -- src meta`: 0 hits. `grep -rl 'Recent Games to Show' src/`: nothing.
- Comment-stripped contract gate on `recent_games.ts`: `RECENT GAMES FILE CONTRACT OK`; one `configStore.set(`; one `export {`; `evict|bound|cap` count 0.
- `npx jest --selectProjects Backend`: 222 suites, 5160 passed, 3 skipped, 0 failed.
- `npx jest --selectProjects Frontend`: 188 suites, 3293 passed, 0 failed.
- `npx jest --selectProjects Common`: 6 suites, 130 passed, 0 failed.
- `npx jest --selectProjects Meta` (explicit): 46 suites, 1347 passed, 1 skipped, 0 failed.
- `pnpm codecheck`: clean. `pnpm lint`: `production: PASS | tests: PASS`. `pnpm find-deadcode`: `unreachable: 46 OK | used-in-module: 0 OK`, no finding in `recent_games.ts`. `pnpm lint-translations`: `0 hard failures`.
- Inverted locale gate: `"maxRecentGames"` still present in 47 catalogues; `translation.json` digest `OK`.
- `npx prettier --check` over the six exact `src/**` paths written: clean.

## Next Phase Readiness

Last plan of wave 4. R6 is discharged as amended. The live-gate items in this summary and in 48-05's `## Live gate owed` remain open for phase verification.

## Self-Check: PASSED

- `src/frontend/screens/Settings/components/MaxRecentGames.tsx` absent from the tree; `969964256` present on `quick-261002-b63`.

---
phase: quick-260815-bjr
plan: 01
subsystem: bugfix
tags: [rosetta, macos, console-mode, hidden-games, epic, legendary, i18n, jest]

# Dependency graph
requires: []
provides:
  - "checkRosettaInstall() that resolves instead of rejecting when the arch spawn fails, showing the Rosetta warning dialog on Apple Silicon without Rosetta"
  - "selectConsoleGames() — extracted, side-effect-free Console mode grid filter that also respects hiddenGames.list"
  - "es -> es-ES language remap for Epic store-content metadata requests"
affects: [console-mode, macos-onboarding, epic-store-metadata]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Side-effect-free selectors module (selectors.ts) extracted from a component with scss/png imports, so the grid filter is unit-testable under node-environment jest without moduleNameMapper"

key-files:
  created:
    - src/backend/__tests__/checkRosettaInstall.test.ts
    - src/frontend/screens/ConsoleMode/selectors.ts
    - src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts
  modified:
    - src/backend/utils.ts
    - src/frontend/screens/ConsoleMode/index.tsx
    - src/backend/storeManagers/legendary/games.ts

key-decisions:
  - "Fix 2 was hand-merged rather than cherry-picked: GameLib's ConsoleMode/index.tsx carries a steam.library spread and an is_delisted (GAP-B) exclusion not present upstream; both were preserved verbatim in the new selectors.ts"
  - "No new test for Fix 3 (es-ES remap): getExtraFromAPI is a private, single-caller method whose two sibling remaps (pt->pt-BR, zh_Hans->zh-CN) already have no coverage; adding coverage for only the new line would be disproportionate and was explicitly out of scope per the plan"

requirements-completed: [PORT-2.22.1-01, PORT-2.22.1-02, PORT-2.22.1-03]

# Metrics
duration: ~20min
completed: 2026-08-15
---

# Quick Task 260815-bjr: Port Heroic v2.22.1 Fixes Summary

**Ported three upstream Heroic v2.22.1 fixes: Rosetta-check crash fix, Console mode hidden-games exclusion, and Epic es-ES store-metadata locale mapping — with first-ever regression coverage for both the Rosetta check and the Console mode grid filter.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-15
- **Tasks:** 3/3 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `checkRosettaInstall()` no longer reads/parses `stdout`; it derives Rosetta availability solely from whether the `arch -x86_64 ...` spawn resolves or rejects, so a rejecting spawn (Rosetta not installed) now resolves the function and shows the "install Rosetta" dialog instead of escaping as an unhandled promise rejection from the un-awaited call in `main.ts`.
- Console mode's grid-eligibility filter was extracted into a new, side-effect-free `selectConsoleGames()` in `selectors.ts` and wired to also exclude games present in `hiddenGames.list`, closing a privacy/UX leak where hidden games still appeared in Console mode. GameLib's pre-existing `is_delisted` (GAP-B) and `thirdPartyManagedApp`/`is_dlc` exclusions were preserved.
- Epic store-content metadata requests for the Spanish locale now request `es-ES` instead of the raw `es` config value, matching the existing `pt`->`pt-BR` and `zh_Hans`->`zh-CN` remaps.
- Added `src/backend/__tests__/checkRosettaInstall.test.ts` (3 tests: rejecting spawn resolves + shows dialog, succeeding spawn resolves + no dialog, empty-stdout succeeding spawn does not throw) and `src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts` (6 tests covering hidden-list exclusion/pass-through/no-op-on-unknown-appName, the pre-existing DLC/third-party/delisted exclusions, and app_name-not-title identity).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix the Rosetta check crash (upstream 9a1b0af1c)** - `f30c1f552` (fix)
2. **Task 2: Exclude hidden games from Console mode (upstream 13d45f47a, hand-merged)** - `66cf3baf4` (fix)
3. **Task 3: Map Spanish to es-ES for Epic store metadata (upstream 4bccba197)** - `5ea69163b` (fix)

_No TDD-multi-commit tasks; each task's test(s) and implementation landed in a single commit per the plan's atomic-commit-per-fix instruction._

## Files Created/Modified
- `src/backend/utils.ts` - `checkRosettaInstall()` now derives `result` from `execAsync(...).then(() => true).catch(() => false)` instead of parsing `stdout`
- `src/backend/__tests__/checkRosettaInstall.test.ts` - regression coverage for the rejecting-spawn, succeeding-spawn, and empty-stdout cases, driving the real exported function through a mocked `child_process.exec`
- `src/frontend/screens/ConsoleMode/selectors.ts` - new module exporting `selectConsoleGames(all, hiddenGames)`, the single console-grid eligibility filter (DLC, third-party-managed, delisted, hidden)
- `src/frontend/screens/ConsoleMode/index.tsx` - destructures `hiddenGames` from `ContextProvider`, imports and calls `selectConsoleGames(all, hiddenGames.list)` in the `allGames` `useMemo`, adds `hiddenGames` to that memo's dependency array
- `src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts` - 6 tests against the real `selectConsoleGames` production function
- `src/backend/storeManagers/legendary/games.ts` - `getExtraFromAPI` gains a third `if (lang === 'es') { lang = 'es-ES' }` remap alongside the existing `pt` and `zh_Hans` remaps

## Decisions Made
- Fix 2 hand-merged (not cherry-picked) because `ConsoleMode/index.tsx` has diverged from the Heroic fork base (`steam.library` spread + `is_delisted`/GAP-B clause); both divergences were preserved in the new `selectors.ts`.
- No new automated test for Fix 3 — the plan explicitly scoped it out (private, single-caller, 3-line mechanical remap matching two already-uncovered sibling remaps).

## Deviations from Plan

None — plan executed exactly as written. All three fixes match the plan's `<action>` specifications, all `<must_haves>` truths hold, and all named artifacts/key_links exist as specified.

## Issues Encountered

None. One minor observational note: `npx jest --selectProjects Frontend <path>` did not narrow execution to only the path-matching suite in this repo's Jest CLI setup — it ran the full 79-suite Frontend project regardless of the path argument passed. This did not affect verification outcomes (all 79 suites, including the two ConsoleMode suites, passed), so it was not investigated further as it is outside this plan's scope.

## Full Regression Gate (Task 3)

- `npx tsc -p tsconfig.json` — exit 0, no errors.
- `npx eslint` on all six changed files — 0 errors, 78 warnings (all pre-existing baseline categories: `no-unsafe-*`, `no-floating-promises`, `restrict-template-expressions`, `import-x/no-named-as-default-member`, etc. — no new warning categories introduced).
- `pnpm test:ci` — **253 suites passed / 253 total** (baseline 251 + 2 new suites from this plan); **4876 passed, 1 skipped, 4877 total** (baseline 4867 + 9 new tests from this plan: 3 Rosetta + 6 selectors). Green, matches expected delta exactly.
- `git diff --stat HEAD~3 -- public/locales/` — empty. `NO-LOCALE-CHURN` confirmed. `pnpm i18n` was never run.
- `git log --oneline -3` — three atomic commits, one per upstream fix, on `fix/steam-native-install-stability`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three fixes are self-contained bugfixes/locale corrections with no follow-on work implied.
- `src/backend/main.ts`'s un-awaited `checkRosettaInstall()` call was deliberately left untouched per the plan's scope fence — it is now safe because the function can no longer reject on the spawn path. Adding an explicit `.catch()` there remains a separate, out-of-scope concern if ever desired.
- Console mode still has no in-console "hide game" action; this plan only makes the existing library hidden-flag apply there too, matching upstream's scope.

---
*Quick task: 260815-bjr-port-heroic-2-22-1-fixes*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 6 created/modified files verified present on disk. All 3 task commit hashes (f30c1f552, 66cf3baf4, 5ea69163b) verified present in git log.

---
phase: 261002-hx0-move-the-library-top-line-into-the-tier-
plan: 01
subsystem: ui
tags: [react, typescript, css-flexbox, jest, i18next, library-panel]

# Dependency graph
requires:
  - phase: 34.10/34.11/34.12 (Games tier-2 panel build-out)
    provides: Header component, LibraryContext/Tier2PortalContext portal wiring, FilterChipRow hoist
provides:
  - "Header absorbed LibraryHeader and ActionIcons: single tier-2 panel column with utilities row, sort row, search, categories/filters groups, and a bottom-pinned footer (count + Add Game)"
  - "GamesList root carries role=\"group\" + aria-label so the deleted 'All Games'/'Favourites' <h5> leaves no accessible-name regression"
  - "gameCount.ts relocated to screens/Library/gameCount.ts with every importer rewritten"
  - "Four source gates (libraryHeaderVisibility, tier2Portal, GlobalStateRefreshLibraryOrigin, headerTourAnchors) re-pointed at Header instead of the deleted components"
  - "Every remaining prose/docstring citation of LibraryHeader or ActionIcons in src/ re-pointed to Header, with the two deliberate historical-specimen exceptions untouched"
affects: [library-panel-future-work, onboarding-tour]

# Actuals (#2632)
actuals:
  tokens: 17357
  tasks: 3
  commits: 3
  plan_head_before: 4cbfe26b95c6d423bf3090cdcc4d6763fffd278f
  plan_head_after: d6ec8f1d0f37c14cf7d23d5e0a9fb815de5d8ad4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "jest.mock('react', ...) with jest.requireActual-fetched context objects to distinguish useContext(ctx) by identity, extending the single-context SettingsPanel.test.tsx idiom to two contexts, for direct-function-call component tests against a component with real hooks"
    - "margin-top: auto column-footer pinning inside a flex-direction: column container, with flex-grow removed from the sibling that would otherwise consume the space first"

key-files:
  created:
    - src/frontend/screens/Library/components/AddGameButton/index.css
  modified:
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/components/UI/Header/index.css
    - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/index.css
    - src/frontend/screens/Library/gameCount.ts (relocated from components/LibraryHeader/gameCount.ts)
    - src/frontend/screens/Library/librarySyncIndicator.ts
    - src/frontend/screens/Library/components/AddGameButton/index.tsx
    - src/frontend/screens/Library/components/GamesList/index.tsx
    - src/frontend/screens/Library/components/LibraryTour.tsx
    - src/frontend/screens/Library/components/FilterChipRow/index.scss
    - src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts
    - src/frontend/screens/Library/__tests__/tier2Portal.test.ts
    - src/frontend/screens/Library/__tests__/librarySyncIndicator.test.ts
    - src/frontend/screens/Humble/Keys/index.tsx
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/__tests__/GlobalStateRefreshLibraryOrigin.test.ts
    - src/frontend/components/UI/NavShell/components/NavItem/index.tsx
  deleted:
    - src/frontend/screens/Library/components/LibraryHeader/index.tsx
    - src/frontend/screens/Library/components/LibraryHeader/index.css
    - src/frontend/components/UI/ActionIcons/index.tsx
    - src/frontend/components/UI/ActionIcons/index.css

key-decisions:
  - "gameCount.ts relocated to src/frontend/screens/Library/gameCount.ts (not into components/UI/Header/) because it is consumed by both Header/index.tsx and Library/index.tsx -- a shared Library-scope module, not Header-private. All four importers (Header/index.tsx, Library/index.tsx, headerTourAnchors.test.tsx, libraryHeaderVisibility.test.ts) rewritten to the new path."
  - "`.libraryHeader` (Library/index.css) was KEPT -- it has two live consumers besides the deleted top line (Library/index.tsx's Favourites <h3> and RecentlyPlayed/index.tsx's <h5>) -- while `.libraryHeaderWrapper` (the deleted top line's own grid wrapper) was removed as dead weight."
  - "`.sideloadGameButton`'s base declaration was rehomed from the deleted LibraryHeader/index.css into a new AddGameButton/index.css, since AddGameButton is also rendered standalone by EmptyLibrary/index.tsx and would otherwise lose its only styling."
  - "`flex-grow: 1` was removed from `.Header__search` (a deviation from the plan's literal action text, Rule 1): flex-grow resolves before auto-margin space absorption, so with it present `margin-top: auto` on the footer would never find any space to push into and the count/Add-Game footer would not bottom-anchor."
  - "LibraryTour.tsx gained a module-level TOUR_OPTIONS constant (`scrollToElement: true, scrollPadding: 20`) passed to <Tour>: tour anchors now live inside a scroll-clipped tier-2 panel rather than the always-visible main content area, so a step whose anchor sits below the panel's current scroll position needs to be scrolled into view before intro.js positions its tooltip against it."

patterns-established:
  - "Direct-function-call component tests for a component with real (non-stubbed) React hooks: mock 'react' itself, spreading jest.requireActual, and override useContext/useState/useEffect/useMemo; distinguish multiple contexts by comparing against the real context objects fetched via jest.requireActual (never re-mocked), not by mocking the context modules themselves."

requirements-completed: [QT-261002-hx0]

coverage:
  - id: D1
    description: "Games tier-2 panel renders one column (utilities, sort, search, categories, filters, bottom-pinned count+Add-Game footer); the 'All Games'/'Favourites' heading is gone; LibraryHeader and ActionIcons no longer exist on disk"
    requirement: "QT-261002-hx0"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/tier2Portal.test.ts (Header vertical stack + portal describes)"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx (six-direct-children, CSS-gap gates)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three-theme (midnightMirage, gruvbox_dark, dracula) visual check of the panel column: bottom-anchored footer, segmented sort control end caps, no layout shift on count typing, focus rings, full tour walkthrough"
    verification: []
    human_judgment: true
    rationale: "Frontend jest project runs testEnvironment: 'node' with no jsdom and no CSS engine -- no gate in this repo can render a pixel to confirm visual layout, focus-ring colour, or tour-tooltip positioning. Checkpoint task is gate=\"advisory\" and was NOT performed this session; recorded as outstanding below."

duration: ~32min (measured span across the 3 task commits; work spanned multiple sessions)
completed: 2026-10-02
status: complete
---

# Phase 261002-hx0: Move the library top line into the tier-2 panel Summary

**Dissolved LibraryHeader and ActionIcons into Header's tier-2 panel column as one bottom-anchored flex stack, with all four disturbed source gates re-pointed and every stale prose citation of the two retired components fixed.**

## Performance

- **Duration:** ~32 min measured between the first and last task commit (2026-10-02 13:30:41 +1300 to 14:00:36 +1300); the plan's authoring/verification work spanned multiple executor sessions before that.
- **Started:** 2026-10-02T00:30:41Z (first task commit)
- **Completed:** 2026-10-02T01:00:36Z (last task commit)
- **Tasks:** 3/3
- **Files modified:** 23 (4 deleted, 1 created, 1 renamed, 17 modified)

## Accomplishments

- Task 1: Rehomed `gameCount.ts` to `screens/Library/gameCount.ts` and `.sideloadGameButton`'s base CSS rule to a new `AddGameButton/index.css` -- pure relocation, no rendered change.
- Task 2: Built the single `Header` panel column (utilities row, sort row, search, categories group, filters group, bottom-pinned footer), deleted `LibraryHeader/` and `components/UI/ActionIcons/` entirely, added `role="group"` + `aria-label` to `GamesList`'s root so the grid keeps an accessible name, and re-pointed all four source gates that previously asserted against the deleted components.
- Task 3: Re-pointed every remaining stale prose/docstring citation of `LibraryHeader`/`ActionIcons` across `src/` (9 total -- the plan's six listed files plus three more the absence-grep surfaced), leaving exactly the two deliberate historical-specimen exceptions (`filterChipRowPlacement.test.ts`, `tier2Portal.test.ts`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rehome gameCount.ts and the Add Game base rule -- no rendered change** - `7f17fb545` (refactor)
2. **Task 2: Build the panel column, delete LibraryHeader and ActionIcons, re-point four gates** - `ff7dafd14` (feat)
3. **Task 3: Retire the stale LibraryHeader and ActionIcons citations left behind** - `d6ec8f1d0` (docs)

No separate plan-metadata commit -- this executor's task-specific constraints exclude STATE.md/ROADMAP.md edits and the final docs commit; the orchestrator handles those.

## Files Created/Modified

- `src/frontend/components/UI/Header/index.tsx` - absorbed LibraryHeader's and ActionIcons' responsibilities into one vertical flex stack; gained `list`/`totalGames` props, real `useContext`/`useState`/`useEffect`/`useMemo` usage, a sort row, and a bottom-pinned footer.
- `src/frontend/components/UI/Header/index.css` - vertical `flex-direction: column` stack; dropped the frameless-overlay padding hack, `position: sticky`, and the horizontal `space-between` layout; `flex-grow: 1` removed from `.Header__search` so `margin-top: auto` on the footer can bottom-anchor it.
- `src/frontend/screens/Library/index.tsx` - portals `<Header list=... totalGames=... />` via `createPortal` inside `LibraryContext.Provider`; no `LibraryHeader` import/render remains.
- `src/frontend/screens/Library/index.css` - `.libraryHeaderWrapper` (the deleted top line's grid wrapper) removed; `.libraryHeader` kept, now `top: 0` instead of carrying `--header-height`.
- `src/frontend/screens/Library/gameCount.ts` - relocated from `components/LibraryHeader/gameCount.ts`; logic unchanged.
- `src/frontend/screens/Library/components/AddGameButton/index.css` - new file; owns `.sideloadGameButton`'s base rule (rehomed from the deleted `LibraryHeader/index.css`) so `EmptyLibrary`'s standalone `AddGameButton` instance keeps its styling.
- `src/frontend/screens/Library/components/AddGameButton/index.tsx` - margin removed from `.sideloadGameButton` (now `margin: 0`) since it is bottom-pinned inside the new footer rather than needing its own 24px side margins.
- `src/frontend/screens/Library/components/GamesList/index.tsx` - conditional `role="group"` + `aria-label` on the root, fed by the same `title.allGames`/`favourites` i18n keys the deleted `<h5>` used.
- `src/frontend/screens/Library/components/LibraryTour.tsx` - new module-level `TOUR_OPTIONS` (`scrollToElement: true, scrollPadding: 20`) passed to `<Tour>` so tour steps scroll their anchor into view inside the now scroll-clipped tier-2 panel.
- `src/frontend/screens/Library/components/FilterChipRow/index.scss` - comment reworded: `.libraryHeader`'s padding citation now states it is the Favourites/Recently-Played lane heading and that the gutter token is NOT derived from the retired top line; `padding-inline: var(--space-md-fixed)` declaration unchanged.
- `src/frontend/screens/Library/librarySyncIndicator.ts` / `__tests__/librarySyncIndicator.test.ts` - comment and test-name citation of `LibraryHeader` re-pointed to "the Games tier-2 panel's `Header`"; kept the two in sync as required.
- `src/frontend/screens/Humble/Keys/index.tsx` - `formatRelativeTime` docstring re-pointed from `LibraryHeader` to `components/UI/Header/index.tsx`.
- `src/frontend/state/GlobalState.tsx` - refresh-origin comment re-pointed from "ActionIcons" to "the Games tier-2 panel's Header".
- `src/frontend/components/UI/NavShell/components/NavItem/index.tsx` - hand-rolled-button precedent citation re-pointed from `ActionIcons/index.tsx` to `Header/index.tsx`'s own row-1 buttons.
- `src/frontend/state/__tests__/GlobalStateRefreshLibraryOrigin.test.ts` - `EXTERNAL_CALL_SITES` entry re-pointed to `../../components/UI/Header/index.tsx`; origin literal `'action-icons-refresh-button'` kept unchanged (it is consumed by backend auth-gate code, not cosmetic).
- `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts` - `LIBRARY_HEADER_PATH` renamed to `HEADER_PATH`, repointed at `Header/index.tsx`; assertions and docstrings re-pointed; one additional stale `LibraryHeader` docstring citation (not in Task 3's listed files) fixed during verification.
- `src/frontend/screens/Library/__tests__/tier2Portal.test.ts` - `everyHeaderUsageIsPortalled`'s needle changed from `'<Header />'` to `'<Header '` (Header is never self-closing now it has required props); the Provider-ordering test rewritten from hardcoded literal offsets to a regex match; old length-2 `LibraryHeader` assertion replaced with an absence assertion plus its SANITY counter-specimen and a `list=`/`totalGames=`/`AlphabetFilter` non-vacuity check.
- `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx` - rewritten to mock `'react'` itself (distinguishing `LibraryContext`/`ContextProvider` by identity via `jest.requireActual`) so `Header()` can still be called directly as a plain function despite now using real hooks; extended to assert the new `AddGameButton`/`FormControl`/footer structure and CSS gaps; two remaining docstring citations of the retired components (not in Task 3's listed files) fixed during verification.
- `src/frontend/screens/Library/gameCount.ts` docstring - one additional stale `LibraryHeader` citation fixed during verification.
- Deleted: `src/frontend/screens/Library/components/LibraryHeader/index.tsx`, `index.css`; `src/frontend/components/UI/ActionIcons/index.tsx`, `index.css`.

## Decisions Made

See `key-decisions` in frontmatter: gameCount.ts's new home, `.libraryHeader` kept vs `.libraryHeaderWrapper` removed, `.sideloadGameButton`'s rehome, the `flex-grow: 1` removal, and the LibraryTour scroll options.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `flex-grow: 1` from `.Header__search`**
- **Found during:** Task 2
- **Issue:** With `flex-grow: 1` present on the search bar, it would consume all available vertical space in the `.Header` flex column before the footer's `margin-top: auto` could absorb any -- the footer would never bottom-anchor. Flex-grow resolves before auto-margin space absorption.
- **Fix:** Removed `flex-grow: 1` from `.Header__search`.
- **Files modified:** `src/frontend/components/UI/Header/index.css`
- **Committed in:** `ff7dafd14` (Task 2 commit)

**2. [Rule 3 - Blocking] `tier2Portal.test.ts`'s `<Header />` needle and hardcoded Provider-ordering offsets no longer matched**
- **Found during:** Task 2 verification
- **Issue:** `Header` gained required `list`/`totalGames` props, so it is never rendered as a bare self-closing `<Header />`; the needle `'<Header />'` and two hardcoded literal-offset checks for "portal call sits after Provider opens" would never match real source, silently passing vacuously or failing outright.
- **Fix:** Changed the needle to `'<Header '` (trailing space); replaced the hardcoded offset checks with a regex search (`/createPortal\(\s*<Header\b/`) that does not pin exact whitespace.
- **Files modified:** `src/frontend/screens/Library/__tests__/tier2Portal.test.ts`
- **Committed in:** `ff7dafd14` (Task 2 commit)

**3. [Rule 3 - Blocking] `headerTourAnchors.test.tsx` would crash on "Invalid hook call"**
- **Found during:** Task 2 verification
- **Issue:** The new `Header` uses real `useContext`/`useState`/`useEffect`/`useMemo` from `'react'` (the old pre-merge component used none of these). The established "call the component directly as a plain function" test idiom has no hook dispatcher outside a renderer, so a real hook call throws.
- **Fix:** Mocked `'react'` itself via `jest.mock('react', () => ({ ...jest.requireActual('react'), useContext: ..., useState: ..., useEffect: jest.fn(), useMemo: fn => fn() }))`, distinguishing `LibraryContext` vs `ContextProvider` by object identity (fetched un-mocked via `jest.requireActual` for the identity comparison), extending the single-context pattern already established in `SettingsPanel.test.tsx` to two contexts.
- **Files modified:** `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx`
- **Committed in:** `ff7dafd14` (Task 2 commit)

**4. [Rule 3 - Blocking] Prettier formatting failure on `GlobalStateRefreshLibraryOrigin.test.ts`**
- **Found during:** Task 2 verification
- **Issue:** `npx prettier --check` flagged this file after the `EXTERNAL_CALL_SITES` entry was re-pointed -- the new, shorter path collapsed to fit prettier's line width, changing the entry's wrap from multi-line to single-line.
- **Fix:** `npx prettier --write`; confirmed via `git diff` the change was whitespace-only (no logic change); re-ran the file's 33-test suite, all passed.
- **Files modified:** `src/frontend/state/__tests__/GlobalStateRefreshLibraryOrigin.test.ts`
- **Committed in:** `ff7dafd14` (Task 2 commit)

**5. [Rule 3 - Blocking] Three additional stale `LibraryHeader`/`ActionIcons` citations beyond Task 3's listed six files**
- **Found during:** Task 3, running the plan's own absence-grep verify gate
- **Issue:** `gameCount.ts:12`, `libraryHeaderVisibility.test.ts:5`, and `headerTourAnchors.test.tsx:9,27` each still named the retired components in docstrings/comments -- none of these three files were in Task 3's explicit `<files>` list, but the plan's own `<done>` criterion ("LibraryHeader survives under src/ in exactly two files") would have failed without fixing them.
- **Fix:** Reworded each citation to describe the component by its current identity or role (e.g. "the former per-panel heading component") without using the literal retired name, same approach as the plan's six listed citations.
- **Files modified:** `src/frontend/screens/Library/gameCount.ts`, `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts`, `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx`
- **Committed in:** `d6ec8f1d0` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (1 bug, 4 blocking)
**Impact on plan:** All five were necessary for correctness or for the plan's own verify/done gates to pass honestly. No scope creep beyond what the plan's own success criteria required.

## Issues Encountered

None beyond the deviations documented above.

## Lint Before/After (both scopes)

The plan's recorded baseline (measured immediately before Task 1, per the PLAN.md `<verification>` section) gives pass/fail only, not per-scope counts: `pnpm codecheck` clean, `pnpm lint` `production: PASS | tests: PASS`, Frontend 182 suites / 3118 tests passing.

Measured counts after Task 2 and again after Task 3 (both at the unmoved ceilings `SRC_CEILING = 1124` / `TESTS_CEILING = 638`):
- **production scope:** 1105 problems (0 errors, 1105 warnings) -- PASS, 19 below ceiling.
- **tests scope:** 638 problems (0 errors, 638 warnings) -- PASS, exactly at ceiling (zero headroom).
- Both counts were identical before and after Task 3 -- Task 3 only edits comments/docstrings, no logic or import changes, so no new lint warning was possible.
- `pnpm codecheck` clean throughout (all 3 tasks).
- Frontend jest: 182 suites / 3125 tests passing after Task 2 and again after Task 3 (grew from the plan's 3118-test baseline as tests were extended/added across the plan's own tasks, not from unrelated drift).

## Re-pointed Source Gates (what each now asserts)

- **`libraryHeaderVisibility.test.ts`** - renamed its path constant from `LIBRARY_HEADER_PATH` to `HEADER_PATH`, now resolving to `components/UI/Header/index.tsx`. Asserts: `Header` (not `LibraryHeader`) renders `numberOfGames`, the filtered/total denominator wiring passes `totalGames` into `<Header ... totalGames=`, and the five non-header describes (`DEFAULT_FILTER_ENGINE_STATE`, `countGamesExcludingDlc`, `countUnfilteredGames`, source-gate stripper integrity, `findSilentlyExcludedGames`) are untouched.
- **`tier2Portal.test.ts`** - asserts `Header` is NEVER rendered as a direct child, only ever via `createPortal(...)`, and that the portal call sits after `LibraryContext.Provider` opens (regression gate against `LibraryContext`'s silent no-op initial setters). Also asserts `LibraryHeader` no longer appears anywhere in `Library/index.tsx` (with a SANITY counter-specimen proving the assertion isn't vacuous), that `Header` receives both `list` and `totalGames`, and that `.libraryHeader`'s CSS block still anchors at `top: 0` with no `--header-height` reference.
- **`GlobalStateRefreshLibraryOrigin.test.ts`** - `EXTERNAL_CALL_SITES` now reads `../../components/UI/Header/index.tsx` (was `ActionIcons/index.tsx`) for the `'action-icons-refresh-button'` origin literal; the nine-call-site count and the literal itself are unchanged, since that literal is consumed by backend Steam auth-trigger code, not cosmetic.
- **`headerTourAnchors.test.tsx`** - asserts `.Header` returns exactly six direct children in the locked panel order, that the two `data-tour` wrapper divs carry the right children by identity, that `Header__sortRow` wraps a `FormControl` and `Header__footer` wraps `AddGameButton` by identity, and that every CSS-gated wrapper (`Header__utilitiesRight`, `Header__footer`, `Header__footerRow`, `Header__categoriesGroup`, `Header__filtersGroup`) restates its required `gap`/`margin-top` value.

## Checkpoint: Three-Theme Visual Check -- NOT PERFORMED

The plan's final task is `type="checkpoint:human-verify" gate="advisory"` ("three-theme visual check of the panel column"). This checkpoint was **not performed** in this execution. It is advisory/non-blocking per the plan's own text, and is genuinely unclosable by any automated gate in this repo: the Frontend jest project runs `testEnvironment: 'node'` with no jsdom and no CSS rendering engine, so nothing here can render a pixel to confirm bottom-anchoring, segmented-control end-cap radii, focus-ring visibility, or that every tour step lands its tooltip on a visible control. This is recorded as **outstanding**, not as passed or skipped-and-forgotten: before the panel column ships to real users, an operator should launch the app and manually walk through midnightMirage, gruvbox_dark, and dracula themes per the checkpoint's seven-point checklist in the plan, plus run the library tour end to end.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Games tier-2 panel column is code-complete, fully gated (codecheck/lint/jest/prettier all green), and ready for the outstanding three-theme visual checkpoint above.
- No blockers for further library-panel work; the panel's structure (`Header__utilitiesRow`, `Header__sortRow`, `Header__search`, `Header__categoriesGroup`, `Header__filtersGroup`, `Header__footer`) is now the stable shape future plans should extend, not restructure.

---
*Phase: 261002-hx0-move-the-library-top-line-into-the-tier-*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: `src/frontend/components/UI/Header/index.tsx`
- FOUND: `src/frontend/screens/Library/gameCount.ts`
- FOUND: `src/frontend/screens/Library/components/AddGameButton/index.css`
- FOUND: `.planning/quick/261002-hx0-move-the-library-top-line-into-the-tier-/261002-hx0-SUMMARY.md`
- CORRECTLY ABSENT: `src/frontend/screens/Library/components/LibraryHeader/index.tsx`
- CORRECTLY ABSENT: `src/frontend/components/UI/ActionIcons/index.tsx`
- FOUND commit: `7f17fb545`
- FOUND commit: `ff7dafd14`
- FOUND commit: `d6ec8f1d0`

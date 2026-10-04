---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 02
subsystem: ui
tags: [react, typescript, filter-engine, focus-row, library-screen, nav-shell]

# Dependency graph
requires:
  - phase: 48-01
    provides: the shipped `filterLibrary` engine, `FilterChipRow`, and the `FilterEngineState` /
      `FilterEngineDeps` shapes this plan's selector builds a fresh state against
provides:
  - "A persisted `{ kind, value } | null` focus-row selection (`AppSettings.focusRow`), with a
    single reader/writer pair (`focusRow`/`handleFocusRow`) threaded from `GlobalState` through
    `ContextProvider`"
  - "A pure, fully-tested selector (`selectFocusRowGames`) that derives a focus row's contents from
    a fresh `FilterEngineState` built from the pick alone — independent of every live filter except
    hidden-games visibility"
  - "A `FOCUS ROW` Header panel section (Views sub-group: All games / Installed / Recently played /
    Favourites) with clear-by-reclick, reusing the shipped `FilterFacetGroup` disclosure"
  - "`FocusRowStrip`, a single non-wrapping 156px-card horizontal strip replacing both the old
    `RecentlyPlayed` lane and the Favourites lane above the grid"
affects: [48-03, 48-04, 48-05, 48-06]

# Actuals (#2632)
actuals:
  tokens: 19189 # chars/4 over the plan's own diff (76755 bytes), git diff b16191023..HEAD
  tasks: 3
  commits: 6
  commits_note: >
    Measured via `git rev-list --count ${plan_head_before}..HEAD` per protocol. The ledger base
    (d8f0e97af) predates two unrelated pre-existing commits (70cb3262b, b16191023 — a CLAUDE.md
    context trim and a STATE.md quick-task append from a different, already-closed quick task on
    this same branch) that landed before this plan's Task 1 commit. Plan 48-02 itself produced
    exactly 4 commits: a84e389d0 (Task 1), aa4a0ec73 (Task 2), e35156e02 (Task 3), e3336b2e9
    (Task 3 follow-up, meta-gate refresh).
  tokens_note: measured over `git diff b16191023..HEAD` — the plan's own changes only, excluding
    the two unrelated pre-existing commits above.
commits: 6
plan_head_before: d8f0e97af8a39c89dacff563ee8773469066029d
plan_head_after: e3336b2e9f153d30ffc84e03c54d31110535e71b

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fresh-FilterEngineState selector: build a `FilterEngineState` from `DEFAULT_FILTER_ENGINE_STATE`
      plus the pick alone, run it through the shipped `filterLibrary`, then apply
      `passesHiddenLaneFilter` once — independence from live filter state by construction, not by
      discipline."
    - "Comment-stripped source gates (`stripSourceComments` / `stripTrailingLineComment` from
      `backend/testUtils/stripSourceComments`) for structural assertions on files with no jsdom in
      the Frontend jest project (`testEnvironment: 'node'`)."
    - "Zero-match-returns-null as the single mechanism behind four distinct empty-state criteria
      (zero-match pick, deleted collection, signed-out store, empty recent list) — one code path,
      four locked behaviors."

key-files:
  created:
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
  modified:
    - src/common/types.ts
    - src/backend/config.ts
    - src/frontend/types.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/components/UI/Header/index.css
    - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
  deleted:
    - src/frontend/screens/Library/components/RecentlyPlayed/index.tsx

key-decisions:
  - "A new GlobalConfig key `focusRow` is the primary persisted shape (`{ kind, value } | null`),
    per the plan's assumption-delta decision; `libraryTopSection` is left in place as a demoted
    migration input for plan 48-05, not kept alongside as a still-required primary."
  - "The focus-row setter (`handleFocusRow`) owns both `setState` and the `window.api.setSetting`
    write itself, rather than relying on `useSetting` (which needs `SettingsContext`, unavailable
    outside the Settings screen) — one writer, no split-brain."
  - "The engine state for a focus-row pick sets `showHidden: 'show'` so `passesMore` takes no
    hidden-games decision at all, leaving `passesHiddenLaneFilter` as the single authority — the
    hidden-games decision is made exactly once."

patterns-established:
  - "`FOCUS_ROW_MAX_CARDS = 20` is a display cap on cards, kept distinct from the (separately,
    deliberately dropped) storage cap on `games.recent` entries that SPEC R6 originally proposed —
    two different 20s, not one shared constant."

requirements-completed: [R1, R3, R4, R5]

coverage:
  - id: D1
    description: "A focus-row selection of `{ kind, value }` or `null` persists in GlobalConfig
      under `focusRow` and survives quit/relaunch; a persisted selection naming a deleted
      collection, a signed-out store, or any unmatchable value renders no strip and does not
      crash the Library screen."
    requirement: "R1"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts"
        status: pass
    human_judgment: true
    rationale: "Actual quit/relaunch persistence and a live, hand-edited malformed config.json
      value are desk-reasoned from the unit coverage and the `isValidFocusRowSelection` shape
      guard, not exercised against a running app in this plan."
  - id: D2
    description: "`selectFocusRowGames` returns the correct game set for every view pick (all,
      installed, recentlyPlayed, favourites), caps at 20 cards, orders alphabetically (or by
      recency for the recentlyPlayed pick) with a stable app_name tie-break, excludes DLC, and is
      independent of every live filter except hidden-games visibility."
    requirement: "R3, R4, R5"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts (28 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A hidden game is absent from the focus row at showHidden 'off', the sole survivor
      at 'only', and present at 'show' — exactly one hidden-games decision, made by
      passesHiddenLaneFilter."
    requirement: "R4"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The FOCUS ROW Header panel section renders four clearable Views rows
      (All games / Installed / Recently played / Favourites) between Collections and the facets,
      reusing FilterFacetGroup and FilterCollectionList's clear-by-reclick shape, with zero new
      lookup-table i18n calls and zero new CSS custom properties."
    requirement: "R1"
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "FocusRowStrip replaces both the RecentlyPlayed lane and the Favourites lane with
      one non-wrapping 156px-card flex strip above an unchanged grid; RecentlyPlayed is deleted;
      the grid stylesheet and GamesList/GameCard are byte-unchanged."
    requirement: "R3, R5"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts"
        status: pass
      - kind: other
        ref: "shasum -a 256 byte-identity on Library/index.css, GamesList/index.tsx, GameCard/index.css"
        status: pass
    human_judgment: true
    rationale: "Visual card-size difference (156px strip vs ~190px grid cards), overflow behavior
      at real window widths, and the strip's position relative to the fold are all explicitly
      deferred to the live human gate per CONTEXT D-02 — nothing is mounted/rendered by this
      plan's own tests."

duration: 52min
completed: 2026-10-04
status: complete
---

# Phase 48 Plan 02: One Focus Row, Wired End to End — Summary

**A single `FocusRowStrip` now renders above the Library grid for every view pick (All games,
Installed, Recently played, Favourites), driven by a persisted `{ kind, value }` selection through
a pure, independently-filtered selector — replacing both the old `RecentlyPlayed` lane and the
Favourites lane.**

## Performance

- **Duration:** ~52 min (first task commit to summary)
- **Started:** 2026-10-04T00:58:55Z
- **Completed:** 2026-10-04T01:51:12Z
- **Tasks:** 3/3 completed
- **Files modified:** 13 modified, 7 created, 1 deleted

## Accomplishments

- Wired a persisted `focusRow` GlobalConfig key end to end: `AppSettings` → `config.ts` defaults →
  `GlobalState` (hydration with `??`, single `setSetting` writer) → `ContextProvider`.
- Built `selectFocusRowGames`, a pure selector proven independent of every live filter combination
  except hidden-games visibility, covered by 28 unit tests including a held-out independence table
  and six malformed-input shapes that all degrade to `[]` rather than throwing.
- Added the `FOCUS ROW` Header panel section (Views sub-group), reusing `FilterFacetGroup` and
  `FilterCollectionList`'s clear-by-reclick shape with zero new i18n lookup-table calls.
- Replaced both the `RecentlyPlayed` lane and the Favourites lane with one `FocusRowStrip` —
  a non-wrapping, 156px-card flex strip — and deleted `RecentlyPlayed/index.tsx` outright.
- Kept the grid itself byte-unchanged: `Library/index.css`, `GamesList/index.tsx`, and
  `GameCard/index.css` all verified identical by `shasum -a 256` / empty `git diff` against the
  plan's starting commit.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "pick a view as the focus row and see it render"** - `a84e389d0` (feat)
2. **Task 2: The `FOCUS ROW` panel section and its Header group** - `aa4a0ec73` (feat)
3. **Task 3: The horizontal strip, the lane replacement, and the two source gates it moves** - `e35156e02` (feat)
4. **Task 3 follow-up: meta i18n-gate-scope refresh** - `e3336b2e9` (fix)

**Plan metadata:** pending (this commit)

_Note: tasks carried `tdd="true"` but `workflow.tdd_mode` is `false` for this project, so each task
is one atomic commit rather than a separate RED/GREEN/REFACTOR sequence. Tests were written first
and confirmed failing before implementation in every task._

## Files Created/Modified

- `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts` - pure selector:
  builds a fresh `FilterEngineState` from the pick alone, runs it through `filterLibrary`, applies
  `passesHiddenLaneFilter` once, orders, caps at 20
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts` - 28
  cases: all four view kinds, the 20-card cap, hidden-games tri-state, six malformed shapes, DLC
  exclusion, stable tie-break, no-mutation, and the independence held-out table
- `src/frontend/screens/Library/components/FocusRowStrip/index.tsx` - the strip component: `useMemo`
  over the selector, zero-match `return null`, echoed header label, `React.memo`
- `src/frontend/screens/Library/components/FocusRowStrip/index.css` - flex track, hidden scrollbar
  (no `scrollbar-gutter`), fixed 156px cards, one-line ellipsis header
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts` -
  comment-stripped source gate for the CSS contract and the `Library/index.tsx` tag swap
- `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx` - the `FOCUS ROW` panel
  section: Views divider + four clearable `NavItem` rows
- `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss` - `(0,4,0)` NavItem
  reset, one-line clamp, divider styling, all nested under `.NavShell__tier2Portal`
- `src/common/types.ts` - `FocusRowKind`, `FocusRowSelection`, `AppSettings.focusRow`
- `src/backend/config.ts` - `focusRow: null` default
- `src/frontend/types.ts` - `ContextType.focusRow` / `handleFocusRow`
- `src/frontend/state/GlobalState.tsx` - state field, `??`-hydration, `handleFocusRow` (setState +
  single `setSetting` write), context value exposure
- `src/frontend/state/ContextProvider.tsx` - default context value
- `src/frontend/components/UI/Header/index.tsx` - new `Header__focusRowGroup` sibling div, between
  Collections and the facets groups
- `src/frontend/components/UI/Header/index.css` - matching `Header__focusRowGroup` flex block
- `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx` - six-children assertion,
  new mock, `data-tour="library-focus-row"` identity test, third `cssBlock` read
- `src/frontend/screens/Library/index.tsx` - `FocusRowStrip` wiring, four dead locals removed,
  forced `ariaLabel` correction, `libraryTopSection` destructure cleanup
- `src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts` - repointed from
  `RecentlyPlayed` to `FocusRowStrip`, every structural assertion preserved
- `meta/i18nGateScope.json` - hand-curated scope updated: dropped the deleted `RecentlyPlayed`
  entry, promoted the three new literal-call-site-only files
- `meta/i18nForkTouchedFiles.json` - regenerated post-commit, now HEAD-consistent (225 → 227 files)
- `meta/__tests__/genI18nGateScope.test.ts` - four stale `175`/`225` count pins corrected to `177`/`227`
- `src/frontend/screens/Library/components/RecentlyPlayed/index.tsx` - **deleted**; all three
  responsibilities (recency ordering, hidden-games tri-state, `games.recent` refresh) folded into
  `FocusRowStrip` / `selectFocusRowGames` / the existing `Library/index.tsx` subscription

## Decisions Made

- `focusRow` is a new, additive GlobalConfig key rather than a widened `libraryTopSection` — a new
  key makes plan 48-05's "seeding runs once, guarded by presence of the new key" expressible at all.
- The focus-row engine state deliberately sets `showHidden: 'show'`, leaving `passesHiddenLaneFilter`
  as the sole hidden-games authority rather than letting `passesMore` take a second, possibly
  divergent decision.
- `showNonAvailable`, `noStorePage`, `showSupportOfflineOnly`, `showThirdPartyManagedOnly`, and
  `showUpdatesOnly` stay at their engine defaults in the focus-row state — the row always excludes
  non-available/delisted games regardless of live filter state, which is what R4 independence asks for.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `headerTourAnchors.test.tsx` had a second, un-named `children[4]` reference needing the same index shift**
- **Found during:** Task 2
- **Issue:** The plan named one `children[4]` → `children[5]` fix (the `Header__footer` className
  assertion at the original `:414-423`). The file actually had the footer-index pattern duplicated
  at two separate test bodies (`const footer = children[4]`, twice), both of which would have kept
  asserting against the wrong child once `Header__focusRowGroup` was inserted at index 3.
- **Fix:** Updated both occurrences to `children[5]`, alongside the planned six-children reindex.
- **Files modified:** `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx`
- **Commit:** `aa4a0ec73`

**2. [Rule 1 - Bug] Unused `FilterMode` import left over from Task 1's test file**
- **Found during:** Task 2 (surfaced by a repo-wide `pnpm lint` run)
- **Issue:** `focusRowSelectors.test.ts` imported `FilterMode` but never used it directly, producing
  an ESLint `no-unused-vars` error.
- **Fix:** Dropped the unused import.
- **Files modified:** `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts`
- **Commit:** `aa4a0ec73`

**3. [Rule 2 - Correctness] Forced `ariaLabel` correction on the grid's `GamesList`**
- **Found during:** Task 3 (plan-flagged in advance as a named, forced deviation)
- **Issue:** The grid's `ariaLabel` ternary read the local `showFavourites`
  (`libraryTopSection === 'favourites' && favouriteGamesList.length`), i.e. the grid's accessible
  name reflected the *lane* setting rather than the grid's own content. That local became dead once
  the Favourites lane was removed, and no verbatim-preserving substitute exists.
- **Fix:** Repointed the ternary to `showFavouritesLibrary` (`LibraryContext.showFavourites`), so the
  accessible name now describes the grid's actual content rather than the old lane setting.
- **Files modified:** `src/frontend/screens/Library/index.tsx`
- **Commit:** `e35156e02`

**4. [Rule 1 - Bug] Dead locals and a dead destructured value after lane removal**
- **Found during:** Task 3
- **Issue:** Deleting the `RecentlyPlayed`/Favourites lane branches orphaned `showRecentGames`,
  `favouriteGamesList`, `showFavourites`, and `favourites` locals (all named in the plan's own
  `<measured_preconditions>`), plus — discovered during this task, not named in the plan —
  `libraryTopSection` itself became unused in the `ContextProvider` destructure once those four
  locals were gone, producing an ESLint `no-unused-vars` error.
- **Fix:** Removed all five dead bindings; confirmed via grep that `libraryTopSection` had zero
  remaining usages in the file before removing it.
- **Files modified:** `src/frontend/screens/Library/index.tsx`
- **Commit:** `e35156e02`

**5. [Rule 3 - Blocking issue] `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json` went stale after the `RecentlyPlayed` deletion**
- **Found during:** Task 3 (CLAUDE.md's own "deleting a frontend file has previously reddened the
  Meta jest project" instruction, confirmed live: 9 Meta test failures)
- **Issue:** `meta/i18nGateScope.json` is a hand-curated, disk-read file listing files the
  hardcoded-string gate must scan; it still named the deleted `RecentlyPlayed/index.tsx`, throwing
  `ScopeLoadError: ENOENT`. `meta/i18nForkTouchedFiles.json` is auto-generated from a HEAD-based
  `git diff` and so could not see any of this task's uncommitted file moves until they were
  committed, creating a structural ordering conflict between a disk-existence test (wants the
  deletion reflected now) and an anti-rot test (wants the snapshot to match live HEAD, which still
  had the file pre-commit).
- **Fix:** Hand-edited `meta/i18nGateScope.json` immediately (no git-timing dependency: removed the
  dead entry, promoted the three new literal-call-site-only files — `FilterFocusRow/index.tsx`,
  `FocusRowStrip/index.tsx`, `focusRowSelectors.ts` — into blocking scope, matching the
  260905-d33/Phase-41 precedent already recorded in that file's `generatedBy` provenance). Committed
  the Task 3 code changes with that hand-edit. Regenerated `meta/i18nForkTouchedFiles.json` via
  `pnpm gen-i18n-gate-scope` immediately afterward, now HEAD-consistent (225 → 227 files). Then fixed
  the four stale `175`/`225` hardcoded count-pin assertions in
  `meta/__tests__/genI18nGateScope.test.ts`'s `--rewrite-scope guard` block (A0, A2's title, A3, A4)
  to the new real counts (`177`/`227`).
- **Files modified:** `meta/i18nGateScope.json` (Task 3's own commit), `meta/i18nForkTouchedFiles.json`
  and `meta/__tests__/genI18nGateScope.test.ts` (separate follow-up commit, since the former needed
  HEAD to already include Task 3's commit)
- **Verification:** `npx jest --selectProjects Meta` — 46/46 suites, 1347 passed / 1 skipped, 0 failed
- **Commits:** `e35156e02` (gate-scope hand-edit), `e3336b2e9` (fork-touched regen + count-pin fixes)

**6. [Rule 3 - Blocking issue] `filterChipRowPlacement.test.ts` not Prettier-formatted after the hand rewrite**
- **Found during:** Task 3
- **Issue:** `npx prettier --check` flagged the hand-repointed test file as needing reformatting.
- **Fix:** `npx prettier --write`, then re-verified `--check` passes and all 21 tests in the file
  still pass post-reformat.
- **Files modified:** `src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts`
- **Commit:** `e35156e02`

---

**Total deviations:** 6 auto-fixed (4 × Rule 1, 1 × Rule 2, 2 × Rule 3 — items 5 and 6 share a Rule-3
trigger but item 5 is counted once as the primary fix). All auto-fixes were necessary for
correctness, lint cleanliness, or keeping the Meta jest gate green. No scope creep: nothing was built
beyond what the plan specified for the four view picks.

## Issues Encountered

None beyond the deviations above — no blockers required a checkpoint, no architectural questions
arose, and no authentication gates were hit (this plan touches no external service).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `FocusRowSelection`'s `kind` already supports `'collection' | 'store' | 'runnability'` in its type
  and in `selectFocusRowGames`'s engine-state construction; only the `'view'` kind is reachable from
  the UI in this plan. Plan 48-03 wires `FilterCollectionList`/`FilterStoreFacet`/
  `FilterRunnabilityFacet` to the same `handleFocusRow` and the remaining three kinds activate with
  no selector change.
- `trackRef` is declared in `FocusRowStrip/index.tsx` and deliberately unused beyond that — plan
  48-04 attaches the overflow controls and horizontal gamepad handler to it.
- `libraryTopSection` and `LibraryTopSectionOptions` remain in place, now read only by the
  `ContextProvider` default and `AppSettings`/`config.ts`/`GlobalState` plumbing (not by
  `Library/index.tsx` any more) — plan 48-05 consumes them as one-time migration input and retires
  the Settings control.
- The live human-verify pass (visual strip rendering, overflow-free narrow-track behavior, the
  accepted card-size difference vs. the grid per CONTEXT D-02) is owed at end-of-phase per
  `workflow.human_verify_mode: end-of-phase` and was not run in this plan.

## Self-Check: PASSED

- `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts` — FOUND
- `src/frontend/screens/Library/components/FocusRowStrip/index.tsx` — FOUND
- `src/frontend/screens/Library/components/FocusRowStrip/index.css` — FOUND
- `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx` — FOUND
- `src/frontend/screens/Library/components/RecentlyPlayed/index.tsx` — CONFIRMED ABSENT (deleted, as intended)
- `a84e389d0` — FOUND in `git log --oneline --all`
- `aa4a0ec73` — FOUND in `git log --oneline --all`
- `e35156e02` — FOUND in `git log --oneline --all`
- `e3336b2e9` — FOUND in `git log --oneline --all`

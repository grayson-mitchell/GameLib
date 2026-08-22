---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 03b
subsystem: library-filtering
tags: [steam, library-filter, i18n, delisted, jest]

# Dependency graph
requires:
  - phase: 37-03a
    provides: isGameAvailable()/isNonAvailableGame with the delisted forced-hide removed, on top of which this plan builds the opt-in facet
provides:
  - a sixth More-filter, noStorePage (off/only/hide), in FilterEngineState/ActiveFilterDescriptor/LibraryContextType
  - a rendered "No store page" row in More filters, a matching chip, and a renamed GameCard badge sourced from NEW gamelib.json keys
  - MORE_FILTER_KINDS and its drift tripwire re-pinned from five to six
affects: [37-VALIDATION, library-header-counts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generalised the D-09 both-'only'-means-union rule from two tri-states to three, with an explicit ordering: an explicit 'hide' on the new facet is checked BEFORE the union-of-onlys branch, so a direct instruction about one facet is never overridden by an unrelated facet's 'only'."
    - "Split a single working-tree-dirty JSON file's diff via a hand-written patch applied with `git apply --cached`, to stage only this plan's hunks while leaving a concurrent session's uncommitted hunks in the same file untouched in the working tree (see Deviations)."

key-files:
  created:
    - .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/deferred-items.md
  modified:
    - src/frontend/types.ts
    - src/frontend/screens/Library/filterEngine.ts
    - src/frontend/screens/Library/__tests__/filterEngine.test.ts
    - src/frontend/screens/Library/__tests__/engineWiring.test.ts
    - src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts
    - src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts
    - src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/LibraryContext.tsx
    - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx
    - src/frontend/components/UI/NavShell/__tests__/FilterMoreGroup.test.tsx
    - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
    - src/frontend/screens/Library/components/FilterChipRow/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "D-11 implemented exactly as locked: noStorePage's neutral is 'off' (not 'show'), so a virgin library emits no descriptor, no chip, and no group-badge count."
  - "D-16 honoured: the new facet reads game.runner === 'steam' && !!game.is_delisted directly inside passesMore rather than being routed through nonAvailableGames."
  - "GameCard's badge moved to a NEW gamelib:library.noStorePage key rather than editing library.delisted's call-site default, because translation.json already carries a non-empty value for that key which i18next would have rendered in preference to any edited default (the plan's documented trap)."
  - "Chose NOT to run any i18n generation script against gamelib.json; the four new keys were hand-added in their alphabetical positions, per the plan's explicit prohibition."

patterns-established:
  - "A second local tri-state helper (hideOnlyTriState) rather than widening the existing triState helper's FilterMode parameter to admit a fourth value it does not share semantics with."

requirements-completed: []
# REQ-37-02 is NOT marked complete. Per the plan's own <verification> note,
# Task 4's live gate is the only thing that closes REQ-37-02, and Task 4 was
# not run in this session (see "Task 4 — NOT EXECUTED" below).

# Metrics
duration: ~55min
completed: 2026-08-22
---

# Phase 37 Plan 03b: Add the "No store page" filter, chip, and badge (Tasks 1-3 of 4) Summary

**Added a sixth More-filter (`noStorePage`: off/only/hide) to the engine, wired it through the Library screen and FilterMoreGroup, and renamed the GameCard badge from the stale "Game no longer available" to "No store page" sourced from new `gamelib.json` keys — Tasks 1-3 only. Task 4 (the live Dead Island gate) was NOT executed; see checkpoint below.**

## Performance

- **Duration:** ~55 min (Tasks 1-3)
- **Started:** 2026-08-22 (session start)
- **Completed:** 2026-08-22 (Tasks 1-3; Task 4 pending)
- **Tasks:** 3 of 4 (Task 4 is a blocking human-verify checkpoint, not executed)
- **Files modified:** 15 (14 source/test files + 1 new deferred-items.md)

## Accomplishments

- `FilterEngineState`, `ActiveFilterDescriptor['kind']`, and `LibraryContextType` all carry the new `noStorePage: NoStorePageMode` tri-state (`'off' | 'only' | 'hide'`), with `'off'` as neutral so a virgin library shows no chip, no descriptor, and no group-badge count (D-11).
- `passesMore` restructured: an explicit `noStorePage: 'hide'` is checked first (hide beats an unrelated `'only'`), then the D-09 both-`'only'`-union rule is generalised from two tri-states to three. Every pre-existing test in `filterEngine.test.ts` still passes unedited, confirming the restructure is behaviourally identical at `noStorePage: 'off'`.
- `MORE_FILTER_KINDS` and its drift tripwire in `facetSelectionCount.test.ts` re-pinned from five entries to six.
- The Library screen persists the new tri-state under a dedicated `no_store_page` localStorage key via a narrow `readNoStorePageMode` validator (not a widened `migrateFilterMode`, which would wrongly admit `'show'`), wired into both the `engineState` memo's object literal AND its dependency array.
- `FilterMoreGroup` renders the new row as the third entry (after "Show non-Available games", before the three boolean rows) via a dedicated `hideOnlyTriState` helper — not a reuse of the existing `triState` helper, whose `FilterMode` type does not admit `'hide'`.
- The chip row and the GameCard badge both read from new, non-empty `gamelib.json` keys (`library.noStorePage`, `library.filterPanel.noStorePage`, `library.filterPanel.chipNoStorePageHidden`, `library.filterPanel.chipNoStorePageOnly`), added by hand in alphabetical position with no i18n scripts run.
- `GameCard/index.tsx`'s two `library.delisted` call sites (aria-label and rendered text) both moved to `gamelib:library.noStorePage` — `grep -c "library.delisted"` on that file now returns `0`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the sixth More-filter to the engine, in BOTH places, with the tripwire updated** - `fdc432086` (feat)
2. **Task 2: Wire the state through the Library screen and render the off/only/hide row** - `028b78451` (feat)
3. **Task 3: Chip, badge, and the NEW catalog keys** - `086581e17` (feat)

Task 4 (LIVE GATE — Dead Island renders and launches) was **NOT executed**. It is a `checkpoint:human-verify` gated `blocking` per the plan's frontmatter (`autonomous: false`), and per this session's instructions was to be handed back to a human operator rather than self-certified.

## Files Created/Modified

- `src/frontend/types.ts` - added `NoStorePageMode`, the `noStorePage` field on `FilterEngineState`/`LibraryContextType`, and `'noStorePage'` on `ActiveFilterDescriptor['kind']`.
- `src/frontend/screens/Library/filterEngine.ts` - `DEFAULT_FILTER_ENGINE_STATE` gained `noStorePage: 'off'`; `describeActiveFilters` gained the `noStorePage` branch; `passesMore` restructured per D-09/D-11/D-16.
- `src/frontend/screens/Library/__tests__/filterEngine.test.ts` - five new cases (off/hide/only/only+showHidden-union/runner-scoping) plus two `describeActiveFilters` invariant checks.
- `src/frontend/screens/Library/__tests__/engineWiring.test.ts`, `.../libraryHeaderVisibility.test.ts` - added `noStorePage: 'off'` to their `FilterEngineState` literals (Rule 1/3, directly caused by Task 1's type change).
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts` - `MORE_FILTER_KINDS` gained `'noStorePage'`; doc comment "five" -> "six".
- `src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts` - membership pin updated to six entries.
- `src/frontend/screens/Library/index.tsx` - `readNoStorePageMode` validator, `no_store_page` state pair, `engineState` memo/deps, and `LibraryContext.Provider` value all updated.
- `src/frontend/screens/Library/LibraryContext.tsx` - default `noStorePage`/`setNoStorePage` no-ops added.
- `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx` - `hideOnlyTriState` helper, the two new cycle functions, and the row render as the third entry.
- `src/frontend/components/UI/NavShell/__tests__/FilterMoreGroup.test.tsx` - updated for the new row (Rule 1, directly caused by Task 2's render-order change): row/button counts 5->6, `NoStorePageMode` added to the mock context type/factory, plus new cycle/checked-state cases mirroring the existing showHidden ones.
- `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts` - `case 'noStorePage'` (only/hide sub-cases).
- `src/frontend/screens/Library/components/FilterChipRow/index.tsx` - `case 'noStorePage': setNoStorePage('off')` in the x-button switch (D-27).
- `src/frontend/screens/Library/components/GameCard/index.tsx` - both delisted-badge calls moved to `gamelib:library.noStorePage`.
- `public/locales/en/gamelib.json` - four new keys hand-added: `library.noStorePage`, `library.filterPanel.noStorePage`, `library.filterPanel.chipNoStorePageHidden`, `library.filterPanel.chipNoStorePageOnly`.
- `.planning/phases/37-.../deferred-items.md` (new) - logged two out-of-scope test failures found while running `pnpm test:ci` (see below).

## Decisions Made

Followed the plan's D-09/D-11/D-16/D-27 decisions exactly as locked in `37-CONTEXT.md`. No new product decisions were required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Blocking type/test breakage] Two test files outside `files_modified` broke immediately after Task 1's `FilterEngineState` field addition**
- **Found during:** Task 1, running the plan's own stated `<verify>` jest command.
- **Issue:** `engineWiring.test.ts`'s `makeState` helper is typed `FilterEngineState` and its literal was missing the new required `noStorePage` field (TS compile error). `libraryHeaderVisibility.test.ts` has a `DEFAULT_FILTER_ENGINE_STATE` `toEqual({...})` pin that did not include the new field (would fail at runtime — `toEqual` is a deep-equality check).
- **Fix:** Added `noStorePage: 'off'` to both literals.
- **Files modified:** `src/frontend/screens/Library/__tests__/engineWiring.test.ts`, `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts`
- **Verification:** `npx jest src/frontend/screens/Library/__tests__/ src/frontend/components/UI/NavShell/__tests__/ --silent` — all 489 tests passed after the fix.
- **Committed in:** `fdc432086` (Task 1 commit).

**2. [Rule 1 - Test breakage] `FilterMoreGroup.test.tsx` broke after Task 2's new row changed render order/count**
- **Found during:** Task 2, running the plan's stated `<verify>` command.
- **Issue:** The test file's mock `LibraryContext` value did not supply `noStorePage`/`setNoStorePage`, so the new row rendered with `checked={undefined !== 'off'}` (`true`) against a stale row-count pin of 5.
- **Fix:** Added `noStorePage`/`setNoStorePage` to the mock context type and factory (defaulting to `'off'`), updated the row/button count pin to 6/3, and added parallel `it.each` cases for the new row's checked-state and both click cycles, mirroring the existing `showHidden` cases.
- **Files modified:** `src/frontend/components/UI/NavShell/__tests__/FilterMoreGroup.test.tsx`
- **Verification:** `npx jest src/frontend/screens/Library/__tests__/ src/frontend/components/UI/NavShell/__tests__/ --silent` — all 498 tests passed after the fix.
- **Committed in:** `028b78451` (Task 2 commit).

**3. [Git-safety split, not a code deviation] `public/locales/en/gamelib.json` was dirty with a concurrent session's uncommitted `settings` keys**
- **Found during:** Staging Task 3's commit.
- **Issue:** The working tree's `gamelib.json` carried BOTH this plan's `library.*` additions AND an unrelated, uncommitted concurrent session's `settings.gamepadInitialRepeatDelay`/`settings.gamepadRepeatFrequency` keys, in the same file, in different top-level objects.
- **Fix:** Saved the full working-tree diff, hand-wrote a patch containing only the three `library.*` hunks, applied it with `git apply --cached` (index-only), verified `git diff --cached` showed exactly my hunks and `git diff` (working tree) still showed only the concurrent session's `settings` hunk untouched, then committed. No `git stash`, `git reset`, or `git checkout` was used at any point.
- **Files affected:** `public/locales/en/gamelib.json` (staged: my 3 hunks only; working tree: concurrent session's hunk left intact and still uncommitted).
- **Committed in:** `086581e17` (Task 3 commit) — verified post-commit that no deletions occurred and the concurrent session's keys remained in the working tree, uncommitted.

---

**Total deviations:** 2 auto-fixed test breakages (Rule 1/3, both files outside `files_modified`, both directly caused by this plan's own type/render changes) + 1 git-safety patch-split (no code change, procedural only).
**Impact on plan:** Necessary for correctness (the two test fixes) and for concurrent-session safety (the patch split). No scope creep beyond files directly downstream of this plan's own type/render changes.

## Task 4 — LIVE GATE RUN 2026-08-22 by the human operator: 7 PASS, 1 DEFECT FOUND (fixed), 2 outstanding

Run on the operator's own machine against Dead Island (appId 91310), confirmed installed
(`appmanifest_91310.acf` present).

| # | Check | Result | Observed |
|---|-------|--------|----------|
| 1 | Card badge reads "No store page" | **PASS** | — |
| 2 | Baseline header count, no filters | **PASS** | **384** |
| 3 | "No store page" row present in More filters | **PASS** | — |
| 4 | Neutral default: no chip on a virgin library (D-11) | **PASS** | count 384, no chip |
| 5 | "only" state — chip "No store page only", grid filtered | **PASS** | — |
| 6 | "hide" state — Dead Island gone, count = baseline − delisted | **PASS** | **375 of 384** |
| 7 | Chip dismiss returns to baseline | **PARTIAL → FIXED** | dismissing the chip directly worked; **"Clear all" did NOT clear it** |
| 8 | Console Mode renders Dead Island at default filters (D-13) | **PASS** | operator: "dead island is listed in console mode" |
| 9 | Card shows normal install/launch controls | **NOT YET RUN** | — |

**Step 6 is the strongest evidence in this gate.** 384 − 375 = **exactly 9** — matching the nine
known delisted titles precisely. The facet filters the right set, not merely *a* set.

### Step 7 defect — found by the gate, fixed in `6cada93a7`

"Clear all" left the "Hiding no store page" chip on screen. `clearAllFilters`
(`Library/index.tsx:980`) is a **THIRD mirror** of the More-filters kind list, alongside
`MORE_FILTER_KINDS` and `describeActiveFilters`. This plan updated the first two — which its own
`<success_criteria>` named — and missed the third, which no artifact named.

**Why no test caught it:** every existing `clearAllFilters` test mocks the function and asserts it
was *called*. None exercises its body, which is defined inline in a ~1100-line component and is not
independently importable. This is the callsite-vs-behaviour gap in its pure form.

Fix adds `handleNoStorePage('off')` plus
`src/frontend/screens/Library/__tests__/clearAllFiltersCoverage.test.ts` — a source-level gate keyed
off `MORE_FILTER_KINDS` itself, so adding a seventh kind without wiring Clear all trips it
automatically. **Proven RED before the fix:** exactly one failure, on `noStorePage`, with the five
pre-existing kinds passing, so the gate discriminates rather than being trivially red.

### Still outstanding before REQ-37-02 closes

- Step 9 (card shows normal install/launch controls) was not reported.
- **Step 7 needs a re-test** — the fix landed after the operator's run, so the passing state of
  "Clear all" has not itself been observed live.

## Original checkpoint framing (superseded by the run above)

Task 4 is a `checkpoint:human-verify` task gated `blocking`. Per this session's explicit instructions, it was not attempted or self-certified. See the CHECKPOINT REACHED section in the executor's final response for the exact steps a human operator must run, and what to record.

**REQ-37-02 remains OPEN.** 7 of 9 checks passed, one found a real defect now fixed but not re-observed, and two were not run.

## Issues Encountered

- `pnpm test:ci` (end-of-wave gate) surfaced two failures, both out of scope for this plan and logged to `deferred-items.md` rather than fixed:
  1. `meta/__tests__/genI18nGateScope.test.ts` — pre-existing "A-17 ANTI-ROT" mismatch, documented in this repo's own operating notes as a known-red suite unrelated to library filtering.
  2. `src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts` — a PS5 controller ID misdetected as PS4. This lives entirely inside the concurrent session's in-flight gamepad work area (per this plan's `<git_safety>` block, `src/frontend/helpers/gamepad.ts` and sibling test files were already dirty in the working tree before this plan started). Not touched by, or related to, any file this plan modified.
- All suites directly exercising this plan's changes (`src/frontend/screens/Library/`, `src/frontend/components/UI/NavShell/`, `meta/__tests__/i18nCatalogChurnGuard.test.ts`, `meta/__tests__/hardcodedStringGate.test.ts`) passed green throughout.
- `npx tsc --noEmit -p tsconfig.json` is clean (no errors) as of the Task 3 commit.

## User Setup Required

None for Tasks 1-3. Task 4 requires a human operator with Dead Island (Steam appid 91310) installed on this machine and Steam signed in — see the checkpoint.

## Next Phase Readiness

Tasks 1-3's production/test surface is complete and green. REQ-37-02 remains open pending Task 4's live confirmation in the same restart session (per `37-VALIDATION.md`'s Manual-Only table, which binds three rows to that one run).

---
*Phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam*
*Plan: 03b*
*Completed (Tasks 1-3 only): 2026-08-22*

## Self-Check: PASSED

All three commit hashes (`fdc432086`, `028b78451`, `086581e17`) verified present via `git log --oneline --all | grep`. All 17 files listed under Files Created/Modified plus `deferred-items.md` and this SUMMARY.md verified present on disk via individual `[ -f ... ]` checks. No missing items.

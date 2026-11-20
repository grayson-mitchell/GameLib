---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 20
subsystem: ui
tags: [react, wkwebview, spellcheck, autocorrect, mui-select, region-picker, gap-closure]

requires:
  - phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
    provides: RegionPicker (G-47-8) and the shared SearchBar used by Store Search and Deals
provides:
  - SearchBar input, Winetricks components searchbox and every TextInputField opt out of WebKit spellchecking and automatic correction
  - RegionPicker closed select shows its Auto label (displayEmpty) on Store Search and Deals
  - render-level (server-rendered markup) regression tests for both gaps
affects: [store-search, deals, library-search, wine-manager, humble-keys, settings]

actuals:
  tokens: 3400
  tasks: 3
  commits: 6
plan_head_before: e64930db06868c3863080d89701553f93dc6577f
plan_head_after: 3d2a31112470a1fd7db44a44bc31e7954670d66d

tech-stack:
  added: []
  patterns:
    - "Free-text inputs set spellCheck={false} and autoCorrect=\"off\"; TextInputField sets them before the inputProps spread so a caller can opt back in"
    - "MUI Select regression tests render through renderToStaticMarkup, never by calling renderValue directly (it bypasses MUI's own gate)"

key-files:
  created:
    - src/frontend/components/UI/SearchBar/__tests__/searchBarTextChecking.test.tsx
    - src/frontend/components/UI/TextInputField/__tests__/textInputFieldTextChecking.test.ts
  modified:
    - src/frontend/components/UI/SearchBar/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx
    - src/frontend/components/UI/TextInputField/index.tsx
    - src/frontend/components/UI/RegionPicker/index.tsx
    - src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx

key-decisions:
  - "TextInputField defaults spellCheck off and autoCorrect off (the debug session's open item): its callers hold paths, launch arguments, API keys and titles, which an invisible on-blur correction would silently corrupt; squiggles are already off in GameLib's WKWebView so nothing visible is lost"
  - "The defaults sit before the {...inputProps} spread so a caller can still opt back in; none does today"
  - "SearchBar keeps id=\"search\" and gets no type=\"search\" (native WKWebView search chrome, Phase 45 live gate 45-12)"

patterns-established:
  - "Source gate for components that read the settings store (TextInputField): stripSourceComments + attribute ordering before the spread"

requirements-completed: [PRICE-01]

duration: 9min
completed: 2026-11-19
status: complete
---

# Phase 47 Plan 20: Autocorrect opt-outs and the region picker Auto label Summary

**Spellcheck and autocorrect opt-outs on SearchBar, the Winetricks searchbox and TextInputField (G-47-12b), plus `displayEmpty` on RegionPicker so Auto shows its label instead of a blank select (G-47-14a), both pinned by server-rendered tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-18T18:26:28Z
- **Completed:** 2026-11-18T18:35:00Z
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- G-47-12b: the shared SearchBar input now carries `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`, `autoComplete="off"`. One fix point covers Library, Store Search, Deals, Wine Manager and Humble Keys. `id="search"` (virtual keyboard) is kept and no `type="search"` is added.
- G-47-12b: the Winetricks "Everything else" searchbox and every TextInputField (paths, launch arguments, API keys, titles) opt out of automatic correction too.
- G-47-14a: RegionPicker passes `displayEmpty` to the MUI Select, so the closed picker shows `Auto (...)` on both Store Search and Deals. The old test called `renderValue` directly and could not catch this; the new cases render through MUI.

## Task Commits

TDD tasks, so each has a RED test commit then the implementation commit.

1. **Task 1: SearchBar opts out of spellchecking and autocorrect** - `5be68f581` (test, RED), `9497d9d7d` (feat)
2. **Task 2: Winetricks searchbox and TextInputField opt out too** - `a550c799e` (test, RED), `b655600db` (feat)
3. **Task 3: RegionPicker shows the Auto label** - `b4fef99e1` (test, RED), `3d2a31112` (fix)

**Plan metadata:** recorded in the docs(47-20) commit that follows this SUMMARY.

Commit count: `commits: 6` counts this plan's own commits (`git log --grep='(47-20)'`). The raw range `plan_head_before..plan_head_after` holds 9 commits because three commits from a concurrent quick task (261119-a23) landed on main in the same window; they are not part of this plan.

## RED evidence (seen failing before the fix)

- Task 1: `searchBarTextChecking` failed on `spellcheck` (expected `"false"`, received `null`) before `index.tsx` changed.
- Task 2: `everythingElse` failed on `spellCheck` (expected `false`, received `undefined`) and the TextInputField source gate failed (`indexOf` returned -1) before the edits.
- Task 3: four cases failed before `displayEmpty` was added: the `displayEmpty` element-graph assertion (received `undefined`), and the three Auto display cases (null value, empty options, Store Search shape), each receiving `<span class="notranslate">&#8203;</span>` instead of `Auto (United States)`. The 'Germany · EUR' case passed before and after, as expected.

## Files Created/Modified

- `src/frontend/components/UI/SearchBar/index.tsx` - text-checking opt-outs on the shared search input, with the G-47-12b rationale comment
- `src/frontend/components/UI/SearchBar/__tests__/searchBarTextChecking.test.tsx` - renderToStaticMarkup test pinning the attributes, id and absence of `type`; swallows only React's server useLayoutEffect warning
- `src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx` - spellCheck false and autoCorrect off on the components searchbox
- `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx` - asserts the two new props on the searchbox
- `src/frontend/components/UI/TextInputField/index.tsx` - spellCheck false and autoCorrect off before the `{...inputProps}` spread
- `src/frontend/components/UI/TextInputField/__tests__/textInputFieldTextChecking.test.ts` - comment-stripped source gate (attributes before the spread)
- `src/frontend/components/UI/RegionPicker/index.tsx` - `displayEmpty` on the Select
- `src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx` - render-level `closed select display (G-47-14a)` cases, a `displayEmpty` element-graph assertion, and the old `renderValue` case renamed to say it checks label text only

## Decisions Made

- TextInputField defaults the opt-outs on (plan decision, recorded in the objective); placed before the spread so callers can opt back in.
- The "stored country the screen's own list does not offer" case is covered by the screens passing `null` (Auto); the picker tests assert Auto renders its label with empty options. No screen code changed.

## Deviations from Plan

None - plan executed exactly as written. (The plan's tasks list one commit each; the TDD gate protocol split each into a RED `test(47-20)` commit and an implementation commit.)

## Issues Encountered

None. `hardcodedStringGate` takes about 170 s per run (its non-vacuity cases), so it was run for Tasks 1 and 2 as the plan's `<verify>` specifies; Task 3's verify does not include it.

## Verification

- Plan `<verification>` suites pass: searchBarTextChecking, searchBarTypingRace, everythingElse (20 tests with textInputFieldTextChecking), RegionPicker (11 tests).
- `hardcodedStringGate` 176/176 passed, `pnpm codecheck` clean, `pnpm lint:src` 0 errors (962 pre-existing warnings), scoped `npx prettier --check` clean on every path written.
- Acceptance greps: `spellCheck={false}` and `autoCorrect="off"` present in SearchBar, EverythingElseGroup and TextInputField; `id="search"` kept; `^\s+displayEmpty$` present; `renderToStaticMarkup` present in RegionPicker test; no `jest.mock(` in the new or changed tests.
- Not verifiable here: whether macOS still rewrites 'xcom' on blur, and the painted `Auto (...)` text in the live app. Both are plan human-checks, harvested at end of phase.

## Known Stubs

None.

## Threat Flags

None. T-47-59 (autocorrect tampering) and T-47-60 (region display) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-47-12b and G-47-14a code is in; both need the live human checks listed in the plan (macOS "Correct spelling automatically" ON, `pnpm tauri:dev`; Store Search / Deals Auto label in a dark theme and Nord Light).

---
*Phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean*
*Completed: 2026-11-19*

## Self-Check: PASSED

- FOUND: both created test files, all six modified source/test files
- FOUND commits: 5be68f581, 9497d9d7d, a550c799e, b655600db, b4fef99e1, 3d2a31112 (all ancestors of HEAD)

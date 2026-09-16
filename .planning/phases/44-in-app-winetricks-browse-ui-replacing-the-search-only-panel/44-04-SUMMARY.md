---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 04
subsystem: ui
tags: [react, typescript, jest, scss, winetricks, browse]

requires:
  - phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
    provides: "44-03's WinetricksBrowse/Row component (row-state derivation, mouse-click race fix)"
provides:
  - "WinetricksBrowse container: search chrome, curated group, per-category Dropdown groups, flat search results view"
  - "Single-scroll-region styling (D-06 override of the UI-SPEC's multi-scroll layout)"
  - "Behavioural test suite for the container (15 tests, no real renderer/DOM-testing-library)"
affects: [44-05]

tech-stack:
  added: []
  patterns:
    - "JSX-construct-vs-invoke-aware component mocking: stub a mocked component's default export as a no-op (never invoked by React.createElement), then match tree nodes by importing the same mocked reference and comparing el.type === Component identity"
    - "useMemo added to the shared hand-rolled react mock (deps-array shallow compare + cached slot value), alongside the existing useState/useRef pattern"

key-files:
  created:
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx
  modified: []

key-decisions:
  - "D-13 installed-filter reversal confirmed by negative control: re-adding the old installed-filter line makes the test fail with exactly the predicted diff"
  - "D-14 never-alphabetical emission order confirmed by negative control: sorting categoryGroups.entries() before mapping breaks category order while leaving within-group row order passing (proves the fixture distinguishes parser order from sorted order)"
  - "Both panes must stay mounted (UI-SPEC Interaction Contract §2) confirmed by negative control: conditionally unmounting the grouped pane when isSearching drops all 4 Dropdowns from the tree"

patterns-established:
  - "Negative-control methodology for auto-mode plans without a live UI: temporarily re-introduce the exact regression the plan forbids into an already-committed file via Edit, capture the failing assertion verbatim, then revert via git checkout -- <single file>"

requirements-completed:
  - REQ-44-01
  - REQ-44-02
  - REQ-44-04
  - REQ-44-05
  - REQ-44-06
  - REQ-44-07
  - REQ-44-09
  - REQ-44-12
  - REQ-44-13
  - REQ-44-25
  - REQ-44-26

duration: ~2h (across two work sessions)
completed: 2026-09-16
---

# Phase 44 Plan 04: Build the browse container Summary

**WinetricksBrowse container (search chrome + curated group + per-category Dropdown groups + flat search results, single scroll region) built and covered by a 15-test behavioural suite verified against three plan-mandated negative controls.**

## Performance

- **Tasks:** 3/3 completed
- **Files created:** 1 (test file)
- **Files modified:** 0 in this session (index.tsx and index.scss were committed in a prior session as Tasks 1–2; this session completed Task 3 plus verification/lint follow-up)

## Accomplishments

- Task 1 (`index.tsx`) and Task 2 (`index.scss`) were already committed before this session began (commits `e202150c3`, `1ba82518e`).
- Task 3 (behavioural test suite) completed, debugged, lint-clean, and committed this session (`d49f3dde7`).
- All three plan-mandated negative controls executed and captured verbatim (below).
- `pnpm codecheck` exits 0.
- `pnpm lint` regressed by zero errors (the one error discovered was in this session's own new file and was fixed before commit).
- Full Frontend jest project: 164/164 suites, 2648/2648 tests pass — no regressions.

## Task Commits

1. **Task 1: Build container search chrome and groups** - `e202150c3` (feat) — committed in a prior session
2. **Task 2: Add container styling with single-scroll D-06 override** - `1ba82518e` (feat) — committed in a prior session
3. **Task 3: Add behavioural test suite** - `d49f3dde7` (test) — committed this session

_No plan-metadata commit for STATE.md/ROADMAP.md was made — see "Skipped Workflow Steps" below._

## Files Created/Modified

- `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx` — 15 tests, ~698 lines. No `render(`/`fireEvent`/`screen.` usage anywhere (`grep -c "render(\|fireEvent\|screen\." <file>` returns **0**). Mocks `SearchBar` and `Dropdown` as no-op stubs matched by direct component-reference identity; invokes `Row` directly (not mocked) via an isolated harness for the C-2 button-handler assertions; extends the shared hand-rolled `react` mock with a `useMemo` slot.

## Negative Controls (verbatim captures)

Per this project's own "raw source gate is satisfied by the prose that names it" and general negative-control discipline, every behavioural claim below that a test enforces a specific *regression* was verified by temporarily re-introducing that exact regression into the already-committed `index.tsx`, running only the relevant test, capturing the failure, then reverting the single file via `git checkout --`.

### Control A — D-13 (installed-filter reversal)

**Edit applied:** re-added the old `WinetricksSearch`-style installed-filter to the `searchResults` `useMemo` (`return filtered.filter((component) => !installed?.includes(component.verb))`).

**Captured failure:**
```
● D-13 (reversal): installed components appear in search results › a query matching an INSTALLED verb returns a row for it -- the old installed-filter returned nothing here

  expect(received).toEqual(expected) // deep equality

  - Expected  - 3
  + Received  + 1

  - Array [
  -   "physx",
  - ]
  + Array []

    543 |       (el) => (el.props as { component: WinetricksComponent }).component.verb
    544 |     )
  > 545 |     expect(flatVerbs).toEqual(['physx'])
        |                       ^
    546 |   })
    547 | })
    548 |

    at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx:545:23)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 16 skipped, 17 total
```

Reverted via `git checkout -- src/frontend/components/UI/Winetricks/WinetricksBrowse/index.tsx`; `git diff --stat` showed no changes remaining.

### Control B — D-14 (never-alphabetical emission order)

**Edit applied:** inserted `.sort((a, b) => a[0].localeCompare(b[0]))` between `Array.from(categoryGroups.entries())` and `.map(...)`.

**Captured failure:**
```
● D-14: parser emission order, never alphabetical › category groups appear in first-occurrence order

  expect(received).toEqual(expected) // deep equality

  - Expected  - 1
  + Received  + 1

    Array [
  -   "zeta",
      "alpha",
      "mid",
      "omega",
  +   "zeta",
    ]

    413 |     const categoryOrder = dropdownEls.map((el) => mockDropdown().textOf(el.props.title))
    414 |
  > 415 |     expect(categoryOrder).toEqual(['zeta', 'alpha', 'mid', 'omega'])
        |                           ^
    416 |     // Sanity: alphabetical order would visibly differ -- proves this
    417 |     // fixture can actually distinguish "parser order" from "sorted".
    418 |     expect(categoryOrder).not.toEqual([...categoryOrder].sort())

    at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx:415:27)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 15 skipped, 1 passed, 17 total
```

(The sibling test "rows within a group appear in fixture order" still PASSED under this edit — expected, since only category order was sorted, not row order within a group; this confirms the negative control is targeted rather than accidentally tripping an unrelated assertion.)

Reverted via `git checkout -- src/frontend/components/UI/Winetricks/WinetricksBrowse/index.tsx`; confirmed clean.

### Control C — pane mounting (UI-SPEC Interaction Contract §2)

**Edit applied:** wrapped the grouped pane's outer `<div>` in `{!isSearching && (...)}`, conditionally unmounting it instead of merely hiding it via the `--hidden` class.

**Captured failure:**
```
● UI-SPEC Interaction Contract §2: expand-state survives a search round-trip › a category expanded before searching is still expanded after clearing the search

  expect(received).toHaveLength(expected)

  Expected length: 4
  Received length: 0
  Received array:  []

    615 |     // Dropdowns must still be present in the tree while the grouped pane is
    616 |     // merely hidden via CSS.
  > 617 |     expect(findAllByType(tree, Dropdown)).toHaveLength(4)
        |                                           ^
    618 |
    619 |     const clearOnInputChanged = findMockSearchBar(tree).props.onInputChanged as (
    620 |       text: string

    at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx:617:43)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 16 skipped, 17 total
```

Reverted via `git checkout -- src/frontend/components/UI/Winetricks/WinetricksBrowse/index.tsx`; confirmed clean.

## D-06: exactly ONE scroll region — verified, not assumed

Re-compiled `index.scss` fresh this session (`npx sass ... /tmp/wtb_verify.css`) and grepped the output:

```
$ grep -c overflow-y /tmp/wtb_verify.css
1
```

The single occurrence is at compiled-output line 19 (`.progressDialog.winetricksDialog .WinetricksBrowse__region { ... overflow-y: auto; ... }`). The UI-SPEC's separate per-category `max-height: 240px; overflow-y: auto;` does not exist anywhere in the compiled output — `index.scss` explicitly neutralises `Dropdown`'s own `.dropdown.expanded { max-height: 50vh; overflow-y: auto; }` rule for this panel (`max-height: none; overflow: visible;`), out-specifying it by class-token count (6 vs 3) rather than depending on import order.

## Custom-property audit (index.scss)

**File-locally declared** (on `.progressDialog.winetricksDialog`, matching `Row/index.scss`'s identical copy verbatim, per that file's own CR-01/CR-03 fallback-chain rationale):
- `--winetricks-active-color: var(--navbar-active, var(--accent-overlay, var(--accent)))`
- `--winetricks-inactive-color: var(--navbar-inactive, var(--navbar-accent))`
- `--winetricks-hover-color: var(--text-hover, var(--accent))`

**Bare `var()` usages, each justified individually** (not a CR-01 violation):
- `--modal-background` (sticky search bar background) — same token `Dialog/components/Dialog.tsx:51` and `Dialog/index.css:20,73` already consume bare for this exact dialog's own surface; if undefined in any shipped theme the dialog itself would already be broken.
- `--accent` (focus-visible outline) — themed accent colour, consumed bare across the codebase at focus rings.
- `--text-secondary`, `--text-xs`, `--text-sm`, `--bold`, `--space-sm`, `--space-lg`, `--space-2xs`, `--space-3xs` — the project's unthemed global sizing/typography scale (declared once globally in `styles/_spacing.scss`, not per theme block), so not subject to the same per-theme-drop defect class; consumed bare throughout the codebase including `FilterFacetGroup/index.scss`.

## i18n key freeze

No new translation keys were added. The 13 frozen `winetricksBrowse.*` keys used by `index.tsx`/`Row/index.tsx` remain unchanged; this plan's own test file adds zero new keys (its `react-i18next` mock interpolates existing keys for assertion purposes only).

## Deviations from Plan

### Auto-fixed Issues (Rule 1 — bugs in this session's own new test code, not deviations from the plan's design)

**1. [Rule 1 - Bug] SearchBar/Dropdown mocks never fired**
- **Found during:** Task 3, initial test run (11/122 failures, all in tests calling `findMockSearchBar`/dropdown lookups)
- **Issue:** The mocks were written as passthrough factory functions returning wrapper objects (`{type: 'mock-searchbar', props}`), under the mistaken assumption that JSX invokes a component function when constructing an element. `React.createElement(Component, props)` (what JSX compiles to) never calls `Component` — it only stores the function reference in `element.type`. No element in the tree ever had `type === 'mock-searchbar'`/`'mock-dropdown'`.
- **Fix:** Simplified both mocks' default export to a no-op `() => null` (never invoked; exists only as a stable importable reference and to short-circuit the real module's `.scss`/`window.api`/`useState` side effects at import time). Changed all test-side lookups to import the mocked component directly (`import SearchBar from '../../../SearchBar'`, `import Dropdown from '../../../Dropdown'`) and match tree nodes by reference identity (`el.type === SearchBar`) via `findAllByType`.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx`
- **Commit:** `d49f3dde7` (folded into the Task 3 commit; this file was never committed in its broken state)

**2. [Rule 1 - Bug] useState-count test matched a documentation comment**
- **Found during:** Task 3, C-2/REQ-44-26 test run (received length 2, expected 1)
- **Issue:** The regex `/\buseState\s*\(/g` matched both the real `const [search, setSearch] = useState('')` call at `index.tsx:58` AND a false positive inside `index.tsx`'s own header comment at line 53 (`... it lives inside each \`Dropdown\` instance (\`useState(false)\`) ...`) — the exact "raw source gate satisfied by the prose that names it" pattern this project's own memory documents.
- **Fix:** Anchored the regex to `/=\s*useState\s*\(/g`, requiring an assignment operator immediately before, which matches only the real call site. Added an in-test comment naming this exact pitfall.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx`
- **Commit:** `d49f3dde7`

**3. [Rule 1 - Bug] `@typescript-eslint/no-unnecessary-type-assertion` lint error**
- **Found during:** post-Task-3 `pnpm lint` run, before commit (`✖ 639 problems (1 error, 638 warnings)`, 1 error in the tests scope, located at `WinetricksBrowse.test.tsx:234:11`)
- **Issue:** `mockDropdown()`'s single-step cast `(jest.requireMock('../../../Dropdown') as { __mockDropdown: MockDropdown }).__mockDropdown` was flagged as unnecessary — `jest.requireMock()`'s declared return type is already broad enough that a direct cast to the narrower shape is considered a no-op by the rule.
- **Fix:** Routed the cast through `unknown` first (`jest.requireMock(...) as unknown as { __mockDropdown: MockDropdown }`), matching the pattern already used by the file's own `harness()` helper for the `react` mock.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx`
- **Commit:** `d49f3dde7` (fixed before commit; the broken version was never committed)

**4. [Rule 1 - Bug] Unused `ReactElement` import**
- **Found during:** Task 3, cleanup pass after the mock redesign
- **Issue:** `import type { ReactElement } from 'react'` was left over from an earlier draft and was no longer referenced after the mock/lookup redesign.
- **Fix:** Removed the import.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx`
- **Commit:** `d49f3dde7`

## `pnpm lint` counts (before and after the fix)

- **Before fixing item 3 above:** tests scope — `✖ 639 problems (1 error, 638 warnings)`, `1 error(s) in the tests scope.` The one error was in this session's own new file.
- **After the fix:** tests scope — `✖ 638 problems (0 errors, 638 warnings)`. Production scope (unaffected by this plan): `✖ 1123 problems (0 errors, 1123 warnings)`. Both scopes report `PASS` (`production: PASS | tests: PASS`). Error count did not regress (0 before this plan's own file existed, 0 after fixing the error this plan's own file introduced). Warning count is unchanged at 638 in the tests scope — the fix (routing through `unknown`) did not introduce any new warning.
- No lint findings of any kind remain in `WinetricksBrowse.test.tsx` (`grep -n "WinetricksBrowse.test.tsx" <full lint output>` returns nothing).

## Verification Run Summary

- WinetricksBrowse test directory (3 suites): **122/122 tests pass**, both before and after the lint fix.
- Full Frontend jest project: **164/164 suites, 2648/2648 tests pass**, both after the negative-control reverts and after the lint fix — no regressions introduced at any point.
- `pnpm codecheck` (`tsc --noEmit`): **exit 0**.
- `pnpm lint`: exit 0, both scopes PASS, 0 errors (see counts above).

## Skipped Workflow Steps

Per this session's standing constraints, the following generic execute-plan workflow steps were **intentionally skipped**, and `.planning/STATE.md`/`.planning/ROADMAP.md` were left byte-identical to how they were found:
- No `gsd-sdk query state.*` calls (advance-plan, update-progress, record-metric, add-decision, record-session).
- No `gsd-sdk query roadmap.update-plan-progress` call.
- No `gsd-sdk query requirements.mark-complete` call — `REQUIREMENTS.md` was left untouched; the completed requirement IDs are recorded in this SUMMARY's frontmatter (`requirements-completed`) instead.
- No `gsd-sdk query commit` call for this SUMMARY.md — it is committed via plain `git add`/`git commit` below.
- No final `docs({phase}-{plan}): complete ...` metadata commit touching STATE.md/ROADMAP.md/REQUIREMENTS.md was made, since none of those files were modified.

## Known Stubs

None. This is a test-only task (Task 3); Tasks 1–2 (the actual container implementation) were completed and committed in a prior session, and this session's verification found no stub data paths.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes were introduced — this session added test coverage only.

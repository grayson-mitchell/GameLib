---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 03
subsystem: ui
tags: [react, typescript, focus-row, nav-shell, filter-panel, scss]

requires:
  - phase: 48-02
    provides: "FilterFocusRow Views-only section, selectFocusRow handler, handleFocusRow pair, FocusRowStrip"
provides:
  - "FOCUS ROW section offering every view, collection (incl. Uncategorized), connected store and host-computable runnability value in fixed order"
  - "Per-sub-group omit-when-empty for Collections / Store / Runnability (Views ungated, so the section is never empty)"
  - "One-line ellipsis clamp plus title on every row and divider, pinned by source gates"
affects: [48-04, 48-05, 48-06]

actuals:
  tokens: 6564 # chars/4 over git diff plan_head_before..plan_head_after (26255 bytes)
  tasks: 2
  commits: 3
plan_head_before: 25a523592d34829e947ae849be28dec6d7a288ad
plan_head_after: 1ba49081831f4556b89845bb67dfdab5b19b5752
commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-sub-group gating inside one disclosure: each conditional group is a fragment guarded by its own list length, not a return-null on the component"
    - "Element-tree-walking component test under jest testEnvironment node, with useContext stubbed per context by identity"

key-files:
  created:
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx
  modified:
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss

key-decisions:
  - "Full label rides on an inner span passed through NavItem's labelElement rather than adding a title prop to NavItem, keeping the change inside the plan's three files (a plain edit to a shared frontend file reds the meta project in this repo)."
  - "Divider labels are hoisted into consts that remain literal tGamelib call sites so each divider can carry title without duplicating the call."

requirements-completed: [R2]

status: complete
duration: 25 min
completed: 2026-10-04
---

# Phase 48 Plan 03: FOCUS ROW pick space widened Summary

The `FOCUS ROW` section now offers every view, every collection (plus Uncategorized), every connected store and every host-computable runnability value, each non-Views group vanishing wholesale when empty, with long user-authored names clamped to one line and the full text on `title`.

## Accomplishments

- Four fixed-order sub-groups (Views, Collections, Store, Runnability) in one collapsed `FilterFacetGroup`, no count badge, rows are `NavItem` buttons (never `FilterFacetRow`).
- Single `selectFocusRow(kind, value)` handler gives clear-by-reclick across all four kinds; exactly one row active across the section.
- Labels reuse existing sources: `RunnerToStore` plus the `sideload` to Other split, imported `runnabilityLabel`, literal `t('header.uncategorized', 'Uncategorized')`, and the three existing `gamelib:library.filterPanel.*` divider keys. No new catalogue key (`pnpm i18n` leaves `gamelib.json` byte-identical, digest verified).
- Collections are read-only: the only `customCategories` access is the category-listing accessor (T-48-07), held by a comment-stripped source gate.
- Containment: clamp on `.FilterFocusRow__row > span` (the span NavItem puts the label in) with `min-width: 0`, plus `min-width: 0` on the row and divider.

## Task Commits

1. Task 1 RED - `f90861696` test(48-03): failing tests (19 of 31 failed on planned-behavior assertions, the rest passing against the Views-only shape)
2. Task 1 GREEN - `107fa1b27` feat(48-03): Collections, Store and Runnability sub-groups
3. Task 2 - `1ba490818` feat(48-03): long-label containment, title attributes, source gates

## Verification

- `npx jest --selectProjects Frontend --testPathPattern "filterFocusRow|cssTokenSweep|themeTokens|FilterRunnabilityFacet|headerTourAnchors"`: 5 suites, 119 tests passed.
- Full `meta/__tests__` project: 46 suites passed (no gate scope refresh was needed this time).
- `pnpm codecheck` exit 0; `pnpm lint` exit 0 with `production: PASS | tests: PASS`.
- `npx prettier --check` over the three exact paths (all `ignored: false`): clean.
- SCSS contract `node` assertion printed `SCSS CONTRACT OK`.
- Acceptance greps (comment-stripped): dividers 4, FilterFacetRow 0, selectedCount 0, "Runs natively" 0, `'GOG'` 0, `t('header.uncategorized', 'Uncategorized')` 1, mutation tokens 0, `listCategories` 1, `FilterCollectionList__empty` 0.
- Byte-identity by digest: `themeTokens.test.ts`, `cssTokenSweep.test.ts` and `public/locales/en/gamelib.json` match the pre-edit digests.

## Deviations from Plan

None - plan executed as written. One implementation choice worth noting: `NavItem` has no `title` prop, so the per-row `title` is carried by an inner `<span title>` via `labelElement` instead of editing `NavItem` (a shared primitive outside the plan's file list). The plan's clamp-selector criterion still holds: the clamp targets NavItem's own label span via the child combinator.

**Total deviations:** 0. **Impact:** none.

## Known Stubs

None.

## Threat Flags

None. T-48-07 (read-only collections) and T-48-08 (name rendered only as text child and `title`, no `dangerouslySetInnerHTML`) are mitigated and source-gated; T-48-09 accepted as planned.

## Not claimed

Nothing here proves a long collection name visually ellipses, that the four sub-groups read as sub-structure rather than four headers, or that the section reads correctly in all themes. The Frontend jest project has no CSS engine, so this is owed to the live gate. Note also the inner `title` span means the hover tooltip covers the label text, not the full button area.

## Self-Check: PASSED

- FilterFocusRow `index.tsx`, `index.scss` and `__tests__/filterFocusRow.test.tsx` exist.
- Commits `f90861696`, `107fa1b27`, `1ba490818` present in `git log`.

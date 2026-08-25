---
created: 2026-08-25T11:00:10.000Z
title: "Phase 34.11 carries 14 open Warning-level review findings — swept and confirmed present at HEAD, no Criticals among them"
area: frontend
severity: low
status: pending
resolves_phase: "34.11"
found_by: "Quick task 260825-vy5, while writing 34.11-REVIEW-FIX.md to move the phase off blocked"
source: ".planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md"
files:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/components/FilterZeroResult/index.tsx
  - src/frontend/screens/Library/components/FilterChipRow/index.tsx
  - src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
  - src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx
  - src/frontend/components/UI/Header/index.css
  - src/frontend/types.ts
  - meta/i18nGateScope.json
---

`34.11-REVIEW.md` found 4 Critical and 19 Warning findings. All 4 Criticals plus WR-02,
WR-03, WR-13, WR-14 and WR-15 are discharged — swept against `HEAD` and ledgered per
finding in `34.11-REVIEW-FIX.md`. **Fourteen Warnings were confirmed still present** and
are collected here so they are not carried unowned.

`criticals_open: 0`. None of these contradicts a declared REQ-34.11-01..17 truth, which is
why `34.11-VERIFICATION.md` stands at `passed` 17/17 alongside them.

Grouped by the shape of the fix, cheapest first:

**Provenance / dead code — mechanical**
- **WR-17 / WR-18** — `meta/i18nGateScope.json` `baseCommit` is `b5b5cad3f` (2026-06-23),
  predating every file it lists; `generatedBy` says outright it is hand-edited. `facetLabels`
  and `chipLabels` are absent from `files` entirely. One `pnpm gen-i18n-gate-scope` run
  closes both — but see the staleness guard in `meta/__tests__/genI18nGateScope.test.ts`
  first, and check what else a regeneration moves.
- **WR-04** — the three legacy filter-state blocks (`storesFilters`, `platformsFilters`,
  `crossoverRatingFilters`) survive at `Library/index.tsx:131-207` with their setters and
  `localStorage` reads, plus the stale forward-reference at `types.ts:337-339`. Their only
  consumers (`LibraryFilters`, `CategoryFilter`) are already deleted from disk.
- **WR-19** — `Header/index.css:7` dead background, `:21-39` unscoped global selectors
  (`.iconsWrapper`, `.refreshIcon`, `.svg-button`).
- **WR-07** — `resolveLabel` duplicated verbatim between `FilterChipRow/index.tsx:40` and
  `FilterZeroResult/index.tsx:34`; the latter's comment acknowledges the duplication.
  Moving it into `chipLabels.ts` keeps it React-free.

**Correctness — small but real**
- **WR-06** — a module-scope `throw` at `FilterRunnabilityFacet/index.tsx:68-77` crashes the
  whole app on import if the dev-only drift check ever fires. Move the assertion into the
  test suite. ⚠ This one is easy to grep past: the `throw` is indented inside the
  `if (process.env.NODE_ENV !== 'production')` block, so a `^throw` pattern misses it.
- **WR-01** — the `libraryUnion` memo (`Library/index.tsx:674-684`) omits every login-gate
  input `makeLibrary` reads, so a login/logout that changes only `username` leaves a stale
  grid and stale counts. Live `react-hooks/exhaustive-deps` warning corroborates.
- **WR-09** — a stale `currentCollection` (`Library/index.tsx:261`) silently filters the
  entire library away; no validation on read or on category-list change.
- **WR-05** — `recentAppNames` is `useMemo(..., [])`, captured once at mount.
- **WR-12** — `activeFilterCount` is the *unfiltered* `activeFilterDescriptors.length`
  (`Library/index.tsx:894`), so a descriptor with no `chipLabelSpec` mapping inflates the
  count and can empty the sentence to `"No games match ."`. The recommended null-filter is
  already present at `FilterZeroResult/index.tsx:92-94`; the count and a
  `labels.length === 0` guard are the residual.

**UX**
- **WR-08** — `+ New collection` and `Manage collections`
  (`FilterCollectionList/index.tsx:94-111`) both call `setShowCategories(true)`; two rows,
  one behaviour.

**Test quality**
- **WR-16** — the i18next-injection tests are vacuous: `react-i18next` is mocked at
  `FilterChipRow/__tests__/index.test.tsx:348` and no `i18next.createInstance()` exists
  anywhere under `screens/Library/`.

**Blocked on a decision, not on work**
- **WR-10 / WR-11** — the alphabet letter is excluded from `activeFilterCount` and from
  `clearAllFilters` by decision **D-08**, deliberately. `Library/index.tsx:917` documents
  the exclusion. These close only if D-08 is revisited; do not "fix" them as bugs without
  reopening that decision first.

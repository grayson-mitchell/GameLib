---
created: 2026-08-25T11:00:10.000Z
title: "Phase 34.11 carries 10 open Warning-level review findings — swept and confirmed present at HEAD, no Criticals among them"
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
  - meta/i18nGateScope.json
---

**2026-08-27 update (quick `260827-s8z`):** this list was re-swept against the current
`HEAD` (after that task's own three commits landed). WR-04, WR-07 and WR-19 are now
**FIXED** and are removed from the groups below; WR-17 is reclassified **INVALID** (see
`34.11-REVIEW-FIX.md` for the generator-contract evidence) and is also removed. The
remaining ten bullets below were re-confirmed still present, unchanged in substance.

`34.11-REVIEW.md` found 4 Critical and 19 Warning findings. All 4 Criticals plus WR-02,
WR-03, WR-04, WR-07, WR-13, WR-14, WR-15 and WR-19 are discharged, and WR-17 is
reclassified invalid — swept against `HEAD` and ledgered per finding in
`34.11-REVIEW-FIX.md`. **Ten Warnings were confirmed still present** and are collected
here so they are not carried unowned.

`criticals_open: 0`. None of these contradicts a declared REQ-34.11-01..17 truth, which is
why `34.11-VERIFICATION.md` stands at `passed` 17/17 alongside them.

Grouped by the shape of the fix, cheapest first:

**i18n gate scope — design decision needed**
- **WR-18** — (WR-17, formerly paired with this finding, is now closed **INVALID**; see
  `34.11-REVIEW-FIX.md`.) `facetLabels.ts` and `chipLabels.ts` are absent from
  `meta/i18nGateScope.json`'s `files` list. Measured (quick `260827-s8z`): the committed
  scope is 163 files / **0** violations; adding these two files is 165 files / **35**
  violations (8 + 27), all `object-property`/`argument` literals from English-default
  **data tables** whose `t()` call sites are already in scope — a false-positive count
  against a currently-green blocking gate, not a real gap. Closing this needs either a
  spec-table-aware gate heuristic or `meta/i18nGateAllowlist.json` entries with `expected`
  counts. Do **not** run `pnpm gen-i18n-gate-scope` to close it — that would also disarm
  the `isHandCuratedProvenance()` default-deny veto WR-17's re-sweep found load-bearing.

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

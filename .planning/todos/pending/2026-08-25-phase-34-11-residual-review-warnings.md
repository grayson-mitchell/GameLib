---
created: 2026-08-25T11:00:10.000Z
title: "Phase 34.11 carries 5 open Warning-level review findings — swept and confirmed present at HEAD, no Criticals among them"
area: frontend
severity: low
status: pending
resolves_phase: "34.11"
found_by: "Quick task 260825-vy5, while writing 34.11-REVIEW-FIX.md to move the phase off blocked"
source: ".planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md"
files:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
  - src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx
  - meta/i18nGateScope.json
---

**2026-08-27 update (quick `260827-s8z`):** this list was re-swept against the current
`HEAD` (after that task's own three commits landed). WR-04, WR-07 and WR-19 are now
**FIXED** and are removed from the groups below; WR-17 is reclassified **INVALID** (see
`34.11-REVIEW-FIX.md` for the generator-contract evidence) and is also removed. The
remaining ten bullets below were re-confirmed still present, unchanged in substance.

**2026-08-27 update (quick `260827-t9c`):** WR-01, WR-05, WR-06, WR-09 and WR-12 are now
**FIXED** (`a0e7dfed7` for WR-06/WR-12, `4ba13c636` for WR-01/WR-05/WR-09; see
`34.11-REVIEW-FIX.md` for the per-finding evidence) and are removed from the groups below.
The "Correctness — small but real" group is now empty and its heading is removed along
with it. The remaining five — WR-08, WR-10, WR-11, WR-16, WR-18 — were not re-swept by
this task and are carried unchanged.

`34.11-REVIEW.md` found 4 Critical and 19 Warning findings. All 4 Criticals plus WR-01
through WR-07, WR-09, WR-12, WR-13, WR-14, WR-15 and WR-19 are discharged, and WR-17 is
reclassified invalid — swept against `HEAD` and ledgered per finding in
`34.11-REVIEW-FIX.md`. **Five Warnings were confirmed still present** (WR-08, WR-10,
WR-11, WR-16, WR-18) and are collected here so they are not carried unowned.

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

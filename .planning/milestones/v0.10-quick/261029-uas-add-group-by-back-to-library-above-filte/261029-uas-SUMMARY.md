---
phase: quick-261029-uas
plan: 01
status: complete
commits: [f4ed73755, 236bfc21d]
---

# Quick 261029-uas: Group by restored under Sort by

Library Group by (None / Install status / Store) is back as a themed Dropdown+NavItem row inside `Header__sortGroup`, directly under Sort by and above the Filters heading, persisted under `libraryGroupBy` (default installStatus, legacy `sortInstalled` migrates), with a tour step on `data-tour="library-group-by"`.

## Tasks

1. Group-by model, persistence and Library wiring (f4ed73755): `sortAndGroupLibrary` layered on the unchanged `sortLibrary`; `installing` derived from a joined-string memo key so download ticks do not recompute the sort.
2. Header row, CSS (`.Header__groupByRow { grid-template-columns: 1fr }`), tour step and tests.

## Verification

- jest: librarySort, headerTourAnchors, libraryTourAnchors: 71/71 pass.
- `npx tsc --noEmit -p .` clean; prettier --check clean on all touched files.
- No `<select>` element in Header (the only grep hit is an existing comment).

## Deviations

None. A pre-existing staged change to `public/locales/en/gamepage.json` was left staged and uncommitted (commits used `-- <paths>`).

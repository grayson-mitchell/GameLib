---
phase: quick-261027-jjz
plan: 01
subsystem: library-ui
tags: [library, sort, group-by, i18n, preload]
requires: []
provides:
  - "librarySort.ts pure sort/group/persistence module"
  - "storeEnsureHydrated preload surface"
  - "Games panel sort-field/direction + group-by controls"
affects: [Library, Header, LibraryTour, gamelib catalogs]
key-files:
  created:
    - src/frontend/screens/Library/librarySort.ts
    - src/frontend/screens/Library/__tests__/librarySort.test.ts
  modified:
    - src/preload/tauriTransport.ts
    - src/preload/api/misc.ts
    - src/frontend/types.ts
    - src/frontend/screens/Library/LibraryContext.tsx
    - src/frontend/screens/Library/index.tsx
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/components/UI/Header/index.css
    - public/locales/*/gamelib.json
    - public/locales/*/gamelib.mt.json
decisions:
  - "Orchestrator amendment: changing the sort field resets direction to defaultDirectionFor(field) (Name asc, Last played desc, Install size desc); the direction button flips it after"
  - "librarySortTitle, LibrarySortPrefs, SortAndGroupOptions are not exported (deadcode gate flags used-in-module exports)"
metrics:
  tasks: 3
  commits: 4
---

# Quick 261027-jjz: Library sort slice 1 Summary

Sort field (Name / Last played / Install size) + direction and a separate group-by (None / Install status / Store) replace the `sortDescending` / `sortInstalled` booleans, with a pure tested module, preload lazy-store hydration, Header controls, tour steps and 12 strings in all 49 gamelib catalogs.

## Commits

- test RED: failing tests for librarySort
- feat GREEN: librarySort module (22 jest cases, incl. `defaultDirectionFor`)
- feat: state/context/Library/Header wiring, preload `storeEnsureHydrated`, tour, tests
- feat: 12 strings in 49 catalogs (97 files)

## Deviations

- Amendment applied (see decisions): `handleSortField` writes field and that field's default direction.
- [Rule 1] Dropped `export` on `librarySortTitle`, `LibrarySortPrefs`, `SortAndGroupOptions`: `meta/__tests__/findDeadcode.test.ts` failed on them.
- Machine fill unavailable (no ANTHROPIC key); 48 locales hand-authored, validated with the real `validateTranslation()` (576 pairs, 0 problems, sabotage controls report problems). `de`/`fr` keep their original key order (no `noStorePage` reorder churn).
- Insertion of `mt.json` keys is at sorted position within each file's sorted prefix (files carry an unsorted tail from earlier appends).

## Pre-existing red (not caused by this plan)

Full `pnpm jest`: 8 failing suites, none touch changed files except noted: steamBridgeKnownFixes, installFlows, runnerSliceRegistration, testContainment, isIntelMacRemoved, machineFillGamelib (3 `pluralCategoriesFor` ICU cases), genI18nGateScope (committed `i18nForkTouchedFiles.json` was already stale by 16 files; the new `librarySort.ts` adds one more to the live derivation; not rewritten here), findDeadcode (fixed, now green).

## Self-Check: PASSED

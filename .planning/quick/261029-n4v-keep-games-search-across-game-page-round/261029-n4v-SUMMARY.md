---
phase: quick-261029-n4v
plan: 01
status: complete
completed: 2026-10-29
commits: [9f31eff90, 7a86b8c0c, 4d20a2ccd, 931051f98]
---

# Quick 261029-n4v: Keep Games search across game-page round trip, and per-tab location memory

Games `filterText` and `alphabetFilterLetter` now live in an in-memory module store (`Library/librarySessionSearch.ts`), and each tier-1 tab remembers its last location for the session (`NavShell/tabLocationMemory.ts`).

## Changes
- Task 1: Library seeds both states from the session store via lazy initialisers and writes back in one effect. clearAllFilters is unchanged and still clears the kept copy. No storage key (D-22 intact).
- Task 2: NavShell records every location; NavTabs gets each tab's `to` and `state` from `resolveTabTarget`. The lit tab goes to its root.

## Ownership rule
A location belongs to the tab `resolveActiveTab` lights, so every game page belongs to Games, even one opened from Downloads. No tab remembered its location before this change. Game pages without `gameInfo`, `/loginweb` and unrouted paths are never remembered.

## Tests
- librarySessionSearch (4 unit + 4 source-gate), clearAllFiltersCoverage, alphabetLetterIsAFilter: 19 passed.
- tabLocationMemory, NavTabsComponent, NavShell, destinationCoverage, navTabs: 107 passed.
- codecheck clean; lint 0 errors (pre-existing warnings); prettier clean on all written paths.

## Deviations
None. The optional live check was not run.

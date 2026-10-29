---
phase: quick-261029-nag
plan: 01
status: complete
key-files:
  modified:
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/Library/index.tsx
    - src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
metrics:
  completed: 2026-10-29
---

# Quick 261029-nag summary

`handleNonAvailableGames` lists a game only if `getGameInfo` still has it installed; a mid-uninstall
game is dropped and reported available. The Library silent-exclusion guard waits until the
reconcile pass has finished for the current `libraryUnion`.

Tests: three new `handleNonAvailableGames` cases (uninstalled not listed, installed-missing still
listed, failed lookup keeps the old verdict); the first failed on the old code. The existing
over-correction guard now mocks `getGameInfo` as installed. The guard change has no direct test
(a log-only effect in the Library screen).

Verification: frontend hooks + Library 54 suites / 1227 tests, tsc clean, prettier clean, eslint 0
errors. Not yet seen live: uninstall a game and check the log for no "silently excluded" line.

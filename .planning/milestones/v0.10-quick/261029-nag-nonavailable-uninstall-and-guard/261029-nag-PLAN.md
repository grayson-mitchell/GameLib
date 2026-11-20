---
phase: quick-261029-nag
plan: 01
type: quick
autonomous: true
files_modified:
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
---

# Quick 261029-nag: uninstall no longer lists a game as non-available; the guard waits for reconcile

## Problem (gamelib.log 2026-10-29 08:39 and 11:07:54, Grim Dawn 219990)

`Library: 1 owned Steam game(s) silently excluded from the library grid by a stale
nonAvailableGames entry: 219990`, logged once per uninstall, never repeated.

1. An uninstall deletes the files before the card's `is_installed` flips. `hasStatus` reaches its
   installed branch, `isGameAvailable` (false for any not-installed game) says no, and
   `handleNonAvailableGames` adds the game to `nonAvailableGames`.
2. `reconcileNonAvailableGames` heals it asynchronously, but the silent-exclusion guard runs
   synchronously in the same commit against the pre-heal deps, so it logs a false alarm.

## Change

1. `handleNonAvailableGames`: on an unavailable verdict, ask `getGameInfo`; if the backend has the
   game as not installed, drop it from the list and report it available. A failed lookup keeps the
   old verdict.
2. `Library/index.tsx`: record the `libraryUnion` the reconcile pass last finished for; the guard
   returns early until it matches.

## Tasks

### Task 1: both fixes + tests

<verify>
- `npx jest src/frontend/hooks src/frontend/screens/Library` (new mid-uninstall test fails on the old code)
- `npx tsc --noEmit -p .`
- `npx prettier --check` over the three written paths; eslint 0 errors
</verify>

<done>
An uninstall leaves no `nonAvailableGames` entry, and the guard only logs a game still excluded
after the reconcile pass.
</done>

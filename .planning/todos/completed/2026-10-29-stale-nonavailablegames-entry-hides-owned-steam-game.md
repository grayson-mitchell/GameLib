---
created: 2026-10-29
title: "A stale nonAvailableGames entry silently excludes owned Grim Dawn (219990) from the library grid"
area: library
severity: minor
platform: any
ready: code
source: "phase 56 live gate (56-26), 2026-10-29"
---

## Problem

After the Steam re-login and library sync, the frontend logged `ERROR Library: 1 owned Steam game(s) silently excluded from the library grid by a stale nonAvailableGames entry: 219990` (08:39:39). The reconciliation pass (`Library/index.tsx`, `reconcileNonAvailableGames`) did not heal it. The game was still reachable through its page, and no user-visible grid effect was reported.

## Next

Find why reconcileNonAvailableGames left 219990 excluded after the sync; reproduce with an uninstall then re-login.

## Resolution

2026-10-29, fixed by quick 261029-nag (`674fef9db`). Two causes. The uninstall deleted the files before the card's `is_installed` flipped, so `handleNonAvailableGames` saw `isGameAvailable` false and listed the game; it now asks `getGameInfo` first and drops a game the backend already has as uninstalled. The log line itself was mostly a false alarm: the silent-exclusion guard ran in the same commit as the asynchronous reconcile pass, against the pre-heal deps, so it logged an entry that was healed moments later (it appeared once per uninstall, never repeated). The guard now waits until reconcile has finished for the current `libraryUnion`. Regression test covers the mid-uninstall case; not yet confirmed live (next uninstall should log no "silently excluded" line).

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

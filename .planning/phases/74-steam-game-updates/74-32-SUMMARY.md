---
phase: 74-steam-game-updates
plan: 32
subsystem: steam-library-frontend
tags: [steam, library, signed-out, update-detection, gap-closure]
requires: ["74-31"]
provides:
  - installed-only Steam visibility with no identity
  - sign-out keeps installed Steam entries
  - mount refresh gate counts installed cached Steam games
  - update check after sign-in
affects: [Games grid Steam facet, authState, initStateSubscriptions]
key-files:
  modified:
    - src/frontend/screens/Library/steamLibraryVisibility.ts
    - src/frontend/screens/Library/__tests__/steamLibraryVisibility.test.ts
    - src/frontend/state/authState.ts
    - src/frontend/state/__tests__/authState.test.ts
    - src/frontend/state/initStateSubscriptions.ts
    - src/frontend/state/__tests__/initStateSubscriptions.test.ts
    - src/frontend/state/__tests__/GlobalStateSteamLogout.test.ts
    - .planning/todos/completed/2026-11-13-installed-steam-games-hidden-when-signed-out.md
key-decisions:
  - "No identity: installed entries only; not-installed never shown without an identity"
requirements-completed: [STEAM-01, STEAM-02]
duration: 25min
completed: 2026-11-13
---

# Phase 74 Plan 32: Installed Steam games visible signed out Summary

Signed out of Steam, the Games grid now lists every installed Steam game from the cached library (owned-not-installed stay hidden), the Steam facet row appears exactly when one is installed, sign-out keeps installed entries, a Steam-installed boot runs the mount refresh with its update check, and sign-in runs an update check after its sync.

## Tasks

1. Visibility: no-identity branch returns `is_installed` entries; `storeConnected` is `games.length > 0` with no identity (commit 3a0ce0478). RED: 12 tests failed before the source change; new saboteur proves a full-library result signed out is caught.
2. authState/initStateSubscriptions: steamLogin refresh adds `checkForUpdates: true`; steamLogout filters to installed; `readMountStoreUsers.steamUser` also true when the cached library has an installed game; todo moved to completed with Resolution (commit 718ad3e3b). RED: 3 tests failed before the source change.

## Deviations from Plan

- [Rule 3] `GlobalStateSteamLogout.test.ts` encoded the old "library reset on confirmed sign-out" contract; updated it to the installed-only contract (confirmed: installed kept, owned dropped; unconfirmed: untouched).
- The first commit of Task 2 captured only the rename (a stale `git add` path aborted staging); amended locally before any push so the commit holds all files.

## Verification

jest over src/frontend/state and Library (989 pass), tsc, lint (0 errors), find-deadcode, planning-gates (12/12), prettier all green. Live proof is the 74-33 gate.

## Self-Check: PASSED

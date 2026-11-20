---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 08
subsystem: frontend
tags: [gameinfo, narrowing, game-screen]
requires: [70-01, 70-03]
provides:
  - Game screen readers narrowed via asStoreGame; GOG modify modal typed GogGameInfo
affects: [70-10, 70-11]
key-files:
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
    - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GameSubMenu/index.tsx
    - src/frontend/screens/Game/TimeContainer/index.tsx
    - src/frontend/screens/Game/ModifyInstallModal/GOG/index.tsx
key-decisions:
  - "Narrow inline at each read site with asStoreGame(gameInfo, runner)?.field; the parent ModifyInstallModal already narrows with isStore(gameInfo, 'gog'), so no parent edit was needed"
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 08: Game screen narrowing Summary

All eight Game-screen files read Steam, legendary and GOG fields only through `asStoreGame` or a store-typed prop. Flip probe reports zero errors under src/frontend/screens/Game (exit 0), down from 21 non-test errors.

- Legendary: isEAManaged and isUbisoftManaged (GamePage, DownloadSizeInfo, InstalledInfo).
- Steam: steamPlatformsCaptured (AppleWikiInfo), is_delisted and install.steamResumePending (MainButton, GameSubMenu), extra.steamPlaytimeMinutes and steamLastPlayed (TimeContainer).
- ModifyInstallModal/GOG props typed `GogGameInfo`.
- Core reads (thirdPartyManagedApp, is_windows_native) untouched.

Acceptance counts: `is_windows_native === true` in GameSubMenu was 0 before the edit (the Windows-depot gate is not spelled that way in this file) and 0 after, so the gate is unchanged. Zero member casts.

## Verification

`tsc --noEmit`: 1 error, the known 70-11-owned legendaryRuntime.test.ts:28. Frontend jest: 327 suites / 5581 tests pass. `pnpm lint` exits 0. Prettier applied to the eight files.

## Commits

- 33327b5c6 refactor(70-08): narrow Game screen readers via asStoreGame; GOG modify modal takes GogGameInfo

## Deviations from Plan

None. Both tasks were committed together as one commit because the files are interdependent for the probe gate.

## Known Stubs

None.

## Self-Check: PASSED

---
created: 2026-10-29
title: "A failed DRM-mode launch leaves the card on redist/winetricks when no download progress was sent"
area: steam-bridge
severity: minor
platform: any
ready: code
source: "phase 56 code review round 3 (56-REVIEW.md WR-01), 2026-10-29"
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
---

## Problem

56-27 made a failed DRM-ready launch send a terminal `done`, but only when `drm.progressSent` is true (`games.ts:3943-3958`). `progressSent` is set only by `drmLaunchSetup`'s own download steps, and since quick 261029-e2t prefetches those at install time, a normal Play hits the cache and `progressSent` is false.

Inside `launchDrmModeGame` → `fireBridgeWineLaunch`, non-terminal statuses are sent before any DRM check:

- `applySteamBridgeKnownFixes` sends `winetricks` and `redist` (`bridgeKnownFixes.ts:229`, `:279`).
- `installSteamBridgeSharedRedists` sends `redist` (`sharedRedistInstall.ts:481`, `:659`).

Two DRM-only exits then `return false` with no status: `buildDrmLaunchEnvironment` returning an error (`games.ts:4393`), and a DLL-override registry write failing or timing out (`games.ts:4456`). `launching`, which would normally supersede those statuses, is sent only by `startBottleProcessMonitor`, which runs after both exits. The card stays on `redist`/`winetricks`. This is the old IN-01 stale-status bug reached through a different producer. The 56-27 unit test covers only `progressSent: true`.

## Next

`done` is idempotent, and nothing else ends a Steam launch's status (`dispatchSteamLaunch` bypasses `launchEventCallback`). So send `done` on every `!launched`, not only when `progressSent`, and consider a `try/finally` so an exception thrown out of `launchDrmModeGame` also ends the status. Add a test with `progressSent: false` where the launch returns false after a `redist` status.

---
created: 2026-11-07T00:00:00.000Z
title: 'Console Mode: add a Platform row (macOS default, Windows alternative) for dual-build Steam games'
area: steam
severity: minor
platform: macos
ready: code
found_by: 'quick 261107-lum (follow-up; Console Platform row was out of scope there)'
---

Console Mode's install overlay offers no Platform row for Steam games (D13 gate in `src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts`, `showPlatform`/`hasWine` keep `!isSteam` in `InstallOverlay/index.tsx`). A dual-build Steam title (Mac build plus a proven Windows depot) can therefore only install its Mac build from Console.

Quick 261107-lum unblocked this: a forced-Windows Steam install now resolves the normal bridge verdict and lands in its own `GameLibSteamBridge-<appId>` bottle, so the premise that it always reaches the shared bottled client (and so needs a shared Wine choice) no longer holds.

Build the Platform row (macOS default, Windows alternative) for dual-build Steam games, with no Wine row, passing `forceWindowsViaBottle` into `installSteamGame` when Windows is picked (the route-notice and bridge-setup retries already replay it). Then lift the D13 gate: update `assertNoWindowsOfferForSteam` and its RED tests, and the comment in `InstallOverlay/index.tsx` that points at this todo.

**Resolved 2026-11-07 by quick 261107-mr0** (commit 25839cfe6). Console Mode's install overlay shows a Platform row (macOS default, Windows alternative) only for a dual-build Steam game on macOS whose `getSteamBridgeRoute(appId, true)` verdict is `bridge`; never a Wine row. The row stays hidden until the eligibility probe and the bridge verdict both resolve (Install installs macOS meanwhile). Windows passes `forceWindowsViaBottle` via `installSteamGame(app, game, undefined, true)`; Install-to reads "Its own Windows bottle". The D13 gate became `assertConsoleSteamPlatformContract`. Not live-checked in Console Mode (optional check on Undertale 391540).

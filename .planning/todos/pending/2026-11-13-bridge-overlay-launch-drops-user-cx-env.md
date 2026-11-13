---
created: 2026-11-13T00:00:00.000Z
title: "Bridge overlay launch drops the user's per-game CX_ENV value"
area: steam
severity: medium
platform: macos
ready: code
source: 'debug opengl-bridge-overlay-no-attach (2026-11-13): probe runs 1 and 2 on Dungeons of Dredmor 98800'
files:
  - src/backend/storeManagers/steam/gameBridgeWineLaunch.ts:362-385
  - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts:43-60
---

The operator set the per-game env var `CX_ENV=STEAM_OVERLAY_LOGGING=1 STEAM_OVERLAY_LOGGING_FLUSH=1`
on Dungeons of Dredmor (98800). GameLib logged
`98800: Setting enviromentOptions to [{"key":"CX_ENV",...}]` at 19:45:01. Then came a bridge launch
on the CrossOver overlay runner (cx-env overlay branch). A passive probe dylib inside the game
process (`Dungeons of Dredmor.exe`, pids 80509 and 83280) saw:

- `CX_ENV` beginning directly with the overlay's `DYLD_INSERT_LIBRARIES='…'` token. The user's
  `STEAM_OVERLAY_LOGGING=…` prefix was gone.
- `STEAM_OVERLAY_LOGGING` and `STEAM_OVERLAY_LOGGING_FLUSH` unset.
- `SteamGameId` and `SteamOverlayGameId` (98800) set.

`appendCxEnvTokens()` keeps an existing `CX_ENV` value first, and its call site in
`gameBridgeWineLaunch.ts` (cx-env branch, about L375-380) passes `launchSettings.enviromentOptions`.
So the value is lost elsewhere. Either `launchSettings.enviromentOptions` doesn't carry the per-game
entry at that point, or something downstream rebuilds `CX_ENV` from the overlay tokens alone (the
wine spawn env builder, or the DRM/known-fix env paths).

Consequence: per-game `CX_ENV` is silently ignored on bridge overlay launches. Anything a user (or a
known fix) puts there to reach the game process never arrives. That includes renderer logging and
SDL/Wine levers.

Fix: trace `enviromentOptions` from the per-game settings read to the wine spawn. Add a unit test
that a user `CX_ENV` value survives the cx-env overlay merge into the final spawn env. Live check:
a game-process probe or Steam's `/tmp/gameoverlayrenderer.<pid>.log` appearing with
`STEAM_OVERLAY_LOGGING=1`.

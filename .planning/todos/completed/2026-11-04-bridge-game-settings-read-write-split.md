---
created: 2026-11-04T00:00:00.000Z
title: 'Bottle-eligible Steam games: per-title settings are written to GamesConfig/<appId>.json but read back from the shared bottle settings'
area: settings
severity: medium
platform: macos
ready: code
found_by: '60-13 audit of the 60-UAT G3 defect (Off reopened as Automatic)'
status: 'RESOLVED 2026-11-04 (quick 261104-rvy): getSettings() merges an allowlist of 11 title-authoritative keys from GamesConfig/<appId>.json over the bottle settings; bottle stays authoritative for wine/prefix/bottle keys.'
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/sidecar/gameSettingWrite.ts
  - src/backend/storeManagers/steam/bottle.ts
---

## Problem

`SteamGame.getSettings()` for a bottle-eligible title returns `getSteamBottleSettings()`
(global settings + the shared bottle name and wineVersion). The Settings screen writes every
key through `setSetting` -> `applyGameSetting` into the title's own `GamesConfig/<appId>.json`.
So a key written per title does not come back on reopen unless `getSettings()` merges it.

60-13 fixed `steamOverlayOverride` (like `steamEngineOverride` in 59-UAT G11). The other
per-game keys the Games tab renders for a Steam title on macOS take the same path and are
still read back from the shared/global values:

- `launcherArgs`, `alternativeExe`, `targetExe`
- `enviromentOptions`, `wrapperOptions`
- `beforeLaunchScriptPath`, `afterLaunchScriptPath`
- `preferedLanguage`, `verboseLogs`, `showFps`, `showMangohud`
- `lastUsedLaunchOption` (launcher.ts reads it via `game.getSettings()`)

launcher.ts line 145 also calls `game.getSettings()`, so the launch itself reads the shared
values for these keys too. Which source is authoritative per key (title file, bottle, or
global default) is a design question, so it was not decided in 60-13.

## Direction

Decide per key, then merge the title's GameConfig over the bottle settings in `getSettings()`
(or generalise the G11/G3 merge), with a regression test per key.

## Resolution

Quick 261104-rvy. `getSettings()` now merges an allowlist of 11 title-authoritative keys
(launcherArgs, targetExe, enviromentOptions, wrapperOptions, beforeLaunchScriptPath,
afterLaunchScriptPath, language, verboseLogs, showFps, showMangohud, lastUsedLaunchOption)
from `GamesConfig/<appId>.json` over the bottle settings when present. The bottle stays
authoritative for wineVersion, wineCrossoverBottle, winePrefix and every other key. The
planned names `alternativeExe` and `preferedLanguage` were Settings component names; the
real keys are `targetExe` and `language`. New files:
`src/backend/storeManagers/steam/titleSettings.ts` and its test.

---
created: 2026-11-07T22:07:24.534Z
title: "Launch without Steam: run Steam games that don't use the Steam API directly, like Epic's offline launch"
area: launch
files:
  - src/backend/storeManagers/steam/bridge/importScan.ts (scanSteamApiImports ~59)
  - src/backend/storeManagers/steam/bridge/shimDrmWrapper.ts (detectDrmWrapper ~24, detectExeSteamDrm ~99)
  - src/backend/storeManagers/steam/drmKnownFix.ts (curated CEG list)
  - src/backend/storeManagers/steam/launchDispatch.ts (single Steam launch dispatch)
severity: minor
platform: macos
ready: live-gate
---

## Problem

Every Steam launch in GameLib needs the Steam app. Mac-native and Linux titles go through
`steam://rungameid`. Bridge games run in GameLib's bottle but forward Steam calls to the running
Mac Steam. Epic (legendary) can launch a game offline without its client. Steam has no such
option: Steam's own "offline mode" still needs the client running.

Raised by the operator 2026-11-08 while building the "Steam Lib Actions" table. Launch is the
row with no option to remove the Steam dependency.

What can work depends on whether the game uses the Steam API, not only on whether it has DRM:

| Kind of game | Launch without Steam? |
| --- | --- |
| Doesn't use the Steam API (no `steam_api` / `libsteam_api`, no Steam DRM wrapper) | Yes: run the program directly |
| No DRM, but uses the Steam API | Depends on the game. `SteamAPI_Init` fails without Steam: some games keep running without Steam features, many quit, many relaunch through Steam (`SteamAPI_RestartAppIfNecessary`) |
| Steam DRM (SteamStub, CEG) | No |

## Solution

A "Launch without Steam" option, shown only when GameLib can tell the game qualifies.

- **Detection (reuse what exists):** the bridge already scans programs for `steam_api` imports
  (`importScan.ts`), detects SteamStub (`shimDrmWrapper.ts`), and keeps a curated CEG list
  (`drmKnownFix.ts`). Today that only runs for bridge (Windows PE) games. Mac-native games need a
  Mach-O version: `libsteam_api.dylib` in the bundle, or a link to it (`otool -L`). Cache the
  verdict per install, and redo it when the install changes (buildid/manifest GID).
- **Eligible:** no Steam API and no DRM wrapper → offer it. Optionally add a curated allowlist of
  Steam-API games confirmed (live) to keep running when `SteamAPI_Init` fails, recorded the same
  way as the known-fixes data.
- **Launch:** run the game's program directly: Mac-native natively, Windows games in their bridge
  bottle without the bridge forwarding. Use the ACF/appinfo launch config for the executable and
  arguments. GameLib owns the process, so Stop works (see
  `2026-11-07-stop-steam-launched-games-by-pid.md`).
- **What you lose, said in the UI:** no Steam Cloud sync, playtime, achievements or overlay for
  that session.
- **Boundary (do not cross):** never replace `steam_api` with an emulator (Goldberg-style) to get
  Steam-API games running without Steam. That bypasses Steam's ownership check and is outside the
  DRM boundary already set (genuine Valve DLLs plus the export trampoline only). Games that need
  Steam stay on the Steam launch.

Live gate: pick at least one game from each row of the table above. Check the option appears
only for eligible games and that an eligible game launches with Steam fully quit. For a Steam-API
game, record whether it keeps running, quits, or relaunches through Steam.

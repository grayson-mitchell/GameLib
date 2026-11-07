---
created: 2026-11-07T22:09:16.576Z
title: "Implement Steam game updates (SteamGame.update() is a stub; bridge games have no updater at all)"
area: steam-install
files:
  - src/backend/storeManagers/steam/games.ts (update() ~445, "not implemented until Phase 2")
  - src/backend/storeManagers/steam/gameInstallBridge.ts (bridge install into the bridge bottle's own steamapps ~582)
  - src/backend/storeManagers/steam/depot.ts (depot downloader)
  - src/backend/storeManagers/steam/steamInstallApp.ts (InstallApp / UninstallApp helper calls)
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts (per-GID redist ledger)
severity: major
platform: macos
ready: live-gate
---

## Problem

GameLib cannot update a Steam game. `SteamGame.update()` (`games.ts` ~445) logs
`SteamGame.update not implemented until Phase 2` and returns an error. Found while building the
"Steam Lib Actions" table (2026-11-08). Update is one of the four actions you can't start from
GameLib.

There are two separate cases:

1. **Games Steam has registered** (Mac-native installs, whether GameLib or Steam downloaded
   them). Steam updates these itself, automatically or before launch, so they don't go stale.
   But GameLib can't show "update available" or start an update.
2. **Bridge games: nobody updates them.** The bridge install writes into the bridge bottle's
   own `steamapps` (`gameInstallBridge.ts` ~582, `getBridgeBottleSteamappsRoot()`). Mac Steam
   never looks there, and no Windows Steam runs in that bottle. A bridge game stays on the build
   it was installed at until it is uninstalled and reinstalled. Multiplayer games break as soon
   as the server moves to a newer build. This is why it's `major`.

Confirm case 2 live before building: install a bridge game, wait for an update to ship (or
compare the installed ACF `buildid` with the current public build), and check that nothing
changes it.

## Solution

**Detect updates (both cases).** Compare the installed ACF `buildid` / per-depot manifest GIDs
with the public branch in PICS appinfo (the anonymous client already fetches appinfo). Show an
"Update available" state on the card and game page. Check on library refresh and before launch.
Respect the sidecar exit contract: no unbounded check at boot.

**Case 2, bridge games: GameLib updates them itself.**
- Delta download: diff the old manifest against the new one per depot, download only changed
  chunks, delete files that are gone, and keep user files the old manifest didn't own. No delta
  support exists in `depot*` today, so either build it or accept a full re-download as a first
  step.
- Rewrite the ACF (`buildid`, `InstalledDepots` GIDs), then redo the GID-dependent follow-ups:
  steam_api shim rescan/re-placement (the originals change), the redist ledger (keyed per
  manifest GID), and the DRM/known-fix verdicts.
- Refuse while the game is running. Make it resumable through the download queue like an
  install.

**Case 1, Steam-registered games: ask Steam.**
- Spike first: does `InstallApp` on an already-installed app start its update (spike 065
  tested it on an uninstalled app only)? If not, look for an update or validate method in
  Steam's internal app manager, next to InstallApp/UninstallApp in the helper's method map
  (spikes 065/067 found those two).
- Fallbacks: launching through Steam already applies a required update; `steam://validate` is
  untested.
- GameLib's own delta updater could also cover these, but Steam must not have the app loaded,
  or it would overwrite or conflict. Decide that after the spike.

Live gate: a bridge game with a pending update shows "Update available", updates, keeps saves
and user files, and still launches through the bridge. A Mac-native game shows the state and
the Update button gets Steam to update it.

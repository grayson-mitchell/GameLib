---
created: 2026-11-07T22:09:59.169Z
title: "Implement Verify and Move install for Steam games (repair is bridge-DLL-only; moveInstall is a stub)"
area: steam-install
files:
  - src/backend/storeManagers/steam/gameMaintenance.ts (moveInstall ~21 stub, repair ~35, syncSaves ~78)
  - src/backend/gamedetails/dispatch.ts (repair ~173)
  - src/backend/sidecar/gameDetailsFlowRegistration.ts ('repair' and 'changeInstallPath' IPC)
  - src/backend/storeManagers/steam/depot.ts (manifest fetch + chunk download)
  - src/backend/storeManagers/steam/steamInstallApp.ts (bridge helper calls into Steam's app manager)
severity: medium
platform: macos
ready: live-gate
---

## Problem

Verify and Move are two of the four Steam library actions you can't start from GameLib. Found
while building the "Steam Lib Actions" table (2026-11-08). Today you have to use Properties →
Installed Files → Verify / Move in the Steam app.

- **Verify:** `repair()` (`gameMaintenance.ts` ~35) only restores the original `steam_api` DLLs
  behind the bridge shim. Anything else throws "a full depot verify is not supported".
- **Move:** `moveInstall()` (`gameMaintenance.ts` ~21) logs
  `SteamGame.moveInstall not implemented until Phase 2` and returns an error. The
  `changeInstallPath` IPC exists, but for Steam it goes nowhere.
- **Bridge games have neither, from anyone.** They live in the bridge bottle's own `steamapps`,
  which Mac Steam never sees. Steam's Verify/Move can't reach them, so GameLib is the only
  possible owner. The same gap is behind the updates todo
  (`2026-11-07-implement-steam-game-updates.md`).

## Solution

### Verify

- **Bridge games: GameLib verifies them itself.** Fetch the installed manifest(s) for the ACF's
  `InstalledDepots` GIDs (`depot.ts` already does this for installs). Hash every file against
  the manifest's per-chunk SHA-1s, download only bad or missing chunks, and leave files the
  manifest doesn't own alone. Afterwards, re-place the `steam_api` shim (today's `repair()`
  restores originals, and a full verify would put the original DLL back over the shim) and
  re-check the redist ledger. Show it as `repairing` with progress. Refuse while the game is
  running.
- **Steam-registered games: ask Steam.** Candidates, in order:
  1. a validate method in Steam's internal app manager, called silently through the bridge
     helper like InstallApp/UninstallApp (spikes 065/067; needs a spike);
  2. `steam://validate/<appId>` (untested; probably raises Steam's window like
     `steam://uninstall`).
  GameLib's own verifier could also run on these, but only if Steam doesn't have the app loaded.
  Decide after the spike.

### Move install

- **Steam-registered games: ask Steam first.** Spike for a move method in Steam's internal app
  manager that moves to another registered library folder silently, next to
  InstallApp/UninstallApp. Fallback: GameLib moves the folder and ACF itself, then lets Steam
  pick it up the way it adopts installs today (on restart, see `macSteamAdoption.ts`). Only move
  between registered Steam libraries.
- **Bridge games:** decide what "move" means first. Either they stay in the bridge bottle's
  `steamapps` (then Move only applies if the bridge supports a second library folder), or the
  bottle's library can point outside the bottle. Paths written into the bridge state, the shim
  scan and the redist ledger must follow the move.
- **Safety, both routes:** refuse while the game is running. Copy, verify, then delete the
  source; never a delete-first rename across volumes. Resolve both paths inside registered
  libraries and never follow an `installdir` that escapes. Keep the library entry's
  `install_path` the single source of truth (the uninstall data-loss fix depends on it).

Live gate: corrupt a file in a bridge game and in a Mac-native game; Verify repairs both and
both still launch (bridge through the shim). Move a Mac-native game to a second Steam library;
Steam and GameLib both show the new location and it launches.

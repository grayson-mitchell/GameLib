---
created: 2026-11-20T05:32:14.000Z
title: "Implement Move install for Steam games (moveInstall is a stub)"
area: steam-install
files:
  - src/backend/storeManagers/steam/gameMaintenance.ts (moveInstall stub)
  - src/backend/gamedetails/dispatch.ts (changeInstallPath)
  - src/backend/sidecar/gameDetailsFlowRegistration.ts ('changeInstallPath' IPC)
  - src/backend/storeManagers/steam/steamInstallApp.ts
  - native/steam-bridge/helper/gamelib_installapp.h
severity: medium
platform: macos
ready: live-gate
---

## Problem

Move is one of the Steam library actions you can't start from GameLib. Split out of
`2026-11-07-implement-steam-verify-and-move-install.md` when Verify shipped (quick 261120-p2j).
Today you have to use Properties → Installed Files → Move in the Steam app.

- **Move:** `moveInstall()` (`gameMaintenance.ts`) logs
  `SteamGame.moveInstall not implemented until Phase 2` and returns an error. The
  `changeInstallPath` IPC exists, but for Steam it goes nowhere.
- **Bridge games have no Move, from anyone.** They live in the bridge bottle's own `steamapps`,
  which Mac Steam never sees. Steam's Move can't reach them, so GameLib is the only possible
  owner.

## Solution

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

### Spike first

Before any code, find a silent move method in IClientAppManager's method map, next to
InstallApp/UninstallApp. Sources:

- spike 069's slot table (`.planning/spikes/069-steamclient-update-installed/`);
- the full vtable in `.planning/spikes/066-steamclient-register-install/slotmap.txt`: rows 67-70
  read CanMoveApp / MoveApp / GetMoveAppProgress / CancelMoveApp, with IPC IDs 0x68b2..., 0x4780...,
  0x5523..., 0x4309...;
- OpenSteamClient's `dumped_data/IClientAppManagerMap.json` for the argument shapes;
- the working spike directory `.planning/spikes/090-steamclient-moveapp/`, which already exists
  (probe, before/after ACF and libraryfolders captures). Build on it; do not start over.

The Verify half shipped in quick 261120-p2j. Its helper subcommand (`--steam-validateapp` in
`gamelib_installapp.h`) is the pattern a MoveApp subcommand should copy: resolve the slot at
runtime by its unique IPC high half, guard it with its neighbour slot (CancelValidation at
StartValidatingApp + 1; CancelMoveApp must sit after MoveApp the same way), and read IPC app state
for completion, because a Steam operation does not always move the ACF.

## Live gate

Move a Mac-native game to a second Steam library; Steam and GameLib both show the new location and
it launches.

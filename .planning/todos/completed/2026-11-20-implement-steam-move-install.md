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
  pick it up the way it adopts installs today (on restart, see `macSteamAdoption.ts`). Moves go
  to a Steam library; GameLib now registers a picked folder as one first with AddLibraryFolder
  (spike 094, quick 261122-n4q).
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

1. In GameLib's Move picker, for a Mac-native Steam game, pick an arbitrary new folder that is not
   a Steam library. Steam registers it as a library, visible in Steam → Settings → Storage. The
   game moves to `<folder>/steamapps/common/<installdir>`. Steam and GameLib both show the new
   location, and the game launches from there.
2. Move the game to an existing Steam library. The same result follows, and no new library is
   added.

## Progress (2026-11-22, quick 261122-9sl)

- Steam-registered Move is implemented: the helper `--steam-moveapp`, run-guarded
  CanMoveApp/MoveApp with a bounded completion wait; `requestSteamMoveApp`; `moveNative.ts`;
  `moveInstall` routing; and the Move gate shown for Steam on macOS.
- `refreshInstallState` now rewrites a changed install_path, so the cache follows a move made in
  Steam too.
- Still open:
  - Bridge-game Move. The "Bridge games" design question above is undecided, and GameLib refuses
    with "Move isn't available for bridge games yet".
  - Steam Move off macOS.
  - The cross-volume move and the post-move error paths spike 090 did not exercise.
  - The live gate.

## Progress (2026-11-22, quick 261122-n4q)

- Option 1 is implemented: `--steam-moveapp --add-library`, a guarded AddLibraryFolder (0x16a1,
  with Remove at +3 as a guard only, never called) whose returned index is the MoveApp target, and
  GameLib-side folder refusals before any Steam call.
- The folder-gap bug in `gl_ia_list_folders` is fixed for `--steam-installapp --library` and
  `--steam-moveapp`.
- After a move the helper nudges a stalled verify once with StartValidatingApp, and reports
  not-settled instead of success while Files Missing persists.
- Still open:
  - bridge-game Move
  - Steam Move off macOS
  - cross-volume and external-drive moves
  - a library on an unmounted volume (it still fails the folder lookup)
  - Steam signed out
- Decided (2026-11-25): no pre-move note in the Move dialog that the picked folder becomes the
  library root. The user judged the Location row, which shows the real
  `<picked>/steamapps/common/<installdir>` path after the move, to be enough.

## Resolution (2026-11-25): live gate passed

The operator ran both checks through GameLib's Move picker, using World of Goo (22000), with the
n4q build and Steam not restarted since spike 094.

1. **To a new folder, `~/Games/testmove` (17:32).**
   - Steam mounted it as library 4, reusing a gap that spike 094 left in its in-memory list, so
     the n4q gap fix held against real Steam.
   - The game moved in about 1 s (263,458,295 bytes, 2,920 files).
   - Steam started its own verify 4 s after the move, before the nudge's 5 s threshold. The verify
     found no changes, and the game ended at StateFlags 4.
   - GameLib's cached `install_path` followed the move, and the game launched from the new folder.
2. **Back to the default library, `~/Library/Application Support/Steam` (17:44).**
   - The game moved in about 1 s, and no library was added.
   - It ended at StateFlags 4, GameLib's cached `install_path` followed it, and it launched.

The items still open above are follow-ups outside this todo's scope.

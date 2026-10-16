---
created: 2026-10-17
title: "Uninstalling a bridge game that lives in the legacy GameLibSteamBridge bottle reverts to installed within 3 s and hides the game from the grid"
source: quick task 261016-wsq live gate, Arm 2 (T-u1w-06 measured)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
severity: major
platform: macos
ready: code
---

Measured 2026-10-17 07:48 NZDT on this Mac (evidence:
`.planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/`):

1. `uninstall('206040','steam',false,false)` took the legacy path of `uninstallBridgeGame()` and
   logged `SteamGame: removed bridge install for appId 206040 at ".../GameLibSteamBridge/.../common/Avernum 5"`.
   `appmanifest_206040.acf` (StateFlags 4) was left in the legacy bottle's `steamapps/`.
2. `markBridgeGameUninstalled()` sent `gameStatusUpdate {status:'done'}`; the frontend answered with
   `[refreshLibrary] runner=steam origin=game-status` in the same second (07:48:43).
3. That refresh's `buildBridgeInstalledMap()` read the surviving manifest, `resolveBridgeBottleName`
   attributed it to the legacy bottle, and by 07:48:46 `getGameInfo` returned `is_installed:true`
   with `install_path` pointing at the deleted directory. A manual refresh at 07:48:58 agreed.
4. `isGameAvailable()` (is_installed && existsSync(install_path)) then returned false, so the
   frontend added 206040 to `nonAvailableGames` and the Library grid stopped showing it:
   `Library: 1 owned Steam game(s) silently excluded from the library grid by a stale
   nonAvailableGames entry: 206040`, 19 times between 07:48:46 and 07:49:57. It healed only once
   the manifest was deleted by hand and the library refreshed (07:49:52 / 07:50:08).

Net: for any game still in the legacy bottle (on this machine: Avernum 5, Avernum 6, HOARD),
"Uninstall" deletes the files and then the game disappears from the grid while still claiming to
be installed. The per-game path is immune — `removePerGameBridgeBottle` deletes the whole bottle,
and the same run measured the badge flipping to not-installed on the next refresh.

Fix shape: in the legacy branch of `uninstallBridgeGame()`, remove `appmanifest_<appId>.acf` from
the legacy bottle's steamapps dir alongside the install root (the per-game branch already achieves
this by construction), and add a games.test.ts case asserting the manifest unlink. Consider also
dropping the appId from the bridge poller/`nonAvailableGames` reconcile path, but the manifest
unlink alone stops the revert.

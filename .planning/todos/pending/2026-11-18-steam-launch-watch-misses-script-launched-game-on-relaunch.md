---
created: 2026-11-18T00:00:00.000Z
title: 'SteamGame.watch misses a running game after a failed launch; button stays "Play"'
area: steam
severity: minor
platform: macos
ready: live-gate
files:
  - src/backend/storeManagers/steam/steamLaunchWatch.ts
  - src/backend/storeManagers/steam/steamLaunchedDeps.ts
---

## Problem

Found during the Phase 81 live gate, item 3 (`81-HUMAN-UAT.md`, launch L2, 2026-11-18),
after the Bastion (107100) exec-bit failure (see
`2026-11-18-depot-install-misses-exec-bit-on-shell-script-launchers.md`). gamelib.log
sequence (local time):

- 21:26:50 `SteamGame: launching appId 107100 ...` and `SteamGame.watch: watching
  Steam-launched appId 107100` (this launch failed: TextEdit, AppError_16);
- 21:28:04 `SteamGame: launching appId 107100 ...` with no `watching` line: the watch from
  21:26:50 was still in the registry, so `startSteamLaunchWatch` returned
  `already-watching` and only called `noteRelaunch()`;
- 21:28:05 Bastion was running (bash launcher, then `Bastion.bin.osx`, both inside the
  install folder);
- 21:29:36 `SteamGame.watch: appId 107100: no process within start window`.

So the extended watch never saw the running game, and GameLib's button stayed "Play"
the whole time the game ran.

## Direction

Find why the `ps` scan did not match the script-launched processes: check what the
matcher compares (the executable path in `ps` output versus the install folder; a bash
process shows `/bin/bash` as its executable with the script as an argument, and the
`.bin.osx` child may be reported through a path form the matcher does not expect), and
whether `noteRelaunch()` restarts the scan as well as the start window. Add a test for an
`already-watching` relaunch whose game appears after the relaunch. Verify live with a
script-launched Mac game (Bastion 107100, once its launcher is executable).

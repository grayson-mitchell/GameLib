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

## Resolution

Done by quick 261119-gzt (fix 362934e4f, tests 8b5b07cd7).

Root cause: `psOutputPidsInFolder` admitted a pid only when its `ps -o pid=,args=` text
started with the install folder, and macOS `ps` prints argv, not the executable path. Bastion's
launcher shows as `/bin/bash <folder>/Bastion.app/Contents/MacOS/Bastion` and its child as
`./Bastion.bin.osx`, so neither matched and every scan returned no pids until the start window
ran out. On Linux the same args pre-filter dropped the relative child before the /proc exe
filter saw it. `noteRelaunch()` was not at fault: the bail came 92 s after the relaunch (the
90 s window plus one poll), and the new T12 (a game that first appears after the original window
but inside the relaunch window) passes at HEAD before any source change.

Fix: `psOutputPidsInFolder` now also admits an sh-family interpreter running a script inside the
folder, and a relative argv[0] is resolved by executable path (one bounded `lsof -d txt` over
only the candidate pids on darwin, `/proc/<pid>/exe` on linux), so the launch watch sends
`playing` and Stop gets real pids. No process outside the folder, sibling folder or Steam helper
is matched.

Live check passed 2026-11-19 (operator, macOS): Bastion 107100 detected (gamelib.log 12:36:19 `running: pids [17140, 17144]`), Stop SIGTERMed both pids. The Launching step it exposed was fixed in quick 261119-p3z, whose live check (Play → Launching → Playing → Stop → Play, no flicker) also passed.

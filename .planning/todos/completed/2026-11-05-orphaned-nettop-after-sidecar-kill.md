---
created: 2026-11-05T12:00:00.000Z
title: "Orphaned nettop monitor child survives a killed sidecar"
area: steam-install
files:
  - src/backend/storeManagers/steam/steamDownloadMonitor.ts
  - src-tauri/src/main.rs
severity: minor
platform: macos
ready: code
---

## Trigger

Found during debug `steam-dl-missing-in-downloads` (2026-11-05): `nettop -x -n -L 0 -s 1 -J
bytes_in -p 9236` (pid 16358, ppid 1, no `script` parent) had been running since 2026-11-02
19:31, long after its sidecar and its Steam pid were gone.

## What is known

- Clean stops are sound. SIGTERM to the `script` parent takes nettop with it, and both
  `stopSteamDownloadMonitor` and the stdin-EOF `stopAllSteamDownloadMonitors` release it.
- So the orphan most likely came from a sidecar that died without either path running (SIGKILL
  or Force Quit, which also skips the Rust `shutdown_child`). This is inferred, not reproduced.
- nettop is pinned to a pid (`-p`), so once that Steam process exits the orphan only idles. It
  costs a process slot and a little CPU, not correctness.

## Done when

A monitor child cannot outlive its sidecar after a hard kill: for example, a parent-death watchdog
in the child wrapper, or a process-group reap at the next sidecar boot. Prove it by killing a
sidecar with SIGKILL mid-download.

## Resolution

Fixed in quick 261105-svg. The monitor no longer spawns `script` directly. It spawns a `/bin/sh` parent-death watchdog (`childWatchdog.ts`, wired in by `steamDownloadMonitor.ts`) that runs script/nettop, polls the explicit sidecar pid every second with `kill -0`, and on parent death kills script plus the recorded nettop. The nettop pid is recorded on every tick because the field orphan had no `script` parent, so killing script alone would have missed it. The watchdog also traps TERM, so the Rust process-group SIGTERM and both Node stop paths still clean up, and the tree now exits when the pinned Steam pid exits instead of idling.

Measured with real `script`/`nettop` pinned to a harness-owned `sleep` pid (never Steam), parent SIGKILLed after 3s of output:

- Baseline (bare script/nettop, no watchdog): this did NOT reproduce the orphan. Six seconds after the SIGKILL, script was dead and no nettop remained. The SIGPIPE hypothesis for how the field orphan arose is therefore unconfirmed. Whatever left pid 16358 behind did not happen in this harness, so the field cause remains inferred.
- Fixed (watchdog): nettop, script and the watchdog were all gone 123ms after the SIGKILL. The real-process tests also show the tree gone within about 1.1s when the parent is killed, and within about 150ms on a clean SIGTERM. The middle-process-dies-first shape (grandchild survives, then the parent is killed) is covered with a stand-in `sleep` grandchild.

Rerun the live proof with `GAMELIB_LIVE_NETTOP=1 npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts`.

Not covered: the proof SIGKILLs a throwaway node parent, not the packaged SEA sidecar under the Tauri shell mid-download. The watchdog keys only on the parent pid, so the mechanism is identical. Because the baseline did not orphan, this proves the watchdog is correct and fast, not that it is the only thing that would have prevented the field orphan.

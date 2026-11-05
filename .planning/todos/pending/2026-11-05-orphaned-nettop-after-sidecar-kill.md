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

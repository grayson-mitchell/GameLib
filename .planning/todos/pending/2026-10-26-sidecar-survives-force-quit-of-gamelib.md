---
created: 2026-10-26T07:55:17.273Z
title: "The Node sidecar survives a Force Quit of GameLib while a native Steam download is in flight"
source: 51-UAT item 22 (2026-10-26)
area: sidecar
files:
  - src-tauri/src/main.rs:1929
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/games.ts
severity: major
platform: any
ready: live-gate
---

## Problem

During 51-UAT item 22, the operator Force Quit GameLib (⌥⌘Esc) mid-download (Legends of Eisenwald 246760, native depot download into GameLibSteam). `gamelib-shell` was gone afterwards, but the sidecar (`node …/build/main/sidecar.js`, pid 3762) was still running and had to be `kill -9`'d.

Force Quit sends SIGKILL to the shell, so `RunEvent::Exit` → `shutdown_child()` (main.rs ~1929) never runs, and the process-group reap does not happen. That leaves the exit contract: the sidecar should drain at stdin EOF. It did not, which fits half 2 of the contract: an in-flight native download holds referenced sockets and file handles, so the loop cannot drain. The orphan keeps an authenticated Steam session and can keep writing into a bottle with no UI.

Not measured: whether the download was still making progress, and how long the orphan would have lived.

## Solution

TBD. Options: on stdin EOF/close in the sidecar, abort in-flight native downloads (the AbortController registry) and stop polling, then let the loop drain. Or have the shell put the sidecar where SIGKILL of the parent still reaches it (on macOS, a kqueue `NOTE_EXIT` watch on the parent pid in the sidecar). Note the exit contract deliberately has no stdin `'end'` teardown, so the first option is a contract change to decide, not a drive-by. Live gate: force-quit mid-download and confirm no sidecar remains within a few seconds.

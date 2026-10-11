---
created: 2026-10-12T00:00:00.000Z
title: "win32 native LZMA extraction dirs may accumulate in the OS temp dir (Windows cannot unlink a mapped addon or liblzma.dll)"
area: steam
severity: medium
platform: windows
ready: human
found_by: "quick-261011-wrx"
files: [src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts]
---

## Defect (predicted, not yet measured)

Quick 261011-wrx makes native decode engage in the win32 SEA sidecar. The binding extracts the
addon and `liblzma.dll` into a private `gamelib-lzma-native-<pid>-XXXXXX` directory under
`os.tmpdir()` and removes it in a `finally`. On Windows a loaded addon, and the `liblzma.dll` it
maps, cannot be unlinked while the process runs, so that `rmSync` is expected to fail and the
directory is expected to be LEFT BEHIND (the failure is swallowed by design). Every worker of every
sidecar process that engages native decode would leave one directory.

Sizes to expect per directory: `node.napi.node` 815,616 B plus `liblzma.dll` 150,528 B, about
966 KB. No directories-per-run number exists yet, because the cold win32 SEA build and the
native-win32 driver run did not happen in 261011-wrx (a live `gamelib-shell.exe` was running, so the
precondition was unmet). The measured figure is owed.

## How to measure

Run the 261011-wrx driver (command in the closed todo's Resolution). It writes
`measurement/native-win32-tmpdir-extracts.txt` listing `gamelib-lzma-native-*` entries before,
after, and new (after minus before), with child file sizes. The engaged line in `gamelib.log` also
says `was LEFT BEHIND` or `was removed after load` per worker.

## Decision the operator owes

- Accept: Windows Storage Sense / Disk Cleanup reclaim stale temp content.
- Or add a synchronous, bounded sweep in the binding, before `mkdtempSync`, that removes
  `gamelib-lzma-native-<pid>-*` directories whose pid is not alive (`process.kill(pid, 0)` throws
  ESRCH). It must add no timers and no async work at boot, under the sidecar exit contract. Pid
  reuse only makes the sweep skip a directory, never delete live state.

No sweep was implemented in 261011-wrx; the todo it closed asked only to measure.

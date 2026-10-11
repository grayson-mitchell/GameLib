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

## Defect (measured 2026-10-12)

Quick 261011-wrx makes native decode engage in the win32 SEA sidecar. The binding extracts the
addon and `liblzma.dll` into a private `gamelib-lzma-native-<pid>-XXXXXX` directory under
`os.tmpdir()` and removes it in a `finally`. On Windows a loaded addon, and the `liblzma.dll` it
maps, cannot be unlinked while the process runs, so that `rmSync` is expected to fail and the
directory is expected to be LEFT BEHIND (the failure is swallowed by design). Every worker of every
sidecar process that engages native decode would leave one directory.

Sizes to expect per directory: `node.napi.node` 815,616 B plus `liblzma.dll` 150,528 B, about
966 KB. Measured 2026-10-12 with the 261011-wrx driver on the cold win32 SEA build: 20 runs left 40
directories (before 0, after 40), two per sidecar process, one per worker: the first worker's dir keeps both files (966 KB); the second worker's dir keeps only `node.napi.node` (816 KB), because Windows had already mapped `liblzma.dll` by name from the first dir and reused it, so the second copy was never mapped and the `finally` unlinked it. 35 MB
in total. Every engaged line said `was LEFT BEHIND`. Those 40 were removed by hand afterwards.

Real-app figure (packaged release app, 2026-10-12): one depot install spun up 16 decode workers in the
single sidecar process (pool = min(os.cpus().length, DECOMPRESS_POOL_MAX_WORKERS) on a 20-core box), so
16 directories (one with both files, 15 addon-only), about 13 MB, per app session that decodes a depot.
They stay until the sidecar exits and are never reclaimed by the app.

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

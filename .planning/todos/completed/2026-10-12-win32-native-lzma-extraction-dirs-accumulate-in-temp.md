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

## Resolution (2026-10-12, quick 261012-82w)

Decision taken by the operator: the sweep, option 2 of "Decision the operator owes". Closed on a real
win32 SEA run; the packaged-release-app session arm is owed (below).

- `53b01de62` feat(quick-261012-82w): `lzmaNativeBinding.ts` gains `sweepStaleExtractDirs(root)`,
  called on win32 only, inside the SEA branch, immediately before the binding's own `mkdtempSync`
  (win32 only because POSIX `finally` unlinks succeed so nothing accumulates there, and `/tmp` can be
  shared across users and pid namespaces where ESRCH proves nothing, whereas `%TEMP%` is per-user and
  Windows pids are system-global). It takes the `readdirSync` snapshot BEFORE probing, so a reused pid
  can only make the probe succeed (skip). It deletes a `gamelib-lzma-native-<pid>-<6 alnum>` directory
  only when `process.kill(pid, 0)` throws ESRCH; EPERM, any other code, or a non-throwing probe keeps
  it. It never touches the own pid (decode worker threads share `process.pid`), pid 0, a pid above
  0x7fffffff, a name that is not exactly mkdtemp-shaped, or (via a delete-time `lstatSync`, as
  `reapStaleRoots()` does) a symlink/junction or non-directory. It is capped at 64 probes per call,
  fully synchronous (no timers or promises, so the sidecar exit contract is untouched) and swallows
  every error. The result `{ examined, removed }` is recorded per isolate under
  `Symbol.for('gamelib.lzmaNative.staleSweep')`, and `lzmaLoader.ts` appends one
  `Swept N stale gamelib-lzma-native-* dir(s)` sentence to the existing engaged `logInfo` and to the
  import-failure `logWarning` (no new log calls). Extraction, `dlopen` and the `finally` cleanup are
  unchanged. The LEFT BEHIND sentence now says a later sidecar process removes the dirs.
- Unit evidence (`lzmaNativeBinding.test.ts` + `decompressPool.test.ts`, by path): baseline 67/67.
  After the new tests and before any sweep code: RED, 22 failed / 73 passed (95 tests: S1-S11, W1-W4,
  K1-K4 added). GREEN, 95/95. The real-tmp `gamelib-lzma-native-*` count was 16 before and 16 after
  every jest run (the 16 dead-pid-37008 dirs were the preserved fixture). `pnpm codecheck`, scoped
  eslint, `pnpm find-deadcode` and scoped prettier are green.
- Real win32 SEA (`0aec00302`, measurement in
  `.planning/quick/261012-82w-sweep-stale-win32-native-lzma-extraction/measurement/`): cold build from
  `53b01de62` (the worker bundle contains `sweepStaleExtractDirs`), then the 261011-wrx driver, 20
  fake-HOME runs: `RESULT label=sweep-win32 pass=20/20 expectNativeWorkers=2`. Per-run `tmpExtracts`
  was 2 in every run (261011-wrx measured 2, 4, ... 40). All 16 pre-existing dead-pid-37008 dirs were
  gone after run 1. `Swept` totals: 16 in run 1, then 2 per run in runs 2-20 (54 in all). The engaged
  line appears in every run log and no run logged a load failure. The last run's 2 dirs (pid ESRCH
  by then) were removed by hand afterwards (1,781,760 bytes); the real `%TEMP%` holds 0
  `gamelib-lzma-native-*` entries.

What remains by design: a live session still holds up to one directory per decode worker (16 on a
20-core box, about 13 MB) until it exits. They are reclaimed at the next process's first native load.

Owed to the operator:

1. The packaged release app arm: after one session that decodes a depot, the NEXT session's
   `gamelib.log` engaged line should carry the `Swept N stale gamelib-lzma-native-* dir(s)` sentence,
   and `%TEMP%` should hold only the live session's directories.

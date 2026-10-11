---
created: 2026-10-11T00:00:00.000Z
title: "win32 SEA native LZMA never engages: the win32-x64 addon imports liblzma.dll, which the SEA does not embed (falls back to pure-JS)"
area: steam
severity: major
platform: windows
ready: code
found_by: "quick-261011-mza, the first win32-x64 real-SEA run of the native path (23.1-01 Assumption A2)"
files:
  - meta/buildSidecarSea.ts
  - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
  - meta/__tests__/buildSidecarSea.test.ts
---

## Defect

Native decode is declared capable on `x86_64-pc-windows-msvc` (`NATIVE_LZMA_REQUIRED_TRIPLES` in
`meta/buildSidecarSea.ts`) and is ON by default, but inside the real win32 SEA binary it never
loads. Measured 2026-10-11 on win32-x64 (Windows 11, Node v24.19.0, binary cold-built from
`7255c2507`): 21 of 21 self-test runs logged the import-failure warning, 0 logged the engaged
line, `nativeWorkers:0` every time. Installs still complete on pure-JS (`decode=ok match=true`,
20/20 in the fallback arm, no hang), so this is slower decode, not a broken install.

Measured `Cause:` (verbatim): `The specified module could not be found.` followed by the temp addon
path `gamelib-lzma-native-<pid>-<hex>.node` in `os.tmpdir()`.

## Why (static evidence, then confirmed at runtime)

- `node_modules/lzma-native/prebuilds/win32-x64/` holds `node.napi.node` (815,616 B) plus a separate
  `liblzma.dll` (150,528 B). The DLL names imported by `node.napi.node` are exactly `KERNEL32.dll`
  and `liblzma.dll`, so it links liblzma dynamically.
- The darwin-arm64 and linux-x64 prebuilds have no sibling library (liblzma is statically linked),
  which is why the macOS run engaged.
- `meta/buildSidecarSea.ts` embeds only `node.napi.node` as the `lzma_native.node` SEA asset
  (`LZMA_NATIVE_ADDON_FILENAME`). `lzmaNativeBinding.ts` extracts that one file to `os.tmpdir()`
  and `process.dlopen`s it.
- Windows resolves the import from the addon's own directory (`%TEMP%`), then the system dirs, the
  CWD, then PATH. `liblzma.dll` is in none of them, so `LoadLibrary` fails with "The specified
  module could not be found."

## Fix surface

Embed `liblzma.dll` as a second SEA asset and extract BOTH files into one private directory before
`dlopen`. Use a `mkdtemp` directory (mode 0700), never the shared temp root: a DLL placed next to a
loaded addon in a predictable, writable location is a DLL-planting hole, and the extraction dir is
exactly where Windows will look first. Remove the directory in a `finally` (on Windows a mapped DLL
cannot be unlinked while loaded; handle that like the existing swallowed `rmSync` on the success
path, and measure the leftover). Touch: `meta/buildSidecarSea.ts` (second asset, per-triple),
`lzmaNativeBinding.ts` (extract both), and their tests (`lzmaNativeBinding.test.ts`,
`meta/__tests__/buildSidecarSea.test.ts`). Watch temp-dir accumulation: once native engages on
win32, every worker of every sidecar process extracts files (see the 261011-mza SUMMARY).

## Verify

Rebuild cold on Windows and run the 261011-mza driver
(`.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts`, label
`native-win32`, `--expect-native-workers 2`): expect 20/20 at `nativeWorkers:2` and the engaged
line in every run log, and record the temp-dir leftovers.

## Resolution (2026-10-12, quick 261011-wrx)

Closed on unit evidence only. The real-SEA verification is owed (see below), not done.

- `b0ee1fd29` fix(steam): the build embeds `liblzma.dll` as a second SEA asset
  (`LZMA_NATIVE_DLL_ASSET_KEY`) for `x86_64-pc-windows-msvc` only, and a missing DLL is a
  `COMPILE GATE FAILED`. The binding extracts the addon (plus the DLL on win32) into ONE private
  `mkdtempSync` directory (chmod 0o700), `dlopen`s from it, removes the directory in a `finally`,
  swallows the Windows unlink-while-mapped failure, and records `{ dir, leftover }` per isolate.
- `095973577` feat(steam): `lzmaLoader.ts` appends the extraction directory and whether it was
  removed or LEFT BEHIND to its single engaged `logInfo` line, and the failure warning now names the
  win32 `liblzma.dll` companion SEA asset.
- Unit suites on this Windows box, by path: Task 1 RED was 24 failed / 78 passed (102 tests,
  `lzmaNativeBinding.test.ts` + `buildSidecarSea.test.ts`), GREEN 102/102. Task 2 RED was 2 failed
  (L1, L2) / 45 passed in `decompressPool.test.ts`, GREEN 149/149 across the three targeted suites.
  Includes a real-filesystem round trip (R6) and a real `node_modules` sibling-library drift guard
  (B7). `pnpm codecheck`, scoped eslint, `pnpm find-deadcode` and scoped prettier are green.
- Real win32 SEA: NOT RUN. The Task 3 precondition was unmet: a live `gamelib-shell.exe`
  (`src-tauri/target/debug`, with a `node.exe` child) was running, so the cold build, which replaces
  `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe`, was skipped and nothing was killed.
  See `.planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/build-native-win32.txt`.

Owed to the operator:

1. With the app closed, the cold rebuild plus the native-win32 driver run itself. From the repo root:
   `pnpm build:sidecar-sea`, then
   `node meta/runTs.cjs --bundle --platform=node --target=node22 .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts --label native-win32 --runs 20 --expect-native-workers 2 --out .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement`.
   Expect 20/20 at `nativeWorkers:2` and the engaged line in every run log. If any run shows
   `nativeWorkers:0` with the import-failure warning, this fix is refuted: reopen this todo.
2. A live Steam depot install in the packaged Windows app. `gamelib.log` should show the engaged line
   with its `SEA extraction dir ...` sentence.
3. The accumulation decision, tracked in
   `.planning/todos/pending/2026-10-12-win32-native-lzma-extraction-dirs-accumulate-in-temp.md`.

Linux note: ubuntu CI's `lzmaNativeSeaRealBuild.test.ts` (unedited) is the first linux real-SEA run
of the mkdtemp path.

## Live verification (2026-10-12, operator ran it after closing the app)

Cold `pnpm build:sidecar-sea` with the app closed, then the driver exactly as above. Result:

- `RESULT label=native-win32 pass=20/20 expectNativeWorkers=2`; every run `nativeWorkers=2`,
  `exit=0`, `SELFTEST decode=ok bytes=65536 match=true`, wall 1.80-2.20 s.
- The engaged line is present in all 20 run logs (once per worker process) and ends with
  `SEA extraction dir C:\Users\...\Temp\gamelib-lzma-native-<pid>-XXXXXX was LEFT BEHIND`.
- Zero run logs contain `The specified module could not be found` or any lzmaNativeBinding failure
  warning. Item 1 above is discharged; the fix is confirmed on the real win32 SEA.
- Accumulation measured: `native-win32-tmpdir-extracts.txt` before 0, after 40, so 2 directories
  per sidecar process, one per worker: the first worker's dir keeps both files (966 KB); the second worker's dir keeps only `node.napi.node` (816 KB), because Windows had already mapped `liblzma.dll` by name from the first dir and reused it, so the second copy was never mapped and the `finally` unlinked it. 35 MB for the 20 runs. The 40 were removed by
  hand after the run (no process held them). The decision stays with the accumulation todo.
- The rebuilt binary grew from 120,994,304 to 121,159,680 bytes, consistent with the embedded DLL.

Still owed: item 2 (a live Steam depot install in the packaged Windows app) and item 3.

Live Steam depot install on win32, dev build (2026-10-12 05:25): Avernum 5 (appId 206040) with
"Download Steam games directly in GameLib" on. 1460 files, 92,315,962 bytes, 16.7 s download, badge
flipped to installed. `gamelib.log` carries the engaged line 8 times (one per decode worker) and zero
fallback or import-failure warnings. This was the `pnpm tauri:dev` shell with the sidecar under plain
node, so lzma-native loaded from node_modules and no SEA extraction happened (temp census 0). It
proves the depot path and native engagement on Windows, not the SEA embedding; item 2 (the same
install in the packaged app, expecting the `SEA extraction dir` sentence and 2 temp dirs) stays owed.

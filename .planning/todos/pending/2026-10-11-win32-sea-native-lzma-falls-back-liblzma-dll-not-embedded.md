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

---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 32
status: checkpoint-after-task-1
requirements: [H1]
---

# Phase 59 Plan 32: H1 DirectX exit 247 diagnosis (Task 1 only, Task 2 not started)

## H1 diagnosis

Branch: none of A, B or C fits. The plan says to stop and return a checkpoint in that case.

### Root cause

`DXSETUP.exe /silent` exits 247 on the bottle because Wine Mono is not registered in it. The built-in-engine
bottle is created by `createFallbackBridgeBottle` (`src/backend/storeManagers/steam/bottle.ts` ~L2219)
with `WINEDLLOVERRIDES: 'mscoree,mshtml='` on `wineboot -i`. That override suppresses the Mono and Gecko
install, so `system.reg` has no `wine-mono` entry. DXSETUP's Managed DirectX 1.0 plug-in (MDX1) then calls
`LoadLibraryShim`, which needs mscoree to find a registered runtime, and it fails.

### Evidence

- 576770 bottle `DirectX.log` (last lines): `CFusion::CFusion(): LoadLibraryShim() failed, error = 0x80070006`,
  `IsMDXInUse(): Unable to initialize MDXCheck`, `DirectXUpdateInstallPlugIn() failed`,
  `Installation ended with value -9 = Internal or unsupported error`. -9 is `DSETUPERR_INTERNAL`, 247 is -9 as
  an unsigned byte, so the hypothesis in the plan is confirmed. `DXError.log` names the same
  `LoadLibraryShim()` / 0x80070006 failure at dxupdate.cpp line 6124.
- 576770 bottle ledger: `failures` has the `directx\jun2010|dxsetup` key at count 1; the bottle has no
  `drive_c/windows/Microsoft.NET` directory and 0 `wine-mono` / `Wine Mono` matches in `system.reg` and `user.reg`.
- 576770 DLL inventory (system32 and syswow64): d3dx9_43, d3dx10_43, d3dx11_43, xinput1_3, x3daudio1_7,
  xaudio2_7 are all Wine builtin DLLs (`Wine builtin DLL` marker present, no `Microsoft Corporation`
  string). Nothing from Jun2010 was installed, so Branch A is ruled out.
- Reproduction, disposable prefixes under the scratchpad with a disposable HOME, pinned wine-staging-11.20:
  - Prefix 1: `wineboot -i` WITHOUT the override (Mono registers from the engine's bundled
    `share/wine/mono/wine-mono-11.3.0`, no download), null display driver, `DXSETUP.exe /silent` exits 0,
    `Installation ended with value 0 = Installation succeeded`, `Microsoft.NET/DirectX for Managed Code`
    created.
  - Prefix 2: `wineboot -i` WITH `WINEDLLOVERRIDES=mscoree,mshtml=` (what bottle creation does) -> `system.reg`
    has 0 `wine-mono` matches, `DXSETUP.exe /silent` exits 247 with the same LoadLibraryShim log as the
    real bottle.
- The real bottle was only read; its ledger mtime was unchanged (1793612078). Disposable prefixes, HOME and
  server are removed.

### Why this fits none of A/B/C

- A: refuted, no Jun2010 DLL is installed despite 247.
- B: no alternative invocation is needed; the installscript args (`/silent`) are right and succeed once Mono is registered.
- C: DirectX does install on the pinned engine; it is not an engine limitation.

The cause is in bottle creation, outside this plan's `files_modified`.

## Options for the next step (decision needed)

1. Fix at the source: stop disabling mscoree in `createFallbackBridgeBottle` (register the engine's bundled
   Mono offline; Gecko can stay disabled with `mshtml=`). New bottles then run DXSETUP to completion. Existing
   built-in-engine bottles (such as 576770) need Mono registered once, for example by running
   `wineboot -u` / the Mono MSI from `share/wine/mono` (the bundled msi) before the DirectX entry, or
   re-creating the bottle. Touches `bottle.ts` and its tests, plus possibly `sharedRedistInstall.ts`.
2. Redist-step only: before a non-CrossOver directx entry, check whether the bottle has a registered Mono and,
   if not, register it first (install the bundled `wine-mono-*.msi` via `msiexec /i`), then run DXSETUP.
   This repairs existing bottles without touching bottle creation, but keeps the override.
3. Branch C style skip (the plan's fallback): record DirectX as engine-unsupported on the built-in engine.
   Not recommended because the evidence shows DirectX can install there.

Recommended: 1 plus the existing-bottle repair from 2.

## Status

Task 1 done (this section). Task 2 not implemented; no source files changed.

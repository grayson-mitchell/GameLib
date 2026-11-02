---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 32
status: complete
requirements: [H1]
---

# Phase 59 Plan 32: H1 DirectX exit 247 (Wine Mono) Summary

DXSETUP now completes on the built-in engine: new bottles register Wine Mono at creation, and existing bottles get the bundled Mono support msi registered before their first DirectX run.

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

## Fix implemented (user chose option 1 + option 2)

Commit 1e300375d.

- `bottle.ts` `createFallbackBridgeBottle`: `WINEDLLOVERRIDES` is now `mshtml=` (mscoree enabled), so `wineboot -i` registers the engine's bundled Mono offline. `bottle.test.ts` assertion updated.
- `sharedRedists.ts`: pure `buildMonoSupportMsiParts(msiUnixPath)` (absolute path only, no quote or control chars, mapped to `Z:`) and `systemRegHasWineMono`.
- `sharedRedistInstall.ts`: `ensureEngineMono` runs once per run, before the first directx entry's process, on non-CrossOver bottles only. If `system.reg` has no wine-mono it finds `<engine>/share/wine/mono/wine-mono-*/support/winemono-support.msi` and runs `msiexec /i` through `runBounded`. No bundled msi, a failing or timed-out msi, or any error logs a warning and DXSETUP still runs; it never fails the redist run. CrossOver bottles and non-DirectX entries get no repair.
- Expected live log on re-UAT (576770): `Steam 576770: registering the engine's bundled Wine Mono in the bottle before DirectX setup`, then the DirectX Jun2010 entry completes with no `installer exited with code 247`. The bottle's old failure count (1) resets via the normal success path.

## Verification

- Disposable-prefix repro with the new creation path (`WINEDLLOVERRIDES=mshtml=`): wine-mono registered (4 matches), DXSETUP exits 0. Repair path on an old-style prefix (override mscoree): msiexec `winemono-support.msi` exits 0, mono registered, DXSETUP exits 0.
- Jest: sharedRedistInstall, sharedRedists, bottle suites 345 passed (6 new `H1:` tests in the install suite, 3 in sharedRedists, including "H1: CrossOver bottle unchanged"). eslint clean, `pnpm codecheck` clean, prettier clean. Teardown "import after Jest environment torn down" noise predates this plan.
- The real bottle 576770 was not modified; left for live UAT.

## Deviations from Plan

- [Scope, user-approved] `bottle.ts` and `bottle.test.ts` modified; they are not in the plan's `files_modified`.
- The diagnosis fit none of Branches A/B/C, so the implemented fix is the Mono registration above, not a branch from Task 2. The Branch-specific ledger changes (engineUnsupported, isDirectxInstalledInBottle) were not needed.
- The repair installs `winemono-support.msi` (the engine ships Mono as an extracted directory, no top-level msi).

## Known Stubs

None.

## Self-Check: PASSED

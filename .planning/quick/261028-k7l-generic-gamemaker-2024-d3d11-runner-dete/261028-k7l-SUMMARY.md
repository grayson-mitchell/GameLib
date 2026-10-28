# Quick 261028-k7l: Generic GameMaker D3D11 runner detection Summary

Steam bridge launches now default `CX_GRAPHICS_BACKEND=dxvk` when the launch exe passes a three-signal GameMaker D3D11 runner check (data.win file, d3d11.dll in the PE import table, MSAA probe string), with precedence user env > tier-1 > default.

## Commits

- d8f897c21: `readPeImportedDllNames` (PE Import Directory reader) + `importPe` fixture + tests
- 677d55746: `gameMakerRunner.ts` detector + tests
- 985c2a950: wiring into `applySteamBridgeKnownFixes` (4th arg `exePath`), `games.ts` call site, precedence tests

## Recorded decisions

- **Substitution:** the "runner >= 2024.x" check is replaced by signal 3, the ASCII string `GR_D3D_Device->CheckMultisampleQualityLevels` in the exe. The runner version (v2024.14.4.268) is not present statically in Mining Mechs (1603180): exe version resource is 1.0.0.0, data.win GEN8 IDE version 2.0.0.0. Measured 2026-10-28 on `Mining Mechs.exe` (PE32+, 15.7 MB): imports d3d11.dll, contains the probe string, data.win beside it. Fields of Mistria (2142790) is the counter-example and does not match.
- **PE reader choice:** the repo's regular-import reader is objdump-based (`importParse.ts` / `importScan.ts`); no in-process one existed. Extended `peSteamDrm.ts` (which already has the bounds-checked `PeReader` machinery) with a data-directory-1 reader rather than spawning objdump per launch. Header walk duplicated locally (~30 lines) instead of refactoring `readPeSteamApiDelayImports`. `PeReader` is now exported as a type; the module still has zero imports.
- **`public/fixes/1603180-steam.json` is unchanged** and kept as a regression pin.
- The default is only considered when `wineVersion.type === 'crossover'`, and CX_GRAPHICS_BACKEND is checked in user env + tier-1 before the detector runs, so a pinned title is never scanned. `process.env` is not consulted.

## Verification

- jest: peSteamDrm (35), gameMakerRunner (8), steamBridgeKnownFixes (75): 118 passed, 0 failed
- `pnpm codecheck`: clean
- eslint over the eight written files (scoped; `pnpm lint` full run was started but not awaited): 0 errors, 43 warnings (all pre-existing in games.ts, none in new code)
- prettier --check on the eight paths: clean
- `git diff --quiet -- public/fixes/1603180-steam.json`: unchanged
- husky pre-commit passed on all three commits

## Deviations from Plan

None. (Test for "never reads the exe" uses a `jest.mock` wrapper around `node:fs/promises.readFile` because `jest.spyOn` cannot redefine ESM-namespace properties.)

## Pending

Live gate (orchestrator): Mining Mechs 1603180 with `public/fixes/1603180-steam.json` moved aside, no MSAA dialogs, generic default line in the log, bridge stays verified. The todo `2026-10-26-gamemaker-d3d11-titles-need-dxvk-on-the-bridge.md` was not touched.

## Self-Check: PASSED

Files created and commits d8f897c21, 677d55746, 985c2a950 exist.

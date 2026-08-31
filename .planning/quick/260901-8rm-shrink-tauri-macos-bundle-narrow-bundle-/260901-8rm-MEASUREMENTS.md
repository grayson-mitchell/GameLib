# Quick 260901-8rm: measured artifact census

Build: `pnpm tauri:dev:packaged` (vite build -> build:sidecar -> build:decompress-worker-dev ->
`tauri build --debug`), run on an Apple Silicon (arm64) host, macOS `dmg` target.

Artifact: `src-tauri/target/debug/bundle/dmg/GameLib_0.7.0_aarch64.dmg` (410,047,387 B). Tauri
deletes the intermediate `.app` after DMG bundling when `dmg` (not `app`) is the requested
target -- `Contents/Resources` was inspected by mounting the DMG read-only
(`hdiutil attach -nobrowse -readonly`) and reading `/Volumes/GameLib/GameLib.app`, not by
launching anything. No runtime observation was made; a `--debug` packaged build runs
`node build/main/sidecar.js` rather than the bundled SEA, so a runtime check would measure the
wrong binary anyway (see D-6 in the plan's context block).

## Scope of this run

**Only the macOS overlay (`tauri.macos.conf.json`) was exercised.** `tauri build --debug` on an
Apple Silicon host builds the macOS `dmg` target only; the Windows and Linux overlays are
covered by Task 1's `packagingConfig.test.ts` merged-map assertions and by nothing else until a
real CI matrix run on those platforms.

## Bundle-narrowing gate (F1 / F3 / negative / size) -- result: PASS, all conditions

```
TREE arm64/darwin files=467
TREE x64/darwin files=4
OK  bin/x64/win32/EpicGamesLauncher.exe
OK  bin/x64/win32/GalaxyCommunication.exe
OK  bin/legendary.LICENSE
OK  locales
OK  changelog.json
OK  webviewPreload.js
OK  icon.png
OK  absent arm64/win32
OK  absent x64/linux
OK  absent arm64/linux
x64/win32 extras=0
```

- **POSITIVE** -- `arm64/darwin` (467 files) and `x64/darwin` (4 files) present and non-empty;
  both win32 Wine exes present as files; `legendary.LICENSE` present.
- **MERGE (F3, the decisive empirical test)** -- `build/locales`, `build/changelog.json`,
  `build/webviewPreload.js` and `build/icon.png` are ALL present in the shipped artifact. **The
  Tauri platform-config merge is a DEEP merge, not a shallow replace.** The base
  `tauri.conf.json`'s four non-bin resource entries survived being merged with the
  bin-only-carrying `tauri.macos.conf.json` overlay. The plan's designed STOP condition did not
  trigger.
- **NEGATIVE** -- `arm64/win32`, `x64/linux` and `arm64/linux` are absent from the shipped `bin`
  tree. `bin/x64/win32/` contains exactly the two named exes and nothing else (0 extras --
  `comet.exe`, `gogdl.exe`, `legendary.exe`, `nile.exe` are NOT shipped on macOS).
- **SIZE** -- see numbers below; both the "shipped tree is itself >100MB" and "saved >100MB"
  anti-vacuity/threshold checks passed.

## Size numbers

| Measurement | Value |
|---|---|
| Shipped `Contents/Resources/build/bin` (this artifact) | 239,444 KB (~233.8 MB / ~239 MB per `du -sk`->`/1024`) |
| Repo's own `build/bin` (unnarrowed, all six trees) | 367,160 KB (~358.6 MB) |
| **Saved** | **127,716 KB (~124.7 MB)** |
| Whole `.app` total (`du -sk`) | 691,684 KB (~675.5 MB) |

The saving (~124.7MB) is below the plan's own "expected ~162MB" estimate. Two measured reasons,
both visible in the file counts above and neither a fix (1) defect:

1. `arm64/darwin` grew from the plan-time baseline (93MB, `comet`/`gogdl`/`legendary`/`nile`
   only) to 467 files / a larger footprint here because this run's `pnpm build-steam-bridge`
   step added `steam_api.dll`, `steam_api.pdb` (2,818,048 B), `steam_api_shim.lib` (4,160 B),
   `steam-bridge-helper` and `steam_appid.txt` into that same directory -- exactly as the plan's
   interfaces block says it must (`public/bin/arm64/darwin/` is a directory entry precisely
   because the build step adds to it). This inflates the KEPT tree, not the removed one, so it
   narrows the delta between "shipped" and "repo build/bin" without indicating anything was
   left unnarrowed.
2. The repo's own `build/bin` (367,160 KB) is itself smaller than the plan-time `du -sh` estimate
   of "build/bin total 351M" would suggest at first glance because that figure predates this
   run's `build-steam-bridge` addition too -- both sides of the delta shifted together. The
   saved-`124.7MB` figure is the correct one for THIS run; it is not evidence of a narrower
   overlay than Task 1 built.

Anti-vacuity: shipped tree (239,444 KB, ~234MB) is far above the 100MB floor; the artifact is not
an empty/near-empty tree passing the size check by accident.

## Fix (2) independence baseline (`__const`, `__text`, gogdl strings, codegen-assets)

```
Segment __TEXT / Section __const: 235074112 bytes  (~224.2 MB)
Segment __TEXT / Section __text:   19375224 bytes  (~18.5 MB)
strings <gamelib-shell> | grep -c 'bin/x64/win32/gogdl.exe'  ->  1
```

- `__const` = **235,074,112 bytes** (>150,000,000 threshold -- PASS, unmoved and still large).
  This is the `__TEXT,__const` section, distinct from the much smaller `__DATA_CONST,__const`
  section (944,424 B) also present in the binary; the large one is the one this gate tracks.
- `__text` = **19,375,224 bytes**.
- `strings ... | grep -c 'bin/x64/win32/gogdl.exe'` = **1** (non-zero -- PASS). The string is
  still embedded in the shell binary, proving `frontendDist` (`../build`, embedding the whole
  `build/` tree including `build/bin`) was NOT touched by this plan's `bundle.resources` edit.
- `tauri-codegen-assets` staging directory (the intermediate Tauri generates while embedding
  `frontendDist` into the binary, most-recently-built of 17 fingerprinted
  `gamelib-shell-*` dirs under `src-tauri/target/debug/build/`, matched by newest mtime):
  `src-tauri/target/debug/build/gamelib-shell-b05aa384a0ca9495/out/tauri-codegen-assets` =
  **250 MB** (`du -sh`).

**Conclusion: fix (1) and fix (2) remain independently attributable.** `__const` stayed large,
the gogdl string is still embedded, and the 250MB codegen-assets staging directory (the
`frontendDist` embedding mechanism fix (2) would address) is untouched by anything this plan did.
Fix (2) is confirmed still entirely open, per the plan's scoped-out decision.

## What this run does NOT prove

- Windows and Linux overlays are unexercised by any real `tauri build` in this run. Their only
  coverage is `packagingConfig.test.ts`'s merged-map config-level assertions (Task 1). A real
  Windows/Linux CI build has not run against these overlays.
- No runtime launch was attempted or is relevant to this gate (see the D-6 note above).

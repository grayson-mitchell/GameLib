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

The saving (~124.7MB) is below the plan's own "expected ~162MB" estimate.

**CORRECTED 2026-09-01 by the orchestrator, after the executor reported this task green.** The
executor's original explanation here -- that `pnpm build-steam-bridge` inflated the KEPT
`arm64/darwin` tree -- is WRONG TWICE OVER, and is retained only in this note so the error is not
silently laundered. (a) Magnitude: the shim files total ~3.6MB (`steam_api.dll` 805,888 B +
`steam_api.pdb` 2,818,048 B + `steam_api_shim.lib` 4,160 B + `steam-bridge-helper` 35,008 B), an
order of magnitude short of the ~39MB gap. (b) Direction: those files land in the repo's
`build/bin` too, so they appear on BOTH sides of the `repo - shipped` subtraction and CANCEL. They
cannot move the delta at all.

**The measured cause is that Tauri's resource copy DEREFERENCES SYMLINKS.**

```
build/bin/arm64/darwin  (repo)      147,024 KB   12 symlinks   461 files
   .../arm64/darwin     (shipped)   193,860 KB    0 symlinks   467 files
                        inflation    46,836 KB
```

The 12 symlinks are PyInstaller's Python.framework layout, 4 per runner across
legendary/nile/gogdl: `_internal/Python -> Python.framework/Versions/3.12/Python`,
`Python.framework/Python -> Versions/Current/Python`,
`Python.framework/Resources -> Versions/Current/Resources`, and
`Python.framework/Versions/Current -> 3.12`. In the shipped tree all of these are REAL FILES, so
each runner carries the same 7,996,912-byte `Python` binary FOUR times instead of once plus three
links. Per-runner inflation is 15,612 KB (legendary 47,640 -> 63,252; nile 44,860 -> 60,472;
gogdl 40,516 -> 56,128); 15,612 x 3 = 46,836 KB, which accounts for the gap EXACTLY.

This is F-34.9-01's failure mode reappearing on the Tauri side. `preserveRunnerSymlinksPlugin`
(`meta/preserveRunnerSymlinks.ts`, `vite.config.ts:126`) restores symlinks after vite's publicDir
copy dereferences them, but nothing performs the equivalent repair after `bundle.resources` is
copied into the artifact. Roughly 45MB is recoverable on every macOS bundle, independently of both
fix (1) and fix (2). Logged as a follow-up todo; NOT fixed here, because it is a third mechanism
and folding it into this task would have made the size gate un-attributable.

The saved-`124.7MB` figure remains the correct measurement for THIS run. It is not evidence that
Task 1's overlay is narrower than intended -- the NEGATIVE half of the gate independently proves
all three unreachable trees are absent.

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


---

## RELEASE-BUILD MEASUREMENT, 2026-09-01 — and a RETRACTION

A real RELEASE build was made after this task closed
(`vite build` -> `build:sidecar-sea` -> `tauri build`, updater artifacts disabled via
`--config '{"bundle":{"createUpdaterArtifacts":false}}'` because
`~/.tauri/gamelib-updater-v2.key` is password-protected and the password was not available).

| | before | after | delta |
|---|---|---|---|
| DMG | 530,984,320 B | 388,901,574 B | **-142,082,746 B (-26.8%)** |
| installed `.app` | ~786 MiB (todo's figure) | 639,424 KiB (624.4 MiB) | ~-162 MiB |
| `Resources/build/bin` | 395 MiB (todo's per-tree figures) | 239,444 KiB (233.8 MiB) | **-161.2 MiB** |

### RETRACTION — the "saving fell short of the estimate" framing was WRONG

The correction written into this file earlier today claimed the ~124.7MB saving undershot the
plan's ~162MB estimate, and attributed the gap to symlink dereferencing. **The saving did not
undershoot anything. It is 161.2 MiB, matching the estimate.**

The `124.7MB` number is the plan gate's `repo build/bin - shipped bin` subtraction. That is the
WRONG PAIR. It measures narrowing AND symlink inflation together against a tree that was never
shipped. The meaningful comparison is OLD SHIPPED vs NEW SHIPPED:

```
tree            old(MiB)   new(MiB)
  arm64/darwin      189      189.3     <- kept, IDENTICAL
  x64/darwin         44       44.3     <- kept, IDENTICAL
  x64/win32          52        0.2     <- narrowed to the 2 Wine exes
  arm64/win32        38        0.0     <- removed
  x64/linux          37        0.0     <- removed
  arm64/linux        35        0.0     <- removed
  TOTAL             395      233.8     = 161.2 MiB saved
```

The kept trees being byte-for-byte identical old-to-new is the proof: **the ~46,836 KiB of
symlink dereferencing was present in the OLD bundle too** (the todo recorded old `arm64/darwin`
as 189M against a 147,024 KiB repo tree — the same ~45MB inflation). It is pre-existing overhead
that fix (1) neither caused nor was expected to remove.

**Cause 3 (symlink dereferencing) remains TRUE and remains worth ~45MB.** All four removed trees
carry 0 symlinks, so only the kept darwin trees are affected. What is retracted is solely the
claim that it explained a shortfall — there was no shortfall. The error is the same class this
repo keeps paying for: the RATIONALE was false while the underlying finding was sound.

### Fix (2) is confirmed still outstanding, on release numbers

`__text` 5,856,736 B / `__const` 223,766,872 B, and `strings | grep -c bin/x64/win32/gogdl.exe`
returns 1. Essentially unchanged from the pre-fix release baseline (`__const` 222,423,384). The
~212MB `frontendDist` embedding is untouched, exactly as designed.

---
spike: 086
name: fallout1-ce-native-intro
type: standard
validates: "Given fallout1-ce v1.1.0 beside a clone of the Steam 38400 data on Apple Silicon, when the Interplay logo and intro movies play and a save made by the Wine FALLOUTW.EXE is loaded, then the movies play at normal speed and the save loads"
verdict: VALIDATED
related: []
tags: [source-port, native-engine, fallout, macos, apple-silicon, known-fixes, hint-catalogue]
---

# Spike 086: fallout1-ce native intro + Wine-save compatibility

## What This Validates

Given fallout1-ce v1.1.0 staged beside an APFS-clone copy of the Steam Fallout (38400) data on
this Mac (Apple Silicon), when the intro movies play and the Wine exe's save is loaded, then the
movies play at normal speed (the bridge plays them ~10x slow and choppy) and the save loads.

Context: todo `2026-10-31-native-engine-source-port-runtime-route` (Trigger section has the
Wine-side ruling-out), decision note `.planning/notes/native-engine-ports-hint-only.md`
(GameLib only *hints* at ports; this spike checks the first catalogue row is worth showing).

## Research

- Release: `alexbatalov/fallout1-ce` v1.1.0, 2024-03-03. `fallout-ce-macos.dmg` 5,049,524 bytes,
  sha256 `db8833e4fe452e5cdff16a4c37893be0a4e5f6b473abe5ae4839a3ba61c11a2c`.
- Binary: **universal (x86_64 + arm64)**, hardened runtime, **Developer ID signed and notarised**
  (`spctl`: accepted, Notarized Developer ID, Alexander Batalov Z6EU6R7A86). Links only system
  frameworks; SDL2 is static. No quarantine prompt to expect beyond the normal first-open dialog.
- **Data location:** `winmain.cc` calls `chdir(SDL_GetBasePath())` on macOS, and the bundle's
  `Info.plist` sets `SDL_FILESYSTEM_BASE_DIR_TYPE = parent`. So CE reads its data from **the
  folder the `.app` sits in** — the README's "copy the Fallout folder somewhere, put the app in
  it". There is no data-path setting or argument; the app has to live next to the data.
- Saves: `loadsave.cc` reads `SAVEGAME\SLOTnn\SAVE.DAT` under `master_patches` (`data`). The
  header carries a version (CE writes 1.1 `R`) but `LoadHeader` does not reject on version.

## How to Run

```bash
./stage.sh <stage-dir>        # downloads + sha-checks the dmg, copies the .app, clones MASTER.DAT,
                              # CRITTER.DAT, fallout.cfg, DATA/ with cp -c (never writes the source)
./run.sh <stage-dir> [secs]   # launches CE, samples CPU/RSS once a second into run.log
```

`SRC` defaults to the bridge bottle's `.../steamapps/common/Fallout`.

## What to Expect

Interplay logo + intro movie at normal speed with in-sync audio; Load Game lists the Wine save
in slot 4 ("test", Oct 29) and it loads into Vault 13.

## Investigation Trail

1. **Staging.** Found the data only inside the bridge bottle
   (`GameLibSteamBridge-38400/drive_c/.../steamapps/common/Fallout`; no native Steam copy).
   Cloned with `cp -c` (same APFS volume, so no extra space). Source `MASTER.DAT` mtime stayed
   Oct 29 17:06 after staging.
2. **Run 1 (intro).** Operator: **intro played smooth.** CPU sat at ~100% of one core during two
   ~12 s movie windows (t=6–17 s, t=34–45 s) and 3–6% at the menu. So **CPU% does not separate
   CE from Wine** (Wine also sat at ~100%): CE's MVE player busy-waits a core. The signal that
   matters is pacing, and that is the operator's judgment, not a measurement.
3. **CE rewrites `fallout.cfg` on exit**: CRLF → LF, adds `player_speed=0`, bumps `splash` 2 → 3.
   Running CE inside the Steam folder would therefore change a Steam-owned file — supports
   "copy, don't move/symlink" in the hint's setup steps.
4. **Run 2.** Operator reported "no saves to load", made a new save in CE instead → `SLOT01`
   written (`SAVE.DAT` 38,275 B vs the Wine save's 38,255 B, same three-file layout).
5. **The "no saves" contradicted the code**, so checked rather than accepted: both `SAVE.DAT`
   headers are `FALLOUT SAVE FILE`, same character (Max Stone), version 1.2 (Wine) vs 1.1 (CE);
   CE's loader does not reject on version and reads the same `DATA/SAVEGAME` it wrote to.
6. **Run 3 (save, decisive).** Operator: **slot 4 (the Wine exe's save) was listed and loaded.**
   The run-2 "no saves" did not reproduce; most likely the slot was missed on that pass. Treat
   run 3 as the result.

## Results

**VALIDATED** for both questions:

- **Intro movies play smoothly natively** (operator-observed). The Wine-side problem
  (32-bit x86 MVE player under Rosetta + Wine, nothing in the bottle reaches it) does not exist
  under CE.
- **Wine-exe saves load in CE** (forward direction). CE writes saves in the same layout.

Not tested:

- **Reverse direction** (a CE save loaded by the Wine `FALLOUTW.EXE`). Would mean writing into
  the Steam install's `DATA\SAVEGAME`; the hint does not depend on it.
- **App Translocation.** A browser-downloaded (quarantined) app launched in place may be
  translocated to a random read-only path, and with `SDL_FILESYSTEM_BASE_DIR_TYPE=parent` CE
  would then find no data. `curl` downloads carry no quarantine, so this run could not show it.
  Setup help should say "move the app into the data folder in Finder, then open it" either way.
- Fullscreen/windowed, resolution (`f1_res.ini` was deliberately not copied: the bottle's copy is
  High Resolution Patch format), controller, Steam playtime (none — expected).

## Signal for the hint catalogue

The fallout1-ce row is worth showing. Row facts: `mac: universal`, notarised, `dataStyle: copy`
(`MASTER.DAT`, `CRITTER.DAT`, `DATA/`, optionally `fallout.cfg`), saves carry over from the
Windows exe. Setup steps: copy (don't move) the data into a new folder, drag the app into that
folder in Finder, open it.

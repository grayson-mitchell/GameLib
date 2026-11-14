---
created: 2026-10-31
title: "Explore: native engine replacements (source ports) as a per-game runtime route, starting with Fallout 1 CE"
area: known-fixes
files:
  - src/backend/knownFixes.ts
  - src/backend/knownFixOverlays.ts
  - src/backend/knownFixOverlayInstall.ts
  - src/common/knownFixOverlayCatalogue.ts
  - src/backend/storeManagers/steam/games.ts
  - .planning/notes/per-game-compat-fixes-architecture.md
severity: medium
platform: macos
ready: human
---

## Trigger

Fallout (Steam 38400), launched through the Steam bridge bottle (`GameLibSteamBridge-38400`,
CrossOver 26.3.0, Apple Silicon): the Interplay logo and intro movies play about 10x slow, picture
and audio both choppy. Gameplay after the intro is fine.

Ruled out on 2026-10-31, one change at a time, all still choppy:

- `f1_res.ini` `GRAPHICS_MODE` 2 -> 1 (DirectDraw 7) and 0 (basic), `MOVIE_SIZE=0`,
  `CPU_USAGE_FIX=0`
- PowerA Switch 2 pad unplugged (it did wedge `winedevice` and hang `wineboot --init` on one
  launch; see `.planning/debug/winebus-iohid-powera-wedge.md`, but it is not the movie cause)
- vanilla `FALLOUTW.EXE` (no High Resolution Patch)
- cnc-ddraw v7.1.0.0 with `renderer=auto`, `opengl` and `gdi` (registry `ddraw=native,builtin`
  per exe; `auto` with `GRAPHICS_MODE=1` also crashed and lost the mouse)
- the movies (`ART\CUTS\*.MVE`, 21 files, 139 MB) extracted from `MASTER.DAT` as loose
  `DATA\art\CUTS` files

During the movies the process sits at about 100% CPU with about 95k context switches and 150k
Mach messages per second. Rosetta hides the Windows-side frames from `sample`, so the hot code
could not be named. Conclusion: the Interplay MVE player is too slow as 32-bit x86 under Rosetta
plus Wine, and nothing configurable in the bottle reaches it. All test changes were reverted
except `MOVIE_SIZE=0` (backups `f1_res.ini.gamelib-bak`, `fallout.cfg.gamelib-bak` in the game
folder).

## Candidate fix

[fallout1-ce](https://github.com/alexbatalov/fallout1-ce) v1.1.0 (2024-03-03) ships a native macOS
`.dmg` (also Linux, Windows, iOS, Android). It is an engine reimplementation that reads the
original `MASTER.DAT`, `CRITTER.DAT`, `DATA\` and `fallout.cfg`. It is a source port, not a mod:
the user's copy supplies the copyrighted data, not the exe. The same shape covers Fallout 2 CE
(38410) and other source ports.

## Fit with the known-fixes tiers (analysis, not decided)

- **Trust: tier 2.** It is a binary payload, so it is bundled/local only and never remote
  (decision 6). It is overlay-like: sha-pinned, downloaded on demand from a pinned upstream URL,
  add-only, recorded, removable. It never modifies game files (decision 4).
- **Vocabulary: no existing key expresses it.** Every tier-2 key assumes Wine runs the game.
  `exeOverride` is tier 1, Wine-launched and contained to the install folder. A new building block
  is needed, e.g. `nativeEngine: { id }` naming an entry in the overlay catalogue. It acts like a
  routing key (`macArch`, `drm`) that carries a payload, and needs `platforms` scoping (reserved,
  not implemented).
- **Generic from day one** (decision 3): a catalogue entry per source port, never "the Fallout
  fix".
- **License:** Sustainable Use License 1.0. Redistribution is allowed only free of charge and
  non-commercially, with the terms included. Prefer downloading from the upstream release on demand
  over bundling the binary in a GameLib release.

## Open questions

1. Manually verify fallout1-ce plays the intro smoothly on this Mac before any design work?
2. Key shape: a new tier-2 key, or an overlay `target` kind plus a launch route?
3. Where the engine lives (outside the bottle, pointing at the install's data dir) and how the
   launch path bypasses `prepareWineLaunch` / the bridge.
4. Config: CE reads its own `fallout.cfg` / `f1_res.ini`; what carries over from the bottle copy.
5. Save compatibility between the Wine exe and CE (unverified).
6. UI: is this a per-game runtime choice (Wine / bottled Steam / native engine) the user picks, or
   applied automatically when the profile exists? Steam playtime and achievements under a native
   launch.

Next step: `/gsd-explore` on these questions, then a spike for question 1.

---
title: Native engine replacements (source ports) — hint only, never a runtime route
date: 2026-11-15
context: /gsd-explore session on todo 2026-10-31-native-engine-source-port-runtime-route (Fallout 38400 intro movies ~10x slow under Rosetta + Wine; fallout1-ce as the candidate fix)
related: [per-game-compat-fixes-architecture.md]
---

# Native engine replacements (source ports) — hint only

## Decision

GameLib **points at** source ports; it never downloads, pins, configures or launches them.

- The game page shows a **"Native port available"** block when a catalogue row matches the game's
  AppId: port name, upstream link, licence, macOS support (arm64 / universal / x86 / none), and a
  short note (e.g. "needs the original `baseq2` data, not the rerelease").
- It carries **setup help**: "Show data folder" (reveal the install dir), "Copy install path"
  (for the port's first-run directory picker), and per-port steps chosen by the port's
  data-location style (below).
- The user installs the port themselves and adds it to GameLib as a **sideloaded game**
  (`src/backend/storeManagers/sideload`). It is a separate library entry.

Rejected, in the order discussed:

1. **Applied automatically as a known fix** (`nativeEngine` tier-2 key) — operator: "definitely
   not". Swapping the engine silently changes saves, mods, and Steam playtime/achievements under
   the user.
2. **A per-game runtime choice** (Wine bottle / bottled Steam / native engine picker, GameLib
   fetches and launches the port) — not chosen. Licence review per port, per-port packaging and
   data-path wiring, unsigned-dmg quarantine handling, a pinning policy for nightly-only ports, and
   a launch route that bypasses `prepareWineLaunch` — all for ~40 rows. The hint catalogue can
   grow fields later for the few ports that would justify it; nothing here forecloses that.

## Why hint-only fits the landscape (survey, 2026-11-15)

Researcher pass: release dates and macOS release assets verified with `gh api`; AppIds and data
conventions partly from memory, marked (u).

- **~35–45 ports** pass all four filters: game still sold on Steam/GOG/Epic, consumes original
  data, prebuilt binaries, a release since late 2024. **~15–20** ship a native macOS build.
- Multi-game engines push coverage to **~200+ store SKUs** (ScummVM alone 100+; GZDoom/UZDoom,
  Raze, OpenRA each a family). Long tail: a few hundred projects, mostly dead / no binaries /
  freeware or delisted targets.
- **Licences are a minefield.** Sustainable Use License (non-OSI, non-commercial): fallout1-ce,
  fallout2-ce, devilutionX. Non-commercial: Build-engine ports (NBlood, EDuke32-derived), JA2
  Stracciatella (SFI), Xash3D's game DLLs (Valve HLSDK). A link sidesteps redistribution entirely.

### Native-Mac candidates for the first catalogue rows

| Game | Port | Steam AppId | Mac | Licence | Data style |
| --- | --- | --- | --- | --- | --- |
| Fallout | alexbatalov/fallout1-ce | 38400 | dmg (arch u) | SUL | copy |
| Fallout 2 | alexbatalov/fallout2-ce | 38410 | dmg (arch u) | SUL | copy |
| Morrowind | OpenMW/openmw | 22320 | arm64 | GPL-3 | point |
| RCT2 / RCT Classic | OpenRCT2/OpenRCT2 | 285330, 683900 | universal | GPL-3 | point / GOG import |
| Locomotion | OpenLoco/OpenLoco | 356430 | arm64 | MIT | point |
| Heroes III | vcmi/vcmi | 297000 (HD, partial u) | arm64 | GPL-2 | point / GOG import |
| Diablo + Hellfire | diasurgical/devilutionX | GOG only | universal | SUL | copy |
| Doom family | UZDoom, chocolate-doom, dsda-doom | 2280, 2290, 2300, 2390, 2360 | arm64 / universal | GPL | point (IWAD) |
| Wolfenstein 3D | ECWolf | 2270 | dmg | GPL + id (u) | point |
| Jedi Academy / Outcast | JACoders/OpenJK | 6020, 6030 | arm64 (rolling) | GPL-2 | copy |
| Half-Life | FWGS/xash3d-fwgs | 70 | arm64 (rolling) | GPL-3 + HLSDK | point |
| Tomb Raider I–II | LostArtefacts/TRX | 224960, 225300 | dmg | GPL-3 | copy (installer) |
| Caesar III | bvschaik/julius | 517790 | dmg | AGPL-3 | point |
| C&C / Red Alert | OpenRA/OpenRA | (u) | dmg | GPL-3 | content installer |
| Adventure games | scummvm/scummvm | many | universal (u) | GPL-3 | point (MD5 detect) |

No Mac build (Linux/Windows rows only): dhewm3 (9050), yquake2 (2320), ironwail/vkQuake (2310),
NBlood. Windows-only: KeeperFX.

### Data-location styles (drives the setup help)

- **point** — port asks for / is configured with the install dir. Setup help: Copy install path.
- **copy** — data files copied into the port's dir, or the port dropped into the game dir. Against
  a Steam install that duplicates or modifies files Steam validates; setup help should say
  "copy, don't move" and name the files (e.g. `MASTER.DAT`, `CRITTER.DAT`, `DATA\`).
- **import** — port extracts from a GOG offline installer itself (VCMI, OpenRCT2, OpenRA).

### Catalogue sources (build offline, check in as JSON — no live fetch)

- **osgameclones** (github.com/opengaming/osgameclones) — YAML: project → original game, type,
  licence, repo. Seed list.
- **PortMaster** `ports.json` (PortsMaster/PortMaster-Info) — machine-readable required data files
  per port (ARM handheld ports, but the data metadata is reusable).
- **Debian game-data-packager** — per-game YAML with file names, sizes, checksums, Steam/GOG
  extraction. Best source for "does this install have the data the port needs".
- Lutris installer scripts, Flathub, Homebrew casks — install sources, not catalogues.

### Gotchas

1. **One engine → many AppIds.** The row shape is port → `appIds[]`, not one port per game.
2. **Remasters share AppIds with originals.** Quake, Quake II, Doom 64, Doom + Doom II ship
   different files under the same AppId; a hint can be wrong for some installs. Carry a note, or
   a data-file presence check before showing the hint.
3. **Mac builds are uneven.** Unsigned/unnotarised dmgs (quarantine), x86-only (fheroes2),
   rolling nightlies with no versioned release (OpenJK, Xash3D, OpenEnroth, UZDoom preview).
4. **Steam tracking.** A sideloaded port is not a Steam launch: no playtime, no achievements. Say
   so in the block.
5. fallout1-ce's last release is v1.1.0 (2024-03); commits continue to 2025-01. Fine for a hint;
   would matter for a pinned download.

## Still open

- ~~Does fallout1-ce fix the 38400 intro on this Mac, and do Wine-exe saves load in CE?~~
  **Yes — spike 086 (2026-11-15).** Intro smooth natively; the Wine save loads. The dmg is
  universal and notarised; CE reads data from the folder the `.app` sits in and rewrites
  `fallout.cfg` on exit (so: copy the data, don't run in the Steam folder). Untested: CE save →
  Wine exe, and App Translocation of a browser-downloaded app (setup help should say "drag the
  app into the data folder in Finder").
- Should the hint be gated on a data-file presence check (remaster ambiguity), or always shown
  with a note?

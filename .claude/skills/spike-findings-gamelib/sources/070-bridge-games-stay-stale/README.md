---
spike: 070
name: bridge-games-stay-stale
type: standard
validates: "Given Steam games installed by GameLib's bridge into per-game bridge bottles, when the developer ships a new public build after install, then nothing updates the bridge install: its ACF buildid, depot manifest GIDs and game files stay at the install build"
verdict: VALIDATED
related: [069]
tags: [steam, macos, bridge, update, buildid, pics, acf, phase-74, live]
---

# Spike 070: Bridge games stay on their install build

## What This Validates

**Given** Steam games installed by GameLib's bridge (each into its own
`GameLibSteamBridge-<appId>` CrossOver bottle, `drive_c/Program Files (x86)/Steam/steamapps`),
**when** the developer ships a new public build after the install, **then** nothing updates the
bridge install. Its ACF `buildid`, its `InstalledDepots` manifest GIDs and its game files all
stay at the install build.

This is the live check Phase 74's case 2 asked for before building ("Confirm case 2 live before
building", todo `2026-11-07-implement-steam-game-updates.md`), and the reason that case is
`major`.

## How to Run

```bash
node .planning/spikes/070-bridge-games-stay-stale/compare.mjs > compare.jsonl   # from the repo root
```

The script is read-only. It parses every `appmanifest_*.acf` in every `GameLibSteamBridge-*`
bottle and fetches the public branch's `buildid`, `timeupdated` and per-depot manifest GID for
each app from anonymous PICS (steam-user, production options). It writes one JSON row per
install.

## Investigation Trail

All on 2026-11-08. No install was needed: 28 bridge installs already existed, dated 2026-10-22
to 2026-11-07, which made this a natural experiment.

1. **First comparison.** 6 of 28 installs had `buildid` ≠ public `buildid`. **Every depot GID
   differed for all 28**, which can't be right. The cause was the spike, not the data:
   `@node-steam/vdf` parses 19-digit manifest GIDs as JS numbers and loses precision. GIDs are
   now read from the raw ACF text. **Signal for the build:** never pull manifest GIDs through
   `vdf.parse` number coercion.
2. **Fixed comparison** (`compare.jsonl`). **6 stale, 22 current. The build check and the GID
   check agree on all 28 installs.** Each stale game's public build shipped after its install:

   | App | Game | Installed (UTC) | Build | Public build shipped | Public build |
   |---|---|---|---|---|---|
   | 1363080 | Manor Lords | 10-23 09:39 | 24905706 | 10-31 09:16 | 26185246 |
   | 1621690 | Core Keeper | 10-29 00:05 | 25825408 | 11-02 14:40 | 26332184 |
   | 427410 | Abiotic Factor | 10-26 23:55 | 26092436 | 11-03 22:33 | 26373201 |
   | 1284190 | The Planet Crafter | 10-23 09:22 | 25296421 | 11-04 10:24 | 26411416 |
   | 1782460 | Hell Clock | 10-23 09:05 | 26117724 | 11-04 14:57 | 26431636 |
   | 1603180 | Mining Mechs | 10-23 19:42 | 26166874 | 11-07 18:47 | 26509883 |

   No current install has a public build newer than its install, so every game the developer
   updated is stale. Manor Lords has been stale for 8 days and has been launched since (its
   `Version.txt` was rewritten 11-07 12:28 and still reads `0.8.104`).
3. **The ACFs were never rewritten.** For all 28, the ACF mtime equals its `LastUpdated`.
4. **The game files were never updated** (`file-mtimes.txt`). In the stale games, every file
   modified more than 2 min after install belongs to GameLib (the shim swap: `steam_api64.dll`,
   `steam_api64.dll.gamelib-orig`, `gamelib_bridge.cfg`) or is written by the game or DXVK at
   runtime (`*.dxvk-cache`, `*_d3d11.log`, Manor Lords' `Version.txt`). Core Keeper's newest
   file is its install time.
5. **Nothing could update them.**
   - Mac Steam's `libraryfolders.vdf` lists only its own folder and `/Volumes/Untitled/SteamLibrary`,
     never a bottle.
   - Bridge bottles hold only `steamapps`, or for DRM-mode games, GameLib's own `steam.exe`
     (193536 B, strings `gamelib-steam-helper: …`) plus `lsteamclient.dll` and Valve's client
     DLLs. That `steam.exe` is the helper stub, not Valve's Steam client, and has no updater.
   - No Windows `steam.exe` process was running; only wineserver services were.

## Results

**VALIDATED (macOS, n=28 installs, 6 natural updates).** Bridge games don't update. Every bridge
install whose developer shipped a build after install day is still on its install build: ACF,
manifest GID and files. Nothing on the machine looks at those folders with an updater. This
confirms Phase 74's case 2 and its `major` rating. The live gate now has six ready fixtures,
including multiplayer games (Core Keeper, Abiotic Factor).

Signal for Phase 74:

- **Detection:** compare the ACF `buildid` with PICS `depots.branches.public.buildid`. That
  matched the per-depot GID check exactly here (28/28), and the GID check is what the delta
  updater needs anyway. Use a branch other than `public` only when the ACF carries a `BetaKey`.
  Don't use `timeupdated`; it is missing for older apps (Avernum 6, Fallout, Torchlight,
  Dredmor).
- **Read GIDs as strings.** `@node-steam/vdf` number coercion corrupts them (step 1).
- **An update must keep GameLib's own files.** The shim swap rewrites `steam_api64.dll` and
  leaves `.gamelib-orig` and `gamelib_bridge.cfg`, which no Valve manifest owns. A delta
  update has to restore the original before diffing, or treat the swapped DLL as GameLib's,
  then re-place the shim (already in the Phase 74 goal).
- **Runtime files in install dirs** (DXVK caches, logs, version stamps) aren't in any manifest.
  The rule "keep files the old manifest didn't own" covers them.
- **Not tested here:** GameLib's UI showing anything for these (it can't: `update()` is a stub).
  Multi-depot updates: all six stale games have one depot.

## Files

- `compare.mjs` / `compare.jsonl`: bridge ACF vs public PICS, one row per install
- `file-mtimes.txt`: files modified after install, per stale game

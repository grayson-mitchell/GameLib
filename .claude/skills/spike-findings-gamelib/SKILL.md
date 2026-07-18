---
name: spike-findings-gamelib
description: Implementation blueprint from GameLib spike experiments — verified patterns, requirements, and gotchas for (a) Steam native depot install + ACF adoption and (b) the macOS native Steam bridge. Auto-loaded during Steam/macOS implementation work.
---

<context>
## Project: GameLib

GameLib is a Heroic Games Launcher fork adding Steam as a first-class platform on macOS/Windows/
Linux. Two spike lines are captured here: **Steam native install** (GameLib owns the depot
download and writes an `appmanifest.acf` Steam adopts; launch stays on `steam://` for DRM) and the
**macOS native Steam bridge** (run bottled Windows games against ONE native Mac Steam client via an
out-of-process `steam_api` proxy, instead of bottling a full Windows Steam per CrossOver bottle).

Spike sessions wrapped: 2026-07-14 → 2026-07-18 (bridge line extended through 008).
</context>

<requirements>
## Requirements (non-negotiable — see the reference files for full detail)

**Steam native install (001–003):**
- Launch stays with Steam (`steam://`); the download is bypassed, not the DRM.
- `StateFlags=4` full-ownership is achievable with a per-chunk sha1 gate + correct
  `Bytes*`/buildid/`InstalledDepots`/file-modes; `1026` is the fallback (spike 003 reversed the old
  "never 4" rule).
- 64-bit IDs (manifest GIDs, SteamID64) are **strings end-to-end** — `@node-steam/vdf` rounds them.
- Depot selection = package-level ownership via two channels; never PICS-alone.
- Download in-process via `steam-user` + `getRawManifest()`; retry chunks across content servers.

**macOS native Steam bridge (004–008):**
- Bridge at the `steam_api` flat layer, **out-of-process** (PE shim → TCP → native helper loading
  `libsteam_api.dylib`); NOT the in-process `lsteamclient` thunk (blocked/Valve-scale).
- Proxy the running signed-in native Mac Steam; never replicate auth. Supply the game's real AppID.
- A drop-in shim must export **every** symbol the game imports (objdump the exe) or it won't load.
- Unmodified games use **C++ vtables**; the MSVC-`__thiscall` vtable mechanism is PROVEN (006).
  The full per-interface generator (pinned SDK) is the first build task. Handle sret (>8-byte returns).
- The bridge is a **compatibility layer, not a DRM gate** — `steam_api.dll` returns are advisory;
  real enforcement is CEG/DRM below the flat API (008). A real game ran on the bridge (007).
- P2P multiplayer join is the known-hard gap.
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Steam native install | references/steam-native-install.md | GameLib-owned depot download is byte-identical to Steam; `StateFlags=4` full-ownership is trustworthy with a sha1 gate; 64-bit IDs must be strings |
| macOS native Steam bridge | references/macos-steam-bridge.md | Out-of-process `steam_api` bridge PROVEN end-to-end incl. a **real commercial game** (007) and the **C++ vtable ABI** (006); it's a compatibility layer not a DRM gate (008). Remaining: full shim generator + P2P join |

## Source Files

Original spike source is preserved in `sources/` (001–003 = Node `.mjs`; 005 = C helper/shim/harness
+ build/run scripts + in-bottle evidence; 004 = research READMEs).
</findings_index>

<metadata>
## Processed Spikes

- 001-acf-adoption
- 002-steam-user-depot-download
- 003-stateflags4-full-ownership
- 004a-wine-mach-o-thunk
- 004b-community-lsteamclient-survey
- 004c-native-mac-steam-ipc-surface
- 005a-native-steam-helper-handshake
- 005b-bottle-to-host-tcp
- 005c-min-steam_api-shim
- 006-cpp-vtable-abi
- 007-real-game-avernum
- 008-gating-game-hoard
</metadata>

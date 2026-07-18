# Spike Wrap-Up Summary

**Date:** 2026-07-18 (updated — bridge line extended through 008)
**Spikes processed:** 12
**Feature areas:** Steam native install; macOS native Steam bridge
**Skill output:** `./.claude/skills/spike-findings-gamelib/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | acf-adoption | standard | ✓ VALIDATED | Steam native install |
| 002 | steam-user-depot-download | standard | ✓ VALIDATED | Steam native install |
| 003 | stateflags4-full-ownership | standard | ✓ VALIDATED | Steam native install |
| 004a | wine-mach-o-thunk | standard | ⚠ PARTIAL | macOS native Steam bridge |
| 004b | community-lsteamclient-survey | standard | ✓ VALIDATED | macOS native Steam bridge |
| 004c | native-mac-steam-ipc-surface | standard | ✓ VALIDATED | macOS native Steam bridge |
| 005a | native-steam-helper-handshake | standard | ✓ VALIDATED | macOS native Steam bridge |
| 005b | bottle-to-host-tcp | standard | ✓ VALIDATED | macOS native Steam bridge |
| 005c | min-steam_api-shim | standard | ✓ VALIDATED | macOS native Steam bridge |
| 006 | cpp-vtable-abi | standard | ✓ VALIDATED | macOS native Steam bridge |
| 007 | real-game-avernum | standard | ✓ VALIDATED | macOS native Steam bridge |
| 008 | gating-game-hoard | standard | ⚠ PARTIAL | macOS native Steam bridge |

## Key Findings

**Steam native install (001–003):** GameLib can own the first install — download depots in-process
via `steam-user` (`getRawManifest()` + own decrypt; byte-identical to Steam), write an
`appmanifest.acf` Steam adopts, and launch via `steam://` so DRM holds. Spike 003 reversed the
"never write StateFlags=4" rule: a per-chunk sha1 gate makes full-ownership `4` trustworthy.
64-bit IDs must be strings (vdf rounds them); depot selection is package-ownership two-channel.
Operationalized in Phases 21/23.

**macOS native Steam bridge (004–008):** The seed's premise (gated on a macOS `lsteamclient`) was
too pessimistic. A LOWER, out-of-process `steam_api` bridge already works, proven on GameLib's exact
stack across every layer: 005a native helper reads real SteamID/persona from live Mac Steam via the
on-disk `libsteam_api.dylib`; 005b a Windows PE in the real GameLibSteam bottle round-trips that
identity over host loopback; 005c a drop-in `steam_api.dll` a game-like caller loads returns the
real SteamID (flat path); **006** the same via a real C++ **vtable** virtual call (MSVC `__thiscall`);
**007** a **real commercial game** (Avernum 4) ran on the bridge; **008** the bridge drives the Steam
gate correctly, but games often ignore `steam_api.dll` returns — it's a **compatibility layer, not a
DRM gate** (real enforcement is CEG-level). Remaining productionization: the full per-interface shim
generator (`gen_vtables.py` scope + sret), callback breadth, a persistent channel, and the
known-hard P2P-join gap. Toolchain: `brew` only dry-runs in this env — PEs built with `zig cc
-target x86-windows-gnu`; run in the bottle via `bin/wine` (NOT `cxstart`, which wedges wineserver).

## Blueprint

`./.claude/skills/spike-findings-gamelib/` — auto-loads in future build conversations
(`references/steam-native-install.md`, `references/macos-steam-bridge.md`, `sources/`).

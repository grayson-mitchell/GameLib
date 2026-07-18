---
created: 2026-07-18T01:50:44.561Z
title: Productionize the macOS native Steam bridge (out-of-process steam_api proxy)
area: steam
files:
  - .planning/seeds/macos-steam-native-bridge-lsteamclient.md
  - .planning/spikes/MANIFEST.md
  - .planning/spikes/005c-min-steam_api-shim/
  - .claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md
---

## Problem

GameLib on macOS today bottles a **full Windows Steam client** inside each CrossOver bottle, which
forces a separate one-time Steam login per bottle (the cost Phase 22 "Steam Game Families"
accepts). The preferred long-term architecture is a Proton-style bridge: ONE native macOS Steam
client + lightweight per-game bottles that proxy Steamworks IPC out to it → one login, cheap
per-game prefixes.

**Feasibility is no longer the question — it's PROVEN end-to-end on this stack** (spikes 004+005,
2026-07-18):
- 005a — a native arm64 helper `dlopen`s the on-disk `libsteam_api.dylib` and reads the real
  signed-in SteamID/persona from the running Mac Steam.
- 005b — a Windows PE inside the real `GameLibSteam` bottle round-trips that identity to the host
  over loopback (Wine shares the host network namespace).
- 005c — a **drop-in replacement `steam_api.dll`** that a game-like caller loads returns the real
  SteamID via shim → TCP → host helper → native Mac Steam. Zero Windows Steam client in the bottle.

This is Phase 22's credible successor; if shipped it likely supersedes much of the multi-bottle
machinery. Deferred, not urgent — capturing so it isn't lost. Phase 22 remains the ship-now answer.

## Solution

Not a weekend task; scope a dedicated phase when resourced. The out-of-process `steam_api` TCP
bridge is the path (NOT the in-process `lsteamclient` thunk — blocked/Valve-scale, see spike 004a).
Follow the blueprint in `spike-findings-gamelib/references/macos-steam-bridge.md`. Remaining
productionization work (all beyond the proven backbone):

1. **C++ vtable ABI** — the hard next step. Unmodified games call `SteamUser()->GetSteamID()` via
   the C++ vtable, not the flat export 005c proved. Generate vtable layouts + `__thiscall`/`ret N`/
   sret marshaling from pinned SDK headers (L4D2-launcher's `gen_vtables.py` approach). This is the
   right next **frontier spike** before committing a phase.
2. **API/callback breadth** — full flat + COM surface, callback dispatch with pack(4)→pack(8) repack.
3. **P2P multiplayer join** — known-hard gap (`InitRelayNetworkAccess()` + `AcceptP2PSessionWithUser`;
   only partially fixed upstream). Single-player/auth/persona/listen-server hosting already work.
4. **Persistent channel** — replace connect-per-call; host helper holds inited interface pointers.
5. **Packaging/portability** — generate the shim per bottle; validate across Apple-Silicon variants
   (L4D2 validated only on M4). Toolchain: build PEs with `zig cc -target x86-windows-gnu` (brew
   only dry-runs in this env). Bottle run: `CX_BOTTLE=<bottle> <CrossOver>/bin/wine "C:\prog.exe"`.

Prior art: samdotson61/L4D2-launcher (working shallow bridge), natbro/kaon (deep lsteamclient, stuck).

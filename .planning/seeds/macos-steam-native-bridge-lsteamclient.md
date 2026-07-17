---
title: macOS Steam bridge — native Steam client + bottled games (Proton-style lsteamclient)
trigger_condition: Once a macOS Wine↔native Steamworks bridge becomes feasible — e.g. CodeWeavers/Apple ship an lsteamclient-equivalent, a community port appears (Whisky/GPTK ecosystem), or we commit R&D budget to build one. NOT a weekend task; do not start until the bridge component exists or is explicitly resourced.
planted_date: 2026-07-17
related_phase: 22 (Multiple Steam Bottles / game-family configurations — the pragmatic fallback for this idea)
---

# Seed: macOS Steam native bridge (the preferred long-term architecture)

## The idea

Replicate the **Linux/Proton** Steam architecture on macOS: run ONE **native**
Steam client, and run each Windows game inside a lightweight Wine prefix that
**bridges** its Steamworks/DRM IPC out to that single native client — instead of
today's model, where GameLib bottles a full **Windows** Steam client inside each
CrossOver bottle.

If this existed, the whole multi-bottle login problem dissolves: one native
Steam client = **one login**, and games get cheap per-game prefixes (like
Proton's `compatdata/<appid>/pfx`) rather than each needing its own bundled Steam
client + separate Steam Guard login.

This is the user's **preferred** direction (2026-07-17). It is deferred, not
rejected — Phase 22's game-family/multi-bottle approach is the fallback that ships
value now while this remains gated on a hard dependency.

## Why it's deferred (the hard dependency)

On Linux, the bridge is a **Valve-built Proton component**: `lsteamclient` (a Wine
DLL shim) marshals the Windows Steamworks ABI in-process across the PE↔ELF
boundary to the native Linux `steamclient.so`. The game's `steamclient.dll` is
that shim, not the real client; all Steamworks/DRM logic runs in the native
client process.

**No macOS equivalent exists.** Neither Valve (no Proton for Mac), Apple's GPTK,
nor CrossOver ships an `lsteamclient` port or a bridgeable native macOS Steamworks
`.dylib`. Wine-on-macOS *can* thunk to native Mach-O libraries in principle, so
it's conceivable — but building it is effectively "port Proton to macOS":
1. a macOS `lsteamclient` port (Win↔Mach-O Steamworks ABI thunk),
2. a native macOS Steamworks library exposed for a Wine game to attach to (the
   native Mac Steam client's IPC isn't designed/documented for this),
3. the Steam-runtime socket/IPC plumbing, re-created for Mac.

That neither Valve nor CodeWeavers has done this — despite CrossOver being Steam's
own Wine lineage — is the strongest signal it's Valve/CodeWeavers-scale work, not
a GameLib feature phase.

Corollary already proven in-code: running native macOS Steam + bottling only the
game does NOT work without the bridge — the bottled Windows game's
`steamclient.dll` expects Windows IPC the native Mac client doesn't speak. That's
exactly why GameLib bottles the whole Windows Steam client today.

## First steps if/when picked up

- Spike whether a Wine (CrossOver/GPTK) game process can load and call a native
  macOS `.dylib` exposing the Steamworks C ABI (validate the thunk mechanism).
- Survey the Whisky/GPTK community for any partial `lsteamclient` macOS work.
- Determine whether the native macOS Steam client exposes any attachable
  Steamworks IPC surface, or whether a headless Steamworks shim would be needed.
- Only then scope a phase; until the bridge exists, Phase 22 (game families) is
  the shipping answer.

## Relationship to Phase 22

Phase 22 (multiple CrossOver bottles / "game families") is the **fallback** for
this idea — it delivers per-game configuration isolation now, accepting the
one-time-login-per-bottle cost that this bridge would eliminate. If this seed ever
ships, it would likely **supersede** much of Phase 22's multi-bottle machinery.

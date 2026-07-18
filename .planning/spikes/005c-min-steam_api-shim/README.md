---
spike: 005c
name: min-steam_api-shim
type: standard
validates: "Given a Windows module in a GameLib bottle that LoadLibrary's a replacement steam_api.dll, when it calls the Steamworks flat API, then SteamAPI_Init + GetSteamID marshal over TCP to the host bridge and return the real SteamID from native Mac Steam"
verdict: VALIDATED
related: [005a, 005b]
tags: [steam, macos, bridge, steam_api, shim, dll, crossover, phase-22]
---

# Spike 005c: Minimal replacement `steam_api.dll` shim

> Part of **Idea B — macOS native Steam bridge** (spike 004). The third and final leg of the
> L4D2-style architecture: a **drop-in `steam_api.dll`** that a Windows module *loads and calls*,
> marshaling to the host bridge. Built + run live in the GameLibSteam bottle, 2026-07-18.

## What This Validates

**Given** a Windows module inside the GameLibSteam bottle that `LoadLibrary`s a replacement
`steam_api.dll`, **when** it calls the Steamworks flat API (`SteamAPI_Init`, get user,
`GetSteamID`), **then** the calls marshal — through the shim + host bridge (005b) — to native
Mac Steam and return the **real** SteamID.

## Architecture

```
[ GameLibSteam bottle ]
  harness.exe  (stands in for a game)
    LoadLibraryA("C:\steam_api.dll")            <-- our replacement shim (PE32 i386)
    SteamAPI_Init()                     -> 1
    SteamAPI_SteamUser_v023()           -> handle
    SteamAPI_ISteamUser_GetSteamID() ── shim marshals "WHOAMI" over TCP 54550 ──►
                                                         [ host bridge_server (005b) ]
                                                          libsteam_api.dylib → live Mac Steam
    <── 76561197995867096 ───────────────────────────────────────────────────────
```

Exports (verified in the built DLL): `SteamAPI_Init`, `SteamAPI_InitFlat`, `SteamAPI_Shutdown`,
`SteamAPI_RunCallbacks`, `SteamAPI_SteamUser_v023`, `SteamAPI_ISteamUser_GetSteamID` — exact
undecorated names forced via `steam_api.def` (S_API is `__cdecl` on i386, the default here).

## How to Run

```bash
# build the 005b host bridge first (shared host side):
( cd ../005b-bottle-to-host-tcp && ZIG=/path/to/zig bash build.sh )
ZIG=/path/to/zig bash build.sh     # -> steam_api.dll + harness.exe (both PE32 i386)
bash run.sh                         # needs Steam signed in + GameLibSteam bottle
```

## Investigation Trail

1. Wrote `steam_api_shim.c` implementing the minimal flat surface; `GetSteamID` opens a socket to
   the 005b bridge, sends `WHOAMI`, parses `steamID64`. `steam_api.def` pins exact export names.
2. `zig cc -target x86-windows-gnu -shared … steam_api.def` → `PE32 executable (DLL) Intel 80386`.
   Confirmed all six `SteamAPI_*` export names present.
3. `harness.c` simulates a game: `LoadLibraryA("C:\steam_api.dll")` → `GetProcAddress` →
   `SteamAPI_Init()` then `GetSteamID(SteamAPI_SteamUser_v023())`.
4. Ran `harness.exe` in the bottle (`CX_BOTTLE=GameLibSteam wine "C:\harness.exe"`). stdout and
   `C:\shim_out.txt`:
   `SHIM_GAME_PATH SteamAPI_Init=1 GetSteamID=76561197995867096` — the real ID, delivered through
   a replacement steam_api.dll to game-style calling code.

## Results

**Verdict: VALIDATED.** A replacement `steam_api.dll` inside the real GameLib bottle serves a
game-like caller the **live** SteamID from native Mac Steam, with zero Windows Steam client in the
bottle. Combined with 005a (host↔Steam) and 005b (bottle↔host), **all three legs of the L4D2-style
out-of-process bridge are now reproduced on GameLib's exact stack.**

**What this does NOT prove (the remaining productionization — matches MANIFEST Idea B):**
- **The C++ vtable ABI.** An *unmodified* game calls `SteamUser()->GetSteamID()` through the C++
  vtable, not the flat `SteamAPI_ISteamUser_GetSteamID` export this harness calls. Reproducing the
  vtable layout + `__thiscall`/`ret N`/sret marshaling is exactly what L4D2's `gen_vtables.py`
  generates from pinned SDK headers — the known next step, not re-litigated here.
- **Breadth of API.** Only identity is marshaled. A real bridge proxies the full flat + COM
  surface, callback dispatch (pack(4)→pack(8) repack), and hits the known-hard P2P-join gap.
- **Lifetime/perf.** One TCP connect per call here; production wants a persistent channel + the
  bridge holding the interface pointers (the server already inits once).

Evidence: `shim_out.txt`, built `steam_api.dll` export list, and the transcript above.

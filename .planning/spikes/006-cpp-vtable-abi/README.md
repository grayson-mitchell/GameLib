---
spike: 006
name: cpp-vtable-abi
type: standard
validates: "Given a replacement steam_api.dll exposing an MSVC-ABI C++ vtable for ISteamUser, when a game-style virtual dispatch calls GetSteamID (slot 2, __thiscall), then it marshals to the host bridge and returns the real SteamID"
verdict: VALIDATED
related: [005a, 005b, 005c]
tags: [steam, macos, bridge, steam_api, vtable, thiscall, abi, msvc, phase-22]
---

# Spike 006: C++ vtable ABI (the unmodified-game path)

> Part of **Idea B — macOS native Steam bridge** (spike 004/005). 005c proved the *flat export*
> path; this proves the harder, load-bearing one: an **unmodified game's C++ virtual call**
> `SteamUser()->GetSteamID()` — dispatched through the object's vtable with the **MSVC ABI** —
> served by our replacement `steam_api.dll` via the bridge. Built + run live in the GameLibSteam
> bottle, 2026-07-18.

## What This Validates

**Given** a replacement `steam_api.dll` exposing an MSVC-ABI C++ vtable for `ISteamUser`, **when**
a game-style virtual dispatch calls `GetSteamID` (vtable **slot 2**, MSVC `__thiscall`: `this` in
ECX, 8-byte `CSteamID` returned in EDX:EAX), **then** the call marshals to the host bridge and
returns the **real** SteamID64.

## Why this is the crux

A real Steam game (MSVC-compiled) does not call the flat `SteamAPI_ISteamUser_GetSteamID` export
(that's 005c). It calls a **C++ virtual method**: load the vtable ptr from the object, index to the
method's slot, call it with `__thiscall`. Our shim must present a vtable that is binary-compatible
with what an MSVC game emits. This is exactly what L4D2-launcher's `gen_vtables.py` builds — 006 is
the minimal proof it's reproducible on GameLib's stack.

## Architecture

```
[ GameLibSteam bottle ]
  harness.exe                              steam_api.dll (our shim)
    u = SteamAPI_SteamUser_v023()   ─────►  returns &obj; obj.first_word -> vtable[]
    vtbl = *(void***)u                       vtable[0]=GetHSteamUser
    fn   = vtbl[2]  (GetSteamID)             vtable[1]=BLoggedOn
    ECX=u; call fn  (MSVC __thiscall) ─────► vtable[2]=vt_GetSteamID (__thiscall)
                                                └─ marshals "WHOAMI" -> host bridge (005b)
    EDX:EAX = 76561197995867096  ◄───────────────── real SteamID from native Mac Steam
```

## Toolchain / ABI notes

- Built with `zig cc -target x86-windows-gnu` (PE32 i386). `brew` doesn't work here (dry-run only).
- **mingw/clang windows-gnu C++ uses the Itanium ABI** (this on the stack), NOT MSVC's ECX-thiscall.
  So a plain `zig c++` `u->GetSteamID()` would *not* exercise the ABI a real game uses. The harness
  therefore **reconstructs the MSVC thiscall dispatch explicitly** (inline asm: `ECX=this`, `call`,
  read EDX:EAX), and the shim's slot functions are `__attribute__((thiscall))`. This makes the test
  faithful to how an MSVC game calls the vtable.
- `CSteamID` is an 8-byte trivially-copyable value → returned in EDX:EAX under the MSVC i386 ABI
  (no sret). The shim returns `uint64_t`; the harness reads EDX:EAX. They agree.

## How to Run

```bash
( cd ../005b-bottle-to-host-tcp && ZIG=/path/to/zig bash build.sh )   # host bridge
ZIG=/path/to/zig bash build.sh    # -> steam_api.dll + harness.exe
bash run.sh                        # needs Steam signed in + GameLibSteam bottle
```

## Investigation Trail

1. Built the shim with a hand-laid vtable (`g_isteamuser_vtbl[8]`, slots 0/1/2 = GetHSteamUser/
   BLoggedOn/GetSteamID) and an object whose first word points at slot 0.
2. Wrote the harness to dispatch slot 2 via MSVC `__thiscall` (inline asm), matching a real game.
3. Ran `harness.exe` in the bottle (`CX_BOTTLE=GameLibSteam wine "C:\harness.exe"`). stdout and
   `C:\vtable_out.txt`:
   `VTABLE_GAME_PATH ISteamUser::GetSteamID (slot 2, MSVC __thiscall) = 76561197995867096`.
   The ECX-`this` + EDX:EAX-return round-trip worked first try — real SteamID delivered through a
   C++ virtual call into the replacement steam_api.dll.

## Results

**Verdict: VALIDATED.** A game-style C++ virtual `GetSteamID()` call, dispatched through our
replacement `steam_api.dll`'s MSVC-ABI vtable, returns the real signed-in SteamID from native Mac
Steam via the bridge. The vtable-layout + `__thiscall` + register-return ABI all round-trip. This
is the leg 005c explicitly deferred — the unmodified-game path is now proven at the mechanism level.

**What this does NOT yet prove (remaining productionization):**
- **Compiled-by-MSVC confirmation.** The harness *reconstructs* the MSVC thiscall dispatch (no MSVC
  toolchain here). It is faithful to the ABI, but final confidence wants a real MSVC-compiled game
  (which L4D2 validated). Register-return + ECX-this is proven; a genuine game binary is the last mile.
- **sret (large struct returns).** Methods returning structs >8 bytes by value use a hidden return
  pointer (first arg after `this`) — a different marshaling path, untested here.
- **Full vtable generation.** Only ISteamUser slots 0–2, one method marshaled. A real bridge
  generates every interface's full vtable from pinned SDK headers (the `gen_vtables.py` scope),
  plus callback dispatch (pack(4)→pack(8)).
- P2P multiplayer join remains the known-hard gap (unchanged from 004/005).

Evidence: `vtable_out.txt`, the run transcript above (Steam `steam_osx` signed in during the run).

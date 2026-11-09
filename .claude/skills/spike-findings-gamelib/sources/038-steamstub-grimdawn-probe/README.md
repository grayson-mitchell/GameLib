---
spike: 038
name: steamstub-grimdawn-probe
type: standard
validates: "Given Grim Dawn (219990, SteamStub .bind-wrapped) in its bridge bottle, when launched with a logging steamclient.dll registered in ActiveProcess\\SteamClientDll(64), then we see whether the stub loads it and what it requests"
verdict: PARTIAL
related: [035, 036, 037]
tags: [steam, macos, bridge, steamstub, drm, grim-dawn, steamclient, proton, boundary]
---

# Spike 038: SteamStub probe (Grim Dawn)

## What This Validates

Steamworks DRM ("SteamStub", the `.bind` PE section) differs from CEG (035–037). Does its launch
check go through the public Steam client surface, which a bridge-backed `steamclient.dll`
forwarding to the genuine native Mac client could answer (Proton's `lsteamclient` model)? Or
through something only a Windows client provides?

## How to Run

```bash
./setup.sh       # GameLibSpikeGD = APFS clone of GameLib's own GameLibSteamBridge-219990 (shim already placed)
./build.sh       # 037's logging probe for x86 + x64, plus 036's responder (now with DIPC_CLIENTDLL64)
WATCH=20 CXLOG=+process,+reg,+loaddll,+seh,+sync ./run.sh b1-x64          # baseline, as GameLib launches it
WATCH=20 VIA=responder ENV_FILE=client.env CXLOG=+process,+reg,+loaddll ./run.sh p1-x64
```

## Investigation Trail

1. **Real-world baseline** (`~/Library/Logs/GameLib/gamelib.log`, 22:14 and 22:15): GameLib
   launches `x64\grim dawn.exe` through the bridge, and it exits after 2 s both times. No shim
   `HELLO`. The install-time scan logged `steam_api64.dll@runtime-loaded`, but the trace shows
   it's a **static import of `Engine.dll`**: the scan checks only the exe's own imports
   (consistent with the existing "scan misses DLL importers" todo).
2. **b1 trace** (`evidence.txt`): the stub opens `HKCU\Software\Valve\Steam\ActiveProcess`
   (missing), then `HKLM\Software\Wow6432Node\Valve` (missing), then calls
   `ShellExecute("steam://run/219990//")`, i.e. "relaunch me through Steam". The bridge bottle has
   no `steam:` handler, so it's a no-op and the game exits.
3. **p1** (responder registers `ActiveProcess\SteamClientDll64` → the logging probe): the stub
   **loads our DLL** and calls `CreateInterface("SteamClient017")`, then `("SteamClient014")`.
   Both return NULL (by design of the probe); the game exits with code **53**.
4. **Stopped here.** The next probe step was handing the stub a logging fake `ISteamClient` to
   enumerate its follow-up calls. It was halted; any further step has to be the real thing,
   forwarding to the genuine client, not a stand-in that answers on its own (see Results).

## Results

**PARTIAL.** It differs from CEG in the way that matters:

- SteamStub's launch check uses the **public Steam client surface**: the registry slot
  `ActiveProcess\SteamClientDll(64)` → `CreateInterface("SteamClient017"/"014")`. Those are
  standard versioned Steamworks interfaces that the native Mac `steamclient.dylib` exports
  (`CreateInterface`, 004c), and that Proton's `lsteamclient` forwards on Linux.
- So a **bridge-backed `steamclient(64).dll`** that forwards `ISteamClient` (and whatever it hands out)
  to the genuine, signed-in Mac client, like the existing `steam_api` shim → helper path one layer
  lower, is a plausible route for SteamStub titles. The genuine client answers the ownership
  question, so nothing is faked.
- **Not established:** which `ISteamClient` methods and child interfaces the stub needs after
  `CreateInterface`, and whether the helper can serve them. That's the build question for a real
  forwarding `steamclient.dll` (vtable generation for `SteamClient017`, as 006 did for
  `ISteamUser`), and it should be answered by forwarding, not by a stand-in that answers on its
  own.
- **Bonus:** without any client, SteamStub's fallback is `steam://run/<appid>`, so the failure
  mode is a silent 2-second exit. GameLib could detect `.bind` up front (cheap: one PE section
  name) and tell the user, rather than "game stopped after 2s of play".

**Scratch state:** bottle `GameLibSpikeGD` (APFS clone). The product bottle
`GameLibSteamBridge-219990` was not modified.

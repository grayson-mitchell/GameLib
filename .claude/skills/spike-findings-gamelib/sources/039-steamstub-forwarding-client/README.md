---
spike: 039
name: steamstub-forwarding-client
type: standard
validates: "Given 038's SteamClientDll64 slot, when it names a steamclient64.dll whose CreateInterface hands back the game's own GameLib shim proxies, then Grim Dawn's SteamStub passes using answers that reach the native Mac client"
verdict: PARTIAL
related: [038, 006]
tags: [steam, macos, bridge, steamstub, grim-dawn, steamclient, shim]
---

# Spike 039: forwarding steamclient64.dll into the shim

## What This Validates

038 showed SteamStub loads `ActiveProcess\SteamClientDll64` and asks for `SteamClient017`, then
`SteamClient014`. The x64 GameLib shim already contains a `SteamClient017` vtable
(`g_steamclient017_instance`, from `meta/gen_vtables.ts`). Can a thin `steamclient64.dll` that
returns the shim's own interfaces get the stub through? A single module also keeps the helper's
single connection.

## How to Run

```bash
./build.sh                                            # steamclient_fwd.c -> GameLibSpikeGD Steam dir
cd ../038-steamstub-grimdawn-probe
WATCH=30 VIA=responder ENV_FILE=client.env CXLOG=+process,+loaddll ./run.sh f1-x64
cat "$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeGD/drive_c/steamclient039.log"
```

`steamclient_fwd.c` answers nothing itself. It loads `<exe dir>\steam_api64.dll` (the shim) and
returns `SteamInternal_CreateInterface(name)`, logging only the requested names.

## Results

**PARTIAL** (`evidence.txt`):

- The plumbing works. The stub loaded the forwarder, the forwarder loaded the shim, and
  `CreateInterface("SteamClient017")` returned the shim's real `SteamClient017` instance.
- The stub **still rejected it**. It went on to ask for `SteamClient014` (it got the null object),
  then exited with **code 51** (038 with NULLs: 53). So the different code means it got further.
- **The helper saw no `HELLO`.** Nothing the stub called reached the native client. That is
  why it fails: the shim's `SteamClient017` doesn't forward. Its methods are generated as
  `HELPER FALLBACK` / `STUB`. `CreateSteamPipe` and `ConnectToGlobalUser` return a constant `1`,
  `BReleaseSteamPipe` returns 0, and `GetISteam*` resolve only the shim's ~21 compiled versions
  (anything else gets the x64 null object, all zeros). These answers are made up locally, so the
  stub's check fails on them and it never asks anything a forwarded proxy could answer.

**Implication for the todo.** The forwarding DLL itself is trivial (this one is about 30 lines). The
real work is in the generator: `SteamClient017` (and 014, which the stub falls back to) must
**genuinely forward** to the helper's native `ISteamClient`, with real pipe/user handles served
helper-side, and `GetISteam*` must hand out forwarding proxies for whatever versions the stub
requests. Those versions are still unknown. Finding them means logging requested versions
inside the shim's `GetISteam*` (a diagnostic on the real path), which belongs in the product
build, not another stand-in probe.

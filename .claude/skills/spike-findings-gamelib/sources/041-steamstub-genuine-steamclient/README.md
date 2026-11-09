---
spike: 041
name: steamstub-genuine-steamclient
type: standard
validates: "Given Grim Dawn (219990, SteamStub 3.1) in a clone of its bridge bottle with only the native Mac Steam client running, when ActiveProcess\\SteamClientDll64 names the user's own genuine Windows steamclient64.dll (copied from their GameLibSteam bottle, nothing shipped) instead of GameLib's forwarder, then see (a) whether the stub's file check passes and (b) whether the game reaches its menu without a Windows Steam process"
verdict: INVALIDATED
related: [036, 037, 038, 039, 040]
tags: [steam, macos, bridge, steamstub, drm, grim-dawn, steamclient, boundary, oracle]
---

# Spike 041: genuine steamclient64.dll against Mac Steam only

## What This Validates

Spike 040 inferred, from static evidence only, that SteamStub's launch check rejects the forwarder
because the check is about the client DLL *file*. It also inferred that the genuine Windows
client would not help anyway, because it needs a Windows Steam to talk to. This spike tests both
inferences directly. Arm B points the stub at the user's own genuine `steamclient64.dll`, with only
Mac Steam running.

If the game reached its menu, "copy the user's own DLL at launch" would be a real option and the
todo would reopen. It didn't.

## Boundary note

The operator explicitly authorized this test on 2026-10-26, even though Phase 52's boundary
excludes a genuine Valve DLL. Everything ran in a **scratch clone**. The genuine DLL is the user's
own file, copied from their bottled Steam install into the clone, not shipped and not committed.
`steam.exe` was deliberately not copied, and `run.sh` refuses to start if any Windows Steam
process is running. The product bottle `GameLibSteamBridge-219990` and `GameLibSteam` were only
read. The game exe was not modified.

## How to Run

```bash
./setup.sh                                   # APFS clone -> GameLibSpike041; copies steamclient64/tier0_s64/vstdlib_s64 into C:\spike041\
ARM=forwarder WATCH=45 ./run.sh a1-forwarder # control: product forwarder, product-identical registry value
ARM=genuine   WATCH=45 ./run.sh b1-genuine   # test: SteamClientDll64 -> C:\spike041\steamclient64.dll
```

Requires the signed-in native Mac Steam client. `run.sh` uses GameLib's current helper
(`public/bin/arm64/darwin/steam-bridge-helper`), Wine `+process,+reg,+loaddll,+seh,+relay` with a
`RelayInclude` filter (MessageBox, CreateProcess/ShellExecute, file reads, IPC object opens,
registry reads), set only in the clone.

## Results (`evidence.txt`)

| | a1 forwarder (control) | b1 genuine client |
| --- | --- | --- |
| client DLL loaded | forwarder | genuine `steamclient64.dll` + `tier0_s64` + `vstdlib_s64` from `C:\spike041\` |
| stub file check | **fails**: `MessageBoxA("Application load error 3:0000065432", "Steam Error")` | **passes**: 0 MessageBox calls |
| shim `HELLO` / `FWD` | yes / `SteamClient017`, `014` | **none** |
| what the client looks for | (n/a) | `OpenEventA("Steam3Master_SharedMemLock")` → **0, not found** |
| then | error dialog stays up (alive at 45 s) | stub falls back to `steam://run/219990//` and exits about 0.7 s after the client loaded |
| Windows Steam started | no | no |
| `steam://run` reached Mac Steam | n/a | no (`console_log.txt` has no `ExecuteSteamURL`; its `Game process` lines are the helper's own PIDs) |

**(a) Confirmed: the check is about the file.** The same stub, registry slot and bottle reject
GameLib's forwarder and accept Valve's genuine DLL. That settles spike 040's inference with
observed evidence.

**(b) Confirmed: the genuine client cannot use Mac Steam.** Once loaded, the genuine Windows client
reaches for `Steam3Master_SharedMemLock`. That's the shared-memory IPC a Windows `steam.exe`
creates in the same Wine session. Mac Steam doesn't create it and doesn't speak that protocol, so
the client finds no Steam. The stub then takes the same no-client `steam://run` fallback spike 038
saw, and exits silently before the game's own code runs. Because the game code never runs, the
shim is never initialised and there's no `HELLO`.

## Why this closes the option

Getting past this point needs something to answer the Windows client's `Steam3Master` IPC. Only
two things could do that:

- a real Windows `steam.exe` in the bottle, which is bottled Steam, the path the project is
  removing ([[bottled-steam-is-narrow-fallback]]);
- a GameLib re-implementation of Steam's private client-to-`steam.exe` protocol, backed by the
  helper. That's a stand-in answering on its own, explicitly outside the boundary.

Combined with spike 040: GameLib's own forwarder fails the file check, and Valve's genuine client
passes it but then needs Windows Steam. There's no DLL that both passes the check and reaches the
native Mac client. **INVALIDATED.**

## Open question (not tested)

Under Proton on Linux, SteamStub titles run with Valve's `lsteamclient` in this slot, next to
Proton's own `steam.exe` helper. Spike 041 doesn't show *what* the file check accepts: a Valve
signature, or something else that `lsteamclient` also satisfies. If the check accepts any
Valve-signed client, a Proton-style Valve-built client would pass it. GameLib can't produce that
signature, so the verdict holds either way. The question only matters if Valve ever ships a
signed macOS-bridge client.

## Investigation Trail

1. **a0 (discarded).** `setreg.py` wrote the registry value with doubled backslashes. Wine
   tolerated it, but the control has to match the product byte for byte, so I fixed the escaping
   and kept a0's logs only as a harness-flow record.
2. **a1.** The control reproduced 52-19 exactly in the fresh clone: `HELLO`, `SteamClient017`/`014`,
   then `Application load error 3:0000065432`.
3. **b1.** The genuine client and its two Steam-directory imports loaded. Wine resolved
   `tier0_s64`/`vstdlib_s64` from the client's own directory, so no extra copies were needed. The
   check passed, then `Steam3Master_SharedMemLock` was not found, then the `steam://run` fallback
   and a silent exit.
4. **No arm C.** Answering `Steam3Master` from the helper would mean building the forbidden stand-in.

## Cleanup

The scratch bottle `GameLibSpike041` is left in place for re-runs. It's an APFS clone holding
copies of the user's Valve DLLs in `C:\spike041\`. Delete it with
`rm -rf "$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpike041"`.

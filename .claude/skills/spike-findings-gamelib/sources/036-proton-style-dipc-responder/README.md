---
spike: 036
name: proton-style-dipc-responder
type: standard
validates: "Given 035's handshake, when a Proton-style steam.exe stub (ActiveProcess pid, SharedMemLock event, DIPC responder) launches XComEW.exe in the bridge bottle, then the game gets past the CEG wait and reaches SteamAPI_Init (shim HELLO)"
verdict: PARTIAL
related: [035, 037]
tags: [steam, macos, bridge, ceg, drm, xcom, proton, dipc, oracle]
---

# Spike 036: Proton-style DIPC responder

## What This Validates

Given the CEG start handshake named in 035, when a Proton-`steam_helper`-style responder answers it
inside the bridge bottle, does XCOM: Enemy Within get past the 30 s wait and reach `SteamAPI_Init`
(shim `HELLO`)?

## Research

Spec: `ValveSoftware/Proton` → `steam_helper/steam.c` (`steam_drm_thread`, `set_active_process_pid`,
the `Steam3Master_SharedMemLock` / `Global\Valve_SteamIPC_Class` events, and `ValvePlatformMutex` /
`SteamPath`). See 035's Research section. The responder (`dipc_responder.c`) reproduces it minus
the lsteamclient/VR registry setup.

## How to Run

```bash
./build.sh                                      # dipc_responder.exe -> spike bottle (zig, x86 PE)
WATCH=60 ./run.sh r1-ack                        # game launched as the responder's child
EXTRA_ENV="DIPC_RELAUNCH=2" ./run.sh r4-relaunch  # play "Steam" and relaunch after each ACK
./swap_api.sh orig|shim                         # original steam_api.dll vs GameLib shim
ENV_FILE=<(./steamenv.sh; echo DIPC_VPM=0) ./run.sh r7-fullenv   # full Steam launch env
# Oracles (boot the bottled Windows Steam client in GameLibSteam):
STEAM_WAIT=90 WATCH=70 ./oracle.sh o1           # direct XComEW.exe launch while Steam is up
STEAM_DEBUG=+process,+sync,+reg GAME_CMD=applaunch ./oracle.sh o4
./envoracle.sh env2                             # dump the env Steam gives a launched game (PEB read)
STEAM_DEBUG=+process,+sync GAME_CMD=applaunch WATCH=300 ./oracle.sh o5   # operator clicks Enemy Within
```

## Investigation Trail

1. **r1-ack: the ACK is accepted.** The responder found `STEAM_START_ACK_EVENT_<pid>_7498500` in
   `\BaseNamedObjects\Session\1` (Proton's directory is right under CrossOver too), SetEvent, and
   released PRODUCE. The game **exited with code 0 three milliseconds later** instead of continuing.
2. **r2-dump: the mailbox.** `STEAM_DRM_IPC` (4 KB section) holds the request: `{u32 0xe8, u32 1}`,
   then the STEAMSTART path, then the ACK and TERM event names. `STEAM_DATA.<pid>` is 4 KB:
   `{u32 2, u32 0x1000}` followed by high-entropy bytes, created by the game.
3. **r3-trace: the wait was on the ACK event.** It returns signalled (0), then
   `LdrShutdownProcess`. Exiting after the ACK is the intended "Steam has taken over" behavior.
4. **r4-relaunch: playing Steam by relaunching doesn't work.** Every relaunched instance sends a
   fresh STEAMSTART request and exits after its ACK (3 instances, 3 requests).
5. **Mac client survey.** The native `steamclient.dylib` / `steam_osx` contain the install-time CEG
   machinery (`clientdrm.cpp`, `CClientDRMDownloadJob`, *"marked as CEG file but was not
   post-processed by CEG"*), but **no** `STEAMSTART` / `DIPC` / `STEAM_DRM_IPC` / `START_ACK` strings.
   There is no runtime start-request handler to forward to.
6. **o1 oracle** (direct launch while bottled Steam is up): with `HKLM\Software\Valve\Steam` present,
   the same code path reads `InstallPath` and runs `steam.exe -applaunch 200510` instead of DIPC.
   This is the CEG "relaunch me under Steam" routine. Missing key → DIPC; present key → `-applaunch`.
7. **Black-box diffs.** I briefly looked at the faulting function (an access violation at
   `0x010E6B1A` caused by a bad pointer is what routes into the DIPC fallback), then **stopped
   reverse-engineering CEG code** and switched to environment diffs:
   - e1: **original `steam_api.dll`** in the bridge bottle gives the same STEAMSTART path, so the
     shim is not the cause.
   - r5/r6/r7: Proton's `ValvePlatformMutex`, then the **complete env a genuine Steam launch carries**
     (captured by `envoracle.sh`; see `logs/steam-launch-env.txt`). Still DIPC → exit. The env is
     not the gate. (Correction: `ValvePlatformMutex` is *Steam's* exe path,
     `c:/program files (x86)/steam/steam.exe`. Proton sets it to its stub `steam.exe`'s own path,
     not the game's.)
8. **o5 oracle (human-in-the-loop, decisive).** Real flow: Steam → `XComGame.exe` →
   `XCOMLauncher.exe` → operator clicks Enemy Within →
   `XComEW.exe -FROMLAUNCHER -LANGUAGE=INT`. **That instance sends the same DIPC start request.**
   Steam answers in about 1 ms (opens ACK/TERM, SetEvent, releases PRODUCE, re-creates its
   semaphores; no network). The game **does not exit**: 6 ms later it loads
   `C:\Program Files (x86)\Steam\steamclient.dll` (the `HKCU\…\ActiveProcess\SteamClientDll`
   value), runs on to the main menu, and the operator confirmed it was still running.

## Results

**PARTIAL.** The Proton protocol is the right protocol, and our responder answers it correctly
(the ACK is found, set and accepted). It is **not sufficient on its own** in a bridge bottle:

- Under genuine Steam, the ACK is followed by the game loading the Windows `steamclient.dll`
  that `ActiveProcess\SteamClientDll` names, and continuing. In our bottle there is no such
  value or DLL, and the game takes the "Steam will relaunch me" branch and exits.
- This is exactly the slot Proton fills: `steamclient_init_registry` (lsteamclient) writes
  `ActiveProcess\SteamClientDll` → `lsteamclient.dll`, a Windows-side steamclient that forwards to
  the native client. **The missing piece for GameLib is a bridge-backed `steamclient.dll`**, not a
  smarter DIPC answer. Spike 037 tests that.
- STEAMSTART relaunch, env vars, the shim vs the original `steam_api.dll`, and
  `ValvePlatformMutex` are all ruled out as the gate.

**Tooling landmine found (affects 007/033 convention):** CrossOver's `bin/wineserver` **ignores
`CX_BOTTLE`**. `CX_BOTTLE=<b> wineserver -k` silently kills nothing. Use
`WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/<b>" wineserver -k`. A stale
bottled Steam from o1 survived its "cleanup" and swallowed o2/o3's `-applaunch` (and its Steam Cloud
"unable to sync" dialog reached the operator).

**Privacy:** `STEAMSTART` files carry the launching process's full environment (gitignored, never
committed). `steamenv.sh` reads the account name and SteamID at runtime from the Mac client's
`loginusers.vdf` and never writes them out. Committed env evidence has identity values redacted.

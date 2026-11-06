---
created: 2026-11-01
title: "D-09 follow-up: unlisted callback 1298 sits on the bridge join path in both directions"
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - .planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md
severity: minor
platform: macos
ready: human
---

## Trigger

58-34 (the 58-33 TCP re-gate) item 7: `CBQ unlisted iCallback=1298 action=drop` appears on the join path in both directions, in launch 1 between `INVITE sent ok=1` and the first role=game send, and in launch 2 between `CBDISP iCallback=333` and the first role=game send. Both joins and play still passed, so the drop did no visible harm. 1298 is Utils range + 18 (`k_iSteamNetworkingUtilsCallbacks` 1280 + 18) and has no struct name in any bundled SDK header.

## What to decide

Whether 1298 needs a layout and a relay row, or is safe to keep dropping. Identify the struct from the runtime (a trace of the real Steam client), do not guess a name.

## Step 1 evidence (quick 261106-qvp)

The helper and shim now log what the next live join gate needs to answer two questions from logs alone: does the game register a listener for 1298, and what is 1298's payload size. No relay row, struct layout or struct name was added.

1. Observability notes: registration is observable only for C++ CCallback via the shim's SteamAPI_RegisterCallback (`CBREG iCallback=<id> role=game path=register`); not observable under manual dispatch (`CBREG role=game path=manual-dispatch registration=unobservable` is logged instead), for RegisterCallResult (handle-keyed), or in DRM mode (genuine steam_api64.dll keeps the list; lsteamclient sees only BGetCallback).
2. Gate log reads, per launch segment (after the launch's last HELLO, `bridge helper [3205720]:` lines only):
   - Question 2: the `cub=` value from `CBQ +unlisted iCallback=1298 action=drop callresult=[01] cub=[0-9]+`. Record the number; the line appears once per process.
   - Question 1: the count of `CBREG +iCallback=1298 role=game path=register` lines (1 = the game registered a C++ listener).
   - The count of `CBREG +role=game path=manual-dispatch registration=unobservable` lines (1 = manual-dispatch mode; then a 0 for the register line means "unknown", never "no listener").
3. Static fallback for a manual-dispatch Mono title (Schedule I: Steamworks.NET 2024.8.0, 58-01-TITLES.md), a gate-runner step, not code. Steamworks.NET tags each callback struct with `CallbackIdentity(int)`, whose custom-attribute blob for 1298 is the bytes `08 01 00 12 05 00 00 00 00` (blob length 8, prolog 0x0001, int32 1298 = 0x512, zero named args). Count it in `<GameDir>/<Name>_Data/Managed/com.rlabrecque.steamworks.net.dll` with stdlib Python, path passed as an argument and run isolated:
   `python3 -I -c "import sys;print(open(sys.argv[1],'rb').read().count(bytes.fromhex('080100120500000000')))" <path>`
   - 0 = this Steamworks.NET build defines no struct for 1298, so no managed Callback for it can exist in the game.
   - 1 or more = a struct exists. Resolve its type name only with a metadata tool already installed (`command -v monodis ikdasm ilspycmd`; install nothing), then count that exact name in the other `Managed/*.dll` files (Assembly-CSharp, FishNet, FishySteamworks) as a TypeRef string. If no tool is present, record "struct present, name unresolved" and do not write a name.
   - This mirrors how D-08a established that Raft's assemblies referenced neither 504 nor 1221.
4. What still decides the todo: the cub number plus the listener answer go to the operator; a relay row and layout remain a later step and need the struct identified from the runtime, not guessed.

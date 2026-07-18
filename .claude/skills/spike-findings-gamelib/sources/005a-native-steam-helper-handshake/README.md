---
spike: 005a
name: native-steam-helper-handshake
type: standard
validates: "Given the running signed-in Mac Steam + on-disk libsteam_api.dylib, when a native helper (not launched by Steam) dlopens it and inits, then it returns the user's real SteamID + persona"
verdict: VALIDATED
related: [004b, 004c, 005b, 005c]
tags: [steam, macos, bridge, libsteam_api, steamclient, handshake, phase-22]
---

# Spike 005a: Native macOS Steam helper handshake

> Part of **Idea B — macOS native Steam bridge** (spike 004). This is the load-bearing proof
> for the out-of-process bridge: reproduce, on GameLib's target stack, the host-side half of
> L4D2-launcher's architecture (a native helper that proxies the live signed-in Mac Steam).
> Built and run live on this machine 2026-07-18.

## What This Validates

**Given** the running, signed-in native macOS Steam client and the on-disk `libsteam_api.dylib`,
**when** a native arm64 helper that is **not** launched by Steam `dlopen`s the dylib and calls
`SteamAPI_InitFlat`, **then** it connects to the live client and returns the user's **real**
SteamID64 + persona.

Scope: **host side only** (005a). The bottle side (a Windows PE reaching this helper over TCP,
and a replacement `steam_api.dll` shim) is 005b/005c — deferred (needs a mingw-w64 toolchain not
installed here).

## Research

No SDK headers used. The required flat-API symbols were located directly in the dylib via
`nm -gU` and declared by hand in `helper.c`:
`SteamAPI_InitFlat`, `SteamAPI_Shutdown`, `SteamAPI_RunCallbacks`, `SteamAPI_SteamUser_v023`,
`SteamAPI_SteamFriends_v018`, `SteamAPI_ISteamUser_GetSteamID`, `SteamAPI_ISteamUser_BLoggedOn`,
`SteamAPI_ISteamFriends_GetPersonaName`. (SDK vintage: `SteamUser_v023`/`SteamFriends_v018` ≈ SDK 1.58+.)

## How to Run

```bash
bash build.sh   # clang -arch arm64 -> ./helper   (no linking; dylib is dlopen'd)
# Requires Steam running + signed in:
bash run.sh     # writes steam_appid.txt=480, sets SteamAppId=480, runs ./helper
```

`480` = Spacewar, the Steamworks SDK test app. Reading the local user's identity does **not**
require owning that app; the appID only supplies an init context.

## Observability

`helper.c` writes an ISO-timestamped event log to stderr **and** `run.log` (categories:
START/APPID/DLOPEN/DLSYM/INIT/IFACE/READ/PASS·FAIL). Final result is emitted as a JSON object on
stdout; exit code 0 == real identity + logged on.

## Investigation Trail

1. `nm -gU` on the dylib → confirmed the versioned accessors (`SteamUser_v023`,
   `SteamFriends_v018`) and flat getters exist. Host is arm64; dylib is universal (arm64 slice).
2. Wrote `helper.c` to `dlopen` the dylib by absolute path and `dlsym` 8 symbols — no compile-time
   dependency on Valve libs or headers.
3. **First run (Steam signed in, appID=480):** PASS.
   ```
   [S_API] SteamAPI_Init(): Loaded '.../steamclient.dylib' OK.
   SteamInternal_SetMinidumpSteamID:  Caching Steam ID:  76561197995867096
   INIT   SteamAPI_InitFlat returned 0, errmsg=""
   IFACE  ISteamUser=0xb4100c6a0 ISteamFriends=0x102b4eaf0
   READ   BLoggedOn=1 SteamID64=76561197995867096 persona="Grayson"
   ```
   `{ "ok": true, "steamID64": "76561197995867096", "persona": "Grayson", "realIdentity": true }`
   The helper pulled in `steamclient.dylib` (the native client lib from 004c) and reached the
   live client over Steam's IPC — real 17-digit individual SteamID64 + real persona.
4. **Depth probe (no appID set):** `InitFlat` returns `1`, errmsg *"No appID found. …put the file
   steam_appid.txt …"*; both interface accessors log `[S_API FAIL] Tried to access … before
   SteamAPI_Init succeeded` and return NULL. Characterizes the one hard prerequisite: the caller
   must supply an app context.

## Results

**Verdict: VALIDATED.** The host-side half of the out-of-process bridge works on GameLib's exact
target stack — a native, non-Steam-launched helper reads the **real** signed-in identity from the
running Mac Steam client by `dlopen`ing the on-disk `libsteam_api.dylib`. This is no longer
"L4D2 says it works"; it's reproduced here with the user's own account (`persona="Grayson"`).

**New requirement for the build (→ MANIFEST Idea B):** the helper/shim MUST supply the game's
real AppID (`steam_appid.txt` in the working dir or the `SteamAppId` env var) before init —
without it, init fails with "No appID found" and every interface accessor returns NULL. For a
real bottled game this is the game's own appID; `480` suffices for identity-only handshakes.

**Surprises / notes:**
- The console line `Caching Steam ID … [API loaded no]` appears *before* our init completes, yet
  identity still reads correctly after `InitFlat` returns 0 — the client had the session cached.
- No code signing / entitlements were needed for the helper to load the dylib and connect.
- `SteamAPI_InitFlat` here uses the modern enum convention (`0` = OK), not a bool.

**What 005a does NOT prove (→ 005b/005c):** that a process *inside a CrossOver/GameLib bottle*
can reach this helper over TCP (005b), and that a replacement PE32 `steam_api.dll` shim can
marshal a game's Steamworks calls to it (005c). Both are blocked on a `mingw-w64` toolchain not
installed on this machine; architecturally inherited-plausible from L4D2 but unproven on our stack.

Evidence: `helper.c`, `run.log` (captured 2026-07-18), and the run transcript above. Steam
`steam_osx` pid confirmed running + signed in during the PASS run.

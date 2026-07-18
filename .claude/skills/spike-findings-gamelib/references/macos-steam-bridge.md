# macOS native Steam bridge (out-of-process `steam_api` proxy)

Blueprint for running bottled Windows Steam games against ONE native macOS Steam client
(Proton-style), instead of bottling a full Windows Steam client per CrossOver bottle. This is
Phase 22's preferred long-term successor. **Feasibility is PROVEN end-to-end on GameLib's stack,
up to and including a real commercial game** (spikes 005–008) — what remains is productionization
(a full shim generator), not research. The bridge is a **compatibility layer, not a DRM gate**
(008): its job is to make Steamworks calls succeed, not to authorize launches.

## Requirements (non-negotiable)

- **Bridge at the `steam_api` flat-API layer, OUT-OF-PROCESS.** A PE32 `steam_api.dll` shim in
  the bottle marshals Steamworks calls over **TCP (localhost)** to a native Mach-O helper that
  loads the real `libsteam_api.dylib`. Do NOT pursue the Linux-style in-process `lsteamclient`
  winelib thunk — it is blocked on macOS (no build toolchain; Rosetta/protobuf interconnect) and
  is Valve/CodeWeavers-scale. *(004a/004b)*
- **Proxy the running, signed-in native Mac Steam — never replicate auth.** `SteamAPI_Init`
  succeeds because it's the genuine client; DRM is genuinely satisfied. The helper hardcodes
  nothing. *(004b/004c/005a)*
- **The helper/shim MUST supply the game's real AppID before init.** No `steam_appid.txt` /
  `SteamAppId` → `SteamAPI_InitFlat` returns "No appID found" and every interface accessor is
  NULL. For a bottled game use its own AppID; `480` (Spacewar) suffices for identity-only. *(005a)*
- **Generate the C++ vtables from a pinned SDK version** for unmodified games. The mechanism is
  PROVEN (006): an MSVC-ABI vtable (vptr→slots, `this` in ECX via `__thiscall`, 8-byte return in
  EDX:EAX) in a mingw/zig-built shim serves a game-style virtual `GetSteamID()` and round-trips the
  real ID. mingw/clang windows-gnu C++ uses the *Itanium* ABI, NOT MSVC — so generated stubs must
  be explicitly `__thiscall` to match real (MSVC-compiled) games. (See What to Avoid.)
- **A drop-in shim must export EVERY symbol the game imports** — a game won't even load if one is
  missing. Enumerate per-game with `objdump --private-headers <exe> | grep steam_api` and export
  exactly that set (identity marshaled, rest stubbed). Real games proven: Avernum 4 (2 imports),
  Hoard (7). *(007/008)*
- **Loopback-only bind** on the host bridge; never a routable interface.

## How to Build It

**Native surface (already on every user's machine — verify with `nm -gU`):**
- `~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib`
  (universal, arm64; exports `CreateInterface`) — the deep client lib.
- `.../Steam Helper.app/Contents/MacOS/libsteam_api.dylib` — flat API; also ships in installed
  games. IPC transport is a Mach service (`ipcserver` / `com.valvesoftware.steam.ipctool`).

**Host helper (native arm64, clang):** `dlopen` the on-disk `libsteam_api.dylib`, `dlsym` only the
flat symbols you need (no SDK headers). Working set (SDK ≈1.58, verify per machine):
`SteamAPI_InitFlat`, `SteamAPI_RunCallbacks`, `SteamAPI_Shutdown`, `SteamAPI_SteamUser_v023`,
`SteamAPI_SteamFriends_v018`, `SteamAPI_ISteamUser_GetSteamID`, `SteamAPI_ISteamUser_BLoggedOn`,
`SteamAPI_ISteamFriends_GetPersonaName`. Init once at startup; keep the interface pointers; serve
requests over `127.0.0.1:54550`. See `sources/005b-bottle-to-host-tcp/bridge_server.c`.

**Bottle shim (`steam_api.dll`, PE32 i386):** implement the flat exports; on each call, marshal to
the host helper over TCP and return the result. Force exact undecorated export names with a `.def`
file (S_API is `__cdecl` on i386). See `sources/005c-min-steam_api-shim/{steam_api_shim.c,steam_api.def}`.

**Toolchain:** `brew install` does NOT work in this env (dry-run only). Build PEs with
**`zig cc -target x86-windows-gnu`** (self-contained mingw sysroot; download the `aarch64-macos`
tarball from `ziglang.org/download/index.json`). Alt: `i686-w64-mingw32-gcc … -lws2_32` if present.

**Run a PE in the GameLib bottle:**
`CX_BOTTLE=GameLibSteam /Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine "C:\prog.exe"`.
Wine shares the host network namespace, so `127.0.0.1` in the bottle IS the host loopback (proven,
005b). Have PEs also write results to `C:\*.txt` (host: `<bottle>/drive_c/*.txt`) in case stdout detaches.

**Proven results:**
- 005a+b+c — a game-like harness in the real GameLibSteam bottle loaded a drop-in `steam_api.dll`,
  called `SteamAPI_Init()`→`GetSteamID()` (flat), and got the real signed-in SteamID64 back through
  shim → TCP → host → `libsteam_api.dylib` → live Mac Steam. No Windows Steam client in the bottle.
- 006 — the same, but via a real **C++ vtable** virtual call (MSVC `__thiscall`), the unmodified-game path.
- 007 — a **real commercial game** (Avernum 4) ran on the bridge with our drop-in `steam_api.dll`.
- 008 — the bridge drives `RestartAppIfNecessary`/`Init` gate returns correctly (but games often ignore them; see below).

**Tooling hygiene (007):** `cxstart` detaches and **wedges the bottle's `wineserver`** (later `wine`
output silently vanishes). Use `bin/wine` and run `wineserver -k` between runs.

## What to Avoid

- **Don't build a macOS `lsteamclient` / in-process winelib thunk.** Blocked and Valve-scale (004a).
- **Don't ship only the flat-export shim and expect unmodified games to work.** A real game calls
  `SteamUser()->GetSteamID()` through the **C++ vtable**, not the flat `SteamAPI_ISteamUser_*`
  export. Generate the vtable layout + `__thiscall`/`ret N`/sret marshaling — L4D2-launcher's
  `gen_vtables.py` territory. 005c proved the flat path; 006 proved the vtable mechanism; the
  generator that does it for *every* interface is the first real build task.
- **Don't rely on the bridge to gate/enforce launches.** `steam_api.dll` return values
  (`RestartAppIfNecessary`, `Init`) are **advisory** — Avernum 4 and Hoard both call them and
  ignore the result (008). Real launch-enforcement for protected titles is **Steam CEG** (Custom
  Executable Generation) / DRM wrappers *below* the flat API, which a `steam_api.dll` shim cannot
  exercise. Treat CEG/Denuvo titles as a separate, out-of-scope workstream.
- **Don't return sret the wrong way.** 006 proved 8-byte returns (EDX:EAX); methods returning
  structs >8 bytes by value use a hidden return pointer (first arg after `this`) — untested, must
  be handled in the generator.
- **Don't hardcode SDK interface versions loosely.** `SteamUser_v023`/`SteamFriends_v018` are
  version-pinned; drift breaks the ABI. Also repack pack(4)→pack(8) for callbacks.
- **Don't assume multiplayer works.** P2P **join** is the known-hard gap (needs
  `InitRelayNetworkAccess()` + proactive `AcceptP2PSessionWithUser`; only partially fixed upstream).
  Single-player, auth, persona, listen-server hosting, and server browsing are proven.
- **Don't connect-per-call in production** (the spikes do, for simplicity) — use a persistent channel.

## Constraints

- Host helper needs the **live, signed-in** Mac Steam client running; no code signing/entitlements
  needed to load the dylib.
- CrossOver runtime ships **no** winelib build toolchain (`winegcc`/`winebuild`).
- Prior art: [samdotson61/L4D2-launcher](https://github.com/samdotson61/L4D2-launcher) (working
  shallow bridge), [natbro/kaon](https://github.com/natbro/kaon) (deep lsteamclient, stuck).
- Relationship to Phase 22: if productionized, likely supersedes much of the multi-bottle
  machinery — but Phase 22 (game families) remains the ship-now answer.

## Origin

Synthesized from spikes: 004a, 004b, 004c, 005a, 005b, 005c, 006, 007, 008.
Source files: `sources/004a-wine-mach-o-thunk/`, `sources/004b-community-lsteamclient-survey/`,
`sources/004c-native-mac-steam-ipc-surface/`, `sources/005a-native-steam-helper-handshake/`,
`sources/005b-bottle-to-host-tcp/`, `sources/005c-min-steam_api-shim/`,
`sources/006-cpp-vtable-abi/`, `sources/007-real-game-avernum/`, `sources/008-gating-game-hoard/`.
Seed: `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`.
Tracked follow-up: `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md`.

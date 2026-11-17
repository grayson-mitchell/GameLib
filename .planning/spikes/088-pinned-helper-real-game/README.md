---
spike: 088
name: pinned-helper-real-game
type: standard
validates: "Given the real macOS bridge helper rebuilt to load spike 089's CDN pin instead of the Steam client copy, when a bridged (shim-mode) game is launched from GameLib against the live signed-in Mac Steam, then the shim attaches, the game's SteamAPI_Init succeeds, stats/achievement callbacks reach the game and the Steam overlay opens in-game"
verdict: VALIDATED
related: [087, 089, 062, 005a]
tags: [steam, macos, bridge, libsteam_api, pinning, overlay, callbacks, live]
---

# Spike 088: The real bridge helper on a pinned libsteam_api.dylib, with a real game

## What This Validates

087 proved a standalone harness works against the live client on a pinned dylib. It left the overlay
and in-game callbacks to this spike: the **real** helper (`native/steam-bridge/helper/bridge_helper.c`),
spawned by dev GameLib for a real bridged game, with the dylib from 089's CDN fetch.

Origin: todo `2026-11-13-pin-bridge-libsteam-api-dylib`.

## How to Run

```bash
./build.sh            # fetches the pin via ../089-.../fetch-pin.sh pin, builds steam-bridge-helper-pinned
./swap.sh             # copies it over public/bin/arm64/darwin/steam-bridge-helper (backup: helper-original.bak)
# pnpm tauri:dev running, Mac Steam signed in; launch a SHIM-mode bridged game from GameLib, Shift+Tab in-game
./swap.sh restore     # put the original helper back
```

`bridge_helper_pinned.c` is gitignored. It is `bridge_helper.c` (as of `73a66d442`) plus two edits:

```c
/* in resolve_dylib_path(), before the Steam-tree lookup */
/* SPIKE 088: pinned Valve-signed dylib (spike 089), never the Steam client copy. */
snprintf(out, outSize, "%s", "<abs>/.planning/spikes/088-pinned-helper-real-game/pin/libsteam_api.dylib");
return;

/* after dlopen */
{ char m[1200]; snprintf(m, sizeof m, "SPIKE-088 pinned dylib=%s loaded=%d", dylibPath, g_dylib_handle != NULL); logts("PIN", m); }
```

Build flags are the ones `meta/buildSteamBridgeShims.ts` `buildHelperCompileArgv()` uses (arm64, `-O2
-Werror=uninitialized`). The binary is ad hoc, linker-signed and unhardened, same as the shipped helper.

## What to Expect

In `~/Library/Logs/GameLib/gamelib.log`, under `bridge helper [<appId>]`: a `PIN … loaded=1` line,
`INIT accessor SteamUser=v023` (the pin's version, not the client's v024), `manual dispatch ready`,
`READY init=ok`, then `HELLO shim attached` and `GINIT … ok=1` once the game starts.

## Investigation Trail

1. **Grim Dawn (219990) was the wrong probe.** It launched in steamclient-layer DRM mode
   (`launching appId 219990 in steamclient-layer DRM mode`): the bottled `steam.exe` + lsteamclient
   serve the game and the macOS helper is never spawned. Its overlay worked (`overlay attach: attached
   gameoverlayui … after 9019ms`), but that says nothing about the pin. **DRM-mode titles do not
   exercise the helper**, so pick a shim-mode game (one with past `bridge helper [<appId>]` lines).
2. **Dead Age 2 (951430) is mac-native with launch-without-Steam**: no bridge involvement. Its overlay
   not appearing is expected on that path and is not a pin finding.
3. **ELEX (411300, shim mode), 2026-11-17 21:43, live, operator at the machine:**
   - `PIN SPIKE-088 pinned dylib=…/pin/libsteam_api.dylib loaded=1`
   - `[S_API] SteamAPI_Init(): Loaded '…/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib' OK`:
     the pinned `steam_api` binds the current client's `steamclient.dylib`, as 087 saw.
   - Accessors resolved on the pin's SDK surface: SteamUser **v023**, Friends v018, Utils v011,
     Apps v009, UserStats v013, Matchmaking v009, Networking v006, **MatchmakingServers v003**,
     NetworkingSockets v013, NetworkingUtils v004, NetworkingMessages v002. No missing-export or
     FATAL lines.
   - `INIT manual dispatch ready`, `INIT SteamAPI ready (single InitFlat call, real appid=411300)`,
     `READY init=ok`.
   - Game side: `HELLO shim attached`, `GINIT fn=SteamAPI_Init ret=1 ok=1 session=1`: the strict
     bridge-verified criterion (HELLO + clean game Steam init).
   - Callbacks: 1101 (UserStatsReceived) `src=callback result=1` queued and `CBDISP iCallback=1101
     targets=1`; the game then read `GetStat`, `GetNumAchievements`, `GetAchievementName`,
     `GetAchievement`. 1222/1281 dispatched as usual.
   - Overlay: `overlay attach: attached gameoverlayui … after 2006ms`; **Shift+Tab opened the
     overlay in-game** (operator). The helper saw `iCallback=331` (GameOverlayActivated) and
     dropped it as unlisted. That is by design (`bridge_helper.c` 60-15: 331 is turned into a Darwin
     notification, not forwarded), not a pin regression.
   - Helper exited by SIGTERM at game quit, as normal.
4. `089/fetch-pin.sh`: `codesign -dv … | grep -q` exited early under `set -o pipefail` (SIGPIPE on
   codesign), failing the team check on a good dylib. It is now `grep … >/dev/null`.

## Results

**VALIDATED.** The real bridge helper, loading 089's Valve-signed CDN pin (the Oct 21 pre-v024 client
build) instead of the Steam client's copy, runs a real shim-mode game end to end against the
Nov 13+ live client: helper init, shim attach, the game's own `SteamAPI_Init`, stats and achievement
callbacks, and the in-game Steam overlay. Nothing in the helper's behaviour differed from the client
copy except the accessor versions, which 261113-n39's runtime probe already handles.

Signal for the build (adds to 087's and 089's):

- **Build it as 089 recommends.** A pin record in code, Rust-side fetch and verify, a local cache,
  then snapshot, then CDN, with the client copy as a logged `UNPINNED` last resort. `resolve_dylib_path()` should take
  the resolved path from the spawner (an argv flag or env set by `helperProcess.ts`) rather than
  hard-code it. The helper then keeps the Steam-tree lookup only as the fallback.
- **The pin and the generated dispatch move together.** This run used a v023 pin with MMS v003, which
  the dispatch covers. A pin bump must regenerate `bridge_dispatch.h`.
- **Coverage in this spike is one shim-mode title (ELEX).** DRM-mode titles never load
  the helper, so pinning cannot affect them. A UAT for the build should repeat this on a second shim
  title (Avernum 6 or XCOM: EU) and an identity-only (480) fallback launch.

---
created: 2026-10-23
title: "Bridge-backed steamclient(64).dll that forwards ISteamClient to the native Mac client, so SteamStub (.bind) titles pass their launch check"
source: spike 038 (Grim Dawn 219990); spikes 035–037 (CEG contrast)
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/generated/steam_api_shim.c
  - meta/gen_vtables.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bottle.ts
severity: major
platform: macos
ready: live-gate
---

**Problem.** Games wrapped with Steamworks DRM ("SteamStub", a `.bind` PE section in the exe)
cannot run through the bridge today. In a bridge bottle the stub finds no Steam client, falls back
to `ShellExecute("steam://run/<appid>//")` (no handler in the bottle) and exits silently after
about 2 s. Grim Dawn (219990) is the reproducer: both GameLib launches on 2026-10-23 (22:14:22,
22:15:09) did this.

**What spike 038 established** (`.planning/spikes/038-steamstub-grimdawn-probe/`):

- The stub's check is on the **public client surface**: it reads
  `HKCU\Software\Valve\Steam\ActiveProcess\SteamClientDll64` (`SteamClientDll` for x86), loads that
  DLL, and calls `CreateInterface("SteamClient017")`, then `("SteamClient014")`. With a registered
  probe DLL returning NULL, it loaded the DLL, made those two calls and exited with code 53.
- `ISteamClient` is a standard versioned Steamworks interface. The native Mac `steamclient.dylib`
  exports `CreateInterface` (spike 004c), and Proton's `lsteamclient` forwards exactly this
  surface on Linux. A forwarding client means the **genuine signed-in Mac client** answers the
  ownership question. This is interop, the same as the `steam_api` shim → helper path one layer
  lower.
- **Not yet known:** which `ISteamClient017` methods and child interfaces the stub calls after
  `CreateInterface`. Find out by forwarding to the real client and logging what passes through,
  **not** by a stand-in that answers on its own. Every answer must come from the native client.

**Contrast with CEG (do not merge the two):** CEG (XCOM 200510, spikes 035–037) is serviced by a
Windows-Steam-only DIPC handler that the Mac client lacks. It stays `drm-wrapped` → bottled Steam.
SteamStub is in scope for the bridge.

**Shape of the work.**

1. **`steamclient.dll` / `steamclient64.dll` (PE, zig-built like the shims)** exporting
   `CreateInterface` (plus the `Steam_*` exports as stubs; the real DLL has 41, list in
   `spikes/038-.../exports64.txt`). `CreateInterface("SteamClient017"|"014")` returns an MSVC-ABI
   vtable whose methods marshal over the existing helper channel to the native client's own
   `ISteamClient`. Generate vtables from the pinned SDK the way spike 006 / `gen_vtables` did for
   `ISteamUser`. Child interfaces handed out by `GetISteam*` reuse the shim's existing per-version
   proxies where they already exist.
2. **Helper side:** obtain the native `ISteamClient` (`CreateInterface` on `steamclient.dylib`, or
   via `libsteam_api`) and serve the forwarded calls. Keep the helper's existing identity, no
   new auth.
3. **Bottle setup at launch:** write `ActiveProcess\SteamClientDll`/`SteamClientDll64`/`Universe`
   (and a live `pid`) in the per-game bridge bottle, and place the DLLs. Do **not** create
   `HKLM\Software\Valve\Steam`: in spike 036/o1 its presence diverted a game into
   `steam.exe -applaunch`. The proven setup code is `spikes/036-.../dipc_responder.c`
   (`DIPC_CLIENTDLL`/`DIPC_CLIENTDLL64`).
4. **Detection:** flag `.bind` at install/scan time (one PE section name) so a SteamStub title is
   known before launch, and until this lands, show a "Steam DRM wrapper not yet supported through
   the bridge" notice instead of "game stopped after 2s of play".

**Dependency.** For Grim Dawn specifically, once SteamStub passes, `Engine.dll` next hits the five
missing modern-SDK exports in
`2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`.
Both are needed for it to run.

**Done when:** Grim Dawn (219990) launches from GameLib through its per-game bridge bottle, gets
past SteamStub (no `steam://run` in a `--cx-log` trace), reaches its main menu, and Mac Steam
shows it In-Game. No Windows Steam client is in the bottle and the exe is unmodified.

**Update from spike 039 (2026-10-23).** A thin `steamclient64.dll` whose `CreateInterface` returns
the game's own shim interfaces works as plumbing: the stub took the shim's `SteamClient017`. It
still fell back to `SteamClient014` and exited 51, and the helper saw no `HELLO`. The shim's
generated `SteamClient017` methods are local `HELPER FALLBACK`/`STUB` constants
(`CreateSteamPipe` → 1, `GetISteam*` → only compiled versions, else the null object), so nothing
reached the native client. Step 1 therefore shrinks to the forwarder (spike 039's ~30 lines). The
weight moves to `meta/gen_vtables.ts`: make `SteamClient017`/`014` genuinely forward (pipe/user
handles served helper-side), log requested `GetISteam*` versions on the real path, and add
forwarding proxies for whatever the stub asks for.

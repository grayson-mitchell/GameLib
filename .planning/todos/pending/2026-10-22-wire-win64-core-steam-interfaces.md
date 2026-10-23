---
created: 2026-10-22
title: "Win64 bridge shim stubs ELEX's core interfaces — the game reports \"not subscribed\" and never reaches its menu"
source: phase 51-19 live gate item 6 (ELEX 411300)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - meta/sdk/isteamuser019.manifest.json
  - meta/sdk/isteamapps008.manifest.json
  - meta/sdk/isteamutils008.manifest.json
  - meta/sdk/isteamclient017.manifest.json
  - meta/sdk/wire-policy.json
  - meta/gen_vtables.ts
severity: major
platform: macos
ready: live-gate
---

ELEX (411300) installs into its per-game bridge bottle, and its Win64 shim (`steam_api64.dll`,
SHIM64 841728 bytes) loads and attaches (`HELLO shim attached appid=411300`). The helper
initialises with the real appid. But ELEX immediately shows "Your account is not subscribed to
this application [AppID: 411300]", even though the account owns it.

Cause: plan 51-15 shipped `SHIM64_SERVED_INTERFACE_VERSIONS` with every core x64 interface as
`stub`: `SteamClient017`, `SteamUser019`, `SteamFriends015`, `SteamUtils008`,
`STEAMAPPS_INTERFACE_VERSION008`. Only `STEAMUSERSTATS_INTERFACE_VERSION011` is `wire`. The comment
records why: no macOS helper-dylib accessor for these version strings had been measured against a
real Mac Steam client (D-09: never invented). ELEX's ownership check (ISteamApps
BIsSubscribed/BIsSubscribedApp, or ISteamUser) therefore gets a stub default and fails.

D-51-13's "GO" for Win64 is real at the load/attach level, but not at the playable level.

Fix direction (gap closure):
1. Measure the Mac Steam client's accessors for `SteamUser019`, `STEAMAPPS_INTERFACE_VERSION008`,
   `SteamUtils008` and `SteamClient017` with a live probe, as the x86 versions were.
2. Move those to `wire` in `SHIM64_SERVED_INTERFACE_VERSIONS` and `wire-policy.json`, at least
   the ownership/identity methods (BIsSubscribed*, GetSteamID, BLoggedOn, GetAppID).
3. Re-run 51-UAT item 6 against ELEX.

Until then, 64-bit titles that check ownership at boot should not be advertised as "Known to work
with the bridge".

## Re-gate 2026-10-23 (plan 51-27, 51-UAT item 15: issue)

The wiring from plan 51-26 is live-verified: placed steam_api64.dll is 848896 bytes == SHIM64, the stubbed-interface notice no longer lists SteamUser, SteamUtils, SteamApps or SteamFriends, and the "not subscribed" error is gone. ELEX itself still hangs on its loading screen and never reaches the main menu; the operator rates it does-not-run and 411300 is now knownBad. Left pending because closure was tied to ELEX reaching its menu; the remaining question is whether another title exercises the Win64 core interfaces to a menu (51-29 sample installs), or whether to close this as wiring-done.

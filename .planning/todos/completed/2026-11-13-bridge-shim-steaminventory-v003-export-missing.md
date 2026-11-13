---
created: 2026-11-13T00:00:00.000Z
title: 'Bridge shim lacks SteamAPI_SteamInventory_v003 accessor export (Core Keeper crashes at Steam init)'
area: steam
severity: major
platform: macos
ready: code
source: '74-UAT item 16 step 2 (2026-11-13): Player.log EntryPointNotFoundException SteamAPI_SteamInventory_v003 / Platform init Steam failed; pre-existing, shim exports byte-identical before/after n39'
files:
  - native/steam-bridge
---

Core Keeper (1621690) crashes about 7 s after start because the bridge shim does not export the SteamAPI_SteamInventory_v003 accessor. Not a Phase 74 defect. Add the accessor export and re-verify against the strict bridge criterion.

## Resolution

Fixed 2026-11-13. Root cause: the shim exported these accessors only under other spellings
(version-string `SteamAPI_STEAMINVENTORY_INTERFACE_V003`, `SteamMatchMakingServers` with a capital M,
`SteamMatchGameSearch`). Facepunch.Steamworks P/Invokes the SDK spelling. Added
`flatAccessorAliases` (primary names kept): quick 261113-spw (`11b5cf61d`: Inventory_v003,
Video_v007, HTMLSurface_v005) and fast follow-on `b8e5cb85e` (MatchmakingServers_v002, Video_v002,
GameSearch_v001). The follow-on names came from diffing the game's `Facepunch.Steamworks.Win64.dll`
import table against the shim exports. Only game-server accessors and lazily-bound struct helpers
remain unexported.

Live verified 2026-11-13 21:33 NZDT: `HELLO shim attached appid=1621690`. Player.log shows
`Steam API initialized`, `steam initialized successfully` and `Steam stats received`, with no
EntryPointNotFoundException. The game was still running at 21:34:47, past the old ~7 s crash.

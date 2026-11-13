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

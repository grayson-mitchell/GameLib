---
created: 2026-10-16
title: "Widen the native Steam bridge so most Windows-only games leave the shared bottled-Steam bottle"
source: operator design question 2026-10-16 (CrossOver tweaking under one shared bottle)
area: steam
files:
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
  - src/backend/storeManagers/steam/games.ts
severity: medium
platform: macos
ready: human
---

Phase 24 shipped, but `isBridgeEligible()` (`steam/games.ts:1963`) requires allowlist membership, and
`bridge/bridge-allowlist.json` holds two games: Avernum 5 (206040) and Avernum 6 (206060). Every other
bottle-eligible macOS game still falls through to the Phase 17 path: the Windows Steam client inside
the one shared `GameLibSteam` bottle. Any per-bottle tweak (Windows version, DLL overrides, runtimes,
D3DMetal vs DXVK, msync/esync, CrossOver version) applies to all of those games at once, and per-game
bottles there would each need their own Steam client and login.

The bridge proxies only ISteamUser + ISteamFriends (`ROADMAP.md:73`, `ROADMAP.md:160`). Games that need
Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking are out of scope until those proxies exist.

Needs scoping as a new phase (hence `ready: human`): which interfaces to add first, how candidate
games are found (the SPEC deferred automatic import-coverage / DRM detection, `24-SPEC.md:71`), and
how the allowlist grows (D-01 named the Phase 19 CI-index pattern as the upgrade path).

Until this lands, a stopgap for the shared `GameLibSteam` bottle is per-executable Wine overrides
(`HKCU\Software\Wine\AppDefaults\<game>.exe`: DLL overrides, Windows version), which need no
second bottle. Pairs with [[2026-10-16-bridge-games-should-each-get-their-own-bottle]].

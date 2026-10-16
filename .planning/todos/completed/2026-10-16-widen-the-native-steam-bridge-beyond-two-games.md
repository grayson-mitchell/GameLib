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

## Closed

Closed 2026-10-17 by `/gsd-phase add` — scoped as **Phase 51** (`ROADMAP.md` § Phase 51,
`.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/`).

The three scoping questions this todo parked on `ready: human` were answerable from the Phase 24
record, so they were decided at filing and are locked on the roadmap entry:

- **Which interfaces first:** the Hoard set, in the order D-UAT-24-09 measured the failure —
  Utils, Apps, UserStats; then RemoteStorage; then Matchmaking and Networking as stubs. Plus the
  bare legacy accessors Hoard imports and the modern `SteamInternal_*` family, which research must
  census (no spike covers it).
- **How candidate games are found:** by the import scan `shimGenerate.ts` already runs at
  placement and throws away. Persist its verdict per game (D-17 precedent), let any bottle-eligible
  game try a per-game bridge bottle, and surface the missing symbols in the D-05 dialog on a miss.
- **How the allowlist grows:** it does not grow by hand. Bundled JSON stays as a seed and a
  known-bad list; the persisted scan verdict is the growth mechanism. D-01's remote-index path is
  declined because there is nothing to index without owning the games.

**Correction to this todo's premise:** "per-game bottles there would each need their own Steam
client and login" was true of the Phase 17 path but per-game *bridge* bottles need no Steam client
at all, and they shipped the same day this was filed (quick `261016-u1w`). The bottle half is done;
only the interface and eligibility halves remain, and those are Phase 51.

**Two hazards found while scoping, recorded on the entry as open research questions, not
decided:** `importScan.ts` only matches the `steam_api.dll` heading, so a 64-bit title scans as
importing nothing and placement passes vacuously; and the PE32-only shim may make "most" games
unreachable without a 64-bit target. The stopgap in the paragraph above (per-executable
`AppDefaults` overrides in the shared bottle) stands until Phase 51 lands.

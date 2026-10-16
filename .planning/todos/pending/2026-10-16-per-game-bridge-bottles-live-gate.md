---
created: 2026-10-16
title: "Live-gate per-game bridge bottles (261016-u1w) on real Apple Silicon"
source: quick task 261016-u1w SUMMARY live-gate list
area: steam
files:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
severity: medium
platform: macos
ready: live-gate
---

261016-u1w is desk-verified only (8 suites / 697 tests, codecheck, lint, deadcode). Nothing has run
against real CrossOver. Five items, all from the quick task's SUMMARY:

1. A fresh Avernum 5 (206040) install creates `GameLibSteamBridge-206040` and launches through the
   bridge helper.
2. A machine with Avernum 6 (206060) already in the legacy shared `GameLibSteamBridge` bottle still
   shows it installed and launches it from there (no migration was built).
3. Uninstalling the per-game install removes the bottle from disk and from CrossOver's own bottle list.
4. `cxbottle --delete --force` on a per-game bottle behaves as `removePerGameBridgeBottle` assumes
   (directory gone, menu and file-association entries cleaned).
5. Both games stay installed across a library refresh.

Item 2 needs an as-found profile with a legacy-bottle install; back it up before the code under test
runs, because a live `tauri dev` relaunches on every commit and can consume the fixture.

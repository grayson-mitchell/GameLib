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

## Closed

Closed 2026-10-17 by quick task 261016-wsq (`.planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/`),
run inline on this Apple Silicon Mac against CrossOver 26.2 with a `pnpm tauri:dev` build of
`87f64dff5`. Per item:

1. PASS — a fresh install created `GameLibSteamBridge-206040` (cxbottle create 14 s), downloaded
   depot 206041 (92,315,962 bytes, 1460 files, 8 s) into it, wrote a StateFlags 4 manifest, placed
   the shim, and `launch` ran `Avernum 5.exe` from that bottle via the bridge path (wine process
   held 6 open files under `/Bottles/GameLibSteamBridge-206040`). The game then showed its own
   "requires 16 bit color" dialog — a game requirement, both bottles are config-identical bar BottleID.
2. PASS — Avernum 6 read installed from the legacy bottle and launched from it (helper spawned,
   window `Avernum 6` on screen, wine process in `/Bottles/GameLibSteamBridge`).
3. PASS — uninstall logged `removePerGameBridgeBottle: removed per-game bridge bottle
   "GameLibSteamBridge-206040"`, the directory was gone within 1 s, its wineserver was stopped,
   and `cxbottle --bottle GameLibSteamBridge-206040 --status` reports the bottle not found.
4. PASS — `cxbottle --delete --force` left no directory and no `~/Applications/CrossOver` entry;
   the legacy and Phase 17 bottles kept their cxbottle.conf mtimes and manifest hashes.
5. PASS — refresh with both bottles ready kept 206040 (per-game path) and 206060 (legacy path)
   installed; after the per-game uninstall a refresh read 206040 not installed, 206060 installed.

Item 2's as-found fixture (legacy bottle with Avernum 5, Avernum 6 and HOARD) was backed up before
the launch and Avernum 5 was restored into the legacy bottle afterwards; the machine is as found.
Side measurement for the cleanup todo: a legacy-bottle uninstall reverts within 3 s — see
`2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md`.

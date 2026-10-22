---
created: 2026-10-22
title: "Default \"Download Steam games directly in GameLib\" to on, and run the Apple-silicon runnability check after a Steam-delegated install too"
source: phase 51-19 live gate item 4 (HOARD, 63000), fresh Mac, packaged debug bundle
area: steam-install
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
severity: major
platform: macos
ready: code
---

Observed 2026-10-22 installing HOARD (63000) on a fresh Apple-silicon Mac:

1. **First install was delegated to the Steam client.** `SteamGame: delegating install for appId
   63000 via steam://install/63000` (20:17:26). On a fresh profile the "download Steam games
   directly in GameLib" setting was off, so Mac Steam installed the native macOS build. That build
   is 32-bit (i386) and cannot run on Apple silicon; previous testing already showed this.
   GameLib's install polling gave up after 60s: `install polling for appId 63000 stopped after
   grace window (20 ticks) — no manifest detected; user may have cancelled` (20:18:26). The
   install was never checked, and the broken native copy was never flagged.
2. **Second install went through GameLib's own depot download** (20:28:30). After it,
   `verifyMacArchGroundTruth resolved appId 63000 to mac_arch '32' (Mach-O ground truth)`
   (20:29:10) caught the i386 build and offered the recovery. The operator confirmed, and GameLib
   force-uninstalled the native copy and reinstalled through the bridge bottle
   `GameLibSteamBridge-63000` (20:29:26 to 20:30:02). This is the correct path, but it only runs
   when GameLib downloads the game itself.

Operator ask:

- "Download Steam games directly in GameLib" should be **on by default**.
- If it is off and the install is delegated to Steam, GameLib should **still check that the game
  can run on Apple silicon once Steam finishes installing it**. Run the same
  `verifyMacArchGroundTruth` / i386-recovery offer when the delegated install's manifest appears.

Also fix: the delegated-install poller's 20-tick (60s) grace window is far shorter than any real
download, so delegated installs of any size are never seen to complete. Poll until the
appmanifest reaches a fully-installed StateFlags, or watch `appmanifest_63000.acf`, instead of
giving up.

Related noise seen in the same run: `Library: 1 owned Steam game(s) silently excluded from the
library grid by a stale nonAvailableGames entry: 63000` (20:28:22, 20:30:54, 20:30:55) after the
native uninstall.

---
created: 2026-11-13T00:00:00.000Z
title: 'Verify the Steam-registered Update hand-off (steam://nav/games/details) on Windows'
area: steam
severity: minor
platform: windows
ready: human
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 15 (deferred from the Phase 74 live gate on 2026-11-13)'
files:
  - src/backend/storeManagers/steam/updateNative.ts
---

## Problem

Phase 74 (D-12) updates a Steam-registered game by handing it to Steam. On macOS with the
experimental InstallApp setting on, it asks the running client directly. Everywhere else,
including every Windows and Linux install, it opens `steam://nav/games/details/<appId>` and polls
the ACF until Steam finishes.

The macOS form of that hand-off was verified live in 74-UAT item 11 (2026-11-13). Steam opened
ADOM's library page, the page offered an Update button, and polling saw the new build. The
Windows path was not exercised; the operator deferred UAT item 15 to run on their Windows machine
at leisure.

## What to check (on the Windows box, `pnpm tauri:dev` or a dev build)

1. Pick a small game installed by Steam itself (not a GameLib bridge install) that has a pending
   update. Spike 069 step 4 shows how to stage one: set "Only update this game when I launch it",
   switch to an older beta branch, quit Steam fully, delete the `BetaKey` lines from
   `appmanifest_<appId>.acf`, relaunch Steam.
2. In GameLib press Refresh, then confirm the update badge shows and the Info tab says "Steam will
   update this game."
3. Click "(Click to Update)" and confirm.
4. Expected: the log shows `SteamGame: delegating update for appId <id> via
   steam://nav/games/details/<id>`, and Steam opens on that game's library page.
5. Record whether Steam's page offers an Update button.
6. Update in Steam. Expected: GameLib shows Updating, then `update of appId <id> finished (build
   <n>)`, and the badge clears.

## Done when

Steps 4-6 pass on Windows, or a defect is filed with the log excerpt. Record the result back in
74-UAT item 15 (status word first). Linux remains unverified unless someone has a Linux box.

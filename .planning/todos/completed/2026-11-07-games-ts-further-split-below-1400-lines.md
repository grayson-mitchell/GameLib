---
created: 2026-11-07T12:00:00.000Z
title: "Split games.ts further toward the 62 plan's under-1,400-line target"
area: steam-refactor
files:
  - src/backend/storeManagers/steam/games.ts
severity: minor
platform: any
ready: human
---

The 62 split left `games.ts` at about 2,043 lines against the plan's under-1,400 target. The remaining bulk is the class shell, getSettings, getGameInfo, metadata, update, forceUninstall, stop, isGameAvailable, importGame, shortcuts and getBridgeRouteVerdict. D-07 left them in place.

Decision required before any code: which clusters move (for example getSettings/getGameInfo/metadata, update/forceUninstall/stop, importGame/shortcuts, getBridgeRouteVerdict), to which modules, and whether the class shell keeps them as stubs (see the stub-removal todo `2026-11-07-remove-steamgame-lift-stubs.md`, which interacts with that choice).

Split off from the closed `2026-11-06-games-split-cleanup-candidates-62.md` (bullet 7).

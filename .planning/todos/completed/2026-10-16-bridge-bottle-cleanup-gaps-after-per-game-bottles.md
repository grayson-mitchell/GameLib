---
created: 2026-10-16
title: "Two cleanup gaps left by per-game bridge bottles: legacy uninstall manifest, and Remove all copies leaving an empty bottle"
source: quick task 261016-u1w planner and executor (T-u1w-06, LD-5)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
severity: minor
platform: macos
ready: human
---

Both were deliberately left out of 261016-u1w.

1. **Legacy-bottle uninstall leaves a stale `appmanifest_<appId>.acf` (T-u1w-06) — MEASURED 2026-10-17, it
   is worse than "may".** Quick task 261016-wsq Arm 2 uninstalled Avernum 5 from the legacy bottle through
   the app: the install root was removed at 07:48:43, the manifest survived, `markBridgeGameUninstalled`'s
   `gameStatusUpdate done` triggered the frontend's `refreshLibrary runner=steam origin=game-status` in the
   same second, and by 07:48:46 the library had re-marked 206040 installed with a path to the deleted
   directory. No user refresh was needed. Because `isGameAvailable()` then saw a missing install_path, the
   frontend pushed 206040 into `nonAvailableGames` and the game vanished from the library grid (19 "silently
   excluded" errors in 75 s) until the manifest was deleted by hand. Promoted to its own `ready: code` todo:
   `2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md`. Per-game bottles are immune (the
   whole bottle is deleted — measured in the same run). **Fixed 2026-10-17 by quick task 261017-bqw** — the
   legacy branch of `uninstallBridgeGame()` now removes the manifest; the promoted todo is in
   `.planning/todos/completed/`.

2. **"Remove all copies" leaves an empty per-game bottle (LD-5, needs a decision).**
   `removeSteamInstallCopy('bridge')` removes the install dir and manifest but keeps
   `GameLibSteamBridge-<appId>`. The next install reuses it, so nothing breaks; it costs disk and
   clutters CrossOver's bottle list. Decide whether it should call `removePerGameBridgeBottle` when the
   bottle is per-game.

## Closed 2026-10-17 — Phase 51 (D-51-12)

1. **Item 1 (legacy-bottle uninstall manifest)** — already fixed by quick task 261017-bqw (recorded
   above): the legacy branch of `uninstallBridgeGame()` now removes the stale `appmanifest_<appId>.acf`.
   The promoted todo this spawned (`2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md`)
   is also in `.planning/todos/completed/`.

2. **Item 2 (empty per-game bottle on "Remove all copies")** — decided as D-51-12: when
   `removeSteamInstallCopy('bridge')` resolves a per-game bottle (`GameLibSteamBridge-<appId>`, via
   `resolveBridgeBottleName`) and completes a full (non-`manifestOnly`) removal, it now calls
   `removePerGameBridgeBottle(appId)` to delete the emptied bottle. The legacy shared
   `GameLibSteamBridge` bottle, and the `'native'`/`'bottle'` sources, are never touched. Implemented
   in Phase 51 Plan 05: RED `ac47dbab2` (`test(51-05): add failing tests for bridge bottle cleanup on
   copy removal`, `src/backend/storeManagers/steam/__tests__/removeCopies.test.ts`), GREEN `848ecea0f`
   (`feat(51-05): delete the emptied per-game bridge bottle on copy removal`,
   `src/backend/storeManagers/steam/library.ts`).

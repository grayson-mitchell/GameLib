---
created: 2026-11-07T12:00:00.000Z
title: "Remove the SteamGame lift stubs and spy on the free functions"
area: steam-refactor
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
severity: minor
platform: any
ready: code
---

The roughly 40 class stubs in `games.ts` (install, installNative, installBottleNative, isNative, isBottleEligible, bridgeRoute, launch, maybeNotifyDrmModeFailed, ...) are SteamGame's method surface, not just prototype-spy shims. They were excluded from quick 261107-99k because removal is not mechanical or bounded:

- About 30 non-test sites call them as `game.x()`, including the lifted modules themselves; each becomes `x(game)`.
- `games.test.ts` has 6 `SteamGame.prototype` spies: fetchMetadataIfNeeded (a real method, not a stub), installBottleNative, launchDrmModeGame x3, launchBridgeGameBody.
- Module-export spies do NOT intercept intra-module calls under ts-jest, so each spy needs its own restructuring.

Suggested approach: do it one cluster at a time (install, launch, eligibility, ...), converting call sites and swapping that cluster's spies together, with the suite green after each.

Split off from the closed `2026-11-06-games-split-cleanup-candidates-62.md` (bullet 8).

## Resolved

Done in quick 261108-ca6. The todo's scope was stale: ten non-interface stubs were removed (installNative, installBottleNative, ensureBuiltInEngineForInstall, installBridgeGame, prefetchBridgeDrmDownloads, launchDrmModeGame, prepareTcpOverlay, launchBridgeGame, launchBridgeGameBody, fireBridgeWineLaunch), not about 40. The Game-interface forwarders (install, isNative, launch, moveInstall, repair, syncSaves, uninstall), restorePinEngine and fetchMetadataIfNeeded stay. 19 test spies moved onto module exports (not 6); installNative/installBottleNative moved to gameInstallDepot and launchBridgeGame/runBridgeLaunch to gameBridgeLaunchGate so the spied calls cross a module boundary. Plain static imports now form real cycles between lifted modules; the audit found no top-level cross-cycle reads, and gamesModuleSurface.test.ts names the allowed edges.

## Resolution

Closed 2026-11-08 by Phase 65 (65-13, 65-19) with quick-261108-ca6 doing the work. Corrected scope: of the 16 non-interface stubs, eligibility (4) and uninstallBridgeGame (1) were removed in 65-13 (1b288062b, D-18), and the remaining ten in quick-261108-ca6 (3ebf3dabf install cluster, c44cb7c12 launch cluster); call sites converted to free functions. `restorePinEngine` is retained as a class-bound callback property (engineSwitch needs a bound reference), not a D-19 cycle-breaker. The Game-interface members stay as thin methods. SteamGame.prototype spies: 0. games.ts: 613 lines. 65-19 added only the gameBridgeLaunchGate leaf-rule coverage (0bfd02bab).

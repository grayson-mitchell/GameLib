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

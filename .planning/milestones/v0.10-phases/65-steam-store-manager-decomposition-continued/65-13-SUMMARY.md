---
phase: 65-steam-store-manager-decomposition-continued
plan: 13
subsystem: steam-store-manager
tags: [refactor, decomposition, games.ts]
requires: [65-12]
provides:
  - bridgeRouteVerdict.ts (getBridgeRouteVerdict)
  - gameMetadata.ts (fetchMetadataIfNeeded free function)
  - SteamGame without eligibility and uninstallBridgeGame stubs
affects: [games.ts, gameEligibility.ts, gameUninstall.ts, installFormIpc.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridgeRouteVerdict.ts
    - src/backend/storeManagers/steam/gameMetadata.ts
    - src/backend/storeManagers/steam/__tests__/bridgeRouteVerdict.test.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/gameEligibility.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/installFormIpc.ts
    - meta/steamLineCeilingBaseline.json
    - meta/knip-baseline.txt
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 13: games.ts under the ceiling Summary

games.ts went from 1349 to 858 lines and left the ceiling allowlist (5 keys remain): getBridgeRouteVerdict moved, fetchMetadataIfNeeded lifted, and the eligibility and uninstallBridgeGame stubs removed.

## Commits

- eb5da0018 getBridgeRouteVerdict -> bridgeRouteVerdict.ts (pure move, 1349 -> 1267)
- 5fec0d9bc fetchMetadataIfNeeded -> gameMetadata.ts (1267 -> 971; allowlist key deleted here)
- 1b288062b remove isBottleEligible / checkBridgeRoute / isBridgeEligible / checkBottleEligibility / uninstallBridgeGame stubs (971 -> 858)

`wc -l games.ts` after Task 2: 971. After Task 3: 858. The D-18 fallback (pull the install-cluster stubs forward) was not needed; 65-19 still owns the install and launch stubs.

## Stubs removed here (5 of 16)

isBottleEligible, checkBridgeRoute, isBridgeEligible, checkBottleEligibility, uninstallBridgeGame. 65-19 removes only the rest.

## Restructured and repointed tests

- games.test.ts D5b: the spy on `uninstallGame.uninstallBridgeGame` cannot see the now intra-module call in gameUninstall.ts. It now asserts `removePerGameBridgeBottle` (the bridge uninstall's first collaborator, already mocked) is not called.
- games.test.ts fetch-rejection test: prototype spy became `jest.spyOn(gameMetadata, 'fetchMetadataIfNeeded')` (cross-module caller, so the spy intercepts).
- games.test.ts / macArchKnownFixRouting.test.ts: `x.checkBottleEligibility()` became `checkBottleEligibility(x)`.
- installFormIpc.test.ts: mocks `../bridgeRouteVerdict` and `../gameEligibility` instead of named exports on `../games`.
- bridgeRouteVerdict.test.ts: the four getBridgeRouteVerdict tests moved out of games.test.ts, with a trimmed mock set (including `backend/launcher`, needed to keep fs-extra from loading).
- gamesModuleSurface: `GAMES_TS_EXPORTS = ['SteamGame']`; gameMetadata.ts added to LIFTED_OWNERS and to FORWARD at rank -1 (a leaf beneath gameEligibility, which calls it).
- metadataCapture.test.ts: the bridge carry-forward scan now reads gameMetadata.ts, with a non-vacuity assert on the function declaration.

## Verification

- Steam + sidecar jest run: 6045 tests (steam baseline 4385), 0 runtime-error suites, no assertion failure outside the baseline. Failing suites: testContainment Block C and macArchKnownFixRouting, both pre-existing (Block C is on the known list; macArchKnownFixRouting has no new failing assertion).
- codecheck, boundaries and steam-line-ceiling pass.
- `pnpm lint`: 0 errors except the known games.test.ts:223 `require()` error (was :221; line shifted by my import additions, not touched).
- find-deadcode and indexedAccess ratchet fail only on pre-existing drift (verified none concern files I touched).

## Cycle rule

Census raw count 459 (65-12: 453), +6 from gameMetadata.ts joining the cycle set. Diff against 65-baseline-steam-cycle-modules.txt: new modules in cycles are the earlier-split products (bottledSteam, bridgeBottle, bridgeBottleLifecycle, bridgeInstallState, gameInstallBridge, gameInstallDepot, provisionBottle, library/*) plus gameMetadata. gameMetadata is the only module this plan adds and it is a split product of games.ts (on the list). bridgeRouteVerdict.ts is not in any cycle.

## Deviations from Plan

1. [Rule 3 - Blocking] knip baseline: `isForcedWindowsViaBottle` in meta/knip-baseline.txt went stale because bridgeRouteVerdict.ts now imports it; line removed (in 1b288062b, caused by Task 1).
2. [Rule 1] `isBridgeEligible` free function became dead once its stub went (knip failure); removed it. `uninstallBridgeGame` un-exported for the same reason (now intra-module).
3. Task 3's two per-cluster commits were combined into one: both clusters edit games.ts and gameUninstall/bridgeRouteVerdict hunks interleave, so the split was not practical without interactive staging.
4. Removed now-unused imports from games.ts (axios, parseMetacriticScore, state helpers, etc.); STEAM_CDN_BASE moved to gameMetadata.ts with its only user.

## Known Stubs

None.

## Self-Check: PASSED

---
phase: quick-261107-an2
plan: 01
status: complete
subsystem: backend/storeManagers/steam
tags: [refactor, visibility, steam, phase-62-followup]
requirements: [TODO-2026-11-06-renarrow-steamgame-member-visibility-after-62-lift]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/gameEligibility.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameLaunchOverlay.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/gameMaintenance.ts
    - src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts
  moved:
    - .planning/todos/pending/2026-11-06-renarrow-steamgame-member-visibility-after-62-lift.md -> completed/
commits: [e8efe5583, a05abb728, 2bc646627, bc448a9c4]
---

# Quick 261107-an2: Re-narrow SteamGame member visibility

Lifted modules now call sibling free functions directly (`X(steamGame, ...)`) wherever no test spies on the member. This removes the need for those class stubs to be public, so the class surface is back to roughly its pre-62 shape. Runtime behaviour is unchanged.

## Dispositions (as in the plan)

- 3 restored to `private`: isBottleEligible, ensureBuiltInEngineForInstall, prepareTcpOverlay.
- 40 stubs deleted (21 in Task 1, 15 in Task 2, 4 in Task 3). Their JSDoc moved verbatim onto the free functions. Misattached blocks were re-homed as the plan listed.
- 11 kept public with `@internal` and a named reason: fetchMetadataIfNeeded, installNative, installBottleNative, installBridgeGame, launchBridgeGame, launchDrmModeGame, launchBridgeGameBody, uninstallBridgeGame (test spies), plus fireBridgeWineLaunch, prefetchBridgeDrmDownloads (cycle back-edges) and restorePinEngine (class-bound callback).
- appId stays `readonly`, untagged.

games.ts went from 2043 to 1324 lines.

## Commits

- e8efe5583 eligibility and install members
- a05abb728 launch, overlay and bridge-launch members
- 2bc646627 uninstall members, `@internal` tags, module headers, forward-import guard, todo moved to completed/
- bc448a9c4 guard regex also catches side-effect imports

## Verification

- `pnpm codecheck`, `pnpm boundaries`, `pnpm planning-gates`: pass.
- `npx prettier --check` over every touched path: pass.
- Scoped eslint (`--quiet`) over games.ts and the seven lifted modules: 0 errors.
- Guard test: adding `import './gameBridgeLaunch'` to gameLaunch.ts made it fail (3 vs rank 2); reverted.
- `npx jest src/backend/storeManagers/steam`: 4650 passed, 3 failed. games.test.ts was not edited and all spies still intercept.
- `pnpm lint`: 0 errors in touched files; 1 error in games.test.ts:25 (`no-unnecessary-type-assertion`).

## Pre-existing failures (confirmed against the pre-change source, not caused by this task)

I checked out the eight source files from `e8efe5583^` and re-ran. The same results appeared:

- `macArchKnownFixRouting.test.ts` "Intel: never seeds..." fails (host-dependent steam://install hand-off).
- Two tests read `.planning/phases/56-.../56-01-SUMMARY.md`, which no longer exists (bottle.ts DRM_LAUNCH_FORM, games.test.ts channel constants).
- The `pnpm lint` error in games.test.ts:25 (file is off-limits per the plan; 62-22 already targets it).

The plan's Task 3 verify chain (`pnpm lint && jest src/backend/storeManagers/steam`) therefore cannot go fully green until these are fixed.

## Deviations from Plan

1. **[Rule 3] Orphaned import comments removed.** Two comments in games.ts attached to deleted imports (`AuthSessionRefusal` from './user' and `BridgeRouteInput`) were removed with them.
2. **[Rule 1] Guard test regex.** The first version matched only `from '...'` and missed a side-effect `import './x'`. Widened to `(?:from|import)` and re-verified by the plan's temporary-import check.
3. **JSDoc stacking.** On launchBridgeGame the Phase 24 block was placed directly above the stub, below the existing "Phase 59: the engine registered..." block, so two blocks stack there. Nothing was dropped.

No disposition in the table was changed.

## Known Stubs

None.

## Self-Check: PASSED

Commits e8efe5583, a05abb728, 2bc646627 and bc448a9c4 exist; the todo is in completed/; games.ts has 11 `@internal` tags.

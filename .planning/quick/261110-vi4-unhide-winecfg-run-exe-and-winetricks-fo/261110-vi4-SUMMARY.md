---
phase: quick-261110-vi4
plan: 01
subsystem: steam / wine tools
tags: [steam, macos, winecfg, winetricks, bridge-bottle]
requirements: [QUICK-261110-vi4]
key-files:
  created:
    - src/backend/storeManagers/steam/bridgeWineTools.ts
    - src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts
  modified:
    - src/backend/engine/toolSettings.ts
    - src/backend/tools/index.ts
    - src/backend/tools/__tests__/runWineCommandOnGameGuard.test.ts
    - src/backend/engine/__tests__/launcherOverlayCensus.test.ts
    - src/common/types/engine.ts
    - src/backend/engine/engineState.ts
    - src/backend/engine/__tests__/engineState.test.ts
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/visibility.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/visibility.test.ts
    - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
metrics:
  completed: 2026-11-10
  tasks: 3
---

# Quick 261110-vi4: Unhide Winecfg, Run EXE and Winetricks for per-game Steam bridge bottles

Winecfg, Run EXE and the Winetricks tab now show and work for a macOS Steam bridge title installed in its own `GameLibSteamBridge-<appId>` bottle. Legacy shared-bottle and bottled-Steam titles stay hidden and the backend refuses them (Pitfall 5).

## What changed

- `steam/bridgeWineTools.ts` (new): `steamWineToolsBottle` / `isSteamWineToolsEligible` (eligible only when `findBridgeInstallBottle(appId)` equals the per-game name, on macOS, numeric appId) and `resolveSteamWineToolSettings` (live runner, CrossOver bridge settings, or built-in/wine-manager fallback engine; final invariant that `wineCrossoverBottle` is exactly the own bottle). Never writes the engine marker.
- `engine/toolSettings.ts`: `'not-own-bottle'` reason, exported `nonCrossoverEngineFor`. Still imports nothing from storeManagers.
- `tools/index.ts`: module-local `resolveGameToolSettings` routes bottle-runtime stores (Steam) to the Steam resolver, everything else to `resolveToolSettings` as before; used by `runWineCommandOnGame`, `Winetricks.runWithArgs` (non-override branch) and `Winetricks.listInstalled`. The Pitfall-5 guard now refuses unless `isSteamWineToolsEligible(appName)`.
- `EngineState.wineToolsEligible` set at both compute sites and wired from `steamEngineStateDeps`; `wineToolsHidden` takes `steamToolsEligible`, and `GamesSettings` passes `engineState?.wineToolsEligible === true` (unknown/loading stays hidden).

## Commits

- 5223a8cd6 feat: Steam per-game Wine tools eligibility and resolver
- 5398f5936 feat: route Wine tools through per-game Steam bottle decision
- e02fa0bc8 feat: gate Steam Wine tools on EngineState.wineToolsEligible

## Deviations from Plan

1. [Rule 3 - ratchet] `pnpm backend-di-ceilings` forbids new `jest.mock` calls. `bridgeWineTools.test.ts` uses no jest.mock (a `logError` dep was added to `SteamWineToolsDeps` so the invariant log is injectable), and the guard test uses `jest.spyOn` on the real `bridgeWineTools` module instead of `jest.mock`.
2. [Rule 1 - break] `resolveGameToolSettings` takes `{ runner, appName }` from the call site rather than `game.getGameInfo()`, because `winetricksQueue.test.ts` game mocks have no `getGameInfo`.
3. [Rule 3 - source gate] `engine/__tests__/launcherOverlayCensus.test.ts` (not in files_modified) asserts a regex over `tools/index.ts`; widened it to accept `resolveGameToolSettings(deps, {...}, game, await game.getSettings()`.

## Verification

All named suites, tsc, prettier, eslint (0 errors) and `pnpm backend-di-ceilings` pass. Wider run (`src/backend/tools`, `steam`, `sidecar`): 2 failures unrelated to this change and not touching these files: `sidecar/__tests__/testContainment.test.ts` (`outboundHttpRegistry.test.ts` unclassified, added by quick-261110-9w2) and `steam/__tests__/macArchKnownFixRouting.test.ts` (Intel case, `steam://install` not opened). Not fixed (out of scope).

## Operator live check (not a blocking gate)

Needs `pnpm build:sidecar` then a restarted `pnpm tauri:dev` (tauri dev does not rebuild the sidecar; never `tauri:dev:run`):

1. macOS, a Steam bridge title installed in its own bottle (`~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<appId>` holds `steamapps/appmanifest_<appId>.acf`): open its Settings, Wine tab. Expected: Winecfg and Run EXE are visible, the inert Wine toggles are still absent, and a Winetricks tab is present.
2. Click Winecfg. Expected: winecfg opens; its window title / About tab or `ps` shows it running with that bottle (`CX_BOTTLE=GameLibSteamBridge-<appId>` or `WINEPREFIX=.../GameLibSteamBridge-<appId>`), not `GameLibSteamBridge` or the bottled-Steam bottle.
3. A Steam title still in the legacy shared `GameLibSteamBridge` bottle (or a bottled-Steam-only title): Wine tab shows no Winecfg/Run EXE and there is no Winetricks tab.

**Result:** passed — operator confirmed all three steps 2026-11-11.

## Self-Check: PASSED

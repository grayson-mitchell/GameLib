---
created: 2026-11-06T12:00:00.000Z
title: "Cleanups found during the 62 games.ts split, deliberately not fixed"
area: steam-refactor
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/gameConstants.ts
  - src/backend/storeManagers/steam/gameDrmLaunch.ts
  - src/backend/storeManagers/steam/gameSessionState.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
  - src/backend/__tests__/steamAuthSessionPolicy.test.ts
severity: minor
platform: any
ready: code
---

Found during the 62 pure moves and mechanical lifts, deliberately not fixed (D-06: cleanups never ride in a move commit).

- `games.test.ts` negative source scans ("A-19 ... carries no writer" over `games.ts`/`library.ts`/`electronStores.ts`, and "no nag notification" over `games.ts`) only scan the files they name, so they no longer see the moved/lifted modules. Widen the file lists to all `game*.ts`.
- `metadataCapture.test.ts` and `steamAuthSessionPolicy.test.ts` negative scans were repointed to `gameInstall.ts`/`gameEligibility.ts` only; widen to every `game*.ts` module.
- `NUMERIC_APP_ID` (`/^\d+$/`) is duplicated across clientSetup, installFormIpc, bottle, bridge/allowlist (now owned by `gameConstants.ts` for games.ts and gameUninstall.ts); `buildSteamProtocolUrl` repeats `/^\d+$/` inline. Consolidate on the one export.
- `// ts-prune-ignore-next` markers on `gameDrmLaunch.ts` exports predate the deadcode gate; the exports are now used by lifted modules, so some markers are probably stale.
- `drmModeNoticeShownThisSession` (`gameDrmLaunch.ts`) is a module-level Set with no test-only reset helper, unlike its siblings in `gameSessionState.ts`.
- Comments inside lifted bodies still refer to "games.ts" line numbers and `this.` (e.g. `gameUninstall.ts`, `gameInstall.ts`); refresh the stale references.
- `games.ts` finished at about 2,043 lines against the plan's under-1,400 target. The remaining bulk (class shell, getSettings, getGameInfo, metadata, update, forceUninstall, stop, isGameAvailable, importGame, shortcuts, getBridgeRouteVerdict) was left by D-07; a further split would need new decisions.
- The lift stubs on the class are a permanent indirection layer whose only purpose is prototype-spy compatibility in `games.test.ts`; once those tests spy on the free functions, the stubs can go.

## Resolution

Closed 2026-11-07 by quick task 261107-99k. Bullets 1-6 were done with no runtime behavior change; bullets 7 and 8 were refiled as their own todos.

- Bullets 1-2 (negative scans): the A-19 census and the "no nag notification" scan in `games.test.ts`, the `bridgeAllowlist.has(` count in `metadataCapture.test.ts`, and the must-scan set in `steamAuthSessionPolicy.test.ts` now cover every `game*.ts` module, discovered from the directory with a floor of 13 modules. RED sanity was observed: appending `nagNotice` / `markNativeBottleInstall` to `gameMaintenance.ts` failed the nag and A-19 scans, and a second `bridgeAllowlist.has(` failed the count scan.
- Bullet 3: `NUMERIC_APP_ID` is now defined only in `gameConstants.ts`. clientSetup, installFormIpc, bottle, bridge/allowlist, removeAllCopies, cancelDelete and buildSteamProtocolUrl import it, and so do library, installLocation and the bridge modules (bridgeConfig, launchTarget, bridgeVerdict, importScan, helperProcess, bottleDllOverrides, shimGenerate), which carried the same regex. `bridge/drm/drmLaunchSetup.ts` keeps its own different regex (`/^[0-9]{1,10}$/`). `src/backend/sidecar/installFlowRegistration.ts` keeps its inline `/^\d+$/` deliberately (sidecar, outside the named set).
- Bullet 4: 14 of the 17 `ts-prune-ignore-next` markers in `gameDrmLaunch.ts` were removed. `DRM_DLL_OVERRIDES`, `DrmLaunchEnvInput` and `DrmLaunchEnv` keep theirs, because `pnpm find-deadcode` reports them as used-in-module otherwise.
- Bullet 5: `__resetDrmModeNoticeShownForTests()` added to `gameDrmLaunch.ts` and called from three `games.test.ts` `beforeEach` blocks.
- Bullet 6: games.ts line-number citations and `this.` references in lifted comments (gameUninstall.ts, gameSessionState.ts) now name symbols and the `steamGame` parameter.
- Bullet 7 refiled as `.planning/todos/pending/2026-11-07-games-ts-further-split-below-1400-lines.md`.
- Bullet 8 refiled as `.planning/todos/pending/2026-11-07-remove-steamgame-lift-stubs.md`; it is not mechanical, see that todo.

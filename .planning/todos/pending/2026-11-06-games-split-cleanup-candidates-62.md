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

# Quick 261111-9mj: Detect Steam-launched games as playing - Summary

**One-liner:** A bounded per-appId process watcher (`steamLaunchWatch`) sends `playing`/`done` for steam://rungameid launches on macOS/Linux, so the card shows Playing and Stop (261111-9b7) is reachable.

## Commits

- `3916f40b7` feat: steamLaunchWatch + `scanSteamLaunchedPids` extracted from stopSteamLaunchedGame
- `719507f5c` feat: wiring (launch, stop, registry holder, deps builder, games.test.ts G1-G5)

## What was built

- `steamLaunchWatch.ts`: `startSteamLaunchWatch` / `cancelSteamLaunchWatch`; registry injected (no module state), unref'd injected-clock timers, 90s start window, 2-scan flap guard, 10-failure cap, quiet exit if the global poller reports the appId.
- `stopSteamLaunchedGame.ts`: `scanSteamLaunchedPids` extracted (stop uses it for both scans); `resolveSteamLaunchedInstallFolder` deps narrowed to a Pick.
- `steamLaunchedDeps.ts`: `steamLaunchedStopDeps` moved out of games.ts, plus `steamLaunchWatchDeps` and `watchSteamLaunch` (try/catch wrapper).
- `SteamLibraryManager.launchWatches` instance field; `StoreManagers.library.steam` typed concretely; `getPollerRunningAppId()` added.
- `gameLaunch.ts` +3 lines (987, under the 1000 ceiling); `games.ts` stop() cancels the watch first, sends one `done` when a shown watch remains after a non-`stopped` outcome.

## Verification

- steamLaunchWatch.test.ts (T1-T11 plus T7b/T8b/T10b), stopSteamLaunchedGame, runningFromFolder, library.runningPoll tests green; games.test.ts 725/725 (G1-G5 added; the known foreign `removeShortcuts` failure did not occur).
- `pnpm steam-line-ceiling` PASS; `pnpm backend-di-ceilings` PASS (moduleState=250, childProcess=19, jestMock=2429); prettier clean on all touched paths; `pnpm build:sidecar` succeeded.
- `pnpm tsc --noEmit` is clean for this plan. Remaining errors are foreign, in `macArch` files (`machOArchsOf` missing, from uncommitted `library/macArch.ts` work).

## Deviations from Plan

- **TDD:** the module and tests were written in the same pass and went green on the first run; no separate RED commit exists (one `feat` commit per task, no `test(...)` RED commit).
- **[Rule 3] Type narrowing:** `resolveSteamLaunchedInstallFolder` deps narrowed to a `Pick` so the watch deps (no `signal`) type-check.
- **[Rule 3] Test isolation:** G-block resets the bridge-launch-bottles state and spies `cancelDelegatedInstall` to false, because leaked state from earlier describes made stop() return before the final branch.

## Deferred Finding (not acted on)

The global RunningAppID poller never starts under Tauri: `startRunningPoll()` is only called from `SteamLibraryManager.init()`, and `initStoreManagers()` is dead under Tauri (see comments at sidecar/bootstrap.ts ~1071 and protocol.ts ~164). Reviving it is a separate boot-order change; candidate follow-up todo. The watch's `pollerReports` dep keeps it correct if the poller returns.

## Pending

Human live gate (WazHack 264160) is the operator's: restart `pnpm tauri:dev`, confirm Playing within ~5s, Stop gives exactly one `done`, in-game quit returns Play within ~5s. Not attempted here.

## Known Stubs

None.

## Self-Check: PASSED

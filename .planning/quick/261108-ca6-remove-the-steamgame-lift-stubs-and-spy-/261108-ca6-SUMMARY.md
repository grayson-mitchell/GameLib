# Quick 261108-ca6: Remove the SteamGame lift stubs and spy-only seams

Ten SteamGame forwarding stubs are deleted and their callers use the free functions directly. Test spies now target module exports.

## Commits

- 3ebf3dabf `refactor(quick-261108-ca6): drop SteamGame install lift stubs`
- c44cb7c12 `refactor(quick-261108-ca6): drop SteamGame launch lift stubs`
- (Task 3) `chore(quick-261108-ca6): close remove-steamgame-lift-stubs todo`

## What changed

- Removed from `games.ts`: installNative, installBottleNative, ensureBuiltInEngineForInstall, installBridgeGame, prefetchBridgeDrmDownloads, launchDrmModeGame, prepareTcpOverlay, launchBridgeGame, launchBridgeGameBody, fireBridgeWineLaunch.
- `installNative` and `installBottleNative` moved to `gameInstallDepot.ts`.
- `launchBridgeGame` and `runBridgeLaunch` (the G26 dedupe wrapper) moved to the new `gameBridgeLaunchGate.ts`. The body stays in `gameBridgeLaunch.ts`.
- `restorePinEngine` kept, now calls `ensureBuiltInEngineForInstall(this, pin)`.
- `games.test.ts`: all 19 stub spies became module spies. A `trackSpy` helper plus a top-level `afterEach` restores them, because the backend jest project sets `resetMocks`, not `restoreMocks`. `spyOnAllTerminals` now `mockClear`s the shared module spies on each call, since instance spies used to be fresh per game. The G26 different-appIds test uses one spy keyed on `appId`. Direct stub calls became free-function calls.
- Corrections to the todo: ten stubs, not about 40; 19 spies, not 6; the Game-interface forwarders (install, isNative, launch, moveInstall, repair, syncSaves, uninstall) stay by design.

## Cycle audit

New static cycles: gameInstall <-> gameInstallBridge, gameLaunch <-> gameBridgeWineLaunch, gameLaunch -> gameBridgeLaunchGate -> gameBridgeLaunch -> gameLaunch, and gameInstallBridge -> gameLaunch -> gameInstall. A scripted brace-depth scan found no top-level use of any cycle partner's import in any of these modules. All uses are inside function bodies. `pnpm build:sidecar` builds, and the steam and sidecar suites pass except for the two items below.

## Deviations

**[Rule 3 - Blocking] `gamesModuleSurface.test.ts`** pinned "lifted modules import siblings forward only (no cycle)", which the plan's chosen cycles break. I added `gameBridgeLaunchGate` to its owner and rank tables and a named `CYCLE_EDGES` allow-list of six edges. Everything else stays strictly forward. Committed with Task 3.

**Task 1/2 verification** ran `pnpm codecheck` as `tsc --noEmit` filtered, see below.

## Deferred / out of scope

- `pnpm codecheck` fails on `bridge/drm/__tests__/stageDrmBottle.test.ts` and `bridge/drm/stageDrmBottle.ts` (missing exports `buildDrmRegistryCommands`, `drmRegistryMismatches`, and similar). That is another person's uncommitted work in the tree. Every error outside `bridge/drm/` is clean, and `tsconfig.meta.json` is clean.
- `macArchKnownFixRouting.test.ts` "Intel: never seeds ..." fails. It fails identically at HEAD~2 (before this work): the `graceful-fs` mock lacks `writeFileSync`, so `GlobalConfig` throws under `isSteamExperimentalInstallAppEnabled`. Not caused by this change.
- No `bridge/drm/runnerClone.ts` call sites were found, and none of the unrelated dirty files were touched or staged.

## Verification

- `games.test.ts`: 713/713. `gamesModuleSurface`: 7/7.
- `jest src/backend/storeManagers/steam` plus `installFlows` and `steamAuthFlows`: all pass except the pre-existing macArch Intel test above.
- eslint: 0 errors (31 warnings, all pre-existing kinds). Prettier clean on every written path. `pnpm planning-gates` 12/12. The todo markdown is prettier-ignored, so it is not checked.
- `grep` for `.stubName(` over `src/backend/storeManagers/steam` is empty, and no `SteamGame.prototype` spy remains.

## Self-Check: PASSED

Commits 3ebf3dabf and c44cb7c12 exist, and `gameBridgeLaunchGate.ts` exists.

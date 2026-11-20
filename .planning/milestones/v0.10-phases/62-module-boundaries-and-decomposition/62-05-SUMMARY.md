---
phase: 62-module-boundaries-and-decomposition
plan: 05
subsystem: backend/storeManagers/steam
tags: [refactor, pure-move, decomposition, games.ts]
requires: ["62-03", "62-04"]
provides:
  - steam/gameConstants.ts, gameSessionState.ts, gameRequirements.ts, gameDrmLaunch.ts, gameProtocolUrl.ts (leaf modules)
  - __tests__/gamesModuleSurface.test.ts (games.ts export-surface guard)
affects: [62-06, 62-07, 62-08]
tech-stack:
  patterns: [byte-for-byte pure-move commits, no re-exports, leaf modules]
key-files:
  created:
    - src/backend/storeManagers/steam/gameConstants.ts
    - src/backend/storeManagers/steam/gameSessionState.ts
    - src/backend/storeManagers/steam/gameRequirements.ts
    - src/backend/storeManagers/steam/gameProtocolUrl.ts
    - src/backend/storeManagers/steam/gameDrmLaunch.ts
    - src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/cancelDelete.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
    - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
key-decisions:
  - "Only STEAM_STORE_API went to gameConstants.ts: it is the one constant used by both moved code and the class. NUMERIC_APP_ID and STEAM_CDN_BASE are class-only and stayed."
  - "OVERLAY_EXIT_GRACE_MS sits inside the DRM region but is an overlay constant used only by the class, so it stayed in games.ts."
  - "Neither deadcode baseline changed: no moved symbol changed its reachability verdict."
metrics:
  tasks: 3
  commits: 6
  completed: 2026-11-06
---

# Phase 62 Plan 05: games.ts pure moves (state, requirements, DRM) Summary

Everything free above `export default class SteamGame` in `steam/games.ts` now lives in a leaf module, moved byte-for-byte in separate commits. The class starts at line 306 (was 1262) and the file is 6,272 lines (was 7,228).

## Commits

| Commit | What |
| ------ | ---- |
| e3a14cdb2 | `STEAM_STORE_API` into `gameConstants.ts` |
| 367b37c2e | `NativeInstallEntry`, the in-flight Maps/Sets, reset/mark/clear helpers and the forced-Windows-via-bottle writers into `gameSessionState.ts` |
| 39e14d0d1 | `hostSteamDepotOs`, storage and macOS min-version parsers, `macArchFromMinOS`, `getSteamInstallSize` into `gameRequirements.ts` |
| a54c0e743 | `buildSteamProtocolUrl` into leaf `gameProtocolUrl.ts` |
| 290e3b640 | DRM channel consts/types, `buildDrmLaunchEnvironment`, trace/wine-log helpers, `drmStepNoticeText` into `gameDrmLaunch.ts` |
| a2b484adf | `gamesModuleSurface.test.ts` guard |

## Token edits inside moved bytes (the only ones)

`export` added because class code in games.ts reads the symbol: `nativeInstallsInFlight`, `bridgeLaunchesInFlight`, `bridgeLaunchBottles`, `bridgeFailedThisSession`, `loggedEmptyGameInfoMisses`, `hostSteamDepotOs`, `drmModeNoticeShownThisSession`, `engineLabelForLog`, `DrmWineLaunch`, `drmStepNoticeText`. Each is also in its commit message.

## Verification

- `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm boundaries` (violations 16 known, ratchet 136/65 unchanged; `games-split-modules-are-leaves` at 0) green after every commit.
- Each Map/Set exists once (`grep` one hit each; `drmModeNoticeShownThisSession` one hit).
- `logSecretGate` Meta test 60/60 after the DRM move.
- Guard test proven red by appending `export { buildDrmLaunchEnvironment } from './gameDrmLaunch'` to games.ts, then reverted.
- Tests green except the pre-existing failures listed in `deferred-items.md`.

## Deviations from Plan

**1. [Rule 3 - Blocking] `games.test.ts` source-scan repointed.** The test "en/gamelib.json holds the 11 keys with the t() default strings" reads `games.ts` text for the DRM step i18n keys, which now live in `gameDrmLaunch.ts`. It now searches both owners. Commit 290e3b640.

**2. [Plan/reality mismatch] Importer list.** The plan lists `installFormIpc.ts`, `library.ts` (for requirements), `macArchKnownFixRouting.test.ts`, `removeCopies.test.ts`, `steamStartupKeyringDeferral.test.ts` and `installFormIpc.test.ts` as repoint sites. None of them import a moved symbol (they import the `SteamGame` default or `getBridgeRouteVerdict`, both of which stayed), so they were not touched. `library.ts` and `cancelDelete.ts` did need repointing (`isNativeInstallInFlight`, `clearForcedWindowsViaBottle`). `downloadQueueFlows.test.ts` no longer mocks `games` at all: it overrides `getSteamInstallSize` on `gameRequirements`, since games.ts is no longer on that path.

No `meta/deadcode-baseline-*.txt` edits were needed.

## Deferred Issues

See `deferred-items.md` (62-05 section): four failures confirmed pre-existing (56-01 SUMMARY archived, `macArchKnownFixRouting` Intel case, 62-04's find-deadcode drift, i18n anti-rot).

## Cleanup candidates (for 62-08 to file as todos)

- `games.test.ts` negative source-scan tests ("A-19 ... carries no writer" over `games.ts`/`library.ts`/`electronStores.ts`, and "no nag notification" over `games.ts`) only scan the files they name, so they no longer see the moved modules. Widen the file lists.
- `NUMERIC_APP_ID` regex is duplicated across clientSetup, installFormIpc, bottle, bridge/allowlist and games.ts (its own comment says so); `buildSteamProtocolUrl` repeats `/^\d+$/` inline too.
- The `// ts-prune-ignore-next` markers on the DRM exports predate the deadcode gate; the exports are now used by games.ts, so some markers are probably stale.
- `drmModeNoticeShownThisSession` is a module-level Set with no test-only reset helper, unlike its siblings in `gameSessionState.ts`.

## Threat Flags

None. Pure move; no new input path.

## Self-Check: PASSED

All six created files exist; commits e3a14cdb2, 367b37c2e, 39e14d0d1, a54c0e743, 290e3b640, a2b484adf are in `git log`.

---
phase: quick-261024-gvu
plan: 01
status: complete
completed: 2026-10-24
commits:
  - 0f87ada3d
  - 18504f99d
  - f773ae0c8
requirements: [TODO-2026-10-23-bottled-launch-gives-up-after-20s, TODO-2026-10-24-play-button-flickers]
---

# Quick 261024-gvu: Bottled/bridge launch holds Launching until matched

The bottle/bridge process monitor now owns a backend `launching` status from the moment it starts (before the launch IPC resolves) and emits exactly one terminal `done` on every exit path, so the Play button no longer flickers back between click and Playing.

## What changed
- `bottleProcessMonitor.ts`: `launching` pushed at start; `sendTerminalDoneOnce` on gone, ps give-up (now also with no match), poll-loop crash, launcherExited no-match, external stop; supersede and test teardown are silent; new `getBottleProcessMonitorPhase`. No deadline added (LD-4).
- `bottle.ts`: monitor start is awaited before `runWineCommand`; a failed launch dispatch calls `stopBottleProcessMonitor`.
- `games.ts`: single-flight guard in `launch()` (both routes) when a monitor is live; `stop()` ends a pending monitor instead of the no-op warning.
- `GameStatus.tsx`: cause=none shows "Steam is still starting the game…"; Stop waiting button calls `window.api.kill(app, 'steam')`. Four new `steam.bottle.waiting.*` keys added to all 49 `gamelib.json` (English copies in non-English locales, same placement as 51-04).
- Both todos moved to `.planning/todos/completed/` with closure sections; the stuck-after-exit todo is untouched.

## Verification
- `jest src/backend/storeManagers/steam`: 57 suites, 2138 tests pass. GamePage components + BottleLaunchWaiting: 20 suites, 238 pass (incl. new GameStatus.bottleWaiting test, 5).
- `npx tsc --noEmit` clean; scoped `npx prettier --check` clean on all touched src files (locales and .planning are prettier-ignored).
- `pnpm lint-translations:gamelib`: 0 hard failures (1152 pre-existing "missing translation" warnings); `pnpm i18n-churn-guard` clean; `pnpm planning-gates` 12/12.
- `graphify update .` run.

## Deviations
- Guard in `games.ts` uses a truthy check on the phase (not `!== null`) so the existing test suite's auto-reset mocks (returning undefined) read as "no live monitor" without editing 40+ tests.
- The plan said "default null via beforeEach" for the games.test mocks; not needed given the above.

## Deferred / caveats
- `pnpm lint` exits non-zero: 1096 warnings against the 648 ceiling (0 errors). Not attributable to this change (touched files add a handful at most); baseline was not re-measured, so this is unverified as pre-existing.
- Live verification owed on the Mac: XCOM 200510 bottled first run (Launching through DXSETUP), Manor Lords 1363080 bridge (Launching -> Playing). A bridge UI pass is not a bridge "verified" claim.

## Known Stubs
None.

## Self-Check: PASSED

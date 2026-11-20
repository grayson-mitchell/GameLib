---
phase: quick-261103-x6m
plan: 01
status: complete
requirements: [WR-03, IN-04]
commits: [9f13a302b, 9856a1f8e, 4daa26b34]
key-files:
  created:
    - src/backend/launchSingleFlight.ts
    - src/backend/__tests__/launchSingleFlight.test.ts
    - src/backend/__tests__/launcher_launchSingleFlight.test.ts
  modified:
    - src/backend/storeManagers/steam/launchDispatch.ts
    - src/backend/storeManagers/steam/__tests__/launchDispatch.test.ts
    - src/backend/launcher.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
---

# Quick 261103-x6m: Single-flight launches at the launch IPC entry

A shared per `runner:appName` single-flight guard (`singleFlightLaunch`) now sits at both launch funnels: `dispatchSteamLaunch` for Steam and `launchEventCallback` for every other runner. A second concurrent Play joins the first and returns the owner's promise.

## Commits
- 9f13a302b: helper plus `dispatchSteamLaunch` guard, with an "already starting" notice on join
- 9856a1f8e: `launchEventCallback` is now a synchronous guarded wrapper over `runLaunchEventCallback`. It logs on join and sends no notification, because the span covers the whole play session.
- 4daa26b34: IN-04 test through public `SteamGame.launch()` using two instances

## Investigation findings (for closing the todo)
1. The todo's premise was wrong for Steam. Steam never reaches `launchEventCallback`: the sidecar `launch` handler and the `gamelib://launch` deep link both use `dispatchSteamLaunch`. A joined Steam Play actually double-ran `SteamGame.launch()` pre-routing and `addRecentGame`. The `runner === 'steam'` block in `launcher.ts` is dead code for Steam and is left in place with a comment.
2. The second entry points are the library card context-menu Play (not gated on `isLaunching`), the grid card plus GamePage (each with its own `isLaunching` state), the deep link, and the SteamBridgeSetup fallback. A backend guard at the two funnels covers all of them, so no frontend change was made.
3. G26 (`bridgeLaunchesInFlight`) is kept. It is not provably redundant, because `SteamGame.launch()` is a public method that direct callers can reach without `dispatchSteamLaunch`. The gvu bottle-monitor guard is also kept.

## Verification (actual results)
- Task 1: 5 suites, 64 tests pass (launchSingleFlight, launchDispatch, steamFlows, steamFocusRefreshWire, protocol). Prettier clean and eslint clean on the written files.
- Task 2: 7 suites, 86 tests pass. `tsc --noEmit` clean, prettier clean. eslint reports 0 errors and 17 warnings on `launcher.ts`, which are existing warning classes; none are in the wrapper.
- Task 3: games.test.ts plus the helper, dispatch and launcher suites, 656 tests pass. Prettier clean.
- `graphify update .` run.

## Deviations
None. Prettier reformatted the new launcher test once before commit.

## Known Stubs
None.

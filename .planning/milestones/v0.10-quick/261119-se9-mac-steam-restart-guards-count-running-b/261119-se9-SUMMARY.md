---
phase: quick-261119-se9
plan: 01
subsystem: steam
tags: [steam, macos, bridge, restart-on-play, adoption]
requires:
  - quick-261118-uma
provides:
  - runningBridgedAppId session-state read
  - Mac Steam restart guards refuse while a bridged session is active
affects:
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - src/backend/storeManagers/steam/gameSessionState.ts
tech-stack:
  added: []
  patterns:
    - launch bookkeeping as a running-game signal, consulted before the Rust read
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/gameSessionState.ts
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/storeManagers/steam/playAdoption.ts
    - src/backend/storeManagers/steam/adoptionStatus.ts
    - src/backend/storeManagers/steam/__tests__/playAdoption.test.ts
    - src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts
    - src/backend/storeManagers/steam/__tests__/adoptionStatus.test.ts
    - src/backend/storeManagers/steam/__tests__/gameSessionState.test.ts
decisions:
  - "Signal is GameLib's own bridgeLaunchBottles + bridgeLaunchesInFlight, lowest numeric appId wins"
  - "Wired into createRestartDeps.readRunningAppId only (not runningPoll.ts); bridged first, then Rust"
  - "gameSession is a required createRestartDeps dep so neither caller can forget it"
metrics:
  duration: ~20 min
  completed: 2026-11-19
status: complete
commits: 3
plan_head_before: bd1bb202798080373915f602f277353ea377fa09
plan_head_after: fffce88fea24b95847093f8aab94a8a6c8007305
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase quick-261119-se9 Plan 01: Mac Steam restart guards count running bridged sessions Summary

Restart-on-Play and "Restart Steam now" on macOS now refuse while a bridged (bottled) game GameLib launched is active, using GameLib's own launch bookkeeping (`runningBridgedAppId`) consulted before the Rust running read.

## What changed

- `runningBridgedAppId(session)` in `gameSessionState.ts` returns the lowest positive appId across `bridgeLaunchBottles` and `bridgeLaunchesInFlight`, or 0. JSDoc records why launch bookkeeping beats a wine scan, helper, HELLO marker, engine ledger or monitor phase, and the per-boot limit.
- `createRestartDeps` (`macSteamAdoption.ts`) takes a required `gameSession` dep; `readRunningAppId` returns the bridged id first (logging `[Steam] bridged session for game N is active; ...`) and skips the Rust IPC, otherwise falls through to `readMacRunningAppId` unchanged. `restartSteamForAdoption` is untouched: its existing game-running branch is the refusal.
- `playAdoption.ts` and `adoptionStatus.ts` pass `gameSession: deps.steamSession.gameSession`.
- Tests: tracer case in `playAdoption.test.ts` (Avernum 5 / 206040 in `GameLibSteamBridge-206040`, failed RED with `launched`, then passed), 8 signal cases in `gameSessionState.test.ts`, 3 `createRestartDeps` seam cases, 1 "Restart Steam now" case.
- Todo `2026-11-18-mac-steam-restart-ignores-running-bottled-game.md` moved to `completed/` with `ready: live-gate` and a Resolution section; live check pending for the operator.

## Commits

- `564c1cec5` fix: signal, deps wiring, harness edits, tracer test
- `b3f7e53fe` test: unit tests for the signal and both refusals
- `fffce88fe` docs: todo resolved, live check pending

## Verification

- Four target suites: 131 passed, 0 failed (HEAD 118; plan expected >= 129; the signal's non-positive-key case is an `it.each` of 3).
- Regression suites (games, pollsRustBranch.uninstallRunning, adoptionReplay): 748 passed, unchanged.
- `pnpm codecheck` exit 0; eslint 0 errors (7 pre-existing warnings); prettier --check clean over the written TS files; `backend-di-ceilings` PASS at jestMock=1876 (no new `jest.mock`); `planning-gates` 12/12.
- Prettier check omitted for the todo paths: `.planning/` is prettier-ignored.

## Deviations from Plan

None - plan executed exactly as written. (Test count is 131 rather than the plan's 129 because the non-positive-key case is parameterised over three keys.)

## Known Stubs

None.

## Threat Flags

None. T-se9-01 is mitigated by the tests pinning refusal for recorded and pre-flight sessions with no `steam://exit` fired.

## Live check pending

Operator live check is recorded in the resolved todo (run a bridged game, press Play on a pending native game, expect refusal and an unchanged steam_osx pid; restart `pnpm tauri:dev` first because dev does not rebuild the sidecar).

## Self-Check: PASSED

All three commits are ancestors of HEAD; all modified files exist.

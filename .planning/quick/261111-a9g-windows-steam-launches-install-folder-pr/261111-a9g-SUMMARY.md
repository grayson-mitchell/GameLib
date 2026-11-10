---
phase: quick-261111-a9g
plan: 01
subsystem: steam-launch
tags: [steam, windows, launch-watch, running-poller]
requires: [quick-261111-9mj, quick-261111-7wo, quick-261111-9p6]
provides: [win32 install-folder launch watch, RunningPoll.hold/release claim]
affects: [steamLaunchWatch, runningPoll, steamLaunchedDeps, gameLaunch]
key-files:
  modified:
    - src/backend/storeManagers/steam/steamLaunchWatch.ts
    - src/backend/storeManagers/steam/steamLaunchedDeps.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/library/runningPoll.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
    - src/backend/storeManagers/steam/__tests__/library.runningPoll.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - .planning/todos/pending/2026-11-11-revive-steam-runningappid-poller-under-tauri.md
decisions:
  - "win32 watch owns a GameLib-launched game's status; the poller holds silent via a claim"
  - "RunningAppID read gates each PowerShell scan; process.kill(pid,0) liveness while running"
metrics:
  tasks: 3
  completed: 2026-11-11
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: 79ac86c96bc1b38864a26de522be6328ee787423
plan_head_after: 43724c7b8865e7096fc8985cc54c23331af709bd
---

# Phase quick-261111-a9g Plan 01: Windows Steam launches install-folder process watch Summary

On Windows a GameLib-launched Steam game now returns to Play about 0.5-1.7 s after its exe exits, via a RunningAppID-gated install-folder watch that owns the game's status while the RunningAppID poller holds silent through a claim-bound hold/release.

## Commits

- `16c91357d` feat: win32 install-folder launch watch (Task 1, tracer)
- `6c70b7a85` feat: the win32 watch owns its game status; poller hold/release claim (Task 2)
- `43724c7b8` docs: poller todo records the Windows live-gate pass and the a9g operator check (Task 3)

## Step 0 baselines (before any edit; matched the plan)

- `steamLaunchWatch.test.ts` + `library.runningPoll.test.ts`: 7 failed (T1, T2, T3, T7, T8, T9, T10: POSIX fixtures, pre-existing), 30 passed.
- `games.test.ts -t "261111-9mj|SteamGame.stop"`: 25 passed.
- `pnpm backend-di-ceilings`: PASS moduleState=233 childProcess=1 jestMock=2363.

## Decisions as built (P-01 to P-08)

- P-01: win32 reuses 9p6's constant PowerShell CIM listing through `scanSteamLaunchedPids`; scans only at the search and confirm points.
- P-02: running-phase liveness is `process.kill(pid, 0)` through injected `pidAlive` every 500 ms (`alivePollMs`); EPERM counts as alive.
- P-03: when every tracked pid is dead, one confirm scan: non-empty becomes the new tracked set (launcher -> game, self-restart), empty sends `done`; failed confirm scans cap at `maxScanFailures` (10) then send `done`.
- P-04: each 2000 ms start tick reads RunningAppID (injected `readRunningAppId`) and scans only when it equals the appId; 5 empty scans while Steam reports it hand back with no status. 90 s start window unchanged. `psTimeoutMs` defaults to 15000 on win32.
- P-05: `RunningPoll.hold(appId)` returns a claim-bound release (acts once, stale releases are no-ops). `release(true)` drains (silent until a different RunningAppID, or `playing` after `drainMs` = 20 s if the appId persists); `release(false)` deletes the claim and sends `playing` at once if the poller already reads the appId. The watch takes the hold synchronously at start (win32 only) and releases in `finally` with `doneSent || cancelled`.
- P-06: darwin/linux untouched (9mj `pollerReports` hand-off, posix scans); 7wo C1/C2 pass unmodified; posix watch tests fail only their recorded Windows-local baseline.
- P-07: `stopSteamLaunchedGame.ts`, `runningFromFolder.ts` and `games.ts` are unchanged (`git diff --stat` empty for all three).
- P-08: Stop todo in `completed/` untouched. The poller todo is `platform: macos`, `ready: live-gate`, with the Windows PASS timings and the a9g operator check appended.

## Exact wire sequences (pinned by tests C3/C4/C6/C7)

- Normal quit (win32): hand-off `launching`/`done` (9mj, unchanged), then watch `playing`, watch `done`. The poller sends nothing, including after Steam clears RunningAppID.
- Stop: watch `playing`, then stop `done` (stop() cancels the watch, release(true), the poller stays silent).
- Handover (5-empty-scan bail while Steam reports the appId): `poller playing` at release, then `poller done` at X -> 0.
- Self-heal (watch `done` but RunningAppID persists past 20 s): `watch playing`, `watch done`, `poller playing`, then `poller done` at X -> 0.

## Test results per verify block

- `library.runningPoll.test.ts`: 29 passed (incl. H1-H6, C1, C2 unmodified, C3, C4, C6, C7).
- `steamLaunchWatch.test.ts`: the (a9g) tests W1-W8 all pass; the full file fails exactly the recorded baseline set T1, T2, T3, T7, T8, T9, T10 (7 failed, T6 replaced by W1-W5).
- `games.test.ts -t "261111-9mj|SteamGame.stop"`: 25 passed (G2 flipped to "G2 win32 launch starts the watch too (quick 261111-a9g)").
- `stdinEofRelease.test.ts`: 11 passed. `bootstrap.test.ts -t "running-game poller"`: 1 passed.
- Seven named 9p6 win32 Stop tests (`stopSteamLaunchedGame.test.ts -t win32`): 7 passed, run after Task 2 and again after Task 3.
- `npx tsc --noEmit`: clean. `pnpm backend-di-ceilings`: PASS moduleState=233 childProcess=1 jestMock=2363. `node meta/steamLineCeiling.cjs`: PASS (gameLaunch.ts 995 lines). `pnpm planning-gates`: 12/12 passed.
- prettier `--check` over every written `src/` path: clean (applied `--write` where it flagged formatting). eslint: 0 errors; the remaining warnings are pre-existing (the i18next/games.test.ts set, `runningPoll.ts` VDF `any`, one `require-await` in the old `build` helper).

## Open operator check (recorded in the poller todo; not a gate on its closure)

On Windows, in one session:
1. Restart `pnpm tauri:dev` so the sidecar bundle postdates the a9g commits.
2. Launch WazHack from GameLib; Playing appears about 1.5-3.5 s after the window.
3. Quit timing: quit in-game; the card returns to Play within about 1-2 s; the poller's later `stopped (status owned by launch watch)` causes no flicker.
4. Stop regression re-check: launch again and Stop; the game closes, the card returns to Play, Steam keeps running, no flicker.

## Deviations from Plan

None - plan executed exactly as written. One trivial note: `gameLaunch.ts` Windows guard removal only; the `isWindows` import is still used at the protocol-URL choice.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, spawn sites or module state; probes go through the injected runner.

## Self-Check: PASSED

Commits 16c91357d, 6c70b7a85 and 43724c7b8 exist; all edited files exist; untracked `.planning/debug/*`, `.planning/milestone.lock` and other quick dirs were left alone.

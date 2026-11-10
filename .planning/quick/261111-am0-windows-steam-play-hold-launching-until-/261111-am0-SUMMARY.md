---
phase: quick-261111-am0
plan: 01
subsystem: steam-launch-watch
tags: [windows, steam, launching, launch-watch, gameStatusUpdate]
requires: [quick-261111-a9g]
provides: ["win32 Launching held from the steam:// hand-off until the a9g watch detects the game"]
affects: [src/backend/storeManagers/steam/steamLaunchWatch.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/steamLaunchWatch.ts
    - src/backend/storeManagers/steam/__tests__/library.runningPoll.test.ts
    - src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "Extend the a9g win32 watch (no separate hold module): gameLaunch.ts, runningPoll.ts, steamLaunchedDeps.ts, games.ts and the frontend are untouched"
status: complete
commits: 3
plan_head_before: 7dcd61e0133a6f5994932e81acda65c4b3dbffa1
plan_head_after: 5e27c2158e9bf859236e4609cb1f3a079d5f7708
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
---

# Phase quick-261111-am0 Plan 01: Windows Steam Play holds Launching Summary

On win32 the a9g launch watch now sends `launching` in the same synchronous turn as its poller claim, and a fallback `done` when it ends having shown Launching but never Playing, so the button no longer drops back to Play when the `launch` IPC resolves.

## Commits

- `9a1ee949c` feat: watch change (P-03/P-04/P-05), docstring wire, C3/C4/C6/C7 + W1-W8 expectations, new C8/C9 (Task 1, tracer)
- `eb175bdc3` test: A1-A8 unit matrix (Task 2)
- `5e27c2158` test: G6/G7 failed hand-off starts no watch (Task 3)

## Test results

Baselines were taken before any edit (jest, this Windows box). Baseline (c) was taken against the HEAD `steamLaunchWatch.ts` (the edit was swapped out for that one run and restored).

| Suite | Baseline | After |
| --- | --- | --- |
| library.runningPoll.test.ts | 32 passed (a9g recorded 29) | 34 passed (C8, C9 added) |
| steamLaunchWatch.test.ts | 7 failed / 14 passed of 21: T1, T2, T3, T7, T8, T9, T10 (pre-existing POSIX-fixture failures) | the same 7 failed / 23 passed of 30 (W1-W8 updated, A1-A8 plus A3b added) |
| games.test.ts (full file) | 28 failed / 697 passed of 725 | 28 failed / 699 passed of 727 (G6, G7 added); failure name set byte-identical to baseline |

Gates: `npx tsc --noEmit` 0 errors; `pnpm backend-di-ceilings` PASS (no shard change, no `jest.mock` added); `node meta/steamLineCeiling.cjs` PASS, `gameLaunch.ts` still 995 lines; `pnpm find-deadcode` PASS; `pnpm planning-gates` 12/12; prettier clean and eslint 0 errors on all four paths. The only eslint warnings are pre-existing (runningPoll.test.ts:171, and games.test.ts, none in the new lines).

The full-suite regression risk named in Task 3 (real un-spied win32 watch sending `launching` through the mocked `sendGameStatusUpdate` in games.test.ts) did not appear. No games.test.ts assertion needed changing, and no test was weakened.

## P-01 to P-09 as built

- **P-01** Recorded below as a correction; a9g's artifacts were not edited.
- **P-02** Built as an extension of `steamLaunchWatch.ts` only. `sendStatus` widened to `'launching' | 'playing' | 'done'`, the one interface change.
- **P-03** Right after the registry set and `pollerHold` claim, if `win && !pollerReports(appId)`: `launchingSent = true`, `entry.shown = true`, `sendStatus('launching')` in try/catch (warn on throw). Already running (poller reports) sends nothing. The `already-watching` path is untouched.
- **P-04** `playingSent` is set where the search loop sends `playing`. In `.finally`, after `releasePoller?.(doneSent || cancelled)`, a `done` is sent when `win && launchingSent && !playingSent && !doneSent && !cancelled && !pollerReports(appId)`, with the log line `appId <id>: not detected running; ending Launching`. It touches neither `doneSent` nor the release argument.
- **P-05** `reassert = false` beside the search loop's `playing`, so a relaunch during Launching does not produce a duplicate `playing` (A3b).
- **P-06** Order is by construction: claim silences the poller, one sequential async flow for the watch's frames, A4 pins release-before-done, C6/A5 pin the hand-back suppression.
- **P-07** `runPosix` is untouched. No new timer, probe or interval. The listed files are byte-identical (`git diff --stat` over the plan commits shows only the four plan paths).
- **P-08** No frontend change.
- **P-09** Known limit kept as planned: an unresolvable install folder gives `launching` then immediate `done` (A6), matching today's drop back to Play, and the poller reports the game later because the claim is released with `false`.

## Correction to a9g (P-01)

a9g's PLAN and SUMMARY describe a "launcher `launching`, launcher hand-off `done` (unchanged since 9mj)" in the Windows wire. No such frames exist: Steam launches go through `dispatchSteamLaunch` and never reach `launcher.ts`'s `launchEventCallback`, and `launchDispatch.ts` sends no status. Before this plan, Launching showed only through the frontend click latch, released in a `finally` when the IPC resolved, right after `openExternal`. a9g's own tests (C3/C4/C6/C7) never pinned those frames either.

## Windows wire sequences (from watch start)

- Normal: [watch launching, watch playing, watch done]; the poller is silent under the claim (C3).
- Stop during Launching: [launching, stop done] (A2, C4 with playing).
- Never detected within the 90 s window (also no folder, unexpected error, 5-empty-scan bail with the poller not reading the appId): [launching, done] (C8, W3, W4, A6, A7).
- Already running at Play: no `launching`; [poller playing, watch playing, watch done] (C9, A1).
- Hand-back when the poller already reads the appId: [launching, poller playing], no `done` (C6, A5).
- Relaunch during Launching: one watch, one `launching`, no stacked timer, the window restarts (A3, A3b).

## Deviations from Plan

1. **[Rule 1 - Test construction] A7 trigger.** The plan said a rejecting `getSteamLibraries` gives one warn plus `['launching','done']`. `resolveSteamLaunchedInstallFolder` catches that rejection itself and returns no folder (no warn), so that path is the A6 no-folder case. A7 instead rejects `readRunningAppId`, which reaches `run()`'s `.catch` (one warn) and then the fallback `done`. The watch code is unchanged by this.
2. **A3 timing.** The restarted 6000 ms window ends at the next 2000 ms search tick (t = 10000), not "about 9000 ms"; the test advances to t = 10500.
3. **Commit split.** Because A1-A8 live in the same file as the W updates, the A block was temporarily removed to commit Task 1 on its own, then restored for Task 2.
4. **Counts differ slightly from the plan's recorded a9g numbers** (runningPoll baseline 32, not 29); the baseline here is what was measured.

No auth gates. No stubs. No threat flags (no new network, auth, file or schema surface).

## Open live gate (operator, not claimed verified)

Restart `pnpm tauri:dev` so the sidecar bundle postdates these commits, then follow the plan's six-step Human live gate on WazHack 264160: Launching held from click to Playing with no flash of Play (GamePage and Library card); quit in game returns to Play within about 1-2 s; with Steam quit, Launching holds while Steam starts, and past 90 s returns to Play with the log `not detected running; ending Launching`; Play while already running shows no Launching flash.

## Self-Check: PASSED

- Files modified exist and the three commits (`9a1ee949c`, `eb175bdc3`, `5e27c2158`) are present on main.
- `commits: 3` measured from the persisted ledger (`git rev-list --count 7dcd61e01..HEAD`).

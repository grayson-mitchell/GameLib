---
phase: quick-261119-p3z
plan: 01
subsystem: steam-launch
tags: [steam, launch-watch, macos, linux, launching-status]
requires:
  - quick 261111-am0 (win32 Launching hold in steamLaunchWatch)
provides:
  - posix `launching` status from the Steam launch watch
  - launchingDecided: bounded promise the launch IPC awaits
affects:
  - src/backend/storeManagers/steam/steamLaunchWatch.ts
  - src/backend/storeManagers/steam/steamLaunchedDeps.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/playAdoption.ts
tech-stack:
  added: []
  patterns: [bounded decision promise, injected-clock unref'd timer]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/steamLaunchWatch.ts
    - src/backend/storeManagers/steam/steamLaunchedDeps.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/playAdoption.ts
    - src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/playAdoption.test.ts
key-decisions:
  - "Posix reuses the am0 decideLaunching path (P-02); no second mechanism"
  - "The launch IPC awaits launchingDecided, bounded by decideWaitMs (1000 ms) (P-03)"
  - "Relaunch during Launching re-sends nothing (P-06)"
status: complete
commits: 2
plan_head_before: 043d5483cbc42f96f8da18096c581a2a2f559868
plan_head_after: 7508b0858babea37b9b465922e476361f7c96557
actuals:
  tokens: 5000
  tasks: 2
  commits: 2
metrics:
  duration: ~25 min
  completed: 2026-11-19
---

# Phase quick-261119-p3z Plan 01: macOS/Linux Steam Play holds Launching until the game is found Summary

The Steam launch watch now sends `launching` on macOS and Linux as it starts, and the `launch` IPC waits (bounded to 1000 ms) for that decision, so the Play button holds Launching from the click until the watch finds the game.

## Commits

- `d02b10267` feat(quick-261119-p3z): posix Steam launch watch holds Launching until the game is found (steamLaunchWatch.ts, steamLaunchWatch.test.ts, games.test.ts startSpy field)
- `7508b0858` feat(quick-261119-p3z): launch IPC waits for the watch's launching decision (steamLaunchedDeps.ts, gameLaunch.ts, playAdoption.ts, G8, playAdoption ordering test)

## Posix wire sequences

- Normal: [launching, playing, done]
- Stop during Launching: [launching, stop's done] (watch sends nothing more, no fallback)
- Not detected (start window, no install folder, unexpected error, `pollerReports` throw): [launching, done]
- Already running at Play (poller reports the appId): no `launching`; nothing sent at all
- Linux hand-back (poller reports the appId after `launching`): [launching, playing] from the watch's terminal fallback
- Relaunch during Launching: one watch, no second `launching`, no `playing` before the game is found, start window restarts
- Relaunch after Playing: `playing` re-asserted (unchanged)

## Findings

**P-03 ordering.** Production `pollerReports` is always async (`rustPollerReports` is a `requestRustInvoke` round trip). `gameLaunch.ts` used to return `true` in the same turn the watch started, so the IPC result frame went out before the `launching` frame and the latch dropped onto Play for at least one render (the flicker). The fix is `launchingDecided`: it settles when `launching` was sent or skipped, on cancel, on finish, or after `decideWaitMs`, and never rejects. `watchSteamLaunch` returns it and both rungameid callers (`gameLaunch.ts`, the adoption-restart branch of `playAdoption.ts`) `await` it. This also restores am0's ordering on win32, which Phase 80's async claim had deferred past the IPC result.

**P-06 departure from the brief.** The brief asked for a fresh `launching` on relaunch-before-shown. That is not sent: `libraryState.ts:327-334` keeps the current status and a duplicate is a no-op, `launching` is held until `done`/`error`, the frontend `launch` helper writes no status, and the Play button is disabled while launching, so the status is still `launching` when any latch drops. `noteRelaunch` instead gates `reassert` on `playingSent` (behaviour-identical on win32). P7 pins it.

**P-09 trade-off (flag for the user).** A posix Play whose game never starts now shows a disabled Launching button until the 90 s start window ends, then returns to Play (it used to drop to Play at once). A Steam cold start plus game start that takes longer than 90 s ends Launching -> Play with no later Playing on macOS, where the poller is silent; the watch already ended at 90 s before this change.

## Implementation notes

- `steamLaunchWatch.ts`: the `if (win)` gate around `decideLaunching` is removed; posix detection in `runPosix` keys on `playingSent` instead of `entry.shown` (four reads); the posix `done` sends go through `sendDone()`; the `.finally` fallback is platform-neutral (posix sends `playing` when the poller reports the appId); `whenPollerReports` treats a synchronous throw as `false`; header wire description rewritten for both platforms.
- The one new timer (decide bound) comes from the injected clock with no `keepAlive` (unref'd), is armed only while a decision is pending, and is cleared on decide/cancel/finish. P5 asserts `assertNoKeepAlive`.
- `games.ts`, every frontend file, `runningPoll` and the Rust poller are untouched. No win32 test body was edited; W8 (a darwin test) changed only its `sent` expectation.

## TDD results

Red before / green after:

- Task 1: with the updated T-series and new P1-P10 against the unmodified watch, `steamLaunchWatch.test.ts` ran 23 failed / 23 passed (T1-T5, W8, T7-T10b, T12, T13, P1, P3, P5-P10 red; P2 and P4 passed trivially at HEAD since `launchingDecided` was awaited as undefined). After the change: 46/46 pass; win32 tests passed before and after.
- Task 2: G8 and the playAdoption `launchingDecided` ordering test were both red at HEAD (2 failed / 751 passed), green after.
- Final: `steamLaunchWatch` + `games` + `playAdoption` suites: 799 passed, 0 failed. `npx tsc --noEmit` exit 0. `eslint --quiet` 0 errors over all touched files. `prettier --check` clean over all eight written paths (all `ignored: false`).
- Gate greps: `launchingDecided` in the watch 7 (>=2), `decideWaitMs` 6 (>=2), stale header phrase 0, test titles 46 (>=46), win32 titles 21 (>=21), `launchingDecided` in games.test.ts 2, awaited calls in gameLaunch/playAdoption 1/1, `launchingDecided` in steamLaunchedDeps 1, G titles 8.
- `meta/backendDiCeilings.cjs`: 4 FAIL lines, all pre-existing and unrelated (launchWithoutSteam.test.ts, NoticeStack.test.tsx, NativePortInfo.test.tsx, LaunchWithoutSteam.test.tsx); none name a touched file.

## Deviations from Plan

None - plan executed as written. (T5's `b` arm also asserts `['launching', 'done']`, per the plan's "both arms".)

## Known Stubs

None.

## Threat Flags

None.

## After-change housekeeping

`graphify update .` ran (graphify-out is not tracked). `pnpm build:sidecar` ran so the live check picks up the change. The user must restart `pnpm tauri:dev` (never `tauri:dev:run`).

## Post-fix human check: pending

Operator to run on macOS:

1. Restart `pnpm tauri:dev`; confirm sidecar.js mtime is newer than commit `7508b0858`.
2. Bastion (107100), GamePage: press Play. Expected: the button reads Launching continuously with no Play frame between the click and the game, then Playing/Stop once the game window is up. gamelib.log shows `watching Steam-launched appId 107100`, then `appId 107100 running: pids [...]`.
3. Press Stop. Expected: the game exits and the button returns to Play.
4. Optional: repeat from the Library card.
5. Informational (P-09): a launch that never starts holds Launching until the 90 s window ends, logs `not detected running; ending Launching`, then returns to Play.

## Self-Check: PASSED

- Files present: steamLaunchWatch.ts, steamLaunchedDeps.ts, gameLaunch.ts, playAdoption.ts and the three test files (verified by git commits d02b10267, 7508b0858).
- Commits present on HEAD: d02b10267, 7508b0858.

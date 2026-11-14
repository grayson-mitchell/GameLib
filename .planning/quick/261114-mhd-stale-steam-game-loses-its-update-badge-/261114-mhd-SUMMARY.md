---
phase: quick-261114-mhd
plan: 01
status: complete
subsystem: frontend-state
tags: [diagnostics, gameUpdates, steam]
key-files:
  modified:
    - src/frontend/state/libraryState.ts
    - src/frontend/state/__tests__/libraryState.test.ts
---

# Quick 261114-mhd: gameUpdates drop instrumentation Summary

Instrumentation only: every frontend write that shrinks `gameUpdates` now emits one permanent `[gameUpdates] dropped` line (handleGameStatus and refresh paths), and tests pin the stale Steam launch-status sequence keeping its badge. The todo `.planning/todos/pending/2026-11-13-stale-game-loses-update-badge-after-play.md` stays pending until the captured log names the cause and a fix lands. Badge semantics and the refresh() stale-snapshot race are unchanged.

## Changes
- `refresh()` takes an optional 4th `origin` arg (refreshLibrary passes it through) and logs `[gameUpdates] dropped appIds=... path=refresh origin=... runner=... checkUpdates=... source=... snapshotStale=...`.
- `handleGameStatus` (updating -> done/error) logs `[gameUpdates] dropped appIds=... path=handleGameStatus prior=... new=... runner=...`.
- Tests: launch sequences (launching/playing/done and steam-starting/engine-download variant) keep '1782460' with no drop line; updating->done drop line; three refresh drop-log cases.

## Deviations
- [Rule 3] Existing refreshLibrary tests asserted exact refresh() args; updated them to include the new origin arg (`'mount'`, `'unknown'`, `'update-check-rerun'`).
- Both tasks landed in one commit (tests share the file and the hot-path logInfo mock).

## Results
jest libraryState.test.ts: 51/51 pass. Scoped prettier, eslint (0 errors, pre-existing warnings) green. `tsc --noEmit` has pre-existing errors in unrelated backend files (downloadqueue.ts, recovery.ts, legendaryRuntime.test.ts); none in libraryState files. Launch-sequence tests passed, so the frontend reducer itself does not drop the badge on a launch sequence.

## Live repro
Restart the app with `pnpm tauri:dev` (never `tauri:dev:run`; no sidecar rebuild needed, frontend-only change), play stale Hell Clock 1782460 via the launch prompt's Play anyway, quit the game, confirm whether the badge is gone, then run:

`grep '\[gameUpdates\] dropped' ~/Library/Logs/gamelib/gamelib.log` (plus the surrounding `[refreshLibrary] runner=... origin=...` lines).

## Reading the result
- `path=handleGameStatus prior=updating`: something emitted 'updating' for the game during launch.
- `path=refresh source=checkGameUpdates`: the backend check (detectSteamUpdates) omitted the app.
- `path=refresh source=start-snapshot... snapshotStale=true`: the stale-snapshot race clobbered a newer write.
- No line while the badge is gone: the loss is not in the frontend store (e.g. render/selection or localStorage seeding).

## Self-Check: PASSED

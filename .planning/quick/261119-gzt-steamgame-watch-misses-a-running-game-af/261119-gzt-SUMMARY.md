---
phase: quick-261119-gzt
plan: 01
subsystem: steam
tags: [steam, launch-watch, stop, process-scan, macos, linux, lsof]
requires: []
provides:
  - shell-launcher rule in psOutputPidsInFolder
  - psOutputRelativeArgvPids and lsofExecutablePaths (pure, exported)
  - relative-argv resolution by executable path in findPidsRunningFromFolder (darwin lsof txt, linux readExe)
affects:
  - src/backend/storeManagers/steam/steamLaunchWatch.ts (behaviour, no source change)
  - src/backend/storeManagers/steam/stopSteamLaunchedGame.ts (behaviour, no source change)
tech-stack:
  added: []
  patterns:
    - admit a process by kernel-reported executable path, never by argv text
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/runningFromFolder.ts
    - src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
    - src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts
    - .planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md
decisions:
  - "Relative-argv processes are resolved by executable path (lsof -d txt on darwin, /proc exe on linux), not by parent-chain inference or a new Rust op"
  - "lsof failure degrades to the argv matches; only a ps failure throws"
status: complete
metrics:
  duration: ~25 min
  completed: 2026-11-19
commits: 3
plan_head_before: a652521a5ef47fc83ceebd43e3ebe5ef8307d7b4
plan_head_after: f08e264a26275a40512266c5a39f67aa5b6e63fb
actuals:
  tokens: 6300
  tasks: 3
  commits: 3
---

# Phase quick-261119-gzt Plan 01: Shell-launched Steam game missed by the launch watch Summary

The launch-watch and Stop scan now finds Mac games started by a shell launcher (Bastion 107100): the bash launcher is admitted by a shell-launcher rule, and a relative `./Game.bin.osx` child is admitted by its real executable path (one bounded `lsof -d txt` on darwin, `/proc/<pid>/exe` on linux).

## What was done

- **Task 1 (tracer), commit 362934e4f.** Added T12 and T13 to `steamLaunchWatch.test.ts`, then changed only `runningFromFolder.ts`: `SHELL_LAUNCHER` rule in `psOutputPidsInFolder`, exported `psOutputRelativeArgvPids` and `lsofExecutablePaths`, optional `readExe`/`realpath` on `PidScanDeps`, and `resolveRelativeArgvPids` called from `findPidsRunningFromFolder`. Doc comments updated.
- **Task 2, commit 8b5b07cd7.** Added 32 matcher/scan unit cases to `runningFromFolder.test.ts`: shell-rule positives and negatives, relative-argv candidates, lsof parsing, darwin lsof gating (no lsof without candidates or when the only candidate is excluded), realpath, exe-outside-folder rejection, lsof code 1 parsed, timedOut / code 2 / truncated / throwing lsof degrading to the direct matches, ps failure still rejecting, linux readExe (with and without ` (deleted)`) and no lsof on linux.
- **Task 3, commit f08e264a2.** `git mv` of the todo from `pending/` to `completed/` with a `## Resolution` section; `pnpm planning-gates` 12/12.

## Evidence for the root cause (HEAD results, before the source change)

- **T12 (relaunch bookkeeping): PASSED at HEAD**, before any source change. `noteRelaunch()` does reset the start window; it is not at fault. This matches the 92 s bail timing in the log.
- **T13 (Bastion script-launched shapes): FAILED at HEAD** with `sent []` (expected `['playing']`), because neither `/bin/bash <folder>/...` nor `./Bastion.bin.osx` starts with the folder. After the fix T13 passes: `sent` is `['playing']` then `['playing', 'done']`, the log line is `appId 107100 running: pids [501, 502] under /lib/steamapps/common/Bastion`, and every lsof call's argv is exactly `-a -nP -p 502 -d txt -F pn` (501 is a direct match, 900 is excluded).

## Verification (final)

- `npx jest` over steamLaunchWatch, runningFromFolder, stopSteamLaunchedGame and fakeHomeIsolation: 4 suites pass, 133 passed, 1 skipped (baseline was 99 passed, 1 skipped).
- `npx tsc --noEmit`: exit 0.
- `npx prettier --check` and `npx eslint` clean over the three source/test paths.
- `pnpm planning-gates`: 12/12. The todo paths are prettier-ignored, so no prettier check was run on them.
- `runningFromFolder.ts` is 407 lines (240 at plan time), under the 1000 ceiling.

## Deviations from Plan

**1. [Ordering] Linux resolution implemented in Task 1, not Task 2.**
- **Found during:** Task 1.
- **Issue:** the plan left the linux arm to Task 2 after a red phase. `resolveRelativeArgvPids` handles both platforms in one function, so splitting it would have meant writing a stub only to replace it.
- **Fix:** the linux branch landed in the Task 1 commit (362934e4f). Task 2's linux cases therefore passed on first run rather than failing first. The darwin shell-rule, lsof gating and degradation cases are covered by T13 failing at HEAD and by the new unit tests; the linux cases have no recorded red run.
- **Files modified:** src/backend/storeManagers/steam/runningFromFolder.ts
- **Commit:** 362934e4f

No other deviations. Neither `steamLaunchWatch.ts` nor `stopSteamLaunchedGame.ts` was edited, as planned.

## Known Stubs

None.

## Threat Flags

None. The only new process spawn is `/usr/sbin/lsof` through the runner (argv array, integer pids, no env, bounded by the scan timeout, never with an empty list), as in the plan's threat model.

## Post-fix human check

**passed** 2026-11-19 (operator). Detection and Stop confirmed in gamelib.log (pids [17140, 17144]); the missing Launching step it surfaced was fixed in quick 261119-p3z. Steps run:
1. Restart with `pnpm tauri:dev`; confirm `sidecar.js` is newer than 362934e4f (dev does not rebuild the sidecar).
2. Play Bastion (107100): the button shows Playing, and gamelib.log has `SteamGame.watch: appId 107100 running: pids [<bash pid>, <Bastion.bin.osx pid>] under .../steamapps/common/Bastion`.
3. Stop: Bastion quits, gamelib.log has `SteamGame.stop: stopping Steam-launched appId 107100: SIGTERM pids [...]`, and the button returns to Play.
4. Optional: press Play again before the game window appears; no second `watching` line, and Playing still shows once the game is up.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/runningFromFolder.ts, both test files, the completed todo; the pending todo is gone.
- FOUND commits: 362934e4f, 8b5b07cd7, f08e264a2 (all ancestors of HEAD).

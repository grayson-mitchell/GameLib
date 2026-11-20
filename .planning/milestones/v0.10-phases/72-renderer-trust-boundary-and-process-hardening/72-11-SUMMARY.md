---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 11
subsystem: backend-process-control
tags: [process-kill, tracked-pid, security]
requires: [72-09]
provides: [trackedChildren registry, PID-based stop/quit kills]
affects: [handleExit, sideload/nile/legendary stop]
key-files:
  created: [src/backend/trackedChildren.ts, src/backend/__tests__/trackedChildren.test.ts]
  modified: [src/backend/launcher.ts, src/backend/utils.ts, src/common/types.ts, src/backend/storeManagers/sideload/games.ts, src/backend/storeManagers/nile/games.ts, src/backend/storeManagers/legendary/games.ts, src/backend/storeManagers/storeManagerCommon/games.ts]
key-decisions:
  - "Registry keyed by ChildProcess; auto-untrack on close/error; no timers, no detached"
  - "Added CallRunnerOptions.trackKey so sideload (no app name in argv) can be matched"
requirements-completed: [D-13]
completed: 2026-11-08
---

# Phase 72 Plan 11: Tracked-PID kills Summary

Quit and stop now kill only children this sidecar spawned (SIGTERM, or `taskkill /PID /T /F` on Windows) via a small `trackedChildren` registry; `killPattern` and every `pkill` string are gone, with a source-pin test.

## Commits
- 9e1914683: registry, callRunner/runWineCommand hooks, tests
- dfac5a382: four call sites switched, killPattern deleted, mocks and comments reworded

## Spawn-key mapping
| Store | Registered at | runner / key | Killed by |
|---|---|---|---|
| legendary | callRunner | legendary / abortId (= appName parsed from argv) | legendary stop(): runner legendary, key this.appName |
| nile | callRunner | nile / appName (last argv part) | nile stop(): runner nile, key this.id |
| gogdl | callRunner | gog / appName | handleExit killAllTracked only |
| sideload native | callRunner via storeManagerCommon launchGame | sideload / trackKey=appName | sideload stop(): runner sideload, key this.id |
| sideload Wine | runWineCommand (trackKey=appName; default installFolderName then prefix) | wine / appName | sideload stop(): runner wine, key this.id, before shutdownWine |

## Behaviour changes (intended)
- handleExit calls killAllTracked(), so tracked runWineCommand children (games) are also SIGTERMed at quit, not only the CLIs (D-20 parity).
- Pitfall 11: a runner this sidecar did not spawn (left over from a prior session) is no longer killed on quit.
- Windows: tracked PID for callRunner is powershell's when the Start-Process wrapper is used, hence the /T tree kill.
- Nile stop() on non-Linux no longer kills every nile process, only this app's.

## Deviations from Plan
- [Rule 3] Added optional `trackKey` to CallRunnerOptions (src/common/types.ts) and two `trackKey: appName` options in storeManagerCommon/games.ts, as the plan allowed. Reworded comments in downloadmanager/utils.ts, platform/index.ts, aborthandler.ts and two test header comments.
- knip baseline needed no change (no findings referenced killPattern).
- Task 1's source-pin test was red until Task 2's commit removed pkill from utils.ts (committed in order; green at HEAD).

## Verification
Jest (trackedChildren incl. fake-HOME real-spawn arm, fakeHomeIsolation, launcher_callRunner, downloadmanager, sideload/nile/legendary, utils): 20 suites pass. codecheck, find-deadcode, boundaries, planning-gates (12/12) green. build:sidecar and smoke:sidecar were not run.

## Self-Check: PASSED

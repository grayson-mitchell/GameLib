---
phase: quick-261105-svg
plan: 01
subsystem: steam-install
tags: [nettop, watchdog, sidecar-exit]
key-files:
  created:
    - src/backend/storeManagers/steam/childWatchdog.ts
    - src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts
  modified:
    - src/backend/storeManagers/steam/steamDownloadMonitor.ts
    - src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts
    - .planning/todos/completed/2026-11-05-orphaned-nettop-after-sidecar-kill.md
metrics:
  completed: 2026-11-05
---

# Quick 261105-svg: Orphaned nettop watchdog Summary

A `/bin/sh` parent-death watchdog now wraps the Steam download monitor's script/nettop child. It polls the explicit sidecar pid every 1s, records script's children each tick, and kills the whole tree on parent death, Steam-pid exit, or TERM/INT/HUP.

## Commits
- bf49c17ab: watchdog, monitor wiring, real-process tests and the env-gated live block (Tasks 1 and 2 share this commit, since the live block was written with the test file)
- 65899b93e: todo moved to completed/ with Resolution (Task 3)

## Live proof (GAMELIB_LIVE_NETTOP=1, real script/nettop pinned to a harness-owned sleep)
- Baseline (no watchdog): did NOT reproduce the orphan. 6s after parent SIGKILL, script was dead and no nettop remained. The SIGPIPE-orphan hypothesis is unconfirmed; the field cause stays inferred.
- Fixed: nettop, script and watchdog gone 123ms after the SIGKILL.
- Real-process tests: hard kill about 1.1s, clean SIGTERM about 150ms, watched-pid exit about 1.1s, middle-dies-first covered.

## Deviations
- [Rule 1 - Bug] The watchdog's cleanup could miss the grandchild when TERM arrived before the first tick had recorded it. Cleanup now re-runs `pgrep -P` before killing.
- Test fixes: inner sh is picked by command (the watchdog also has a short-lived `sleep 1` child); the middle-dies-first test waits 1.5s so one tick has recorded the grandchild.
- Tasks 1 and 2 landed in one commit (shared test file).

## Verification
Watchdog and monitor suites, fakeHomeIsolation, codecheck, prettier (4 paths), eslint (0 errors on touched files) and planning-gates (12/12) pass. Full `pnpm lint` has only pre-existing warnings.

## Not covered
The proof SIGKILLs a throwaway node parent, not the packaged SEA sidecar under Tauri mid-download. The watchdog keys only on the parent pid, so the mechanism is the same.

## Known Stubs
None.

## Self-Check: PASSED

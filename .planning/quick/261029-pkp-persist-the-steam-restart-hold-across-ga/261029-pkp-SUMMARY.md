---
phase: quick-261029-pkp
plan: 01
subsystem: steam
tags: [steam, d-uat-13, persistence, process-identity]
requirements: [D-UAT-13]
key-files:
  created:
    - src/backend/storeManagers/steam/steamRestartHold.ts
    - src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts
  modified:
    - src/backend/storeManagers/steam/steamClientProcess.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
decisions:
  - Persisted record (PID + opaque start-time token) rather than manifest mtime, because mtime cannot tell GameLib's handoff from Steam's own manifest writes.
metrics:
  tasks: 2
  completed: 2026-10-29
---

# Quick 261029-pkp: persist the Steam restart hold across a GameLib restart

The "Restart Steam to finish" hold now survives a sidecar restart while the same Steam process is still running. It is stored as a record (app id, Steam PID, process start-time token) that is re-armed at boot only when that exact process is live.

## Commits
- 16a1b58c6: start-time probe, `steamRestartHold.ts` leaf module, `steam_restart_hold` store
- 74b5ea9ec: library.ts persist/clear/re-arm wiring, tests, todo moved to completed/

## What changed
- `readSteamProcessStartTokens` (ps `lstart` on macOS/Linux, PowerShell `StartTime.Ticks` on Windows). Only safe positive integers are interpolated into args. 15 s execFile timeout.
- `releaseSteamHold()` is the single release path and also clears the record. `stopInstallPolling` clears it when the stopped poll was holding.
- The record is written on arm. It is skipped, with a warning, when no start token is available (the hold still works in memory).
- `rearmPersistedSteamRestartHolds()` runs in `init()`. It makes one `listSteamClientPids` call and one token call for the union of live recorded PIDs. Zero records means zero spawns.
- Fail-closed window: `pendingSteamHoldRearm` makes `isHoldingForSteamRestart` return true during verification. `init()` runs one extra `refreshInstallState` if a reconcile hit the window and a record was dropped or left unverified.
- A restored poll starts with `ticks` set to the elapsed time, so the 6 h cap is measured from the original finalize.

## Verification (real results)
- `npx jest --selectProjects Backend --runTestsByPath` on library, steamRestartHold, steamClientProcess, games and macSteamAdoption tests: 5 suites passed, 848 tests passed.
- `pnpm codecheck`: clean. `pnpm lint`: 0 errors (1130 pre-existing warnings).
- `npx prettier --check` on every touched .ts file: clean.
- Mutation checks, each observed red then reverted: removing the `stopInstallPolling` clear (2 new tests failed), removing the pending-set check (1 failed), removing the token comparison (3 failed).
- `clearSteamRestartHold(` non-comment occurrences in library.ts: 5.

## Deviations
- [Rule 1 - Bug] The first lint run flagged an unnecessary type assertion on `steamPidsAtHandoff`. Fixed before the library.ts commit.
- Task 1 implementation and tests were written together, not strict RED-then-GREEN commits.
- The `unknown` re-arm outcome counts toward the boot reconcile trigger, because that game is also reported installed (fail-open) and could otherwise stay hidden after the fail-closed window.

## Limits
Unit-tested against mocked probes for all three platforms. The live cross-restart case has not been exercised on any OS. `graphify update .` ran.

## Known Stubs
None.

## Self-Check: PASSED
Created files exist and commits 16a1b58c6 and 74b5ea9ec are in git log.

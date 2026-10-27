---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 13
subsystem: steam
tags: [mac-steam, shutdown, boot, gap-closure]
requires: [54-12]
provides:
  - releaseForShutdown(): Promise<MacSteamRestoreOutcome> (logOff then restore)
  - handleExit awaits the release before app.exit()
  - boot-time restoreMacSteamOnlineIfOwed('boot') in sidecar init()
affects: [54-14]
key-files:
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/sidecar/stdinEofRelease.ts
    - src/backend/utils.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/steam/macSteamOffline.ts
metrics:
  tasks: 3
  completed: 2026-10-27
---

# Phase 54 Plan 13: Wire the owed-goonline restore into quit, EOF and boot Summary

The owed Mac Steam goonline is now paid on a routed quit (`handleExit` awaits `SteamUser.releaseForShutdown()` before `app.exit()`), on stdin EOF (`void SteamUser.releaseForShutdown()`), and on every sidecar boot (`void restoreMacSteamOnlineIfOwed('boot')` right after `bindTransport`). `releaseForShutdown` calls `logOff()` first, then returns `restoreMacSteamOnlineIfOwed('shutdown')`, and no longer skips the restore when there is no client.

## Commits
- 514575318 test: mock factories carry restoreMacSteamOnlineIfOwed
- 5e1d0f0f9 test: shutdown release restores (RED)
- 768f3da2e feat: pay the owed goonline on shutdown release
- (test commit) test: quit and boot pay the owed goonline (RED)
- 563c68464 feat: routed quit and sidecar boot pay the owed goonline

## Verification
- sidecar and steam `__tests__` plus fakeHomeIsolation: all pass except the four pre-existing failures listed in deferred-items.md (installFlows, runnerSliceRegistration, testContainment; the fourth listed suite, appShellFlows, was my own test and is fixed).
- `pnpm codecheck` clean; prettier clean on touched files.
- `node meta/findDeadcode.cjs`: used-in-module stays at the baseline of 1 (`WINE_DRIVERS_KEY`). I removed the `ts-prune-ignore-next` on `MacSteamRestoreOutcome` (now imported by user.ts). `MAC_STEAM_OFFLINE_OWED_FILE` and `MacSteamRestoreTrigger` still have no importer outside their module (removing the ignores raised the count to 3), so those two ignores stay.

## Deviations from Plan
- **smoke:sidecar skipped (per session instruction).** `meta/sidecarStartupSmoke.cjs` deliberately passes no `env`, so it runs against the real HOME/appFolder. It could read a real `mac-steam-offline-owed.json` and reach the restore, so isolation could not be confirmed. Not run; the stdin-EOF drain is covered by the unit tests only. Run it manually on a machine with no marker.
- **[Rule 1] Test fix:** the "cancelled quit does not restore" assertion became `not.toHaveBeenCalledWith('shutdown')`, since the boot call legitimately fires in `init()`.
- bootstrap.test.ts spies `bindTransport` on the platform module to assert ordering.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED

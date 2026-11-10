---
created: 2026-11-11T00:00:00.000Z
title: 'Revive the Steam RunningAppID poller under Tauri (it never starts; Windows Steam launches never show Playing)'
area: launch
files:
  - src/backend/storeManagers/steam/library/runningPoll.ts (startRunningPoll ~160, pollRunningOnce ~127)
  - src/backend/storeManagers/steam/library/index.ts (init() ~197 is the only startRunningPoll call)
  - src/backend/sidecar/bootstrap.ts (~1071 notes initStoreManagers is dead under Tauri)
  - src/backend/storeManagers/steam/steamLaunchWatch.ts (pollerReports dep, quick 261111-9mj)
severity: major
platform: windows
ready: live-gate
---

## Problem

The global RunningAppID poller in `runningPoll.ts` never runs. `startRunningPoll()` is called only
from `SteamLibraryManager.init()`, and nothing calls `init()` under Tauri. Under Electron,
`initStoreManagers()` called it, but `initStoreManagers()` is dead now (see the comments at
`sidecar/bootstrap.ts` ~1071 and `protocol.ts` ~164). No retained GameLib log contains
`Steam: started running-game poller`. It has been off since the Tauri move: the shell landed
2026-07-20, and Electron's entry point was deleted 2026-08-29 in `5643c7583`.

What still covers the Playing state:

- macOS/Linux `rungameid` launches: covered by the per-launch install-folder PID watch,
  `steamLaunchWatch` (quick 261111-9mj).
- Bridge and bottled-Steam launches: covered by `bottleProcessMonitor`.
- **Windows Steam launches** (the `steam://launch` verb): nothing covers them. They should never
  reach Playing, so Stop never appears either. This is inferred from the code and not yet seen on a
  Windows machine.

On macOS the poller would not help anyway: `registry.vdf` had no `RunningAppID` key while WazHack
264160 ran (2026-11-11). On Linux, `RunningAppID` has been broken since 2023, so `runningPoll` falls
back to a reaper process scan.

## Solution

- Start the poller at sidecar boot, and stop it at stdin EOF or quit. Do not make it depend on the
  dead `init()`. Keep its timer `unref()`'d, following the sidecar exit contract.
- Check how it coexists with `steamLaunchWatch`. Its `pollerReports` dep makes the watch end quietly
  when the poller reports the same appId. Confirm a game the poller reports gets exactly one
  `playing` and one `done`.
- Decide whether `readRunningAppId()`'s `spawnSync`/`execFileSync` calls (reg.exe on Windows, ps on
  Linux) move onto the injected runner (Phase 66.2), and keep `pnpm backend-di-ceilings` green.
- Windows Stop is a separate gap: `SteamGame.stop()` is still a no-op for these launches there,
  because `runningFromFolder.ts` returns false on win32.

Live gate: on Windows, launch a Steam title from GameLib. Check that the card shows Playing, and
that it returns to Play after you quit from inside the game. On this Mac, check that WazHack 264160
still gets exactly one Playing and one Done, with no flicker between the poller and the watch.

## Status (quick 261111-7wo)

Landed (code, not yet live-gated):

- A dedicated sidecar boot step, `'steam-running-poll'`, starts the poller once per boot. It is
  independent of the dead `init()`, whose start call is removed. gamelib.log should now carry
  `Steam: started running-game poller` at boot.
- The poller is stopped at stdin EOF through a new `stopRunningGamePoll` dep of
  `releaseOnStdinEof`. It is not a loop-holder (its interval is an unref'd clock timer); the stop
  only keeps a post-EOF tick from spawning a probe or writing a frame.
- Tests: a tracer boot test (a booted win32 sidecar turns a scripted RunningAppID change into one
  `playing` and one `done` frame, with no probe at boot), EOF stop tests, and exact-frame
  coexistence tests with the launch watch (poller first, watch first, win32).

Decisions:

- The Solution's runner bullet was stale: `readRunningAppId()` already probes through the injected
  `ProcessRunner` (Phase 66.2), so nothing moved. `pnpm backend-di-ceilings` is unchanged.
- Watch-first wire duplicate, accepted: where both senders can report (a Linux reaper scan, or a
  Mac Steam that ever writes RunningAppID), the wire carries `playing` (watch), `playing`
  (poller), then one `done` (poller). The frontend collapses it to `playing`, `done`
  (`libraryState.handleGameStatus` drops an unchanged status). No cross-sender dedupe was added: a
  shared "last status" would suppress a legitimate `playing` after a `done` sent by another route.
  On Windows and on today's macOS the wire carries exactly one of each.

For the live gate: a reg/ps probe that times out reads as 0, so it would show as a `done` followed
by a `playing` on the next tick. That flicker would come from the poller alone, not from
poller/watch interplay.

This todo stays open, `ready: live-gate`, until the live gate above passes. The Windows Stop gap is
tracked in `2026-11-11-windows-steam-launch-stop-is-a-no-op.md`.

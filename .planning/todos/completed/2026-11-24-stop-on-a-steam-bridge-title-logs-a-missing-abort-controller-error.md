---
created: 2026-11-24T10:00:00.000Z
title: "Stop on a Steam bridge title logs an ERROR: no matching abort controller"
area: launch
files:
  - src/backend/aborthandler/aborthandler.ts (:44, the missing-controller error)
  - src/backend/storeManagers/steam/gameLaunch.ts (the bridge launch that never registers a controller)
severity: minor
platform: macos
ready: code
---

## Problem

In the 87-59 live gate (2026-11-24), pressing Stop on a Steam bridge title (Avernum 6, app id 206060) ended the game
correctly and then wrote this line to `~/Library/Logs/GameLib/gamelib.log`:

`[ERROR][Backend] Aborting not possible. Could not find a matching abort controller for 206060` (`aborthandler.ts:44`)

Stop worked on every Steam bridge title and on the built-in engine; the error is noise written at ERROR level for a normal
action. It hides real errors in a log that users upload.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Find whether the bridge launch should register an abort controller, or whether the Stop path should skip the abort when none
exists, and log at a level that matches what happened.

## Resolution (quick 261128-935, 2026-11-28)

**Cause.** The module is `src/backend/utils/aborthandler/aborthandler.ts` (the `files:` path above is wrong). The call that
missed is `dispatch.kill` (`src/backend/gamedetails/dispatch.ts`), not the launch code: it aborts unconditionally on every
Stop, then runs `getGame(appName).stop()`. Nothing is keyed by a running Steam game's appId on either side of the registry.
The TS map holds bare-appId controllers only for download and maintenance jobs. The bridge launch registers none, by design
(`gameBridgeLaunch.ts`, `gameBridgeWineLaunch.ts`). Rust's table has `wine-<serial>` for every wine run, the
`launch_wine_command` schema has no `abortId`, and no Steam spawn is game-class. So the forward answers `false` and the ERROR
fires on every Stop. What really stops a bridge title is `SteamGame.stop()`'s route-based teardown (`wineserver -k` in the
per-game bottle, quick 261024-urq).

**Decision.** No abort controller for the bridge launch: Stop already has a real mechanism, a controller would be a dummy or a
second kill path, and a bare-appId key would share the key space of the six download and maintenance controllers
(`create` overwrites, `delete` from one job unregisters another). Gating `kill` on `aborts.has(appName)` was rejected too: it
skips the forward to Rust, which would silently drop a needed abort once the Steam launch moves into Rust, and it leaves the
same false ERROR on sideload.

**Change.** `call(id, { ifMissing })` takes `'error'` (default, byte-identical) or `'info'`. Only `dispatch.kill` passes
`'info'`, for every runner, because its abort is best-effort and each store's `stop()` ends the game. The local abort and the
Rust forward still run. A miss writes `No abort controller for <id> - nothing to abort` at INFO, after Rust has answered.

**Callers that keep the ERROR** (a miss there is a defect): `SteamGame.stop()` in-flight depot branch
(`storeManagers/steam/games.ts:619`), `stopCurrentDownload` (`downloadmanager/downloadqueue.ts:542`), the `abort` IPC
(`sidecar/appShellFlowRegistration.ts:499`), the sign-in probe (`signInProbe/pass.ts:273`), the EOS overlay
(`eos_overlay.ts:132`, `:292`), and the stall watchdog and terminal-error branch (`installStallWatchdog.ts:106`,
`downloadmanager/utils.ts:393`, both already ask `has`).

**Sideload sibling.** Observed in code, not live: sideload launches pass only `trackKey`, sideload gets no app name in Rust
(`call_runner.rs:204`), and its wine runs are `wine-<serial>`, so Stop on a sideload game wrote the same false ERROR. The
`kill`-site option covers it with no sideload-specific code.

**Owed.** The live check on the operator's Mac has not been run: Stop on Avernum 6 (206060), then confirm `gamelib.log` has
the INFO line and no ERROR. The unit regression drives the same `kill` over a real registry with Rust answering `false`.

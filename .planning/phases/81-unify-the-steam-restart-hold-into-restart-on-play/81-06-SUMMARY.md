---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 06
subsystem: steam-adoption
status: complete
tags: [typescript, steam, adoption, restart-on-play, windows, linux, macos]
requires: [81-03]
provides:
  - playAdoption.ts (gatePlayOnAdoption, PlayGateResult, hostPlatform)
  - macSteamAdoption.ts (PlayAdoptionDecision with 'open-steam', decidePlayAdoption({record, platform, reading, currentPid, currentAcf}), restartSteamForAdoption, RestartDeps.relaunch, per-OS createRestartDeps, probeSteamPid)
  - gameUninstall.ts uninstallUnadoptedNativeDirectly (all OSes)
affects: [81-07, 81-10, 81-14, 81-18]
tech-stack:
  added: []
  patterns: [reading-first decision with today's pid/ACF rules as the D-10 fallback, one gate module outside gameLaunch.ts, spies instead of jest.mock in new tests (DI ceiling)]
key-files:
  created:
    - src/backend/storeManagers/steam/playAdoption.ts
    - src/backend/storeManagers/steam/__tests__/playAdoption.test.ts
  modified:
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameInstallDepot.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/launchDispatch.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/launchDispatch.test.ts
    - meta/knip-baseline.txt
decisions:
  - "probeMacSteamPid is no longer exported: probeSteamPid is the one entry point (darwin keeps the fake-HOME pgrep), so the old export would only be test-used dead code"
  - "playAdoption.ts owns hostPlatform() (not backend/constants/environment): games.test.ts replaces that module with a factory, and a new export there would be missing from the mock"
  - "The gate sends the 'done' status itself for 'opened-steam' instead of importing sendLaunchDone from gameLaunch.ts, which would be an import cycle"
  - "A Rust reading with steamRunning null is read as 'restart', exactly as the plan's behavior list says; the TS pid is not consulted once a reading exists"
metrics:
  tasks: 2
  files: 13
  completed: 2026-11-18
commits: 2
plan_head_before: 7b8aa4769321b9cfd5cbbebc222ec7d7a6d5fb8f
plan_head_after: 34e39cf99cb17ca7ac035fc5d003e49769e57fcc
actuals:
  tokens: 20000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 06: restart-on-Play on every OS Summary

Play on a GameLib install the running Steam has not adopted now restarts Steam once (graceful `steam://exit`, 30 s bound, relaunch through `steam://rungameid/<id>`) on macOS, Windows and Linux, opens Steam instead when it is signed out, and every GameLib depot install on the native root writes, watches and later directly uninstalls the pending-adoption record on every OS.

## Commits

- ef01d4016: feat(81-06) the Play adoption gate runs on every OS and reads the Rust evidence first (tracer)
- 34e39cf99: feat(81-06) record writer, unadopted uninstall and delete route on every OS; pin the D-06 short-circuit

## What was built

- **Task 1 (tracer).** `playAdoption.ts` holds `gatePlayOnAdoption`: no record returns 'proceed' with no probe and no Rust call; otherwise it probes the Steam pid, reads `steampoll_adoption_read`, reads the ACF only when that read failed, and acts on `decidePlayAdoption`. 'clear-and-launch' clears and unwatches; 'unknown' keeps the record and proceeds (WR-01 warning moved verbatim); 'open-steam' calls `openExternal('steam://open/main')` with no `activate:false`, sends done, keeps the record; 'restart' runs `restartSteamForAdoption`, then clears, unwatches and watches the launch ('launched'), or refuses with the three existing `gamelib:steam.adoptRestart.*` strings and keeps the record ('refused'). `gameLaunch.ts` lost its macOS-only block (965 -> 889 lines) and calls the gate. `macSteamAdoption.ts`: `decidePlayAdoption` takes the platform and the Rust reading (reading first; reading null = today's rules with the steam_osx pid rule limited to darwin), `restartMacSteamForAdoption` is `restartSteamForAdoption` with `relaunch`, `createRestartDeps` builds per-OS deps (macOS keeps the Mac Steam instance and the owed-wrap file; Windows/Linux use `listSteamClientPids` with unknown counted as running, `openExternal` for `steam://exit`, and no wrap owed), and `probeSteamPid` wraps the fake-HOME pgrep on darwin and `listSteamClientPids` elsewhere.
- **Task 2.** `runNativeDepotDownloadLeased` sets the deferred handoff on every OS (the Windows/Linux immediate-poll branch is gone); the install end probes with `probeSteamPid(…, hostPlatform())`, keeps InstallApp macOS-only behind its experimental setting, writes and watches the record, and polls with `macNativeRoute: isMac`. `uninstallUnadoptedNativeDirectly` lost its darwin guard and removes directly on 'restart' or 'open-steam' (operator-confirmed 2026-11-17); the expectedManifest guard is verbatim. `getSteamDeleteRoute` drops `isMac &&`. `launchDispatch.ts` carries the D-06 comment; its existing launchWithoutSteam tests were retitled to name D-06 (they already assert `launch` is never called when the setting is on).

## Tests

- `macSteamAdoption.test.ts`: decide tests rewritten per bullet (reading and D-10 groups, per platform where the rule differs), renamed restart tests (every refusal/timeout assertion kept), `probeSteamPid` on darwin/linux/win32, per-OS `createRestartDeps`.
- `playAdoption.test.ts` (new, 12 tests): one per gate bullet, a scripted runner and a fake `requestRustInvoke`; no `jest.mock` (spies only, so the DI ceiling is not raised).
- `games.test.ts`: mock factory renamed, win32 and linux launch tests (gate runs, relaunch through the restart, refusal keeps the record), win32 and linux install-end tests (record written and watched, no InstallApp), win32 and linux uninstall tests (direct removal, signed-out direct removal, reading adopted or not running delegates, pid change is not evidence off macOS).

## Verification

- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__`: 9603 passed, 2 failed (see Deferred Issues; neither caused by this plan). Task verify sets: 966 and 992 passed.
- `pnpm codecheck` clean; eslint 0 errors on touched files; prettier `--check` clean on every touched path (none ignored).
- `pnpm backend-di-ceilings`: only the three logged pre-existing reds. `pnpm find-deadcode`: only the logged `NativePortDataStyle`/`NativePortMac`.
- Acceptance greps: `if (isMac) {` in gameLaunch.ts 0; `gatePlayOnAdoption` 2; `restartMacSteamForAdoption` 0 everywhere; `'open-steam'` 3 in macSteamAdoption.ts; one `buildSteamProtocolUrl('rungameid'` site in playAdoption.ts (inside the restart branch); `} else if (isMac) {` in gameInstallDepot.ts 0; `if (!isMac) return null` in gameUninstall.ts 0; `uninstallUnadoptedMacNativeDirectly` 0; `D-06` in launchDispatch.ts 1; no `isMac` in getSteamDeleteRoute.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 touched the Task 2 files for the renames**
- **Found during:** Task 1
- **Issue:** `gameInstallDepot.ts` and `gameUninstall.ts` called `probeMacSteamPid` and the old `decidePlayAdoption` signature, so `tsc` and `games.test.ts` broke until they followed the rename.
- **Fix:** Task 1's commit updates those call sites only (no behavior change; the darwin guard and the Mac-only handoff stayed). The all-OS behavior change is Task 2.
- **Files modified:** gameInstallDepot.ts, gameUninstall.ts
- **Commit:** ef01d4016

**2. [Rule 1 - Bug] Tests assumed a non-Mac install starts polling at once**
- **Found during:** Task 2
- **Issue:** with the handoff on every OS, 17 pre-existing non-Mac install tests reached the probe (an unprimed mock returns `undefined`, and `.catch` threw) and three asserted polling options without `macNativeRoute`; one test asserted a non-Mac uninstall never reads the record.
- **Fix:** a file-level `beforeEach` primes `probeSteamPid` to null (Steam not running); the three option assertions now expect `macNativeRoute: false`; the non-Mac uninstall test now asserts delegation without a record; the l9w uninstall describe spies `readSteamAdoption` to null so its arms keep their D-10 meaning.
- **Files modified:** games.test.ts
- **Commit:** 34e39cf99

**3. [Rule 3 - Blocking] knip baseline carried the renamed export**
- **Found during:** Task 2
- **Issue:** `pnpm find-deadcode` failed on the renamed `uninstallUnadoptedNativeDirectly` and on the stale baseline line.
- **Fix:** renamed the line in `meta/knip-baseline.txt`.
- **Commit:** 34e39cf99

**4. [Rule 1 - Bug] New test file raised the DI ceiling**
- **Found during:** Task 1
- **Issue:** `playAdoption.test.ts` first used four `jest.mock` calls, a new `backend-di-ceilings` violation.
- **Fix:** replaced with `jest.spyOn` on the notification, status sender, launch watcher and `i18next.t`.
- **Commit:** ef01d4016

## Deferred Issues

- `src/backend/__tests__/storeKinds.test.ts` fails: the scanned store table has `steam_direct_launch_verdict` (kind `cache`) that `EXPECTED_KINDS` does not list. Not in this plan's files; no store file is touched here. Logged in deferred-items.md.
- `acfUpdateReplay.test.ts` fails (`no oracle case acfUpdate/readLocalConfigBetaKey/playtime/10`): already logged.

## Known Stubs

None.

## Threat Flags

None. The new surface (the Play gate and uninstall on Windows and Linux) is the T-81-19..22 surface the plan already registers: the game-running, wrap-owed and 30 s quit-timeout refusals are unchanged and run on every OS, Steam is never killed, the pid rule is darwin-only in the D-10 fallback, `probeMacSteamPid` keeps `createFakeHomeProfile`, and `fakeHomeIsolation.test.ts` passes.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/playAdoption.ts
- FOUND: src/backend/storeManagers/steam/__tests__/playAdoption.test.ts
- FOUND commits: ef01d4016, 34e39cf99

---
phase: quick-261105-ord
plan: 01
subsystem: steam-install
tags: [steam, macos, installapp, bridge-helper, settings]
requires: []
provides:
  - "steam-bridge-helper --steam-installapp subcommand"
  - "steamExperimentalInstallApp setting (macOS, default OFF)"
  - "InstallApp wiring on both native Steam install routes"
affects: [steam-install, settings]
key-files:
  created:
    - native/steam-bridge/helper/gamelib_installapp.h
    - src/backend/storeManagers/steam/steamInstallApp.ts
    - src/backend/storeManagers/steam/experimentalInstallAppSetting.ts
    - src/frontend/screens/Settings/components/SteamExperimentalInstallApp.tsx
    - .planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/installLocation.ts
    - src/common/types.ts
    - src/backend/config.ts
    - public/locales/en/translation.json
metrics:
  tasks: 3
  completed: 2026-11-05
---

# Phase quick-261105-ord Plan 01: Steam Experimental InstallApp Summary

Opt-in, macOS-only, default-OFF setting that asks the running Mac Steam to install or adopt an app through its internal `IClientAppManager::InstallApp`, resolved entirely at run time (fork-isolated getter scan, IPC function-ID slot decode), with today's behaviour as the automatic fallback.

## Commits

- `225e562e8` Task 1: `--steam-installapp` subcommand in the bridge helper plus real-compiled-helper test
- `17ab5af22` Task 2: setting key/default, macOS-only accessor, Settings toggle with (i) help, `requestSteamInstallApp` caller
- `10dfe024d` Task 3: wiring on both install routes, `resolveSteamLibraryRoot`, games.test.ts cases, follow-up todo

## What was built

- Helper: arm64-only body, fork-before-dlopen getter scan (candidates 43, 45, then 36..52 by distance; 3 s per child, 20 s total), RTTI re-verification in the parent, InstallApp and library-lookup methods located by function-ID high half (InstallApp additionally requires UninstallApp in the next slot). One JSON line on the original stdout; fd 1 is redirected to fd 2 while Steam code runs. Exit codes 0 / 2 / 3 / 64.
- OFF route (downloader OFF): InstallApp before `steam://install`; `ok` polls and returns done, `unavailable` falls through to the unchanged hand-off, `error` returns "Steam refused the install of N (EAppUpdateError C)".
- ON route (downloader ON): with Steam running, InstallApp after the depot download; `ok` clears the pending record (no restart-on-Play), anything else records the adoption as before.
- Setting OFF: no helper is spawned on either route; all pre-existing games.test.ts assertions pass unchanged.

## Verification results

- Both arch slices compile (arm64, x86_64, `-Werror=uninitialized`).
- `steamInstallAppHelper`, `helperIntegration`, `fakeHomeIsolation`: 3 suites, 64 tests pass.
- Task 2 suites (config default, accessor, nativeInstallSetting, steamInstallApp, toggle view, fakeHomeIsolation): 6 suites, 29 tests pass. `pnpm lint-translations:gamelib`: 0 hard failures.
- games.test.ts 693 pass (includes 10 new cases), macSteamAdoption and library suites pass.
- `pnpm codecheck` clean, eslint on touched backend files 0 errors, `pnpm planning-gates` 12/12, prettier clean on the checked paths.
- `graphify update .` run.
- `requestSteamInstallApp(` has exactly two call sites in games.ts (lines 2094 and 3375), each inside an `isSteamExperimentalInstallAppEnabled()` branch.

Optional Task 1 real-profile dry-run (Mac Steam running and signed in on this machine; it called no InstallApp, but did call the never-before-called GetNumLibraryFolders / GetLibraryFolderPath, which returned a valid directory):

```
{"result":"ok","appId":440,"folderIndex":0,"eAppUpdateError":0,"engineSlot":43,"installAppSlot":0,"dryRun":true,"libraryFolders":["/Users/graysonmitchell/Library/Application Support/Steam"]}
```

Total run time was about 0.1 s.

## Deviations from Plan

**1. [Rule 1 - Bug] Follow-up todo frontmatter values**
- The plan specified `severity: low` and `ready: yes`; neither is in the planning-gates vocabulary and `pnpm planning-gates` failed. Used `severity: minor` and `ready: code` (the gate's vocabulary was not widened).
- Commit: `10dfe024d`

**2. [Rule 3 - Blocking] Missing `logError` import in games.ts**
- Caught by the new error-code test; added `logError` to the existing `backend/logger` import. Commit: `10dfe024d`.

Otherwise the plan was executed as written. Single-device note: only one library folder (index 0) exists on this machine, so folder index > 0 is untested (live-gate item 4).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (argv validation, fork-isolated unverified calls, timeouts, registered-library-only targets all implemented).

## Follow-ups

- Task 3 follow-up todo: `.planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md`
- The parent todo `.planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md` stays in `pending/` (`ready: live-gate`).

## Live gate (operator)

Prep: run `pnpm build-steam-bridge`, then restart `pnpm tauri:dev` (dev does not rebuild the sidecar or helper), with Mac Steam running and signed in. Turn on Settings > General > Steam Experimental InstallApp Feature.

### 1. Fresh install, setting ON + downloader OFF
expected: No Steam window or dialog appears; the game downloads in Steam; GameLib's Downloads view tracks progress to Installed.
result: pending

### 2. Adoption of a GameLib-downloaded install (downloader ON)
expected: After GameLib finishes the depot download, Steam shows the game Fully Installed within seconds with no restart and no window; Play does not restart Steam.
result: pending

### 3. Multi-depot adoption (XCOM 200510)
expected: Same as item 2 for a multi-depot title; Steam's content log shows pre-existing matching files and no full re-download.
result: pending

### 4. Non-default library folder
expected: Install into a second registered Steam library lands there (folder index > 0) and Steam reports it installed in that library.
result: pending

### 5. Steam not running
expected: OFF route falls back to steam://install (Steam launches with its dialog); ON route records restart-on-Play as before; no crash, log shows reason steam-not-running.
result: pending

### 6. Steam signed out
expected: Clean fallback as in item 5, log shows reason not-signed-in.
result: pending

### 7. Unowned or bad appId
expected: Install fails with a message naming the EAppUpdateError code; nothing is swallowed.
result: pending

### 8. Setting OFF
expected: Both routes behave exactly as before this change (steam://install dialog; restart-on-Play after a GameLib download).
result: pending

## Self-Check: PASSED

Files and commits `225e562e8`, `17ab5af22`, `10dfe024d` exist.

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
result: pass — 2026-11-05, appId 112100, library folder 0. Operator saw no Steam window or dialog, only Steam's install toast. Log: `via InstallApp (library folder index 0)` at 20:37:05; install polling (`delegatedToSteamClient true`) flipped the badge to installed at 20:37:20.

### 2. Adoption of a GameLib-downloaded install (downloader ON)
expected: After GameLib finishes the depot download, Steam shows the game Fully Installed within seconds with no restart and no window; Play does not restart Steam.
result: pass after quick 261105-sqe. First run (2026-11-05, appId 112100, 1 depot) was an issue: Steam half passed: operator saw Fully Installed with no restart and no window; log `Steam adopted appId 112100 via InstallApp without a restart` at 20:39:28. GameLib half failed: install polling still entered `steam-waiting-for-restart` at 20:39:31 (`shouldHoldForSteamRestart`, library.ts), and the game page says to restart Steam to finish. The adoption branch in games.ts skips `recordPendingAdoption` but starts the poll as a plain native handoff, so the D-UAT-13 hold is not told Steam already adopted the install. Re-run after quick 261105-sqe (fc0509fa2): pass — 2026-11-05, appId 112100. Operator: GameLib shows Installed, Steam shows Fully Installed with no restart, and the game runs from Play. Log: adoption at 20:50:05, poll started with `adoptedBySteamClient true`, badge flipped to installed at 20:50:08 with no `steam-waiting-for-restart` hold; launched via steam://rungameid at 20:51:04.

### 3. Multi-depot adoption (XCOM 200510)
expected: Same as item 2 for a multi-depot title; Steam's content log shows pre-existing matching files and no full re-download.
result: pass — 2026-11-05, run on Civilization V (8930, 22 depots, native x86_64) instead of XCOM. Log: 22-depot plan at 21:35:14, adoption at 21:42:59, poll `source native ... adoptedBySteamClient true`, installed at 21:43:20 with no hold. Steam content_log: `Found N pre-existing matching files` for all 22 depots at 21:43:17, `preallocated 0 files (0 MB)`, `finished update, 22 mounted depots (BuildID 4390913)` at 21:43:19, about 3 s, nothing re-downloaded. Operator: GameLib and Steam both show installed. Amnesia 57300 was also tried and went to the bridge (32-bit Mac build). Earlier XCOM 200510 attempt on 2026-11-05 did not exercise InstallApp: the Mac build is 32-bit, so GameLib routed it to the bottle (`source bottle`, 9 depots, 75 cross-depot collisions resolved, installed at 21:18:34) and adoption correctly did not run (`adoptedBySteamClient false`; Mac Steam does not list it). Needs a native multi-depot title; candidate appId 411300 (3 depots, native route in earlier logs).

### 4. Non-default library folder
expected: Install into a second registered Steam library lands there (folder index > 0) and Steam reports it installed in that library.
result: pass — 2026-11-05, appId 112100 into a USB drive added as Steam library 1 (`/Volumes/Untitled/SteamLibrary`, HFS+). Log: depot plan targeted that steamapps at 21:53:33, adoption with `adoptedBySteamClient true` at 21:54:16, installed at 21:54:22. Steam content_log: `Found 1209 pre-existing matching files for depot 112102`, preallocated 0 MB, commit into `/Volumes/Untitled/SteamLibrary/steamapps/common/Avadon The Black Fortress`, so Steam got folder index 1 (index 0 would have gone to the Mac drive). Operator: Steam lists it on the Untitled drive. The adoption path does not log the folder index; the Steam-side commit path is the evidence.

### 5. Steam not running
expected: OFF route falls back to steam://install (Steam launches with its dialog); ON route records restart-on-Play as before; no crash, log shows reason steam-not-running.
result: pass — 2026-11-05, appId 112100. Downloader OFF: helper `unavailable: steam-not-running` then `falling back to steam://install` at 21:56:02; Steam launched with its install dialog, no crash. Downloader ON: GameLib wrote the manifest at 21:58:53, no InstallApp call and no hold (`adoptedBySteamClient false`, no Steam pid), installed at 21:58:56; Steam showed it installed once opened.

### 6. Steam signed out
expected: Clean fallback as in item 5, log shows reason not-signed-in.
result: issue — 2026-11-05, appId 112100, downloader ON, Steam open at its sign-in screen (pid 10645). Clean fallback, no crash: GameLib wrote the manifest at 22:02:00, then `unavailable: library-lookup-unverified` -> `recording restart-on-Play instead` -> steam-waiting-for-restart hold at 22:02:03. Two findings. (1) The reason is wrong: `gl_ia_attach` treats ConnectToGlobalUser <= 0 as not-signed-in, but a signed-out Steam still returned a user handle; the call only failed because signed-out Steam reports no library folders, and only routes that pass `--library` do that lookup. (2) Stale hold: after the operator signed in, the same Steam pid 10645 logged `Loaded Steam library folders configuration` and `Loaded 14 apps from install folder` at 22:04:44 and showed Avadon installed, while GameLib still said to restart Steam. Sign-in rescans manifests without a restart, but the D-UAT-13 hold only releases on Steam process exit. Downloader-OFF signed-out case (6b, 22:25:29): the helper did report `unavailable: not-signed-in` and fell back to `steam://install/112100` with an install poll (`delegatedToSteamClient true`). Signed-out Steam only raised its sign-in window and dropped the request; after the operator signed in, Steam queued nothing and GameLib stayed on Installing. So finding (1) is intermittent, not constant: not-signed-in fired at 22:25 but not at 22:02, when Steam had started only at 22:01:17. And any `steam://` delegation to a signed-out Steam is silently dropped while GameLib's poll waits up to MAX_TICKS (~6 h); that is tracked in `.planning/todos/pending/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`.

### 7. Unowned or bad appId
expected: Install fails with a message naming the EAppUpdateError code; nothing is swallowed.
result: pass — 2026-11-05 22:30, run as a direct helper call because GameLib's library lists only owned apps (operator agreed). Mac Steam signed in. `steam-bridge-helper --steam-installapp 546560` (Half-Life: Alyx, unowned) and `999999990` (nonexistent) each printed `{"result":"error",...,"eAppUpdateError":9}`, exit 0, no crash; Steam content_log `Failed installing AppID ... (Missing configuration)` for both, nothing queued. The UI half (games.ts returns `status: 'error'` naming `EAppUpdateError N`) is covered by games.test.ts, not by this live run. Note: an unowned app and a bad appId give the same code (9), so the message cannot tell the user which one it was.

### 8. Setting OFF
expected: Both routes behave exactly as before this change (steam://install dialog; restart-on-Play after a GameLib download).
result: pass — 2026-11-05, appId 112100, setting OFF. Downloader OFF: `delegating install ... via steam://install/112100` at 22:33:07, Steam showed its window and install dialog, installed at 22:33:28, no InstallApp line in the log. Downloader ON (Steam pid 35158 running): `recorded pending Steam adoption` at 22:34:50, no InstallApp call, `holding in steam-waiting-for-restart` at 22:34:53; operator saw "restart Steam to finish". Both match the pre-change behaviour.

## Self-Check: PASSED

Files and commits `225e562e8`, `17ab5af22`, `10dfe024d` exist.

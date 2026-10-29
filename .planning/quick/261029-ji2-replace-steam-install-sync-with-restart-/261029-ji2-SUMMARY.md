---
phase: quick-261029-ji2
plan: 01
subsystem: steam-mac-native-install
tags: [steam, macos, adoption, restart-on-play]
requires: [quick-261029-iwy]
provides: [restart-steam-on-play adoption for GameLib native Mac installs]
affects: [games.ts, library.ts, macSteamAdoption.ts, status 'steam-starting']
key-files:
  created: [src/backend/storeManagers/steam/macSteamAdoption.ts, src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts, src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamStarting.test.tsx]
  modified: [games.ts, library.ts, electronStores.ts, library.test.ts, games.test.ts, gamepage.json, gamelib.json, frontend status sites, spike READMEs + MANIFEST]
  removed: [runningSteamSync.ts, runningSteamSync.test.ts (git mv'd to macSteamAdoption.*)]
status: human check outstanding (Task 4)
completed: 2026-10-29
---

# Quick 261029-ji2: Restart Mac Steam on Play to adopt native installs

Replaces the `steam://install` "Syncing Steam" adoption (which only opens an install dialog needing a click) with a persisted pending-adoption record and a graceful Steam quit-and-relaunch at Play time. Tasks 1-3 are done and committed; Task 4 (live WazHack check) is outstanding and not performed.

## Commits
- `17207760f` docs: spike 047-049 READMEs and MANIFEST corrections (committed first, separately).
- `1c82d137a` rename `steam-syncing` to `steam-starting` across frontend/common/locale (hero kind removed, progress variant dropped).
- `cc1d3209d` macSteamAdoption.ts (record store, `isSteamAdoptedAcf`, `decidePlayAdoption`, `probeMacSteamPid`, `restartMacSteamForAdoption`) plus `steamPendingAdoptionStore`.
- `ef1cb3b20` wiring in games.ts and library.ts, locale keys, tests.

## What was built
- Record written at exactly one call site: games.ts native depot completion branch (non-pollerSource Mac), only when `probeMacSteamPid()` finds Steam running. Steam not running clears any stale record.
- `launch()` on Mac: no record means untouched path (no probe). With a record: `decidePlayAdoption` yields launch / clear-and-launch / restart. Restart quits via `steam://exit` once, polls `steam_osx` for up to 30 s, then dispatches rungameid. Refusals (game running, go-offline wrap owed, quit timeout) notify, return false, keep the record, never signal Steam.
- `macNativeRoute` (renamed from `steamAdopted`) suppresses the restart hint on the StateFlags 4 installed branch only. Fail-closed 1026 native handoffs keep the "Restart Steam" waiting state (scope_note, accepted).
- Record cleared on native uninstall success path.

## Deviations
- **[Rule 3]** Task 1 Part B also changed the one `'steam-syncing'` literal in runningSteamSync.ts and a comment in games.ts so the tree typechecked between commits.
- **Test dropped:** the planned "bottle route never records" games test could not be made to route to the bottle in the shared mock harness (it fell into installBridgeGame via leaked mock state). Coverage that remains: opt-in OFF steam-client route never probes or records (test), and `recordPendingAdoption(` has exactly one non-test call site (grep gate). Bridge and bottle both never reach that branch because it is the non-pollerSource `else if (isMac)` arm.
- Spike skill check: `.claude/skills/spike-findings-gamelib` has no `steam://install` text, so no change there.
- Prettier: gamepage.json, gamelib.json, MANIFEST.md and the spike READMEs are prettier-ignored (`--file-info`), so omitted from `--check`.
- Delivery detail: the status `'steam-starting'` is emitted inside `launch()`; launcher.ts emits `'done'` when it returns, so it clears automatically.

## Verification run
- `pnpm codecheck`: clean.
- `npx jest src/backend/storeManagers/steam src/backend/__tests__/fakeHomeIsolation.test.ts`: 92 suites, 3481 passed, 1 skipped (pre-existing).
- `npx jest src/frontend`: 252 suites, 4468 passed.
- eslint on changed files: 0 errors (pre-existing warnings only). prettier --check clean.
- `grep -rn 'steam-syncing|syncRunningMacSteam|steamAdopted|steamSyncing|syncingSteam' src public/locales/en`: empty.
- drmLaunchSetup.ts and stageDrmBottle.ts untouched.
- `graphify update .` run; graphify-out left unstaged.

## Task 4: operator live check (OUTSTANDING)
0. `tauri dev` does not rebuild the sidecar: quit any dev instance, run `pnpm tauri:dev`, confirm `stat -f %m build/main/sidecar.js` is newer than `git log -1 --format=%ct ef1cb3b20`.
1. Check WazHack (264160): `ls "$HOME/Library/Application Support/Steam/steamapps/appmanifest_264160.acf"`. If installed, uninstall in GameLib (or Steam) first.
2. Mac Steam running and signed in; note `pgrep -x steam_osx`. Install WazHack via GameLib native route. Expect: Installed, Play enabled, NO "Restart Steam to finish" toast, no "Syncing Steam", no install dialog; sidecar log shows "recorded pending Steam adoption ... pid <PID>".
3. Press Play. Expect: "Starting Steam" on tile and game page, Play disabled; Steam quits gracefully and relaunches; `pgrep -x steam_osx` shows a NEW PID; `logs/content_log.txt` shows 264160 Fully Installed with no dialog; WazHack launches.
4. Quit WazHack, press Play again: normal launch, same Steam PID.
5. Control: uninstall, quit Mac Steam, reinstall via GameLib (Installed, no hint, no record logged). Play: Steam just starts, adopts, launches.
6. Optional: with a record pending and another Steam game running, Play shows "Quit the game running in Steam" and Steam is not quit.
If `steam://exit` does not quit Steam (30 s quit-timeout notification), report it: fallback is osascript quit (needs Automation permission, user decision).

## Self-Check: PASSED
Created files exist (macSteamAdoption.ts, its test, MainButton.steamStarting.test.tsx); commits 1c82d137a, cc1d3209d, ef1cb3b20 present in git log.

# Quick 261029-iwy: Fire steam://install after native Mac install with Steam running

Status: Tasks 1-3 complete and committed. Task 4 (live human check) OUTSTANDING.

## What was built
- `src/backend/storeManagers/steam/runningSteamSync.ts`: pure `classifySteamSyncTick` (adopted only when ACF differs from post-write baseline AND bit 4 AND buildid not "0"; percent from BytesDownloaded/BytesToDownload; idle 120 s and hard 30 min timeouts) plus injectable `syncRunningMacSteam` driver (fires `steam://install/<appId>` once via `spawnOpenDetached`, emits `steam-syncing`, unref'd sleep, abort-aware). 18 tests.
- `games.ts` `runNativeDepotDownload`: on the native Mac route the poll start is deferred; after `lease.release()` it checks `isMacSteamRunning()` (dynamic import), runs the sync, then starts the poll with `steamAdopted: true` on adoption. Not running / skipped / timeout / abort: today's behaviour (restart hint).
- `library.ts`: `steamAdopted` on PollOptions and poll entry (create + upgrade paths); suppresses the "Restart Steam to finish installing" notify and the 1026 waiting-for-restart state. 2 new tests.
- Frontend: `'steam-syncing'` status mirrored at every `'drm-setup'` site (GameCard, game page MainButton/GameStatus, Downloads hero, console mode, status map, sleep assertion, push list); locale keys `label.steamSyncing`, `status.steamSyncing`, `status.steamSyncingProgress`. Play disabled. Tests: heroModel, MainButton.steamSyncing.

## Commits
- 9302801f4 feat: sync classifier/driver, Status member, GlobalState sleep case
- 338d962ca feat: games.ts/library.ts wiring (also carries the vdf numeric-buildid fix to runningSteamSync.ts)
- 669b2d093 feat: frontend surfaces + locale
- (a lint-fix commit attempt for buildid failed on a sed error and was superseded by 338d962ca; no extra commit)

## Verification run
- jest: runningSteamSync, library, games, fakeHomeIsolation (749 pass); full `src/frontend` (4469 pass).
- `pnpm codecheck` (tsc + meta tsc) clean; scoped prettier clean (gamepage.json is prettier-ignored); eslint 0 errors.
- No new spawn site (reuses `spawnOpenDetached`). drmLaunchSetup.ts / stageDrmBottle.ts untouched.

## Deviations
- [Rule 3] `GlobalState.tsx` sleep-kind case added in Task 1 commit (exhaustive switch broke tsc once `Status` gained the member).
- [Rule 1] `@node-steam/vdf` parses numeric strings to numbers; initial string-only buildid check rejected real buildids. Fixed to accept number or string.
- [Rule 3] Added `syncingSteam: false` to three pre-existing MainButton test fixtures (type now requires it): importDemotion, installClickRouting, steamSplitButton.

## Task 4: live check (OUTSTANDING, for the operator)
`tauri dev` does not rebuild the sidecar: quit any dev instance, run `pnpm tauri:dev`, confirm `build/main/sidecar.js` mtime is newer than commit 338d962ca.
1. Mac Steam running and signed in; WazHack (264160) uninstalled in Steam and GameLib.
2. Install WazHack via native route in GameLib; keep Downloads open.
3. Expect Downloads hero, library tile and game page to read "Syncing Steam" with Play disabled after the depot download; Steam shows only an install toast; same `steam_osx` PID before/after (`pgrep -x steam_osx`).
4. Within seconds: "Installation Finished", Play enabled, NO "Restart Steam to finish" toast; `appmanifest_264160.acf` has StateFlags 4, non-zero buildid; sidecar log shows fire + adopted lines with elapsed ms.
5. Optional repair arm: with Steam quit install, corrupt one file same-size (`dd if=/dev/urandom ... conv=notrunc`), launch Steam, trigger sync via reinstall/repair with Steam running; expect "Syncing Steam (NN%)" during StateFlags 1026, never the restart hint. Skip if no repair entry point.
6. Control: quit Mac Steam, reinstall WazHack: old behaviour (Restart Steam hint), no `open` fired in log.
Resume signal: "approved" or describe what differed.

## Self-Check: PASSED
Commits 9302801f4, 338d962ca, 669b2d093 present; runningSteamSync.ts and its test exist.

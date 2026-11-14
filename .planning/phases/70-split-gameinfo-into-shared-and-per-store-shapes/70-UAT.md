---
status: complete
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
source: [70-16-PLAN.md, 70-REVIEW-FIX.md]
started: 2026-11-14
updated: 2026-11-14
---

# Phase 70 UAT: D-16 live gate on an upgraded profile

Launch with `pnpm build:sidecar && pnpm tauri:dev` (never `tauri:dev:run`; it skips the dev-vault flag and Keychain prompts every launch). The sidecar is already rebuilt. Offline steps: network off only for the action itself (off, act, on, report). Record status words and symptoms only; no usernames, keys or tokens.

Pre-gate snapshot (before any migration code): Steam 401, GOG 10, GOG installed 3, Epic 19, Amazon 2, sideload 2, download-manager finished 17. Snapshot at `~/gamelib-phase70-pregate/`.

Downgrade note: after this gate the seven stores are at schemaVersion 2 and an older GameLib build opens them read-only with one notice per launch. Restoring the snapshot undoes that.

## Current Test

[testing complete]

## Tests

### 1. Upgraded profile first launch
expected: Library shows Steam, GOG, Epic, Amazon and sideload games with the same per-store counts as before the phase (Steam 401, GOG 10, Epic 19, Amazon 2, sideload 2).
result: pass
note: Post-gate file and log check (versions and counts only): all seven stores at schemaVersion 2; Steam 401, GOG 10, GOG installed 2 (pre-gate 3), Epic 19, Amazon 2, sideload 3 (pre-gate 2 plus the item-7 add), download-manager finished 18 (pre-gate 17) and queue 0. One pre-migration backup per store exists. The GOG installed drop is a stale entry (its install path no longer exists on disk) for the game whose install was started in item 4; not attributed to phase 70. IPC_INVALID_ARGS: 0 and no schema rejection in the surviving logs; the gate session's own sidecar log had rotated away (see Gaps).

### 2. Offline relaunch
expected: With the network turned off only for the relaunch and Library load, every store's games appear; network back on before reporting.
result: pass

### 3. Steam install starts
expected: Starting an install of a not-installed Steam game shows progress (cancel after it starts); no error toast.
result: issue — operator: "got set steam offline to continue. steam friends was logged out. that should not error. is logged out, which is fine, is the not being able to log back in that is the issue. closed steam, done." Install then proceeded after Steam was closed. Triaged out of scope for phase 70 (go-offline wrap untouched by phase 70; see Gaps); todo filed.

### 4. GOG install starts
expected: Starting an install of a not-installed GOG game shows progress (cancel after it starts); no error toast.
result: pass

### 5. Epic install starts
expected: Starting an install of a not-installed Epic game shows progress (cancel after it starts), exercising the legendary dlcList path; no error toast.
result: pass

### 6. Amazon install starts
expected: Starting an install of a not-installed Amazon game shows progress (cancel after it starts); no error toast.
result: pass

### 7. Add a sideload app
expected: Add Game with an executable creates a Library entry that persists after relaunch.
result: pass

### 8. Global setting write
expected: Changing one global setting persists after relaunch.
result: pass

### 9. Per-game setting write
expected: Changing one setting in a game's settings persists after relaunch.
result: pass

### 10. Steam game launch
expected: Launching an installed Steam game starts it (strict LaunchParams); report skipped with reason if none is installed.
result: pass

### 11. Library Metacritic sort
expected: Sorting by Metacritic orders games by score, including non-Steam games with a PCGamingWiki score.
result: pass

### 12. Game page
expected: A Steam game's page shows playtime/last played; a GOG game's page shows its install details; no blank sections.
result: pass

### 13. Delisted Steam games
expected: Delisted Steam games are visible in ConsoleMode, and the Library 'no store page' facet lists the same delisted games as before the phase.
result: pass

### 14. Windows-depot menu
expected: The Steam Windows-depot menu item appears for a game with is_windows_native true and is absent for a Mac-native Steam game.
result: pass

### 15. Cold start on the fixed build
expected: After quitting GameLib and starting it again with `pnpm tauri:dev`, the app boots to the library with no error. The rebuilt sidecar includes the review-fix commits 57fd1d3df, 170191481 and da18dac0b.
result: pass — restarted 19:47; build/main/sidecar.js rebuilt 19:47:59 and carries the WR-01/WR-02 code. Fixtures for 98800 and 2706020 were staged at v1 after the restart, before either config had been read (originals backed up in the session scratchpad).

### 16. DLC launch option survives migration (WR-01)
expected: Opening Game Settings for Dungeons of Dredmor (98800, staged at v1) migrates its config to v2. Its saved launch option keeps type dlc, dlcAppName and dlcTitle; only the stale name and parameters keys are removed.
result: pass — 98800.json rewritten at 19:53:05 to v2 with backup 98800.v1.20261114T065305681Z.bak.json; lastUsedLaunchOption is {type: dlc, dlcAppName: 98801, dlcTitle: Realm of the Diggle Gods} with name/parameters gone.

### 17. Alt-exe launch option survives migration (WR-01)
expected: Opening Game Settings for All Will Fall (2706020, staged at v1) migrates its config to v2. Its saved launch option keeps type altExe and its executable; only the stale name and parameters keys are removed.
result: pass — 2706020.json rewritten at 19:56:06 to v2 with backup 2706020.v1.20261114T065605999Z.bak.json; lastUsedLaunchOption is {type: altExe, executable: C:/Games/AllWillFall/alt.exe}. The value is staged-only and has no UI surface; the operator opened Game Settings and the file was checked.

### 18. One bad environment variable is dropped, the rest are kept (WR-02)
expected: Dungeons of Dredmor's Game Settings still shows the CX_ENV environment variable row. The staged bad entry is gone from the v2 file, and the dev terminal shows a settings-game-v1-v2 line that names enviromentOptions without printing any value.
result: pass — Advanced tab shows CX_ENV and no GAMELIB_UAT_BAD row; v2 file keeps only CX_ENV. Terminal: `settings-game-v1-v2 98800: removed [], cleaned [enviromentOptions, lastUsedLaunchOption, gamescope]` with no values printed.

### 19. Legacy gamescope settings are repaired, not dropped (WR-02)
expected: Dungeons of Dredmor's v2 config still contains gamescope, with additionalOptions set to an empty string and enableForceGrabCursor set to false. All of its other gamescope values are unchanged.
result: skipped
reason: Linux-only setting with no macOS UI; operator declined to sign off on a file-only check. File evidence recorded anyway: the v2 98800.json keeps the staged gamescope block with every value unchanged plus additionalOptions "" and enableForceGrabCursor false, matching the settingsGame/settingsFiles jest coverage.

## Summary

total: 19
passed: 17
issues: 1
pending: 0
skipped: 1

## Gaps

- Item 3 (out of scope for phase 70, not a phase-70 gap): Mac Steam Friends could not be logged back in after the go-offline wrap during a Steam install. The wrap code has no phase-70 commits; filed as `.planning/todos/pending/2026-11-14-steam-friends-cannot-log-back-in-after-go-offline-install.md`.
- Evidence limitation: the gate session's sidecar log had rotated (only the later 17:52+ launches survive), so the IPC_INVALID_ARGS grep covers those and the shell log, not the install/addNewApp actions themselves. The install, sideload add and setting writes were nonetheless observed working (items 3 to 9 pass or install proceeded).

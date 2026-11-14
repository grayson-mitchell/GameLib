---
status: complete
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
source: [70-16-PLAN.md]
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

## Summary

total: 14
passed: 13
issues: 1
pending: 0
skipped: 0

## Gaps

- Item 3 (out of scope for phase 70, not a phase-70 gap): Mac Steam Friends could not be logged back in after the go-offline wrap during a Steam install. The wrap code has no phase-70 commits; filed as `.planning/todos/pending/2026-11-14-steam-friends-cannot-log-back-in-after-go-offline-install.md`.
- Evidence limitation: the gate session's sidecar log had rotated (only the later 17:52+ launches survive), so the IPC_INVALID_ARGS grep covers those and the shell log, not the install/addNewApp actions themselves. The install, sideload add and setting writes were nonetheless observed working (items 3 to 9 pass or install proceeded).

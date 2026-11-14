---
status: testing
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

number: 1
name: Upgraded profile first launch
expected: Library shows Steam, GOG, Epic, Amazon and sideload games with the pre-gate counts.
awaiting: operator

## Tests

### 1. Upgraded profile first launch
expected: Library shows Steam, GOG, Epic, Amazon and sideload games with the same per-store counts as before the phase (Steam 401, GOG 10, Epic 19, Amazon 2, sideload 2).
result: pending

### 2. Offline relaunch
expected: With the network turned off only for the relaunch and Library load, every store's games appear; network back on before reporting.
result: pending

### 3. Steam install starts
expected: Starting an install of a not-installed Steam game shows progress (cancel after it starts); no error toast.
result: pending

### 4. GOG install starts
expected: Starting an install of a not-installed GOG game shows progress (cancel after it starts); no error toast.
result: pending

### 5. Epic install starts
expected: Starting an install of a not-installed Epic game shows progress (cancel after it starts), exercising the legendary dlcList path; no error toast.
result: pending

### 6. Amazon install starts
expected: Starting an install of a not-installed Amazon game shows progress (cancel after it starts); no error toast.
result: pending

### 7. Add a sideload app
expected: Add Game with an executable creates a Library entry that persists after relaunch.
result: pending

### 8. Global setting write
expected: Changing one global setting persists after relaunch.
result: pending

### 9. Per-game setting write
expected: Changing one setting in a game's settings persists after relaunch.
result: pending

### 10. Steam game launch
expected: Launching an installed Steam game starts it (strict LaunchParams); report skipped with reason if none is installed.
result: pending

### 11. Library Metacritic sort
expected: Sorting by Metacritic orders games by score, including non-Steam games with a PCGamingWiki score.
result: pending

### 12. Game page
expected: A Steam game's page shows playtime/last played; a GOG game's page shows its install details; no blank sections.
result: pending

### 13. Delisted Steam games
expected: Delisted Steam games are visible in ConsoleMode, and the Library 'no store page' facet lists the same delisted games as before the phase.
result: pending

### 14. Windows-depot menu
expected: The Steam Windows-depot menu item appears for a game with is_windows_native true and is absent for a Mac-native Steam game.
result: pending

## Summary

total: 14
passed: 0
issues: 0
pending: 14
skipped: 0

## Gaps

[none yet]

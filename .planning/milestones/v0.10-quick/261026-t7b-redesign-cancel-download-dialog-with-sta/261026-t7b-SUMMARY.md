---
status: complete
phase: quick-261026-t7b
plan: 01
---

# Quick 261026-t7b: Cancel download dialog redesign

Cancel-download dialog now uses verb buttons: non-Steam shows [Delete Files (danger, left)] [Keep Downloading] [Stop & Keep Files (primary)]; Steam hides Delete Files (user-confirmed) because the backend delete is a no-op for Steam.

## Commits
- 0d1bab6aa: MessageBoxModal opt-in `variant` (types, mapper, CSS, test)
- 565421d16: runner-aware `handleStopInstallation` + title at 3 call sites + en gamelib strings + test
- Task 3 commit: ConsoleMode verb labels (Stop Download / Keep Downloading) + Steam delete todo

## Deviations
- Task 2 commit was amended once (lint warnings in the new test). Not pushed.
- Steam hides Delete Files per the plan's finding and user confirmation; gap filed as `.planning/todos/pending/2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md`.

## Verification
All task verify blocks pass: jest (buttonClassName, buttonActions, handleStopInstallation, MainButton routing, gamelibCatalogParity), `pnpm codecheck`, eslint (0 errors; remaining warnings are pre-existing in DownloadManagerItem), prettier, `pnpm planning-gates` 12/12, gamelib.json parses, gamepage/translation.json untouched.

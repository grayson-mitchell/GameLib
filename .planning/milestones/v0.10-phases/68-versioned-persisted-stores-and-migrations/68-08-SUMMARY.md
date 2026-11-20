---
phase: 68-versioned-persisted-stores-and-migrations
plan: 08
subsystem: planning
tags: [inventory, persistence, todos, D-12]
requires: []
provides:
  - "68-INVENTORY.md: D-12 inventory with verdicts"
  - "three triage-complete todos for user-data files"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/68-versioned-persisted-stores-and-migrations/68-INVENTORY.md
    - .planning/todos/pending/2026-11-08-version-mac-steam-offline-owed.md
    - .planning/todos/pending/2026-11-08-version-gamelib-engine-marker.md
    - .planning/todos/pending/2026-11-08-version-shared-redists-ledger.md
  modified: []
key-decisions:
  - "gamelib-pin.json is a rebuildable install-completeness marker (sha256+version, read only by markerMatches), so no todo"
  - "No renderer localStorage key holds unrecreatable user data; zero renderer todos"
requirements-completed: [D-12]
duration: 20min
completed: 2026-11-08
---

# Phase 68 Plan 08: D-12 inventory Summary

D-12 inventory of 43 backend writer files and every renderer localStorage key, classified from writer source, with three todos for the user-data files. Nothing was migrated.

## Counts

- Backend grep `grep -rlE "writeFile(Sync)?\(|atomicWrite|renameSync\(" src/backend` (minus tests): 43 files. Accounted for as 16 in the backend table (13 table rows, some grouping files), 4 in "Excluded (D-09 in scope)", 23 in "Out of scope".
- Renderer grep `localStorage.(getItem|setItem|removeItem)(`: 18 lines, all mapped to table rows. A second grep over the `storage` alias (most files alias `window.localStorage`) found the remaining keys; the table has 20 rows.
- 33 data rows in total, each with an exact verdict phrase.

## Verdicts

- needs versioning later (3): `mac-steam-offline-owed.json`, `.gamelib-engine.json`, `gamelib-shared-redists.json`.
- Everything else: rebuildable cache or not user data.

## Todos filed

`2026-11-08-version-mac-steam-offline-owed.md`, `2026-11-08-version-gamelib-engine-marker.md`, `2026-11-08-version-shared-redists-ledger.md`. All `severity: minor`, `platform: macos`, `ready: code`. `pnpm planning-gates` passes 12/12.

## Deviations from Plan

- The research expected a fourth todo for `.gamelib-pin.json`. Source shows it holds only `{sha256, version}` of an extracted artifact, read solely by `markerMatches` to decide whether to re-download. Verdict set to rebuildable cache; no todo created (the plan permitted this).
- Research row `savedZoomBoot.ts` was dropped: zoom is stored in configStore (`GlobalState.tsx:534`), not localStorage.
- No additional user-data items were found beyond the research candidates.

## Commits

- 5fd68fac8: inventory
- ed971979f: todos

## Self-Check: PASSED

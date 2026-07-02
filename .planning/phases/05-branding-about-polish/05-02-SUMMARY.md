---
phase: 05-branding-about-polish
plan: 02
subsystem: backend-branding
tags: [branding, rebrand, string-replacement, paths, D-05, D-08, BRAND-03]
dependency_graph:
  requires: []
  provides: [GameLib-dialog-strings, GameLib-path-constants, GameLib-log-dirs, GameLib-crossover-bottle]
  affects: [src/backend/updater.ts, src/backend/launcher.ts, src/backend/storeManagers/gog/setup.ts, src/backend/storeManagers/zoom/games.ts, src/backend/constants/paths.ts, src/backend/logger/paths.ts, src/backend/config.ts]
tech_stack:
  added: []
  patterns: [string-replacement, clean-cutover]
key_files:
  created: []
  modified:
    - src/backend/updater.ts
    - src/backend/launcher.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/zoom/games.ts
    - src/backend/constants/paths.ts
    - src/backend/logger/paths.ts
    - src/backend/config.ts
decisions:
  - "D-08 clean cutover: no migration for path constants (no existing GameLib-path userbase)"
  - "legacyAppFolder = join(configFolder, 'heroic') preserved for Heroic->GameLib first-launch migration"
  - "Main app log filename changed from heroic.log to gamelib.log for D-08 completeness"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-07-02T09:11:09Z"
  tasks: 2
  files: 7
requirements: [BRAND-03]
---

# Phase 05 Plan 02: Backend String & Path Rebrand (D-05/D-08) Summary

**One-liner:** Rebranded four D-05 user-facing dialog/error strings and seven D-08 filesystem path constants across seven backend files; legacy Heroic migration path preserved; tsc clean.

## What Was Built

Completed BRAND-03 for all remaining backend surfaces outside `utils.ts`:

**Task 1 - D-05 dialog/error string rebrand (4 files):**
- `updater.ts`: restart dialog reads "Do you want to restart GameLib now?"
- `launcher.ts`: Mangohud flatpak error reads "restart GameLib"
- `gog/setup.ts`: script-interpreter error reads "restart GameLib and"
- `zoom/games.ts`: executable-not-found dialog reads "GameLib could not find the executable"

**Task 2 - D-08 filesystem path constant cutover (3 files):**
- `constants/paths.ts`: `heroicInstallPath` to `~/Games/GameLib`; `defaultWinePrefixDir` to `~/Games/GameLib/Prefixes` (both independently hardcoded per Pitfall #1)
- `logger/paths.ts`: Windows/macOS/Linux log base dirs rebranded to `GameLib`; main app log filename changed from `heroic` to `gamelib` (`gamelib.log`)
- `config.ts`: `wineCrossoverBottle` default changed from `'Heroic'` to `'GameLib'`

Legacy migration path (`legacyAppFolder = join(configFolder, 'heroic')`) in `constants/paths.ts` intentionally preserved - existing verify-branding.cjs check asserts it is UNCHANGED for first-launch Heroic to GameLib user migration.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a26e5c2d | fix(05-02): rebrand remaining D-05 user-facing backend dialog strings |
| 2 | 2f87bc2a | fix(05-02): rebrand D-08 filesystem path constants via clean cutover |

## Verification

All acceptance criteria met:
- `grep -c "'Games', 'Heroic'" src/backend/constants/paths.ts` returns 0
- `join(configFolder, 'heroic')` still present in `constants/paths.ts` (legacy migration preserved)
- `grep -c "'Heroic'" src/backend/logger/paths.ts` returns 0
- `wineCrossoverBottle: 'GameLib'` present in `config.ts`
- `pnpm codecheck` exits 0 (tsc clean)

## Deviations from Plan

None - plan executed exactly as written. All seven string replacements applied per the RESEARCH inventory, Pitfall #3 (legacyAppFolder preservation) honored, Pitfall #1 (both independent `Games/Heroic` constants changed) verified.

## Threat Surface Scan

No new trust boundaries introduced. All changes are string literal and path constant replacements in backend code. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Known Stubs

None - all changes are complete string replacements with no placeholder values.

## Self-Check: PASSED

- [x] src/backend/updater.ts modified - commit a26e5c2d confirmed
- [x] src/backend/launcher.ts modified - commit a26e5c2d confirmed
- [x] src/backend/storeManagers/gog/setup.ts modified - commit a26e5c2d confirmed
- [x] src/backend/storeManagers/zoom/games.ts modified - commit a26e5c2d confirmed
- [x] src/backend/constants/paths.ts modified - commit 2f87bc2a confirmed
- [x] src/backend/logger/paths.ts modified - commit 2f87bc2a confirmed
- [x] src/backend/config.ts modified - commit 2f87bc2a confirmed

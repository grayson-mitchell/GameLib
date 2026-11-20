---
phase: 68-versioned-persisted-stores-and-migrations
plan: 11
subsystem: storeVersioning
tags: [gap-closure, CR-01, atomic-write, D-06]
requires: []
provides:
  - atomicWritePrivate that never truncates the live file on a temp-write failure
affects: [engine runFileMigration, settingsFiles]
tech-stack:
  added: []
  patterns: [split try blocks: temp write vs rename]
key-files:
  created:
    - src/backend/storeVersioning/__tests__/atomicWriteFailure.test.ts
  modified:
    - src/backend/storeVersioning/backup.ts
key-decisions:
  - "Direct-write fallback runs only when renameSync throws; temp-write failure unlinks temp and rethrows with no log (caller owns the diagnostic)"
requirements-completed: [D-06]
duration: 10min
completed: 2026-11-09
---

# Phase 68 Plan 11: CR-01 atomicWritePrivate fix Summary

Split `atomicWritePrivate`'s single try so an ENOSPC/EDQUOT/EIO on the temp write unlinks the temp and rethrows, leaving the live store byte-identical; only a `renameSync` failure takes the direct-write fallback.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 RED: write-failure suite | 9f3822232 | "2 failed, 1 passed": A and C failed, B passed |
| 2 GREEN: split try in backup.ts | d252f83dd | 3/3 pass; storeVersioning + storeMigrations 38/38; codecheck, prettier, eslint clean |

## Verification

- Test C proves the engine-level case: ENOSPC on the migrated-file temp write leaves the file byte-identical and parseable, one backup, store `readOnly`/`failed` with `ENOSPC` in the detail, no `.tmp-` residue, and the next run migrates to v2.
- Test B (rename EPERM fallback, mode 0o600, one stderr line with basename, no content) passes before and after.

## Deviations from Plan

None to the code. One note on tooling: `npx jest --selectProjects Backend <path>` swallows the path as a project name and runs the whole Backend project (11k tests, 5 unrelated failures). I ran it as `npx jest <path> --selectProjects Backend` instead. The plan's Task 1 verify command should be written that way.

## Known Stubs

None.

## Self-Check: PASSED

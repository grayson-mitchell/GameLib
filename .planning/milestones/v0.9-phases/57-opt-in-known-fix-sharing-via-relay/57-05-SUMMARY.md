---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 05
subsystem: relay
tags: [relay, known-fixes, steam-appdetails, jest]
requires: [57-01, 57-03]
provides:
  - relay/src/fileEdit.ts (planAdd, planRemove, encode/decodeGitHubContent, serializeFixFile, fixFilePath)
  - relay/src/steamTitle.ts (lookupSteamTitle, sanitizeSteamTitle, ALLOWED_STEAM_APP_TYPES)
affects: [57-09]
tech-stack:
  added: []
  patterns: [pure never-throwing leaf modules with injected fetch]
key-files:
  created:
    - relay/src/fileEdit.ts
    - relay/src/__tests__/fileEdit.test.ts
    - relay/src/steamTitle.ts
    - relay/src/__tests__/steamTitle.test.ts
  modified: []
decisions:
  - "Only game and demo Steam app types are accepted; DLC/media are unknown-app"
  - "Existing operator files are never filtered through the tier-1 validator; unknown keys are preserved"
metrics:
  duration: ~10m
  completed: 2026-11-02
---

# Phase 57 Plan 05: Fix-file edit rules and Steam title lookup Summary

Pure relay logic: exact add/remove bytes for `steam/<appId>-steam.json` (D-05/D-07/D-08/D-11) with UTF-8-safe GitHub base64, plus a sanitised Steam canonical-title lookup classifying failures as unknown-app (422) vs unavailable (503) (D-14).

## Tasks

| Task | Commits |
| ---- | ------- |
| 1 fileEdit (TDD) | b18834ec5 (test), 1b39d95ab (feat) |
| 2 steamTitle (TDD) | 1298b58d0 (test), 26b8c4bce (feat) |

39 tests pass (23 fileEdit, 16 title); `tsc -p relay` and prettier clean.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All four files exist and all four commits are in git log.

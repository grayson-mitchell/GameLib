---
phase: 62-module-boundaries-and-decomposition
plan: 12
subsystem: verification
tags: [uat, smoke, d-17]
requires: [62-11]
provides: [62-UAT.md Smoke 1 results]
affects: [62-21]
key-files:
  created: [.planning/phases/62-module-boundaries-and-decomposition/62-UAT.md]
decisions:
  - UAT item 9 (download queue, Steam depot download) deferred to smoke #2 (62-21)
completed: 2026-11-07
---

# Phase 62 Plan 12: D-17 smoke #1 Summary

Automated battery green against the baseline, sidecar rebuilt, and the operator's live smoke after the split passed 8 of 9 items; item 9 was skipped and deferred to smoke #2 (62-21).

## Commits
- 3e135a852 docs(62-12): add Smoke 1 UAT items
- fc3f20add docs(62-12): record operator smoke #1 results

## Verification
- `pnpm test:ci`: 17851 passed, 6 failed (the known baseline set, no new failures). codecheck, lint (0 errors), boundaries (9 known), find-deadcode (44 OK), prettier, build:sidecar-sea and smoke:sidecar all exit 0.
- Sidecar: `build/main/sidecar.js` mtime 01:08:15 Nov 7, newer than 62-11 commit 4e5a42d0c (01:02:20).
- Live: items 1-4 pass (Avernum 6 bridge HELLO + SteamAPI_Init ok; Grim Dawn DRM lsteamclient trace; Balrum GOG launch), items 5-8 pass (operator), item 9 skipped.

## Deviations from Plan
None to code. The plan's single `&&` verify chain was run command by command because test:ci carries 6 baseline failures.

## Deferred
- Item 9 exercises the moved depot code (Steam depot download progress/pause/resume/cancel, error + Remove, "Managed by Steam"); run in smoke #2 (62-21).
- Out-of-scope noise seen during item 4: ExtraGameInfo errors (CodeWeavers 403, PCGamingWiki undefined read, HLTB getGogHLTBGameData), in code not touched by phase 62.

## Self-Check: PASSED

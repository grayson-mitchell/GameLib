---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 10
subsystem: steam
tags: [steam, live-gate, uat, mac]
requires: [54-03, 54-04, 54-05, 54-06, 54-07, 54-08, 54-09]
provides:
  - "54-LIVE-GATE.md: single-session dual-oracle Mac gate contract with Structural Reachability Review"
  - "54-UAT.md: nine pending items in the house shape"
affects: [54-11]
key-files:
  created:
    - .planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-LIVE-GATE.md
    - .planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-UAT.md
key-decisions:
  - "One GameLib launch covers all nine items, so nothing truncates gamelib.log or the transcript mid-run"
  - "Item 4 is blocked, not failed, when no bridge title is installed; item 8 accepts both the wrap and the dialog outcomes"
requirements-completed: [ROADMAP-SC4, ROADMAP-SC6, P54-SC5]
completed: 2026-10-27
---

# Phase 54 Plan 10: Mac live-gate contract Summary

A nine-item, single-launch Mac gate scoring gamelib.log and Mac Steam's connection_log.txt, with the operator judging Friends, plus nine pending UAT items. Authored only; plan 54-11 runs it.

## Tasks

1. `4f288698c` 54-LIVE-GATE.md: done-when, oracles, preconditions PC1-PC8, session procedure (appended `tee -a`, exact `=== GATE LAUNCH ${N} ===` delimiter, per-item byte offsets, one-instance assertion, closing inventory), items 1-9, recorded behaviour changes, and the seven-test review table.
2. `d7c5a7749` 54-UAT.md: nine `### N.` items with inline `expected:` and `result: pending`, notes and an empty Gaps section.

## Review findings

No IMPOSSIBLE verdicts (count 0). Three CONDITIONAL rows are stated with their conditions: the anonymous `launch-target` line fires only when no anonymous client is cached (so the contract waits out the 60 s anonymous idle close); item 4 needs a bridge title; item 8 depends on Mac Steam's behaviour with a game running (unmeasured in spike 046). Three test-5 interactions were flagged and fixed in the text (single launch; item 6 waits for the idle close; item 7 ends by restoring Steam online before item 8). Every scored literal was grepped in source and each emitter's route was read: `user.ts:930` (authenticated logon), `anonymousClient.ts:131`, `user.ts:620` (idle close), `user.ts:596` (skipped), `macSteamOffline.ts` wrap lines.

## Deviations from Plan

None. Verify greps: delimiter count 3, `IMPOSSIBLE |` 0, all literals found; UAT counts 9/9/9 and `expected: |` 0. Formatter check omitted because `.planning/**` is prettier-ignored.

Note for the runner: the gate's PC4 requires restarting `pnpm tauri:dev` (it rebuilds the sidecar on start). At authoring, `build/main/sidecar.js` mtime (22:44) is newer than the newest `feat(54-` commit (22:18).

## Known Stubs

None.

## Self-Check: PASSED

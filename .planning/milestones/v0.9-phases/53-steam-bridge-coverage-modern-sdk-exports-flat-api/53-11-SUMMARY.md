---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 11
subsystem: meta/bridgeCensus
tags: [census, evidence, steam-bridge, gap-closure]
requires: []
provides:
  - latest-run log selection (UE backup / Unity Player-prev excluded)
  - per-launch app-log segment evidence
  - tightened verified rule (CALL set + identity, NOVER, known-bad cap)
affects: [53-12, 53-13, 53-14, 53-15, 53-16]
tech-stack:
  added: []
  patterns: [pure exported helpers tested with tmpdir fixtures]
key-files:
  created: []
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
key-decisions:
  - "NOVER is a hard failure only for Unity rows; UE with Client API initialized 1 stays verified (non-fatal); CALL-only plus NOVER reads unverified"
  - "placeShimForGame coverage-miss lines are not a downgrade input (logged at placement, before the launch HELLO; Manor Lords and Abiotic Factor read unknown-version yet verify at runtime). ELEX is closed by the CALL-set rule and the known-bad cap"
  - "A logger-header line without a helper prefix ends continuation attribution (conservative)"
metrics:
  tasks: 2
  files: 2
  completed: 2026-10-25
---

# Phase 53 Plan 11: Honest census evidence Summary

The census Evidence column now reads only the latest run's engine log and the newest launch segment of the app log, requires 2 distinct game CALLs including an identity call, treats a Unity NOVER as init failure, and caps known-bad rows below verified.

## Commits

- d53c810fc test(53-11): failing tests for latest-run log selection and launch segments
- 467c2a30f feat(53-11): latest-run logs, per-launch app-log segment, continuation attribution
- 830ca0094 test(53-11): failing tests for the tightened verified rule
- e43f4989b feat(53-11): tightened verified rule (CALL set + identity, NOVER, known-bad cap)

## What changed

- `selectLatestUnrealLogs` (pure): drops `-backup-` logs, returns `<Project>.log` or the single newest `.log`; `findUnrealSavedLogs` lstats regular non-symlink files only. `findUnityPlayerLogs` exported and pinned to Player.log only.
- `appLogSegmentFor` (pure): newest file with a HELLO for the appid, text from the LAST HELLO onward. `collectEvidence` passes only that segment.
- `attributeHelperLines` (pure, WR-03 census side): continuation lines attributed to the nearest preceding `bridge helper [id]:` prefix.
- `findGameCalls` (distinct methods) and `findNover` replace `findGameCall`; `IDENTITY_CALL` regex; CALL path verifies iff >= 2 distinct calls with one identity.
- Known-bad cap in `withFlags`: verified becomes `unverified`, detail `known-bad: <reason>`.
- IN-02 (`resetCensusAccumulators` at the top of `runCensus`, plus `censusAccumulators` getter) and IN-04 (`*_data` needs a matching `.exe` or UnityPlayer.dll).

## Pre-existing tests updated

- `godot: HELLO then a game call is verified with the call named` and `unreal: a clean log plus a CALL verifies`: each used one CALL; now two distinct calls (GetSteamID + GetAppID), because one CALL no longer verifies.

## Census run (read-only `pnpm bridge-census`)

Majority line, verbatim: `5 of 18 Steamworks-using rows verified (majority: no)`

Summary line: `17 of 18 routed to the bridge; 5 of 18 verified running through the bridge (HELLO + clean game log; 4 init-failed, 9 unverified)`

Delta vs 53-09 (`6 of 18`, verified set 1284190, 1363080, 1603180, 230070, 411300, 648410):

| appid | Title | 53-09 | Now |
|---|---|---|---|
| 411300 | ELEX | verified | unverified (1 game call; needs 2 incl. identity) |
| 1284190 | Planet Crafter | verified | init-failed (unserved STEAMSCREENSHOTS_INTERFACE_VERSION003) |
| 427410 | Abiotic Factor | init-failed (stale backup log) | verified |
| 1691190 / 1167950 / 1782460 | Rogue Waters / Vampire's Fall / Hell Clock | init-failed (Player.log) | init-failed (unserved STEAMSCREENSHOTS_INTERFACE_VERSION003) |

Others unchanged. Verified now: 1363080, 1603180, 230070, 427410, 648410. Numbers are as measured; the rule was not tuned toward a count.

## Deviations from Plan

None - plan executed as written. (Only the discretionary placement-miss decision above, per plan.)

## Verification

- `pnpm test -- meta/__tests__/bridgeCensus.test.ts`: 94 passed
- `pnpm codecheck`: exit 0
- `npx prettier --check` on both files: clean
- Known pre-existing failures elsewhere (meta i18n tests) not touched.

## Self-Check: PASSED

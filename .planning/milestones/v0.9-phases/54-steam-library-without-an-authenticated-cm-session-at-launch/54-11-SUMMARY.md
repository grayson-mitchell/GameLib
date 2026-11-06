---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 11
subsystem: testing
tags: [live-gate, uat, mac-steam, go-offline-wrap, steam-cm]

requires:
  - phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
    provides: "54-10 gate contract; 54-12..14 owed-goonline marker, boot restore, shutdown restore"
provides:
  - "54-UAT.md scored 13/13 pass with counts and timestamps from the operator's Mac"
  - "54-LIVE-GATE.md dated run record with deviations and findings"
  - "Gap 'Mac Steam is never left offline by GameLib' resolved"
affects: [phase-54-verification]

tech-stack:
  added: []
  patterns: ["live gate scored from archived /tmp captures plus operator Friends verdicts"]

key-files:
  created: []
  modified:
    - .planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-UAT.md
    - .planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-LIVE-GATE.md

key-decisions:
  - "No todos or Gaps entries for the five observations: no item failed"

requirements-completed: [ROADMAP-SC4, ROADMAP-SC6, P54-SC5, P54-SC7]

duration: 30min
completed: 2026-10-28
---

# Phase 54 Plan 11: Mac live gate Summary

**All 13 Mac live-gate items passed: launch/browse/Play leave Friends signed in with zero authenticated logons, and the go-offline wrap is restored online on routed quit, shell kill and kill -9 (via boot restore).**

## Accomplishments

- Scored items 1-13 in 54-UAT.md with grep counts and timestamps cut from the session captures, combined with the operator's Friends verdicts.
- Resolved the UAT gap "Mac Steam is never left offline by GameLib" (items 10-13 all passed): shutdown restore at 08:51:49 and 08:55:17, boot restore 08:58:28 to 08:58:30, no restore line when the user chose offline themselves.
- Item 8 landed on outcome (b): Mac Steam ignores Go Offline with a game running, the dialog and `wrap=guided-restore` path worked.
- Appended the dated run record to 54-LIVE-GATE.md.

## Task Commits

1. Task 1 and 2 (earlier executor and operator checkpoint): see prior commits.
2. Task 3: `12802dde2` docs(54-11): score the Phase 54 Mac live gate

## Deviations from Plan

- PC1: Mac Steam was not freshly restarted before launch 1 (it had been continuously Logged On since 22:58 the prior night with no GameLib-caused events); launch-1 delimiter and item-1 offsets were written retroactively.
- Launch ordinals shifted: item 10 attempt 1 = launch 2 (VOID, the operator's Cmd+Q hit Mac Steam, which the gooffline URL had focused); attempt 2 = launch 3 (sliced by timestamp); item 11 = launch 4; item 12 = launches 5 and 6; item 13 = launches 6 and 7.
- Item 7's first attempt was VOID (Refresh pressed before Steam was offline); re-armed after a confirmed Logged Off at 08:27:38.
- Items 9 and 11: sidecar exit confirmed within 10 s, exact second not resolved.

## Findings / follow-ups (observations, not failures)

1. After a wrap, Mac Steam's UI can believe it is offline while the CM is Logged On; steamui_login logs "Ignoring success response due to current state" after every goonline.
2. Mac Steam ignores Go Offline while a game runs, so the guided dialog should tell the user to quit the game first.
3. `steam://open/gooffline` steals focus to Mac Steam (caused item 10's VOID attempt).
4. `runThenGoOnline` (macSteamOffline.ts ~line 500) clears the owed marker right after firing goonline without confirming Steam came back; not observed to fail.
5. A no-logon Refresh path (option B1) was considered and declined for now by the user.

## Issues Encountered

None beyond the deviations above.

## Self-Check: PASSED

Verify: 0 pending results, 13 scored results; commit 12802dde2 present. The session directory `/tmp/gamelib-gate-20261027T094938Z/` is left for the operator to delete.

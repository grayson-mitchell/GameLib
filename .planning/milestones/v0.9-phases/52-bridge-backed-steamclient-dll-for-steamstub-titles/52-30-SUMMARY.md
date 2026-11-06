---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 30
subsystem: diagnostics
tags: [steamstub, wine-relay, gap-5, discriminating-experiment]
requires: []
provides:
  - pre-registered two-arm experiment (committed before any round)
  - scratch-run.sh SCORE=1 and PID_ARM=live switches
  - arm A (no pid) relay trace and scored baseline
affects: [52-31, 52-32]
key-files:
  created:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-30-DIAGNOSIS.md
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/gate/relay-include-diag5.txt
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/gate/scratch-run.sh
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
key-decisions:
  - "Arm B anchor is notepad.exe started inside the clone wineserver"
  - "No fix chosen; O1-O4 not applied until arm B (52-31)"
requirements-completed: []
duration: 25min
completed: 2026-10-24
---

# Phase 52 Plan 30: Gap 5 discriminating trace, arm A Summary

Pre-registered the two-arm pid experiment, added SCORE/PID_ARM switches to the scratch harness, and ran arm A: the stub reads `ActiveProcess\pid` twice (both absent), then shows the same "Application load error 3:0000065432" dialog as 52-25 R1.

- Session dir: `/tmp/gamelib-gate-52u-20261024T080006Z`
- PREREG hash: `08064e3f1` (logged as `PREREG 08064e3f1` in terminal.log)
- T1 result: same as 52-25 R1 (text, caption, flags identical; cxlog:7235)
- Arm A score line: W 1, M 1, D "Application load error 3:0000065432"/"Steam Error", L alive 91s, S 0, H 1, R 2, P 2, K 0

## Commits

- 08064e3f1: pre-registration, relay list, harness switches (Task 1)
- 586bd7a96: arm A trace, answers T1-T8, UAT item 27 (Task 2)

## Findings worth carrying to 52-31

- Both pid reads return ERROR_FILE_NOT_FOUND; nothing between or after them acts on a pid.
- The stub resolves OpenProcess/GetExitCodeProcess via GetProcAddress (cxlog:6692/6694) but never calls them with no pid present. Arm B will show whether they run once a pid exists.
- No image-name query, enumeration or Steam IPC object open was observed in arm A.

## Deviations from Plan

None. Arm A was runnable in this environment (CrossOver bottle, helper snapshot), so no checkpoint was needed. RelayInclude does not report unknown names, so the plan's "drop a name if Wine reports it unknown" could not be checked; no name was dropped and this limit is recorded in the diagnosis.

## Verification

V1/V2/V3 hold; the product bottle P1-P6 are equal before and after; `git diff` over native/src/meta/public is clean; `pnpm planning-gates` 12/12; no gamelib-shell or 219990 helper running; no SteamID64 in repo files.

## Self-Check: PASSED

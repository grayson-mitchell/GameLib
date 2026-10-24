---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 31
subsystem: diagnosis
tags: [steamstub, grim-dawn, discriminating-experiment, pre-registration]
requires: [52-30]
provides:
  - "arm B (live clone-only pid) trace and two-arm score, classified O1"
affects: [52-32]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-30-DIAGNOSIS.md
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
decisions:
  - "Pre-registered rule applied unchanged: O1 (W gone, Load Error 3 persists) -> file/forwarder check is the blocker; recommend close-out"
metrics:
  completed: 2026-10-24
requirements-completed: []
---

# Phase 52 Plan 31: Arm B discriminating experiment Summary

A live clone-only pid removes the IsSteamRunning warning but not Grim Dawn's Application Load Error 3, so the experiment classifies as pre-registered O1.

## Result

- Session: `/tmp/gamelib-gate-52v-20261024T080546Z` (arm A: `/tmp/gamelib-gate-52u-20261024T080006Z`).
- Rule integrity: `## Pre-registration` byte-equal to PREREG `08064e3f1` (empty diff) before the run.
- Arm B: anchor notepad.exe, Windows PID 248, clone-only `pid=0xf8`. The stub read the pid, called OpenProcess(0x400, 0xf8) and GetExitCodeProcess (cxlog:6875-6880, 6900-6905), then loaded steamclient64.dll without the warning.
- Score, arm A to arm B: W 1 to 0; M 1/1; D identical (`Application load error 3:0000065432`); L alive/alive; S 0/0; H 1/1; R 2/2; P 2/2; K 0/0.
- Class **O1**. Recommendation: close-out. The 52-32 options are an honest SteamStub notice plus a ROADMAP done-when amendment draft, or static RE as a separate operator choice. A product pid writer is not indicated (it removes only the warning).
- Validity: V1, V2, V3 and V4b all held. The product bottle P1-P6 were equal before and after and it holds no pid. `git diff` over native/src/meta/public is clean. No fix was implemented.
- Limitation, unchanged by the class: the anchor is a non-Steam image, and no image-name query was observed in either arm.

## Commits

- 2042c5f1f: arm B trace, answers, score table, classification (52-30-DIAGNOSIS.md)
- 6817bd23c: UAT item 28, Gaps entry, summary counts (total 28, passed 13)

## Deviations from Plan

The two tasks edit the same diagnosis file, so Tasks 1 and 2 share the diagnosis commit and the UAT edit is its own commit. Otherwise none. Planning gates pass 12/12.

## Self-Check: PASSED

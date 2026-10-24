---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 18
subsystem: steam-bridge
tags: [live-gate, uat, steamstub, elex, regate]
requires: [52-17]
provides:
  - "52-UAT items 12-13 scored; status diagnosed with Gaps 5-6"
affects: [52-UAT.md, forwarding todo, UE5 interface-versions todo]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
    - .planning/todos/pending/2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md
    - .planning/todos/pending/2026-10-24-x64-shim-lacks-interface-versions-ue5-titles-request.md
key-decisions:
  - "Item 13: operator chose option-c (investigate first, no pid writer)"
requirements-completed: [P52-SCOPE-1]
duration: n/a (operator-paced)
completed: 2026-10-24
---

# Phase 52 Plan 18: ELEX no-regression and re-gate closure Summary

Re-gate finished with issues: ELEX holds its loading-screen baseline under CR-01 but the operator's Mac Steam Friends was signed out by the run (cause unknown), and the pid question goes to investigation (option-c), not a writer.

## Results
- Item 12 (issue): HELLO appid=411300, no `[bridge-steamstub]` line, no FWD lines, no error dialog, loading-screen hang (baseline), 155 s of play. Friends signed in before, signed out after (operator verbatim in UAT). No game log exists; bridge-verified: no.
- Friends sign-out: no log line names Friends/persona/logoff. Present in the run: GameLib's steam-user logon on Play (17:33:59) and the helper's SteamAPI_Init (17:34:00). Same steam-user logon preceded the Grim Dawn launches, but Friends was not checked then. Cause unknown; not shown to involve CR-01.
- Item 13 (pass, decision recorded): option-c. Gaps 5 (SteamStub/pid) and 6 (Friends sign-out) carry `run /gsd-plan-phase 52 --gaps`.
- UAT: status diagnosed, totals 13 (4 pass, 6 issue, 1 pending [item 2, pre-existing], 2 skipped). Forwarding todo stays in pending/ with re-gate evidence; UE5 todo annotated. `pnpm planning-gates` 12/12.

## Deviations
None to code. The R2 log was archived at /tmp/gamelib-gate-52r-20261024T033525Z/gamelib-relaunch-2.log (not in repo; contains a SteamID64 in helper lines). STATE.md edited by hand (state.* banned for this file).

## Self-Check: PASSED

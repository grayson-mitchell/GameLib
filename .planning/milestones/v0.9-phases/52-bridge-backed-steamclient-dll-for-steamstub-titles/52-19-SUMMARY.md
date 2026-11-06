---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 19
subsystem: steam-bridge
tags: [diagnosis, steamstub, relay-trace, friends, attribution]
requires: [52-17, 52-18, 52-20, 52-21]
provides:
  - "52-19-DIAGNOSIS.md: Gap 5 trace window, Q1-Q6, export tables, candidate inputs; Gap 6 arm table and attribution"
  - "52-UAT items 14-15 scored (total 15)"
affects: [52-22 decision checkpoint, 52-24 item 20]
key-files:
  created:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-19-DIAGNOSIS.md
    - .planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/gate/scratch-run.sh
key-decisions:
  - "Gap 6 classified outside-phase-52: the sign-out follows GameLib's steam-user logon, not the helper, shim or bridge Play"
requirements-completed: [P52-DONE, P52-SCOPE-2, P52-SCOPE-3]
duration: operator-paced
completed: 2026-10-24
---

# Phase 52 Plan 19: Gap 5 relay trace and Gap 6 Friends attribution Summary

The SteamStub check window was traced (it reads the forwarder file whole and fails without opening a process or reading a registry value), and the Mac Steam Friends sign-out was attributed to GameLib's steam-user logon, reproduced three times, with the helper and bridge Play ruled out.

## Results
- Gap 5 (item 14, pass): in the window from SteamClient014 to the MessageBox the stub resolves CreateInterface on the forwarder, looks up `Steam_ReleaseThreadLocalMemory` with a 0 module handle, reads all 186368 bytes of the forwarder, then resolves MessageBoxA. No OpenProcess, no image-name query, no registry read. Export tables (genuine 41, forwarder 1, native Mac 33) and candidate inputs are in the diagnosis. No fix recommended (Task 1, `363373d31`).
- Gap 6 (item 15, pass): arm 0b idle and arm c (helper alone) held signed in; arm b (steam-user logon alone, no Play) flipped to signed out in F1 and again in the F2 repeat, and was offline after the F3 logon; arm d (bridge Play, helper and shim hashes equal the snapshots) held ONLINE once Friends was restored by a Mac Steam restart. Arm a was not runnable. Mac Steam logs show no displacement or remote logoff, only the two operator restarts.
- Verbatim classification line: `classification: outside-phase-52`
- Pending todo: `2026-10-24-friends-sign-out-steam-user-logon.md` (severity medium, platform macos, ready code).
- `pnpm planning-gates`: 12/12 passed.

## Task Commits
1. Task 1: `363373d31` relay trace, export tables, Gap 5 diagnosis
2. Task 2: operator session (checkpoint, no commit)
3. Task 3: `6e739c337` Gap 6 arms and attribution, UAT item 15, todo

## Deviations from Plan
- F2 became the arm (b) repeat instead of arm (d); arm (d) ran in F3, and F3's log serves where the plan says gamelib-f2.log.
- Arm (a) not exercised: no bridge toggle and no non-bridge title installed.
- The debug gamelib-shell binary dates from 16:37 Oct 24 and may predate 52-20/52-21; helper and shim hashes matched the snapshots, so the arm results hold for those bytes.
- `.planning/REQUIREMENTS.md` does not exist; `requirements mark-complete` is a no-op.
- No product code changed. No SteamID64 written to any repo file (grep over the diagnosis, UAT and todo is empty).

## Known Stubs
None.

## Self-Check: PASSED

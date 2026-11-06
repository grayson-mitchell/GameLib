---
phase: 58-steam-bridge-multiplayer
plan: 25
subsystem: steam-bridge
tags: [diagnosis, direction-a, gap-closure, live-session]
requires: []
provides:
  - "Direction A host-path measurements and the proceed decision"
affects: [58-29, 58-31, 58-32, 58-33, 58-34]
key-files:
  created:
    - .planning/phases/58-steam-bridge-multiplayer/58-25-DIAGNOSIS.md
key-decisions:
  - "Decision: proceed with the InviteUserToLobby friend-picker path (58-29, 58-31, 58-32)"
requirements-completed: [M-01, M-04]
duration: operator session
completed: 2026-11-01
---

# Phase 58 Plan 25: Direction A host-path diagnosis Summary

One live Mac-hosted Schedule I session showed the host is serving (`CreateListenSocketP2P` CALL 1, Player.log `Starting` then `Started`), so the friend-picker invite path proceeds.

## Outcome

- Preflight PC1, PC2, PC3, PC7, PC10 all held.
- Host bring-up: CreateLobby 1, SetLobbyData 1, CreateListenSocketP2P 1, AcceptConnection 1; callbacks 513 x2 and 504 x1 delivered.
- The game's '+' reached `ActivateGameOverlayInviteDialog` (CALL 1) but showed nothing on the Mac. This is the gap the picker closes.
- Unscored observation (not a gate result; strict-verified rule unchanged): Mac Steam friends-list "invite to game" already produced a working Direction A join on this build, and both players could interact. The 58-34 re-gate can score both gestures.
- Menu entries on Mac and PC were not captured verbatim, so 58-33 has nothing to cite from them.

## Carry-forward for 58-33 (re-gate contract)

The helper pads log lines with multiple spaces (`CALL   X`, `NET    role=...`). The single-space literals in the plan's Measurements list return 0. Use whitespace-tolerant patterns such as `grep -cE 'CALL +X\b'`.

Also seen: "NET cap of 32 reached" about 3 s into the session (WR-06), fixed by 58-28.

## Deviations from Plan

None in code (the plan launches none). The procedure defect above is recorded in 58-25-DIAGNOSIS.md.

## Self-Check: PASSED

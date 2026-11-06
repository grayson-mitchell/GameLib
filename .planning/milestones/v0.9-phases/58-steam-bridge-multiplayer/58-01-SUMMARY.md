---
phase: 58-steam-bridge-multiplayer
plan: 01
subsystem: steam-bridge
tags: [measurement, schedule-i, fishnet, steamworks-net, d-14]
requires: []
provides:
  - "58-01-TITLES.md: measured facts for the TCP-mode test title, Verdict PROCEED"
affects: [58-17, 58-18, 58-19, 58-21]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/58-steam-bridge-multiplayer/58-01-TITLES.md
  modified: []
key-decisions:
  - "D-14 confirmed by operator: Schedule I: Free Sample (3205720) is the TCP-mode test title"
requirements-completed: [M-01, M-02]
duration: operator-driven
completed: 2026-10-31
---

# Phase 58 Plan 01: Schedule I title measurement Summary

Schedule I: Free Sample (3205720) measured as a valid TCP-mode test title (Unity/Mono, Steamworks.NET 2024.8.0, FishNet with FishySteamworks, no `.bind`, x86-64, no anti-cheat); operator approved, Verdict PROCEED.

## Operator decision (Task 3)

Operator reply: **"approved"**. PROCEED confirmed. No re-pick.

## Tasks

| Task | Name | Commit |
| --- | --- | --- |
| 1 | Operator prepares peer PC, both accounts, one measured bridge launch | none (operator-only) |
| 2 | Measure Schedule I and write 58-01-TITLES.md | 2302cfa5f |
| 3 | Operator confirms measurement (D-14) | approval recorded here and in TITLES.md |

## Key measured results

- Not SteamStub-wrapped (A5 confirmed), PE32+ x86-64, no anti-cheat.
- Older imported versions: SteamMatchMakingServers002, SteamNetworkingSockets012 (input for 58-18).
- Stubbed calls hit at runtime: ActivateGameOverlayInviteDialog, GetMediumFriendAvatar, GetImageSize, SetWarningMessageHook.
- Host works; lobby create works after the LobbyCreated_t 513 relay fix.

## Open items and outstanding preconditions

- A1 (game data rides Steam networking) and A4 (limited account can join) stay OPEN until 58-17/58-18 wire the invite family (ActivateGameOverlayInviteDialog etc.) and a join is exercised.
- Outstanding precondition for 58-17: the operator did NOT explicitly confirm the second account launched Schedule I to its main menu on the peer PC. Not recorded as confirmed.
- Ordering caveat: plans 58-02..58-16 ran before this capture, so "pre-wiring" rows reflect the wired bridge; 58-17 regenerates the list.
- The capture directory `/tmp/gamelib-58-01-20261031T001305Z/` stays outside the repo.

## Related work (quick tasks during this plan)

- 261031-i0q: licensed demos in Refresh (needed to install the demo).
- 261031-ihs: bridge "Finishing install..." status race.
- 261031-ixa: relay LobbyCreated 513 broadcast, live verified.

## Deviations from Plan

None to the plan's tasks; the three quick tasks above were separate fixes made during live measurement.

## Known Stubs

None in files written by this plan (documentation only).

## Self-Check: PASSED

58-01-TITLES.md exists; commit 2302cfa5f exists.

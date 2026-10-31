---
phase: 58-steam-bridge-multiplayer
plan: 23
subsystem: steam-bridge-tcp-live-gate
tags: [live-gate, schedule-i, tcp-mode, fishy-steamworks, 333-relay]
requires: [58-22]
provides:
  - "58-22-LIVE-GATE.md scored: Verdict: FAIL (Direction A unreachable)"
  - "333 GameLobbyJoinRequested_t relay proven live (Direction B)"
affects: [58-24]
key-files:
  modified:
    - .planning/phases/58-steam-bridge-multiplayer/58-22-LIVE-GATE.md
    - .planning/ROADMAP.md
decisions:
  - "Verdict FAIL: item 2 (Direction A) is issue; item 3 (Direction B) passes but ran inside launch 1 (flagged)"
requirements-completed: []
metrics:
  tasks: 3
  completed: 2026-11-01
---

# Phase 58 Plan 23: Schedule I TCP live gate run Summary

Verdict: FAIL. Route to gap-closure planning with `/gsd-plan-phase 58 --gaps`; the phase is not marked done. Direction B (PC hosts, Mac accepts the invite) passed on role=game evidence and proved the 333 relay live; Direction A (Mac hosts) never got a peer in, because every invite gesture (A1, A2, A3) failed.

## Results

| Item | Result | Evidence |
| ---- | ------ | -------- |
| 1 Build freshness and shim routing | pass | mtimes newer than 58-21; shim hashes equal; one app pid 53331 under tee |
| 2 Direction A (Mac hosts) | issue | A1 "+" box did nothing; A2 "Invite to Game" and A3 "Join Game" missing; only a host self-join 504 exists |
| 3 Direction B (PC hosts) | pass (flagged) | CBDISP 333 targets=1 held=0, then 504, Sockets 1221, ConnectP2P; send x12, recv x17 role=game; operator "both saw each other move" |
| 4 Relay observations | pass (record-only) | InitRelay 0, CheckPing 1, 1281 x4, 1202 0, AcceptConnection 0, ConnectP2P 1 |
| 5 Oversize and cap | pass (record-only) | oversize 0; NET cap of 32 reached at 19:09:22Z |
| 6 D-13 notice | pass (record-only) | backend bridge-notice fired (stubbed list); UI observation not reported |
| 7 Unlisted ids | pass (record-only) | 304, 336, 348, 1040011, 1040015, 1298 (new), 1270003; no 333 |
| 8 Responsiveness | pass (record-only) | very long initial load, about 81 s Play to game process |

Census verdict, verbatim: `multiplayer 3205720 tcp: verified join=1 send=1 recv=1 path=unknown oversize=0 - game join, send and receive observed`. It is credited to Direction B only.

## Deviations from Plan

- Directions A and B ran inside one launch (delimiter at terminal.log line 101); there is no launch 2. The contract (lesson 3) says not to mix them. Item 3 is scored `pass` because it separates cleanly by timestamp and role=game attribution; flagged for operator confirmation.
- One combined `lsof-launch-1.txt` (taken with `-i`, not `-iUDP`) instead of the two per-process files; path is `unknown`.
- PC6 needed a second dev start (first app pid 45207 was not under the tee).
- PC8 was not confirmed up-front by the operator.

## Gaps

See `## 5. Gaps` in 58-22-LIVE-GATE.md: Direction A has no working invite path (blocking); mixed-launch Direction B; census cannot separate directions; NET cap hit 5 s in; new unlisted callback 1298; long initial load.

## Known Stubs

None.

## Operator follow-ups

- Confirm Direction B scoring from a mixed launch is acceptable, or run a clean separate Direction B launch.
- Delete `/tmp/gamelib-gate-20261031T073804Z` after approval (T-58-64). Captures were never committed.
- STATE.md was not edited by this executor: it carries uncommitted changes from other work (Phase 59). ROADMAP 58-23 checkbox ticked with the FAIL note.

## Self-Check: PASSED

58-22-LIVE-GATE.md has no `result: pending`, `Verdict: FAIL`, no SteamID64 or private IPv4.

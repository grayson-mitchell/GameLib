---
phase: 58-steam-bridge-multiplayer
plan: 34
subsystem: steam-bridge-live-gate
tags: [gap-closure, live-gate, runner, M-01, M-04, M-05]
requires: [58-33]
provides:
  - Scored 58-33-LIVE-GATE.md, Verdict PASS, TCP half of the phase done-when MET
affects: [phase-58-verification]
key-files:
  modified:
    - .planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md
    - .planning/ROADMAP.md
  created:
    - .planning/todos/pending/2026-11-01-callback-1298-on-bridge-join-path.md
decisions:
  - "2(e) scored pass under an operator amendment (picker may open at the menu; the send must be refused); issue under the original criterion"
  - "Direction B gesture recorded as B1 with the PC in-game '+' as the host's own invite control"
metrics:
  tasks: 3
  completed: 2026-11-01
requirements: [M-01, M-04, M-05]
---

# Phase 58 Plan 34: TCP re-gate run Summary

Verdict PASS: the 58-33 TCP re-gate passed in both directions on separate launches. Schedule I hosted on the Mac was joined by the second account (launch 1, census `verified host=1`), and Schedule I hosted on the PC was joined from GameLib (launch 2, census `verified client=1`). Both are visible as role=game evidence in each launch's own log, and the operator confirmed the same world with mutual movement both times. Item 2(e) passes only under an operator amendment; read the findings.

## Scores

| Item | Result |
| ---- | ------ |
| 1 Build freshness, shim, PC8/PC9/PC11/PC12 | pass |
| 2 Direction A (launch 1) | pass: (a) `INVITE sent` 14:22:11, `AcceptConnection` 14:22:50, game join cb=1221 14:22:51; (b) game Sockets send and recv; (c) operator yes x3; (d) `verified join=1 send=1 recv=1 path=relayed oversize=0 host=1 client=0`; (e) pass under amendment (issue under the original); (f) 3 raise / 3 `display=confirmed`, 0 unconfirmed |
| 3 Direction B (launch 2, attempt 2) | pass: 333, JoinLobby, 504, ConnectP2P, 1221, game send 9 and recv 9 on Sockets; `verified join=1 send=1 recv=1 path=unknown oversize=0 host=0 client=1`; Gap-2 re-check: recv Sockets 9, recv Messages 0 |
| 4-9 | recorded (record-only) |

The `Verdict: PASS` rule needs items 1-3 pass; they do. Mandatory conditions: D-05 separate launches, HELLO delta exactly 1 per scored launch, one app instance throughout, no `ABORT`, no oversize.

## Findings

1. **2(e) diverged from 58-37 and the operator amended the criterion.** In 58-37 the main-menu '+' was refused with no dialog. In launch 1 the menu '+' opened the GameLib picker and listed friends (`INVITE dialog`, `raise requested`, `INVITE friends n=5`, `display=confirmed`); the Invite click gave the game's "no session to invite to" and the helper logged `INVITE refused reason=no-pending`, with zero `INVITE sent`, the game responsive and Continue reaching the world. Under the literal original criterion that is `issue`. The operator replied "quit done, 2(e) as a pass, that reseult works. run launch 2". The amended criterion (picker may open at the menu; zero `INVITE sent`, send refused, game responsive, Continue works, no `ABORT`) is recorded transparently in the contract with the original text kept. Cause of the divergence unconfirmed; possibly a game lobby already existing at the main menu.
2. **Unlisted callback 1298 is on the join path in both directions** (D-09 follow-up): launch 1 between `INVITE sent` and the first game send, launch 2 between 333 and the first game send. Joins and play still passed. Todo filed: `2026-11-01-callback-1298-on-bridge-join-path.md`.
3. **Launch 2 attempt 1 was aborted as operator error and is unscored.** Mac Steam was signed out, so PC Steam offered only "Invite to Watch" and the in-game overlay invite showed nothing; no join happened. After sign-in, attempt 2 was relaunched with a new delimiter and baseline and is the only scored launch 2 segment.
4. **lsof showed no remote endpoint in either launch.** Launch 1 and launch 2 captures held only local sockets, so the lsof path word is `unknown`. Launch 1's NET path field said `relayed`; launch 2's said `unknown`. Path is record-only (D-06).
5. **Contract wording defect, item 3(a):** the text lists cb=1221 before `ConnectP2P`; the log necessarily has `ConnectP2P` first. All pieces present; not scored down.
6. Operator answers were partly blanket ("all rest yes" for launch 1): Local Network prompt, window mode, resolution and D-13 for launch 1 are not independently confirmed.

## Deviations from Plan

- The dev app auto-restarted on my rebuild and was not under `tee`; the operator stopped it and restarted under `tee -a` (PC6 verified).
- The launch-1 archive was first taken while the game was still running; it was re-archived and re-scored after "quit done".
- No source files were changed.

## Known Stubs

None (planning artifacts only).

## Follow-ups

- Phase 58 verification can now check the TCP half as MET. Phase completion is left to the verify step.
- Delete the capture directory `/tmp/gamelib-gate-20261101T011235Z` (operator action; never committed).

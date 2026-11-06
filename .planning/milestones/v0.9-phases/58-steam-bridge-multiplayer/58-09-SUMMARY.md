---
phase: 58-steam-bridge-multiplayer
plan: 09
subsystem: steam-bridge-drm
tags: [live-gate, raft, d-08a, serialized005, p2p-trace]
requires: [58-08]
provides:
  - "58-08-LIVE-GATE.md scored: all six items filled, Verdict: PASS"
  - "M-06 serialized005 decision: not needed"
affects: [58-10]
key-files:
  modified:
    - .planning/phases/58-steam-bridge-multiplayer/58-08-LIVE-GATE.md
decisions:
  - "serialized005.patch is not carried: zero hits in all six captures, both directions pass"
requirements-completed: [M-02, M-06]
metrics:
  tasks: 3
  completed: 2026-10-31
---

# Phase 58 Plan 09: Raft DRM live gate run Summary

Raft's DRM-mode gate against the p58b component PASSED in both directions under D-08a (legacy P2P): launch 1 (Mac hosts) census `verified`, launch 2 (Mac joins) send and read with N > 0 on peer 1; serialized005 patch is `not needed`.

## Results

| Item | Result | Evidence |
| ---- | ------ | -------- |
| 1 Component p58b installed | pass | 6/6 COMPDIR sha256 match catalogue pins |
| 2 Direction A (Mac hosts) | pass | trace L62 `id=1202 peer=1`, L64 accept ok=1, L68 read 10, L71 send 528; census `verified join=1 send=1 recv=1` |
| 3 Direction B (Mac joins) | pass | trace L66 send peer=1 bytes=10, L68 read peer=1 bytes=524; census `unverified ... no game-originated join; D-08a: no 1202 naming a peer` (expected, recorded not scored) |
| 4 serialized005 | not needed | 0/0 hits in wine-1 (10 lines), wine-2 (10), trace-1 (76), trace-2 (74), gamelib-1 (196), gamelib-2 (291) |
| 5 Relay status | pass (record-only) | id=1281 once per launch, no InitRelayNetworkAccess call |
| 6 Join-signal consistency | pass | no 504/1221, peer=1 consistent, role=game only, no helper lines |

Verdict: PASS. Build-id fix confirmed live: `build-id ret=0`, `build-id-given ret=22312909` in both launches; the peer PC accepted the host (no version mismatch).

## Operator statements (verbatim, part (c))

- Launch 1: "in world, both saw each other move"; "this time i joined from pc rather than send an invite" (confirmed to refer to launch 1).
- Launch 2: "in world"; "joined by both methods, each worked" (invite and Join Game on the Mac); "Raft quit, both saw each other move, yes".

## Task 3 status

The operator's per-launch answers for part (c) are recorded above. A separate explicit operator "approved" of the scored record (Task 3 resume signal) has NOT been obtained by this executor; the orchestrator should present the scored items 2-4 and Verdict to the operator and apply any corrections they state.

## Deviations from Plan

- Path (D-06) is `unknown` in both launches: `lsof -iUDP` lists only locally bound sockets with no remote peer address, so direct versus relayed cannot be read. Recorded, not scored, per contract.
- `gamelib-launch-2.log` is cumulative (291 lines) because gamelib.log was not rotated between launches; it contains the launch-1 re-log. Launch-2 lines are 278/279.
- Spurious empty window between launches (no Raft through GameLib) recorded as an unscored interlude.
- The operator joined twice in launch 2 (invite then Join Game); the single archived trace holds one send/read pair, which satisfies the contract (N > 0).
- The plan's Task 1 checkpoint was executed across the earlier and continuation sessions; the stale `Plan: 2 of 24` STATE counter is addressed below.

## Known Stubs

None.

## Cleanup owed

The operator should delete `/tmp/gamelib-gate-20261031T023945Z` (T-58-28); captures were never committed.

## Self-Check: PASSED

58-08-LIVE-GATE.md has no `result: pending`, `Verdict: PASS`, and no SteamID64-shaped value.

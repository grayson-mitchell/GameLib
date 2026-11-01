---
phase: 58-steam-bridge-multiplayer
plan: 33
subsystem: steam-bridge-live-gate
tags: [gap-closure, live-gate, contract, M-01, M-04, M-05]
requires: [58-27, 58-30, 58-32, 58-37]
provides:
  - Operator-approved TCP re-gate contract for Schedule I (58-33-LIVE-GATE.md) for plan 58-34 to run
affects: [58-34]
key-files:
  created:
    - .planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md
decisions:
  - "Gate runs fullscreen 3440x1440 on the DXVK known fix (CX_GRAPHICS_BACKEND=dxvk), not windowed"
  - "Raise over the fullscreen game is scored (item 2 sub-check f), gating"
  - "Main-menu '+' refusal is a scored, gating sub-check (item 2 e)"
  - "PC-initiated main-menu invite landing in Mac Steam as 'invalid platform' is out of scope (separate todo)"
  - "Build freshness is judged against the newest bridge-touching commit at run time, not a fixed hash"
metrics:
  tasks: 2
  completed: 2026-11-01
requirements: [M-01, M-04, M-05]
---

# Phase 58 Plan 33: TCP re-gate contract Summary

The re-gate contract for Schedule I is authored, reviewed and operator-approved (`Operator approval: approveed`, 2026-11-01). It is a contract only: no game was launched and no scored result is filled. Plan 58-34 runs it. M-01, M-04 and M-05 close only when 58-34 passes it live.

## What the contract fixes

- Direction A and B run in separate launches with both games quit between them. The census runs per launch with `--log` on that launch's own archive, with an exactly-one-new-HELLO assertion.
- Direction A's host bar is game-originated `AcceptConnection` plus `kind=join iface=Sockets cb=1221` after `INVITE sent ok=1`, `host=1`, and role=game Sockets send/recv. The 504 self-join is explicitly not accepted.
- Direction B's bar is 333, `JoinLobby`, `ConnectP2P`, send/recv and `client=1`, plus the CR-01 recv `iface=Sockets` re-check.
- Item 2 also carries (e) the main-menu '+' refuses cleanly and (f) the picker raise over the fullscreen game, both gating.
- NET budgets use the 58-28 per-(kind, iface) cap notes. All greps are whitespace-tolerant (58-25 carry-forward). Callback 1298 is Utils range (1280) + 18 and has no struct name in any bundled SDK header.
- PC12 checks fullscreen 3440x1440 prefs and the DXVK known fix (`known-fix env applied: CX_GRAPHICS_BACKEND=dxvk`, zero mode-switch literals).

## Commits

- c894a7228 contract authored
- 6051ac67d menu-press and PC-initiated invite approval items
- d2e5aeb35 operator answers, item 2 (e)
- fe9ef3443 approval recorded, fullscreen on DXVK, item 2 (f), run-time freshness

## Deviations from Plan

The plan expected one authoring pass and one approval. The operator's reviews amended the contract three times (see commits above); scope grew by items 2 (e) and 2 (f) and PC12 changed from a windowed check to a fullscreen/DXVK check. No code was changed.

## Known Stubs

None.

## Self-Check: PASSED

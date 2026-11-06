---
phase: 58-steam-bridge-multiplayer
plan: 05
subsystem: steam-bridge-census
tags: [census, multiplayer, evidence, NET-grammar]
requires: [58-04]
provides:
  - "NET_LINE_RE / parseNetLine grammar (contract for 58-07 emitter)"
  - "classifyMultiplayerEvidence for TCP and DRM modes"
  - "bridge-census --multiplayer <appid> [--drm] [--json]"
affects: [58-07, 58-09, 58-23]
key-files:
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
decisions:
  - "Path is the first non-unknown path among role=game join/recv lines; mixed direct/relayed is noted in detail only, never gating (D-06)"
  - "DRM path is always unknown; the live gate corroborates with lsof"
metrics:
  tasks: 2
  completed: 2026-10-31
---

# Phase 58 Plan 05: Multiplayer evidence classifier Summary

A pure D-08 classifier verifies multiplayer only on game-originated join, send and receive evidence in both bridge modes, and the TCP `NET` line grammar is fixed for 58-07.

## Tasks

| Task | Notes |
| ---- | ----- |
| 1 parseNetLine + classifyMultiplayerEvidence | all ten behaviour cases tested |
| 2 --multiplayer CLI | parseMultiplayerArgs tested (TCP, --drm, invalid); driver untested by design |

Both tasks touch the same two files and were committed together in one commit (see below) rather than two.

Verification: bridgeCensus jest suite passes (132 tests); prettier check and `pnpm codecheck` green. `classifyBridgeEvidence` and `classifyDrmEvidence` bodies are untouched.

## Deviations from Plan

Single commit for both tasks (same files, interdependent edits). No other deviations.

## Known Stubs

None.

## Self-Check: PASSED

---
created: 2026-11-01
title: "D-09 follow-up: unlisted callback 1298 sits on the bridge join path in both directions"
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - .planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md
severity: minor
platform: macos
ready: human
---

## Trigger

58-34 (the 58-33 TCP re-gate) item 7: `CBQ unlisted iCallback=1298 action=drop` appears on the join path in both directions, in launch 1 between `INVITE sent ok=1` and the first role=game send, and in launch 2 between `CBDISP iCallback=333` and the first role=game send. Both joins and play still passed, so the drop did no visible harm. 1298 is Utils range + 18 (`k_iSteamNetworkingUtilsCallbacks` 1280 + 18) and has no struct name in any bundled SDK header.

## What to decide

Whether 1298 needs a layout and a relay row, or is safe to keep dropping. Identify the struct from the runtime (a trace of the real Steam client), do not guess a name.

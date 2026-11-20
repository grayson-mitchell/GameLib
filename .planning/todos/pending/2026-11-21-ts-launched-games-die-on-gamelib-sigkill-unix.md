---
created: 2026-11-21
title: "On macOS and Linux a SIGKILL of GameLib now kills TS-launched games (D-15 interim)"
area: process-lifetime
severity: medium
platform: any
ready: blocked
files:
  - src/backend/process/runner.ts
  - src-tauri/crates/gamelib-proc/src/spawn.rs
---

## Problem

Phase 83 plan 83-08 registers the sidecar's process group with the SIGKILL reaper (D-10, D-11). On macOS and Linux a
SIGKILL of GameLib (Force Quit, `kill -9`, a crash) now makes the reaper kill that whole group, and the group holds every
game the TS runner launched, because the TS runner spawns games as plain children of the sidecar.

Before Phase 83 those games survived a SIGKILL by accident: the sidecar was killed, its children were reparented to
init and kept running. That was the behaviour of an orphaned tree, not a designed guarantee. After this plan a player who
Force Quits GameLib mid-game loses the game process.

## What did not change

- A graceful quit and Windows already killed these games (the sidecar group SIGTERM on unix, the kill-on-close Job on
  Windows), so no platform lost a guarantee it had on purpose.
- `steam://rungameid/...` launches are Steam's processes, not the sidecar's, and survive.
- Rust-spawned `SpawnClass::Game` trees (own session via `setsid`, never registered with the reaper) survive.

## Fix

Move games out of the sidecar's group so the reaper never sees them: the TS launch path (Phase 88, the launch port) and
the bridge slices (Phases 95-97) spawn games through `gamelib_proc::spawn::spawn_game` (`SpawnClass::Game`). Until then
this is the accepted D-15 interim. Blocked on those phases; recheck when Phase 88 lands.

Recorded in `83-HUMAN-UAT.md` ("Known behaviour change (D-15)") and in the 83-08 SUMMARY.

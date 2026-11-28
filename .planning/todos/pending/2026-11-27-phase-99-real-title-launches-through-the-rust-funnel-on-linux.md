---
created: 2026-11-27T00:00:00.000Z
title: 'Phase 99: launch a real title through the Rust funnel on Linux (what CI cannot show)'
area: launch
severity: medium
platform: linux
ready: blocked
found_by: 'Phase 88.3 plan 88.3-21 (D-16): Linux is proven by three-OS CI with a stub game; real-title launches are handed to Phase 99.'
files:
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/game/readopt.rs
  - src-tauri/crates/gamelib-launch/src/builders
---

## Problem

88.3 closes Linux with CI only: the `stub_game` arms (`through_the_funnel`, `quit_kill`, `re_adopt`, `force_quit_of_a_wine_shaped_game_re_adopts_by_its_member`) and the gamelib-proc `adopted_*` orphan arms on ubuntu-latest. A stub game on a CI runner is not a title. Nothing has launched a real Linux game from the UI through the Rust funnel, and 88.3 does not claim it.

## Items for Phase 99

The list is in `## Phase 99 handoff (88.3)` of `.planning/phases/88-launch-pipeline/88-VALIDATION.md`. For Linux:

1. A real native title launched from the UI through the Rust funnel (Play, status events, quit, play time recorded, Force Quit then re-adoption on the next start).
2. A real Wine or Proton launch (prefix, runner env, the member-based re-adoption of a Wine-shaped game).
3. Real `gamescope`, `umu-run`, `mangohud` and `gamemoderun` on a machine that has them (CI has only stub scripts and injected probe results).

## Fix

Run them on a Linux machine under Phase 99 and record the result in that phase's verification. Blocked until that machine and phase are in hand.

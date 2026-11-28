---
created: 2026-11-27T00:00:00.000Z
title: 'Phase 99: launch a real title through the Rust funnel on Windows (what CI cannot show)'
area: launch
severity: medium
platform: windows
ready: blocked
found_by: 'Phase 88.3 plan 88.3-21 (D-16): Windows is proven by three-OS CI with a stub game; real-title launches are handed to Phase 99.'
files:
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/game/readopt.rs
  - src-tauri/crates/gamelib-proc/src/adopt.rs
---

## Problem

88.3 closes Windows with CI only: the `stub_game` arms (`through_the_funnel`, `quit_kill`, `re_adopt`) and the gamelib-proc `adopted_*` orphan arms on windows-latest. A stub game is not a title. Nothing has launched a real Windows game from the UI through the Rust funnel, and 88.3 does not claim it.

## Items for Phase 99

The list is in `## Phase 99 handoff (88.3)` of `.planning/phases/88-launch-pipeline/88-VALIDATION.md`. For Windows:

1. A real title launched from the UI through the Rust funnel (Play, status events, quit, play time recorded).
2. A real Windows Game Job re-adopted after a GameLib crash (Force Quit), by its member, with play time and the after-script on exit.
3. PowerShell `Start-Process -Wait` waiting for a game's descendants (assumption A7): the funnel's run ends when the whole tree has ended, with a real launcher-style game that hands off to a child.

## Fix

Run them on the operator's Windows machine under Phase 99 and record the result in that phase's verification. Blocked until that machine and phase are in hand.

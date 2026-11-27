---
created: 2026-11-28T00:00:00.000Z
title: 'A failing Wine check, or a failing persist of the bottle wine, escapes the launch with the blocker, the log and the status all left open'
area: launch
severity: medium
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: src/backend/launcher.ts runLaunchEventCallback (no golden case: the recorder's check never rejects after a scripted answer)).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

`checkWineBeforeLaunch` and `persistBottleWineVersion` are awaited with no catch, unlike the engine step (which releases the blocker, sends `done` and closes the log). A rejection leaves the display-sleep blocker held, the per-game log open and no `done` sent, and the engine selection is not released for the persist (only reachable when no engine controls the launch). The Rust funnel copies it: `Err("launch:wine-check:<word>")` and `Err("launch:persist-bottle-wine:<word>")` with nothing released. No golden case covers it.

## Fix

Wrap both in the same end the engine step's catch uses (release the blocker, send `done`, close the log).

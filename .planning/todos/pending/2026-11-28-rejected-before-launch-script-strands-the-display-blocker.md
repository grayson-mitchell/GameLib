---
created: 2026-11-28T00:00:00.000Z
title: 'A rejected before-launch script strands the display-sleep blocker and leaves the launch without a done'
area: launch
severity: medium
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: funnel--before-script-rejects-releases-engine).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

When the before script cannot be started the catch around the launch releases the engine and rethrows. The display-sleep blocker stays held (the next launch of the same launcher then skips starting its own), no `done` is sent and the per-game log is never closed. The Rust funnel keeps this: it answers `Err("launch:script:before-failed")` after releasing only the engine.

## Fix

Route the failure through the same end every other failed launch takes (release the blocker, send `done`, close the log).

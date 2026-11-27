---
created: 2026-11-28T00:00:00.000Z
title: 'A rejected GOG playtime post rejects the whole launch: no recent game, no save upload, no done'
area: launch
severity: medium
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: funnel--gog-playtime-post-rejects).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

`updateGOGPlaytime` is awaited without a catch. When it rejects, the launch rejects: the recent-game write, the save upload and the final `done` status are skipped, so the renderer never hears the launch ended. The Rust funnel keeps this: a `failed` answer of the `update_gog_playtime` hook answers `Err("launch:gog-playtime:failed")` after the same events.

## Fix

Catch the post as the recent-game write is caught, log a warning and carry on to the save upload and `done`.

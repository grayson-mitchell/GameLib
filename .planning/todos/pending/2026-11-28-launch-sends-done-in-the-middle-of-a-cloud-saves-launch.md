---
created: 2026-11-28T00:00:00.000Z
title: 'A launch with cloud saves sends done, then syncing-saves, then done again'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: funnel--saves-download-rejects-logs-and-goes-on).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

After the game ends with `autoSyncSaves` on and the network up, the funnel sends `done`, then `syncing-saves` for the upload, then `done` again. The renderer sees the game finished and then busy again. Copied as recorded (`funnel/run.rs`, the upload block).

## Fix

Send `syncing-saves` for the upload without the first `done`.

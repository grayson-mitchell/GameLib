---
created: 2026-11-28T00:00:00.000Z
title: 'A game''s played time counts from before the save download, the engine step and the before script'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: funnel--native-legendary-plain, funnel--saves-download-rejects-logs-and-goes-on).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

`startPlayingDate` is taken before the cloud-saves download, the engine step and the before script, so the session added to `totalPlayed` includes all of them, and `Math.floor` truncates 90 s to 1 min. The runs-for-me record uses a second clock (`launchedAt`, taken right at the launch hook) so its signal is the time the game ran.

Copied as recorded in `funnel/run.rs` (`start_ms`) and `funnel/playtime.rs`.

## Fix

Take the play-time start right at the launch hook, as runs-for-me does, and decide whether the stored total should round rather than floor.

---
created: 2026-11-28T00:00:00.000Z
title: 'The runs-for-me record reads its store twice per write, and a push failure after a good write is reported as a failed record'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: record-darwin-unset-at-threshold, record-darwin-push-throws-after-the-write-is-logged-and-swallowed (golden runs_for_me)).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

`recordPlaySession` reads the whole `games` map once to decide and again inside `writeAndPush`; a push to the renderer that fails after the write persisted is logged as `could not record play session`, though the record was kept. Copied as recorded in `funnel/playtime.rs` (`record_play_session_with`, `write_and_push`).

## Fix

Read once and pass the map down; log a failed push as a push failure.

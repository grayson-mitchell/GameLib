---
created: 2026-11-28T00:00:00.000Z
title: 'A rejected after-launch script skips the whole tail of the launch'
area: launch
severity: medium
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: funnel--after-script-rejects).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

The after script runs in the launch promise's `finally`; when it cannot be started the log is not closed, presence is not cleared, the blocker stays held, no play time is recorded and no `done` is sent. Only the engine is released. The Rust funnel keeps this: `Err("launch:script:after-failed")` after the engine release.

## Fix

Catch the script's failure, log it, and run the rest of the tail.

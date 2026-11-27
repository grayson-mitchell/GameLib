---
created: 2026-11-28T00:00:00.000Z
title: 'A hand-edited runs-for-me store holding an array is read by index and the indexes survive into the written record'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: map-array-keeps-valid-items-by-index, record-darwin-array-store-value-is-read-by-index (golden runs_for_me)).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

`getRunsForMeMap` uses `Object.entries`, so a `games` value of `["auto"]` becomes `{"0": "auto"}`, and the next write keeps that key. Copied as recorded in `runs_for_me_map`.

## Fix

Treat anything but a plain object as empty.

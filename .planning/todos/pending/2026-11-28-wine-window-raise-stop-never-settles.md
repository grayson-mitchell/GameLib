---
created: 2026-11-28T00:00:00.000Z
title: 'A stopped Wine window raise never settles, so a caller that awaits raise after stop() hangs'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as D-20 candidate 7 by 88.3-02, noted by plan 88.3-13; cases: wineWindowRaise--winewindowraise-stop-mid-loop-halts-further-spawns, window_raise--stop-between-the-hit-and-the-settle-re-raise, window_raise--a-raise-after-a-stop-runs-normally (golden window_raise)).'
files:
  - src/backend/utils/wineWindowRaise.ts
  - src-tauri/crates/gamelib-launch/src/raise.rs
---

## Problem

`stop()` on the TS raiser clears the pending sleep timer, so the loop's promise stays pending forever; a caller that awaits `raise` after a stop hangs. The Rust raise (`raise_wine_window`) does not copy this: its wait ends on the shutdown token and the call returns (`golden/window_raise/deltas.json`, `stop-is-the-shutdown-token`). Only the TS raiser, which 88.3-20 deletes, has the defect, and no caller awaits a raise across a stop today.

## Fix

Nothing to fix in Rust. Close this when 88.3-20 deletes `utils/wineWindowRaise.ts`.

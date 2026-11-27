---
created: 2026-11-28T00:00:00.000Z
title: 'The launch funnel read the global settings three to five times and `verboseLogs` from two stores'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as a D-20 candidate by 88.3-01 or 88.3-02, ported as recorded by plan 88.3-05; cases: funnel--native-legendary-plain (every case of golden/funnel)).'
files:
  - src/backend/launcher.ts
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/funnel/playtime.rs
---

## Problem

`config.getSettings()` was read for `minimizeOnLaunch`/`noTrayIcon`, again for `disableLogs`, again for `disablePlaytimeSync`, and a fourth time inside the Wine check. `verboseLogs` comes from two stores: the game's settings (`game.getSettings()`, which decides the two forced warnings and the scripts' verbose flag) and `gameConfigs.get(app).getSettings()` (which decides whether the per-game log is disabled).

The Rust funnel asks the managers once (`launch_facts`) and keeps both `verboseLogs` values as they were (`settings.verboseLogs` and `LaunchFacts.verbose_logs`), so a game whose two stores disagree behaves as it did.

## Fix

Read the global settings once per launch and decide which store owns `verboseLogs`. Both belong to Phase 98 (global settings) and the game config's move into Rust.

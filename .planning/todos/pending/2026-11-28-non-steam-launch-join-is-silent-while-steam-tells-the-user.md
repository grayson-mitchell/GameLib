---
created: 2026-11-28T00:00:00.000Z
title: 'A second Play of a non-Steam game joins silently, while a second Play of a Steam game shows an already-starting notice'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 plan 88.3-02 recorded it (golden single_flight, launcher_launchSingleFlight against launchDispatch); plan 88.3-04 copied the silent join into run_launch as recorded.'
files:
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src/backend/launcher.ts
  - src/backend/storeManagers/steam/launchDispatch.ts
---

## Problem

The two launch funnels answer a second Play of the same game differently. The non-Steam funnel
(`launchEventCallback` in `launcher.ts`, now `run_launch` in Rust) joins the first launch and only writes the line
`Launch of <app> (<runner>) already in progress; joining it (WR-03)` to `gamelib.log`. The Steam dispatch joins the
same way but also shows the user an "already starting" notice.

The player pressing Play twice on a non-Steam game sees nothing happen, which reads as a dead button for the whole
play session (the flight spans the game's run).

## Fix

Decide whether the non-Steam join should notify too. `LaunchFlights::enter` answers `Join` and leaves the
notification to the caller, so the Rust funnel can show the same notice at its join site.

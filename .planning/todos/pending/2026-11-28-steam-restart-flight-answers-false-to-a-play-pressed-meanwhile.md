---
created: 2026-11-28T00:00:00.000Z
title: 'A Play pressed during a Steam restart for adoption is answered false, the same answer as a launch that failed'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 plan 88.3-02 recorded it (golden single_flight, adoptionStatus--restartsteamnowforadoption); plan 88.3-04 replays it over LaunchFlights unchanged.'
files:
  - src/backend/storeManagers/steam/adoptionStatus.ts
  - src-tauri/crates/gamelib-launch/src/funnel/flights.rs
---

## Problem

`restartSteamNowForAdoption` leads a flight under the app's key and resolves `false` when it records no recent game.
A Play pressed while that restart runs joins the flight and receives the leader's value, `false`, which is also the
answer of a launch that failed. The restart and the Play are different things sharing one key.

By design (the restart has no recent game to record), but the player gets the failure answer for a Play that was
never attempted.

## Fix

Give the restart its own key (a different flight name) or let a join distinguish a restart leader from a launch
leader, so a Play during a restart is answered with its own result. `LaunchFlights::enter` is keyed by a plain runner
string, so the Steam dispatch can lead under any name.
